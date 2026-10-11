// API de KAI (todo lo que no es /api/* lo sirven los ficheros estáticos de dist/)
import { Hono } from 'hono';
import { crearAuth, esAdmin } from './auth.js';
import { mergeState } from '../src/engine/estado.js';
import { validarAsignatura, validarExamen } from './validar.js';
import { registrarApuntes } from './apuntes.js';
import { registrarPush } from './avisospush.js';

const app = new Hono();

// Better Auth: registro, inicio y cierre de sesión…
app.on(['GET', 'POST'], '/api/auth/*', c => crearAuth(c.env, c.req.raw).handler(c.req.raw));

// ¿Está vivo el servidor? (la app lo usa para detectar bloqueos de IPs; nunca se guarda en caché)
app.get('/api/ping', c => c.json({ ok: true }));

// Configuración pública (antes de entrar): la clave pública del antibots
app.get('/api/config', c => c.json({ turnstile: c.env.TURNSTILE_SECRET ? c.env.TURNSTILE_SITEKEY || null : null }));

// El resto de la API necesita sesión
app.use('/api/*', async (c, next) => {
  const auth = crearAuth(c.env, c.req.raw);
  const s = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!s) return c.json({ error: 'Necesitas iniciar sesión' }, 401);
  c.set('user', s.user);
  await next();
});
// Nada de la API se guarda en cachés intermedias: son datos privados
app.use('/api/*', async (c, next) => { await next(); c.header('Cache-Control', 'private, no-store'); });

// Preferencias de la cuenta (JSON pequeño: presentación vista, etc.)
app.get('/api/preferencias', async c => {
  const p = await c.env.DB.prepare('select datos from preferencia where user_id = ?').bind(c.get('user').id).first();
  return c.json(json(p?.datos) || {});
});
app.patch('/api/preferencias', async c => {
  const cambios = await leerJson(c);
  if (!cambios || typeof cambios !== 'object' || Array.isArray(cambios)) return c.json({ error: 'No válido' }, 400);
  const uid = c.get('user').id;
  const p = await c.env.DB.prepare('select datos from preferencia where user_id = ?').bind(uid).first();
  const datos = JSON.stringify({ ...(json(p?.datos) || {}), ...cambios });
  if (datos.length > 4000) return c.json({ error: 'Demasiado grande' }, 400);
  await c.env.DB.prepare('insert into preferencia (user_id, datos) values (?, ?) on conflict (user_id) do update set datos = excluded.datos').bind(uid, datos).run();
  return c.json(JSON.parse(datos));
});

app.get('/api/yo', c => {
  const u = c.get('user');
  return c.json({ id: u.id, nombre: u.name, email: u.email, admin: esAdmin(c.env, u) });
});

const base = c => `/api/examenes/${c.req.param('id')}`;
const json = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
const aJson = row => ({
  id: row.id, nombre: row.nombre, fecha: row.fecha, nivel: row.nivel, asignatura: row.asignatura_id,
  formato: { opciones: row.opciones, penalizacion: row.penalizacion },
  estado: row.estado, notaReal: row.nota_real, prevision: json(row.prevision), resumen: json(row.resumen),
  enviado: row.enviado ?? null, listoAviso: !!row.listo_aviso,
});
const leerJson = async c => { try { return await c.req.json(); } catch (e) { return {}; } };

// Examen del usuario (o cualquiera, si es el administrador)
async function examenDe(c) {
  const u = c.get('user');
  const row = await c.env.DB.prepare('select * from examen where id = ?').bind(c.req.param('id')).first();
  if (!row || (row.user_id !== u.id && !esAdmin(c.env, u))) return null;
  return row;
}

// ---------- Asignaturas ----------
app.get('/api/asignaturas', async c => {
  const { results } = await c.env.DB.prepare('select id, nombre, emoji, color, creado from asignatura where user_id = ? order by creado').bind(c.get('user').id).all();
  return c.json(results);
});
app.post('/api/asignaturas', async c => {
  const v = validarAsignatura(await leerJson(c));
  if (!v.ok) return c.json({ error: v.error }, 400);
  const a = { id: crypto.randomUUID(), ...v.datos, creado: Date.now() };
  await c.env.DB.prepare('insert into asignatura (id, user_id, nombre, emoji, color, creado) values (?, ?, ?, ?, ?, ?)')
    .bind(a.id, c.get('user').id, a.nombre, a.emoji, a.color, a.creado).run();
  return c.json(a, 201);
});
app.patch('/api/asignaturas/:id', async c => {
  const v = validarAsignatura(await leerJson(c), true);
  if (!v.ok) return c.json({ error: v.error }, 400);
  const campos = Object.keys(v.datos);
  if (!campos.length) return c.json({ error: 'Nada que cambiar' }, 400);
  const r = await c.env.DB.prepare(`update asignatura set ${campos.map(k => `${k} = ?`).join(', ')} where id = ? and user_id = ?`)
    .bind(...campos.map(k => v.datos[k]), c.req.param('id'), c.get('user').id).run();
  return r.meta.changes ? c.json({ ok: true }) : c.json({ error: 'No existe' }, 404);
});
app.delete('/api/asignaturas/:id', async c => {
  // Sus exámenes no se borran: se quedan sin asignatura
  const r = await c.env.DB.prepare('delete from asignatura where id = ? and user_id = ?').bind(c.req.param('id'), c.get('user').id).run();
  return r.meta.changes ? c.json({ ok: true }) : c.json({ error: 'No existe' }, 404);
});

// ---------- Exámenes ----------
const asignaturaPropia = async (c, id) => !id || !!(await c.env.DB.prepare('select 1 from asignatura where id = ? and user_id = ?').bind(id, c.get('user').id).first());

app.get('/api/examenes', async c => {
  const { results } = await c.env.DB.prepare(
    'select e.*, p.resumen from examen e left join progreso p on p.examen_id = e.id and p.user_id = e.user_id where e.user_id = ? order by e.creado'
  ).bind(c.get('user').id).all();
  return c.json(results.map(aJson));
});
app.post('/api/examenes', async c => {
  const v = validarExamen(await leerJson(c));
  if (!v.ok) return c.json({ error: v.error }, 400);
  if (!(await asignaturaPropia(c, v.datos.asignatura_id))) return c.json({ error: 'Esa asignatura no existe' }, 400);
  const e = { id: crypto.randomUUID(), ...v.datos, contenido: '', estado: 'pendiente', creado: Date.now() };
  await c.env.DB.prepare(
    'insert into examen (id, user_id, asignatura_id, nombre, fecha, opciones, penalizacion, nivel, contenido, estado, creado) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(e.id, c.get('user').id, e.asignatura_id ?? null, e.nombre, e.fecha, e.opciones, e.penalizacion, e.nivel, e.contenido, e.estado, e.creado).run();
  return c.json(aJson(e), 201);
});
app.patch('/api/examenes/:id', async c => {
  const row = await examenDe(c);
  if (!row) return c.json({ error: 'No existe' }, 404);
  const v = validarExamen(await leerJson(c), true);
  if (!v.ok) return c.json({ error: v.error }, 400);
  if ('asignatura_id' in v.datos && !(await asignaturaPropia(c, v.datos.asignatura_id))) return c.json({ error: 'Esa asignatura no existe' }, 400);
  const campos = Object.keys(v.datos);
  if (!campos.length) return c.json({ error: 'Nada que cambiar' }, 400);
  await c.env.DB.prepare(`update examen set ${campos.map(k => `${k} = ?`).join(', ')} where id = ?`)
    .bind(...campos.map(k => v.datos[k]), row.id).run();
  return c.json({ ok: true });
});
app.delete('/api/examenes/:id', async c => {
  const row = await examenDe(c);
  if (!row || row.user_id !== c.get('user').id) return c.json({ error: 'No existe' }, 404);
  // Sus apuntes también se borran de R2
  const { results: docs } = await c.env.DB.prepare('select clave from documento where examen_id = ?').bind(row.id).all();
  if (docs.length && c.env.APUNTES) await c.env.APUNTES.delete(docs.map(d => d.clave));
  await c.env.DB.batch([
    c.env.DB.prepare('delete from documento where examen_id = ?').bind(row.id),
    c.env.DB.prepare('delete from progreso where examen_id = ?').bind(row.id),
    c.env.DB.prepare('delete from examen where id = ?').bind(row.id),
  ]);
  return c.json({ ok: true });
});

app.get('/api/examenes/:id', async c => {
  const row = await examenDe(c);
  if (!row) return c.json({ error: 'No existe' }, 404);
  const b = base(c);
  return c.json({
    ...aJson(row), almacen: `kai-${c.get('user').id}-${row.id}`, contenido: row.contenido,
    preguntas: `${b}/datos/preguntas.json`, documentos: `${b}/datos/documentos.json`,
    resaltados: `${b}/datos/resaltados.json`, paginas: `${b}/paginas`,
  });
});

// Contenido privado del examen, desde KV
const DATOS = new Set(['preguntas.json', 'documentos.json', 'resaltados.json']);
app.get('/api/examenes/:id/datos/:f', async c => {
  const row = await examenDe(c);
  if (!row || !DATOS.has(c.req.param('f'))) return c.json({ error: 'No existe' }, 404);
  const body = await c.env.CONTENIDO.get(`${row.contenido}/${c.req.param('f')}`, 'stream');
  return body ? new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8' } }) : c.json({ error: 'No existe' }, 404);
});
app.get('/api/examenes/:id/paginas/*', async c => {
  const row = await examenDe(c);
  const file = c.req.path.split('/paginas/')[1] || '';
  if (!row || !/^(mini\/)?[\w-]+\.jpg$/.test(file)) return c.json({ error: 'No existe' }, 404);
  const body = await c.env.CONTENIDO.get(`${row.contenido}/paginas/${file}`, 'stream');
  return body ? new Response(body, { headers: { 'Content-Type': 'image/jpeg' } }) : c.json({ error: 'No existe' }, 404);
});

// Progreso: el móvil manda el suyo, se junta con el guardado y se devuelve el resultado
app.get('/api/progreso/:id', async c => {
  const row = await examenDe(c);
  if (!row) return c.json({ error: 'No existe' }, 404);
  const p = await c.env.DB.prepare('select estado from progreso where user_id = ? and examen_id = ?').bind(c.get('user').id, row.id).first();
  return c.json({ estado: p ? JSON.parse(p.estado) : null });
});
app.put('/api/progreso/:id', async c => {
  const row = await examenDe(c);
  if (!row) return c.json({ error: 'No existe' }, 404);
  const { estado, resumen } = await leerJson(c);
  if (!estado || typeof estado !== 'object' || estado.v !== 1) return c.json({ error: 'Progreso no válido' }, 400);
  const res = resumen && typeof resumen === 'object' ? JSON.stringify(resumen).slice(0, 4000) : null;
  const uid = c.get('user').id;
  const p = await c.env.DB.prepare('select estado from progreso where user_id = ? and examen_id = ?').bind(uid, row.id).first();
  const junto = mergeState(p ? JSON.parse(p.estado) : null, estado);
  await c.env.DB.prepare(
    'insert into progreso (user_id, examen_id, estado, actualizado, resumen) values (?, ?, ?, ?, ?) on conflict (user_id, examen_id) do update set estado = excluded.estado, actualizado = excluded.actualizado, resumen = coalesce(excluded.resumen, progreso.resumen)'
  ).bind(uid, row.id, JSON.stringify(junto), Date.now(), res).run();
  return c.json({ estado: junto });
});

registrarApuntes(app);
registrarPush(app);

app.all('/api/*', c => c.json({ error: 'No existe' }, 404));

export default app;

// API de KAI (todo lo que no es /api/* lo sirven los ficheros estáticos de dist/)
import { Hono } from 'hono';
import { crearAuth, esAdmin } from './auth.js';
import { mergeState } from '../src/engine/estado.js';

const app = new Hono();

// Better Auth: registro, inicio y cierre de sesión…
app.on(['GET', 'POST'], '/api/auth/*', c => crearAuth(c.env, c.req.raw).handler(c.req.raw));

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

app.get('/api/yo', c => {
  const u = c.get('user');
  return c.json({ id: u.id, nombre: u.name, email: u.email, admin: esAdmin(c.env, u) });
});

const base = c => `/api/examenes/${c.req.param('id')}`;
const aJson = row => ({
  id: row.id, nombre: row.nombre, fecha: row.fecha, nivel: row.nivel, asignatura: row.asignatura_id,
  formato: { opciones: row.opciones, penalizacion: row.penalizacion },
});

// Examen del usuario (o cualquiera, si es el administrador)
async function examenDe(c) {
  const u = c.get('user');
  const row = await c.env.DB.prepare('select * from examen where id = ?').bind(c.req.param('id')).first();
  if (!row || (row.user_id !== u.id && !esAdmin(c.env, u))) return null;
  return row;
}

app.get('/api/examenes', async c => {
  const { results } = await c.env.DB.prepare('select * from examen where user_id = ? order by creado').bind(c.get('user').id).all();
  return c.json(results.map(aJson));
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
  const { estado } = await c.req.json();
  if (!estado || typeof estado !== 'object' || estado.v !== 1) return c.json({ error: 'Progreso no válido' }, 400);
  const uid = c.get('user').id;
  const p = await c.env.DB.prepare('select estado from progreso where user_id = ? and examen_id = ?').bind(uid, row.id).first();
  const junto = mergeState(p ? JSON.parse(p.estado) : null, estado);
  await c.env.DB.prepare(
    'insert into progreso (user_id, examen_id, estado, actualizado) values (?, ?, ?, ?) on conflict (user_id, examen_id) do update set estado = excluded.estado, actualizado = excluded.actualizado'
  ).bind(uid, row.id, JSON.stringify(junto), Date.now()).run();
  return c.json({ estado: junto });
});

app.all('/api/*', c => c.json({ error: 'No existe' }, 404));

export default app;

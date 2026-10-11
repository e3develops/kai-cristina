// La campanita: notificaciones guardadas en la cuenta (y, además, aviso al móvil si los tiene activados)
import { avisar } from './avisospush.js';
import { esAdmin } from './auth.js';

// Crea una notificación y avisa al móvil. Con `clave`, solo una vez (devuelve false si ya existía)
export async function notificar(env, userId, { tipo, titulo, texto, url = null, clave = null }, { push = true } = {}) {
  const r = await env.DB.prepare(`insert or ignore into notificacion (id, user_id, tipo, titulo, texto, url, clave, creado)
    values (?, ?, ?, ?, ?, ?, ?, ?)`).bind(crypto.randomUUID(), userId, tipo, titulo, texto, url, clave, Date.now()).run();
  if (!r.meta.changes) return false;
  if (push) await avisar(env, userId, { titulo, texto, url: url || '/' });
  return true;
}

export function registrarNotificaciones(app) {
  app.get('/api/notificaciones', async c => {
    const uid = c.get('user').id;
    const [lista, n] = await c.env.DB.batch([
      c.env.DB.prepare('select id, tipo, titulo, texto, url, creado, leida from notificacion where user_id = ? order by creado desc limit 50').bind(uid),
      c.env.DB.prepare('select count(*) as n from notificacion where user_id = ? and leida = 0').bind(uid),
    ]);
    return c.json({ notificaciones: lista.results.map(x => ({ ...x, leida: !!x.leida })), sinLeer: n.results[0].n });
  });
  app.post('/api/notificaciones/leidas', async c => {
    await c.env.DB.prepare('update notificacion set leida = 1 where user_id = ? and leida = 0').bind(c.get('user').id).run();
    return c.json({ ok: true });
  });
}

// ---------- Recordatorios diarios (cron) ----------
const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date()); // AAAA-MM-DD
const masDias = (fecha, n) => { const d = new Date(`${fecha}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const CUANDO = { 1: 'mañana', 3: 'en 3 días', 7: 'en una semana' };

export async function recordatoriosDiarios(env) {
  const hoy = hoyMadrid();
  // Exámenes que se acercan (preparados y sin nota aún)
  for (const dias of [1, 3, 7]) {
    const { results } = await env.DB.prepare(`select e.id, e.user_id, e.nombre, p.resumen from examen e
      left join progreso p on p.examen_id = e.id and p.user_id = e.user_id
      where e.fecha = ? and e.estado = 'listo' and e.nota_real is null`).bind(masDias(hoy, dias)).all();
    for (const e of results) {
      let listo = false;
      try { listo = !!JSON.parse(e.resumen || '{}').listo; } catch (err) { /* sin resumen */ }
      await notificar(env, e.user_id, {
        tipo: 'examen', clave: `examen-${e.id}-${dias}`, url: `/?examen=${e.id}`,
        titulo: `${e.nombre}: ${CUANDO[dias]}`,
        texto: listo ? '¡Lo llevas a punto! Un repaso corto y listo 💪' : dias === 1 ? 'Último empujón: te recomiendo que le metamos caña hoy 🔥' : 'Te recomiendo que le metamos caña estos días 📚',
      });
    }
  }
  // El examen fue ayer: preguntar la nota
  const { results: ayer } = await env.DB.prepare(`select id, user_id, nombre from examen where fecha = ? and estado = 'listo' and nota_real is null`).bind(masDias(hoy, -1)).all();
  for (const e of ayer) {
    await notificar(env, e.user_id, { tipo: 'nota', clave: `nota-${e.id}`, url: '/', titulo: `¿Qué tal ${e.nombre}?`, texto: 'Cuando sepas la nota, apúntala y así afino mis previsiones.' });
  }
}

// ---------- Administración: usuarios, sus datos y mensajes ----------
export function registrarAdmin(app) {
  const soloAdmin = async (c, next) => (esAdmin(c.env, c.get('user')) ? next() : c.json({ error: 'No existe' }, 404));
  app.use('/api/admin/*', soloAdmin);

  app.get('/api/admin/usuarios', async c => {
    const { results } = await c.env.DB.prepare(`select u.id, u.name as nombre, u.email, u.createdAt as alta,
      (select max(s.updatedAt) from session s where s.userId = u.id) as ultimaSesion,
      (select max(p.actualizado) from progreso p where p.user_id = u.id) as ultimoEstudio,
      (select count(*) from examen e where e.user_id = u.id) as examenes,
      (select count(*) from examen e where e.user_id = u.id and e.estado = 'procesando') as preparando,
      (select coalesce(sum(json_extract(p.resumen, '$.respuestas')), 0) from progreso p where p.user_id = u.id) as respuestas,
      (select count(*) from documento d where d.user_id = u.id) as archivos,
      (select coalesce(sum(d.bytes), 0) from documento d where d.user_id = u.id) as bytes,
      (select count(*) from push x where x.user_id = u.id) as dispositivos
      from "user" u order by u.createdAt desc`).all();
    return c.json(results);
  });

  app.get('/api/admin/usuarios/:id', async c => {
    const id = c.req.param('id');
    const u = await c.env.DB.prepare('select id, name as nombre, email, createdAt as alta from "user" where id = ?').bind(id).first();
    if (!u) return c.json({ error: 'No existe' }, 404);
    const [asig, ex, docs, ses] = await c.env.DB.batch([
      c.env.DB.prepare('select id, nombre, emoji, color from asignatura where user_id = ? order by creado').bind(id),
      c.env.DB.prepare(`select e.id, e.nombre, e.fecha, e.nivel, e.estado, e.nota_real as notaReal, e.asignatura_id as asignatura, e.enviado, e.creado,
        p.resumen, p.actualizado from examen e left join progreso p on p.examen_id = e.id and p.user_id = e.user_id
        where e.user_id = ? order by e.creado`).bind(id),
      c.env.DB.prepare('select id, examen_id as examen, nombre, tipo, bytes, creado from documento where user_id = ? order by creado').bind(id),
      c.env.DB.prepare('select max(updatedAt) as ultima, count(*) as n from session where userId = ?').bind(id),
    ]);
    const json = s => { try { return s ? JSON.parse(s) : null; } catch (e) { return null; } };
    return c.json({
      ...u, ultimaSesion: ses.results[0]?.ultima || null,
      asignaturas: asig.results,
      examenes: ex.results.map(e => ({ ...e, resumen: json(e.resumen) })),
      documentos: docs.results,
    });
  });

  // Apuntes de un examen cualquiera (para revisar las solicitudes)
  app.get('/api/admin/examenes/:id/documentos', async c => {
    const { results } = await c.env.DB.prepare('select id, nombre, tipo, bytes, creado from documento where examen_id = ? order by creado').bind(c.req.param('id')).all();
    return c.json(results);
  });

  // Ver un archivo subido (fotos/PDF de apuntes) tal cual
  app.get('/api/admin/documentos/:doc', async c => {
    const d = await c.env.DB.prepare('select clave, tipo, nombre from documento where id = ?').bind(c.req.param('doc')).first();
    if (!d) return c.json({ error: 'No existe' }, 404);
    const obj = await c.env.APUNTES.get(d.clave);
    if (!obj) return c.json({ error: 'El archivo ya no está' }, 404);
    return new Response(obj.body, { headers: { 'Content-Type': d.tipo, 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(d.nombre)}`, 'Cache-Control': 'private, no-store' } });
  });

  // Mensaje a un usuario o a todos: llega a su campanita y, si tiene avisos, al móvil
  app.post('/api/admin/mensajes', async c => {
    let b = {};
    try { b = await c.req.json(); } catch (e) { /* vacío */ }
    const titulo = String(b.titulo || '').trim().slice(0, 80);
    const texto = String(b.texto || '').trim().slice(0, 600);
    if (!titulo || !texto) return c.json({ error: 'Escribe un título y un mensaje.' }, 400);
    const ids = b.destino === 'todos'
      ? (await c.env.DB.prepare('select id from "user"').all()).results.map(r => r.id)
      : [String(b.destino || '')];
    if (b.destino !== 'todos' && !(await c.env.DB.prepare('select 1 from "user" where id = ?').bind(ids[0]).first())) return c.json({ error: 'Ese usuario no existe' }, 404);
    // Los avisos al móvil, en segundo plano (con muchos usuarios tarda)
    for (const id of ids) await notificar(c.env, id, { tipo: 'mensaje', titulo, texto }, { push: false });
    c.executionCtx.waitUntil(Promise.all(ids.map(id => avisar(c.env, id, { titulo, texto, url: '/?avisos' }))));
    return c.json({ enviados: ids.length });
  });
}

// Al administrador (por email ADMIN): a su campanita y a su móvil
export async function notificarAdmin(env, datos) {
  if (!env.ADMIN) return;
  const u = await env.DB.prepare('select id from "user" where lower(email) = lower(?)').bind(env.ADMIN).first();
  if (u) await notificar(env, u.id, { tipo: 'admin', url: '/?admin', ...datos });
}

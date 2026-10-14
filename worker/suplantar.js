// "Ver como" un usuario: el administrador pasa a usar una COPIA de sus datos (usuario sombra).
// Garantía: nada de lo que se haga en la copia escribe en las filas del usuario original
// (todo tiene ids nuevos) y los archivos compartidos en R2 solo se borran cuando ya nadie los usa.
import { esAdmin } from './auth.js';

export const SOMBRA = 'sombra-';
export const esSombra = id => String(id || '').startsWith(SOMBRA);

// Rutas en las que el administrador sigue siendo él mismo aunque esté viendo una copia
const SIEMPRE_ADMIN = ['/api/admin/', '/api/push'];

// Middleware: si el administrador tiene una copia activa, la petición se hace como el usuario sombra
export async function aplicarSuplantacion(c) {
  const real = c.get('user');
  if (!esAdmin(c.env, real)) return;
  const ruta = new URL(c.req.url).pathname;
  if (SIEMPRE_ADMIN.some(r => ruta.startsWith(r))) return;
  const s = await c.env.DB.prepare(`select s.original_nombre, u.id, u.name, u.email from suplantacion s
    join "user" u on u.id = s.sombra_id where s.admin_id = ?`).bind(real.id).first();
  if (!s) return;
  c.set('user', { id: s.id, name: s.name, email: s.email });
  c.set('suplantando', { nombre: s.original_nombre });
}

// Borra de R2 las claves que ya no usa ningún documento (las de la copia siguen siendo del original)
export async function borrarHuerfanos(env, claves) {
  const libres = [];
  for (const clave of new Set(claves)) {
    const usada = await env.DB.prepare('select 1 from documento where clave = ? limit 1').bind(clave).first();
    if (!usada) libres.push(clave);
  }
  if (libres.length && env.APUNTES) await env.APUNTES.delete(libres);
}

// Quita la copia activa del administrador (si la hay): el usuario sombra y todo lo suyo
async function quitarCopia(env, adminId) {
  const s = await env.DB.prepare('select sombra_id from suplantacion where admin_id = ?').bind(adminId).first();
  await env.DB.prepare('delete from suplantacion where admin_id = ?').bind(adminId).run();
  if (!s || !esSombra(s.sombra_id)) return; // nunca se borra un usuario que no sea sombra
  const { results: docs } = await env.DB.prepare('select clave from documento where user_id = ?').bind(s.sombra_id).all();
  await env.DB.prepare('delete from "user" where id = ?').bind(s.sombra_id).run(); // en cascada: todo lo de la copia
  await borrarHuerfanos(env, docs.map(d => d.clave));
}

// Inserta filas copiadas (todas las columnas de la fila, con los cambios indicados)
const insertar = (env, tabla, filas) => filas.map(f => {
  const cols = Object.keys(f);
  return env.DB.prepare(`insert into ${tabla} (${cols.map(k => `"${k}"`).join(', ')}) values (${cols.map(() => '?').join(', ')})`).bind(...cols.map(k => f[k]));
});

export function registrarSuplantar(app) {
  // Crear la copia y empezar a verla
  app.post('/api/admin/suplantar/:id', async c => {
    const admin = c.get('user');
    if (!esAdmin(c.env, admin)) return c.json({ error: 'No existe' }, 404);
    const origId = c.req.param('id');
    if (origId === admin.id || esSombra(origId)) return c.json({ error: 'No se puede ver como este usuario' }, 400);
    const orig = await c.env.DB.prepare('select * from "user" where id = ?').bind(origId).first();
    if (!orig) return c.json({ error: 'No existe' }, 404);
    await quitarCopia(c.env, admin.id);

    const sid = `${SOMBRA}${crypto.randomUUID()}`;
    const nuevo = () => crypto.randomUUID();
    const leer = async (sql) => (await c.env.DB.prepare(sql).bind(origId).all()).results;
    const [asigs, exs, progs, docs, prefs, notis] = await Promise.all([
      leer('select * from asignatura where user_id = ?'),
      leer('select * from examen where user_id = ?'),
      leer('select * from progreso where user_id = ?'),
      leer('select * from documento where user_id = ?'),
      leer('select * from preferencia where user_id = ?'),
      leer('select * from notificacion where user_id = ?'),
    ]);
    const mA = Object.fromEntries(asigs.map(a => [a.id, nuevo()]));
    const mE = Object.fromEntries(exs.map(e => [e.id, nuevo()]));
    const cambiarIds = s => (s ? Object.entries(mE).reduce((t, [a, b]) => t.split(a).join(b), s) : s);
    const consultas = [
      ...insertar(c.env, '"user"', [{ ...orig, id: sid, email: `${sid}@kai.invalid` }]),
      ...insertar(c.env, 'asignatura', asigs.map(a => ({ ...a, id: mA[a.id], user_id: sid }))),
      ...insertar(c.env, 'examen', exs.map(e => ({ ...e, id: mE[e.id], user_id: sid, asignatura_id: e.asignatura_id ? mA[e.asignatura_id] ?? null : null }))),
      ...insertar(c.env, 'progreso', progs.filter(p => mE[p.examen_id]).map(p => ({ ...p, user_id: sid, examen_id: mE[p.examen_id] }))),
      ...insertar(c.env, 'documento', docs.filter(d => mE[d.examen_id]).map(d => ({ ...d, id: nuevo(), user_id: sid, examen_id: mE[d.examen_id] }))),
      ...insertar(c.env, 'preferencia', prefs.map(p => ({ ...p, user_id: sid }))),
      ...insertar(c.env, 'notificacion', notis.map(n => ({ ...n, id: nuevo(), user_id: sid, url: cambiarIds(n.url), clave: n.clave ? cambiarIds(n.clave) : null }))),
      c.env.DB.prepare('insert into suplantacion (admin_id, sombra_id, original_id, original_nombre, creado) values (?, ?, ?, ?, ?)')
        .bind(admin.id, sid, origId, orig.name, Date.now()),
    ];
    await c.env.DB.batch(consultas); // todo o nada
    return c.json({ ok: true, nombre: orig.name, copiados: { asignaturas: asigs.length, examenes: exs.length, documentos: docs.length } });
  });

  // Dejar de ver la copia (se borra entera) y volver a ser uno mismo
  app.post('/api/admin/suplantacion/salir', async c => {
    if (!esAdmin(c.env, c.get('user'))) return c.json({ error: 'No existe' }, 404);
    await quitarCopia(c.env, c.get('user').id);
    return c.json({ ok: true });
  });
}

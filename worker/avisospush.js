// Avisos al móvil: activar/desactivar en cada dispositivo y enviar (con la clave VAPID del secreto VAPID_PRIVADO)
import { avisarUsuario, clavePublica } from './push.js';

const jwkDe = env => { try { return env.VAPID_PRIVADO ? JSON.parse(env.VAPID_PRIVADO) : null; } catch (e) { return null; } };
const dbPush = env => ({
  todas: async uid => (await env.DB.prepare('select endpoint, p256dh, auth from push where user_id = ?').bind(uid).all()).results,
  borrar: endpoint => env.DB.prepare('delete from push where endpoint = ?').bind(endpoint).run(),
});

// Envía un aviso a todos los dispositivos de un usuario (no falla nunca: los avisos son un extra)
export async function avisar(env, userId, datos) {
  const jwk = jwkDe(env);
  if (!jwk || !userId) return { dispositivos: 0, entregados: 0 };
  try { return await avisarUsuario(dbPush(env), userId, datos, { jwk }); } catch (e) { return { dispositivos: 0, entregados: 0 }; }
}
export async function avisarAlAdmin(env, datos) {
  if (!env.ADMIN) return;
  const u = await env.DB.prepare('select id from "user" where lower(email) = lower(?)').bind(env.ADMIN).first();
  if (u) await avisar(env, u.id, datos);
}

const ENDPOINT_OK = /^https:\/\/[a-z0-9.-]+\//i;
export function registrarPush(app) {
  app.get('/api/push/clave', c => {
    const jwk = jwkDe(c.env);
    return c.json({ clave: jwk ? clavePublica(jwk) : null });
  });
  app.post('/api/push', async c => {
    let b = {};
    try { b = await c.req.json(); } catch (e) { /* vacío */ }
    const { endpoint, keys } = b || {};
    if (typeof endpoint !== 'string' || endpoint.length > 1000 || !ENDPOINT_OK.test(endpoint)
      || typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string' || keys.p256dh.length > 200 || keys.auth.length > 100) {
      return c.json({ error: 'Suscripción no válida' }, 400);
    }
    const uid = c.get('user').id;
    // Como mucho 10 dispositivos por cuenta (se quita el más antiguo)
    await c.env.DB.prepare(`delete from push where user_id = ? and endpoint != ? and endpoint not in
      (select endpoint from push where user_id = ? order by creado desc limit 9)`).bind(uid, endpoint, uid).run();
    await c.env.DB.prepare(`insert into push (endpoint, user_id, p256dh, auth, creado) values (?, ?, ?, ?, ?)
      on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`)
      .bind(endpoint, uid, keys.p256dh, keys.auth, Date.now()).run();
    return c.json({ ok: true });
  });
  app.delete('/api/push', async c => {
    let b = {};
    try { b = await c.req.json(); } catch (e) { /* vacío */ }
    if (typeof b?.endpoint === 'string') await c.env.DB.prepare('delete from push where endpoint = ? and user_id = ?').bind(b.endpoint, c.get('user').id).run();
    return c.json({ ok: true });
  });
  // Aviso de prueba a mis dispositivos
  app.post('/api/push/probar', async c => {
    const r = await avisar(c.env, c.get('user').id, { titulo: 'KAI', texto: '¡Avisos activados! Así te diré cuándo están listas tus preguntas 💙', url: '/' });
    return r.entregados ? c.json(r) : c.json({ error: 'No he podido enviar el aviso a este dispositivo.' }, 502);
  });
}

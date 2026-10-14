// Apuntes de cada examen: subir, listar, borrar y "enviar a preparar". Ficheros en R2 (privados).
import { LIMITES, TIPOS, motivoRechazo } from './limites.js';
import { avisarAdmin, avisarUnaVezAlDia } from './avisos.js';
import { esAdmin } from './auth.js';
import { notificarAdmin } from './notificaciones.js';
import { borrarHuerfanos, esSombra } from './suplantar.js';

const docJson = d => ({ id: d.id, nombre: d.nombre, tipo: d.tipo, bytes: d.bytes, creado: d.creado });

export function registrarApuntes(app) {
  // Examen propio (los apuntes solo los toca su dueño)
  const propio = async c => {
    const row = await c.env.DB.prepare('select * from examen where id = ? and user_id = ?').bind(c.req.param('id'), c.get('user').id).first();
    return row || null;
  };

  app.get('/api/examenes/:id/documentos', async c => {
    const ex = await propio(c);
    if (!ex) return c.json({ error: 'No existe' }, 404);
    const { results } = await c.env.DB.prepare('select * from documento where examen_id = ? order by creado').bind(ex.id).all();
    const usado = await c.env.DB.prepare('select coalesce(sum(bytes), 0) as b from documento where user_id = ?').bind(c.get('user').id).first();
    return c.json({ documentos: results.map(docJson), usado: usado.b, limite: LIMITES.porUsuario });
  });

  // Cuerpo = el archivo tal cual; cabeceras: Content-Type y X-Nombre (codificado con encodeURIComponent)
  app.post('/api/examenes/:id/documentos', async c => {
    const ex = await propio(c);
    if (!ex) return c.json({ error: 'No existe' }, 404);
    if (ex.estado !== 'pendiente') return c.json({ error: 'Este examen ya se está preparando: no se pueden añadir apuntes ahora.' }, 409);
    const tipo = (c.req.header('Content-Type') || '').split(';')[0].trim();
    const declarado = Number(c.req.header('Content-Length') || 0);
    if (declarado > LIMITES.porArchivo) return c.json({ error: motivoRechazo({ tipo, bytes: declarado, usadoUsuario: 0, usadoGlobal: 0, subidasUltimaHora: 0, archivosExamen: 0 }) }, 413);
    const uid = c.get('user').id;
    const [u, g, h, n] = await c.env.DB.batch([
      c.env.DB.prepare('select coalesce(sum(bytes), 0) as b from documento where user_id = ?').bind(uid),
      c.env.DB.prepare('select coalesce(sum(bytes), 0) as b from documento'),
      c.env.DB.prepare('select count(*) as n from documento where user_id = ? and creado > ?').bind(uid, Date.now() - 3600_000),
      c.env.DB.prepare('select count(*) as n from documento where examen_id = ?').bind(ex.id),
    ]);
    const cuerpo = await c.req.arrayBuffer();
    const datos = { tipo, bytes: cuerpo.byteLength, usadoUsuario: u.results[0].b, usadoGlobal: g.results[0].b, subidasUltimaHora: h.results[0].n, archivosExamen: n.results[0].n };
    const motivo = motivoRechazo(datos);
    if (motivo) {
      if (datos.usadoGlobal + datos.bytes > LIMITES.global) {
        c.executionCtx.waitUntil(avisarUnaVezAlDia(c.env, 'tope', 'KAI: tope de espacio alcanzado',
          `Se ha llegado al tope global de apuntes (${Math.round(LIMITES.global / 1024 ** 3)} GB). Las subidas están pausadas hasta que amplíes el límite en worker/limites.js.`));
      }
      return c.json({ error: motivo }, 413);
    }
    let nombre = 'archivo';
    try { nombre = decodeURIComponent(c.req.header('X-Nombre') || 'archivo').slice(0, 120); } catch (e) { /* nombre raro */ }
    const id = crypto.randomUUID();
    const clave = `${uid}/${ex.id}/${id}.${TIPOS[tipo]}`;
    await c.env.APUNTES.put(clave, cuerpo, { httpMetadata: { contentType: tipo } });
    const doc = { id, nombre, tipo, bytes: cuerpo.byteLength, creado: Date.now() };
    await c.env.DB.prepare('insert into documento (id, examen_id, user_id, nombre, tipo, bytes, clave, creado) values (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(id, ex.id, uid, nombre, tipo, doc.bytes, clave, doc.creado).run();
    return c.json(docJson(doc), 201);
  });

  app.delete('/api/documentos/:doc', async c => {
    const d = await c.env.DB.prepare('select d.*, e.estado from documento d join examen e on e.id = d.examen_id where d.id = ? and d.user_id = ?')
      .bind(c.req.param('doc'), c.get('user').id).first();
    if (!d) return c.json({ error: 'No existe' }, 404);
    if (d.estado !== 'pendiente') return c.json({ error: 'Este examen ya se está preparando: no se pueden quitar apuntes ahora.' }, 409);
    await c.env.DB.prepare('delete from documento where id = ?').bind(d.id).run();
    await borrarHuerfanos(c.env, [d.clave]); // si la copia de "ver como" (u otra fila) lo usa, el archivo se queda
    return c.json({ ok: true });
  });

  // "Prepárame este examen": pasa a procesando y avisa al administrador
  app.post('/api/examenes/:id/enviar', async c => {
    const ex = await propio(c);
    if (!ex) return c.json({ error: 'No existe' }, 404);
    if (ex.estado !== 'pendiente') return c.json({ error: 'Este examen ya se está preparando.' }, 409);
    const docs = await c.env.DB.prepare('select count(*) as n, coalesce(sum(bytes), 0) as b from documento where examen_id = ?').bind(ex.id).first();
    if (!docs.n) return c.json({ error: 'Sube al menos un archivo con tus apuntes.' }, 400);
    await c.env.DB.prepare("update examen set estado = 'procesando', enviado = ? where id = ?").bind(Date.now(), ex.id).run();
    const u = c.get('user');
    // Desde una copia de "ver como" no se avisa: no es una petición real
    if (esSombra(u.id)) return c.json({ ok: true });
    c.executionCtx.waitUntil(avisarAdmin(c.env, `KAI: apuntes nuevos de ${u.name}`,
      `${u.name} (${u.email}) ha enviado apuntes para preparar.\n\nExamen: ${ex.nombre}${ex.fecha ? ` (el ${ex.fecha})` : ''}\nArchivos: ${docs.n} (${Math.round(docs.b / 1024 / 1024 * 10) / 10} MB)\nId: ${ex.id}\n\nPara procesarlo: node tools/fabrica.mjs descargar ${ex.id}`));
    c.executionCtx.waitUntil(notificarAdmin(c.env, { titulo: 'Apuntes nuevos por preparar', texto: `${u.name} ha enviado «${ex.nombre}» (${docs.n} ${docs.n === 1 ? 'archivo' : 'archivos'})`, clave: `enviado-${ex.id}-${Date.now()}` }));
    return c.json({ ok: true });
  });

  // El usuario ya ha visto el "¡tus apuntes están listos!"
  app.post('/api/examenes/:id/visto', async c => {
    const ex = await propio(c);
    if (!ex) return c.json({ error: 'No existe' }, 404);
    await c.env.DB.prepare('update examen set listo_aviso = 0 where id = ?').bind(ex.id).run();
    return c.json({ ok: true });
  });

  // Email de prueba al administrador (para comprobar que Email Routing funciona)
  app.post('/api/admin/probar-aviso', async c => {
    if (!esAdmin(c.env, c.get('user'))) return c.json({ error: 'No existe' }, 404);
    const ok = await avisarAdmin(c.env, 'KAI: email de prueba', '¡Hola! Si lees esto, los avisos de KAI te llegan bien. 🤖💙');
    return ok ? c.json({ ok: true }) : c.json({ error: 'No se pudo enviar: revisa Email Routing en Cloudflare (registros MX y SPF).' }, 502);
  });

  // Panel del administrador: exámenes por preparar y espacio usado
  app.get('/api/admin/resumen', async c => {
    if (!esAdmin(c.env, c.get('user'))) return c.json({ error: 'No existe' }, 404);
    const [p, g, us] = await c.env.DB.batch([
      c.env.DB.prepare(`select e.id, e.nombre, e.fecha, e.enviado, e.user_id as usuarioId, u.name as usuario, u.email,
        (select count(*) from documento d where d.examen_id = e.id) as archivos,
        (select coalesce(sum(bytes), 0) from documento d where d.examen_id = e.id) as bytes
        from examen e join "user" u on u.id = e.user_id where e.estado = 'procesando' and u.id not like 'sombra-%' order by e.enviado`),
      c.env.DB.prepare('select coalesce(sum(bytes), 0) as b, count(*) as n from documento'),
      c.env.DB.prepare(`select count(*) as n from "user" where id not like 'sombra-%'`),
    ]);
    return c.json({ pendientes: p.results, espacio: { usado: g.results[0].b, archivos: g.results[0].n, tope: LIMITES.global }, usuarios: us.results[0].n });
  });
}

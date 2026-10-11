// Panel del administrador: solicitudes de apuntes, usuarios (sus datos y cómo van) y mensajes
import { app, esc, render, modal, aviso, confirmar } from './ui.js';
import { api, SinConexion } from './api.js';
import { ayudas, ponerVista, showInicio } from './biblioteca.js';
import { permisoAvisos, activarAvisos } from './avisos.js';
import { fmtNota, nivel as nivelDe } from './engine/nota.js';

// (se leen al usarse: biblioteca.js y este módulo se importan mutuamente)
const tabbar = a => ayudas.tabbar(a), bindComun = () => ayudas.bindComun(), conConexion = fn => ayudas.conConexion(fn);
const fmtFecha = (...a) => ayudas.fmtFecha(...a), fmtRango = r => ayudas.fmtRango(r), pct = x => ayudas.pct(x), fmtMB = b => ayudas.fmtMB(b);
// Las fechas de las cuentas pueden venir en ms, en segundos o como texto ISO
const aFecha = x => { const n = Number(x); return new Date(Number.isFinite(n) ? (n < 1e12 ? n * 1000 : n) : x); };
const fechaCorta = x => (x ? aFecha(x).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const haceCuanto = x => {
  if (!x) return 'nunca';
  const min = Math.round((Date.now() - aFecha(x)) / 60000);
  if (min < 60) return min < 2 ? 'ahora' : `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
};
const ESTADO = { listo: ['ok', 'listo'], procesando: ['info', 'preparando'], pendiente: ['warn', 'sin enviar'] };

let pestana = 'solicitudes';
export async function showAdmin({ silencioso = false, tab = null } = {}) {
  if (tab) pestana = tab;
  ponerVista(showAdmin, { siempre: pestana !== 'mensaje' }); // el formulario de mensaje no se repinta solo
  if (!silencioso) pintar('<p class="muted">Cargando…</p>');
  let datos;
  try {
    datos = pestana === 'solicitudes' ? await api.adminResumen() : await api.adminUsuarios();
  } catch (e) {
    if (!app.querySelector('#admin')) return;
    return pintar(`<div class="card error-card"><b>No he podido cargar el panel</b><span class="muted small">${e instanceof SinConexion ? 'No hay conexión.' : esc(e.message)}</span><button class="btn secondary" id="reintentar">Reintentar</button></div>`);
  }
  if (!app.querySelector('#admin')) return; // se ha ido a otra pantalla mientras cargaba
  pintar(pestana === 'solicitudes' ? htmlSolicitudes(datos) : pestana === 'usuarios' ? htmlUsuarios(datos) : htmlMensaje(datos));
}

function pintar(cuerpo) {
  const tabs = [['solicitudes', 'Solicitudes'], ['usuarios', 'Usuarios'], ['mensaje', 'Mensaje']];
  render(`
    <div class="screen lib" id="admin">
      <div class="topbar"><button class="back-link" id="volver">‹ Inicio</button></div>
      <h1>Administración</h1>
      <div class="tabs tres" role="tablist">${tabs.map(([k, t]) => `<button role="tab" data-tab-admin="${k}" aria-selected="${pestana === k}" class="${pestana === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      ${cuerpo}
      ${tabbar('')}
    </div>`);
  bindComun();
  app.querySelector('#volver').onclick = showInicio;
  app.querySelector('#reintentar')?.addEventListener('click', () => showAdmin());
  app.querySelectorAll('[data-tab-admin]').forEach(b => b.onclick = () => b.dataset.tabAdmin !== pestana && showAdmin({ tab: b.dataset.tabAdmin }));
  app.querySelectorAll('[data-usuario]').forEach(b => b.addEventListener('click', ev => { if (!ev.target.closest('[data-docs]')) showUsuario(b.dataset.usuario); }));
  app.querySelectorAll('[data-docs]').forEach(b => b.onclick = ev => { ev.stopPropagation(); verApuntes(b.dataset.docs, b.dataset.titulo); });
  bindMensaje();
  app.querySelector('#probar-aviso')?.addEventListener('click', async () => {
    if (await conConexion(() => api.probarAviso())) aviso('Enviado: mira tu bandeja de entrada 📬', 4000);
  });
  app.querySelector('#probar-push')?.addEventListener('click', async () => {
    if (permisoAvisos() === 'default') { try { await activarAvisos(); } catch (e) { /* abajo se ve */ } }
    if (permisoAvisos() !== 'granted') return aviso(permisoAvisos() === 'no' ? 'Este dispositivo no admite avisos (en iPhone: con KAI instalada)' : 'Activa las notificaciones de KAI en Ajustes', 4500);
    if (await conConexion(() => api.probarPush())) aviso('Enviado 📲', 3000);
  });
}

// ---------- Solicitudes: apuntes enviados a preparar ----------
function htmlSolicitudes(r) {
  const e = r.espacio;
  return `
    <div class="section-title"><h2>Por preparar</h2><span class="muted small">${r.pendientes.length}</span></div>
    ${r.pendientes.length ? r.pendientes.map(p => `<div class="card lib-ex" data-usuario="${esc(p.usuarioId)}">
        <div class="lib-ex-top"><b>${esc(p.nombre)}</b>${p.fecha ? `<span class="pill warn">${fmtFecha(p.fecha)}</span>` : ''}</div>
        <span class="muted small">${esc(p.usuario)} · ${esc(p.email)}<br>Enviado ${haceCuanto(p.enviado)} · ${p.archivos} ${p.archivos === 1 ? 'archivo' : 'archivos'} · ${fmtMB(p.bytes)}</span>
        <button class="btn secondary" data-docs="${esc(p.id)}" data-titulo="${esc(p.nombre)}">Ver apuntes</button>
        <code class="cmd">node tools/fabrica.mjs descargar ${esc(p.id)}</code>
      </div>`).join('') : '<div class="vacio-card"><div class="vacio-ic">✅</div><p class="muted">Nada pendiente. Cuando alguien envíe apuntes te llegará un aviso.</p></div>'}
    <div class="section-title"><h2>Sistema</h2></div>
    <div class="card"><b>Espacio de apuntes</b>
      <div class="bar"><i style="width:${Math.min(100, pct(e.usado / e.tope))}%"></i></div>
      <span class="muted small">${fmtGB(e.usado)} de ${fmtGB(e.tope)} (tope para no salir de lo gratuito) · ${e.archivos} archivos · ${r.usuarios} usuarios</span></div>
    <div class="btn-row"><button class="btn secondary" id="probar-aviso">Email de prueba</button><button class="btn secondary" id="probar-push">Aviso de prueba</button></div>`;
}
const fmtGB = b => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1).replace('.', ',')} GB` : fmtMB(b));

// Los archivos de un examen: fotos en miniatura y PDF como enlace (se abren tal cual)
async function verApuntes(examen, titulo) {
  let docs;
  try { docs = await api.adminDocumentos(examen); } catch (e) { return aviso(e instanceof SinConexion ? 'Necesitas conexión' : 'No he podido cargar los apuntes'); }
  const url = d => `/api/admin/documentos/${encodeURIComponent(d.id)}`;
  const fotos = docs.filter(d => d.tipo.startsWith('image/'));
  const otros = docs.filter(d => !d.tipo.startsWith('image/'));
  modal(`
    <h2>${esc(titulo)}</h2>
    <p class="muted small">${docs.length} ${docs.length === 1 ? 'archivo' : 'archivos'} · ${fmtMB(docs.reduce((a, d) => a + d.bytes, 0))}</p>
    ${fotos.length ? `<div class="docs-grid">${fotos.map(d => `<a href="${url(d)}" target="_blank" rel="noopener"><img src="${url(d)}" alt="${esc(d.nombre)}" loading="lazy"></a>`).join('')}</div>` : ''}
    ${otros.length ? `<div class="menu-list">${otros.map(d => `<a class="menu-link" href="${url(d)}" target="_blank" rel="noopener">📄 ${esc(d.nombre)}</a>`).join('')}</div>` : ''}
    ${docs.length ? '' : '<p class="muted">No hay archivos.</p>'}
    <button class="btn ghost" data-a="close">Volver</button>`, (el, close) => { el.querySelector('[data-a=close]').onclick = close; });
}

// ---------- Usuarios ----------
function htmlUsuarios(us) {
  return `
    <div class="section-title"><h2>Usuarios</h2><span class="muted small">${us.length}</span></div>
    <div class="usuarios">${us.map(u => `<button class="card usuario" data-usuario="${esc(u.id)}">
      <span class="avatar" aria-hidden="true">${esc(iniciales(u))}</span>
      <span class="usuario-txt"><b>${esc(u.nombre)}</b><span class="muted small">${esc(u.email)}</span>
        <span class="muted small">${u.examenes} ${u.examenes === 1 ? 'examen' : 'exámenes'} · ${u.respuestas} respuestas · estudió ${haceCuanto(u.ultimoEstudio)}</span></span>
      <span class="usuario-pills">${u.preparando ? '<span class="pill info">preparando</span>' : ''}${u.dispositivos ? '<span class="pill" title="Avisos activados">🔔</span>' : ''}</span>
    </button>`).join('')}</div>`;
}
const iniciales = u => (u.nombre || u.email || '?').split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase();

export async function showUsuario(id, { silencioso = false } = {}) {
  ponerVista(() => showUsuario(id, { silencioso: true }), { siempre: true });
  if (!silencioso) render(`<div class="screen lib" id="admin-u"><div class="topbar"><button class="back-link" id="volver">‹ Usuarios</button></div><p class="muted">Cargando…</p>${tabbar('')}</div>`);
  app.querySelector('#volver')?.addEventListener('click', () => showAdmin({ tab: 'usuarios' }));
  let u;
  try { u = await api.adminUsuario(id); } catch (e) { return aviso(e instanceof SinConexion ? 'Necesitas conexión' : 'No he podido cargar el usuario'); }
  if (!app.querySelector('#admin-u')) return;
  const asig = Object.fromEntries(u.asignaturas.map(a => [a.id, a]));
  const grupos = [...u.asignaturas.map(a => a.id), null]
    .map(aid => [aid, u.examenes.filter(e => (e.asignatura || null) === aid)]).filter(([, l]) => l.length);
  const docsDe = eid => u.documentos.filter(d => d.examen === eid);
  const respuestas = u.examenes.reduce((n, e) => n + (e.resumen?.respuestas || 0), 0);
  const examen = e => {
    const r = e.resumen;
    const [cls, txt] = ESTADO[e.estado] || ['', e.estado];
    const docs = docsDe(e.id);
    return `<div class="card lib-ex">
      <div class="lib-ex-top"><b>${esc(e.nombre)}</b><span class="pill ${cls}">${txt}</span></div>
      <span class="muted small">${e.fecha ? `Examen el ${fmtFecha(e.fecha)} · ` : ''}${nivelDe(e.nivel).nombre}${e.notaReal != null ? ` · <b>sacó un ${fmtNota(e.notaReal)}</b>` : ''}</span>
      ${r ? `<span class="muted small">${r.respuestas || 0} respuestas · ${pct(r.dominado)}% dominado${r.rango ? ` · nota prevista ${fmtRango(r.rango)}` : ''}${r.listo ? ' · <b class="ok-txt">¡a punto!</b>' : ''} · estudió ${haceCuanto(e.actualizado)}</span>
        <div class="bar"><i style="width:${pct(r.dominado)}%"></i></div>` : e.estado === 'listo' ? '<span class="muted small">Aún sin empezar</span>' : ''}
      ${docs.length ? `<button class="btn ghost" data-docs="${esc(e.id)}" data-titulo="${esc(e.nombre)}">Ver apuntes (${docs.length})</button>` : ''}
    </div>`;
  };
  render(`
    <div class="screen lib" id="admin-u">
      <div class="topbar"><button class="back-link" id="volver">‹ Usuarios</button></div>
      <div class="cuenta-cab"><span class="avatar" aria-hidden="true">${esc(iniciales(u))}</span>
        <div><h1>${esc(u.nombre)}</h1><span class="muted small">${esc(u.email)}</span></div></div>
      <div class="stats">
        <div class="stat"><b>${u.examenes.length}</b><span>exámenes</span></div>
        <div class="stat"><b>${respuestas}</b><span>respuestas</span></div>
        <div class="stat"><b>${u.documentos.length}</b><span>archivos</span></div>
      </div>
      <p class="muted small">Alta: ${fechaCorta(u.alta)} · Última vez: ${haceCuanto(u.ultimaSesion)}</p>
      <button class="btn secondary" id="escribir">Enviar un mensaje</button>
      ${grupos.length ? grupos.map(([aid, l]) => `<div class="section-title"><h2>${aid ? `${asig[aid].emoji} ${esc(asig[aid].nombre)}` : 'Sin asignatura'}</h2></div>${l.map(examen).join('')}`).join('')
        : '<p class="muted">Aún no ha creado ningún examen.</p>'}
      ${tabbar('')}
    </div>`);
  bindComun();
  app.querySelector('#volver').onclick = () => showAdmin({ tab: 'usuarios' });
  app.querySelectorAll('[data-docs]').forEach(b => b.onclick = () => verApuntes(b.dataset.docs, b.dataset.titulo));
  app.querySelector('#escribir').onclick = () => modal(`
    <h2>Mensaje para ${esc(u.nombre)}</h2>
    ${formMensaje()}
    <button class="btn ghost" data-a="close">Cancelar</button>`, (el, close) => {
    el.querySelector('[data-a=close]').onclick = close;
    el.querySelector('#fm').onsubmit = ev => enviarMensaje(ev, u.id, u.nombre, close);
  });
}

// ---------- Mensajes: a un usuario o a todos (campanita + aviso al móvil) ----------
const formMensaje = (destinos = null) => `
  <form class="form" id="fm" novalidate>
    ${destinos ? `<label>Para<select name="destino"><option value="todos">Todos los usuarios (${destinos.length})</option>${destinos.map(u => `<option value="${esc(u.id)}">${esc(u.nombre)} · ${esc(u.email)}</option>`).join('')}</select></label>` : ''}
    <label>Título<input name="titulo" maxlength="80" placeholder="¡Novedades en KAI!" autocomplete="off" required></label>
    <label>Mensaje<textarea name="texto" maxlength="600" rows="5" placeholder="Escribe aquí tu mensaje…" required></textarea></label>
    <p class="form-err" role="alert"></p>
    <button class="btn" type="submit">Enviar</button>
  </form>`;
function htmlMensaje(us) {
  return `<p class="muted">Llega a la campanita de KAI y, si tienen los avisos activados, también al móvil.</p>${formMensaje(us)}`;
}
function bindMensaje() {
  const f = app.querySelector('#admin #fm');
  if (!f) return;
  f.onsubmit = ev => {
    const sel = f.destino;
    enviarMensaje(ev, sel.value, sel.value === 'todos' ? null : sel.selectedOptions[0].textContent.split(' · ')[0]);
  };
}
async function enviarMensaje(ev, destino, nombre, alTerminar) {
  ev.preventDefault();
  const f = ev.target;
  const titulo = f.titulo.value.trim(), texto = f.texto.value.trim();
  if (!titulo || !texto) return (f.querySelector('.form-err').textContent = 'Escribe un título y un mensaje.');
  alTerminar?.();
  if (destino === 'todos' && !(await confirmar({ titulo: '¿Enviar a todos?', texto: 'El mensaje llegará a todos los usuarios registrados.', si: 'Enviar a todos' }))) return;
  const r = await conConexion(() => api.adminMensaje(destino, titulo, texto));
  if (!r) return;
  aviso(destino === 'todos' ? `Enviado a ${r.enviados} usuarios 📨` : `Enviado a ${nombre} 📨`, 3500);
  if (!alTerminar) { f.reset(); }
}

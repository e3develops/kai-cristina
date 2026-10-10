// Biblioteca: Inicio (qué toca hoy), Asignaturas, Calendario, y crear/editar asignaturas y exámenes.
// El estudio de cada examen (la KAI de siempre) vive en app.js; aquí solo se abre.
import { kaiSVG } from './kai.js';
import { app, esc, render, modal, aviso, confirmar } from './ui.js';
import { api, SinConexion, SinSesion } from './api.js';
import { recomendar, planDe, diasHasta, fmtDias } from './engine/recomendar.js';
import { fmtNota, nivel as nivelDe, NIVELES } from './engine/nota.js';
import { fmtTime } from './engine/motor.js';
import { why } from './porque.js';

// Lo que necesita de app.js (se pasa al arrancar para no tener imports circulares)
let ctx = { abrirExamen: () => {}, nombre: () => '', iniciales: () => '', menuCuenta: () => {}, entrar: () => {} };
export const configurarBiblioteca = c => { ctx = { ...ctx, ...c }; };

export const EMOJIS = ['📘', '🧬', '🦴', '🫀', '🧠', '💊', '🩺', '🧪', '🦠', '🍎', '📐', '🌍', '🗣️', '🎨', '⚖️', '💻'];
export const COLORES = ['verde', 'azul', 'morado', 'rosa', 'naranja', 'gris'];

// ---------- Datos (con copia en el dispositivo para usarla sin conexión) ----------
const CACHE = 'kai-biblioteca';
let LIB = (() => { try { return JSON.parse(localStorage.getItem(CACHE)) || { asignaturas: [], examenes: [] }; } catch (e) { return { asignaturas: [], examenes: [] }; } })();
export async function cargarBiblioteca() {
  try {
    const [asignaturas, examenes] = await Promise.all([api.asignaturas(), api.examenes()]);
    LIB = { asignaturas, examenes };
    try { localStorage.setItem(CACHE, JSON.stringify(LIB)); } catch (e) { /* sin almacenamiento */ }
  } catch (e) {
    if (e instanceof SinSesion) throw e; // que app.js pida entrar
    /* sin conexión: se usa la copia */
  }
  return LIB;
}
export const olvidarBiblioteca = () => { try { localStorage.removeItem(CACHE); } catch (e) { /* nada */ } };
const asignaturaDe = e => LIB.asignaturas.find(a => a.id === e.asignatura);
const examenesDe = id => LIB.examenes.filter(e => (e.asignatura || null) === id);

// Las acciones que cambian datos necesitan conexión
async function conConexion(fn) {
  try { return await fn(); } catch (e) {
    if (e instanceof SinConexion) aviso('Necesitas conexión para esto');
    else if (e instanceof SinSesion) ctx.entrar();
    else aviso(/^[A-Za-z]/.test(e.message || '') && !/[áéíóúñ¿]/.test(e.message) ? 'Algo ha fallado. Vuelve a intentarlo en un momento.' : e.message);
    return null;
  }
}

// ---------- Utilidades de pantalla ----------
const fmtFecha = (f, opts = { day: 'numeric', month: 'short' }) => new Intl.DateTimeFormat('es-ES', opts).format(new Date(`${f}T00:00:00`)).replace('.', '');
const fmtRango = r => (r.min === r.max ? fmtNota(r.min) : `${fmtNota(r.min)}–${fmtNota(r.max)}`);
const pct = x => Math.round((x || 0) * 100);
const yaPaso = e => e.fecha && diasHasta(e.fecha) < 0;

function tabbar(activa) {
  const svg = d => `<svg class="tab-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const t = (id, ic, txt) => `<button class="tab ${activa === id ? 'on' : ''}" data-tab="${id}" ${activa === id ? 'aria-current="page"' : ''}>${svg(ic)}${txt}</button>`;
  return `<nav class="tabbar">${t('inicio', '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>', 'Inicio')}${t('asignaturas', '<path d="M4 19.5V5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2v0a2 2 0 0 0 2 2h13"/><path d="M8 7h7"/>', 'Asignaturas')}${t('calendario', '<rect x="3" y="4.5" width="18" height="16.5" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>', 'Calendario')}</nav>`;
}
function bindComun() {
  app.querySelectorAll('.tabbar [data-tab]').forEach(b => b.onclick = () => ({ inicio: showInicio, asignaturas: showAsignaturas, calendario: () => showCalendario() })[b.dataset.tab]());
  app.querySelector('#cuenta')?.addEventListener('click', ctx.menuCuenta);
  app.querySelectorAll('[data-examen]').forEach(el => el.addEventListener('click', e => { if (!e.target.closest('[data-why]')) abrir(el.dataset.examen); }));
  app.querySelectorAll('[data-nota]').forEach(el => el.onclick = () => pedirNota(LIB.examenes.find(x => x.id === el.dataset.nota)));
}
function abrir(id) {
  const e = LIB.examenes.find(x => x.id === id);
  if (!e) return;
  if (e.estado !== 'listo') return showApuntes(e);
  if (e.listoAviso) api.visto(e.id).catch(() => {});
  ctx.abrirExamen(id, asignaturaDe(e));
}

// ---------- Apuntes de un examen: subir, quitar y "prepárame este examen" ----------
const fmtMB = b => `${(b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0).replace('.', ',')} MB`;
export async function showApuntes(e) {
  const volver = () => (e.asignatura ? showAsignatura(e.asignatura) : showInicio());
  pintarApuntes(e, null);
  let info;
  try { info = await api.documentos(e.id); } catch (err) {
    if (err instanceof SinSesion) return ctx.entrar();
    info = null;
  }
  if (!app.querySelector('#apuntes')) return; // ya se ha ido a otra pantalla
  pintarApuntes(e, info, volver);
}
function pintarApuntes(e, info, volver = () => showInicio()) {
  const docs = info?.documentos || [];
  const procesando = e.estado === 'procesando';
  const lista = docs.map(d => `<div class="card doc-fila"><span class="doc-ic">${d.tipo === 'application/pdf' ? '📄' : '🖼️'}</span>
      <span class="doc-txt"><b>${esc(d.nombre)}</b><span class="muted small">${fmtMB(d.bytes)}</span></span>
      ${procesando ? '' : `<button class="icon-btn" data-borrar="${d.id}" aria-label="Quitar ${esc(d.nombre)}">✕</button>`}</div>`).join('');
  const usado = info && docs.length ? `<div class="cuota"><div class="bar"><i style="width:${Math.min(100, pct(info.usado / info.limite))}%"></i></div><span class="muted small">Tu espacio: ${fmtMB(info.usado)} de ${fmtMB(info.limite)}</span></div>` : '';
  render(`
    <div class="screen lib" id="apuntes">
      <div class="topbar"><button class="back-link" id="volver">‹ ${esc(asignaturaDe(e)?.nombre || 'Inicio')}</button><button class="icon-btn" id="editar" aria-label="Editar examen">✎</button></div>
      <h1>${esc(e.nombre)}</h1>
      <div class="kai-row"><div class="kai-wrap">${kaiSVG()}</div><div class="bubble">${procesando
        ? '<p>¡Recibido! ⏳ Estoy preparando tus preguntas. Te aviso en cuanto estén listas.</p>'
        : '<p>Sube las <b>fotos o PDF</b> de todo lo que entra en el examen. Cuanto más completo, mejores preguntas 💪</p><p class="muted small">Fotos de frente, con buena luz y una página por foto.</p>'}</div></div>
      ${procesando ? '' : `<div class="subir">
        <label class="btn secondary">📷 Hacer fotos<input type="file" accept="image/*" capture="environment" multiple hidden data-subir></label>
        <label class="btn secondary">📁 Elegir archivos<input type="file" accept="image/*,application/pdf" multiple hidden data-subir></label>
      </div>`}
      <div id="progreso"></div>
      ${info === null ? '<p class="muted">Cargando…</p>' : docs.length ? `<div class="section-title"><h2>${docs.length} ${docs.length === 1 ? 'archivo' : 'archivos'}</h2></div>${lista}` : '<p class="muted">Aún no has subido nada.</p>'}
      ${usado}
      ${procesando ? '' : `<button class="btn" id="enviar" ${docs.length ? '' : 'disabled'}>Prepárame este examen</button>${docs.length ? '' : '<p class="muted small centro">Sube al menos un archivo para continuar.</p>'}`}
      ${tabbar('asignaturas')}
    </div>`, procesando ? 'happy' : 'talk');
  bindComun();
  app.querySelector('#volver').onclick = volver;
  app.querySelector('#editar').onclick = () => formExamen(e.asignatura, e);
  app.querySelectorAll('[data-subir]').forEach(inp => inp.onchange = () => subir(e, [...inp.files]));
  app.querySelectorAll('[data-borrar]').forEach(b => b.onclick = async () => {
    if (!(await confirmar({ titulo: '¿Quitar este archivo?', si: 'Quitar', peligro: true }))) return;
    if (await conConexion(() => api.borrarDocumento(b.dataset.borrar))) showApuntes(e);
  });
  app.querySelector('#enviar')?.addEventListener('click', async () => {
    if (!(await confirmar({ titulo: '¿Preparo tus preguntas?', texto: 'Mientras las preparo no podrás cambiar los apuntes de este examen.', si: 'Sí, prepáralas' }))) return;
    if (!(await conConexion(() => api.enviarExamen(e.id)))) return;
    await cargarBiblioteca();
    showApuntes(LIB.examenes.find(x => x.id === e.id) || e);
  });
}
async function subir(e, files) {
  if (!files.length) return;
  const { comprimirImagen } = await import('./comprimir.js');
  const prog = app.querySelector('#progreso');
  let hechos = 0, fallos = [];
  for (const file of files) {
    prog.innerHTML = `<div class="card subiendo"><b>Subiendo ${hechos + 1} de ${files.length}…</b><div class="bar"><i style="width:${pct(hechos / files.length)}%"></i></div></div>`;
    try {
      const blob = await comprimirImagen(file);
      await api.subirDocumento(e.id, blob, file.name || 'foto.jpg');
      hechos++;
    } catch (err) {
      if (err instanceof SinSesion) return ctx.entrar();
      fallos.push(err instanceof SinConexion ? 'Sin conexión' : err.message);
      if (err instanceof SinConexion || /límite|espacio|muchos/.test(err.message)) break; // no tiene sentido seguir
    }
  }
  if (fallos.length) aviso(`${hechos ? `Subidos ${hechos}. ` : ''}${fallos[0]}`, 5000);
  else aviso(hechos === 1 ? 'Archivo subido' : `${hechos} archivos subidos`);
  showApuntes(e);
}

// Tarjeta de un examen: nombre, cuándo es, nivel y previsión, y progreso
function tarjetaExamen(e, { conAsignatura = true } = {}) {
  const a = asignaturaDe(e);
  const dias = diasHasta(e.fecha);
  const r = e.resumen;
  const nombre = `${conAsignatura && a ? `${esc(a.nombre)} · ` : ''}${esc(e.nombre)}`;
  if (e.notaReal != null) {
    const p = e.prevision?.rango;
    const acierto = p ? (e.notaReal >= p.min - 0.25 && e.notaReal <= p.max + 0.25 ? ' ✓' : '') : '';
    return `<div class="card lib-ex" data-examen="${e.id}"><div class="lib-ex-top"><b>${nombre}</b><span class="pill ok">sacaste un ${fmtNota(e.notaReal)}</span></div>
      <div class="muted small">${p ? `KAI preveía ${fmtRango(p)}${acierto}` : 'Nota apuntada'}</div></div>`;
  }
  if (e.estado !== 'listo') {
    return `<div class="card lib-ex preparando" data-examen="${e.id}"><div class="lib-ex-top"><b>${nombre}</b><span class="pill ${e.estado === 'procesando' ? 'info' : 'warn'}">${e.estado === 'procesando' ? 'preparando' : 'faltan apuntes'}</span></div>
      <div class="muted small">${e.fecha ? `${fmtFecha(e.fecha)} · ` : ''}${e.estado === 'procesando' ? 'Preparando tus preguntas. Te aviso cuando estén listas' : 'Toca para subir tus apuntes'}</div></div>`;
  }
  const chip = dias == null ? '' : dias < 0 ? `<button class="pill warn" data-nota="${e.id}">¿qué nota sacaste?</button>` : `<span class="pill ${dias <= 7 ? 'warn' : ''}">${fmtDias(dias)}</span>`;
  const prev = r && r.respuestas >= 20 ? `nota prevista ${fmtRango(r.rango)} ${why('b-rango', e.id)}` : r && r.respuestas > 0 ? 'calculando tu nota…' : 'sin empezar';
  return `<div class="card lib-ex" data-examen="${e.id}"><div class="lib-ex-top"><b>${nombre}</b>${chip}</div>
    <div class="muted small">${nivelDe(e.nivel).nombre} · ${prev}${r?.listo ? ' · <b class="ok-txt">¡a punto!</b>' : ''}</div>
    <div class="bar"><i style="width:${pct(r?.dominado)}%"></i></div></div>`;
}

// ---------- Inicio: qué toca hoy ----------
export async function showInicio() {
  await cargarBiblioteca().catch(e => { if (e instanceof SinSesion) ctx.entrar(); throw e; });
  const rec = recomendar(LIB.examenes);
  const ex = LIB.examenes;
  const sinNota = ex.filter(e => e.estado === 'listo' && e.notaReal == null && yaPaso(e));
  const proximos = ex.filter(e => e.notaReal == null && !yaPaso(e) && e.id !== rec?.examen.id)
    .sort((a, b) => (a.fecha || '9999') < (b.fecha || '9999') ? -1 : 1);
  const nombre = ctx.nombre();
  let bocadillo, mood = 'talk';
  if (!LIB.asignaturas.length && !ex.length) {
    bocadillo = `<p>${nombre ? `¡Hola, <b>${esc(nombre)}</b>!` : '¡Hola!'} Soy <b>KAI</b>, tu compañero de estudio 💙</p><p>Empieza creando tu primera <b>asignatura</b> y luego añade sus exámenes.</p>
      <button class="btn" id="primera">Crear mi primera asignatura</button>`;
    mood = 'wave happy';
  } else if (rec) {
    const a = asignaturaDe(rec.examen);
    bocadillo = `<p>${nombre ? `${esc(nombre)}, te` : 'Te'} recomiendo que le metamos caña a <b>${a ? `${esc(a.nombre)} · ` : ''}${esc(rec.examen.nombre)}</b> ${why('b-rec')}</p>
      ${rec.examen.fecha ? `<p class="muted small">Es ${fmtDias(diasHasta(rec.examen.fecha))}</p>` : ''}
      <button class="btn" data-examen="${rec.examen.id}">Empezar · ${rec.minutosHoy} min</button>`;
  } else if (ex.some(e => e.estado !== 'listo')) {
    bocadillo = '<p>En cuanto tus apuntes estén listos te digo por dónde empezar 💪</p>'; mood = 'think';
  } else {
    bocadillo = '<p>¡Lo llevas todo al día! 🎉 Si quieres, repasa un poco o añade un examen nuevo.</p>'; mood = 'happy';
  }
  render(`
    <div class="screen lib">
      <div class="topbar">
        <div><div class="hello">Hola${nombre ? `, ${esc(nombre)}` : ''}&nbsp;👋</div><h1>¿Qué toca hoy?</h1></div>
        <button class="avatar" id="cuenta" aria-label="Tu cuenta">${esc(ctx.iniciales())}</button>
      </div>
      <div class="kai-row"><div class="kai-wrap">${kaiSVG()}</div><div class="bubble">${bocadillo}</div></div>
      ${ex.filter(e => e.listoAviso && e.estado === 'listo').map(e => `<div class="card listo-card"><b>🎉 ¡Tus apuntes de ${esc(e.nombre)} ya están listos!</b><span class="muted small">He preparado ${e.preguntas ? `${e.preguntas} preguntas` : 'tus preguntas'} con ellos. ¿Empezamos?</span><button class="btn" data-examen="${e.id}">¡Vamos!</button></div>`).join('')}
      ${sinNota.map(e => `<div class="card nota-card"><b>¿Qué tal ${esc(e.nombre)}?</b><span class="muted small">Fue el ${fmtFecha(e.fecha)}. Apunta tu nota y así afino mis previsiones.</span><button class="btn secondary" data-nota="${e.id}">Apuntar mi nota</button></div>`).join('')}
      ${proximos.length ? `<div class="section-title"><h2>${rec ? 'Otros exámenes' : 'Próximos exámenes'}</h2></div>${proximos.map(e => tarjetaExamen(e)).join('')}` : ''}
      ${tabbar('inicio')}
    </div>`, mood);
  bindComun();
  app.querySelector('#primera')?.addEventListener('click', () => formAsignatura());
}

// ---------- Asignaturas ----------
export async function showAsignaturas() {
  render(vistaAsignaturas());
  bindAsignaturas();
  await cargarBiblioteca();
  if (app.querySelector('.asig-lista')) { render(vistaAsignaturas()); bindAsignaturas(); }
}
function vistaAsignaturas() {
  const sueltos = examenesDe(null);
  const fila = (a, n, prox) => `<button class="card asig c-${a.color}" data-asig="${a.id}">
      <span class="asig-emoji">${a.emoji}</span>
      <span class="asig-txt"><b>${esc(a.nombre)}</b><span class="muted small">${n} ${n === 1 ? 'examen' : 'exámenes'}${prox ? ` · próximo ${fmtFecha(prox.fecha)}` : ''}</span></span>
      <span class="asig-flecha">›</span></button>`;
  const proximoDe = id => examenesDe(id).filter(e => e.fecha && !yaPaso(e) && e.notaReal == null).sort((x, y) => x.fecha < y.fecha ? -1 : 1)[0];
  return `
    <div class="screen lib">
      <div class="topbar"><h1>Asignaturas</h1><button class="avatar" id="cuenta" aria-label="Tu cuenta">${esc(ctx.iniciales())}</button></div>
      <div class="asig-lista">
        ${LIB.asignaturas.map(a => fila(a, examenesDe(a.id).length, proximoDe(a.id))).join('')}
        ${sueltos.length ? fila({ id: '', nombre: 'Sin asignatura', emoji: '🗂️', color: 'gris' }, sueltos.length, proximoDe(null)) : ''}
      </div>
      <button class="nuevo" id="nueva-asig">＋ Nueva asignatura</button>
      ${tabbar('asignaturas')}
    </div>`;
}
function bindAsignaturas() {
  bindComun();
  app.querySelectorAll('[data-asig]').forEach(b => b.onclick = () => showAsignatura(b.dataset.asig || null));
  app.querySelector('#nueva-asig').onclick = () => formAsignatura();
}

export function showAsignatura(id) {
  const a = id ? LIB.asignaturas.find(x => x.id === id) : { id: null, nombre: 'Sin asignatura', emoji: '🗂️', color: 'gris' };
  if (!a) return showAsignaturas();
  const hecho = x => x.notaReal != null || yaPaso(x);
  const lista = examenesDe(id).sort((x, y) => hecho(x) - hecho(y) || ((x.fecha || '9999') < (y.fecha || '9999') ? -1 : 1));
  const aprobados = lista.filter(e => e.notaReal >= 5).length;
  render(`
    <div class="screen lib">
      <div class="topbar"><button class="back-link" id="volver">‹ Asignaturas</button>${id ? '<button class="icon-btn" id="editar" aria-label="Editar asignatura">✎</button>' : ''}</div>
      <div class="asig-head c-${a.color}"><span class="asig-emoji grande">${a.emoji}</span><div><h1>${esc(a.nombre)}</h1>
        <div class="muted small">${lista.length} ${lista.length === 1 ? 'examen' : 'exámenes'}${aprobados ? ` · ${aprobados} aprobado${aprobados > 1 ? 's' : ''}` : ''}</div></div></div>
      <div class="section-title"><h2>Exámenes</h2></div>
      ${lista.length ? lista.map(e => tarjetaExamen(e, { conAsignatura: false })).join('') : '<p class="muted">Aún no hay exámenes. Crea el primero y pon su fecha: así sabré cuánto tiempo tenemos.</p>'}
      <button class="nuevo" id="nuevo-ex">＋ Nuevo examen</button>
      ${tabbar('asignaturas')}
    </div>`);
  bindComun();
  app.querySelector('#volver').onclick = showAsignaturas;
  app.querySelector('#editar')?.addEventListener('click', () => formAsignatura(a));
  app.querySelector('#nuevo-ex').onclick = () => formExamen(id);
}

// ---------- Crear / editar asignatura ----------
function formAsignatura(a = null) {
  let emoji = a?.emoji || EMOJIS[0], color = a?.color || COLORES[0];
  render(`
    <div class="screen lib">
      <div class="topbar"><button class="back-link" id="volver">✕ Cancelar</button></div>
      <h1>${a ? 'Editar asignatura' : 'Nueva asignatura'}</h1>
      <div class="asig-prev c-${color}"><span class="asig-emoji grande">${emoji}</span></div>
      <form class="form" id="f" novalidate>
        <label>Nombre<input name="nombre" maxlength="60" placeholder="Biología" value="${esc(a?.nombre || '')}" autocomplete="off" required></label>
        <div class="campo"><span>Icono</span><div class="emojis">${EMOJIS.map(x => `<button type="button" class="emoji ${x === emoji ? 'on' : ''}" data-emoji="${x}">${x}</button>`).join('')}</div></div>
        <div class="campo"><span>Color</span><div class="colores">${COLORES.map(x => `<button type="button" class="color c-${x} ${x === color ? 'on' : ''}" data-color="${x}" aria-label="${x}"></button>`).join('')}</div></div>
        <p class="form-err" role="alert"></p>
        <button class="btn" type="submit">${a ? 'Guardar' : 'Crear asignatura'}</button>
        ${a ? '<button class="btn ghost peligro" type="button" id="borrar">Borrar asignatura</button>' : ''}
      </form>
    </div>`);
  const f = app.querySelector('#f');
  app.querySelector('#volver').onclick = () => (a ? showAsignatura(a.id) : showAsignaturas());
  const prev = app.querySelector('.asig-prev');
  f.querySelectorAll('[data-emoji]').forEach(b => b.onclick = () => { emoji = b.dataset.emoji; prev.firstElementChild.textContent = emoji; f.querySelectorAll('.emoji').forEach(x => x.classList.toggle('on', x === b)); });
  f.querySelectorAll('[data-color]').forEach(b => b.onclick = () => { color = b.dataset.color; prev.className = `asig-prev c-${color}`; f.querySelectorAll('.color').forEach(x => x.classList.toggle('on', x === b)); });
  f.onsubmit = async e => {
    e.preventDefault();
    const nombre = f.nombre.value.trim();
    if (!nombre) return (f.querySelector('.form-err').textContent = 'Ponle un nombre a la asignatura.');
    const datos = { nombre, emoji, color };
    const r = await conConexion(() => (a ? api.editarAsignatura(a.id, datos) : api.crearAsignatura(datos)));
    if (!r) return;
    await cargarBiblioteca();
    showAsignatura(a ? a.id : r.id);
  };
  f.querySelector('#borrar')?.addEventListener('click', async () => {
    if (!(await confirmar({ titulo: `¿Borrar ${esc(a.nombre)}?`, texto: 'Sus exámenes no se borran: pasan a «Sin asignatura».', si: 'Borrar', peligro: true }))) return;
    if (!(await conConexion(() => api.borrarAsignatura(a.id)))) return;
    await cargarBiblioteca();
    showAsignaturas();
  });
}

// ---------- Crear / editar examen ----------
export function formExamen(asignaturaId, e = null) {
  const f0 = e?.formato || { opciones: 4, penalizacion: null };
  let opciones = f0.opciones || 4;
  let resta = f0.penalizacion == null ? 'nose' : f0.penalizacion === 0 ? 'no' : 'si';
  let nivel = e?.nivel || 'medio';
  const seg = (name, vals, actual) => `<div class="seg" data-seg="${name}">${vals.map(([v, t]) => `<button type="button" data-v="${v}" class="${String(v) === String(actual) ? 'on' : ''}">${t}</button>`).join('')}</div>`;
  const asig = LIB.asignaturas.find(x => x.id === asignaturaId);
  render(`
    <div class="screen lib">
      <div class="topbar"><button class="back-link" id="volver">✕ Cancelar</button></div>
      <h1>${e ? 'Editar examen' : 'Nuevo examen'}</h1>
      ${asig ? `<p class="muted small sub-h1">${asig.emoji} ${esc(asig.nombre)}</p>` : ''}
      <form class="form" id="f" novalidate>
        <label>Nombre<input name="nombre" maxlength="80" placeholder="Tema 1 · La célula" value="${esc(e?.nombre || '')}" autocomplete="off" required></label>
        <label>Fecha del examen<input name="fecha" type="date" class="${e?.fecha ? '' : 'vacio'}" value="${esc(e?.fecha || '')}"></label>
        <div class="campo"><span>Opciones por pregunta</span>${seg('opciones', [[3, '3'], [4, '4'], [5, '5']], opciones)}</div>
        <div class="campo"><span>¿Restan los fallos? ${why('b-resta')}</span>${seg('resta', [['no', 'No'], ['si', `Sí <small>−1/${opciones - 1} por fallo</small>`], ['nose', 'No lo sé']], resta)}</div>
        <div class="campo"><span>Nivel ${why('b-niveles')}</span>${seg('nivel', Object.values(NIVELES).map(n => [n.id, `${n.nombre} <small>${n.promete}</small>`]), nivel)}</div>
        ${e ? '' : '<p class="muted small">Después subes tus apuntes (fotos o PDF) y yo preparo las preguntas.</p>'}
        <p class="form-err" role="alert"></p>
        <button class="btn" type="submit">${e ? 'Guardar' : 'Crear examen'}</button>
        ${e ? '<button class="btn ghost peligro" type="button" id="borrar">Borrar examen</button>' : ''}
      </form>
    </div>`);
  const f = app.querySelector('#f');
  const volver = () => showAsignatura(asignaturaId || null);
  app.querySelector('#volver').onclick = volver;
  f.fecha.addEventListener('input', () => f.fecha.classList.toggle('vacio', !f.fecha.value));
  f.querySelectorAll('[data-seg] [data-v]').forEach(b => b.onclick = () => {
    const g = b.closest('[data-seg]').dataset.seg;
    if (g === 'opciones') { opciones = Number(b.dataset.v); f.querySelector('[data-seg=resta] [data-v=si]').innerHTML = `Sí <small>−1/${opciones - 1} por fallo</small>`; }
    if (g === 'resta') resta = b.dataset.v;
    if (g === 'nivel') nivel = b.dataset.v;
    b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  });
  f.onsubmit = async ev => {
    ev.preventDefault();
    const nombre = f.nombre.value.trim();
    if (!nombre) return (f.querySelector('.form-err').textContent = 'Ponle un nombre al examen.');
    const datos = {
      nombre, fecha: f.fecha.value || null, nivel,
      formato: { opciones, penalizacion: resta === 'nose' ? null : resta === 'no' ? 0 : 1 / (opciones - 1) },
      ...(e ? {} : { asignatura: asignaturaId || null }),
    };
    const r = await conConexion(() => (e ? api.editarExamen(e.id, datos) : api.crearExamen(datos)));
    if (!r) return;
    await cargarBiblioteca();
    if (!e) return showApuntes(LIB.examenes.find(x => x.id === r.id) || r);
    volver();
  };
  f.querySelector('#borrar')?.addEventListener('click', async () => {
    if (!(await confirmar({ titulo: `¿Borrar ${esc(e.nombre)}?`, texto: 'También se borrará tu progreso en este examen.', si: 'Borrar', peligro: true }))) return;
    if (!(await conConexion(() => api.borrarExamen(e.id)))) return;
    await cargarBiblioteca();
    volver();
  });
}

// ---------- Nota real (después del examen) ----------
function pedirNota(e) {
  if (!e) return;
  modal(`
    <div class="kai-row"><div class="kai-wrap">${kaiSVG('think')}</div><div class="bubble">¿Qué tal <b>${esc(e.nombre)}</b>? ¿Qué nota sacaste?</div></div>
    <form class="form" id="fn" novalidate>
      <label>Tu nota (de 0 a 10)<input name="nota" type="text" inputmode="decimal" autocomplete="off" placeholder="7,5" required></label>
      <p class="form-err" role="alert"></p>
      <button class="btn" type="submit">Guardar nota</button>
    </form>
    <button class="btn ghost" data-a="close">Aún no la sé</button>`, (el, close) => {
    el.querySelector('[data-a=close]').onclick = close;
    const f = el.querySelector('#fn');
    f.onsubmit = async ev => {
      ev.preventDefault();
      const n = Number(String(f.nota.value).replace(',', '.'));
      if (f.nota.value === '' || !Number.isFinite(n) || n < 0 || n > 10) return (f.querySelector('.form-err').textContent = 'Escribe una nota entre 0 y 10.');
      const prevision = e.resumen ? { rango: e.resumen.rango, nota: e.resumen.nota, nivel: e.nivel, respuestas: e.resumen.respuestas } : null;
      if (!(await conConexion(() => api.editarExamen(e.id, { nota_real: n, prevision })))) return;
      close();
      const r = prevision?.rango;
      const msg = !r ? '¡Apuntada! Gracias 💙'
        : n > r.max + 0.25 ? `¡Un ${fmtNota(n)}! Mejor de lo que esperaba (${fmtRango(r)}). ¡Enhorabuena! 🎉`
          : n < r.min - 0.25 ? `Vaya, esperaba ${fmtRango(r)}. Lo siento 😔 Me lo apunto para afinar mis previsiones.`
            : `¡Un ${fmtNota(n)}! Justo lo que calculaba (${fmtRango(r)}). ¡Enhorabuena! 🎉`;
      aviso(msg, 4500);
      showInicio();
    };
  });
}

// ---------- Calendario ----------
let mesVisto = 0; // 0 = este mes, 1 = el siguiente…
export function showCalendario(delta = null) {
  if (delta != null) mesVisto = delta;
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const ini = new Date(hoy.getFullYear(), hoy.getMonth() + mesVisto, 1);
  const diasMes = new Date(ini.getFullYear(), ini.getMonth() + 1, 0).getDate();
  const hueco = (ini.getDay() + 6) % 7; // lunes primero
  const clave = d => `${ini.getFullYear()}-${String(ini.getMonth() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const delMes = LIB.examenes.filter(e => e.fecha && e.fecha.startsWith(clave(1).slice(0, 7))).sort((x, y) => x.fecha < y.fecha ? -1 : 1);
  const celdas = [];
  for (let i = 0; i < hueco; i++) celdas.push('<span></span>');
  for (let d = 1; d <= diasMes; d++) {
    const ex = delMes.filter(e => e.fecha === clave(d));
    const esHoy = mesVisto === 0 && d === hoy.getDate();
    const a = ex[0] && asignaturaDe(ex[0]);
    celdas.push(`<span class="dia ${esHoy ? 'hoy' : ''} ${ex.length ? `examen c-${a?.color || 'gris'}` : ''}" ${ex.length ? `data-examen="${ex[0].id}"` : ''}>${d}${ex.length > 1 ? '<i>+</i>' : ''}</span>`);
  }
  const titulo = new Intl.DateTimeFormat('es-ES', { month: 'long', year: ini.getFullYear() !== hoy.getFullYear() ? 'numeric' : undefined }).format(ini);
  render(`
    <div class="screen lib">
      <div class="topbar"><h1 class="cap">${titulo}</h1><div class="mes-nav">${mesVisto ? '<button class="pill" id="hoy">Hoy</button>' : ''}<button class="icon-btn" id="prev" aria-label="Mes anterior">‹</button><button class="icon-btn" id="next" aria-label="Mes siguiente">›</button></div></div>
      <div class="card cal"><div class="cal-grid">${['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(x => `<b>${x}</b>`).join('')}${celdas.join('')}</div></div>
      <div class="section-title"><h2>Exámenes de ${titulo.split(' ')[0]}</h2></div>
      ${delMes.length ? delMes.map(e => {
        const a = asignaturaDe(e); const p = planDe(e); const dias = diasHasta(e.fecha);
        const plan = e.notaReal != null ? `Sacaste un ${fmtNota(e.notaReal)}` : dias < 0 ? 'Ya pasó' : e.estado === 'procesando' ? 'Preparando tus preguntas' : e.estado !== 'listo' ? 'Falta subir los apuntes'
          : p.listo ? '¡A punto! Un repaso corto de vez en cuando' : `Plan: ${p.minutosDia} min al día para llegar a ${nivelDe(e.nivel).nombre} ${why('b-plan', e.id)}`;
        return `<div class="card lib-ex" data-examen="${e.id}"><div class="lib-ex-top"><b>${fmtFecha(e.fecha, { day: 'numeric' })} · ${a ? `${esc(a.nombre)} · ` : ''}${esc(e.nombre)}</b>${dias >= 0 ? `<span class="pill ${dias <= 7 ? 'warn' : ''}">${fmtDias(dias)}</span>` : ''}</div><div class="muted small">${plan}</div></div>`;
      }).join('') : '<p class="muted">No hay exámenes este mes.</p>'}
      ${tabbar('calendario')}
    </div>`);
  bindComun();
  app.querySelector('#prev').onclick = () => showCalendario(mesVisto - 1);
  app.querySelector('#next').onclick = () => showCalendario(mesVisto + 1);
  app.querySelector('#hoy')?.addEventListener('click', () => showCalendario(0));
}

// ---------- Los "?" de la biblioteca ----------
export function explicarBiblioteca(key, arg) {
  const e = LIB.examenes.find(x => x.id === arg);
  switch (key) {
    case 'b-rec': {
      const rec = recomendar(LIB.examenes);
      if (!rec) return null;
      return {
        titulo: '¿Por qué este examen?',
        html: `<ul class="why-list">${rec.motivos.map(m => `<li>${m}</li>`).join('')}</ul>
          ${rec.otros.length ? `<p>Los demás pueden esperar un poco:</p><ul class="why-list">${rec.otros.map(o => `<li><b>${esc(o.examen.nombre)}</b>: ${o.texto}.</li>`).join('')}</ul>` : ''}
          <p class="muted small">Elijo lo que más aprieta: lo que tiene el examen más cerca y más trabajo pendiente para llegar a su objetivo.</p>`,
      };
    }
    case 'b-rango': return e?.resumen ? {
      titulo: '¿Por qué un rango?',
      html: `<p>Calculo que en <b>${esc(e.nombre)}</b> sacarías <b>${fmtRango(e.resumen.rango)}</b>${e.fecha ? ' el día del examen, contando lo que se olvida hasta entonces' : ''}.</p>
        <p>No te doy una nota exacta porque no puedo saberla: el rango se estrecha cuanto más estudias y con los simulacros. Prefiero quedarme corto a prometerte de más.</p>`,
    } : null;
    case 'b-plan': {
      if (!e) return null;
      const p = planDe(e);
      return {
        titulo: `¿Por qué ${p.minutosDia} min al día?`,
        html: `<p>${p.empezado ? `Para llegar al objetivo del nivel ${nivelDe(e.nivel).nombre} te quedan unas <b>${fmtTime(p.minutos)}</b> de estudio.` : `Aún no lo has empezado; calculo unas <b>${fmtTime(p.minutos)}</b> (lo afino en cuanto hagas el diagnóstico).`}</p>
          <p>Repartido entre los días que faltan (${p.dias != null ? fmtDias(p.dias) : 'sin fecha, cuento dos semanas'}) salen unos <b>${p.minutosDia} min al día</b>. Poco cada día rinde más que un atracón al final: lo repasado en días distintos se olvida menos.</p>`,
      };
    }
    case 'b-resta': return {
      titulo: '¿Por qué importa si restan?',
      html: `<p>Cambia mucho la nota. Con 4 opciones, acertar el 82 % sin penalización es un <b>8,2</b>; si cada fallo resta 1/3, es un <b>7,6</b>.</p>
        <p>Si no lo sabes, elige <b>No lo sé</b>: calcularé como si restaran, que es lo prudente. Lo puedes cambiar cuando lo sepas.</p>`,
    };
    case 'b-niveles': return {
      titulo: 'Fácil, Medio y Pro',
      html: `<ul class="why-list">${Object.values(NIVELES).map(n => `<li><b>${n.nombre}</b> (para un ${n.promete}): considero que estás a punto con una nota estimada de ${fmtNota(n.nota)}, el ${pct(n.cobertura)} % del temario visto y ${n.sims > 1 ? `${n.sims} simulacros` : 'un simulacro'} de ${fmtNota(n.notaSim)} o más.</li>`).join('')}</ul>
        <p class="muted small">Puedes subir de nivel cuando quieras sin perder nada de lo que llevas.</p>`,
    };
    default: return null;
  }
}

// ---------- Panel del administrador ----------
export async function showAdmin() {
  render(`<div class="screen lib" id="admin"><div class="topbar"><button class="back-link" id="volver">‹ Inicio</button></div><h1>Administración</h1><p class="muted">Cargando…</p>${tabbar('')}</div>`);
  app.querySelector('#volver').onclick = showInicio;
  bindComun();
  let r;
  try { r = await api.adminResumen(); } catch (e) { return aviso(e instanceof SinConexion ? 'Necesitas conexión' : e.message); }
  if (!app.querySelector('#admin')) return;
  const e = r.espacio;
  render(`
    <div class="screen lib" id="admin">
      <div class="topbar"><button class="back-link" id="volver">‹ Inicio</button></div>
      <h1>Administración</h1>
      <div class="card"><b>Espacio de apuntes</b>
        <div class="bar"><i style="width:${Math.min(100, pct(e.usado / e.tope))}%"></i></div>
        <span class="muted small">${fmtMB(e.usado)} de ${fmtMB(e.tope)} (tope para no salir de lo gratuito) · ${e.archivos} archivos · ${r.usuarios} usuarios</span></div>
      <div class="section-title"><h2>Por preparar (${r.pendientes.length})</h2></div>
      ${r.pendientes.length ? r.pendientes.map(p => `<div class="card lib-ex">
        <div class="lib-ex-top"><b>${esc(p.nombre)}</b><span class="pill info">${p.archivos} archivos · ${fmtMB(p.bytes)}</span></div>
        <span class="muted small">${esc(p.usuario)} (${esc(p.email)})${p.fecha ? ` · examen el ${fmtFecha(p.fecha)}` : ''} · enviado ${new Date(p.enviado).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</span>
        <code class="cmd">node tools/fabrica.mjs descargar ${esc(p.id)}</code></div>`).join('') : '<p class="muted">Nada pendiente 🎉</p>'}
      <button class="btn secondary" id="probar-aviso">📧 Enviar email de prueba</button>
      ${tabbar('')}
    </div>`);
  app.querySelector('#volver').onclick = showInicio;
  app.querySelector('#probar-aviso').onclick = async () => {
    if (await conConexion(() => api.probarAviso())) aviso('Enviado: mira tu bandeja de entrada 📬', 4000);
  };
  bindComun();
}

import { kaiSVG, setKaiMood } from './kai.js';
import { app, esc, render, modal, guardTaps, onRender, aviso } from './ui.js';
import { needsInstallHelp, inAppBrowser, isIPad, art1, artMore, art2, art3, art4 } from './installart.js';
import { CREADOR, VERSION } from './config.js';
import { api, SinConexion, SinSesion, sesionGuardada, guardarSesion, olvidarSesion } from './api.js';
import { createEngine, shuffle, secKey, pagKey, secName, fmtTime, SESSION_LEN, DIAG_LEN, SIM_LEN, MIN_FORECAST } from './engine/motor.js';
import { freshState, loadState, saveState, mergeState } from './engine/estado.js';
import { fmtNota, describeFormato } from './engine/nota.js';
import { why, explicacion, fmtRango } from './porque.js';
import { configurarBiblioteca, cargarBiblioteca, showInicio, showAsignatura, formExamen, showAdmin, explicarBiblioteca, olvidarBiblioteca } from './biblioteca.js';

// ------------------------------------------------------------------
// Configuración
// ------------------------------------------------------------------
let NAME = (sesionGuardada()?.user?.nombre || '').split(' ')[0]; // nombre de pila del usuario
const CREATOR = CREADOR;
const coma = () => (NAME ? `, ${NAME}` : ''); // "¡Genial, Cristina!" o "¡Genial!" si aún no sé su nombre
const hola = () => (NAME ? `¡Hola, <b>${esc(NAME)}</b>!` : '¡Hola!');

let EXAMEN;          // { id, nombre, formato, nivel, almacen, preguntas, documentos, resaltados }
let ASIGNATURA = null; // asignatura del examen abierto (para el botón de volver)
let E;               // motor de estudio del examen
let DATA;            // { temas, preguntas }
let Q = {};          // id -> pregunta
let S;               // estado persistente (el mismo objeto que usa el motor)
let sess = null;     // sesión de test en curso

// ------------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------------
const pct = x => Math.round(x * 100);
const rand = arr => arr[Math.floor(Math.random() * arr.length)];
const save = () => { saveState(EXAMEN.almacen, S); programarSync(); };
// Ruta privada (vía API) de una página del libro: "paginas/cap28-486.jpg" → "/api/examenes/…/paginas/cap28-486.jpg"
const urlPagina = p => `${EXAMEN.paginas}/${p.replace(/^paginas\//, '')}`;

// Atajos al motor (la lógica vive en engine/motor.js)
const conceptIds = f => E.conceptIds(f);
const seenCount = f => E.seenCount(f);
const failedIds = f => E.failedIds(f);
const sections = t => E.sections(t);
const mastered = id => E.mastered(id);
const qStats = f => E.qStats(f);
const remainingWork = () => E.remainingWork();
const hasForecast = () => E.hasForecast();
const readiness = () => E.readiness();
const record = (qid, ok) => E.record(qid, ok);
const pickConcept = (pool, recent, preferNew) => E.pickConcept(pool, recent, preferNew);
const pickQuestion = (cid, avoid) => E.pickQuestion(cid, avoid, sess?.filter?.pag);
const buildDiag = () => E.buildDiag();
const buildSim = () => E.buildSim();
const resetProgress = () => { S = freshState(); S.onboarded = true; S.reinicio = Date.now(); E.reset(S); sync(); };

// ------------------------------------------------------------------
// Frases de KAI
// ------------------------------------------------------------------
const okMsgs = () => ['¡Bien!', '¡Exacto!', '¡Eso es!', `¡Genial${coma()}!`, '¡Perfecto!', '¡Correcto!', '¡Muy bien!', '¡Toma ya! 💪'];
const KO_MSGS = ['¡Casi! Mira lo que dice el libro:', 'No pasa nada, te la vuelvo a preguntar pronto.', 'Ojo con esta, léela con calma:', 'Esta la repasamos otra vez en un ratito.'];

function homeMessage(r) {
  const failed = failedIds().length;
  if (S.paused.diag) return `Tienes el <b>diagnóstico</b> a medias. Pulsa <b>Continuar</b> para seguir donde lo dejaste.`;
  if (S.paused.sim) return `Tienes un <b>simulacro</b> a medias. Pulsa <b>Continuar</b> para terminarlo cuando quieras.`;
  if (!S.diag) return `Lo primero es el <b>diagnóstico</b>: ${DIAG_LEN} preguntas para saber qué sabes ya y enfocar bien la práctica. ¡Sin presión!`;
  if (r.ready) return `¡Lo tienes${coma()}!&nbsp;🎉 Estás <b>a punto para el examen</b>. Si quieres, sigue repasando un poquito para afianzar.`;
  const lastSim = S.sims.at(-1);
  const simFailed = lastSim && E.simNota(lastSim) < E.nivel.notaSim && lastSim.n >= S.n - SIM_LEN && failedIds().length > 0;
  if (simFailed) return `En el simulacro sacaste un <b>${fmtNota(E.simNota(lastSim))}</b>. Repasa los fallos y sigue estudiando un poco; luego vuelve a intentarlo&nbsp;💪`;
  const covered = r.temas.every(t => t.cov >= E.nivel.cobertura);
  if (r.nota >= E.nivel.nota && covered && r.lastSim === null) return `¡Calculo que sacarías <b>${fmtRango(r.rango)}</b>! Es el momento de hacer un <b>simulacro de examen</b>: es la pista más real.`;
  if (r.nota >= E.nivel.nota && !covered) return `Lo que has visto lo llevas genial (nota estimada: <b>${fmtRango(r.rango)}</b>). Sigue estudiando para cubrir más temario.`;
  if (failed >= 8) return `Tienes <b>${failed}</b> preguntas falladas pendientes. Si sigues estudiando te las iré repitiendo hasta que salgan solas.`;
  if (!hasForecast() || r.nota < 1) return `Vamos poco a poco. Pulsa <b>Seguir estudiando</b> y yo elijo las preguntas que más te convienen.`;
  return rand([`¡Vas muy bien! Si el examen fuera ahora, calculo que sacarías <b>${fmtRango(r.rango)}</b>.`, `Cada pregunta cuenta. ¡Sigue así${coma()}!&nbsp;💪`]);
}

// ------------------------------------------------------------------
// Pantallas
// ------------------------------------------------------------------
let readyTimer = null;
onRender(() => clearTimeout(readyTimer));

// ---------- Puerta de instalación (iPhone/iPad en Safari) ----------
// En iPhone la app solo se usa desde el icono de la pantalla de inicio: así el progreso
// nunca se reparte entre Safari y la app instalada. Desde Safari solo se enseña cómo instalarla.
const ALLOW_BROWSER = 'kai-allow-browser';
function browserAllowed() {
  if (/[?&]safari(&|$)/.test(location.search)) return true;
  try { return localStorage.getItem(ALLOW_BROWSER) === '1'; } catch (e) { return false; }
}
function installSteps() {
  if (inAppBrowser) return [
    { mood: 'wave happy', html: `<p>${hola()}&nbsp;👋</p><p>Soy <b>KAI</b>, tu robot de estudio.</p>` },
    { mood: 'think', end: true, html: `<p>Estás dentro de otra app y desde aquí no puedo funcionar.</p><p>Toca <b>···</b> (o la brújula) y elige <b>“Abrir en Safari”</b>. Allí te enseño cómo ponerme en tu pantalla de inicio&nbsp;📲</p>` },
  ];
  return [
    { mood: 'wave happy', html: `<p>${hola()}&nbsp;👋 Soy <b>KAI</b>, tu robot de estudio. ${CREATOR} me ha creado para ayudarte con tus exámenes&nbsp;💙</p><p>Venga, vamos a instalarme en tu <b>pantalla de inicio</b> para que me tengas siempre a mano. Te enseño&nbsp;📲</p>` },
    { art: art1, html: isIPad
        ? `<p><b>1.</b> Toca el botón <b>Compartir</b> (el cuadrado con la flecha hacia arriba), arriba a la derecha.</p>`
        : `<p><b>1.</b> Toca los tres puntos <b>···</b> abajo a la derecha y después <b>Compartir</b>.</p><p class="muted small">Si ya ves el botón Compartir (el cuadrado con la flecha) en la barra, tócalo directamente.</p>` },
    { art: artMore, html: `<p><b>2.</b> En el menú que se abre, toca otra vez los tres puntos <b>···</b> (“Más”) para ver todas las acciones.</p><p class="muted small">Si ya ves “Añadir a pantalla de inicio”, pasa al siguiente paso.</p>` },
    { art: art2, html: `<p><b>3.</b> Baja por la lista y toca <b>“Añadir a pantalla de inicio”</b>.</p>` },
    { art: art3, html: `<p><b>4.</b> Deja activado <b>“Abrir como app web”</b> (si aparece) y pulsa <b>Añadir</b>, arriba a la derecha.</p>` },
    { art: art4, end: true, html: `<p><b>¡Listo!</b>&nbsp;🎉 Ahora cierra Safari y <b>ábreme desde mi icono</b> en tu pantalla de inicio. ¡Allí te espero!</p>` },
  ];
}
function showInstallGate(i = 0) {
  const steps = installSteps();
  const st = steps[i];
  const dots = steps.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('');
  render(`
    <div class="screen onb">
      ${st.art ? `<div class="inst-art">${st.art}</div>` : `<div class="kai-big">${kaiSVG()}</div>`}
      <div class="bubble">${st.html}</div>
      <div class="dots">${dots}</div>
      <div class="btn-col">
        ${st.end
          ? `<button class="btn secondary" id="again">Ver los pasos otra vez</button>`
          : `<button class="btn" id="next">Siguiente</button>`}
        ${i > 0 ? '<button class="btn ghost" id="prev">Atrás</button>' : ''}
      </div>
    </div>`, st.mood);
  app.querySelector('#next')?.addEventListener('click', () => showInstallGate(i + 1));
  app.querySelector('#prev')?.addEventListener('click', () => showInstallGate(i - 1));
  app.querySelector('#again')?.addEventListener('click', () => showInstallGate(inAppBrowser ? 0 : 1));
  // Puerta trasera para pruebas: 5 toques seguidos sobre la ilustración del último paso
  if (st.end) {
    let taps = 0, t0 = 0;
    app.querySelector('.inst-art, .kai-big')?.addEventListener('click', () => {
      const now = Date.now();
      taps = now - t0 < 800 ? taps + 1 : 1;
      t0 = now;
      if (taps >= 5 && confirm('¿Usar KAI aquí en el navegador? (solo para pruebas: el progreso no se comparte con la app instalada)')) {
        try { localStorage.setItem(ALLOW_BROWSER, '1'); } catch (e) { /* sin almacenamiento */ }
        arrancar();
      }
    });
  }
}

// ---------- Onboarding ----------
function onboardingSteps() {
  const total = DATA.preguntas.length;
  const temas = DATA.temas.map(t => `<li><span class="n">${t.emoji}</span><span>${esc(t.nombre)} <span class="muted small">(${DATA.preguntas.filter(p => p.tema === t.id).length} preguntas)</span></span></li>`).join('');
  return [
    { mood: 'wave happy', html: `<p>${hola()}&nbsp;👋</p><p>Soy <b>KAI</b>, tu robot de estudio.</p>` },
    { mood: 'talk', html: `<p><b>${CREATOR}</b> me ha creado para ayudarte con tus estudios.</p><p>Me ha pedido que te cuide mucho&nbsp;💙</p>` },
    { mood: 'think', html: `<p>Me he leído tus apuntes de arriba abajo&nbsp;📚</p><ul class="steps-list">${temas}</ul><p>Las respuestas correctas y las citas salen <b>literalmente de tu libro</b>. No me invento nada.</p>` },
    { mood: 'talk', html: `<p>Así vamos a trabajar:</p><ul class="steps-list">
        <li><span class="n">1</span><span><b>Diagnóstico:</b> lo primero de todo. ${DIAG_LEN} preguntas para ver qué sabes y enfocar tu práctica.</span></li>
        <li><span class="n">2</span><span><b>Práctica inteligente:</b> te pregunto más lo que fallas, hasta que lo domines.</span></li>
        <li><span class="n">3</span><span><b>Simulacro:</b> un examen de prueba para comprobar que lo llevas a punto.</span></li></ul>` },
    { mood: 'happy', html: `<p>Después de cada respuesta te enseño <b>la frase exacta del libro</b> y su página.</p><p>Así también aprendes de los fallos&nbsp;😉</p>` },
    { mood: 'think', html: `<p>Para que sepas cómo vas, en el inicio te enseño:</p><ul class="steps-list">
        <li><span class="n">✅</span><span><b>% dominado:</b> preguntas que tienes bien ahora mismo. Empieza en 0% y es exacto.</span></li>
        <li><span class="n">🔮</span><span><b>Nota estimada:</b> lo que calculo que sacarías hoy, sobre 10. Aparece a partir de ${MIN_FORECAST} respuestas.</span></li>
        <li><span class="n">📝</span><span><b>Simulacros:</b> tu nota en un examen de prueba. Es la pista más real.</span></li></ul>
        <p class="muted small">Las notas las calculo como en un examen ${describeFormato(E.formato)}.</p>` },
    { mood: 'talk', html: `<p>Te diré <b>¡A punto para el examen!</b>&nbsp;🎉 cuando cumplas las 3 cosas:</p><ul class="steps-list">
        <li><span class="n">1</span><span>Haber respondido al menos el <b>${pct(E.nivel.cobertura)}%</b> de cada tema (unas ${remainingWork().left + qStats().seen} preguntas).</span></li>
        <li><span class="n">2</span><span>Una nota estimada de <b>${fmtNota(E.nivel.nota)}</b> o más.</span></li>
        <li><span class="n">3</span><span>Sacar de media un <b>${fmtNota(E.nivel.notaSim)}</b> o más en ${E.nivel.sims > 1 ? `tus ${E.nivel.sims} últimos simulacros` : 'un simulacro'}.</span></li></ul>
        <p>Calculo que te llevará unas <b>${fmtTime(remainingWork().minutes)}</b> en total.</p>` },
    { mood: 'happy', html: `<p>No hace falta hacerlo de golpe: <b>tu progreso se guarda solo</b> y puedes parar cuando quieras.</p><p>Y si no llegas a "a punto", no te agobies: cada pregunta que repasas suma. Fíjate en tu <b>% dominado</b> y en tus <b>simulacros</b>&nbsp;💙</p>` },
    S.diag
      ? { mood: 'wave happy', html: `<p>Tenemos <b>${total} preguntas</b> preparadas.</p><p>¡Seguimos cuando quieras!&nbsp;💪</p>`, last: true }
      : { mood: 'wave happy', html: `<p>Tenemos <b>${total} preguntas</b> preparadas.</p><p>¿Empezamos con el diagnóstico?</p>`, last: true },
  ];
}
function showOnboarding(i = 0) {
  const steps = onboardingSteps();
  const st = steps[i];
  const dots = steps.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('');
  render(`
    <div class="screen onb">
      <div class="kai-big">${kaiSVG()}</div>
      <div class="bubble">${st.html}</div>
      <div class="dots">${dots}</div>
      <div class="btn-col">
        ${st.last
          ? (S.diag
              ? `<button class="btn" id="go-home">Volver al inicio</button><button class="btn ghost" id="prev">Atrás</button>`
              : `<button class="btn" id="go-diag">¡Vamos!&nbsp;🚀</button><button class="btn ghost" id="go-home">Primero echo un vistazo</button><button class="btn ghost" id="prev">Atrás</button>`)
          : `<button class="btn" id="next">Siguiente</button>${i > 0 ? '<button class="btn ghost" id="prev">Atrás</button>' : '<button class="btn ghost" id="skip">Saltar presentación</button>'}`}
      </div>
    </div>`, st.mood);
  const finish = () => { S.onboarded = true; save(); };
  app.querySelector('#next')?.addEventListener('click', () => showOnboarding(i + 1));
  app.querySelector('#prev')?.addEventListener('click', () => showOnboarding(i - 1));
  app.querySelector('#skip')?.addEventListener('click', () => { finish(); showHome(); });
  app.querySelector('#go-home')?.addEventListener('click', () => { finish(); showHome(); });
  app.querySelector('#go-diag')?.addEventListener('click', () => { finish(); startSession('diag'); });
}

// ---------- Inicio ----------
function showHome() {
  const r = readiness();
  const all = qStats();
  const lock = S.diag ? '' : 'locked';
  const failed = failedIds().length;
  const checkInfo = c => c.id !== 'nota' || !hasForecast() ? c.info
    : r.futuro ? `ese día: ${fmtRango(r.rango)} · hoy: ${fmtRango(r.rangoHoy)} ${why('olvido')}` : `ahora: ${fmtRango(r.rango)}`;
  const checks = r.checks.map(c => `<li class="${c.ok ? 'done' : ''}"><span class="ck">${c.ok ? '✓' : ''}</span><span>${c.label} ${why(c.id)}<br><span class="muted small">${checkInfo(c)}</span></span></li>`).join('');
  const temas = r.temas.map(t => {
    const qs = qStats({ tema: t.id });
    const total = conceptIds({ tema: t.id }).length;
    const seen = seenCount({ tema: t.id });
    return `
      <div class="card tema ${S.diag ? '' : 'locked'}" data-tema="${t.id}">
        <div class="head">
          <div class="emoji">${t.emoji}</div>
          <div><div class="name">${esc(t.nombre)}</div><div class="meta">${esc(t.corto)} · ${qs.ok} bien de ${qs.total} · ${qs.seen} respondidas</div></div>
        </div>
        <div class="bar-row"><div class="bar"><i style="width:${pct(qs.pOk)}%"></i></div><span class="pct">${pct(qs.pOk)}%</span></div>
      </div>`;
  }).join('');

  const main = S.diag
    ? `<button class="btn" id="study">Seguir estudiando<span class="sub">KAI elige las preguntas por ti</span></button>`
    : `<button class="btn" id="diag">Empezar diagnóstico<span class="sub">${DIAG_LEN} preguntas · unos 5 minutos</span></button>`;

  render(`
    <div class="screen">
      <div class="topbar">
        <div><button class="back-link" id="biblio">‹ ${esc(ASIGNATURA?.nombre || 'Inicio')}</button><h1>${esc(EXAMEN.nombre)}</h1></div>
        <button class="icon-btn" id="menu" aria-label="Menú">⚙️</button>
      </div>

      <div class="kai-row">
        <div class="kai-wrap">${kaiSVG()}</div>
        <div class="bubble">${homeMessage(r)}</div>
      </div>

      <div class="card">
        <div class="ready-card">
          <div class="ring" style="--p:${pct(all.pOk)}; --c:${r.ready ? 'var(--ok)' : 'var(--primary)'}"><div class="val"><b>${pct(all.pOk)}%</b><span>dominado</span></div>${why('dominado')}</div>
          <div>
            <h3>${r.ready ? '¡A punto para el examen!&nbsp;🎉' : 'Preparación para el examen'}</h3>
            <p class="muted small" style="font-weight:700;margin-top:2px">${all.ok} de ${all.total} preguntas bien · ${all.seen}&nbsp;respondidas${hasForecast() ? ` · nota estimada${r.futuro ? ' para el examen' : ''}:&nbsp;<b>${fmtRango(r.rango)}</b>&nbsp;${why('rango')}` : ''}</p>
            <ul class="checks">${checks}</ul>
            <p class="muted small ready-note">Nivel ${E.nivel.nombre} (para un ${E.nivel.promete}) · notas sobre 10, ${describeFormato(E.formato)} ${why('nivel')}</p>
          </div>
        </div>
      </div>

      ${['diag', 'sim'].filter(t => S.paused[t]).map(t => `<div class="card resume">
        <div><b>Tienes ${t === 'sim' ? 'un simulacro' : 'el diagnóstico'} a medias</b><br><span class="muted small">Llevas ${S.paused[t].items.filter(it => it && it.chosen !== null).length} de ${S.paused[t].len} preguntas respondidas</span></div>
        <div class="btn-col"><button class="btn accent" data-resume="${t}">Continuar</button><button class="btn ghost" data-discard="${t}">Descartar</button></div>
      </div>`).join('')}

      ${main}

      <div class="grid2">
        <button class="tile ${lock}" id="fallos" ${failed || !S.diag ? '' : 'disabled'}><span class="ic">🔁</span><b>Repasar fallos${failed ? `<span class="badge">${failed}</span>` : ''}</b><span>Solo lo que has fallado</span></button>
        <button class="tile ${lock}" id="sim"><span class="ic">📝</span><b>Simulacro</b><span>${SIM_LEN} preguntas tipo examen, sin ayudas</span></button>
        <button class="tile" id="progress"><span class="ic">📚</span><b>Temario</b><span>Progreso y apuntes</span></button>
        <button class="tile" id="diag2"><span class="ic">🩺</span><b>Diagnóstico</b><span>${S.diag ? `Último: ${pct(S.diag.score)}%` : 'Ver qué sabes ya'}</span></button>
      </div>

      <div class="section-title"><h2>Temas</h2><span class="muted small">${S.diag ? 'Toca uno para practicarlo' : '🔒 Tras el diagnóstico'}</span></div>
      ${temas}

      <div class="footer">Hecho con 💙 por ${CREATOR} · KAI · versión ${VERSION}</div>
    </div>`, r.ready ? 'happy' : 'talk');

  app.querySelectorAll('[data-resume]').forEach(b => b.addEventListener('click', () => startSession(b.dataset.resume)));
  app.querySelectorAll('[data-discard]').forEach(b => b.addEventListener('click', () => {
    if (confirm(`¿Descartar ${b.dataset.discard === 'sim' ? 'el simulacro' : 'el diagnóstico'} a medias? Lo ya respondido sigue contando para tu repaso.`)) { delete S.paused[b.dataset.discard]; save(); showHome(); }
  }));
  app.querySelector('#study')?.addEventListener('click', () => startSession('practice'));
  app.querySelector('#diag')?.addEventListener('click', () => startSession('diag'));
  app.querySelector('#diag2').addEventListener('click', () => startSession('diag'));
  app.querySelector('#fallos').addEventListener('click', () => startSession('fallos'));
  app.querySelector('#sim').addEventListener('click', () => S.diag ? confirmSim() : showDiagRequired());
  app.querySelector('#progress').addEventListener('click', showProgress);
  app.querySelector('#menu').addEventListener('click', showMenu);
  app.querySelector('#biblio').addEventListener('click', salirAlInicio);
  app.querySelectorAll('.tema').forEach(el => el.addEventListener('click', () => startSession('practice', { tema: el.dataset.tema })));
}


// Los "?": KAI explica el porqué de cada dato (textos en porque.js)
function showWhy(key, arg) {
  const item = key === 'pregunta' ? sess?.items[sess.i]?.por : null;
  const ex = key.startsWith('b-') ? explicarBiblioteca(key, arg) : E ? explicacion(key, { E, r: readiness(), arg, item, nombre: NAME }) : null;
  if (!ex?.titulo) return;
  const { titulo, html } = ex;
  modal(`
    <div class="kai-row"><div class="kai-wrap">${kaiSVG()}</div><div class="bubble"><b>${titulo}</b></div></div>
    <div class="why-body">${html}</div>
    <button class="btn" data-a="close">¡Entendido!</button>`, (el, close) => {
    setKaiMood(el, 'talk');
    el.querySelector('[data-a=close]').onclick = close;
  });
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-why]');
  if (!b) return;
  e.preventDefault();
  e.stopPropagation();
  showWhy(b.dataset.why, b.dataset.arg);
}, true);

function showMenu() {
  modal(`
    <h2>${esc(EXAMEN.nombre)}</h2>
    <button class="btn secondary" data-a="editar">✏️ Fecha, formato y nivel</button>
    <button class="btn secondary" data-a="tuto">👋 Ver la presentación de KAI</button>
    <button class="btn secondary" data-a="reset">🗑️ Reiniciar mi progreso en este examen</button>
    <button class="btn ghost" data-a="close">Cerrar</button>`, (el, close) => {
    el.querySelector('[data-a=tuto]').onclick = () => { close(); showOnboarding(0); };
    el.querySelector('[data-a=editar]').onclick = async () => { close(); await sync(); formExamen(ASIGNATURA?.id || null, { ...EXAMEN }); };
    el.querySelector('[data-a=close]').onclick = close;
    el.querySelector('[data-a=reset]').onclick = () => {
      if (confirm('¿Seguro? Se borrará tu progreso en este examen y KAI empezará de cero.')) {
        resetProgress(); close(); showHome();
      }
    };
  });
}
function confirmSim() {
  const r = readiness();
  modal(`
    <h2>📝&nbsp;Simulacro de examen</h2>
    <p>${SIM_LEN} preguntas de todo el temario. <b>No verás si aciertas hasta el final</b>, como en el examen de verdad.</p>
    ${!hasForecast() || r.nota < 5 ? `<p class="muted">Consejo de KAI: rinde más cuando tu nota estimada pase del 5${hasForecast() ? ` (ahora: ${fmtNota(r.nota)})` : ''}. Pero puedes hacerlo cuando quieras.</p>` : ''}
    <button class="btn accent" data-a="go">Empezar simulacro</button>
    <button class="btn ghost" data-a="close">Ahora no</button>`, (el, close) => {
    el.querySelector('[data-a=go]').onclick = () => { close(); startSession('sim'); };
    el.querySelector('[data-a=close]').onclick = close;
  });
}

// ---------- Progreso ----------
let temarioTab = 'progreso';
let DOCS = null;
async function loadDocs() {
  if (DOCS) return DOCS;
  try { DOCS = await (await fetch(EXAMEN.documentos, { cache: 'no-cache' })).json(); } catch (e) { DOCS = []; }
  return DOCS;
}
const showProgress = () => showTemario(temarioTab);
async function showTemario(tab = 'progreso') {
  temarioTab = tab;
  const body = tab === 'apuntes' ? await apuntesHTML() : progresoHTML();
  render(`
    <div class="screen">
      <div class="topbar"><button class="icon-btn" id="back" aria-label="Volver">←</button><h2>Temario</h2><span style="width:44px;flex:0 0 44px"></span></div>
      <div class="seg" role="tablist">
        <button role="tab" data-tab="progreso" class="${tab === 'progreso' ? 'on' : ''}">📊 Progreso</button>
        <button role="tab" data-tab="apuntes" class="${tab === 'apuntes' ? 'on' : ''}">📚 Apuntes</button>
      </div>
      ${body}
    </div>`);
  app.querySelector('#back').onclick = showHome;
  app.querySelectorAll('.seg [data-tab]').forEach(b => b.addEventListener('click', () => b.dataset.tab !== temarioTab && showTemario(b.dataset.tab)));
  app.querySelectorAll('.sec-row').forEach(el => el.addEventListener('click', () => startSession('practice', { sec: el.dataset.sec })));
  app.querySelectorAll('.pg').forEach(el => el.addEventListener('click', () => openPage(el.dataset.tema, Number(el.dataset.pag))));
}
// Documentos subidos: páginas con sus preguntas, y aviso de páginas que faltan
async function apuntesHTML() {
  const docs = await loadDocs();
  const totalPags = docs.reduce((a, d) => a + d.paginas.length, 0);
  const cards = docs.map(d => {
    const t = DATA.temas.find(x => x.id === d.tema);
    const nq = DATA.preguntas.filter(p => p.tema === d.tema).length;
    const pages = d.paginas.map(pg => {
      const q = qStats({ pag: `${d.tema}-${pg}` });
      const cls = q.total === 0 ? 'none' : q.total < 5 ? 'few' : 'ok';
      return `<button class="pg" data-tema="${esc(d.tema)}" data-pag="${pg}" aria-label="Página ${pg}, ${q.total} preguntas">
        <img src="${urlPagina(`mini/${d.tema}-${pg}.jpg`)}" alt="" loading="lazy">
        <span class="pg-n">pág. ${pg}</span>
        <span class="pg-q ${cls}">${q.total ? `${q.total}&nbsp;preg.` : 'sin preg.'}</span>
        <i class="pg-bar"><i style="width:${pct(q.pOk)}%"></i></i>
      </button>`;
    }).join('');
    const faltan = d.faltan?.length
      ? `<div class="doc-warn">⚠️ ${d.faltan.length === 1 ? `Falta la <b>pág. ${d.faltan[0]}</b>` : `Faltan las <b>págs. ${d.faltan.join(', ')}</b>`} dentro de este documento. Si tiene contenido de examen, habría que subirla.</div>`
      : `<div class="doc-ok">✅ Páginas completas, sin huecos <span style="white-space:nowrap">(págs. ${d.paginas[0]}–${d.paginas.at(-1)})</span>.</div>`;
    return `<div class="card doc">
      <h3>${t?.emoji || '📄'} ${esc(t?.nombre || d.titulo)}</h3>
      <p class="muted small">${esc(d.titulo)} · ${esc(d.origen)}<br><b>${d.paginas.length} páginas · ${nq} preguntas</b></p>
      ${faltan}
      <div class="pg-grid">${pages}</div>
    </div>`;
  }).join('');
  return `
    <p class="muted">Los documentos con los que KAI hace las preguntas: <b>${docs.length} documentos · ${totalPags} páginas · ${DATA.preguntas.length} preguntas</b>. Toca una página para verla entera y practicar solo esa página.</p>
    <div class="pg-legend"><span><i class="ok"></i>5 o más preguntas</span><span><i class="few"></i>menos de 5</span><span><i class="none"></i>sin preguntas</span></div>
    ${cards}`;
}
function progresoHTML() {
  const blocks = DATA.temas.map(t => {
    const rows = sections(t.id).map(sec => {
      const q = qStats({ sec });
      return `<div class="sec-row" data-sec="${esc(sec)}">
        <div class="t">${esc(secName(sec))} <span>${pct(q.pOk)}%</span></div>
        <div class="bar"><i style="width:${pct(q.pOk)}%"></i></div>
        <div class="sec-nums"><span>✅ ${q.ok} bien</span><span>❌ ${q.ko} mal</span><span>⏳ ${q.total - q.seen} sin ver</span><span>de ${q.total}</span></div>
      </div>`;
    }).join('');
    const tq = qStats({ tema: t.id });
    return `<div class="card"><h3>${t.emoji} ${esc(t.nombre)}</h3><p class="muted small" style="margin:4px 0 6px">${esc(t.fuente || '')} · <b>${tq.ok}/${tq.total} bien (${pct(tq.pOk)}%)</b></p>${rows}</div>`;
  }).join('');
  return `
      <p class="muted">El porcentaje es exacto: preguntas que tienes <b>bien</b> (la última vez que te salieron, las acertaste) sobre el total del apartado. Toca un apartado para practicarlo.</p>
      ${blocks}`;
}

// ---------- Sesión de test ----------
function showDiagRequired() {
  modal(`
    <div class="kai-row"><div class="kai-wrap">${kaiSVG('happy')}</div><div class="bubble">¡Primero el <b>diagnóstico</b>!&nbsp;🩺</div></div>
    <p>Son ${DIAG_LEN} preguntas de todos los apartados. Con ellas sé qué dominas ya y qué no, y así la práctica se centra desde el principio en lo que más te hace falta.</p>
    <button class="btn" data-a="go">${S.paused.diag ? 'Continuar el diagnóstico' : 'Empezar el diagnóstico'}</button>
    <button class="btn ghost" data-a="close">Ahora no</button>`, (el, close) => {
    el.querySelector('[data-a=go]').onclick = () => { close(); startSession('diag'); };
    el.querySelector('[data-a=close]').onclick = close;
  });
}
function startSession(type, filter = {}) {
  if (!S.diag && type !== 'diag') return showDiagRequired();
  if (S.paused[type]) return resumeSession(type); // diagnóstico/simulacro a medias: seguir donde se dejó
  S.cur = null;
  let fixed = null;
  let pool = conceptIds(filter);
  if (!pool.length) return showHome();
  let len = Math.min(SESSION_LEN, Math.max(5, pool.length * 2));
  if (type === 'diag') { fixed = buildDiag(); len = fixed.length; }
  if (type === 'sim') { fixed = buildSim(); len = fixed.length; }
  if (type === 'fallos') {
    fixed = shuffle(failedIds()).slice(0, SESSION_LEN).map(cid => pickQuestion(cid));
    len = fixed.length;
    if (!len) return showHome();
  }
  sess = { type, filter, pool, fixed, len, i: 0, items: [], recent: [], reins: {}, startMastered: new Set(conceptIds().filter(mastered)) };
  try { history.pushState({ kai: 'quiz' }, ''); } catch (e) { /* sin historial */ }
  nextQuestion();
}

// Guarda la ronda en curso: si Safari cierra la pestaña, se puede continuar
function persistSess() {
  if (!sess) return;
  const { type, filter, fixed, len, i, items, reins } = sess;
  S.cur = { type, filter, fixed, len, i, items, reins, startMastered: [...sess.startMastered] };
  save();
}
function resumeSession(type) {
  const c = S.paused[type];
  delete S.paused[type];
  if (!c || !c.items?.length) { save(); return showHome(); }
  S.cur = c;
  sess = { ...c, pool: conceptIds(c.filter || {}), recent: [], startMastered: new Set(c.startMastered || []) };
  const it = sess.items[sess.i];
  if (it && it.chosen !== null) sess.i++; // la última ya estaba respondida
  try { history.pushState({ kai: 'quiz' }, ''); } catch (e) { /* sin historial */ }
  nextQuestion();
}
const PAUSABLE = ['diag', 'sim'];
function pauseCurrent() {
  // Guarda el diagnóstico/simulacro en curso para retomarlo luego (si ya se ha respondido algo)
  const c = S.cur;
  if (c && PAUSABLE.includes(c.type) && c.items?.some(it => it && it.chosen !== null)) S.paused[c.type] = c;
  S.cur = null;
}
function quitSession() {
  if (sess) persistSess();
  pauseCurrent();
  sess = null;
  save();
  showHome();
}
// Botón/gesto "atrás" durante una ronda: preguntar antes de salir
window.addEventListener('popstate', () => {
  if (ignorePop) { ignorePop = false; return; }
  if (viewerEl) return closeBook(true);
  if (!sess || !app.querySelector('.qtop')) return;
  quitSession();
});

function nextQuestion() {
  if (!sess) return;
  if (sess.i >= sess.len) return showResults();
  if (sess.items[sess.i] && sess.items[sess.i].chosen === null) return renderQuestion(); // continuar ronda guardada
  let qid;
  if (sess.fixed) qid = sess.fixed[sess.i];
  else {
    const prevItem = sess.items[sess.i - 1];
    const cid = pickConcept(sess.pool, sess.recent, !!prevItem && !prevItem.wasNew);
    qid = pickQuestion(cid, prevItem?.qid);
  }
  const q = Q[qid];
  const prev = S.c[q.concepto];
  sess.recent = [q.concepto, ...sess.recent].slice(0, Math.min(4, Math.max(1, sess.pool.length - 1)));
  const motivo = sess.fixed ? (sess.type === 'fallos' ? { motivo: 'fallo' } : null) : { motivo: E.lastPick?.motivo, recuerdo: E.lastPick?.recuerdo };
  sess.items[sess.i] = { qid, order: shuffle([0, 1, 2, 3]), chosen: null, ok: null, wasNew: !prev, wasFailed: prev?.lastOk === false, ...(motivo ? { por: motivo } : {}) };
  persistSess();
  renderQuestion();
}

function renderQuestion() {
  const it = sess.items[sess.i];
  const q = Q[it.qid];
  const tema = DATA.temas.find(t => t.id === q.tema);
  const labels = { practice: 'Práctica', diag: 'Diagnóstico', fallos: 'Repaso de fallos', sim: 'Simulacro' };
  const chips = [
    `<span class="chip">${tema?.emoji || ''} ${esc(q.seccion)}</span>`,
    sess.type !== 'sim' && it.wasFailed ? `<span class="chip warn">🔁 La fallaste antes</span>` : '',
    sess.type !== 'sim' && it.wasNew && S.diag ? `<span class="chip new">✨ Nueva</span>` : '',
    it.por ? `<button class="chip why-chip" data-why="pregunta">🤔 ¿Por qué esta?</button>` : '',
  ].join('');
  const opts = it.order.map((oi, k) => `
    <button class="opt" data-k="${k}"><span class="letter">${'ABCD'[k]}</span><span>${esc(q.opciones[oi])}</span></button>`).join('');

  render(`
    <div class="screen">
      <div class="qtop">
        <button class="close" id="quit" aria-label="Salir">✕</button>
        <div class="bar"><i style="width:${pct(sess.i / sess.len)}%"></i></div>
        <span class="count">${sess.i + 1}/${sess.len}</span>
      </div>
      <div class="muted small" style="font-weight:800">${labels[sess.type]}${sess.filter?.tema ? ' · ' + esc(DATA.temas.find(t => t.id === sess.filter.tema)?.corto || '') : ''}${sess.filter?.sec ? ' · ' + esc(DATA.temas.find(t => sess.filter.sec.startsWith(t.id + '|'))?.corto || '') + ' · ' + esc(secName(sess.filter.sec)) : ''}${sess.filter?.pag ? ' · ' + esc(DATA.temas.find(t => sess.filter.pag.startsWith(t.id + '-'))?.corto || '') + ' · pág. ' + esc(sess.filter.pag.split('-').pop()) : ''}</div>
      <div class="qmeta">${chips}</div>
      <div class="question">${esc(q.pregunta)}</div>
      <div class="options">${opts}</div>
      <div id="fb"></div>
    </div>`);

  app.querySelector('#quit').onclick = quitSession;
  sess.readyAt = Date.now() + 350; // ignora toques que llegan pegados al cambio de pregunta
  app.querySelectorAll('.opt').forEach(b => b.addEventListener('click', () => answer(Number(b.dataset.k))));
}

function answer(k) {
  if (!sess || Date.now() < sess.readyAt) return;
  const it = sess.items[sess.i];
  if (it.chosen !== null) return;
  const q = Q[it.qid];
  const btns = [...app.querySelectorAll('.opt')];

  // Simulacro: marca la elegida (se puede cambiar) y se confirma con "Siguiente"
  if (sess.type === 'sim') {
    btns.forEach((b, i) => b.classList.toggle('selected', i === k));
    const fb = app.querySelector('#fb');
    if (!fb.querySelector('#next')) {
      fb.innerHTML = `<div class="sticky-bottom"><button class="btn" id="next">${sess.i + 1 >= sess.len ? 'Terminar simulacro' : 'Siguiente'}</button></div>`;
      guardTaps(fb);
      fb.querySelector('#next').onclick = () => {
        if (!sess || it.chosen !== null) return;
        const sel = btns.findIndex(b => b.classList.contains('selected'));
        it.chosen = it.order[sel];
        it.ok = it.chosen === q.correcta;
        record(it.qid, it.ok);
        sess.i++;
        persistSess();
        nextQuestion();
      };
    }
    return;
  }

  it.chosen = it.order[k];
  it.ok = it.chosen === q.correcta;
  record(it.qid, it.ok);
  btns.forEach(b => b.disabled = true);

  const correctK = it.order.indexOf(q.correcta);
  btns.forEach((b, i) => {
    if (i === correctK) b.classList.add('correct');
    else if (i === k) b.classList.add('wrong');
    else b.classList.add('dim');
  });

  // En "repasar fallos", si vuelve a fallar se repite más adelante en la misma ronda
  const reins = sess.reins[q.concepto] || 0;
  if (sess.type === 'fallos' && !it.ok && reins < 2 && sess.len < 25 && sess.fixed.length - sess.i > 1) {
    sess.reins[q.concepto] = reins + 1;
    sess.fixed.splice(Math.min(sess.i + 4, sess.fixed.length), 0, pickQuestion(q.concepto, it.qid));
    sess.len = sess.fixed.length;
  }
  persistSess();

  const fb = app.querySelector('#fb');
  fb.innerHTML = `
    <div class="feedback ${it.ok ? 'ok' : 'ko'}">
      <div class="fb-head"><div class="mini-kai">${kaiSVG()}</div><span>${it.ok ? rand(okMsgs()) : rand(KO_MSGS)}</span></div>
      <div class="quote">📖&nbsp;${fmtQuote(q.fuente)}<span class="src">${esc(sourceLabel(q))}</span></div>
      <button class="book-btn" data-q="${esc(q.id)}">🔎 Llévame al libro</button>
    </div>
    <div class="sticky-bottom"><button class="btn" id="next">${sess.i + 1 >= sess.len ? 'Ver resultados' : 'Siguiente'}</button></div>`;
  setKaiMood(fb, it.ok ? 'happy thumbs' : 'facepalm');
  // Racha de aciertos seguidos en esta ronda (KAI hace una voltereta cada 5)
  sess.streak = it.ok ? (sess.streak || 0) + 1 : 0;
  if (it.ok) setTimeout(() => window.kaiFun?.streak(sess?.streak || 0), 250);
  fb.querySelector('#next').onclick = () => { if (!sess) return; sess.i++; nextQuestion(); };
  fb.querySelector('.book-btn').onclick = () => openBook(q.id);
  guardTaps(fb);
  // Desplaza lo justo para ver la corrección, sin sacar la pregunta de la pantalla
  setTimeout(() => {
    const top = fb.getBoundingClientRect().top;
    const qTop = app.querySelector('.question')?.getBoundingClientRect().top ?? 0;
    const need = top - window.innerHeight * 0.55;
    if (need > 0) window.scrollBy({ top: Math.min(need, Math.max(0, qTop - 8)), behavior: 'smooth' });
  }, 60);
}

// ---------- Visor "Llévame al libro": la página original con la frase subrayada ----------
let HL = null; // resaltados: id -> { img, rects: [[x, y, w, h] en fracción] }
async function loadHighlights() {
  if (HL) return HL;
  try { HL = await (await fetch(EXAMEN.resaltados, { cache: 'no-cache' })).json(); } catch (e) { HL = {}; }
  return HL;
}
let viewerEl = null;
let lockedY = 0;
function lockScroll() {
  lockedY = window.scrollY;
  Object.assign(document.body.style, { position: 'fixed', top: `-${lockedY}px`, left: '0', right: '0', overflow: 'hidden' });
}
function unlockScroll() {
  Object.assign(document.body.style, { position: '', top: '', left: '', right: '', overflow: '' });
  window.scrollTo(0, lockedY);
}
let ignorePop = false; // el history.back() que hacemos al cerrar el visor no debe tocar el test
function closeBook(fromPop = false) {
  if (!viewerEl) return;
  viewerEl.remove();
  viewerEl = null;
  unlockScroll();
  if (!fromPop) { ignorePop = true; try { history.back(); } catch (e) { ignorePop = false; } }
}
async function openBook(qid) {
  const q = Q[qid];
  if (!q || viewerEl) return;
  const hl = (await loadHighlights())[qid] || {};
  const img = urlPagina(hl.img || `${q.tema}-${q.pagina}.jpg`);
  const rects = hl.rects || [];
  const pag = (img.match(/-(\d+)\.jpg$/) || [])[1] || q.pagina;
  const t = DATA.temas.find(x => x.id === q.tema);
  openViewer({
    img, rects,
    title: `${t ? t.corto : ''} · pág. ${pag}`,
    sub: `${rects.length ? 'Subrayado en amarillo' : 'La frase está en esta página'} · pellizca para hacer zoom`,
    footer: `📖&nbsp;${fmtQuote(q.fuente)}`,
  });
}
function openPage(tema, pagina) {
  if (viewerEl) return;
  const t = DATA.temas.find(x => x.id === tema);
  const key = `${tema}-${pagina}`;
  const n = qStats({ pag: key }).total;
  openViewer({
    img: urlPagina(`${key}.jpg`), rects: [],
    title: `${t ? t.corto : ''} · pág. ${pagina}`,
    sub: `${n} ${n === 1 ? 'pregunta' : 'preguntas'} · pellizca para hacer zoom`,
    footer: n ? `<button class="btn" data-a="practice">🎯 Practicar esta página (${n})</button>` : `<p class="muted small" style="margin:0">Esta página no tiene preguntas.</p>`,
    onPractice: () => { closeBook(); setTimeout(() => startSession('practice', { pag: key }), 150); },
  });
}
function openViewer({ img, rects, title, sub, footer, onPractice }) {
  viewerEl = document.createElement('div');
  viewerEl.className = 'viewer';
  viewerEl.innerHTML = `
    <div class="v-top">
      <button class="v-back" data-a="close" aria-label="Volver">← Volver</button>
      <div class="v-title"><b>${esc(title)}</b><span>${esc(sub)}</span></div>
      <div class="v-zoom"><button class="icon-btn" data-a="out" aria-label="Alejar">−</button><button class="icon-btn" data-a="in" aria-label="Acercar">+</button></div>
    </div>
    <div class="v-scroll"><div class="v-page">
      <img src="${esc(img)}" alt="Página del libro" decoding="sync">
      ${rects.map(([x, y, w, h]) => `<i class="v-hl" style="left:${x * 100}%;top:${y * 100}%;width:${w * 100}%;height:${h * 100}%"></i>`).join('')}
    </div></div>
    <div class="v-quote">${footer}</div>`;
  if (onPractice) viewerEl.querySelector('[data-a=practice]')?.addEventListener('click', onPractice);
  document.body.appendChild(viewerEl);
  lockScroll();
  guardTaps(viewerEl);
  try { history.pushState({ kai: 'book' }, ''); } catch (e) { /* sin historial */ }

  const scroller = viewerEl.querySelector('.v-scroll');
  const page = viewerEl.querySelector('.v-page');
  const im = page.querySelector('img');
  const MIN_Z = 1, MAX_Z = 5;
  let zoom = 1;
  // Cambia el zoom manteniendo fijo el punto (cx, cy) de la pantalla (coordenadas dentro del visor)
  const setZoom = (z, cx = scroller.clientWidth / 2, cy = scroller.clientHeight / 2) => {
    z = Math.min(MAX_Z, Math.max(MIN_Z, z));
    const fx = (scroller.scrollLeft + cx) / page.clientWidth;
    const fy = (scroller.scrollTop + cy) / page.clientHeight;
    zoom = z;
    page.style.width = `${zoom * 100}%`;
    scroller.scrollLeft = fx * page.clientWidth - cx;
    scroller.scrollTop = fy * page.clientHeight - cy;
  };
  const focusHighlight = () => {
    // Acerca y centra la vista en el primer subrayado
    const r = rects[0];
    if (!r) return;
    zoom = 2;
    page.style.width = '200%';
    const W = page.clientWidth, H = page.clientHeight;
    scroller.scrollLeft = Math.max(0, (r[0] + r[2] / 2) * W - scroller.clientWidth / 2);
    scroller.scrollTop = Math.max(0, (r[1] + r[3] / 2) * H - scroller.clientHeight / 2);
  };
  im.onload = () => requestAnimationFrame(focusHighlight);
  if (im.complete) requestAnimationFrame(focusHighlight);
  im.onerror = () => { scroller.innerHTML = '<p class="muted" style="padding:24px;text-align:center">No he podido cargar la página. Comprueba la conexión.</p>'; };
  viewerEl.querySelector('[data-a=close]').onclick = () => closeBook();
  viewerEl.querySelector('[data-a=in]').onclick = () => setZoom(zoom * 1.4);
  viewerEl.querySelector('[data-a=out]').onclick = () => setZoom(zoom / 1.4);

  // Pellizcar con dos dedos para hacer zoom; doble toque para acercar/alejar
  const local = t => { const b = scroller.getBoundingClientRect(); return [t.clientX - b.left, t.clientY - b.top]; };
  const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  let pinch = null, lastTap = 0;
  scroller.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const [a, b] = e.touches;
      pinch = { d0: dist(a, b), z0: zoom };
    }
  }, { passive: false });
  scroller.addEventListener('touchmove', e => {
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault();
    const [a, b] = e.touches;
    const [ax, ay] = local(a), [bx, by] = local(b);
    setZoom(pinch.z0 * dist(a, b) / pinch.d0, (ax + bx) / 2, (ay + by) / 2);
  }, { passive: false });
  scroller.addEventListener('touchend', e => {
    if (pinch && e.touches.length < 2) { pinch = null; return; }
    if (e.touches.length || e.changedTouches.length !== 1) return;
    const now = Date.now();
    if (now - lastTap < 300) {
      const [x, y] = local(e.changedTouches[0]);
      setZoom(zoom > 1.3 ? 1 : 2.5, x, y);
      lastTap = 0;
    } else lastTap = now;
  });
  // Safari: evita que el pellizco haga zoom de toda la página
  ['gesturestart', 'gesturechange'].forEach(ev => viewerEl.addEventListener(ev, e => e.preventDefault()));
  // Ordenador: rueda del ratón con Ctrl (o gesto del trackpad) para hacer zoom
  scroller.addEventListener('wheel', e => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const [x, y] = local(e);
    setZoom(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), x, y);
  }, { passive: false });
}

// Cita del libro: si es un fragmento que empieza a mitad de frase, se marca con «…»
function fmtQuote(f) {
  const t = String(f).trim();
  const frag = /^[a-záéíóúñü(]/.test(t);
  return `«${frag ? '…' : ''}${esc(t)}»`;
}
function sourceLabel(q) {
  const t = DATA.temas.find(x => x.id === q.tema);
  return `${t ? t.corto : ''} · pág. ${q.pagina}`;
}

// ---------- Resultados ----------
function showResults() {
  const items = sess.items.filter(it => it.chosen !== null);
  const okN = items.filter(it => it.ok).length;
  const score = items.length ? okN / items.length : 0;
  const newlyMastered = conceptIds().filter(id => mastered(id) && !sess.startMastered.has(id)).length;
  const domNow = qStats().pOk;

  if (sess.type === 'diag') {
    S.diag = { date: Date.now(), score };
  }
  if (sess.type === 'sim') S.sims.push({ date: Date.now(), score, ok: okN, total: items.length, n: S.n });
  S.cur = null;
  save();

  const r = readiness();
  const simNota = E.simNota({ score });
  let title, mood, msg;
  if (sess.type === 'sim') {
    const passed = simNota >= E.nivel.notaSim;
    title = passed ? '¡Simulacro aprobado!&nbsp;🎉' : 'Simulacro terminado';
    mood = passed ? 'celebrate' : 'think';
    msg = passed ? `¡Has sacado un ${fmtNota(simNota)}! Eso es nivel examen.` : `Has sacado un ${fmtNota(simNota)}. Necesitas un ${fmtNota(E.nivel.notaSim)} para darlo por superado. Repasa los fallos de abajo y vuelve a intentarlo.`;
  } else if (sess.type === 'diag') {
    title = 'Diagnóstico completado&nbsp;🩺';
    mood = 'happy';
    msg = score >= 0.7 ? `¡Partes de un ${pct(score)}%! Ya sabes mucho. Ahora vamos a pulir lo que falta.`
      : `Has acertado un ${pct(score)}%. ¡Perfecto para empezar! Ya sé por dónde tenemos que ir.`;
  } else if (sess.type === 'fallos' && !failedIds().length) {
    title = '¡Fallos corregidos!&nbsp;🎉';
    mood = 'celebrate';
    msg = 'Has corregido todos tus fallos pendientes. ¡Así se hace! Sigue estudiando para ver temario nuevo.';
  } else {
    title = score >= 0.8 ? '¡Rondón!&nbsp;🔥' : score >= 0.5 ? '¡Buena ronda!' : 'Ronda terminada';
    mood = score >= 0.5 ? 'happy' : 'talk';
    msg = score >= 0.8 ? `Un ${pct(score)}% de aciertos. ¡Estás que te sales!` : score >= 0.5 ? 'Vas por buen camino. Los fallos te los volveré a preguntar.' : 'Sin agobios: justo para esto estamos. Lo que has fallado volverá hasta que te salga solo.';
  }

  const diagSecs = sess.type === 'diag' ? (() => {
    const bySec = {};
    for (const it of items) { const s = secKey(Q[it.qid]); (bySec[s] ||= [0, 0]); bySec[s][1]++; if (it.ok) bySec[s][0]++; }
    return `<div class="card"><h3>Cómo vas por apartados</h3>${Object.entries(bySec).map(([s, [o, t]]) =>
      `<div class="sec-row" style="cursor:default"><div class="t">${esc(secName(s))} <span>${o}/${t}</span></div><div class="bar ${o / t < 0.6 ? 'warn' : ''}"><i style="width:${pct(o / t)}%"></i></div></div>`).join('')}</div>`;
  })() : '';

  const seenWrong = new Set();
  const wrong = items.filter(it => !it.ok && !seenWrong.has(it.qid) && seenWrong.add(it.qid));
  const review = wrong.length ? `
    <div class="section-title"><h2>${sess.type === 'sim' ? 'Repasa estos fallos' : 'Lo que has fallado'}</h2></div>
    ${wrong.map(it => {
      const q = Q[it.qid];
      return `<div class="card review-item">
        <div class="q">${esc(q.pregunta)}</div>
        <div class="a ko">✗ Tu respuesta: ${esc(q.opciones[it.chosen])}</div>
        <div class="a ok">✓ Correcta: ${esc(q.opciones[q.correcta])}</div>
        <div class="quote">📖&nbsp;${fmtQuote(q.fuente)}<span class="src">${esc(sourceLabel(q))}</span></div>
        <button class="book-btn" data-q="${esc(q.id)}">🔎 Llévame al libro</button>
      </div>`;
    }).join('')}` : '';

  const pending = failedIds().length;
  let again = { practice: 'Otra ronda', diag: 'Empezar a practicar', fallos: 'Seguir repasando fallos', sim: 'Repetir simulacro' }[sess.type];
  let againType = sess.type;
  if (sess.type === 'sim' && simNota < E.nivel.notaSim && pending) { again = `Repasar fallos (${pending} pendientes)`; againType = 'fallos'; }
  if (sess.type === 'fallos' && !pending) { again = 'Seguir estudiando'; againType = 'practice'; }
  if (sess.type === 'diag') againType = 'practice';

  render(`
    <div class="screen">
      <div class="result-hero">
        <div class="kai-mid">${kaiSVG()}</div>
        <h1>${title}</h1>
        <div class="big-score">${okN}/${items.length}</div>
        <p class="muted">${msg}</p>
      </div>
      <div class="stats">
        ${sess.type === 'sim'
          ? `<div class="stat"><b>${fmtNota(simNota)}</b><span>nota</span></div>`
          : `<div class="stat"><b>${pct(score)}%</b><span>aciertos</span></div>`}
        <div class="stat"><b>+${newlyMastered}</b><span>nuevas sabidas</span></div>
        <div class="stat"><b>${pct(domNow)}%</b><span>dominado</span></div>
      </div>
      <div class="btn-col">
        <button class="btn" id="again">${again}</button>
        <button class="btn secondary" id="home">Volver al inicio</button>
      </div>
      ${diagSecs}
      ${review}
    </div>`, mood);

  const filter = againType === sess.type ? sess.filter : {};
  sess = null;
  app.querySelector('#again').onclick = () => startSession(againType, filter);
  app.querySelectorAll('.book-btn').forEach(b => b.onclick = () => openBook(b.dataset.q));
  app.querySelector('#home').onclick = () => (r.ready && !S.readyShown) ? showReady() : showHome();
  if (r.ready && !S.readyShown) readyTimer = setTimeout(showReady, 2200);
}

// ---------- ¡Estás lista! ----------
function showReady() {
  if (S.readyShown) return;
  S.readyShown = true;
  save();
  const r = readiness();
  render(`
    <div class="screen onb ready-screen">
      <div class="kai-big">${kaiSVG()}</div>
      <div class="bubble">
        <p style="font-size:24px"><b>¡A punto para el examen${coma()}!</b>&nbsp;🎉</p>
        <p>Calculo que sacarás <b>${fmtRango(r.rango)}</b> y en los simulacros vas con un <b>${fmtNota(r.lastSim)}</b>.</p>
        <p>Ya puedes dejar de estudiar e ir al examen con calma. ¡Vas a bordarlo!</p>
        <p>Estoy muy orgulloso de ti&nbsp;💙</p>
      </div>
      <div class="btn-col"><button class="btn" id="ok">¡Gracias, KAI!&nbsp;🤖</button></div>
    </div>`, 'celebrate');
  confetti();
  app.querySelector('#ok').onclick = showHome;
}
function confetti() {
  const box = document.createElement('div');
  box.className = 'confetti';
  const colors = ['#0FA38C', '#F2A93B', '#EF4444', '#60A5FA', '#A78BFA', '#34D399', '#FB7185'];
  for (let i = 0; i < 90; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = rand(colors);
    p.style.animationDuration = 2.2 + Math.random() * 2.5 + 's';
    p.style.animationDelay = Math.random() * 1.2 + 's';
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    box.appendChild(p);
  }
  document.body.appendChild(box);
  setTimeout(() => box.remove(), 6500);
}

// ------------------------------------------------------------------
// Arranque
// ------------------------------------------------------------------
// ---------- Actualizaciones: nunca usar una versión antigua ----------
// version.json se publica con cada cambio; si no coincide con VERSION, esta copia es antigua.
async function latestVersion() {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3500);
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
    clearTimeout(t);
    return res.ok ? (await res.json()).version : null;
  } catch (e) { return null; } // sin conexión: se usa lo que hay
}
async function applyUpdate(latest) {
  // Evita bucles: como mucho un intento por versión en esta sesión
  try {
    const key = `kai-upd-${latest}`;
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, '1');
  } catch (e) { /* sin sessionStorage */ }
  render(`<div class="screen loading"><div><div class="kai-mid">${kaiSVG()}</div><p class="muted" style="font-weight:800">Descargando la versión nueva de KAI…</p></div></div>`, 'happy');
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== 'kai-datos').map(k => caches.delete(k))); // los datos de los exámenes se conservan
  } catch (e) { /* seguimos igualmente */ }
  location.reload();
  return true;
}
let lastCheck = Date.now();
document.addEventListener('visibilitychange', async () => {
  // Al volver a la app tras un rato en segundo plano, volver a comprobar
  if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 2 * 60 * 1000) return;
  lastCheck = Date.now();
  const latest = await latestVersion();
  if (!latest || latest === VERSION) return;
  if (!sess && !viewerEl && !document.querySelector('.modal-bg')) return applyUpdate(latest);
  if (document.querySelector('.update-bar')) return;
  const bar = document.createElement('div');
  bar.className = 'update-bar';
  bar.innerHTML = `<span>✨ Hay una versión nueva de KAI</span><button>Actualizar</button>`;
  bar.querySelector('button').onclick = () => { persistSess(); applyUpdate(latest); };
  document.body.appendChild(bar);
});

// ---------- Sincronización del progreso con la cuenta ----------
// El progreso se guarda siempre en el móvil (funciona sin conexión) y se sube a la cuenta a los
// pocos segundos de cada cambio. El servidor junta lo de todos los dispositivos y devuelve el resultado.
let syncTimer = null, syncing = false;
function programarSync(ms = 4000) { clearTimeout(syncTimer); syncTimer = setTimeout(sync, ms); }
async function sync() {
  if (!EXAMEN || !S || syncing) return;
  syncing = true;
  try {
    const { estado } = await api.subirProgreso(EXAMEN.id, S, E ? resumen() : undefined);
    // Se junta con lo actual (no se pisa: puede haber respuestas nuevas mientras viajaba la petición)
    const m = mergeState(S, estado);
    for (const k of ['n', 'c', 'q', 'sims', 'diag', 'onboarded', 'readyShown', 'reinicio']) if (k in m) S[k] = m[k];
    saveState(EXAMEN.almacen, S);
  } catch (e) {
    /* sin conexión o sesión caducada: se reintenta en el próximo cambio */
  } finally {
    syncing = false;
  }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') sync(); });

const pantallaCarga = (txt, sub = '') => render(`<div class="screen loading"><div><div class="kai-mid">${kaiSVG()}</div><p class="muted" style="font-weight:800">${txt}</p>${sub ? `<p class="muted small">${sub}</p>` : ''}</div></div>`, 'think');
const pantallaError = (txt, sub) => render(`<div class="screen loading"><div><div class="kai-mid">${kaiSVG()}</div><p><b>${txt}</b></p><p class="muted">${sub}</p><button class="btn" onclick="location.reload()">Reintentar</button></div></div>`, 'sad');

async function init() {
  pantallaCarga('KAI se está encendiendo…', 'Comprobando si hay novedades');
  const [latest] = await Promise.all([latestVersion(), new Promise(r => setTimeout(r, 600))]);
  if (latest && latest !== VERSION && await applyUpdate(latest)) return;
  try { navigator.storage?.persist?.(); } catch (e) { /* opcional */ }
  // En iPhone, primero instalarla: Safari y la app instalada no comparten la sesión
  if (needsInstallHelp() && !browserAllowed()) return showInstallGate(0);
  arrancar();
}

// Sesión → examen → preguntas → progreso (del móvil + de la cuenta) → inicio
async function arrancar() {
  let sesion = sesionGuardada();
  try {
    const user = await api.yo();
    sesion = { ...sesion, user };
  } catch (e) {
    if (e instanceof SinSesion) return showLogin();
    if (!sesion?.user) return pantallaError('No tengo conexión', 'La primera vez necesito internet para que entres en tu cuenta.');
    // Sin conexión pero ya había entrado antes: seguimos con lo guardado
  }
  NAME = (sesion.user.nombre || '').split(' ')[0];
  guardarSesion(sesion);
  configurarBiblioteca({
    abrirExamen, nombre: () => NAME, menuCuenta,
    iniciales: () => (sesion.user.nombre || sesion.user.email || '?').split(/\s+/).map(x => x[0]).join('').slice(0, 2).toUpperCase(),
    entrar: () => showLogin(),
  });
  try { await showInicio(); } catch (e) { if (e instanceof SinSesion) showLogin(); }
}

// Abre el estudio de un examen (la KAI de siempre): datos, progreso del móvil + de la cuenta, motor
async function abrirExamen(id, asignatura = null) {
  if (E && EXAMEN) await sync(); // lo del examen anterior, a la cuenta
  sess = null;
  ASIGNATURA = asignatura;
  pantallaCarga('Abriendo tu examen…');
  const sesion = sesionGuardada() || {};
  sesion.examenes ||= {};
  try {
    sesion.examenes[id] = await api.examen(id);
    guardarSesion(sesion);
  } catch (e) {
    if (e instanceof SinSesion) return showLogin();
    if (!sesion.examenes[id]) return pantallaError('No he podido abrir el examen', 'Comprueba la conexión y vuelve a intentarlo.');
  }
  const meta = sesion.examenes[id];
  let data;
  try { data = await api.json(meta.preguntas); } catch (e) {
    return pantallaError('Uy, no he podido cargar las preguntas.', 'Comprueba la conexión y vuelve a intentarlo.');
  }
  EXAMEN = meta; DATA = data; HL = null; DOCS = null;
  S = loadState(EXAMEN.almacen);
  try {
    const { estado } = await api.progreso(EXAMEN.id);
    if (estado) S = mergeState(S, estado);
  } catch (e) { /* sin conexión: con lo del móvil */ }
  E = createEngine({ examen: EXAMEN, data: DATA, state: S, save });
  Q = E.Q;
  pauseCurrent();
  save();
  sync();
  if (S.onboarded) showHome(); else showOnboarding(0);
}

// Volver del examen a la biblioteca (a su asignatura, o al inicio)
async function salirAlInicio() {
  await sync();
  if (!ASIGNATURA?.id) return showInicio();
  await cargarBiblioteca().catch(() => {});
  showAsignatura(ASIGNATURA.id);
}

// Resumen del examen abierto para la biblioteca (nota prevista, lo que falta…), sin cargar sus preguntas
function resumen() {
  const r = readiness();
  const w = remainingWork();
  const cubierto = r.checks.find(c => c.id === 'cobertura')?.ok;
  return {
    nota: r.nota, rango: r.rango, objetivo: E.nivel.nota, listo: r.ready,
    minutos: r.ready ? 0 : Math.max(w.minutes, cubierto ? 30 : 0), // temario visto pero sin llegar: práctica y simulacros
    dominado: qStats().pOk, respuestas: S.n, t: Date.now(),
  };
}

function menuCuenta() {
  const u = sesionGuardada()?.user || {};
  modal(`
    <h2>Tu cuenta</h2>
    <p class="muted small"><b>${esc(u.nombre || '')}</b><br>${esc(u.email || '')}<br>Tu progreso se guarda en tu cuenta: puedes seguir desde cualquier dispositivo.</p>
    ${u.admin ? '<button class="btn secondary" data-a="admin">🛠️ Administración</button>' : ''}
    <button class="btn secondary" data-a="salir">🚪 Cerrar sesión</button>
    <button class="btn ghost" data-a="close">Cerrar</button>
    <p class="footer">Hecho con 💙 por ${CREATOR} · KAI · versión ${VERSION}</p>`, (el, close) => {
    el.querySelector('[data-a=close]').onclick = close;
    el.querySelector('[data-a=admin]')?.addEventListener('click', () => { close(); showAdmin(); });
    el.querySelector('[data-a=salir]').onclick = () => { if (confirm('¿Cerrar sesión en este dispositivo? Tu progreso queda guardado en tu cuenta.')) cerrarSesion(); };
  });
}

// ---------- Entrar / crear cuenta ----------
const ERRORES = {
  'Invalid email or password': 'Correo o contraseña incorrectos.',
  'User already exists': 'Ya hay una cuenta con ese correo. Prueba a entrar.',
  'User already exists. Use another email.': 'Ya hay una cuenta con ese correo. Prueba a entrar.',
  'Password too short': 'La contraseña tiene que tener al menos 8 caracteres.',
  'Invalid email': 'Ese correo no parece válido.',
  'Captcha verification failed': 'No he podido comprobar que no eres un robot 🤖 Vuelve a intentarlo.',
  'Missing CAPTCHA response': 'Espera un segundo a que compruebe que no eres un robot y vuelve a pulsar.',
};
function showLogin(modo = 'entrar') {
  const crear = modo === 'crear';
  render(`
    <div class="screen onb">
      <div class="kai-big">${kaiSVG()}</div>
      <div class="bubble"><p>${crear ? '¡Encantado! Crea tu cuenta y así tu progreso <b>se guarda aunque cambies de móvil</b>&nbsp;💙' : `${hola()}&nbsp;👋 Soy <b>KAI</b>. Entra con tu cuenta para seguir estudiando.`}</p></div>
      <form class="card login" id="login" novalidate>
        ${crear ? '<label>Tu nombre<input name="name" autocomplete="given-name" required></label>' : ''}
        <label>Correo<input name="email" type="email" autocomplete="email" inputmode="email" required></label>
        <label>Contraseña<input name="password" type="password" minlength="8" autocomplete="${crear ? 'new-password' : 'current-password'}" required></label>
        <div class="captcha" id="captcha"></div>
        <p class="login-err" role="alert"></p>
        <button class="btn" type="submit">${crear ? 'Crear cuenta' : 'Entrar'}</button>
      </form>
      <button class="btn ghost" id="toggle">${crear ? 'Ya tengo cuenta' : '¿Primera vez? Crea tu cuenta'}</button>
    </div>`, 'wave happy');
  app.querySelector('#toggle').onclick = () => showLogin(crear ? 'entrar' : 'crear');
  const form = app.querySelector('#login');
  form.onsubmit = async e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const err = form.querySelector('.login-err');
    const btn = form.querySelector('button');
    if (crear && !f.name?.trim()) return (err.textContent = 'Dime cómo te llamas 🙂');
    if (!f.email || !f.password) return (err.textContent = 'Escribe tu correo y tu contraseña.');
    btn.disabled = true;
    err.textContent = '';
    try {
      const token = await antibots.token();
      if (crear) await api.crearCuenta(f.name.trim(), f.email.trim(), f.password, token);
      else await api.entrar(f.email.trim(), f.password, token);
      pantallaCarga('Preparando tus cosas…');
      arrancar();
    } catch (e2) {
      err.textContent = e2 instanceof SinConexion ? 'No tengo conexión. Inténtalo en un momento.' : (ERRORES[e2.message] || e2.message);
      btn.disabled = false;
      antibots.reiniciar(); // cada respuesta del antibots vale una sola vez
    }
  };
  antibots.montar(app.querySelector('#captcha'));
}

// Antibots (Cloudflare Turnstile): casi siempre invisible; solo pide un clic si sospecha
const antibots = (() => {
  let sitekey, widget = null, token = null, esperando = [];
  const listo = t => { token = t; esperando.forEach(fn => fn(t)); esperando = []; };
  const cargarScript = () => new Promise((ok, ko) => {
    if (window.turnstile) return ok();
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.onload = ok; s.onerror = ko;
    document.head.appendChild(s);
  });
  return {
    async montar(el) {
      token = null; widget = null;
      try {
        if (sitekey === undefined) sitekey = (await api.config()).turnstile || null;
        if (!sitekey || !el?.isConnected) return;
        await cargarScript();
        widget = window.turnstile.render(el, { sitekey, appearance: 'interaction-only', language: 'es', callback: listo, 'expired-callback': () => { token = null; } });
      } catch (e) { /* sin antibots configurado o sin conexión */ }
    },
    // Espera (como mucho 8 s) a que el antibots dé su visto bueno
    token() {
      if (!sitekey || token) return Promise.resolve(token);
      return new Promise(res => { esperando.push(res); setTimeout(() => res(token), 8000); });
    },
    reiniciar() { token = null; try { if (widget != null) window.turnstile.reset(widget); } catch (e) { /* nada */ } },
  };
})();

async function cerrarSesion() {
  await sync();
  try { await api.salir(); } catch (e) { /* aunque falle, se olvida aquí */ }
  olvidarSesion();
  olvidarBiblioteca();
  try { (await caches.keys()).forEach(k => caches.delete(k)); } catch (e) { /* nada */ }
  location.reload();
}

document.addEventListener('keydown', e => {
  if (viewerEl) { if (e.key === 'Escape') closeBook(); return; }
  if (!sess || !app.querySelector('.qtop') || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = '1234'.indexOf(e.key) >= 0 ? '1234'.indexOf(e.key) : 'abcd'.indexOf(e.key.toLowerCase());
  if (k >= 0 && e.key.length === 1) { app.querySelectorAll('.opt')[k]?.click(); return; }
  if (e.key === 'Enter') app.querySelector('#next')?.click();
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {}));
}

init();

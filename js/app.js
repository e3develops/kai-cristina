import { kaiSVG, setKaiMood } from './kai.js';

// ------------------------------------------------------------------
// Configuración
// ------------------------------------------------------------------
const NAME = 'Cristina';
const CREATOR = 'Quique';
const STORE = 'kai-cristina-v1';
const SESSION_LEN = 15;   // preguntas por ronda de práctica
const DIAG_LEN = 24;      // preguntas del diagnóstico
const SIM_LEN = 40;       // preguntas del simulacro
const GOAL_ALL = 0.80;    // nota estimada global para estar lista
const GOAL_TEMA = 0.70;   // nota estimada mínima en cada tema
const GOAL_COVER = 0.3;   // parte de cada tema que hay que haber trabajado
const GOAL_SIM = 0.80;    // nota mínima en el último simulacro
const MASTERY_STREAK = 2; // aciertos seguidos para dominar un concepto

const app = document.getElementById('app');
let DATA;            // { temas, preguntas }
const Q = {};        // id -> pregunta
const CONCEPTS = {}; // id -> { id, tema, seccion, qs: [ids] }
let S;               // estado persistente
let sess = null;     // sesión de test en curso

// ------------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = x => Math.round(x * 100);
const rand = arr => arr[Math.floor(Math.random() * arr.length)];
function shuffle(a) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function freshState() {
  return { v: 1, onboarded: false, n: 0, c: {}, q: {}, diag: null, sims: [], readyShown: false };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (s && s.v === 1) {
      const st = { ...freshState(), ...s };
      if (!st.c || typeof st.c !== 'object') st.c = {};
      if (!st.q || typeof st.q !== 'object') st.q = {};
      if (!Array.isArray(st.sims)) st.sims = [];
      st.n = Number(st.n) || 0;
      return st;
    }
  } catch (e) { /* almacenamiento no disponible */ }
  return freshState();
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* sin almacenamiento */ }
}

// ------------------------------------------------------------------
// Modelo de aprendizaje
// ------------------------------------------------------------------
const stat = id => S.c[id];

function conceptIds(filter = {}) {
  return Object.values(CONCEPTS)
    .filter(c => (!filter.tema || c.tema === filter.tema) && (!filter.sec || c.sec === filter.sec))
    .map(c => c.id);
}
function seenCount(filter = {}) {
  return conceptIds(filter).filter(id => stat(id)).length;
}
function failedIds(filter = {}) {
  return conceptIds(filter).filter(id => stat(id)?.lastOk === false);
}
const secKey = q => `${q.tema}|${q.seccion}`;
const secName = key => key.slice(key.indexOf('|') + 1);
// Claves de apartado (tema|sección) en orden de aparición
function sections(tema) {
  const seen = new Set();
  const out = [];
  for (const p of DATA.preguntas) {
    if (tema && p.tema !== tema) continue;
    const k = secKey(p);
    if (!seen.has(k)) { seen.add(k); out.push(k); }
  }
  return out;
}
// Conocimiento previo de un apartado: % de aciertos a la PRIMERA en sus conceptos
// (suavizado hacia la media global; sin datos → 50%)
function priorAcc(sec) {
  let gOk = 0, gN = 0, ok = 0, n = 0;
  for (const id in S.c) {
    const s = S.c[id];
    if (s.first == null || !CONCEPTS[id]) continue;
    gN++; if (s.first) gOk++;
    if (CONCEPTS[id].sec === sec) { n++; if (s.first) ok++; }
  }
  const g = (gOk + 1) / (gN + 2);
  return (ok + 3 * g) / (n + 3);
}
const weakness = sec => 1 - priorAcc(sec);
// Sabida: acertada a la primera y nunca fallada, o 2+ aciertos seguidos tras fallarla
const known = id => { const s = S.c[id]; return !!s && (s.streak >= MASTERY_STREAK || (s.ko === 0 && s.ok > 0)); };
const mastered = known;

// Probabilidad estimada de acertar un concepto en el examen
function conceptP(id) {
  const s = stat(id);
  if (!s) return priorAcc(CONCEPTS[id].sec); // no visto: se estima por lo que sabe de su apartado
  if (!s.lastOk) return 0.35;                 // último intento fallado
  if (s.streak >= MASTERY_STREAK) return 0.92;
  return s.ko === 0 ? 0.85 : 0.7;             // a la primera / recuperada una vez
}
// Nota estimada (0-1) si el examen fuera ahora mismo
function estimate(filter = {}) {
  const ids = conceptIds(filter);
  return ids.length ? ids.reduce((a, id) => a + conceptP(id), 0) / ids.length : 0;
}
function coverage(filter = {}) {
  const ids = conceptIds(filter);
  return ids.length ? seenCount(filter) / ids.length : 0;
}

function readiness() {
  const all = estimate();
  const temas = DATA.temas.map(t => ({ ...t, d: estimate({ tema: t.id }), cov: coverage({ tema: t.id }) }));
  const lastSim = S.sims.length ? S.sims[S.sims.length - 1].score : null;
  const checks = [
    { ok: all >= GOAL_ALL, label: `Nota estimada de ${pct(GOAL_ALL)}% o más`, info: S.n ? `ahora: ${pct(all)}%` : 'aún sin datos' },
    { ok: temas.every(t => t.d >= GOAL_TEMA && t.cov >= GOAL_COVER), label: `Haber trabajado cada tema (${pct(GOAL_COVER)}% visto)`, info: temas.map(t => `${t.corto}: ${pct(t.cov)}%`).join(' · ') },
    { ok: lastSim !== null && lastSim >= GOAL_SIM, label: `Aprobar un simulacro con ${pct(GOAL_SIM)}% o más`, info: lastSim === null ? 'sin hacer' : `último: ${pct(lastSim)}%` },
  ];
  return { all, temas, lastSim, checks, ready: checks.every(c => c.ok) };
}

function record(qid, ok) {
  const q = Q[qid];
  S.n++;
  const c = S.c[q.concepto] || (S.c[q.concepto] = { seen: 0, ok: 0, ko: 0, streak: 0, due: 0, last: -1, lastOk: null, first: null });
  if (c.first == null) c.first = ok;
  c.seen++;
  c.last = S.n;
  c.lastOk = ok;
  if (ok) {
    c.ok++;
    c.streak++;
    // A la primera: ya la sabe, repaso muy lejano. Recuperando un fallo: vuelve pronto para confirmar.
    const gap = c.ko === 0 ? 150 : [0, 6, 40, 120][Math.min(c.streak, 3)];
    c.due = S.n + gap;
  } else {
    c.ko++;
    c.streak = 0;
    c.due = S.n + 4; // vuelve enseguida
  }
  const s = S.q[qid] || (S.q[qid] = { seen: 0, ok: 0 });
  s.seen++;
  if (ok) s.ok++;
  s.lastOk = ok;
  save();
}

// Elige el siguiente concepto a preguntar (repetición espaciada sencilla)
function pickConcept(pool, recent, preferNew = false) {
  let cands = pool.filter(id => !recent.includes(id));
  if (!cands.length) cands = pool;
  const n = S.n;
  const due = id => stat(id) && stat(id).due <= n;
  const byDue = (a, b) => stat(a).due - stat(b).due;

  // Intercalar: tras un repaso, si queda temario sin ver, toca una nueva
  const fresh = cands.filter(id => !stat(id));
  if (preferNew && fresh.length) return pickWeakSection(fresh);

  // 1) Fallos que ya tocan (siempre primero)
  const failed = cands.filter(id => due(id) && !stat(id).lastOk).sort(byDue);
  if (failed.length) return failed[0];
  // 2) Fallos recuperados que hay que confirmar
  const confirming = cands.filter(id => due(id) && stat(id).ko > 0 && stat(id).streak < MASTERY_STREAK).sort(byDue);
  if (confirming.length) return confirming[0];
  // 3) Contenido nuevo, priorizando los apartados más flojos (con algún repaso suelto)
  const unseen = cands.filter(id => !stat(id));
  const reviews = cands.filter(due).sort(byDue);
  if (unseen.length && !(reviews.length && Math.random() < 0.1)) return pickWeakSection(unseen);
  // 4) Repasos pendientes
  if (reviews.length) return reviews[0];
  // 5) Todo visto y nada pendiente: lo que antes toque
  return cands.filter(id => stat(id)).sort(byDue)[0] || cands[0];
}
function pickWeakSection(ids) {
  const bySec = {};
  for (const id of ids) (bySec[CONCEPTS[id].sec] ||= []).push(id);
  const secs = Object.keys(bySec);
  const w = secs.map(s => Math.pow(weakness(s), 2) + 0.05);
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < secs.length; i++) {
    r -= w[i];
    if (r <= 0) return rand(bySec[secs[i]]);
  }
  return rand(bySec[secs[secs.length - 1]]);
}
function pickQuestion(cid, avoid) {
  const qs = shuffle(CONCEPTS[cid].qs).sort((a, b) => (S.q[a]?.seen || 0) - (S.q[b]?.seen || 0));
  return qs.find(id => id !== avoid) || qs[0];
}

function buildDiag() {
  const secs = shuffle(sections());
  const bySec = Object.fromEntries(secs.map(s => [s, shuffle(conceptIds({ sec: s }))]));
  const out = [];
  let round = 0;
  while (out.length < DIAG_LEN && round < 50) {
    for (const s of secs) {
      if (out.length >= DIAG_LEN) break;
      const cid = bySec[s][round];
      if (cid) out.push(pickQuestion(cid));
    }
    round++;
  }
  return shuffle(out);
}
function buildSim() {
  return shuffle(conceptIds()).slice(0, SIM_LEN).map(cid => pickQuestion(cid));
}

// ------------------------------------------------------------------
// Frases de KAI
// ------------------------------------------------------------------
const OK_MSGS = ['¡Bien!', '¡Exacto!', '¡Eso es!', `¡Genial, ${NAME}!`, '¡Perfecto!', '¡Correcto!', '¡Muy bien!', '¡Toma ya! 💪'];
const KO_MSGS = ['¡Casi! Mira lo que dice el libro:', 'No pasa nada, te la vuelvo a preguntar pronto.', 'Ojo con esta, léela con calma:', 'Esta la repasamos otra vez en un ratito.'];

function homeMessage(r) {
  const failed = failedIds().length;
  if (!S.diag) return `Te propongo empezar con un <b>diagnóstico</b> de ${DIAG_LEN} preguntas para ver qué sabes ya. ¡Sin presión!`;
  if (r.ready) return `¡Estás <b>lista</b>, ${NAME}! 🎉 Si quieres, sigue repasando un poquito para afianzar.`;
  const simFailed = r.lastSim !== null && r.lastSim < GOAL_SIM && S.sims.at(-1).n >= S.n - SIM_LEN;
  if (simFailed) return `En el simulacro sacaste un <b>${pct(r.lastSim)}%</b>. Repasa los fallos y sigue estudiando un poco; luego vuelve a intentarlo 💪`;
  const covered = r.checks[1].ok;
  if (r.all >= GOAL_ALL && covered && r.lastSim === null) return `¡Tu nota estimada es de un <b>${pct(r.all)}%</b>! Es el momento de hacer un <b>simulacro de examen</b>.`;
  if (r.all >= GOAL_ALL && !covered) return `Lo que has visto lo llevas genial (<b>${pct(r.all)}%</b>). Sigue estudiando para cubrir más temario.`;
  if (failed >= 8) return `Tienes <b>${failed}</b> preguntas falladas pendientes. Si sigues estudiando te las iré repitiendo hasta que salgan solas.`;
  if (r.all < 0.3) return `Vamos poco a poco. Pulsa <b>Seguir estudiando</b> y yo elijo las preguntas que más te convienen.`;
  return rand([`¡Vas muy bien! Si el examen fuera ahora, calculo que sacarías un <b>${pct(r.all)}%</b>.`, `Cada pregunta cuenta. ¡Sigue así, ${NAME}! 💪`]);
}

// ------------------------------------------------------------------
// Pantallas
// ------------------------------------------------------------------
let readyTimer = null;
// Bloquea los toques unos ms tras cada cambio de pantalla: evita que un doble toque
// "atraviese" y pulse lo que aparece debajo del dedo en la pantalla nueva
function guardTaps(el, ms = 400) {
  el.style.pointerEvents = 'none';
  setTimeout(() => { el.style.pointerEvents = ''; }, ms);
}
function render(html, mood) {
  clearTimeout(readyTimer);
  app.innerHTML = html;
  if (mood) setKaiMood(app, mood);
  window.scrollTo(0, 0);
  guardTaps(app);
}

// ---------- Onboarding ----------
function onboardingSteps() {
  const total = DATA.preguntas.length;
  const temas = DATA.temas.map(t => `<li><span class="n">${t.emoji}</span><span>${esc(t.nombre)} <span class="muted small">(${DATA.preguntas.filter(p => p.tema === t.id).length} preguntas)</span></span></li>`).join('');
  return [
    { mood: 'wave happy', html: `<p>¡Hola, <b>${NAME}</b>! 👋</p><p>Soy <b>KAI</b>, tu robot de estudio.</p>` },
    { mood: 'talk', html: `<p><b>${CREATOR}</b> me ha creado para ayudarte con tus estudios de enfermería.</p><p>Me ha pedido que te cuide mucho 💙</p>` },
    { mood: 'think', html: `<p>Me he leído tus apuntes de arriba abajo 📚</p><ul class="steps-list">${temas}</ul><p>Las respuestas correctas y las citas salen <b>literalmente de tu libro</b>. No me invento nada.</p>` },
    { mood: 'talk', html: `<p>Así vamos a trabajar:</p><ul class="steps-list">
        <li><span class="n">1</span><span><b>Diagnóstico:</b> una ronda rápida para ver qué sabes.</span></li>
        <li><span class="n">2</span><span><b>Práctica inteligente:</b> te pregunto más lo que fallas, hasta que lo domines.</span></li>
        <li><span class="n">3</span><span><b>Simulacro:</b> un examen de prueba para comprobar que estás lista.</span></li></ul>` },
    { mood: 'happy', html: `<p>Después de cada respuesta te enseño <b>la frase exacta del libro</b> y su página.</p><p>Así también aprendes de los fallos 😉</p>` },
    { mood: 'happy', html: `<p>Voy calculando tu <b>nota estimada</b>. Cuando llegue al <b>${pct(GOAL_ALL)}%</b>, hayas trabajado todos los temas y apruebes un simulacro, te diré:</p><p style="font-size:20px"><b>¡Estás lista!</b> 🎉</p><p>Y entonces podrás ir al examen tranquila.</p>` },
    S.diag
      ? { mood: 'wave happy', html: `<p>Tenemos <b>${total} preguntas</b> preparadas.</p><p>¡Seguimos cuando quieras! 💪</p>`, last: true }
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
              : `<button class="btn" id="go-diag">¡Vamos! 🚀</button><button class="btn ghost" id="go-home">Primero echo un vistazo</button>`)
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
  const failed = failedIds().length;
  const checks = r.checks.map(c => `<li class="${c.ok ? 'done' : ''}"><span class="ck">${c.ok ? '✓' : ''}</span><span>${c.label}<br><span class="muted small">${c.info}</span></span></li>`).join('');
  const temas = r.temas.map(t => {
    const total = conceptIds({ tema: t.id }).length;
    const seen = seenCount({ tema: t.id });
    return `
      <div class="card tema" data-tema="${t.id}">
        <div class="head">
          <div class="emoji">${t.emoji}</div>
          <div><div class="name">${esc(t.nombre)}</div><div class="meta">${esc(t.corto)} · ${DATA.preguntas.filter(p => p.tema === t.id).length} preguntas · ${pct(t.cov)}% visto</div></div>
        </div>
        <div class="bar-row"><div class="bar ${t.d < 0.6 ? 'warn' : ''}"><i style="width:${S.n ? pct(t.d) : 0}%"></i></div><span class="pct">${S.n ? pct(t.d) + '%' : '—'}</span></div>
      </div>`;
  }).join('');

  const main = (S.diag || S.n > 0)
    ? `<button class="btn" id="study">Seguir estudiando<span class="sub">KAI elige las preguntas por ti</span></button>`
    : `<button class="btn" id="diag">Empezar diagnóstico<span class="sub">${DIAG_LEN} preguntas · unos 5 minutos</span></button>`;

  render(`
    <div class="screen">
      <div class="topbar">
        <div><div class="hello">Hola, ${NAME} 👋</div><h1>¡A por el examen!</h1></div>
        <button class="icon-btn" id="menu" aria-label="Menú">⚙️</button>
      </div>

      <div class="kai-row">
        <div class="kai-wrap">${kaiSVG()}</div>
        <div class="bubble">${homeMessage(r)}</div>
      </div>

      <div class="card">
        <div class="ready-card">
          <div class="ring" style="--p:${S.n ? pct(r.all) : 0}; --c:${r.ready ? 'var(--ok)' : 'var(--primary)'}"><div class="val"><b>${S.n ? pct(r.all) + '%' : '—'}</b><span>nota est.</span></div></div>
          <div>
            <h3>${r.ready ? '¡Lista para el examen! 🎉' : 'Preparación para el examen'}</h3>
            <ul class="checks">${checks}</ul>
          </div>
        </div>
      </div>

      ${S.cur ? `<div class="card resume">
        <div><b>Tienes ${S.cur.type === 'sim' ? 'un simulacro' : S.cur.type === 'diag' ? 'el diagnóstico' : 'una ronda'} a medias</b><br><span class="muted small">Vas por la pregunta ${Math.min(S.cur.i + 1, S.cur.len)} de ${S.cur.len}</span></div>
        <div class="btn-col"><button class="btn accent" id="resume">Continuar</button><button class="btn ghost" id="discard">Descartar</button></div>
      </div>` : ''}

      ${main}

      <div class="grid2">
        <button class="tile" id="fallos" ${failed ? '' : 'disabled'}><span class="ic">🔁</span><b>Repasar fallos${failed ? `<span class="badge">${failed}</span>` : ''}</b><span>Solo lo que has fallado</span></button>
        <button class="tile" id="sim"><span class="ic">📝</span><b>Simulacro</b><span>${SIM_LEN} preguntas tipo examen, sin ayudas</span></button>
        <button class="tile" id="progress"><span class="ic">📊</span><b>Mi progreso</b><span>Por temas y apartados</span></button>
        <button class="tile" id="diag2"><span class="ic">🩺</span><b>Diagnóstico</b><span>${S.diag ? `Último: ${pct(S.diag.score)}%` : 'Ver qué sabes ya'}</span></button>
      </div>

      <div class="section-title"><h2>Temas</h2><span class="muted small">Toca uno para practicarlo</span></div>
      ${temas}

      <div class="footer">Hecho con 💙 por ${CREATOR} · KAI v1</div>
    </div>`, r.ready ? 'happy' : 'talk');

  app.querySelector('#resume')?.addEventListener('click', resumeSession);
  app.querySelector('#discard')?.addEventListener('click', () => { if (confirm('¿Descartar la ronda a medias? Lo ya respondido sigue contando para tu repaso.')) { S.cur = null; save(); showHome(); } });
  app.querySelector('#study')?.addEventListener('click', () => startSession('practice'));
  app.querySelector('#diag')?.addEventListener('click', () => startSession('diag'));
  app.querySelector('#diag2').addEventListener('click', () => startSession('diag'));
  app.querySelector('#fallos').addEventListener('click', () => startSession('fallos'));
  app.querySelector('#sim').addEventListener('click', confirmSim);
  app.querySelector('#progress').addEventListener('click', showProgress);
  app.querySelector('#menu').addEventListener('click', showMenu);
  app.querySelectorAll('.tema').forEach(el => el.addEventListener('click', () => startSession('practice', { tema: el.dataset.tema })));
}

function modal(html, bind) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">${html}</div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
  guardTaps(bg);
  bind(bg, () => bg.remove());
}
function showMenu() {
  modal(`
    <h2>Opciones</h2>
    <button class="btn secondary" data-a="tuto">👋 Ver la presentación de KAI</button>
    <button class="btn secondary" data-a="reset">🗑️ Reiniciar mi progreso</button>
    <button class="btn ghost" data-a="close">Cerrar</button>`, (el, close) => {
    el.querySelector('[data-a=tuto]').onclick = () => { close(); showOnboarding(0); };
    el.querySelector('[data-a=close]').onclick = close;
    el.querySelector('[data-a=reset]').onclick = () => {
      if (confirm('¿Seguro? Se borrará todo tu progreso y KAI empezará de cero.')) {
        S = freshState(); S.onboarded = true; save(); close(); showHome();
      }
    };
  });
}
function confirmSim() {
  const r = readiness();
  modal(`
    <h2>📝 Simulacro de examen</h2>
    <p>${SIM_LEN} preguntas de todo el temario. <b>No verás si aciertas hasta el final</b>, como en el examen de verdad.</p>
    ${r.all < 0.6 ? `<p class="muted">Consejo de KAI: rinde más cuando tu nota estimada pase del 60% (ahora: ${pct(r.all)}%). Pero puedes hacerlo cuando quieras.</p>` : ''}
    <button class="btn accent" data-a="go">Empezar simulacro</button>
    <button class="btn ghost" data-a="close">Ahora no</button>`, (el, close) => {
    el.querySelector('[data-a=go]').onclick = () => { close(); startSession('sim'); };
    el.querySelector('[data-a=close]').onclick = close;
  });
}

// ---------- Progreso ----------
function showProgress() {
  const blocks = DATA.temas.map(t => {
    const rows = sections(t.id).map(sec => {
      const d = estimate({ sec });
      const total = conceptIds({ sec }).length;
      const m = seenCount({ sec });
      return `<div class="sec-row" data-sec="${esc(sec)}">
        <div class="t">${esc(secName(sec))} <span>${pct(d)}% · ${m}/${total} vistos</span></div>
        <div class="bar ${d < 0.6 ? 'warn' : ''}"><i style="width:${pct(d)}%"></i></div>
      </div>`;
    }).join('');
    return `<div class="card"><h3>${t.emoji} ${esc(t.nombre)}</h3><p class="muted small" style="margin:4px 0 6px">${esc(t.fuente || '')}</p>${rows}</div>`;
  }).join('');
  render(`
    <div class="screen">
      <div class="topbar"><button class="icon-btn" id="back" aria-label="Volver">←</button><h2>Mi progreso</h2><span style="width:42px"></span></div>
      <p class="muted">La barra es tu nota estimada en cada apartado. Una pregunta cuenta como dominada cuando la aciertas ${MASTERY_STREAK} veces seguidas. Toca un apartado para practicarlo.</p>
      ${blocks}
    </div>`);
  app.querySelector('#back').onclick = showHome;
  app.querySelectorAll('.sec-row').forEach(el => el.addEventListener('click', () => startSession('practice', { sec: el.dataset.sec })));
}

// ---------- Sesión de test ----------
function startSession(type, filter = {}) {
  let fixed = null;
  let pool = conceptIds(filter);
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
function resumeSession() {
  const c = S.cur;
  if (!c || !c.items?.length) { S.cur = null; save(); return showHome(); }
  sess = { ...c, pool: conceptIds(c.filter || {}), recent: [], startMastered: new Set(c.startMastered || []) };
  const it = sess.items[sess.i];
  if (it && it.chosen !== null) sess.i++; // la última ya estaba respondida
  try { history.pushState({ kai: 'quiz' }, ''); } catch (e) { /* sin historial */ }
  nextQuestion();
}
function quitSession() {
  sess = null;
  S.cur = null;
  save();
  showHome();
}
// Botón/gesto "atrás" durante una ronda: preguntar antes de salir
window.addEventListener('popstate', () => {
  if (viewerEl) return closeBook(true);
  if (!sess || !app.querySelector('.qtop')) return;
  if (sess.i === 0 || confirm('¿Salir de esta ronda? Lo que ya has respondido queda guardado.')) quitSession();
  else { try { history.pushState({ kai: 'quiz' }, ''); } catch (e) { /* sin historial */ } }
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
  const prev = stat(q.concepto);
  sess.recent = [q.concepto, ...sess.recent].slice(0, Math.min(4, Math.max(1, sess.pool.length - 1)));
  sess.items[sess.i] = { qid, order: shuffle([0, 1, 2, 3]), chosen: null, ok: null, wasNew: !prev, wasFailed: prev?.lastOk === false };
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
      <div class="muted small" style="font-weight:800">${labels[sess.type]}${sess.filter?.tema ? ' · ' + esc(DATA.temas.find(t => t.id === sess.filter.tema)?.corto || '') : ''}${sess.filter?.sec ? ' · ' + esc(secName(sess.filter.sec)) : ''}</div>
      <div class="qmeta">${chips}</div>
      <div class="question">${esc(q.pregunta)}</div>
      <div class="options">${opts}</div>
      <div id="fb"></div>
    </div>`);

  app.querySelector('#quit').onclick = () => {
    const msg = sess.type === 'sim'
      ? '¿Salir del simulacro? Tus respuestas cuentan para el repaso, pero la nota del simulacro solo se guarda si lo terminas.'
      : '¿Salir de esta ronda? Lo que ya has respondido queda guardado.';
    if (sess.i === 0 || confirm(msg)) quitSession();
  };
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
      <div class="fb-head"><div class="mini-kai">${kaiSVG()}</div><span>${it.ok ? rand(OK_MSGS) : rand(KO_MSGS)}</span></div>
      <div class="quote">📖 ${fmtQuote(q.fuente)}<span class="src">${esc(sourceLabel(q))}</span></div>
      <button class="book-btn" data-q="${esc(q.id)}">🔎 Llévame al libro</button>
    </div>
    <div class="sticky-bottom"><button class="btn" id="next">${sess.i + 1 >= sess.len ? 'Ver resultados' : 'Siguiente'}</button></div>`;
  setKaiMood(fb, it.ok ? 'happy' : 'sad');
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
  try { HL = await (await fetch('data/resaltados.json', { cache: 'no-cache' })).json(); } catch (e) { HL = {}; }
  return HL;
}
let viewerEl = null;
function closeBook(fromPop = false) {
  if (!viewerEl) return;
  viewerEl.remove();
  viewerEl = null;
  document.body.style.overflow = '';
  if (!fromPop) { try { history.back(); } catch (e) { /* sin historial */ } }
}
async function openBook(qid) {
  const q = Q[qid];
  if (!q || viewerEl) return;
  const hl = (await loadHighlights())[qid] || {};
  const img = hl.img || `paginas/${q.tema}-${q.pagina}.jpg`;
  const rects = hl.rects || [];
  const pag = (img.match(/-(\d+)\.jpg$/) || [])[1] || q.pagina;
  const t = DATA.temas.find(x => x.id === q.tema);

  viewerEl = document.createElement('div');
  viewerEl.className = 'viewer';
  viewerEl.innerHTML = `
    <div class="v-top">
      <button class="icon-btn" data-a="close" aria-label="Cerrar">✕</button>
      <div class="v-title"><b>${esc(t ? t.corto : '')} · pág. ${esc(pag)}</b><span>${rects.length ? 'Lo tienes subrayado en amarillo' : 'La frase está en esta página'}</span></div>
      <div class="v-zoom"><button class="icon-btn" data-a="out" aria-label="Alejar">−</button><button class="icon-btn" data-a="in" aria-label="Acercar">+</button></div>
    </div>
    <div class="v-scroll"><div class="v-page">
      <img src="${esc(img)}" alt="Página ${esc(pag)} del libro">
      ${rects.map(([x, y, w, h]) => `<i class="v-hl" style="left:${x * 100}%;top:${y * 100}%;width:${w * 100}%;height:${h * 100}%"></i>`).join('')}
    </div></div>
    <div class="v-quote">📖 ${fmtQuote(q.fuente)}</div>`;
  document.body.appendChild(viewerEl);
  document.body.style.overflow = 'hidden';
  guardTaps(viewerEl);
  try { history.pushState({ kai: 'book' }, ''); } catch (e) { /* sin historial */ }

  const scroller = viewerEl.querySelector('.v-scroll');
  const page = viewerEl.querySelector('.v-page');
  const im = page.querySelector('img');
  let zoom = rects.length ? 2 : 1;
  const focus = () => {
    // Centra la vista en el primer subrayado
    const r = rects[0];
    if (!r) return;
    const W = page.clientWidth, H = page.clientHeight;
    scroller.scrollLeft = Math.max(0, (r[0] + r[2] / 2) * W - scroller.clientWidth / 2);
    scroller.scrollTop = Math.max(0, (r[1] + r[3] / 2) * H - scroller.clientHeight / 2);
  };
  const apply = () => { page.style.width = `${zoom * 100}%`; requestAnimationFrame(focus); };
  im.onload = apply;
  if (im.complete) apply();
  im.onerror = () => { scroller.innerHTML = '<p class="muted" style="padding:24px;text-align:center">No he podido cargar la página. Comprueba la conexión.</p>'; };
  viewerEl.querySelector('[data-a=close]').onclick = () => closeBook();
  viewerEl.querySelector('[data-a=in]').onclick = () => { zoom = Math.min(4, zoom + 0.5); apply(); };
  viewerEl.querySelector('[data-a=out]').onclick = () => { zoom = Math.max(1, zoom - 0.5); apply(); };
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
  const domNow = estimate();

  if (sess.type === 'diag') {
    S.diag = { date: Date.now(), score };
  }
  if (sess.type === 'sim') S.sims.push({ date: Date.now(), score, n: S.n });
  S.cur = null;
  save();

  const r = readiness();
  let title, mood, msg;
  if (sess.type === 'sim') {
    const passed = score >= GOAL_SIM;
    title = passed ? '¡Simulacro aprobado! 🎉' : 'Simulacro terminado';
    mood = passed ? 'celebrate' : 'think';
    msg = passed ? `¡Has sacado un ${pct(score)}%! Eso es nivel examen.` : `Has sacado un ${pct(score)}%. Necesitas un ${pct(GOAL_SIM)}% para darlo por superado. Repasa los fallos de abajo y vuelve a intentarlo.`;
  } else if (sess.type === 'diag') {
    title = 'Diagnóstico completado&nbsp;🩺';
    mood = 'happy';
    msg = score >= 0.7 ? `¡Partes de un ${pct(score)}%! Ya sabes mucho. Ahora vamos a pulir lo que falta.`
      : `Has acertado un ${pct(score)}%. ¡Perfecto para empezar! Ya sé por dónde tenemos que ir.`;
  } else if (sess.type === 'fallos' && !failedIds().length) {
    title = '¡Fallos corregidos! 🎉';
    mood = 'celebrate';
    msg = 'Has corregido todos tus fallos pendientes. ¡Así se hace! Sigue estudiando para ver temario nuevo.';
  } else {
    title = score >= 0.8 ? '¡Rondón! 🔥' : score >= 0.5 ? '¡Buena ronda!' : 'Ronda terminada';
    mood = score >= 0.5 ? 'happy' : 'talk';
    msg = score >= 0.8 ? `Un ${pct(score)}% de aciertos. ¡Estás que te sales!` : score >= 0.5 ? 'Vas por buen camino. Los fallos te los volveré a preguntar.' : 'Tranquila: justo para esto estamos. Lo que has fallado volverá hasta que te salga solo.';
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
        <div class="quote">📖 ${fmtQuote(q.fuente)}<span class="src">${esc(sourceLabel(q))}</span></div>
        <button class="book-btn" data-q="${esc(q.id)}">🔎 Llévame al libro</button>
      </div>`;
    }).join('')}` : '';

  const pending = failedIds().length;
  let again = { practice: 'Otra ronda', diag: 'Empezar a practicar', fallos: 'Seguir repasando fallos', sim: 'Repetir simulacro' }[sess.type];
  let againType = sess.type;
  if (sess.type === 'sim' && score < GOAL_SIM && pending) { again = `Repasar fallos (${pending})`; againType = 'fallos'; }
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
        <div class="stat"><b>${pct(score)}%</b><span>aciertos</span></div>
        <div class="stat"><b>+${newlyMastered}</b><span>nuevas sabidas</span></div>
        <div class="stat"><b>${pct(domNow)}%</b><span>nota est.</span></div>
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
        <p style="font-size:24px"><b>¡Estás lista, ${NAME}!</b> 🎉</p>
        <p>Tu nota estimada es de un <b>${pct(r.all)}%</b> y has aprobado el simulacro con un <b>${pct(r.lastSim)}%</b>.</p>
        <p>Ya puedes dejar de estudiar e ir al examen tranquila. ¡Vas a bordarlo!</p>
        <p>${CREATOR} y yo estamos muy orgullosos de ti 💙</p>
      </div>
      <div class="btn-col"><button class="btn" id="ok">¡Gracias, KAI! 🤖</button></div>
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
async function init() {
  render(`<div class="screen loading"><div><div class="kai-mid">${kaiSVG()}</div><p class="muted" style="font-weight:800">KAI se está encendiendo…</p></div></div>`, 'think');
  try {
    const res = await fetch('data/preguntas.json', { cache: 'no-cache' });
    DATA = await res.json();
  } catch (e) {
    render(`<div class="screen loading"><div><div class="kai-mid">${kaiSVG()}</div><p><b>Uy, no he podido cargar las preguntas.</b></p><p class="muted">Comprueba la conexión y recarga la página.</p></div></div>`, 'sad');
    return;
  }
  for (const p of DATA.preguntas) {
    Q[p.id] = p;
    (CONCEPTS[p.concepto] ||= { id: p.concepto, tema: p.tema, seccion: p.seccion, sec: secKey(p), qs: [] }).qs.push(p.id);
  }
  S = load();
  try { navigator.storage?.persist?.(); } catch (e) { /* opcional */ }
  if (S.onboarded) showHome(); else showOnboarding(0);
}

document.addEventListener('keydown', e => {
  if (viewerEl) { if (e.key === 'Escape') closeBook(); return; }
  if (!sess || !app.querySelector('.qtop') || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = '1234'.indexOf(e.key) >= 0 ? '1234'.indexOf(e.key) : 'abcd'.indexOf(e.key.toLowerCase());
  if (k >= 0 && e.key.length === 1) { app.querySelectorAll('.opt')[k]?.click(); return; }
  if (e.key === 'Enter') app.querySelector('#next')?.click();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

init();

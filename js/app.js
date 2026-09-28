import { kaiSVG, setKaiMood } from './kai.js';
import { needsInstallHelp, inAppBrowser, isIPad, art1, artMore, art2, art3, art4 } from './installart.js';

// ------------------------------------------------------------------
// Configuración
// ------------------------------------------------------------------
const NAME = 'Cristina';
const CREATOR = 'Kike';
const STORE = 'kai-cristina-v1';
const VERSION = '28/09 20:32'; // se muestra al pie para comprobar qué versión se está usando
const SESSION_LEN = 15;   // preguntas por ronda de práctica
const DIAG_LEN = 24;      // preguntas del diagnóstico
const SIM_LEN = 40;       // preguntas del simulacro
const GOAL_ALL = 0.82;    // nota estimada global para estar lista
const GOAL_TEMA = 0.70;   // nota estimada mínima en cada tema
const GOAL_COVER = 0.8;   // parte de cada tema que hay que haber respondido
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
  return { v: 1, onboarded: false, n: 0, c: {}, q: {}, diag: null, sims: [], readyShown: false, paused: {} };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE));
    if (s && s.v === 1) {
      const st = { ...freshState(), ...s };
      if (!st.c || typeof st.c !== 'object') st.c = {};
      if (!st.q || typeof st.q !== 'object') st.q = {};
      if (!Array.isArray(st.sims)) st.sims = [];
      if (!st.paused || typeof st.paused !== 'object') st.paused = {};
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
    .filter(c => (!filter.tema || c.tema === filter.tema) && (!filter.sec || c.sec === filter.sec) && (!filter.pag || c.pags.has(filter.pag)))
    .map(c => c.id);
}
function seenCount(filter = {}) {
  return conceptIds(filter).filter(id => stat(id)).length;
}
function failedIds(filter = {}) {
  return conceptIds(filter).filter(id => stat(id)?.lastOk === false);
}
const secKey = q => `${q.tema}|${q.seccion}`;
const pagKey = q => `${q.tema}-${q.pagina}`;
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
let priorCache = { n: -1, map: {} };
function priorAcc(sec) {
  if (priorCache.n !== S.n || priorCache.S !== S) priorCache = { n: S.n, S, map: {} };
  if (sec in priorCache.map) return priorCache.map[sec];
  return (priorCache.map[sec] = computePrior(sec));
}
function computePrior(sec) {
  let gOk = 0, gN = 0, ok = 0, n = 0;
  for (const id in S.c) {
    const s = S.c[id];
    if (s.first == null || !CONCEPTS[id]) continue;
    gN++; if (s.first) gOk++;
    if (CONCEPTS[id].sec === sec) { n++; if (s.first) ok++; }
  }
  const g = (gOk + 1) / (gN + 2);
  return Math.min(0.85, (ok + 3 * g) / (n + 3));
}
const weakness = sec => 1 - priorAcc(sec);
// Sabida: acertada a la primera y nunca fallada, o 2+ aciertos seguidos tras fallarla
const known = id => { const s = S.c[id]; return !!s && (s.streak >= MASTERY_STREAK || (s.ko === 0 && s.ok > 0)); };
const mastered = known;

// Probabilidad estimada de acertar un concepto en el examen
function conceptP(id) {
  const s = stat(id);
  if (!s) return priorAcc(CONCEPTS[id].sec); // no visto: se estima por lo que sabe de su apartado
  if (!s.lastOk) return 0.5;                  // último intento fallado (ya vio la corrección)
  if (s.streak >= MASTERY_STREAK) return 0.9;
  // Acertada a la primera (puede haber sido suerte) / recuperada una vez
  return s.ko === 0 ? Math.min(0.9, priorAcc(CONCEPTS[id].sec) + 0.15) : 0.8;
}
// Nota estimada (0-1) si el examen fuera ahora mismo
function estimate(filter = {}) {
  const ids = conceptIds(filter);
  return ids.length ? ids.reduce((a, id) => a + conceptP(id), 0) / ids.length : 0;
}
// Recuento EXACTO por preguntas: total, respondidas alguna vez, bien (última respuesta correcta), mal
function qStats(filter = {}) {
  let total = 0, seen = 0, ok = 0, ko = 0;
  for (const p of DATA.preguntas) {
    if (filter.tema && p.tema !== filter.tema) continue;
    if (filter.sec && secKey(p) !== filter.sec) continue;
    if (filter.pag && pagKey(p) !== filter.pag) continue;
    total++;
    const s = S.q[p.id];
    if (s && s.seen) { seen++; if (s.lastOk) ok++; else ko++; }
  }
  return { total, seen, ok, ko, pSeen: total ? seen / total : 0, pOk: total ? ok / total : 0 };
}
const coverage = (filter = {}) => qStats(filter).pSeen;
// Preguntas que faltan por responder para llegar a la cobertura mínima en cada tema, y tiempo aproximado
// (≈1,4 respuestas por pregunta nueva contando los repasos de fallos; ≈15 s por respuesta)
function remainingWork() {
  let left = 0;
  for (const t of DATA.temas) { const q = qStats({ tema: t.id }); left += Math.max(0, Math.ceil(q.total * GOAL_COVER) - q.seen); }
  const minutes = Math.round(left * 1.4 * 15 / 60);
  return { left, minutes };
}
function fmtTime(min) {
  if (min < 60) return `${Math.max(5, Math.round(min / 5) * 5)} min`;
  const h = Math.round(min / 30) / 2;
  return `${String(h).replace('.', ',')} h`;
}
const MIN_FORECAST = 20; // respuestas mínimas para mostrar la previsión de nota
const hasForecast = () => S.n >= MIN_FORECAST;

function readiness() {
  const all = estimate();
  const temas = DATA.temas.map(t => ({ ...t, d: estimate({ tema: t.id }), cov: coverage({ tema: t.id }) }));
  // Media de los 2 últimos simulacros: uno solo se puede aprobar por suerte
  const last2 = S.sims.slice(-2);
  const lastSim = last2.length ? last2.reduce((a, x) => a + x.score, 0) / last2.length : null;
  const checks = [
    { ok: hasForecast() && all >= GOAL_ALL, label: `Previsión de nota de ${pct(GOAL_ALL)}% o más`, info: hasForecast() ? `ahora: ${pct(all)}%` : `se calcula a partir de ${MIN_FORECAST} respuestas (llevas ${S.n})` },
    { ok: hasForecast() && temas.every(t => t.d >= GOAL_TEMA && t.cov >= GOAL_COVER), label: `Responder al menos el ${pct(GOAL_COVER)}% de cada tema`, info: temas.map(t => { const q = qStats({ tema: t.id }); return `${t.corto}: ${q.seen}/${q.total} (${pct(q.pSeen)}%)`; }).join(' · ') + (remainingWork().left ? ` · faltan ${remainingWork().left} (≈ ${fmtTime(remainingWork().minutes)})` : '') },
    { ok: lastSim !== null && lastSim >= GOAL_SIM, label: `Simulacros con ${pct(GOAL_SIM)}% o más`, info: lastSim === null ? 'sin hacer' : S.sims.length > 1 ? `media de los 2 últimos: ${pct(lastSim)}%` : `último: ${pct(lastSim)}%` },
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
  const failed = cands.filter(id => due(id) && !stat(id).lastOk).sort((a, b) => stat(b).last - stat(a).last);
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
  // Más peso a los apartados flojos y a los grandes (para no agotar primero los pequeños)
  const w = secs.map(s => (Math.pow(weakness(s), 2) + 0.05) * Math.sqrt(bySec[s].length));
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < secs.length; i++) {
    r -= w[i];
    if (r <= 0) return rand(bySec[secs[i]]);
  }
  return rand(bySec[secs[secs.length - 1]]);
}
function pickQuestion(cid, avoid) {
  let qs = shuffle(CONCEPTS[cid].qs).sort((a, b) => (S.q[a]?.seen || 0) - (S.q[b]?.seen || 0));
  // Practicando una página concreta: preferir las preguntas de esa página
  const pg = sess?.filter?.pag;
  if (pg) { const on = qs.filter(id => pagKey(Q[id]) === pg); if (on.length) qs = on; }
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
const OK_MSGS = ['¡Bien!', '¡Exacto!', '¡Eso es!', `¡Genial, ${NAME}!`, '¡Perfecto!', '¡Correcto!', '¡Muy bien!', '¡Toma ya! 💪'];
const KO_MSGS = ['¡Casi! Mira lo que dice el libro:', 'No pasa nada, te la vuelvo a preguntar pronto.', 'Ojo con esta, léela con calma:', 'Esta la repasamos otra vez en un ratito.'];

function homeMessage(r) {
  const failed = failedIds().length;
  if (S.paused.diag) return `Tienes el <b>diagnóstico</b> a medias. Pulsa <b>Continuar</b> para seguir donde lo dejaste.`;
  if (S.paused.sim) return `Tienes un <b>simulacro</b> a medias. Pulsa <b>Continuar</b> para terminarlo cuando quieras.`;
  if (!S.diag) return `Lo primero es el <b>diagnóstico</b>: ${DIAG_LEN} preguntas para saber qué sabes ya y enfocar bien la práctica. ¡Sin presión!`;
  if (r.ready) return `¡Estás <b>lista</b>, ${NAME}!&nbsp;🎉 Si quieres, sigue repasando un poquito para afianzar.`;
  const simFailed = S.sims.length && S.sims.at(-1).score < GOAL_SIM && S.sims.at(-1).n >= S.n - SIM_LEN && failedIds().length > 0;
  if (simFailed) return `En el simulacro sacaste un <b>${pct(S.sims.at(-1).score)}%</b>. Repasa los fallos y sigue estudiando un poco; luego vuelve a intentarlo&nbsp;💪`;
  const covered = r.temas.every(t => t.cov >= GOAL_COVER);
  if (r.all >= GOAL_ALL && covered && r.lastSim === null) return `¡Tu previsión de nota es de un <b>${pct(r.all)}%</b>! Es el momento de hacer un <b>simulacro de examen</b>.`;
  if (r.all >= GOAL_ALL && !covered) return `Lo que has visto lo llevas genial (<b>${pct(r.all)}%</b>). Sigue estudiando para cubrir más temario.`;
  if (failed >= 8) return `Tienes <b>${failed}</b> preguntas falladas pendientes. Si sigues estudiando te las iré repitiendo hasta que salgan solas.`;
  if (!hasForecast() || r.all < 0.3) return `Vamos poco a poco. Pulsa <b>Seguir estudiando</b> y yo elijo las preguntas que más te convienen.`;
  return rand([`¡Vas muy bien! Si el examen fuera ahora, calculo que sacarías un <b>${pct(r.all)}%</b>.`, `Cada pregunta cuenta. ¡Sigue así, ${NAME}!&nbsp;💪`]);
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
    { mood: 'wave happy', html: `<p>¡Hola, <b>${NAME}</b>!&nbsp;👋</p><p>Soy <b>KAI</b>, tu robot de estudio.</p>` },
    { mood: 'think', end: true, html: `<p>Estás dentro de otra app y desde aquí no puedo funcionar.</p><p>Toca <b>···</b> (o la brújula) y elige <b>“Abrir en Safari”</b>. Allí te enseño cómo ponerme en tu pantalla de inicio&nbsp;📲</p>` },
  ];
  return [
    { mood: 'wave happy', html: `<p>¡Hola, <b>${NAME}</b>!&nbsp;👋 Soy <b>KAI</b>, tu robot de estudio. ${CREATOR} me ha creado para ayudarte con tus exámenes&nbsp;💙</p><p>Venga, vamos a instalarme en tu <b>pantalla de inicio</b> para que me tengas siempre a mano. Te enseño&nbsp;📲</p>` },
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
        S.onboarded ? showHome() : showOnboarding(0);
      }
    });
  }
}

// ---------- Onboarding ----------
function onboardingSteps() {
  const total = DATA.preguntas.length;
  const temas = DATA.temas.map(t => `<li><span class="n">${t.emoji}</span><span>${esc(t.nombre)} <span class="muted small">(${DATA.preguntas.filter(p => p.tema === t.id).length} preguntas)</span></span></li>`).join('');
  return [
    { mood: 'wave happy', html: `<p>¡Hola, <b>${NAME}</b>!&nbsp;👋</p><p>Soy <b>KAI</b>, tu robot de estudio.</p>` },
    { mood: 'talk', html: `<p><b>${CREATOR}</b> me ha creado para ayudarte con tus estudios de enfermería.</p><p>Me ha pedido que te cuide mucho&nbsp;💙</p>` },
    { mood: 'think', html: `<p>Me he leído tus apuntes de arriba abajo&nbsp;📚</p><ul class="steps-list">${temas}</ul><p>Las respuestas correctas y las citas salen <b>literalmente de tu libro</b>. No me invento nada.</p>` },
    { mood: 'talk', html: `<p>Así vamos a trabajar:</p><ul class="steps-list">
        <li><span class="n">1</span><span><b>Diagnóstico:</b> lo primero de todo. ${DIAG_LEN} preguntas para ver qué sabes y enfocar tu práctica.</span></li>
        <li><span class="n">2</span><span><b>Práctica inteligente:</b> te pregunto más lo que fallas, hasta que lo domines.</span></li>
        <li><span class="n">3</span><span><b>Simulacro:</b> un examen de prueba para comprobar que estás lista.</span></li></ul>` },
    { mood: 'happy', html: `<p>Después de cada respuesta te enseño <b>la frase exacta del libro</b> y su página.</p><p>Así también aprendes de los fallos&nbsp;😉</p>` },
    { mood: 'think', html: `<p>Para que sepas cómo vas, en el inicio te enseño:</p><ul class="steps-list">
        <li><span class="n">✅</span><span><b>% dominado:</b> preguntas que tienes bien ahora mismo. Empieza en 0% y es exacto.</span></li>
        <li><span class="n">🔮</span><span><b>Previsión de nota:</b> lo que calculo que sacarías hoy. Aparece a partir de ${MIN_FORECAST} respuestas.</span></li>
        <li><span class="n">📝</span><span><b>Simulacros:</b> tu nota en un examen de prueba. Es la pista más real.</span></li></ul>` },
    { mood: 'talk', html: `<p>Te diré <b>¡Estás lista!</b>&nbsp;🎉 cuando cumplas las 3 cosas:</p><ul class="steps-list">
        <li><span class="n">1</span><span>Haber respondido al menos el <b>${pct(GOAL_COVER)}%</b> de cada tema (unas ${remainingWork().left + qStats().seen} preguntas).</span></li>
        <li><span class="n">2</span><span>Una previsión de nota del <b>${pct(GOAL_ALL)}%</b> o más.</span></li>
        <li><span class="n">3</span><span>Sacar de media un <b>${pct(GOAL_SIM)}%</b> o más en tus 2 últimos simulacros.</span></li></ul>
        <p>Calculo que te llevará unas <b>${fmtTime(remainingWork().minutes)}</b> en total.</p>` },
    { mood: 'happy', html: `<p>No hace falta hacerlo de golpe: <b>tu progreso se guarda solo</b> y puedes parar cuando quieras.</p><p>Y si no llegas a "lista", no te agobies: cada pregunta que repasas suma. Fíjate en tu <b>% dominado</b> y en tus <b>simulacros</b>&nbsp;💙</p>` },
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
  const checks = r.checks.map(c => `<li class="${c.ok ? 'done' : ''}"><span class="ck">${c.ok ? '✓' : ''}</span><span>${c.label}<br><span class="muted small">${c.info}</span></span></li>`).join('');
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
        <div><div class="hello">Hola, ${NAME}&nbsp;👋</div><h1>¡A por el examen!</h1></div>
        <button class="icon-btn" id="menu" aria-label="Menú">⚙️</button>
      </div>

      <div class="kai-row">
        <div class="kai-wrap">${kaiSVG()}</div>
        <div class="bubble">${homeMessage(r)}</div>
      </div>

      <div class="card">
        <div class="ready-card">
          <div class="ring" style="--p:${pct(all.pOk)}; --c:${r.ready ? 'var(--ok)' : 'var(--primary)'}"><div class="val"><b>${pct(all.pOk)}%</b><span>dominado</span></div></div>
          <div>
            <h3>${r.ready ? '¡Lista para el examen!&nbsp;🎉' : 'Preparación para el examen'}</h3>
            <p class="muted small" style="font-weight:700;margin-top:2px">${all.ok} de ${all.total} preguntas bien · ${all.seen}&nbsp;respondidas${hasForecast() ? ` · previsión de nota:&nbsp;<b>${pct(r.all)}%</b>` : ''}</p>
            <ul class="checks">${checks}</ul>
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
    <h2>📝&nbsp;Simulacro de examen</h2>
    <p>${SIM_LEN} preguntas de todo el temario. <b>No verás si aciertas hasta el final</b>, como en el examen de verdad.</p>
    ${!hasForecast() || r.all < 0.6 ? `<p class="muted">Consejo de KAI: rinde más cuando tu previsión de nota pase del 60%${hasForecast() ? ` (ahora: ${pct(r.all)}%)` : ''}. Pero puedes hacerlo cuando quieras.</p>` : ''}
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
  try { DOCS = await (await fetch('data/documentos.json', { cache: 'no-cache' })).json(); } catch (e) { DOCS = []; }
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
        <img src="paginas/mini/${esc(d.tema)}-${pg}.jpg" alt="" loading="lazy">
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
      <div class="fb-head"><div class="mini-kai">${kaiSVG()}</div><span>${it.ok ? rand(OK_MSGS) : rand(KO_MSGS)}</span></div>
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
  try { HL = await (await fetch('data/resaltados.json', { cache: 'no-cache' })).json(); } catch (e) { HL = {}; }
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
  const img = hl.img || `paginas/${q.tema}-${q.pagina}.jpg`;
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
    img: `paginas/${key}.jpg`, rects: [],
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
  if (sess.type === 'sim') S.sims.push({ date: Date.now(), score, n: S.n });
  S.cur = null;
  save();

  const r = readiness();
  let title, mood, msg;
  if (sess.type === 'sim') {
    const passed = score >= GOAL_SIM;
    title = passed ? '¡Simulacro aprobado!&nbsp;🎉' : 'Simulacro terminado';
    mood = passed ? 'celebrate' : 'think';
    msg = passed ? `¡Has sacado un ${pct(score)}%! Eso es nivel examen.` : `Has sacado un ${pct(score)}%. Necesitas un ${pct(GOAL_SIM)}% para darlo por superado. Repasa los fallos de abajo y vuelve a intentarlo.`;
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
        <div class="quote">📖&nbsp;${fmtQuote(q.fuente)}<span class="src">${esc(sourceLabel(q))}</span></div>
        <button class="book-btn" data-q="${esc(q.id)}">🔎 Llévame al libro</button>
      </div>`;
    }).join('')}` : '';

  const pending = failedIds().length;
  let again = { practice: 'Otra ronda', diag: 'Empezar a practicar', fallos: 'Seguir repasando fallos', sim: 'Repetir simulacro' }[sess.type];
  let againType = sess.type;
  if (sess.type === 'sim' && score < GOAL_SIM && pending) { again = `Repasar fallos (${pending} pendientes)`; againType = 'fallos'; }
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
        <p style="font-size:24px"><b>¡Estás lista, ${NAME}!</b>&nbsp;🎉</p>
        <p>Tu previsión de nota es de un <b>${pct(r.all)}%</b> y en los simulacros vas con un <b>${pct(r.lastSim)}%</b>.</p>
        <p>Ya puedes dejar de estudiar e ir al examen tranquila. ¡Vas a bordarlo!</p>
        <p>${CREATOR} y yo estamos muy orgullosos de ti&nbsp;💙</p>
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
    await Promise.all(keys.map(k => caches.delete(k)));
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

async function init() {
  render(`<div class="screen loading"><div><div class="kai-mid">${kaiSVG()}</div><p class="muted" style="font-weight:800">KAI se está encendiendo…</p><p class="muted small">Comprobando si hay novedades</p></div></div>`, 'think');
  const [latest] = await Promise.all([latestVersion(), new Promise(r => setTimeout(r, 600))]);
  if (latest && latest !== VERSION && await applyUpdate(latest)) return;
  try {
    const res = await fetch('data/preguntas.json', { cache: 'no-cache' });
    DATA = await res.json();
  } catch (e) {
    render(`<div class="screen loading"><div><div class="kai-mid">${kaiSVG()}</div><p><b>Uy, no he podido cargar las preguntas.</b></p><p class="muted">Comprueba la conexión y recarga la página.</p></div></div>`, 'sad');
    return;
  }
  for (const p of DATA.preguntas) {
    Q[p.id] = p;
    const c = (CONCEPTS[p.concepto] ||= { id: p.concepto, tema: p.tema, seccion: p.seccion, sec: secKey(p), qs: [], pags: new Set() });
    c.qs.push(p.id);
    c.pags.add(pagKey(p));
  }
  S = load();
  pauseCurrent();
  save();
  try { navigator.storage?.persist?.(); } catch (e) { /* opcional */ }
  if (needsInstallHelp() && !browserAllowed()) return showInstallGate(0);
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
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {}));
}

init();

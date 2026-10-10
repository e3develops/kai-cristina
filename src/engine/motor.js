// Motor de estudio de UN examen: modelo de aprendizaje, elección de preguntas y "¿estás lista?".
// No sabe nada de pantallas ni de qué examen es: recibe el examen (formato, nivel), sus preguntas y el progreso.
import { formatoEfectivo, nivel as nivelDe, notaDeProbabilidades, notaDeAciertos, fmtNota } from './nota.js';
import { DAY, retencion, nuevaEstabilidad } from './memoria.js';

export const SESSION_LEN = 15;    // preguntas por ronda de práctica
export const DIAG_LEN = 24;       // preguntas del diagnóstico
export const SIM_LEN = 40;        // preguntas del simulacro
export const MASTERY_STREAK = 2;  // aciertos seguidos para dominar un concepto
export const MIN_FORECAST = 20;   // respuestas mínimas para mostrar la previsión de nota

const pct = x => Math.round(x * 100);
const rand = arr => arr[Math.floor(Math.random() * arr.length)];
export function shuffle(a) {
  const arr = a.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const secKey = q => `${q.tema}|${q.seccion}`;
export const pagKey = q => `${q.tema}-${q.pagina}`;
export const secName = key => key.slice(key.indexOf('|') + 1);

export function fmtTime(min) {
  if (min < 60) return `${Math.max(5, Math.round(min / 5) * 5)} min`;
  const h = Math.round(min / 30) / 2;
  return `${String(h).replace('.', ',')} h`;
}

/**
 * @param examen  { formato: { opciones, penalizacion }, nivel: 'facil' | 'medio' | 'pro' }
 * @param data    { temas: [...], preguntas: [...] }
 * @param state   progreso guardado (ver estado.js)
 * @param save    función que guarda el progreso
 * @param now     reloj (ms); se cambia en las simulaciones
 */
export function createEngine({ examen, data, state, save, now = () => Date.now() }) {
  let S = state;
  const formato = formatoEfectivo(examen.formato);
  const azar = 1 / formato.opciones;
  // Día del examen (a las 9:00). Sin fecha, o si ya pasó, las previsiones son para "hoy".
  const fechaExamen = examen.fecha ? new Date(`${examen.fecha}T09:00:00`).getTime() : null;
  const momentoExamen = () => (fechaExamen && fechaExamen > now() ? fechaExamen : now());
  migrate(S);
  const N = nivelDe(examen.nivel);
  const Q = {};        // id -> pregunta
  const CONCEPTS = {}; // id -> { id, tema, seccion, sec, qs: [ids], pags: Set }
  for (const p of data.preguntas) {
    Q[p.id] = p;
    const c = (CONCEPTS[p.concepto] ||= { id: p.concepto, tema: p.tema, seccion: p.seccion, sec: secKey(p), qs: [], pags: new Set() });
    c.qs.push(p.id);
    c.pags.add(pagKey(p));
  }
  // Preguntas que entran en el nivel elegido (sin importancia marcada cuentan como imprescindibles)
  const enNivel = p => (p.importancia ?? 3) >= N.importanciaMin;

  const stat = id => S.c[id];

  // Progreso guardado antes de que existiera el olvido: sin fecha ni estabilidad por concepto.
  // Se toma como fecha la última conocida (diagnóstico o simulacros) y una estabilidad según cómo iba.
  function migrate(st) {
    const dates = [st.diag?.date, ...st.sims.map(x => x.date)].filter(Boolean);
    const fallback = dates.length ? Math.max(...dates) : now();
    for (const id in st.c) {
      const c = st.c[id];
      if (c.t == null) c.t = fallback;
      if (c.stab == null) c.stab = !c.lastOk ? 0.5 : c.streak >= MASTERY_STREAK ? 6 : 3;
    }
  }

  function conceptIds(filter = {}) {
    return Object.values(CONCEPTS)
      .filter(c => (!filter.tema || c.tema === filter.tema) && (!filter.sec || c.sec === filter.sec) && (!filter.pag || c.pags.has(filter.pag)))
      .map(c => c.id);
  }
  const seenCount = (filter = {}) => conceptIds(filter).filter(id => stat(id)).length;
  const failedIds = (filter = {}) => conceptIds(filter).filter(id => stat(id)?.lastOk === false);

  // Claves de apartado (tema|sección) en orden de aparición
  function sections(tema) {
    const seen = new Set();
    const out = [];
    for (const p of data.preguntas) {
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
  const mastered = id => { const s = S.c[id]; return !!s && (s.streak >= MASTERY_STREAK || (s.ko === 0 && s.ok > 0)); };

  // Lo mejor que puede ir un concepto justo después de repasarlo, según cómo lo lleva
  function techo(id) {
    const s = stat(id);
    if (!s.lastOk) return 0.5;                  // último intento fallado (ya vio la corrección)
    if (s.streak >= 4) return 0.97;             // recuperado bien muchas veces: muy asentado
    if (s.streak >= 3) return 0.95;
    if (s.streak >= MASTERY_STREAK) return 0.9;
    // Acertada a la primera (puede haber sido suerte) / recuperada una vez
    return s.ko === 0 ? Math.min(0.9, priorAcc(CONCEPTS[id].sec) + 0.15) : 0.8;
  }
  // Cuánto se recuerda en el momento `at` (1 = recién repasado)
  const recuerdo = (id, at = now()) => { const s = stat(id); return retencion((at - s.t) / DAY, s.stab); };
  // Probabilidad estimada de acertar un concepto en el momento `at`: lo aprendido se va
  // olvidando hacia el azar (o hacia lo que ya sabía de su apartado, si era más)
  function conceptP(id, at = now()) {
    const s = stat(id);
    const prior = priorAcc(CONCEPTS[id].sec);
    if (!s) return prior; // no visto: se estima por lo que sabe de su apartado
    const fondo = Math.max(azar, Math.min(prior, techo(id)));
    return fondo + (techo(id) - fondo) * recuerdo(id, at);
  }
  // Probabilidad media de acierto (0-1) y nota estimada (0-10) en el momento `at` (por defecto, ahora)
  const probs = (filter = {}, at) => conceptIds(filter).map(id => conceptP(id, at));
  function estimate(filter = {}, at) {
    const ps = probs(filter, at);
    return ps.length ? ps.reduce((a, p) => a + p, 0) / ps.length : 0;
  }
  const nota = (filter = {}, at) => notaDeProbabilidades(probs(filter, at), formato);

  // Recuento EXACTO por preguntas: total, respondidas alguna vez, bien (última respuesta correcta), mal
  function qStats(filter = {}) {
    let total = 0, seen = 0, ok = 0, ko = 0;
    for (const p of data.preguntas) {
      if (filter.tema && p.tema !== filter.tema) continue;
      if (filter.sec && secKey(p) !== filter.sec) continue;
      if (filter.pag && pagKey(p) !== filter.pag) continue;
      if (filter.nivel && !enNivel(p)) continue;
      total++;
      const s = S.q[p.id];
      if (s && s.seen) { seen++; if (s.lastOk) ok++; else ko++; }
    }
    return { total, seen, ok, ko, pSeen: total ? seen / total : 0, pOk: total ? ok / total : 0 };
  }
  const coverage = (filter = {}) => qStats({ ...filter, nivel: true }).pSeen;

  // Preguntas que faltan por responder para llegar a la cobertura mínima en cada tema, y tiempo aproximado
  // (≈1,4 respuestas por pregunta nueva contando los repasos de fallos; ≈15 s por respuesta)
  function remainingWork() {
    let left = 0;
    for (const t of data.temas) { const q = qStats({ tema: t.id, nivel: true }); left += Math.max(0, Math.ceil(q.total * N.cobertura) - q.seen); }
    const minutes = Math.round(left * 1.4 * 15 / 60);
    return { left, minutes };
  }
  const hasForecast = () => S.n >= MIN_FORECAST;
  const simNota = sim => notaDeAciertos(sim.score, formato);

  // Margen de la previsión: más ancho con poca información, e inclinado hacia abajo porque la
  // calibración (tools/calibrar.mjs) muestra que KAI tiende a pasarse más que a quedarse corto.
  function margen(diasHastaExamen) {
    const sims = S.sims.length;
    const m = { abajo: sims >= 2 ? 0.9 : sims === 1 ? 1.0 : 1.1, arriba: 0.5 };
    m.abajo += 0.3 * Math.min(diasHastaExamen, 8);      // cuantos más días faltan, más puede olvidar
    if (S.n < 150) { m.abajo += 0.5; m.arriba += 0.5; } // aún sé poco de cómo va
    const escala = 1 + formato.penalizacion;            // si los fallos restan, la nota se mueve más
    return { abajo: m.abajo * escala, arriba: m.arriba * escala };
  }
  const medio = x => Math.min(10, Math.max(0, Math.round(x * 2) / 2));
  const rango = (n, m) => ({ min: medio(n - m.abajo), max: Math.max(medio(n - m.abajo), medio(n + m.arriba)) });

  // "¿Estás lista?" se mide para el día del examen (contando lo que se olvidará hasta entonces)
  function readiness() {
    const at = momentoExamen();
    const futuro = at > now();
    const all = estimate({}, at);
    const notaAll = nota({}, at);
    const notaHoy = futuro ? nota() : notaAll;
    const temas = data.temas.map(t => ({ ...t, d: estimate({ tema: t.id }, at), nota: nota({ tema: t.id }, at), cov: coverage({ tema: t.id }) }));
    // Media de los últimos simulacros que pide el nivel: uno solo se puede aprobar por suerte
    const lastN = S.sims.slice(-N.sims);
    const lastSim = lastN.length ? lastN.reduce((a, x) => a + simNota(x), 0) / lastN.length : null;
    const work = remainingWork();
    const checks = [
      { id: 'nota', ok: hasForecast() && notaAll >= N.nota, label: `Nota estimada${futuro ? ' para el día del examen' : ''} de ${fmtNota(N.nota)} o más`, info: !hasForecast() ? `se calcula a partir de ${MIN_FORECAST} respuestas (llevas ${S.n})` : futuro ? `ese día: ${fmtNota(notaAll)} · hoy: ${fmtNota(notaHoy)}` : `ahora: ${fmtNota(notaAll)}` },
      { id: 'cobertura', ok: hasForecast() && temas.every(t => t.nota >= N.notaTema && t.cov >= N.cobertura), label: `Responder al menos el ${pct(N.cobertura)}% de cada tema`, info: temas.map(t => { const q = qStats({ tema: t.id, nivel: true }); return `${t.corto}: ${q.seen}/${q.total} (${pct(q.pSeen)}%)`; }).join(' · ') + (work.left ? ` · faltan ${work.left} (≈ ${fmtTime(work.minutes)})` : '') },
      { id: 'sims', ok: lastSim !== null && lastN.length >= N.sims && lastSim >= N.notaSim, label: `Simulacros con ${fmtNota(N.notaSim)} o más`, info: lastSim === null ? 'sin hacer' : lastN.length > 1 ? `media de los ${lastN.length} últimos: ${fmtNota(lastSim)}` : `último: ${fmtNota(lastSim)}${N.sims > 1 ? ` (hacen falta ${N.sims})` : ''}` },
    ];
    const dias = futuro ? (at - now()) / DAY : 0;
    const m = margen(dias);
    return {
      all, nota: notaAll, notaHoy, futuro, fechaExamen, dias, margen: m,
      rango: rango(notaAll, m), rangoHoy: rango(notaHoy, margen(0)),
      temas, lastSim, checks, ready: checks.every(c => c.ok),
    };
  }

  function record(qid, ok) {
    const q = Q[qid];
    const t = now();
    S.n++;
    const c = S.c[q.concepto] || (S.c[q.concepto] = { seen: 0, ok: 0, ko: 0, streak: 0, due: 0, last: -1, lastOk: null, first: null });
    if (c.first == null) c.first = ok;
    c.stab = nuevaEstabilidad(c.stab, ok, c.t == null ? null : (t - c.t) / DAY);
    c.t = t;
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
    const t = now();
    // Toca repasarlo: le llega el turno en esta tanda, o se está olvidando (por debajo del 85 % de recuerdo)
    const due = id => stat(id) && (stat(id).due <= n || (stat(id).lastOk && recuerdo(id, t) < 0.85));
    const byDue = (a, b) => stat(a).due - stat(b).due;

    const elige = (id, motivo) => { lastPick = { id, motivo, recuerdo: stat(id) ? recuerdo(id, t) : null }; return id; };

    // Intercalar: tras un repaso, si queda temario sin ver, toca una nueva
    const fresh = cands.filter(id => !stat(id));
    if (preferNew && fresh.length) return elige(pickWeakSection(fresh), 'nueva');

    // 1) Fallos que ya tocan (siempre primero)
    const failed = cands.filter(id => due(id) && !stat(id).lastOk).sort((a, b) => stat(b).last - stat(a).last);
    if (failed.length) return elige(failed[0], 'fallo');
    // 2) Fallos recuperados que hay que confirmar
    const confirming = cands.filter(id => due(id) && stat(id).ko > 0 && stat(id).streak < MASTERY_STREAK).sort(byDue);
    if (confirming.length) return elige(confirming[0], 'confirmar');
    // 3) Contenido nuevo, priorizando los apartados más flojos (con algún repaso suelto)
    const unseen = cands.filter(id => !stat(id));
    const reviews = cands.filter(due).sort((a, b) => recuerdo(a, t) - recuerdo(b, t)); // lo más olvidado primero
    if (unseen.length && !(reviews.length && Math.random() < 0.1)) return elige(pickWeakSection(unseen), 'nueva');
    // 4) Repasos pendientes
    if (reviews.length) return elige(reviews[0], recuerdo(reviews[0], t) < 0.85 ? 'olvido' : 'repaso');
    // 5) Todo visto y nada pendiente: lo que antes toque
    return elige(cands.filter(id => stat(id)).sort(byDue)[0] || cands[0], 'todo-visto');
  }
  let lastPick = null; // por qué se eligió el último concepto (para el "¿por qué esta pregunta?")
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
  // pag: practicando una página concreta, se prefieren las preguntas de esa página
  function pickQuestion(cid, avoid, pag) {
    let qs = shuffle(CONCEPTS[cid].qs).sort((a, b) => (S.q[a]?.seen || 0) - (S.q[b]?.seen || 0));
    if (pag) { const on = qs.filter(id => pagKey(Q[id]) === pag); if (on.length) qs = on; }
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
  const buildSim = () => shuffle(conceptIds()).slice(0, SIM_LEN).map(cid => pickQuestion(cid));

  return {
    data, Q, formato, nivel: N,
    get state() { return S; },
    get lastPick() { return lastPick; },
    sectionWeakness: sec => 1 - priorAcc(sec),
    reset(newState) { S = newState; save(); },
    conceptIds, seenCount, failedIds, sections, mastered, estimate, nota, qStats, coverage,
    remainingWork, hasForecast, simNota, readiness, record, pickConcept, pickQuestion, buildDiag, buildSim,
  };
}

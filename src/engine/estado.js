// Progreso de un examen guardado en el dispositivo (localStorage). En la fase 1 se sincronizará con la BD.

export function freshState() {
  return { v: 1, onboarded: false, n: 0, c: {}, q: {}, diag: null, sims: [], readyShown: false, paused: {}, nivel: null, nivelDesde: 0 };
}

export function loadState(key) {
  try {
    const s = JSON.parse(localStorage.getItem(key));
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

export function saveState(key, state) {
  state.u = Date.now(); // última modificación (para sincronizar entre dispositivos)
  try { localStorage.setItem(key, JSON.stringify(state)); } catch (e) { /* sin almacenamiento */ }
}

// Junta el progreso de dos dispositivos sin perder nada: de cada concepto y pregunta se queda
// la versión más reciente (o con más respuestas), los simulacros se suman y lo "a medias"
// (rondas pausadas) se toma del estado modificado más tarde.
// Si alguien reinició su progreso (campo `reinicio`, fecha), se descarta todo lo anterior a esa fecha.
export function mergeState(a, b) {
  if (!a) return b;
  if (!b) return a;
  const newer = (b.u || 0) > (a.u || 0) ? b : a;
  const out = { ...freshState(), ...newer };
  const reinicio = Math.max(a.reinicio || 0, b.reinicio || 0);
  if (reinicio) {
    const limpia = s => (s.reinicio || 0) >= reinicio ? s : {
      ...s, n: 0, onboarded: s.onboarded, readyShown: false, diag: null, paused: {},
      c: Object.fromEntries(Object.entries(s.c || {}).filter(([, x]) => (x.t || 0) >= reinicio)),
      q: Object.fromEntries(Object.entries(s.q || {}).filter(([, x]) => (x.t || 0) >= reinicio)),
      sims: (s.sims || []).filter(x => x.date >= reinicio),
    };
    a = limpia(a); b = limpia(b);
    out.reinicio = reinicio;
  }
  out.n = Math.max(a.n || 0, b.n || 0);
  out.onboarded = !!(a.onboarded || b.onboarded);
  // Nivel: gana el cambio de nivel más reciente; el "¡a punto!" solo vale si se vio en ese nivel
  out.nivelDesde = Math.max(a.nivelDesde || 0, b.nivelDesde || 0);
  out.nivel = ((b.nivelDesde || 0) > (a.nivelDesde || 0) ? b.nivel : a.nivel) || a.nivel || b.nivel || null;
  out.readyShown = [a, b].some(s => s.readyShown && (s.nivelDesde || 0) >= out.nivelDesde);
  out.u = Math.max(a.u || 0, b.u || 0);
  out.c = {};
  for (const id of new Set([...Object.keys(a.c || {}), ...Object.keys(b.c || {})])) {
    const x = a.c?.[id], y = b.c?.[id];
    out.c[id] = !x ? y : !y ? x : ((y.t || 0) > (x.t || 0) || ((y.t || 0) === (x.t || 0) && y.seen > x.seen)) ? y : x;
  }
  out.q = {};
  for (const id of new Set([...Object.keys(a.q || {}), ...Object.keys(b.q || {})])) {
    const x = a.q?.[id], y = b.q?.[id];
    out.q[id] = !x ? y : !y ? x : (y.seen > x.seen ? y : x);
  }
  const sims = new Map();
  for (const s of [...(a.sims || []), ...(b.sims || [])]) sims.set(`${s.date}|${s.score}`, s);
  out.sims = [...sims.values()].sort((x, y) => x.date - y.date);
  out.diag = [a.diag, b.diag].filter(Boolean).sort((x, y) => y.date - x.date)[0] || null;
  return out;
}

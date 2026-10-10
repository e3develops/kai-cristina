// Progreso de un examen guardado en el dispositivo (localStorage). En la fase 1 se sincronizará con la BD.

export function freshState() {
  return { v: 1, onboarded: false, n: 0, c: {}, q: {}, diag: null, sims: [], readyShown: false, paused: {} };
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
  try { localStorage.setItem(key, JSON.stringify(state)); } catch (e) { /* sin almacenamiento */ }
}

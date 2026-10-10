// Calibración con estudiantes simulados: ¿la nota que KAI estima para el día del examen se parece
// a la que el estudiante sacaría de verdad ese día?
// Uso: node tools/calibrar.mjs [nº de estudiantes por perfil] [penalización: 0 | 0.333]
//
// El estudiante simulado tiene un conocimiento "verdadero" por concepto que:
//  - empieza según su base (lo que ya sabía), nunca por debajo del azar;
//  - sube al responder: mucho al fallar y leer la corrección, algo al acertar;
//  - se olvida con los días con una curva exponencial (distinta a la del motor, a propósito,
//    para no comprobar el modelo contra sí mismo).
// Es un modelo inventado: sirve para detectar sesgos gordos y comparar planes de estudio,
// no para afinar décimas. Eso lo harán las notas reales.
import { readFileSync } from 'node:fs';
import { createEngine } from '../src/engine/motor.js';
import { freshState } from '../src/engine/estado.js';
import { formatoEfectivo, notaDeProbabilidades, fmtNota } from '../src/engine/nota.js';
import { MEMORIA } from '../src/engine/memoria.js';

// Para probar otros parámetros del motor: MEM='{"sAcierto":2}' node tools/calibrar.mjs
if (process.env.MEM) Object.assign(MEMORIA, JSON.parse(process.env.MEM));

const data = JSON.parse(readFileSync(new URL('../public/data/preguntas.json', import.meta.url), 'utf8'));
const N_EST = Number(process.argv[2]) || 5;
const FORMATO = { opciones: 4, penalizacion: Number(process.argv[3] ?? 0) };
const f = formatoEfectivo(FORMATO);
const CHANCE = 1 / f.opciones;
const DAY = 86400000, SEG_RESPUESTA = 15;
const T0 = new Date('2026-01-05T17:00:00').getTime();
// Estabilidad (días) del estudiante simulado tras la primera vez: acertada / fallada y corregida
const STAB_OK = Number(process.env.STAB_OK) || 4, STAB_KO = Number(process.env.STAB_KO) || 1.5;

let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
Math.random = rnd; // el motor también usa Math.random

// Planes: minutos de estudio por día (día 0 = primer día) y día del examen
const PLANES = {
  'intensivo (como Cris: ~6 h en día y medio)': { dias: [225, 135], examen: 2 },
  'repartido (45 min al día, 10 días)': { dias: Array(10).fill(45), examen: 10 },
  'repartido + 5 días sin repasar': { dias: Array(10).fill(45), examen: 15 },
  'a por todas (90 min al día, 12 días)': { dias: Array(12).fill(90), examen: 12 },
};

function makeStudent(base) {
  const k = {}, k0 = {}, last = {}, stab = {};
  // Lo que ya sabía antes de estudiar: el olvido nunca baja de ahí
  const prev = cid => k0[cid] ?? (k0[cid] = Math.max(CHANCE, Math.min(0.95, base + (rnd() - 0.5) * 0.5)));
  const pAt = (cid, t) => {
    const p0 = prev(cid);
    if (last[cid] == null) return p0;
    return p0 + (k[cid] - p0) * Math.exp(-(t - last[cid]) / DAY / stab[cid]);
  };
  return {
    pAt,
    answer(cid, t) {
      const p = pAt(cid, t);
      const ok = rnd() < p;
      const R = last[cid] == null ? 1 : Math.exp(-(t - last[cid]) / DAY / stab[cid]);
      k[cid] = ok ? p + (1 - p) * 0.35 : p + (1 - p) * 0.55;
      stab[cid] = stab[cid] == null ? (ok ? STAB_OK : STAB_KO) : ok ? stab[cid] * (1.3 + 2.5 * (1 - R)) : Math.max(STAB_KO, stab[cid] * 0.4);
      last[cid] = t;
      return ok;
    },
  };
}

function runStudent(base, plan) {
  const state = freshState();
  let clock = T0;
  const fecha = new Date(T0 + plan.examen * DAY).toISOString().slice(0, 10);
  const E = createEngine({ examen: { formato: FORMATO, nivel: process.env.NIVEL || 'medio', fecha }, data, state, save() {}, now: () => clock });
  const st = makeStudent(base);
  const pool = E.conceptIds();
  let recent = [], prevNew = false;
  const answer = qid => { E.record(qid, st.answer(E.Q[qid].concepto, clock)); clock += SEG_RESPUESTA * 1000; };
  const tExamen = new Date(`${fecha}T09:00:00`).getTime();
  const realSiPara = () => notaDeProbabilidades(pool.map(cid => st.pAt(cid, tExamen)), f); // si dejara de estudiar ya
  const checks = []; // ¿la nota real cae dentro del rango que da KAI?
  const check = () => { if (!E.hasForecast()) return; const r = E.readiness(); const real = realSiPara(); checks.push({ sims: state.sims.length, dentro: real >= r.rango.min - 1e-9 && real <= r.rango.max + 1e-9, debajo: real < r.rango.min, ancho: r.rango.max - r.rango.min }); };

  plan.dias.forEach((min, d) => {
    clock = T0 + d * DAY;
    if (d === 0) E.buildDiag().forEach(answer);
    const fin = clock + min * 60000;
    while (clock < fin) {
      const cid = E.pickConcept(pool, recent, prevNew);
      prevNew = !state.c[cid];
      answer(E.pickQuestion(cid));
      recent = [cid, ...recent].slice(0, 4);
      if ((state.n % 150) === 0) check();
    }
    check();
    // Último día de estudio: 2 simulacros, como haría quien quiere comprobar si está lista
    if (d === plan.dias.length - 1) {
      for (let k = 0; k < 2; k++) {
        let okN = 0; const qs = E.buildSim();
        for (const qid of qs) { const ok = st.answer(E.Q[qid].concepto, clock); if (ok) okN++; E.record(qid, ok); clock += SEG_RESPUESTA * 1000; }
        state.sims.push({ date: clock, score: okN / qs.length, n: state.n });
        check();
      }
    }
  });
  const r = E.readiness(); // previsión para el día del examen
  const real = realSiPara();
  return { est: r.nota, hoy: r.notaHoy, real, ready: r.ready, n: state.n, checks };
}

const todos = [];
console.log(`Formato: ${f.opciones} opciones, penalización ${f.penalizacion.toFixed(2)} · ${N_EST} estudiantes por perfil`);
for (const [nombre, plan] of Object.entries(PLANES)) {
  console.log(`\n=== ${nombre} ===`);
  for (const [perfil, base] of [['floja', 0.3], ['media', 0.5], ['buena', 0.7]]) {
    const rs = Array.from({ length: N_EST }, () => runStudent(base, plan));
    rs.forEach(r => todos.push(...r.checks));
    const avg = k => rs.reduce((a, r) => a + r[k], 0) / rs.length;
    const bias = rs.reduce((a, r) => a + r.est - r.real, 0) / rs.length;
    const lista = rs.filter(r => r.ready);
    console.log(`${perfil.padEnd(6)} hoy ${fmtNota(avg('hoy')).padStart(4)} · día del examen: estimada ${fmtNota(avg('est')).padStart(4)} / real ${fmtNota(avg('real')).padStart(4)} (sesgo ${bias >= 0 ? '+' : ''}${bias.toFixed(2)})` +
      ` · "lista": ${lista.length}/${rs.length}${lista.length ? ` (real de esas: ${fmtNota(lista.reduce((a, r) => a + r.real, 0) / lista.length)})` : ''}`);
  }
}

// Rango: ¿cuántas veces cae la nota real dentro del rango que enseña KAI?
console.log('\n=== Rango ===');
for (const [nombre, sel] of [['sin simulacros', c => c.sims === 0], ['con 1 simulacro', c => c.sims === 1], ['con 2+', c => c.sims >= 2]]) {
  const cs = todos.filter(sel);
  if (!cs.length) continue;
  const pc = k => Math.round(100 * cs.filter(c => c[k]).length / cs.length);
  console.log(`${nombre.padEnd(16)} dentro: ${pc('dentro')}% · por debajo: ${pc('debajo')}% · ancho medio: ${(cs.reduce((a, c) => a + c.ancho, 0) / cs.length).toFixed(1)} (${cs.length} previsiones)`);
}

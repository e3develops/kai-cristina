import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEngine, SIM_LEN } from '../src/engine/motor.js';
import { formatoEfectivo, notaDeAciertos, notaDeProbabilidades, fmtNota, describeFormato } from '../src/engine/nota.js';
import { freshState, mergeState } from '../src/engine/estado.js';
import { retencion, nuevaEstabilidad, MEMORIA } from '../src/engine/memoria.js';

const data = JSON.parse(readFileSync(new URL('../contenido/cap28-taller2/preguntas.json', import.meta.url), 'utf8'));
const examen = { formato: { opciones: 4, penalizacion: null }, nivel: 'medio' };

test('formato "no lo sé": 4 opciones y cada fallo resta 1/3', () => {
  const f = formatoEfectivo({ opciones: 4, penalizacion: null });
  assert.equal(f.supuesto, true);
  assert.ok(Math.abs(f.penalizacion - 1 / 3) < 1e-9);
  assert.equal(describeFormato(f), 'tipo test de 4 opciones, cada fallo resta 1/3 (supuesto)');
});

test('nota de un simulacro según si resta o no', () => {
  assert.equal(fmtNota(notaDeAciertos(0.82, formatoEfectivo({ penalizacion: 1 / 3 }))), '7,6');
  assert.equal(fmtNota(notaDeAciertos(0.82, formatoEfectivo({ penalizacion: 0 }))), '8,2');
  assert.equal(notaDeAciertos(0.1, formatoEfectivo({ penalizacion: 1 / 3 })), 0); // nunca negativa
});

test('lo que no compensa contestar cuenta como en blanco', () => {
  const f = formatoEfectivo({ penalizacion: 1 / 3 });
  assert.equal(notaDeProbabilidades([0.2, 0.2], f), 0);
  assert.equal(notaDeProbabilidades([1, 0.2], f), 5);
});

// Azar con semilla: el estudiante simulado es siempre el mismo (si no, el test falla de vez en cuando por mala suerte)
// (y con reloj simulado: el olvido depende de la hora, así que también se fija; cada lectura avanza 20 s)
function conSemilla(semilla, fn) {
  const original = Math.random, ahoraReal = Date.now;
  let reloj = Date.UTC(2026, 0, 1);
  Date.now = () => (reloj += 20000);
  let t = semilla >>> 0;
  Math.random = () => { t = (t + 0x6D2B79F5) >>> 0; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
  try { return fn(); } finally { Math.random = original; Date.now = ahoraReal; }
}

// Estudiante simulado: acierta cada concepto con probabilidad p (que sube un poco al repasarlo)
function simulate(pBase, answers, semilla = 1) {
  return conSemilla(semilla, () => simular(pBase, answers));
}
function simular(pBase, answers) {
  const state = freshState();
  const E = createEngine({ examen, data, state, save() {} });
  const skill = {};
  const pool = E.conceptIds();
  let recent = [];
  let prevNew = false;
  for (let i = 0; i < answers; i++) {
    const cid = E.pickConcept(pool, recent, prevNew);
    const qid = E.pickQuestion(cid);
    prevNew = !E.state.c[cid];
    const p = Math.min(0.98, (skill[cid] ?? pBase));
    const ok = Math.random() < p;
    skill[cid] = Math.min(0.98, p + (ok ? 0.05 : 0.25)); // tras ver la corrección, aprende
    E.record(qid, ok);
    recent = [cid, ...recent].slice(0, 4);
  }
  for (let k = 0; k < 2; k++) {
    const qs = E.buildSim();
    let okN = 0;
    for (const qid of qs) { const ok = Math.random() < Math.min(0.98, skill[E.Q[qid].concepto] ?? pBase); if (ok) okN++; E.record(qid, ok); }
    state.sims.push({ date: Date.now(), score: okN / qs.length, n: state.n });
  }
  return E.readiness();
}

test('sin progreso: no está lista y no hay nota que enseñar', () => {
  const E = createEngine({ examen, data, state: freshState(), save() {} });
  const r = E.readiness();
  assert.equal(r.ready, false);
  assert.equal(E.hasForecast(), false);
  assert.equal(r.lastSim, null);
});

test('quien estudia todo el temario llega a "lista" en Medio', () => {
  // 5 estudiantes simuladas: alguna puede tener un simulacro con mala suerte, pero casi todas llegan
  const rs = [1, 2, 3, 4, 5].map(semilla => simulate(0.75, 1600, semilla));
  const listas = rs.filter(r => r.ready).length;
  assert.ok(listas >= 4, JSON.stringify(rs.map(r => r.checks.map(c => [c.label, c.ok, c.info]))));
  for (const r of rs) assert.ok(r.nota >= 7.5);
});

test('quien apenas estudia no llega a "lista"', () => {
  const r = simulate(0.5, 150);
  assert.equal(r.ready, false);
});

test('olvido: el recuerdo baja con los días y repasar espaciado asienta más', () => {
  assert.ok(retencion(0, 2) === 1);
  assert.ok(retencion(10, 2) < retencion(1, 2));
  const masivo = nuevaEstabilidad(2, true, 0.01);  // repasada a los pocos minutos
  const espaciado = nuevaEstabilidad(2, true, 4);  // repasada a los 4 días
  assert.ok(espaciado > masivo && masivo > 2);
  assert.equal(nuevaEstabilidad(10, false, 3), MEMORIA.sFallo);
});

test('la previsión para un examen dentro de 10 días es menor que la de hoy', () => {
  const t0 = new Date('2026-03-02T18:00:00').getTime();
  let clock = t0;
  const fecha = '2026-03-12';
  const E = createEngine({ examen: { ...examen, fecha }, data, state: freshState(), save() {}, now: () => clock });
  for (const cid of E.conceptIds().slice(0, 300)) { E.record(E.pickQuestion(cid), true); clock += 15000; }
  const r = E.readiness();
  assert.equal(r.futuro, true);
  assert.ok(r.nota < r.notaHoy, `${r.nota} < ${r.notaHoy}`);
});

test('progreso antiguo sin fechas: se le asigna fecha y estabilidad', () => {
  const state = freshState();
  state.diag = { date: 1000, score: 0.5 };
  state.c = { x: { seen: 2, ok: 2, ko: 0, streak: 2, due: 0, last: 3, lastOk: true, first: true } };
  createEngine({ examen, data, state, save() {} });
  assert.equal(state.c.x.t, 1000);
  assert.equal(state.c.x.stab, 6);
});

test('sincronizar: de cada concepto gana lo más reciente y los simulacros se suman', () => {
  const movil = { ...freshState(), n: 10, u: 200, c: { a: { t: 100, seen: 1 }, b: { t: 300, seen: 2 } }, q: { p1: { seen: 1, t: 100 } }, sims: [{ date: 1, score: 0.5 }] };
  const pc = { ...freshState(), n: 7, u: 100, c: { a: { t: 200, seen: 3 } }, q: { p1: { seen: 3, t: 200 } }, sims: [{ date: 2, score: 0.9 }, { date: 1, score: 0.5 }] };
  const m = mergeState(movil, pc);
  assert.equal(m.c.a.seen, 3);
  assert.equal(m.c.b.seen, 2);
  assert.equal(m.q.p1.seen, 3);
  assert.equal(m.sims.length, 2);
  assert.equal(m.n, 10);
  assert.deepEqual(mergeState(pc, movil).c, m.c); // da igual el orden
});

test('reiniciar el progreso en un dispositivo no se deshace al sincronizar con otro', () => {
  const viejo = { ...freshState(), u: 100, diag: { date: 50, score: 0.5 }, c: { a: { t: 100, seen: 4 } }, q: { p1: { seen: 4, t: 100 } }, sims: [{ date: 90, score: 0.8 }] };
  const reiniciado = { ...freshState(), u: 500, reinicio: 400, onboarded: true, c: { b: { t: 450, seen: 1 } } };
  const m = mergeState(viejo, reiniciado);
  assert.deepEqual(Object.keys(m.c), ['b']);
  assert.deepEqual(m.q, {});
  assert.equal(m.sims.length, 0);
  assert.equal(m.diag, null);
  assert.equal(m.reinicio, 400);
});

test('simulacros antiguos (solo con % de aciertos) siguen contando', () => {
  const state = freshState();
  state.sims = [{ date: 1, score: 0.9, n: 0 }, { date: 2, score: 0.85, n: 0 }];
  const E = createEngine({ examen, data, state, save() {} });
  assert.ok(Math.abs(E.readiness().lastSim - (notaDeAciertos(0.9, E.formato) + notaDeAciertos(0.85, E.formato)) / 2) < 1e-9);
  assert.equal(SIM_LEN, 40);
});

test('subir de nivel: lo sabido se queda, pero los simulacros del nivel anterior no cuentan', () => {
  const state = freshState();
  const E = createEngine({ examen, data, state, save() {} });
  state.sims.push({ date: 1000, score: 1, n: 0 }, { date: 2000, score: 1, n: 0 });
  assert.equal(E.readiness().lastSim, 10);
  state.nivelDesde = 3000; // sube de nivel después de esos simulacros
  assert.equal(E.readiness().lastSim, null);
  state.sims.push({ date: 4000, score: 0.5, n: 0 });
  assert.ok(E.readiness().lastSim < 10);
});

test('sincronizar tras subir de nivel: gana el nivel nuevo y el "¡a punto!" antiguo no vale', () => {
  const viejo = { ...freshState(), nivel: 'medio', nivelDesde: 0, readyShown: true, u: 5 };
  const nuevo = { ...freshState(), nivel: 'pro', nivelDesde: 100, readyShown: false, u: 3 };
  const m = mergeState(viejo, nuevo);
  assert.equal(m.nivel, 'pro');
  assert.equal(m.nivelDesde, 100);
  assert.equal(m.readyShown, false);
});

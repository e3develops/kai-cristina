import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEngine, SIM_LEN } from '../src/engine/motor.js';
import { formatoEfectivo, notaDeAciertos, notaDeProbabilidades, fmtNota, describeFormato } from '../src/engine/nota.js';
import { freshState } from '../src/engine/estado.js';
import { retencion, nuevaEstabilidad, MEMORIA } from '../src/engine/memoria.js';

const data = JSON.parse(readFileSync(new URL('../public/data/preguntas.json', import.meta.url), 'utf8'));
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

// Estudiante simulado: acierta cada concepto con probabilidad p (que sube un poco al repasarlo)
function simulate(pBase, answers) {
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
  const r = simulate(0.75, 1600);
  assert.equal(r.ready, true, JSON.stringify(r.checks.map(c => [c.label, c.ok, c.info])));
  assert.ok(r.nota >= 7.5);
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

test('simulacros antiguos (solo con % de aciertos) siguen contando', () => {
  const state = freshState();
  state.sims = [{ date: 1, score: 0.9, n: 0 }, { date: 2, score: 0.85, n: 0 }];
  const E = createEngine({ examen, data, state, save() {} });
  assert.ok(Math.abs(E.readiness().lastSim - (notaDeAciertos(0.9, E.formato) + notaDeAciertos(0.85, E.formato)) / 2) < 1e-9);
  assert.equal(SIM_LEN, 40);
});

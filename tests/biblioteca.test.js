import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recomendar, diasHasta, planDe } from '../src/engine/recomendar.js';
import { validarExamen, validarAsignatura } from '../worker/validar.js';

const AHORA = new Date('2026-10-12T10:00:00').getTime();
const ex = (id, fecha, resumen, extra = {}) => ({ id, nombre: id, fecha, nivel: 'medio', estado: 'listo', notaReal: null, resumen, ...extra });
const res = (nota, minutos, listo = false) => ({ nota, rango: { min: nota - 1, max: nota }, minutos, listo, respuestas: 200 });

test('días hasta el examen', () => {
  assert.equal(diasHasta('2026-10-12', AHORA), 0);
  assert.equal(diasHasta('2026-10-13', AHORA), 1);
  assert.equal(diasHasta('2026-10-30', AHORA), 18);
  assert.equal(diasHasta(null, AHORA), null);
});

test('recomienda el examen que más aprieta', () => {
  const r = recomendar([ex('anatomia', '2026-10-30', res(5, 300)), ex('biologia', '2026-10-17', res(6, 120))], AHORA);
  assert.equal(r.examen.id, 'biologia');
  assert.equal(r.minutosHoy, 25); // 120 min en 5 días
  assert.ok(r.motivos.some(m => m.includes('en 5 días')));
  assert.equal(r.otros[0].examen.id, 'anatomia');
});

test('un examen ya listo pasa detrás de uno que no lo está', () => {
  const r = recomendar([ex('listo', '2026-10-14', res(8.5, 0, true)), ex('flojo', '2026-10-20', res(5, 200))], AHORA);
  assert.equal(r.examen.id, 'flojo');
});

test('ignora exámenes pasados, con nota o sin preparar; sin nada que hacer devuelve null', () => {
  const lista = [
    ex('pasado', '2026-10-01', res(5, 100)),
    ex('con-nota', '2026-10-20', res(5, 100), { notaReal: 7 }),
    ex('pendiente', '2026-10-20', null, { estado: 'pendiente' }),
  ];
  assert.equal(recomendar(lista, AHORA), null);
  assert.equal(recomendar([ex('listo-lejos', '2026-11-30', res(8.5, 0, true))], AHORA), null);
});

test('sin empezar: lo primero es el diagnóstico', () => {
  const r = recomendar([ex('nuevo', '2026-10-22', null)], AHORA);
  assert.ok(r.motivos.some(m => m.includes('diagnóstico')));
  assert.equal(planDe(ex('nuevo', '2026-10-22', null), AHORA).minutosDia, 20); // 180 min en 10 días → 20
});

test('validación de asignaturas y exámenes', () => {
  assert.equal(validarAsignatura({ nombre: '  ' }).ok, false);
  assert.deepEqual(validarAsignatura({ nombre: 'Biología', emoji: '🧬', color: 'morado' }).datos, { nombre: 'Biología', emoji: '🧬', color: 'morado' });
  assert.equal(validarAsignatura({ nombre: 'X', emoji: '<script>' }).datos.emoji, '📘');
  const v = validarExamen({ nombre: 'Tema 1', fecha: '2026-10-17', formato: { opciones: 4, penalizacion: null } });
  assert.deepEqual(v.datos, { nombre: 'Tema 1', fecha: '2026-10-17', opciones: 4, penalizacion: null, nivel: 'medio' });
  assert.equal(validarExamen({ nombre: 'T', fecha: '17/10/2026' }).ok, false);
  assert.equal(validarExamen({ nota_real: 11 }, true).ok, false);
  assert.equal(validarExamen({ nota_real: 7.25 }, true).datos.nota_real, 7.25);
});

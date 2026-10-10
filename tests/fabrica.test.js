import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localizar, normaliza, UMBRAL } from '../tools/subrayar.mjs';
import { validarPregunta } from '../tools/fabrica.mjs';

const pagina = 'Dar a los pacientes la oportunidad de demostrar procedimientos como la higiene de las manos revela su capacidad de entender y cumplir el tratamiento.'
  .split(' ').map((t, i) => ({ t, b: [i / 30, 0.1, 0.03, 0.01] }));

test('normaliza quita tildes y signos', () => {
  assert.equal(normaliza('¿Higiene, enfermería?'), 'higiene enfermeria');
});

test('encuentra una cita literal y devuelve las cajas de sus palabras', () => {
  const r = localizar('la higiene de las manos revela su capacidad', pagina);
  assert.equal(r.score, 1);
  assert.equal(r.rects.length, 8);
});

test('tolera errores pequeños del OCR', () => {
  const ocr = pagina.map(w => (w.t === 'procedimientos' ? { ...w, t: 'procedimíentos' } : w.t === 'capacidad' ? { ...w, t: 'capacldad' } : w));
  assert.ok(localizar('demostrar procedimientos como la higiene de las manos revela su capacidad', ocr).score >= UMBRAL);
});

test('regla de oro: una frase inventada no pasa', () => {
  assert.ok(localizar('los antibióticos curan todas las infecciones víricas en tres días', pagina).score < UMBRAL);
});

test('validar pregunta: campos, 4 opciones distintas, correcta e importancia', () => {
  const ok = { id: 'a', tema: 'fotos', seccion: 'S', concepto: 'c', pregunta: '¿Qué revela…?', opciones: ['a', 'b', 'c', 'd'], correcta: 2, fuente: 'x', pagina: 1, importancia: 3 };
  assert.equal(validarPregunta(ok), null);
  assert.match(validarPregunta({ ...ok, opciones: ['a', 'a', 'c', 'd'] }), /repetidas/);
  assert.match(validarPregunta({ ...ok, correcta: 4 }), /correcta/);
  assert.match(validarPregunta({ ...ok, importancia: 5 }), /importancia/);
  assert.match(validarPregunta({ ...ok, pregunta: '' }), /pregunta/);
});

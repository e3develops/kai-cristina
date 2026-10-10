// Nota sobre 10 según el formato del examen, y lo que pide cada nivel para darlo por superado.

// Formato: { opciones, penalizacion } — penalizacion = parte de un acierto que resta cada fallo
// (0 = no resta; 1/3 = lo típico con 4 opciones). null = "no lo sé": se asume lo prudente.
export function formatoEfectivo(f = {}) {
  const opciones = Number(f?.opciones) || 4;
  const supuesto = f?.penalizacion == null;
  const penalizacion = supuesto ? 1 / (opciones - 1) : Math.max(0, Number(f.penalizacion) || 0);
  return { opciones, penalizacion, supuesto };
}

// Puntos esperados en una pregunta con probabilidad p de acertarla. Si contestar resta más de lo
// que suma, lo sensato es dejarla en blanco (0 puntos).
export const puntosEsperados = (p, f) => Math.max(0, p - (1 - p) * f.penalizacion);

// Nota (0-10) a partir de la probabilidad de acierto de cada pregunta
export function notaDeProbabilidades(ps, f) {
  if (!ps.length) return 0;
  return 10 * ps.reduce((a, p) => a + puntosEsperados(p, f), 0) / ps.length;
}

// Nota (0-10) de un simulacro respondido entero, a partir de su % de aciertos
export const notaDeAciertos = (score, f) => 10 * Math.max(0, score - (1 - score) * f.penalizacion);

export const fmtNota = x => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');

export function describeFormato(f) {
  const resta = f.penalizacion === 0 ? 'los fallos no restan'
    : `cada fallo resta ${Math.abs(f.penalizacion - 1 / 3) < 1e-6 ? '1/3' : Math.abs(f.penalizacion - 1 / 4) < 1e-6 ? '1/4' : Math.abs(f.penalizacion - 1 / 2) < 1e-6 ? '1/2' : String(Math.round(f.penalizacion * 100) / 100).replace('.', ',')}`;
  return `tipo test de ${f.opciones} opciones, ${resta}${f.supuesto ? ' (supuesto)' : ''}`;
}

// Niveles: qué importancia mínima entra (★★★ = 3, ★★ = 2, ★ = 1) y qué hace falta para superarlo.
// Comprobadas con estudiantes simulados (tools/calibrar.mjs): quien llega a "lista" en Medio saca de
// verdad 7-8,6, y en Pro ~9. Se recalibrarán con las notas reales de los exámenes.
export const NIVELES = {
  facil: { id: 'facil', nombre: 'Fácil', promete: '5-6', importanciaMin: 3, nota: 6.0, notaTema: 5.0, cobertura: 1.0, sims: 1, notaSim: 6.0 },
  medio: { id: 'medio', nombre: 'Medio', promete: '7-8', importanciaMin: 2, nota: 7.5, notaTema: 6.0, cobertura: 0.8, sims: 2, notaSim: 7.5 },
  pro: { id: 'pro', nombre: 'Pro', promete: '9-10', importanciaMin: 1, nota: 9.0, notaTema: 8.0, cobertura: 0.95, sims: 2, notaSim: 9.0 },
};
export const nivel = id => NIVELES[id] || NIVELES.medio;

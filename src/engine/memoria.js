// Olvido: cada concepto tiene una "estabilidad" S en días (cuánto tarda su recuerdo en bajar al 90 %).
// Forma tomada de FSRS (el algoritmo de repaso de Anki): retención R = 1 / (1 + días / (9·S)).
// La estabilidad crece al recuperar bien un concepto, y más cuanto más espaciado es el repaso
// (repasar algo que tienes fresquísimo apenas la sube).
// Valores elegidos con tools/calibrar.mjs (estudiantes simulados que olvidan rápido y despacio): algo más
// prudentes que los de FSRS para no prometer de más. Se ajustarán con las notas reales.
export const DAY = 24 * 60 * 60 * 1000;

export const MEMORIA = {
  sAcierto: 1.5,     // días: acertada a la primera (FSRS "bien" ≈ 3,2)
  sFallo: 0.3,       // días: tras fallarla y leer la corrección (FSRS "otra vez" ≈ 0,4)
  sMax: 365,
  crecimientoBase: 0.2,      // lo que crece S siempre que se acierta
  crecimientoEspaciado: 2.5, // lo que crece de más según cuánto se había olvidado al repasarla
};

export const retencion = (dias, S) => 1 / (1 + Math.max(0, dias) / (9 * S));

// Nueva estabilidad tras responder. dias = tiempo desde el repaso anterior (null si es la primera vez).
export function nuevaEstabilidad(S, ok, dias) {
  if (!ok) return MEMORIA.sFallo;
  if (S == null || dias == null) return MEMORIA.sAcierto;
  const R = retencion(dias, S);
  return Math.min(MEMORIA.sMax, S * (1 + MEMORIA.crecimientoBase + MEMORIA.crecimientoEspaciado * (1 - R)));
}

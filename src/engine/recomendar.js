// "Te recomiendo que le metamos caña a…": qué examen toca hoy, cuántos minutos y por qué.
// Trabaja con el resumen que cada examen guarda al sincronizar (sin cargar sus preguntas).
import { fmtNota, nivel as nivelDe } from './nota.js';
import { fmtTime } from './motor.js';

const DIA = 86400000;
const SIN_EMPEZAR_MIN = 180; // estimación para un examen sin empezar (se afina en cuanto haya diagnóstico)

// Días que faltan para una fecha AAAA-MM-DD (0 = hoy, negativo = ya pasó)
export function diasHasta(fecha, ahora = Date.now()) {
  if (!fecha) return null;
  const hoy = new Date(ahora); hoy.setHours(0, 0, 0, 0);
  const dia = new Date(`${fecha}T00:00:00`);
  return Math.round((dia - hoy) / DIA);
}
export const fmtDias = d => (d === 0 ? 'hoy' : d === 1 ? 'mañana' : `en ${d} días`);
const fmtRango = r => (r.min === r.max ? fmtNota(r.min) : `${fmtNota(r.min)}–${fmtNota(r.max)}`);
const redondea5 = m => Math.max(5, Math.round(m / 5) * 5);

// Ritmo que necesita un examen: minutos al día hasta la fecha (o en dos semanas si no tiene fecha)
export function planDe(e, ahora = Date.now()) {
  const dias = diasHasta(e.fecha, ahora);
  const r = e.resumen;
  const empezado = !!(r && r.respuestas > 0);
  const minutos = empezado ? r.minutos : SIN_EMPEZAR_MIN;
  const listo = empezado && r.listo;
  const plazo = dias == null ? 14 : Math.max(1, dias); // el mismo día del examen cuenta como 1
  let minutosDia = listo ? (dias != null && dias <= 3 ? 10 : 0) : minutos / plazo;
  return { dias, empezado, listo, minutos, minutosDia: minutosDia > 0 ? Math.min(120, redondea5(minutosDia)) : 0 };
}

/**
 * @param examenes lista de la API (con estado, fecha, nivel, notaReal y resumen)
 * @returns null si no hay nada que estudiar, o { examen, minutosHoy, motivos: [html], otros: [{ examen, texto }] }
 */
export function recomendar(examenes, ahora = Date.now()) {
  const cands = examenes
    .filter(e => e.estado === 'listo' && e.notaReal == null)
    .map(e => ({ e, p: planDe(e, ahora) }))
    .filter(({ p }) => p.dias == null || p.dias >= 0);
  if (!cands.length) return null;
  for (const c of cands) {
    const r = c.e.resumen;
    const objetivo = nivelDe(c.e.nivel).nota;
    const hueco = r && r.respuestas > 0 ? Math.max(0, objetivo - r.nota) : objetivo;
    // Urgencia: ritmo necesario + cercanía del examen + lo que falta para el objetivo
    // (un examen ya listo solo necesita mantenimiento: no compite con los que van flojos)
    c.score = c.p.minutosDia + (!c.p.listo && c.p.dias != null && c.p.dias <= 2 ? 30 : 0) + hueco * 4 - (c.p.dias == null ? 10 : 0);
  }
  cands.sort((a, b) => b.score - a.score);
  const top = cands[0];
  if (top.p.listo && top.p.minutosDia === 0) return null; // todo al día

  const { e, p } = top;
  const r = e.resumen;
  const N = nivelDe(e.nivel);
  const motivos = [];
  motivos.push(p.dias == null ? 'Aún no tiene fecha, así que voy con calma.' : `Es <b>${fmtDias(p.dias)}</b>.`);
  if (!p.empezado) motivos.push('Aún no lo has empezado: lo primero es el diagnóstico, para saber de dónde partimos.');
  else if (p.listo) motivos.push('Ya estás lista 🎉 Un repaso corto para que no se te olvide antes del examen.');
  else {
    motivos.push(`Calculo que ahora sacarías <b>${fmtRango(r.rango)}</b> y el objetivo del nivel ${N.nombre} es un <b>${fmtNota(N.nota)}</b>.`);
    motivos.push(`Te quedan unas <b>${fmtTime(p.minutos)}</b> de estudio${p.dias != null ? `: con <b>${p.minutosDia} min al día</b> llegas` : ''}.`);
  }
  const otros = cands.slice(1, 4).map(({ e: o, p: op }) => ({
    examen: o,
    texto: op.listo ? 'ya lo llevas listo' : op.dias == null ? 'sin fecha' : op.minutosDia <= 15 ? `${fmtDias(op.dias)}: hay tiempo` : `${fmtDias(op.dias)}: ${op.minutosDia} min al día`,
  }));
  return { examen: e, minutosHoy: Math.max(10, p.minutosDia || 10), motivos, otros };
}

// Validación de lo que llega a la API (sin dependencias: se prueba con node --test)
export const EMOJIS = ['📘', '🧬', '🦴', '🫀', '🧠', '💊', '🩺', '🧪', '🦠', '🍎', '📐', '🌍', '🗣️', '🎨', '⚖️', '💻'];
export const COLORES = ['verde', 'azul', 'morado', 'rosa', 'naranja', 'gris'];
export const NIVELES = ['facil', 'medio', 'pro'];

const texto = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const fechaValida = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime());

// Devuelve { ok: true, datos } o { ok: false, error }. parcial = solo los campos presentes (para editar)
export function validarAsignatura(b, parcial = false) {
  const d = {};
  if (!parcial || 'nombre' in b) {
    d.nombre = texto(b.nombre, 60);
    if (!d.nombre) return { ok: false, error: 'Ponle un nombre a la asignatura.' };
  }
  if (!parcial || 'emoji' in b) d.emoji = EMOJIS.includes(b.emoji) ? b.emoji : EMOJIS[0];
  if (!parcial || 'color' in b) d.color = COLORES.includes(b.color) ? b.color : COLORES[0];
  return { ok: true, datos: d };
}

export function validarExamen(b, parcial = false) {
  const d = {};
  if (!parcial || 'nombre' in b) {
    d.nombre = texto(b.nombre, 80);
    if (!d.nombre) return { ok: false, error: 'Ponle un nombre al examen.' };
  }
  if (!parcial || 'fecha' in b) {
    if (b.fecha == null || b.fecha === '') d.fecha = null;
    else if (fechaValida(b.fecha)) d.fecha = b.fecha;
    else return { ok: false, error: 'La fecha no es válida.' };
  }
  if (!parcial || 'formato' in b) {
    const f = b.formato || {};
    const opciones = Number(f.opciones);
    d.opciones = [2, 3, 4, 5].includes(opciones) ? opciones : 4;
    const p = f.penalizacion;
    if (p === null || p === undefined || p === '') d.penalizacion = null;
    else if (Number.isFinite(Number(p)) && Number(p) >= 0 && Number(p) <= 1) d.penalizacion = Number(p);
    else return { ok: false, error: 'La penalización no es válida.' };
  }
  if (!parcial || 'nivel' in b) d.nivel = NIVELES.includes(b.nivel) ? b.nivel : 'medio';
  if ('asignatura' in b) d.asignatura_id = typeof b.asignatura === 'string' && b.asignatura ? b.asignatura : null;
  if ('nota_real' in b) {
    if (b.nota_real === null) d.nota_real = null;
    else if (Number.isFinite(Number(b.nota_real)) && Number(b.nota_real) >= 0 && Number(b.nota_real) <= 10) d.nota_real = Math.round(Number(b.nota_real) * 100) / 100;
    else return { ok: false, error: 'La nota tiene que estar entre 0 y 10.' };
  }
  if ('prevision' in b) d.prevision = b.prevision && typeof b.prevision === 'object' ? JSON.stringify(b.prevision).slice(0, 2000) : null;
  return { ok: true, datos: d };
}

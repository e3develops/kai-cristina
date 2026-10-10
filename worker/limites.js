// Límites de las subidas: con el tope global, el almacenamiento nunca pasa de lo gratuito de R2 (10 GB).
export const LIMITES = {
  porArchivo: 20 * 1024 * 1024,        // 20 MB por archivo (las fotos llegan ya comprimidas)
  porUsuario: 300 * 1024 * 1024,       // 300 MB por cuenta
  global: 8 * 1024 * 1024 * 1024,      // 8 GB entre todos (margen sobre los 10 GB gratis)
  subidasPorHora: 60,                  // por cuenta
  archivosPorExamen: 80,
};

export const TIPOS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

const mb = b => `${Math.round(b / 1024 / 1024)} MB`;

/** ¿Se puede subir este archivo? Devuelve null si sí, o el motivo (para enseñarlo) si no. */
export function motivoRechazo({ tipo, bytes, usadoUsuario, usadoGlobal, subidasUltimaHora, archivosExamen }) {
  if (!TIPOS[tipo]) return 'Solo se pueden subir fotos (JPG, PNG, WebP) o PDF.';
  if (!bytes) return 'El archivo está vacío.';
  if (bytes > LIMITES.porArchivo) return `El archivo pesa demasiado (máximo ${mb(LIMITES.porArchivo)}). Si es un PDF muy grande, divídelo en partes.`;
  if (usadoGlobal + bytes > LIMITES.global) return 'Ahora mismo no se pueden subir más apuntes. Estamos ampliando espacio: inténtalo más adelante.';
  if (usadoUsuario + bytes > LIMITES.porUsuario) return `Has llegado al límite de ${mb(LIMITES.porUsuario)} de apuntes. Borra los de exámenes que ya hayas hecho para liberar espacio.`;
  if (subidasUltimaHora >= LIMITES.subidasPorHora) return 'Has subido muchos archivos seguidos. Espera un rato y sigue.';
  if (archivosExamen >= LIMITES.archivosPorExamen) return `Un examen puede tener como mucho ${LIMITES.archivosPorExamen} archivos.`;
  return null;
}

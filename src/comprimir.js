// Reduce las fotos en el propio móvil antes de subirlas: de ~4-10 MB a ~1 MB.
// No se baja más porque el OCR de la fábrica necesita letra con resolución suficiente.
const LADO_MAX = 2600;  // px del lado largo
const CALIDAD = 0.85;

export async function comprimirImagen(file) {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const k = Math.min(1, LADO_MAX / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', CALIDAD));
    // Si por lo que sea sale más grande (foto ya pequeña), se sube la original
    return blob && blob.size < file.size ? blob : file;
  } catch (e) {
    return file; // formato que el navegador no sabe abrir: se intenta subir tal cual
  }
}

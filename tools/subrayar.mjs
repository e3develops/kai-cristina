// La regla de oro de la fábrica: la IA elige frases del documento y aquí se comprueba que existen.
// Busca la cita entre las palabras de una página (con su caja) tolerando los errores típicos del OCR
// (letras mal leídas, palabras pegadas, columnas mezcladas) y devuelve las cajas para subrayarla.

// Minúsculas, sin tildes ni signos: "¿Higiene?" → "higiene"
export const normaliza = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]+/g, ' ').trim();
const letras = s => normaliza(s).replace(/ /g, '');

// Trozos de línea: el OCR puede leer de un tirón dos columnas como una sola línea, así que cada
// línea se parte donde hay un hueco horizontal grande. Cada trozo es una línea de UNA columna.
function trozos(palabras) {
  const out = [];
  let t = null;
  palabras.forEach((w, i) => {
    const prev = palabras[i - 1];
    const [x, y, ancho, alto] = w.b;
    const otraLinea = !prev || (w.l ?? Math.round(y * 200)) !== (prev.l ?? Math.round(prev.b[1] * 200));
    const hueco = prev && x - (prev.b[0] + prev.b[2]) > Math.max(0.015, 1.2 * alto);
    if (otraLinea || hueco || (prev && x < prev.b[0])) out.push(t = { x, y, x2: x + ancho, alto, ids: [] });
    t.ids.push(i);
    t.x2 = Math.max(t.x2, x + ancho);
    t.y = Math.min(t.y, y);
    t.alto = Math.max(t.alto, alto);
  });
  return out;
}

// La línea que sigue a un trozo en su misma columna: justo debajo y solapando en horizontal
function siguiente(t, todos) {
  let mejor = null;
  for (const c of todos) {
    if (c === t || c.y <= t.y + t.alto * 0.4 || c.y > t.y + t.alto * 3.5) continue;
    if (c.x >= t.x2 || c.x2 <= t.x || Math.abs(c.x - t.x) > 0.12) continue;
    if (!mejor || c.y < mejor.y - 1e-4 || (Math.abs(c.y - mejor.y) < 1e-4 && Math.abs(c.x - t.x) < Math.abs(mejor.x - t.x))) mejor = c;
  }
  return mejor;
}

// Sellers: la menor distancia de edición entre la cita (p) y cualquier trozo del texto
function sellers(p, texto) {
  const m = p.length;
  let prev = new Int32Array(m + 1), cur = new Int32Array(m + 1);
  let prevIni = new Int32Array(m + 1), curIni = new Int32Array(m + 1);
  for (let i = 0; i <= m; i++) prev[i] = i;
  let mejor = { d: m, fin: -1, ini: 0 };
  for (let j = 1; j <= texto.length; j++) {
    cur[0] = 0; curIni[0] = j;
    const c = texto.charCodeAt(j - 1);
    for (let i = 1; i <= m; i++) {
      const sust = prev[i - 1] + (p.charCodeAt(i - 1) === c ? 0 : 1);
      const borr = prev[i] + 1, ins = cur[i - 1] + 1;
      if (sust <= borr && sust <= ins) { cur[i] = sust; curIni[i] = i === 1 ? j - 1 : prevIni[i - 1]; }
      else if (borr <= ins) { cur[i] = borr; curIni[i] = prevIni[i]; }
      else { cur[i] = ins; curIni[i] = curIni[i - 1]; }
    }
    if (cur[m] < mejor.d) mejor = { d: cur[m], fin: j, ini: curIni[m] };
    [prev, cur] = [cur, prev];
    [prevIni, curIni] = [curIni, prevIni];
  }
  return mejor;
}

/**
 * @param cita      texto literal que debe estar en la página
 * @param palabras  [{ t: texto, b: [x, y, w, h], l?: nº de línea del OCR }] (fracciones de la página)
 * @returns { score: 0-1 (1 = idéntica), rects: [[x, y, w, h]...] }
 */
export function localizar(cita, palabras) {
  const p = letras(cita);
  if (!p.length || !palabras.length) return { score: 0, rects: [] };
  const ts = trozos(palabras);
  const inicio = letras(cita.split(/\s+/).slice(0, 3).join(' ')).slice(0, 6);
  let mejor = { score: 0, ids: [] };
  // Se prueba a leer desde cada palabra que se parezca al principio de la cita, siguiendo su columna
  ts.forEach(t => t.ids.forEach((id, k) => {
    const w = letras(palabras[id].t);
    if (!w || (!inicio.startsWith(w.slice(0, 3)) && !w.includes(inicio.slice(0, 4)))) return;
    let texto = '', deQue = [], tr = t, desde = k, pasos = 0;
    while (tr && texto.length < p.length * 1.4 + 10 && pasos++ < 40) {
      for (const i of tr.ids.slice(desde)) { const l = letras(palabras[i].t); texto += l; for (let c = 0; c < l.length; c++) deQue.push(i); }
      tr = siguiente(tr, ts); desde = 0;
    }
    const r = sellers(p, texto);
    const score = Math.max(0, 1 - r.d / p.length);
    if (score > mejor.score) mejor = { score, ids: [...new Set(deQue.slice(r.ini, r.fin))] };
  }));
  return { score: mejor.score, rects: mejor.ids.sort((a, b) => a - b).map(i => palabras[i].b) };
}

export const UMBRAL = 0.8; // parecido mínimo (letra a letra) para dar la cita por buena

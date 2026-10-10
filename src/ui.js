// Piezas de interfaz comunes a la biblioteca y al estudio de un examen
import { setKaiMood } from './kai.js';

export const app = document.getElementById('app');
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Bloquea los toques unos ms tras cada cambio de pantalla: evita que un doble toque
// "atraviese" y pulse lo que aparece debajo del dedo en la pantalla nueva
export function guardTaps(el, ms = 400) {
  el.style.pointerEvents = 'none';
  setTimeout(() => { el.style.pointerEvents = ''; }, ms);
}

// Al cambiar de pantalla se avisa (p. ej. para cancelar temporizadores de la pantalla anterior)
const alCambiar = new Set();
export const onRender = fn => alCambiar.add(fn);
export function render(html, mood) {
  alCambiar.forEach(fn => fn());
  app.innerHTML = html;
  if (mood) setKaiMood(app, mood);
  window.scrollTo(0, 0);
  guardTaps(app);
}

export function modal(html, bind) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">${html}</div>`;
  bg.addEventListener('click', e => { if (e.target === bg) bg.remove(); });
  document.body.appendChild(bg);
  guardTaps(bg);
  bind(bg, () => bg.remove());
}

// Aviso breve abajo (p. ej. "Necesitas conexión")
export function aviso(texto, ms = 2800) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = texto;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

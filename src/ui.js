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

// Quita un elemento con su animación de salida (clase .out); por si acaso, también a los 260 ms
export function salir(el, then) {
  if (!el || el.classList.contains('out')) return;
  el.classList.add('out');
  let hecho = false;
  const fin = () => { if (hecho) return; hecho = true; el.remove(); then?.(); };
  el.addEventListener('animationend', e => { if (e.target === el) fin(); });
  setTimeout(fin, 260);
}

export function modal(html, bind) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  const tecla = e => { if (e.key === 'Escape') close(); };
  const close = () => { document.removeEventListener('keydown', tecla); salir(bg); };
  bg.addEventListener('click', e => { if (e.target === bg) close(); });
  document.addEventListener('keydown', tecla);
  document.body.appendChild(bg);
  guardTaps(bg);
  bind(bg, close);
  setTimeout(() => bg.querySelector('input, .btn')?.focus({ preventScroll: true }), 50);
}

// Pregunta de sí/no con el estilo de KAI (sustituye al confirm() gris del sistema)
export function confirmar({ titulo, texto = '', si = 'Sí', no = 'Cancelar', peligro = false }) {
  return new Promise(res => {
    let respondido = false;
    modal(`
      <h2>${titulo}</h2>
      ${texto ? `<p>${texto}</p>` : ''}
      <button class="btn ${peligro ? 'peligro-lleno' : ''}" data-a="si">${si}</button>
      <button class="btn ghost" data-a="no">${no}</button>`, (el, close) => {
      const r = v => { if (respondido) return; respondido = true; close(); res(v); };
      el.querySelector('[data-a=si]').onclick = () => r(true);
      el.querySelector('[data-a=no]').onclick = () => r(false);
      new MutationObserver((_, obs) => { if (!el.isConnected) { obs.disconnect(); r(false); } }).observe(document.body, { childList: true });
    });
  });
}

// Aviso breve abajo (p. ej. "Necesitas conexión"); se puede cerrar tocándolo
export function aviso(texto, ms = 2800) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = texto;
  t.onclick = () => salir(t);
  document.body.appendChild(t);
  setTimeout(() => salir(t), ms);
}

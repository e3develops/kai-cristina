// Easter eggs y vida de KAI: toques, baile, mimos, siesta, noche, ojos que siguen el dedo,
// rachas de aciertos y el mensaje secreto de Kike (3 toques en la cruz roja).
import { kaiSVG } from './kai.js';

const PHRASES = ['¡Uy! 😳', '¡Cosquillas!', '¡Estoy aquí contigo! 💙', '¿Otra rondita?', '¡Tú puedes!', 'Beep boop 🤖', '¡Me encanta estudiar contigo!', '¡Hola, Cristina! 👋'];
const IDLE_MS = 60 * 1000;
const isNight = () => { const h = new Date().getHours(); return h >= 23 || h < 6; };
const visible = svg => { const r = svg.getBoundingClientRect(); return r.width > 0 && r.bottom > 0 && r.top < innerHeight; };
const allKai = () => [...document.querySelectorAll('svg.kai')].filter(visible);
const mainKai = () => allKai().sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];

// Clase temporal (reinicia la animación si ya estaba)
function pulse(svg, cls, ms) {
  svg.classList.remove(cls);
  void svg.getBoundingClientRect();
  svg.classList.add(cls);
  svg._kt = svg._kt || {};
  clearTimeout(svg._kt[cls]);
  svg._kt[cls] = setTimeout(() => svg.classList.remove(cls), ms);
}
function say(svg, text) {
  if (!svg) return;
  document.querySelectorAll('.kai-say').forEach(e => e.remove());
  const r = svg.getBoundingClientRect();
  const b = document.createElement('div');
  b.className = 'kai-say';
  b.textContent = text;
  b.style.left = `${Math.min(innerWidth - 80, Math.max(80, r.left + r.width / 2))}px`;
  b.style.top = `${Math.max(40, r.top + r.height * 0.04)}px`;
  document.body.appendChild(b);
  setTimeout(() => b.remove(), 2300);
}
function sparkle(svg, emojis, n = 6) {
  const r = svg.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const e = document.createElement('div');
    e.className = 'kai-fx';
    e.textContent = emojis[i % emojis.length];
    e.style.left = `${r.left + r.width * (0.2 + Math.random() * 0.6)}px`;
    e.style.top = `${r.top + r.height * (0.15 + Math.random() * 0.3)}px`;
    e.style.setProperty('--dx', `${(Math.random() - 0.5) * 80}px`);
    e.style.setProperty('--rot', `${(Math.random() - 0.5) * 60}deg`);
    e.style.animationDelay = `${i * 0.12}s`;
    document.body.appendChild(e);
    setTimeout(() => e.remove(), 1800 + i * 120);
  }
}
function toast(text) {
  document.querySelectorAll('.kai-toast').forEach(e => e.remove());
  const t = document.createElement('div');
  t.className = 'kai-toast';
  t.textContent = text;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

// ---------- Mensaje secreto ----------
function secret() {
  if (document.querySelector('.secret')) return;
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal secret" role="dialog" aria-label="Mensaje secreto">
      ${kaiSVG('love')}
      <p class="s-hint">Uy… parece que has descubierto un <b>mensaje secreto</b>&nbsp;👀</p>
      <div class="s-letter">Hola mi amor!! 💕, has pillado un truquito que he dejado en la app jeje. Espero que te esté ayudando mucho y seguro que sacas una súper nota. Te quiero.<span class="s-sign">Kike&nbsp;❤️</span></div>
      <button class="btn" data-a="close">🥰 Cerrar</button>
    </div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.addEventListener('click', e => { if (e.target === bg) close(); });
  bg.querySelector('[data-a=close]').onclick = close;
  setTimeout(() => { const k = bg.querySelector('svg.kai'); if (k) sparkle(k, ['💕', '❤️', '💖'], 10); }, 250);
}

// ---------- Toques, pulsación larga ----------
let taps = 0, lastTap = 0, crossTaps = 0, lastCross = 0, pressTimer = null, suppressClick = false;

document.addEventListener('pointerdown', e => {
  const svg = e.target.closest?.('svg.kai');
  if (!svg) return;
  clearTimeout(pressTimer);
  pressTimer = setTimeout(() => {
    suppressClick = true;
    pulse(svg, 'love', 2600);
    sparkle(svg, ['💕', '💖', '❤️'], 7);
    say(svg, '¡Qué mimos! 🥰');
  }, 600);
}, true);
['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => document.addEventListener(ev, () => clearTimeout(pressTimer), true));

document.addEventListener('click', e => {
  const svg = e.target.closest?.('svg.kai');
  if (!svg) return;
  if (suppressClick) { suppressClick = false; return; }
  const now = Date.now();

  // 3 toques en la cruz roja del pecho → mensaje secreto
  if (e.target.closest('.k-cross')) {
    crossTaps = now - lastCross < 1500 ? crossTaps + 1 : 1;
    lastCross = now;
    if (crossTaps >= 3) { crossTaps = 0; taps = 0; pulse(svg, 'oops', 500); setTimeout(secret, 350); return; }
  }

  // 5 toques rápidos → baile
  taps = now - lastTap < 1200 ? taps + 1 : 1;
  lastTap = now;
  if (taps >= 5) {
    taps = 0;
    pulse(svg, 'dance', 4200);
    sparkle(svg, ['🎵', '🎶', '✨'], 9);
    say(svg, '¡A bailar! 🕺');
    return;
  }
  pulse(svg, 'oops', 520);
  if (taps === 1) say(svg, PHRASES[Math.floor(Math.random() * PHRASES.length)]);
});

// ---------- Ojos que siguen el dedo / el ratón ----------
let lookRaf = 0, lookReset = null, px = 0, py = 0;
function look() {
  lookRaf = 0;
  for (const svg of allKai()) {
    const r = svg.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height * 0.34;
    const dx = px - cx, dy = py - cy, d = Math.hypot(dx, dy) || 1;
    const k = Math.min(1, d / 160) * 5;
    svg.style.setProperty('--kx', `${(dx / d) * k}px`);
    svg.style.setProperty('--ky', `${(dy / d) * k}px`);
  }
  clearTimeout(lookReset);
  lookReset = setTimeout(() => allKai().forEach(s => { s.style.setProperty('--kx', '0px'); s.style.setProperty('--ky', '0px'); }), 2500);
}
function onPoint(e) {
  const p = e.touches ? e.touches[0] : e;
  if (!p) return;
  px = p.clientX; py = p.clientY;
  if (!lookRaf) lookRaf = requestAnimationFrame(look);
}
document.addEventListener('pointermove', onPoint, { passive: true });
document.addEventListener('pointerdown', onPoint, { passive: true });
document.addEventListener('touchmove', onPoint, { passive: true });

// ---------- Siesta si no se toca nada ----------
let idleTimer = null, sleeping = false;
function goSleep() {
  // En mitad de un test no: que no distraiga mientras piensa una respuesta
  if (document.hidden || document.querySelector('.qtop')) { idleTimer = setTimeout(goSleep, IDLE_MS); return; }
  sleeping = true;
  allKai().forEach(s => s.classList.add('sleep'));
}
function wake() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(goSleep, IDLE_MS);
  if (!sleeping) return;
  sleeping = false;
  document.querySelectorAll('svg.kai.sleep').forEach(s => s.classList.remove('sleep'));
  const k = mainKai();
  if (k) { pulse(k, 'oops', 520); say(k, '¡Uy! Me había dormido 😴'); }
}
['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(ev => document.addEventListener(ev, wake, { passive: true, capture: true }));
wake();

// ---------- Noche: gorro de dormir y aviso (una vez por sesión) ----------
let nightSaid = false;
function nightPass() {
  if (!isNight()) return;
  document.querySelectorAll('svg.kai:not(.night)').forEach(s => s.classList.add('night'));
  if (!nightSaid && document.querySelector('.hello')) {
    nightSaid = true;
    setTimeout(() => say(mainKai(), '¡No te acuestes tarde, que mañana hay examen! 🌙'), 1200);
  }
}
new MutationObserver(nightPass).observe(document.body, { childList: true, subtree: true });
nightPass();

// ---------- API para la app ----------
window.kaiFun = {
  // Racha de aciertos seguidos: cada 5, voltereta y aviso
  streak(n) {
    if (n < 5 || n % 5) return;
    toast(`¡Racha de ${n}! 🔥`);
    const k = mainKai();
    if (k) { pulse(k, 'flip', 950); sparkle(k, ['🔥', '⭐', '✨'], 6); }
  },
  secret,
};

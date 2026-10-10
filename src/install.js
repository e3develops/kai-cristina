// Invitación a instalar KAI en la pantalla de inicio.
// - iPhone/iPad: Safari no permite instalar por código, así que se explican los 3 toques con sus iconos.
// - Android / Chrome de ordenador: botón "Instalar" real (evento beforeinstallprompt).
// - Navegadores dentro de otras apps (Instagram, WhatsApp…): se pide abrir en Safari.
import { kaiSVG } from './kai.js';

const KEY = 'kai-install';
const ua = navigator.userAgent;
const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isIPad = /ipad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const inAppBrowser = /FBAN|FBAV|Instagram|Line\/|WhatsApp|Twitter|TikTok/i.test(ua);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; });

function dismissedUntil() {
  try { return Number(localStorage.getItem(KEY)) || 0; } catch (e) { return 0; }
}
function dismiss(ms) {
  try { localStorage.setItem(KEY, String(Date.now() + ms)); } catch (e) { /* sin almacenamiento */ }
}

const shareIcon = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>`;
const addIcon = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>`;
const moreIcon = `<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><circle cx="6" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18" cy="12" r="1.8"/></svg>`;

function injectStyles() {
  if (document.getElementById('kai-install-css')) return;
  const st = document.createElement('style');
  st.id = 'kai-install-css';
  st.textContent = `
  .inst-bg { position: fixed; inset: 0; z-index: 90; background: rgba(15, 42, 46, .5); display: flex; align-items: flex-end; justify-content: center; padding: 12px; animation: instFade .25s ease; }
  .inst { width: 100%; max-width: 440px; background: var(--card, #fff); border-radius: 26px; padding: 20px 18px calc(env(safe-area-inset-bottom) + 16px); display: flex; flex-direction: column; gap: 14px; box-shadow: 0 20px 60px rgba(15, 42, 46, .25); animation: instUp .35s cubic-bezier(.2, .9, .3, 1.2); }
  .inst-head { display: flex; align-items: center; gap: 12px; }
  .inst-head .kai { width: 72px; flex: 0 0 72px; }
  .inst-head h2 { font-size: 20px; }
  .inst-head p { font-size: 14px; color: var(--ink-2, #4A6468); font-weight: 600; margin-top: 2px; }
  .inst-steps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
  .inst-steps li { display: flex; align-items: center; gap: 12px; background: var(--bg, #F4FBF9); border-radius: 16px; padding: 12px; font-weight: 700; font-size: 15px; line-height: 1.35; }
  .inst-steps .n { flex: 0 0 26px; height: 26px; border-radius: 99px; background: var(--primary, #0FA38C); color: #fff; font-weight: 900; font-size: 13px; display: grid; place-items: center; }
  .inst-steps .ic { flex: 0 0 56px; height: 36px; border-radius: 10px; background: #fff; color: #0A84FF; display: grid; place-items: center; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .inst-steps small { display: block; font-weight: 600; color: var(--ink-2, #4A6468); font-size: 13px; margin-top: 2px; }
  .inst-note { font-size: 13px; color: var(--ink-2, #4A6468); font-weight: 600; background: var(--accent-soft, #FFF1D6); border-radius: 12px; padding: 10px 12px; line-height: 1.4; }
  @keyframes instFade { from { opacity: 0; } to { opacity: 1; } }
  @keyframes instUp { from { transform: translateY(40px); opacity: 0; } to { transform: none; opacity: 1; } }
  `;
  document.head.appendChild(st);
}

function show() {
  if (document.querySelector('.inst-bg')) return;
  injectStyles();
  let body, buttons;
  if (inAppBrowser) {
    body = `<p class="inst-note">Estás dentro de otra app y desde aquí no puedo instalarme. Toca <b>···</b> o el icono de la brújula y elige <b>“Abrir en Safari”</b>. Allí te enseño cómo ponerme en tu pantalla de inicio.</p>`;
    buttons = `<button class="btn" data-a="later">Entendido</button>`;
  } else if (isIOS) {
    body = `
      <ol class="inst-steps">
        <li><span class="n">1</span><span class="ic">${shareIcon}</span><span>Toca <b>Compartir</b> en Safari<small>${isIPad ? 'Arriba a la derecha.' : 'En la barra de abajo. Si no lo ves, toca antes'} ${isIPad ? '' : `<b>···</b>`}</small></span></li>
        <li><span class="n">2</span><span class="ic">${addIcon}</span><span>Elige <b>“Añadir a pantalla de inicio”</b><small>Si no aparece, desliza la lista hacia abajo.</small></span></li>
        <li><span class="n">3</span><span class="ic" style="color:#0A84FF;font-weight:900;font-size:14px">Añadir</span><span>Pulsa <b>Añadir</b><small>Y ábreme siempre desde mi icono 🤖</small></span></li>
      </ol>
      <p class="inst-note">💡 Hazlo antes de empezar a estudiar: en iPhone, lo que hagas en Safari y lo que hagas en la app instalada se guardan por separado.</p>`;
    buttons = `<button class="btn" data-a="later">¡Vale, lo hago ahora!</button><button class="btn ghost" data-a="never">Ya la tengo instalada</button>`;
  } else if (deferredPrompt) {
    body = `<p class="inst-note" style="background:var(--primary-soft,#D5F3EC)">Me abrirás como una app, a pantalla completa y también sin conexión.</p>`;
    buttons = `<button class="btn" data-a="install">📲 Instalar KAI</button><button class="btn ghost" data-a="later">Ahora no</button>`;
  } else return;

  const bg = document.createElement('div');
  bg.className = 'inst-bg';
  bg.innerHTML = `
    <div class="inst" role="dialog" aria-label="Instalar KAI">
      <div class="inst-head">${kaiSVG('wave happy')}<div><h2>Instálame 📲</h2><p>Así me abres como una app: a pantalla completa y sin conexión.</p></div></div>
      ${body}
      <div class="btn-col">${buttons}</div>
    </div>`;
  document.body.appendChild(bg);
  const close = () => bg.remove();
  bg.addEventListener('click', e => { if (e.target === bg) { dismiss(12 * 3600e3); close(); } });
  bg.querySelector('[data-a=later]')?.addEventListener('click', () => { dismiss(12 * 3600e3); close(); });
  bg.querySelector('[data-a=never]')?.addEventListener('click', () => { dismiss(3650 * 86400e3); close(); });
  bg.querySelector('[data-a=install]')?.addEventListener('click', async () => {
    close();
    try { deferredPrompt.prompt(); await deferredPrompt.userChoice; } catch (e) { /* cancelado */ }
    deferredPrompt = null;
    dismiss(7 * 86400e3);
  });
}

// Se muestra una vez cargada la app, nunca a mitad de un test ni encima de otra ventana
function maybeShow(tries = 0) {
  if (standalone() || Date.now() < dismissedUntil()) return;
  if (!isIOS && !inAppBrowser && !deferredPrompt) { if (tries < 10) setTimeout(() => maybeShow(tries + 1), 1000); return; }
  // Solo en el inicio: en la presentación ya se explica con ilustraciones
  const busy = !document.querySelector('.hello') || document.querySelector('.qtop, .viewer, .modal-bg');
  if (busy) { if (tries < 120) setTimeout(() => maybeShow(tries + 1), 1500); return; }
  show();
}
window.addEventListener('load', () => setTimeout(maybeShow, 1500));
window.kaiShowInstall = show; // para poder abrirlo a mano (depuración)

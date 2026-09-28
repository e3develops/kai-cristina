// Ilustraciones (estilo iPhone/Safari) de los pasos para añadir KAI a la pantalla de inicio,
// y detección del entorno para decidir si hay que enseñarlas.

const ua = navigator.userAgent;
const forceIOS = /[?&]ios(&|$)/.test(location.search); // para probar en el ordenador: ...?ios
export const isIOS = forceIOS || /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isIPad = /ipad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const inAppBrowser = /FBAN|FBAV|Instagram|Line\/|WhatsApp|Twitter|TikTok/i.test(ua);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// ¿Hay que enseñar cómo instalar? (iPhone/iPad en el navegador, no desde el icono)
export const needsInstallHelp = () => isIOS && !isStandalone();

const F = `font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', Helvetica, Arial, sans-serif"`;
const BLUE = '#0A84FF';
const HL = '#0FA38C';

// Icono de KAI en miniatura (cuadrado redondeado con los ojos y la cofia)
const kaiIcon = (x, y, s) => `
  <g transform="translate(${x} ${y}) scale(${s / 60})">
    <rect width="60" height="60" rx="14" fill="#16B39A"/>
    <path d="M19 17 L30 9 L41 17 L39 21 L21 21 Z" fill="#fff"/>
    <rect x="28.5" y="11.5" width="3" height="7" rx="1" fill="#EF4444"/><rect x="26.5" y="13.5" width="7" height="3" rx="1" fill="#EF4444"/>
    <rect x="11" y="24" width="17" height="14" rx="7" fill="#E2E8F0" stroke="#64748B" stroke-width="2"/>
    <rect x="32" y="24" width="17" height="14" rx="7" fill="#E2E8F0" stroke="#64748B" stroke-width="2"/>
    <circle cx="19.5" cy="31" r="4.5" fill="#1E2B3A"/><circle cx="40.5" cy="31" r="4.5" fill="#1E2B3A"/>
    <circle cx="21" cy="29.5" r="1.4" fill="#fff"/><circle cx="42" cy="29.5" r="1.4" fill="#fff"/>
    <rect x="17" y="44" width="26" height="16" rx="5" fill="#F7B84B"/>
  </g>`;

// Anillo que "late" para señalar dónde tocar
const tap = (x, y, r = 17) => `
  <circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${HL}" stroke-width="3"/>
  <circle class="ia-pulse" cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${HL}" stroke-width="3"/>`;

const phone = inner => `
<svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg" role="img">
  <rect x="1.5" y="1.5" width="197" height="297" rx="26" fill="#fff" stroke="#CBD5E1" stroke-width="3"/>
  <clipPath id="ia-clip"><rect x="3" y="3" width="194" height="294" rx="24"/></clipPath>
  <g clip-path="url(#ia-clip)">${inner}</g>
</svg>`;

// Paso 1: la barra de Safari con el botón Compartir
const safariPage = `
  <rect x="0" y="0" width="200" height="300" fill="#F4FBF9"/>
  <rect x="0" y="0" width="200" height="22" fill="#fff"/>
  <text x="18" y="15" ${F} font-size="9" font-weight="700" fill="#111">19:30</text>
  ${kaiIcon(20, 38, 34)}
  <rect x="62" y="42" width="90" height="9" rx="4.5" fill="#0F2A2E" opacity=".85"/>
  <rect x="62" y="57" width="60" height="7" rx="3.5" fill="#8AA1A4"/>
  <rect x="20" y="86" width="160" height="46" rx="12" fill="#fff" stroke="#D9ECE8"/>
  <rect x="32" y="98" width="110" height="7" rx="3.5" fill="#CBD5E1"/><rect x="32" y="112" width="80" height="7" rx="3.5" fill="#E2E8F0"/>
  <rect x="20" y="142" width="160" height="30" rx="10" fill="${HL}"/>
  <rect x="68" y="154" width="64" height="7" rx="3.5" fill="#fff" opacity=".9"/>`;

export const art1 = phone(`
  ${safariPage}
  <rect x="0" y="206" width="200" height="94" fill="#F7F7F9"/>
  <line x1="0" y1="206" x2="200" y2="206" stroke="#E5E5EA"/>
  <rect x="14" y="216" width="172" height="30" rx="10" fill="#E9E9EE"/>
  <text x="100" y="235" ${F} font-size="10" fill="#3C3C43" text-anchor="middle">🔒 e3develops.github.io</text>
  <g stroke="${BLUE}" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M31 262 l-6 7 6 7"/>
    <path d="M62 262 l6 7 -6 7" opacity=".35"/>
    <path d="M100 258 v12"/><path d="M95 262 l5 -5 5 5"/><path d="M94 265 h-2 v12 h16 v-12 h-2"/>
    <path d="M131 262 q7 -3 7 0 v13 q0 -3 -7 0 z M145 262 q-7 -3 -7 0"/>
    <rect x="163" y="261" width="12" height="12" rx="2.5"/><path d="M167 258 h10 v10"/>
  </g>
  ${tap(100, 267)}`);

// Paso 2: menú Compartir con "Añadir a pantalla de inicio"
const row = (y, label, icon, hl = false) => `
  <rect x="12" y="${y}" width="176" height="28" rx="${hl ? 9 : 0}" fill="${hl ? '#D5F3EC' : '#fff'}" ${hl ? `stroke="${HL}" stroke-width="2.5"` : ''}/>
  <text x="22" y="${y + 18}" ${F} font-size="10.5" fill="#1C1C1E" font-weight="${hl ? 700 : 400}">${label}</text>
  <g transform="translate(166 ${y + 7})" stroke="#1C1C1E" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round">${icon}</g>`;
export const art2 = phone(`
  ${safariPage}
  <rect x="0" y="0" width="200" height="300" fill="#000" opacity=".35"/>
  <rect x="0" y="52" width="200" height="260" rx="16" fill="#F2F2F7"/>
  <rect x="88" y="58" width="24" height="4" rx="2" fill="#C7C7CC"/>
  ${kaiIcon(14, 70, 26)}
  <text x="48" y="81" ${F} font-size="10" font-weight="700" fill="#1C1C1E">KAI · Estudia con Cristina</text>
  <text x="48" y="93" ${F} font-size="8.5" fill="#8E8E93">e3develops.github.io</text>
  <g>
    <circle cx="34" cy="122" r="15" fill="#34C759"/><circle cx="76" cy="122" r="15" fill="#0A84FF"/>
    <circle cx="118" cy="122" r="15" fill="#FFCC00"/><circle cx="160" cy="122" r="15" fill="#FF9500"/>
  </g>
  <rect x="12" y="148" width="176" height="84" rx="10" fill="#fff"/>
  ${row(148, 'Copiar', '<rect x="0" y="2" width="9" height="11" rx="2"/><path d="M4 0 h8 v11"/>')}
  <line x1="22" y1="176" x2="188" y2="176" stroke="#E5E5EA"/>
  ${row(176, 'Añadir a favoritos', '<path d="M7 0 l2 5 5 .5 -4 3.5 1.2 5 -4.2 -2.8 -4.2 2.8 1.2 -5 -4 -3.5 5 -.5 z"/>')}
  <line x1="22" y1="204" x2="188" y2="204" stroke="#E5E5EA"/>
  ${row(242, 'Añadir a pantalla de inicio', '<rect x="0" y="0" width="14" height="14" rx="3.5"/><path d="M7 3.5 v7 M3.5 7 h7"/>', true)}
  <text x="100" y="222" ${F} font-size="9" fill="#8E8E93" text-anchor="middle">⌄ desliza hacia abajo ⌄</text>`);

// Paso 3: pantalla "Añadir a inicio" con el botón Añadir
export const art3 = phone(`
  <rect x="0" y="0" width="200" height="300" fill="#F2F2F7"/>
  <rect x="0" y="18" width="200" height="40" fill="#F7F7F9"/>
  <line x1="0" y1="58" x2="200" y2="58" stroke="#E5E5EA"/>
  <text x="14" y="42" ${F} font-size="10.5" fill="${BLUE}">Cancelar</text>
  <text x="100" y="42" ${F} font-size="10.5" font-weight="700" fill="#1C1C1E" text-anchor="middle">Añadir a inicio</text>
  <text x="182" y="42" ${F} font-size="10.5" font-weight="700" fill="${BLUE}" text-anchor="end">Añadir</text>
  ${tap(168, 38, 20)}
  <rect x="12" y="74" width="176" height="64" rx="10" fill="#fff"/>
  ${kaiIcon(22, 84, 44)}
  <text x="78" y="103" ${F} font-size="12" font-weight="700" fill="#1C1C1E">KAI</text>
  <line x1="78" y1="110" x2="178" y2="110" stroke="#E5E5EA"/>
  <text x="78" y="125" ${F} font-size="8.5" fill="#8E8E93">e3develops.github.io/kai-cristina</text>
  <rect x="12" y="150" width="176" height="32" rx="10" fill="#fff"/>
  <text x="22" y="170" ${F} font-size="10" fill="#1C1C1E">Abrir como app web</text>
  <rect x="152" y="157" width="28" height="17" rx="8.5" fill="#34C759"/><circle cx="171.5" cy="165.5" r="7" fill="#fff"/>
  <text x="100" y="206" ${F} font-size="8.5" fill="#8E8E93" text-anchor="middle">Aparecerá un icono en tu pantalla de inicio</text>`);

// Paso 4: el icono de KAI ya en la pantalla de inicio
const app = (x, y, c) => `<rect x="${x}" y="${y}" width="34" height="34" rx="9" fill="${c}"/>`;
export const art4 = phone(`
  <defs><linearGradient id="ia-wall" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7DD3C0"/><stop offset="1" stroke="none" stop-color="#6D8BDB"/></linearGradient></defs>
  <rect x="0" y="0" width="200" height="300" fill="url(#ia-wall)"/>
  <text x="18" y="15" ${F} font-size="9" font-weight="700" fill="#fff">19:31</text>
  ${app(18, 40, '#34C759')}${app(62, 40, '#0A84FF')}${app(106, 40, '#FF9500')}${app(150, 40, '#FF2D55')}
  ${app(18, 96, '#5856D6')}${app(62, 96, '#FFCC00')}${app(106, 96, '#8E8E93')}
  ${kaiIcon(150, 96, 34)}
  ${tap(167, 113, 24)}
  <text x="167" y="146" ${F} font-size="8.5" font-weight="700" fill="#fff" text-anchor="middle">KAI</text>
  <rect x="14" y="248" width="172" height="40" rx="14" fill="#fff" opacity=".35"/>
  ${app(24, 251, '#34C759')}${app(66, 251, '#0A84FF')}${app(108, 251, '#FF3B30')}${app(150, 251, '#1C1C1E')}`);

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

// Número dentro de un círculo (orden de los toques dentro de una misma ilustración)
const badge = (x, y, n) => `<circle cx="${x}" cy="${y}" r="8" fill="${HL}" stroke="#fff" stroke-width="2"/><text x="${x}" y="${y + 3.5}" ${F} font-size="10" font-weight="800" fill="#fff" text-anchor="middle">${n}</text>`;
const menuRow = (y, label, icon, hl = false) => `
  ${hl ? `<rect x="76" y="${y}" width="110" height="24" rx="8" fill="#D5F3EC" stroke="${HL}" stroke-width="2.2"/>` : ''}
  <text x="86" y="${y + 16}" ${F} font-size="10" fill="#1C1C1E" font-weight="${hl ? 700 : 400}">${label}</text>
  <g transform="translate(164 ${y + 5})" stroke="${hl ? BLUE : '#1C1C1E'}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round">${icon}</g>`;

// Paso 1: en la barra de Safari, tocar ··· y luego "Compartir" (Safari de iOS 26; en versiones
// anteriores el botón Compartir está directamente en la barra)
export const art1 = phone(`
  ${safariPage}
  <rect x="0" y="0" width="200" height="300" fill="#000" opacity=".12"/>
  <rect x="0" y="246" width="200" height="54" fill="#F7F7F9"/>
  <circle cx="24" cy="268" r="14" fill="#fff" stroke="#E5E5EA"/>
  <path d="M27 262 l-6 6 6 6" stroke="#1C1C1E" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="44" y="254" width="110" height="28" rx="14" fill="#fff" stroke="#E5E5EA"/>
  <text x="99" y="272" ${F} font-size="9.5" fill="#3C3C43" text-anchor="middle">e3develops.github.io</text>
  <circle cx="176" cy="268" r="14" fill="#fff" stroke="#E5E5EA"/>
  <g fill="#1C1C1E"><circle cx="170" cy="268" r="1.9"/><circle cx="176" cy="268" r="1.9"/><circle cx="182" cy="268" r="1.9"/></g>
  ${tap(176, 268, 16)}
  ${badge(160, 250, 1)}
  <rect x="70" y="122" width="122" height="116" rx="14" fill="#fff" style="filter:drop-shadow(0 4px 10px rgba(0,0,0,.18))"/>
  ${menuRow(128, 'Compartir', '<path d="M7 1 v9"/><path d="M4 4 l3 -3 3 3"/><path d="M3 7 h-1 v7 h10 v-7 h-1"/>', true)}
  <line x1="80" y1="156" x2="186" y2="156" stroke="#E5E5EA"/>
  ${menuRow(158, 'Favoritos', '<path d="M7 1 l1.8 4 4.2 .4 -3.2 2.8 1 4.2 -3.8 -2.3 -3.8 2.3 1 -4.2 -3.2 -2.8 4.2 -.4 z"/>')}
  <line x1="80" y1="184" x2="186" y2="184" stroke="#E5E5EA"/>
  ${menuRow(186, 'Añadir marcador', '<path d="M3 1 h8 v12 l-4 -3 -4 3 z"/>')}
  <line x1="80" y1="212" x2="186" y2="212" stroke="#E5E5EA"/>
  ${menuRow(213, 'Nueva pestaña', '<rect x="1" y="1" width="12" height="12" rx="3"/><path d="M7 4 v6 M4 7 h6"/>')}
  ${badge(68, 128, 2)}`);

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

// Paso intermedio: dentro del menú Compartir, tocar otra vez ··· para ver más acciones
const actBtn = (x, label, icon, hl = false) => `
  <circle cx="${x}" cy="172" r="17" fill="${hl ? '#D5F3EC' : '#fff'}" ${hl ? `stroke="${HL}" stroke-width="2.5"` : ''}/>
  <g transform="translate(${x - 7} 165)" stroke="#1C1C1E" stroke-width="1.6" fill="${icon.includes('circle') ? '#1C1C1E' : 'none'}" stroke-linecap="round" stroke-linejoin="round">${icon}</g>
  <text x="${x}" y="202" ${F} font-size="8" fill="#3C3C43" text-anchor="middle" font-weight="${hl ? 700 : 400}">${label}</text>`;
export const artMore = phone(`
  ${safariPage}
  <rect x="0" y="0" width="200" height="300" fill="#000" opacity=".35"/>
  <rect x="0" y="52" width="200" height="260" rx="16" fill="#F2F2F7"/>
  <rect x="88" y="58" width="24" height="4" rx="2" fill="#C7C7CC"/>
  ${kaiIcon(14, 70, 26)}
  <text x="48" y="81" ${F} font-size="10" font-weight="700" fill="#1C1C1E">KAI · Estudia con Cristina</text>
  <text x="48" y="93" ${F} font-size="8.5" fill="#8E8E93">e3develops.github.io</text>
  <g>
    <circle cx="34" cy="126" r="15" fill="#34C759"/><circle cx="76" cy="126" r="15" fill="#0A84FF"/>
    <circle cx="118" cy="126" r="15" fill="#FFCC00"/><circle cx="160" cy="126" r="15" fill="#FF9500"/>
  </g>
  ${actBtn(34, 'Copiar', '<rect x="1" y="3" width="9" height="11" rx="2"/><path d="M5 1 h8 v11"/>')}
  ${actBtn(76, 'Favoritos', '<path d="M7 0 l2 5 5 .5 -4 3.5 1.2 5 -4.2 -2.8 -4.2 2.8 1.2 -5 -4 -3.5 5 -.5 z"/>')}
  ${actBtn(118, 'Marcador', '<path d="M3 0 h8 v14 l-4 -3 -4 3 z"/>')}
  ${actBtn(160, 'Más', '<circle cx="1.5" cy="7" r="1.8"/><circle cx="7" cy="7" r="1.8"/><circle cx="12.5" cy="7" r="1.8"/>', true)}
  ${tap(160, 172, 21)}
  <rect x="12" y="222" width="176" height="28" rx="10" fill="#fff"/>
  <text x="22" y="240" ${F} font-size="10" fill="#8E8E93">Copiar</text>
  <rect x="12" y="256" width="176" height="28" rx="10" fill="#fff"/>
  <text x="22" y="274" ${F} font-size="10" fill="#8E8E93">Añadir a la lista de lectura</text>`);

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

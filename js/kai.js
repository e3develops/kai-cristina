// KAI: robotín enfermero (inspirado en un robot compactador de basura muy famoso 🤖)
// Estados vía clases en el <svg>: happy, sad, think, talk, wave, celebrate

export function kaiSVG(extraClass = '') {
  return `
<svg class="kai ${extraClass}" viewBox="0 0 200 232" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="KAI, tu robot de estudio">
  <defs>
    <linearGradient id="kBody" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFD978"/>
      <stop offset="1" stop-color="#F2A93B"/>
    </linearGradient>
    <linearGradient id="kMetal" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F1F5F9"/>
      <stop offset="1" stop-color="#AEB9C5"/>
    </linearGradient>
    <radialGradient id="kLens" cx="0.45" cy="0.4" r="0.6">
      <stop offset="0" stop-color="#4B6584"/>
      <stop offset="0.6" stop-color="#1E2B3A"/>
      <stop offset="1" stop-color="#0B121A"/>
    </radialGradient>
  </defs>

  <ellipse class="k-shadow" cx="100" cy="224" rx="64" ry="6" fill="rgba(15,23,42,.13)"/>

  <g class="k-bob">
    <!-- orugas -->
    <g class="k-tracks">
      <rect x="28" y="180" width="62" height="36" rx="17" fill="#4B5563"/>
      <rect x="110" y="180" width="62" height="36" rx="17" fill="#4B5563"/>
      <g fill="#9CA3AF" stroke="#374151" stroke-width="2">
        <circle cx="45" cy="198" r="9"/><circle cx="73" cy="198" r="9"/>
        <circle cx="127" cy="198" r="9"/><circle cx="155" cy="198" r="9"/>
      </g>
      <g fill="#374151"><circle cx="45" cy="198" r="3"/><circle cx="73" cy="198" r="3"/><circle cx="127" cy="198" r="3"/><circle cx="155" cy="198" r="3"/></g>
    </g>

    <!-- brazos -->
    <g class="k-arm k-arm-l">
      <rect x="14" y="132" width="32" height="12" rx="6" fill="url(#kMetal)" stroke="#7C8794" stroke-width="2"/>
      <path d="M16 126 q-12 12 0 24" stroke="#4B5563" stroke-width="6" fill="none" stroke-linecap="round"/>
    </g>
    <g class="k-arm k-arm-r">
      <rect x="154" y="132" width="32" height="12" rx="6" fill="url(#kMetal)" stroke="#7C8794" stroke-width="2"/>
      <path d="M184 126 q12 12 0 24" stroke="#4B5563" stroke-width="6" fill="none" stroke-linecap="round"/>
    </g>

    <!-- cuerpo -->
    <rect x="40" y="104" width="120" height="84" rx="18" fill="url(#kBody)" stroke="#C98421" stroke-width="3"/>
    <rect x="56" y="116" width="88" height="54" rx="12" fill="#FFF6E0" stroke="#E3A845" stroke-width="2"/>
    <g class="k-cross">
      <rect x="93" y="127" width="14" height="32" rx="3.5" fill="#EF4444"/>
      <rect x="84" y="136" width="32" height="14" rx="3.5" fill="#EF4444"/>
    </g>
    <circle class="k-led" cx="60" cy="178" r="3.5" fill="#22C55E"/>
    <circle cx="71" cy="178" r="3.5" fill="#FDE68A"/>
    <rect x="118" y="175" width="26" height="6" rx="3" fill="#C98421" opacity=".5"/>

    <!-- cuello -->
    <rect x="94" y="80" width="12" height="26" rx="5" fill="#9CA3AF" stroke="#6B7280" stroke-width="2"/>

    <!-- cabeza -->
    <g class="k-head">
      <!-- cofia -->
      <g class="k-cap" transform="translate(0 -9)">
        <path d="M70 34 Q100 8 130 34 L126 44 L74 44 Z" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2.5" stroke-linejoin="round"/>
        <rect x="97" y="21" width="6" height="16" rx="1.5" fill="#EF4444"/>
        <rect x="92" y="26" width="16" height="6" rx="1.5" fill="#EF4444"/>
      </g>

      <rect x="90" y="58" width="20" height="12" rx="4" fill="#9CA3AF" stroke="#6B7280" stroke-width="2"/>

      <g transform="rotate(-7 70 64)">
        <rect x="42" y="42" width="56" height="46" rx="21" fill="url(#kMetal)" stroke="#6B7280" stroke-width="3"/>
      </g>
      <g transform="rotate(7 130 64)">
        <rect x="102" y="42" width="56" height="46" rx="21" fill="url(#kMetal)" stroke="#6B7280" stroke-width="3"/>
      </g>

      <g class="k-eyes">
        <g class="k-pupil">
          <circle cx="70" cy="65" r="16" fill="url(#kLens)"/>
          <circle cx="76" cy="58" r="5.5" fill="#fff"/>
          <circle cx="64" cy="72" r="2.2" fill="#fff" opacity=".8"/>
        </g>
        <g class="k-pupil">
          <circle cx="130" cy="65" r="16" fill="url(#kLens)"/>
          <circle cx="136" cy="58" r="5.5" fill="#fff"/>
          <circle cx="124" cy="72" r="2.2" fill="#fff" opacity=".8"/>
        </g>
      </g>

      <!-- mejillas "sonrientes" (ojos felices) -->
      <g class="k-cheeks" fill="#DCE3EA">
        <ellipse cx="70" cy="86" rx="22" ry="11"/>
        <ellipse cx="130" cy="86" rx="22" ry="11"/>
      </g>
      <g class="k-blush" fill="#FB7185">
        <ellipse cx="50" cy="84" rx="7" ry="4"/>
        <ellipse cx="150" cy="84" rx="7" ry="4"/>
      </g>

      <path class="k-brow k-brow-l" d="M54 36 Q68 30 82 36" stroke="#4B5563" stroke-width="4.5" fill="none" stroke-linecap="round"/>
      <path class="k-brow k-brow-r" d="M118 36 Q132 30 146 36" stroke="#4B5563" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    </g>
  </g>
</svg>`;
}

// Cambia la expresión de todos los KAI visibles
export function setKaiMood(root, mood) {
  root.querySelectorAll('svg.kai').forEach(svg => {
    svg.classList.remove('happy', 'sad', 'think', 'talk', 'wave', 'celebrate');
    if (mood) mood.split(' ').forEach(m => m && svg.classList.add(m));
  });
}

// KAI: robotín enfermero que flota con un propulsor.
// Estados vía clases en el <svg>: happy, sad, think, talk, wave, celebrate, thumbs, facepalm,
// y los de los easter eggs (oops, dance, love, sleep, flip, night) que gestiona kaifun.js

export const KAI_MOODS = ['happy', 'sad', 'think', 'talk', 'wave', 'celebrate', 'thumbs', 'facepalm'];

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
      <stop offset="1" stop-color="#B6C1CC"/>
    </linearGradient>
    <radialGradient id="kLens" cx="0.45" cy="0.4" r="0.6">
      <stop offset="0" stop-color="#3A5270"/>
      <stop offset="0.65" stop-color="#1E2B3A"/>
      <stop offset="1" stop-color="#0B121A"/>
    </radialGradient>
    <linearGradient id="kFlame" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#E0FFF8"/>
      <stop offset="0.45" stop-color="#5EEAD4"/>
      <stop offset="1" stop-color="#0FA38C" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <ellipse class="k-shadow" cx="100" cy="228" rx="44" ry="5.5" fill="rgba(15,42,46,.16)"/>

  <g class="k-bob">
    <!-- propulsor -->
    <g class="k-jet">
      <path class="k-flame" d="M84 198 Q100 246 116 198 Z" fill="url(#kFlame)"/>
      <path class="k-flame k-flame-in" d="M93 198 Q100 222 107 198 Z" fill="#FFFFFF" opacity=".85"/>
      <rect x="66" y="180" width="68" height="20" rx="10" fill="url(#kMetal)" stroke="#6B7280" stroke-width="2.5"/>
      <rect x="84" y="193" width="32" height="8" rx="4" fill="#4B5563"/>
      <circle class="k-jetlight" cx="78" cy="190" r="2.6" fill="#5EEAD4"/>
      <circle class="k-jetlight" cx="122" cy="190" r="2.6" fill="#5EEAD4"/>
    </g>

    <!-- cuerpo -->
    <rect x="44" y="100" width="112" height="86" rx="18" fill="url(#kBody)" stroke="#C98421" stroke-width="3"/>
    <rect x="58" y="113" width="84" height="56" rx="12" fill="#FFF6E0" stroke="#E3A845" stroke-width="2"/>
    <!-- pantalla del pecho: va cambiando de imagen sanitaria cada 4 s -->
    <g class="k-screen">
      <g class="k-scr k-scr-0 k-cross" style="--i:0">
        <rect x="92" y="122" width="16" height="38" rx="4" fill="#EF4444"/>
        <rect x="81" y="133" width="38" height="16" rx="4" fill="#EF4444"/>
      </g>
      <g class="k-scr k-scr-1" style="--i:1">
        <path d="M63 118 H137 M63 164 H137" stroke="#F3D9A4" stroke-width="1"/>
        <path class="k-ecg" d="M63 141 H80 L85 133 L90 141 L94 141 L98 122 L103 158 L108 136 L112 141 H137" stroke="#10B981" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
      <g class="k-scr k-scr-2" style="--i:2">
        <path class="k-heart" d="M100 158 C82 146 75 135 83 126 C89 119 97 122 100 129 C103 122 111 119 117 126 C125 135 118 146 100 158 Z" fill="#EF4444"/>
        <path d="M88 130 q3 -4 7 -2" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round" opacity=".7"/>
      </g>
      <g class="k-scr k-scr-3" style="--i:3">
        <circle cx="100" cy="138" r="18" fill="none" stroke="#94A3B8" stroke-width="9"/>
        <circle class="k-scan" cx="100" cy="138" r="18" fill="none" stroke="#0FA38C" stroke-width="4" stroke-dasharray="18 95" stroke-linecap="round"/>
        <circle cx="100" cy="138" r="9" fill="#E0F2FE"/>
        <rect x="66" y="152" width="68" height="7" rx="3.5" fill="#64748B"/>
        <circle cx="76" cy="148" r="4" fill="#FBBF24"/>
      </g>
      <g class="k-scr k-scr-4" style="--i:4">
        <g transform="rotate(-30 100 141)">
          <rect x="66" y="138" width="4" height="12" rx="1.5" fill="#64748B"/>
          <rect x="70" y="142" width="12" height="4" fill="#94A3B8"/>
          <rect x="82" y="135" width="34" height="18" rx="3" fill="#fff" stroke="#3B82F6" stroke-width="2.5"/>
          <rect x="93" y="138" width="21" height="12" rx="1.5" fill="#93C5FD"/>
          <path d="M86 135 v5 M90 135 v4 M94 135 v5 M98 135 v4 M102 135 v5" stroke="#3B82F6" stroke-width="1.2"/>
          <path d="M116 144 H134" stroke="#64748B" stroke-width="2" stroke-linecap="round"/>
          <circle class="k-drop" cx="137" cy="144" r="2.6" fill="#60A5FA"/>
        </g>
      </g>
      <g class="k-scr k-scr-5" style="--i:5">
        <g transform="rotate(-30 100 141)">
          <rect x="77" y="131" width="46" height="20" rx="10" fill="#fff" stroke="#CBD5E1" stroke-width="2"/>
          <path d="M100 131 H87 a10 10 0 0 0 0 20 H100 Z" fill="#EF4444"/>
          <path d="M84 136 q4 -2 9 -1" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"/>
        </g>
      </g>
      <rect class="k-scr-off" x="59" y="114" width="82" height="54" rx="11" fill="#1F2937"/>
      <rect x="70" y="116" width="60" height="50" fill="transparent"/>
    </g>
    <circle class="k-led" cx="62" cy="177" r="3.5" fill="#22C55E"/>
    <circle cx="73" cy="177" r="3.5" fill="#FDE68A"/>

    <!-- cuello -->
    <rect x="94" y="86" width="12" height="18" rx="5" fill="#9CA3AF" stroke="#6B7280" stroke-width="2"/>

    <!-- cabeza -->
    <g class="k-head">
      <!-- cofia (como en el icono) -->
      <g class="k-cap" transform="translate(0 -7)">
        <path d="M64 48 L100 16 L136 48 L131 58 L69 58 Z" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2.5" stroke-linejoin="round"/>
        <rect x="96" y="26" width="8" height="22" rx="2" fill="#EF4444"/>
        <rect x="89" y="33" width="22" height="8" rx="2" fill="#EF4444"/>
      </g>
      <!-- gorro de dormir (de noche) -->
      <g class="k-nightcap" transform="translate(0 -5)">
        <path d="M62 58 Q70 20 108 16 Q140 14 150 40 L140 36 Q132 48 136 58 Z" fill="#6366F1" stroke="#4338CA" stroke-width="2.5" stroke-linejoin="round"/>
        <path d="M60 58 Q100 48 140 58" stroke="#E0E7FF" stroke-width="7" fill="none" stroke-linecap="round"/>
        <circle cx="152" cy="42" r="7" fill="#E0E7FF"/>
      </g>

      <rect x="90" y="72" width="20" height="12" rx="4" fill="#9CA3AF" stroke="#6B7280" stroke-width="2"/>
      <g transform="rotate(-7 70 78)">
        <rect x="42" y="56" width="56" height="44" rx="20" fill="url(#kMetal)" stroke="#6B7280" stroke-width="3"/>
      </g>
      <g transform="rotate(7 130 78)">
        <rect x="102" y="56" width="56" height="44" rx="20" fill="url(#kMetal)" stroke="#6B7280" stroke-width="3"/>
      </g>

      <g class="k-eyes"><g class="k-look">
        <g class="k-pupil">
          <circle cx="70" cy="79" r="16" fill="url(#kLens)"/>
          <circle cx="76" cy="72" r="5.5" fill="#fff"/>
          <circle cx="64" cy="86" r="2" fill="#fff" opacity=".7"/>
        </g>
        <g class="k-pupil">
          <circle cx="130" cy="79" r="16" fill="url(#kLens)"/>
          <circle cx="136" cy="72" r="5.5" fill="#fff"/>
          <circle cx="124" cy="86" r="2" fill="#fff" opacity=".7"/>
        </g>
      </g></g>

      <!-- ojos cerrados (dormido) -->
      <g class="k-closed" stroke="#1E2B3A" stroke-width="3.5" fill="none" stroke-linecap="round">
        <path d="M58 80 Q70 88 82 80"/><path d="M118 80 Q130 88 142 80"/>
      </g>

      <!-- mofletes "sonrientes" y rubor (solo con emociones) -->
      <g class="k-cheeks" fill="#DCE3EA">
        <ellipse cx="70" cy="99" rx="22" ry="10"/>
        <ellipse cx="130" cy="99" rx="22" ry="10"/>
      </g>
      <g class="k-blush" fill="#FB7185">
        <ellipse cx="48" cy="97" rx="7" ry="4"/>
        <ellipse cx="152" cy="97" rx="7" ry="4"/>
      </g>
      <path class="k-brow k-brow-l" d="M54 50 Q68 44 82 50" stroke="#4B5563" stroke-width="4.5" fill="none" stroke-linecap="round"/>
      <path class="k-brow k-brow-r" d="M118 50 Q132 44 146 50" stroke="#4B5563" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    </g>

    <!-- brazos (giran desde el hombro) -->
    <g class="k-arm k-arm-l">
      <rect x="20" y="124" width="30" height="11" rx="5.5" fill="url(#kMetal)" stroke="#6B7280" stroke-width="2"/>
      <path d="M22 117 q-13 12 0 25" stroke="#4B5563" stroke-width="6" fill="none" stroke-linecap="round"/>
    </g>
    <g class="k-arm k-arm-r">
      <rect x="150" y="124" width="30" height="11" rx="5.5" fill="url(#kMetal)" stroke="#6B7280" stroke-width="2"/>
      <path d="M178 117 q13 12 0 25" stroke="#4B5563" stroke-width="6" fill="none" stroke-linecap="round"/>
    </g>

    <!-- Zzz (dormido) -->
    <g class="k-zzz" aria-hidden="true" fill="#6366F1" font-family="Nunito, sans-serif" font-weight="900">
      <text x="150" y="30" font-size="14">z</text><text x="162" y="16" font-size="18">z</text><text x="176" y="0" font-size="22">Z</text>
    </g>
  </g>
</svg>`;
}

// Cambia la expresión de todos los KAI visibles
export function setKaiMood(root, mood) {
  root.querySelectorAll('svg.kai').forEach(svg => {
    svg.classList.remove(...KAI_MOODS);
    if (mood) mood.split(' ').forEach(m => m && svg.classList.add(m));
  });
}

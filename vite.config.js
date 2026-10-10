import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// Versión = fecha y hora de la compilación (hora de Madrid). Cada publicación genera una nueva:
// la app la compara con version.json al abrirse y, si no coincide, se actualiza sola.
function buildVersion() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('es-ES', {
    timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map(p => [p.type, p.value]));
  return `${parts.day}/${parts.month} ${parts.hour}:${parts.minute}`;
}

// Ficheros de public/ que se precargan para que la app funcione sin conexión
// (el contenido de los exámenes es privado: llega por la API y el service worker lo guarda al usarlo)
const PUBLIC_PRECACHE = [
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

// Genera version.json y el service worker con la lista real de ficheros compilados (llevan hash en el nombre)
function kaiPwa(version) {
  return {
    name: 'kai-pwa',
    apply: 'build',
    generateBundle(_, bundle) {
      const assets = Object.keys(bundle).filter(f => !f.endsWith('.map'));
      const precache = ['./', ...assets.filter(f => f !== 'index.html'), 'index.html', ...PUBLIC_PRECACHE];
      const sw = readFileSync(new URL('./src/sw.js', import.meta.url), 'utf8')
        .replace('__CACHE__', `kai-${version.replace(/\D/g, '')}`)
        .replace("['__PRECACHE__']", JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: sw });
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version }) });
    },
  };
}

export default defineConfig(({ command }) => {
  const version = command === 'build' ? buildVersion() : 'dev';
  return {
    base: './', // rutas relativas: funciona igual en GitHub Pages (/kai-cristina/) que en un dominio propio
    define: { __APP_VERSION__: JSON.stringify(version) },
    build: { target: 'es2022', assetsInlineLimit: 0 },
    plugins: [kaiPwa(version)],
  };
});

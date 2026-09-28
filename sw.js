// Precarga todo para que funcione sin conexión. Luego: red primero (con límite de tiempo)
// para recibir siempre las preguntas nuevas, y caché como respaldo.
const CACHE = 'kai-v4';
const CORE = [
  './', 'index.html', 'css/styles.css', 'js/app.js', 'js/kai.js', 'js/install.js', 'js/installart.js', 'data/preguntas.json',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(r => { clearTimeout(t); resolve(r); }, err => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    // no-cache: pregunta siempre al servidor si hay versión nueva (GitHub Pages permite cachear 10 min)
    withTimeout(fetch(e.request, new URL(e.request.url).origin === self.location.origin ? { cache: 'no-cache' } : {}), 4000)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || Promise.reject(new Error('offline'))))
  );
});

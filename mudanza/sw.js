// Service worker de la dirección antigua: sustituye al de la KAI vieja y deja guardada la página
// de mudanza, para que se siga viendo aunque esta dirección deje de existir.
const CACHE = 'kai-mudanza-2'; // cambiar el número al tocar la página: así se refresca en los móviles
const PAGINA = ['./', 'index.html', 'kai.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PAGINA)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))) // fuera la KAI vieja
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Cualquier pantalla de la app vieja muestra la página de mudanza (guardada)
  if (e.request.mode === 'navigate') {
    e.respondWith(caches.match('index.html').then(r => r || fetch(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});

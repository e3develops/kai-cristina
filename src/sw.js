// Precarga todo para que funcione sin conexión. Luego: red primero (con límite de tiempo)
// para recibir siempre las preguntas nuevas, y caché como respaldo.
// Plantilla: al compilar, vite.config.js rellena el nombre de la caché y la lista de ficheros.
const CACHE = '__CACHE__';   // la app de esta versión: se renueva con cada versión
const DATOS = 'kai-datos';   // contenido de los exámenes (API): se conserva entre versiones
const CORE = ['__PRECACHE__'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== DATOS).map(k => caches.delete(k))))
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
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/auth/') || url.pathname === '/api/ping' || url.pathname.startsWith('/api/admin/')) return; // ni la sesión ni el ping se guardan
  if (url.hostname === 'challenges.cloudflare.com') return; // el antibots, siempre directo
  const destino = url.pathname.startsWith('/api/') ? DATOS : CACHE;
  e.respondWith(
    // no-cache: pregunta siempre al servidor si hay versión nueva (GitHub Pages permite cachear 10 min)
    // (los datos pesan más: más margen antes de tirar de la copia guardada)
    withTimeout(fetch(e.request, url.origin === self.location.origin ? { cache: 'no-cache' } : {}), destino === DATOS ? 15000 : 4000)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(destino).then(c => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || Promise.reject(new Error('offline'))))
  );
});

// ---------- Avisos (notificaciones push) ----------
// Muestra el aviso y avisa a la app abierta para que se refresque sola
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { texto: e.data?.text() }; }
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.titulo || 'KAI', {
      body: d.texto || '', icon: 'icons/icon-192.png', badge: 'icons/icon-192.png',
      tag: d.url || 'kai', data: { url: d.url || '/' },
    }),
    self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(cs => cs.forEach(c => c.postMessage({ tipo: 'aviso', datos: d }))),
  ]));
});
// Al tocar el aviso: abre la app (o la trae al frente) en lo que dice el aviso
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const c = cs[0];
    if (c) { c.postMessage({ tipo: 'abrir', url }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});

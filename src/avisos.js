// Avisos al móvil (notificaciones push). En iPhone solo funcionan con KAI instalada (iOS 16.4+).
import { api } from './api.js';

const deb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
export const avisosSoportados = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
// 'default' (sin decidir) · 'granted' · 'denied' · 'no' (este dispositivo no puede)
export const permisoAvisos = () => (avisosSoportados() ? Notification.permission : 'no');

async function suscribir() {
  const reg = await navigator.serviceWorker.ready;
  const { clave } = await api.clavePush();
  if (!clave) throw new Error('Los avisos no están configurados');
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: deb64u(clave) });
  await api.guardarPush(sub.toJSON());
}

// Llamar directamente desde el toque del usuario (el iPhone solo pregunta así)
export async function activarAvisos() {
  const p = await Notification.requestPermission();
  if (p !== 'granted') return p;
  await suscribir();
  return p;
}
// Al arrancar: si ya tenía permiso, vuelve a registrar el dispositivo (por si cambió de cuenta o caducó)
export async function sincronizarAvisos() {
  if (permisoAvisos() !== 'granted') return;
  try { await suscribir(); } catch (e) { /* sin conexión: ya se hará */ }
}
// Al cerrar sesión: este dispositivo deja de recibir los avisos de la cuenta
export async function olvidarAvisos() {
  try {
    const sub = await (await navigator.serviceWorker?.getRegistration())?.pushManager?.getSubscription();
    if (sub) await api.borrarPush(sub.endpoint);
  } catch (e) { /* nada */ }
}
// Lo que llega del service worker: un aviso nuevo (refrescar) o un toque en un aviso (abrir)
export function escucharAvisos({ alLlegar, alAbrir }) {
  navigator.serviceWorker?.addEventListener('message', e => {
    if (e.data?.tipo === 'aviso') alLlegar(e.data.datos);
    if (e.data?.tipo === 'abrir') alAbrir(new URL(e.data.url));
  });
}

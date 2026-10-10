// Bloqueos de IPs (p. ej. los de LaLiga en España): si la dirección principal no responde pero sí hay
// internet y la dirección de reserva responde, KAI lleva a la reserva (misma cuenta, mismos datos).
export const RESERVA = 'https://kai-e3develops.pages.dev';
export const PRINCIPAL = 'kai.e3develops.com';

// Para probarlo: ...?bloqueo simula que la dirección principal está bloqueada
export const simularBloqueo = /[?&]bloqueo(&|$)/.test(location.search);
export const enPrincipal = location.hostname === PRINCIPAL || simularBloqueo;

// ¿Responde la reserva? (no-cors: solo importa que llegue, no leer la respuesta)
export async function reservaResponde(ms = 5000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    await fetch(`${RESERVA}/version.json?t=${Date.now()}`, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
    return true;
  } catch (e) {
    return false;
  } finally {
    clearTimeout(t);
  }
}

// ¿Responde nuestro servidor? (va directo a la red, sin la copia guardada del service worker)
async function servidorResponde(ms = 5000) {
  if (simularBloqueo) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(`/api/ping?t=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
    return r.ok;
  } catch (e) {
    return false;
  } finally {
    clearTimeout(t);
  }
}

// ¿Está bloqueada la dirección principal? Es decir: nuestro servidor no responde, pero hay internet
// y la reserva sí responde (si no responde nada, simplemente no hay conexión: se sigue sin ella)
export async function hayBloqueo() {
  if (!enPrincipal || !navigator.onLine) return false;
  if (await servidorResponde()) return false;
  return reservaResponde();
}

export const irAReserva = () => location.replace(`${RESERVA}/`);

// Conexión con la API de KAI (mismo dominio: la sesión va en una cookie)
export class SinConexion extends Error {}
export class SinSesion extends Error {}

async function req(path, opts = {}) {
  let res;
  try {
    res = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  } catch (e) {
    throw new SinConexion('Sin conexión');
  }
  const data = await res.json().catch(() => ({}));
  // 401 en la API = sesión caducada; en /api/auth/ (entrar) = datos incorrectos, con su mensaje
  if (res.status === 401 && !path.startsWith('/api/auth/')) throw new SinSesion('Sin sesión');
  if (!res.ok) throw new Error(data.message || data.error || `Error ${res.status}`);
  return data;
}

export const api = {
  yo: () => req('/api/yo'),
  preferencias: () => req('/api/preferencias'),
  guardarPreferencias: cambios => req('/api/preferencias', { method: 'PATCH', body: JSON.stringify(cambios) }),
  examenes: () => req('/api/examenes'),
  examen: id => req(`/api/examenes/${id}`),
  json: url => req(url, { cache: 'no-cache' }),
  progreso: id => req(`/api/progreso/${id}`),
  subirProgreso: (id, estado, resumen) => req(`/api/progreso/${id}`, { method: 'PUT', body: JSON.stringify({ estado, resumen }) }),
  asignaturas: () => req('/api/asignaturas'),
  crearAsignatura: datos => req('/api/asignaturas', { method: 'POST', body: JSON.stringify(datos) }),
  editarAsignatura: (id, datos) => req(`/api/asignaturas/${id}`, { method: 'PATCH', body: JSON.stringify(datos) }),
  borrarAsignatura: id => req(`/api/asignaturas/${id}`, { method: 'DELETE' }),
  crearExamen: datos => req('/api/examenes', { method: 'POST', body: JSON.stringify(datos) }),
  editarExamen: (id, datos) => req(`/api/examenes/${id}`, { method: 'PATCH', body: JSON.stringify(datos) }),
  borrarExamen: id => req(`/api/examenes/${id}`, { method: 'DELETE' }),
  // captcha = respuesta del antibots (Turnstile), si está activado
  entrar: (email, password, captcha) => req('/api/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ email, password, rememberMe: true }), headers: captcha ? { 'x-captcha-response': captcha } : {} }),
  crearCuenta: (name, email, password, captcha) => req('/api/auth/sign-up/email', { method: 'POST', body: JSON.stringify({ name, email, password }), headers: captcha ? { 'x-captcha-response': captcha } : {} }),
  config: () => req('/api/config'),
  documentos: id => req(`/api/examenes/${id}/documentos`),
  borrarDocumento: doc => req(`/api/documentos/${doc}`, { method: 'DELETE' }),
  enviarExamen: id => req(`/api/examenes/${id}/enviar`, { method: 'POST', body: '{}' }),
  visto: id => req(`/api/examenes/${id}/visto`, { method: 'POST', body: '{}' }),
  adminResumen: () => req('/api/admin/resumen'),
  probarAviso: () => req('/api/admin/probar-aviso', { method: 'POST', body: '{}' }),
  clavePush: () => req('/api/push/clave'),
  guardarPush: sub => req('/api/push', { method: 'POST', body: JSON.stringify(sub) }),
  borrarPush: endpoint => req('/api/push', { method: 'DELETE', body: JSON.stringify({ endpoint }) }),
  notificaciones: () => req('/api/notificaciones'),
  borrarNotificacion: id => req(`/api/notificaciones/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  borrarNotificaciones: () => req('/api/notificaciones', { method: 'DELETE' }),
  notificacionesLeidas: () => req('/api/notificaciones/leidas', { method: 'POST', body: '{}' }),
  suplantar: id => req(`/api/admin/suplantar/${encodeURIComponent(id)}`, { method: 'POST', body: '{}' }),
  salirSuplantacion: () => req('/api/admin/suplantacion/salir', { method: 'POST', body: '{}' }),
  adminUsuarios: () => req('/api/admin/usuarios'),
  adminUsuario: id => req(`/api/admin/usuarios/${id}`),
  adminDocumentos: examen => req(`/api/admin/examenes/${examen}/documentos`),
  adminMensaje: (destino, titulo, texto) => req('/api/admin/mensajes', { method: 'POST', body: JSON.stringify({ destino, titulo, texto }) }),
  probarPush: () => req('/api/push/probar', { method: 'POST', body: '{}' }),
  // El archivo va tal cual en el cuerpo (no en JSON)
  subirDocumento: (id, blob, nombre) => req(`/api/examenes/${id}/documentos`, { method: 'POST', body: blob, headers: { 'Content-Type': blob.type, 'X-Nombre': encodeURIComponent(nombre) } }),
  salir: () => req('/api/auth/sign-out', { method: 'POST', body: '{}' }),
};

// Sesión recordada en el dispositivo: permite abrir la app sin conexión
const SESION = 'kai-sesion';
export const sesionGuardada = () => { try { return JSON.parse(localStorage.getItem(SESION)); } catch (e) { return null; } };
export const guardarSesion = s => { try { localStorage.setItem(SESION, JSON.stringify(s)); } catch (e) { /* sin almacenamiento */ } };
export const olvidarSesion = () => { try { localStorage.removeItem(SESION); } catch (e) { /* sin almacenamiento */ } };

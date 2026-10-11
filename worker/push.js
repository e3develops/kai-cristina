// Notificaciones push (Web Push: RFC 8030, cifrado RFC 8291, identificación VAPID RFC 8292).
// Solo WebCrypto: funciona igual en el Worker y en Node (tools/fabrica.mjs avisa al publicar).
const enc = new TextEncoder();
export const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const unir = (...partes) => {
  const out = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) { out.set(p, i); i += p.length; }
  return out;
};
const hkdf = async (salt, ikm, info, bytes) => {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bytes * 8));
};

// Clave pública VAPID (la que usa el navegador al suscribirse) a partir de la privada en JWK
export const clavePublica = jwk => b64u(unir(new Uint8Array([4]), deb64u(jwk.x), deb64u(jwk.y)));

async function cabeceraVapid(endpoint, jwk, contacto) {
  const cab = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const cuerpo = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: contacto })));
  const key = await crypto.subtle.importKey('jwk', { ...jwk, key_ops: ['sign'] }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const firma = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${cab}.${cuerpo}`));
  return `vapid t=${cab}.${cuerpo}.${b64u(firma)}, k=${clavePublica(jwk)}`;
}

// Cifra el mensaje para esa suscripción (aes128gcm, un solo registro)
async function cifrar(sub, texto) {
  const uaPub = deb64u(sub.p256dh);
  const auth = deb64u(sub.auth);
  const efimera = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', efimera.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const compartido = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, efimera.privateKey, 256));
  const ikm = await hkdf(auth, compartido, unir(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const k = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, k, unir(enc.encode(texto), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // 4096
  return unir(salt, rs, new Uint8Array([asPub.length]), asPub, cifrado);
}

// Envía un aviso. Devuelve el código HTTP (404/410 = la suscripción ya no existe: hay que borrarla)
export async function enviarPush(sub, datos, { jwk, contacto = 'mailto:e3develops@gmail.com' }) {
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await cabeceraVapid(sub.endpoint, jwk, contacto),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(4 * 86400),
      Urgency: 'high',
    },
    body: await cifrar(sub, JSON.stringify(datos)),
  });
  return res.status;
}

// Avisa en todos los dispositivos de un usuario y limpia las suscripciones caducadas.
// `db` = { todas(userId) → [{endpoint, p256dh, auth}], borrar(endpoint) }
export async function avisarUsuario(db, userId, datos, opciones) {
  const subs = await db.todas(userId);
  let ok = 0;
  for (const s of subs) {
    try {
      const st = await enviarPush(s, datos, opciones);
      if (st === 404 || st === 410) await db.borrar(s.endpoint);
      else if (st >= 200 && st < 300) ok++;
    } catch (e) { /* un dispositivo que falla no impide avisar a los demás */ }
  }
  return { dispositivos: subs.length, entregados: ok };
}

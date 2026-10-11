// Los avisos push: el mensaje cifrado se puede descifrar como lo haría el móvil (RFC 8291)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enviarPush, clavePublica, b64u } from '../worker/push.js';

const hkdf = async (salt, ikm, info, bytes) => {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bytes * 8));
};
const cat = (...p) => { const o = new Uint8Array(p.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
const te = new TextEncoder();

test('un aviso cifrado se descifra en el dispositivo y va firmado con VAPID', async () => {
  // El "móvil": su par de claves y su secreto
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaPub = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const vapid = await crypto.subtle.exportKey('jwk', (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign'])).privateKey);

  let pedido;
  const fetchReal = globalThis.fetch;
  globalThis.fetch = async (url, opts) => { pedido = { url, opts }; return new Response(null, { status: 201 }); };
  try {
    const st = await enviarPush({ endpoint: 'https://push.example.com/abc', p256dh: b64u(uaPub), auth: b64u(auth) }, { titulo: 'Hola', texto: 'ñ 🎉' }, { jwk: vapid });
    assert.equal(st, 201);
  } finally { globalThis.fetch = fetchReal; }

  // Descifrar como el móvil
  const body = new Uint8Array(pedido.opts.body);
  const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), datos = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
  const ikm = await hkdf(auth, ecdh, cat(te.encode('WebPush: info\0'), uaPub, asPub), 32);
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const k = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plano = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, k, datos));
  assert.equal(plano.at(-1), 2);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(plano.slice(0, -1))), { titulo: 'Hola', texto: 'ñ 🎉' });

  // Firma VAPID válida con la clave pública que se da al navegador
  const [, t, kpub] = pedido.opts.headers.Authorization.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(kpub, clavePublica(vapid));
  const [h, c, f] = t.split('.');
  const d64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), x => x.charCodeAt(0));
  const pub = await crypto.subtle.importKey('raw', d64(kpub), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, d64(f), te.encode(`${h}.${c}`)));
  assert.equal(JSON.parse(new TextDecoder().decode(d64(c))).aud, 'https://push.example.com');
  assert.equal(pedido.opts.headers['Content-Encoding'], 'aes128gcm');
});

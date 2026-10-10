// Emails al administrador con Cloudflare Email Routing (binding AVISOS: solo puede escribir a la
// dirección verificada). Si no está configurado, no pasa nada: el aviso queda en el panel.
import { EmailMessage } from 'cloudflare:email';

const b64 = s => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

export async function avisarAdmin(env, asunto, texto) {
  if (!env.AVISOS || !env.ADMIN) return false;
  const from = env.AVISOS_DESDE || 'kai@e3develops.com';
  const raw = [
    `From: KAI <${from}>`,
    `To: ${env.ADMIN}`,
    `Subject: =?UTF-8?B?${b64(asunto)}?=`,
    `Message-ID: <${crypto.randomUUID()}@${from.split('@')[1]}>`,
    `Date: ${new Date().toUTCString()}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    b64(texto).replace(/(.{76})/g, '$1\r\n'),
  ].join('\r\n');
  try {
    await env.AVISOS.send(new EmailMessage(from, env.ADMIN, raw));
    return true;
  } catch (e) {
    console.error('No se pudo enviar el aviso', e);
    return false;
  }
}

// Como mucho un aviso de cada tipo al día (p. ej. "se ha llegado al tope de espacio")
export async function avisarUnaVezAlDia(env, clave, asunto, texto) {
  const k = `aviso:${clave}:${new Date().toISOString().slice(0, 10)}`;
  if (await env.CONTENIDO.get(k)) return;
  await env.CONTENIDO.put(k, '1', { expirationTtl: 60 * 60 * 26 });
  await avisarAdmin(env, asunto, texto);
}

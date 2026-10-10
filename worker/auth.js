// Cuentas con Better Auth sobre D1. Registro abierto: cualquiera puede crear su cuenta.
import { betterAuth } from 'better-auth';
import { captcha } from 'better-auth/plugins';

export const esAdmin = (env, user) => !!user && String(env.ADMIN || '').toLowerCase() === String(user.email).toLowerCase();

// Se crea por petición: en Workers los bindings (env) solo existen dentro de cada petición
export function crearAuth(env, request) {
  const origin = new URL(request.url).origin;
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: origin,
    trustedOrigins: [origin],
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    // Antibots (Cloudflare Turnstile) al crear cuenta y al entrar, si está configurado
    plugins: env.TURNSTILE_SECRET ? [captcha({ provider: 'cloudflare-turnstile', secretKey: env.TURNSTILE_SECRET })] : [],
    session: {
      expiresIn: 60 * 60 * 24 * 90, // 90 días: en el móvil no queremos pedir la contraseña a menudo
      updateAge: 60 * 60 * 24,
    },
    databaseHooks: {
      user: {
        create: {
          // La cuenta del administrador recibe el examen de pruebas (las demás empiezan con la biblioteca vacía)
          after: async user => {
            if (!env.EXAMEN_INICIAL || !esAdmin(env, user)) return;
            const meta = await env.CONTENIDO.get(`${env.EXAMEN_INICIAL}/examen.json`, 'json');
            if (!meta) return;
            await env.DB.prepare(
              'insert into examen (id, user_id, nombre, fecha, opciones, penalizacion, nivel, contenido, creado) values (?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).bind(crypto.randomUUID(), user.id, meta.nombre, meta.fecha ?? null, meta.formato?.opciones ?? 4,
              meta.formato?.penalizacion ?? null, meta.nivel || 'medio', env.EXAMEN_INICIAL, Date.now()).run();
          },
        },
      },
    },
  });
}

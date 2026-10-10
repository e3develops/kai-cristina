// Cuentas con Better Auth sobre D1. Solo se pueden crear las cuentas de CORREOS_PERMITIDOS.
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';

export const permitidos = env => String(env.CORREOS_PERMITIDOS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
export const esAdmin = (env, user) => !!user && permitidos(env)[0] === String(user.email).toLowerCase();

// Se crea por petición: en Workers los bindings (env) solo existen dentro de cada petición
export function crearAuth(env, request) {
  const origin = new URL(request.url).origin;
  return betterAuth({
    database: env.DB,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: origin,
    trustedOrigins: [origin],
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    session: {
      expiresIn: 60 * 60 * 24 * 90, // 90 días: en el móvil no queremos pedir la contraseña a menudo
      updateAge: 60 * 60 * 24,
    },
    databaseHooks: {
      user: {
        create: {
          before: async user => {
            if (!permitidos(env).includes(String(user.email).toLowerCase())) {
              throw new APIError('FORBIDDEN', { message: 'Este correo no tiene acceso a KAI.' });
            }
            return { data: user };
          },
          // Cada cuenta nueva recibe el examen inicial
          after: async user => {
            if (!env.EXAMEN_INICIAL) return;
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

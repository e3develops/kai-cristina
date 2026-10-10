// Todo lo de /api/* se reenvía al Worker de KAI por dentro de Cloudflare.
// Se presenta como si viniera del dominio principal para que las cuentas (Better Auth) lo acepten;
// la cookie de sesión se queda en esta dirección.
export const onRequest = ({ request, env }) => {
  const url = new URL(request.url);
  const req = new Request(new URL(url.pathname + url.search, 'https://kai.e3develops.com'), request);
  if (req.headers.has('Origin')) req.headers.set('Origin', 'https://kai.e3develops.com');
  return env.KAI.fetch(req);
};

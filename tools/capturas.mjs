// Capturas de todas las pantallas de KAI (para revisar el diseño) en iPhone, iPad vertical e iPad horizontal.
// Uso: con `wrangler dev` en marcha (puerto 8787) →  node tools/capturas.mjs [carpeta] [dispositivo]
// Cuentas de prueba locales: cris.pruebas@kai.test (alumna con datos) y admin@kai.test; contraseña en
// .dev.vars (KAI_TEST_PASSWORD). Deja capturas de página completa y "tiras" de fotogramas de transiciones.
import { chromium, devices } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://localhost:8787';
const OUT = process.argv[2] || 'capturas';
const SOLO = process.argv[3];
const PW = readFileSync('.dev.vars', 'utf8').match(/KAI_TEST_PASSWORD=(.+)/)[1].trim();
const DISPOSITIVOS = {
  iphone: devices['iPhone 13'],
  ipad: devices['iPad (gen 7)'],
  'ipad-horizontal': devices['iPad (gen 7) landscape'],
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function entrar(ctx, email) {
  const r = await ctx.request.post(`${BASE}/api/auth/sign-in/email`, {
    headers: { 'Content-Type': 'application/json', Origin: BASE, 'x-captcha-response': 'prueba' },
    data: { email, password: PW, rememberMe: true },
  });
  if (!r.ok()) throw new Error(`No se pudo entrar como ${email}: ${r.status()}`);
}
const api = (ctx, method, path, data) => ctx.request.fetch(`${BASE}${path}`, { method, data, headers: { 'Content-Type': 'application/json', Origin: BASE } });

async function capturar(nombre, disp) {
  const dir = join(OUT, nombre);
  mkdirSync(dir, { recursive: true });
  // Se usa el Chrome instalado (el Chrome descargado por Playwright lo bloquea la política de Windows)
  const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch({ channel: 'msedge' }));
  let n = 0;
  const foto = async (page, titulo, full = true) => {
    console.log(`  ${nombre} · ${titulo}`);
    await sleep(550); // que terminen las animaciones de entrada
    await page.screenshot({ path: join(dir, `${String(++n).padStart(2, '0')}-${titulo}.png`), fullPage: full });
  };
  // Tira de fotogramas de una transición: lo que se ve justo después de una acción
  const tira = async (page, titulo, accion, frames = 8, cada = 70) => {
    await accion();
    for (let i = 0; i < frames; i++) {
      await page.screenshot({ path: join(dir, `${String(n + 1).padStart(2, '0')}-${titulo}-f${i}.png`) });
      await sleep(cada);
    }
    n++;
  };
  const nuevo = async ({ permitirNavegador = true } = {}) => {
    const ctx = await browser.newContext({ ...disp, locale: 'es-ES' });
    ctx.setDefaultTimeout(8000);
    if (permitirNavegador) await ctx.addInitScript(() => { localStorage.setItem('kai-allow-browser', '1'); localStorage.setItem('kai-install', String(Date.now() + 864e5)); });
    return ctx;
  };
  const clic = (page, sel) => page.locator(sel).first().click();
  const cerrarModal = async page => {
    const btn = page.locator('.modal-bg [data-a=close]');
    if (await btn.count()) await btn.first().click();
    else await page.evaluate(() => document.querySelectorAll('.modal-bg').forEach(m => m.remove()));
    await sleep(200);
  };

  // 1) Instalación (iPhone/iPad en Safari, sin instalar)
  {
    const ctx = await nuevo({ permitirNavegador: false });
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForSelector('.bubble');
    await foto(page, 'instalar-1', false);
    await clic(page, '#next'); await clic(page, '#next');
    await foto(page, 'instalar-3', false);
    await ctx.close();
  }
  // 2) Entrar y crear cuenta
  {
    const ctx = await nuevo();
    const page = await ctx.newPage();
    await page.goto(BASE);
    await page.waitForSelector('#login');
    await foto(page, 'entrar');
    await clic(page, '#toggle');
    await foto(page, 'crear-cuenta');
    await ctx.close();
  }
  // 3) La alumna: presentación, biblioteca y estudio
  const ctx = await nuevo();
  await entrar(ctx, 'cris.pruebas@kai.test');
  await api(ctx, 'PATCH', '/api/preferencias', { presentacion: false });
  // Un examen sin apuntes (para la pantalla de subir)
  const lista = await (await api(ctx, 'GET', '/api/examenes')).json();
  const asig = (await (await api(ctx, 'GET', '/api/asignaturas')).json())[0];
  if (!lista.some(e => e.nombre.startsWith('Tema 3'))) {
    const f = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
    await api(ctx, 'POST', '/api/examenes', { nombre: 'Tema 3 · Membrana', fecha: f, formato: { opciones: 4, penalizacion: null }, nivel: 'medio', asignatura: asig.id });
  }
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForSelector('.dots');
  await foto(page, 'presentacion-1', false);
  await clic(page, '#next');
  await foto(page, 'presentacion-2', false);
  while (await page.locator('#next').count()) await clic(page, '#next');
  await clic(page, '#fin');
  await page.waitForSelector('.tabbar');
  await foto(page, 'inicio');
  await clic(page, '[data-why=b-rec]');
  await foto(page, 'inicio-porque', false);
  await cerrarModal(page);
  await tira(page, 'transicion-pestana', () => clic(page, '[data-tab=asignaturas]'));
  await foto(page, 'asignaturas');
  await clic(page, '[data-asig]');
  await foto(page, 'asignatura');
  await clic(page, '#nuevo-ex');
  await foto(page, 'nuevo-examen');
  await clic(page, '#volver');
  await clic(page, '#editar');
  await foto(page, 'editar-asignatura');
  await clic(page, '#volver');
  await page.locator('.lib-ex', { hasText: 'Tema 3' }).first().click();
  await page.waitForSelector('#apuntes .subir');
  await foto(page, 'apuntes-sin-subir');
  await clic(page, '#volver');
  await page.locator('.lib-ex', { hasText: 'Tema 2' }).first().click();
  await page.waitForSelector('#apuntes');
  await foto(page, 'apuntes-preparando');
  await clic(page, '[data-tab=calendario]');
  await foto(page, 'calendario');
  await clic(page, '[data-why=b-plan]');
  await foto(page, 'calendario-porque', false);
  await cerrarModal(page);
  await clic(page, '[data-tab=inicio]');
  await clic(page, '#cuenta');
  await foto(page, 'menu-cuenta', false);
  await cerrarModal(page);

  // Estudio de un examen
  await clic(page, '[data-tab=inicio]');
  await page.locator('.lib-ex', { hasText: 'Infecciones' }).first().click();
  await page.waitForSelector('#biblio');
  await foto(page, 'examen');
  await clic(page, '[data-why=rango], [data-why=nota]');
  await foto(page, 'examen-porque', false);
  await cerrarModal(page);
  await clic(page, '#menu');
  await foto(page, 'examen-menu', false);
  await cerrarModal(page);
  await clic(page, '#progress');
  await foto(page, 'temario-progreso');
  await clic(page, '[data-tab=apuntes]');
  await page.waitForSelector('.pg img');
  await foto(page, 'temario-apuntes');
  await clic(page, '.pg');
  await page.waitForSelector('.viewer img');
  await foto(page, 'visor-pagina', false);
  await clic(page, '.viewer [data-a=close]');
  await clic(page, '#back');
  await tira(page, 'transicion-a-pregunta', () => clic(page, '#study, #diag'));
  await foto(page, 'pregunta', false);
  await tira(page, 'transicion-responder', () => clic(page, '.opt'), 10, 60);
  await foto(page, 'respuesta', true);
  const book = page.locator('.book-btn');
  if (await book.count()) {
    await book.first().click();
    await page.waitForSelector('.viewer img');
    await foto(page, 'visor-subrayado', false);
    await clic(page, '.viewer [data-a=close]');
  }
  // Terminar la ronda para ver los resultados
  for (let i = 0; i < 40 && await page.locator('#next').count(); i++) {
    await clic(page, '#next');
    await sleep(420);
    if (await page.locator('.opt:not([disabled])').count()) { await page.locator('.opt').nth(i % 4).click(); await sleep(420); }
  }
  await page.waitForSelector('.result-hero', { timeout: 15000 }).catch(() => {});
  await foto(page, 'resultados');
  await ctx.close();

  // 4) Administración
  {
    const actx = await nuevo();
    await entrar(actx, 'admin@kai.test');
    await api(actx, 'PATCH', '/api/preferencias', { presentacion: true });
    const p = await actx.newPage();
    await p.goto(BASE);
    await p.waitForSelector('#cuenta');
    await clic(p, '#cuenta');
    await clic(p, '[data-a=admin]');
    await p.waitForSelector('#probar-aviso');
    await foto(p, 'admin');
    await actx.close();
  }
  await browser.close();
  console.log(`${nombre}: ${n} capturas en ${dir}`);
}

for (const [nombre, disp] of Object.entries(DISPOSITIVOS)) {
  if (SOLO && SOLO !== nombre) continue;
  try { await capturar(nombre, disp); } catch (e) { console.error(`${nombre}: ${e.message}`); }
}

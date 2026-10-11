// La fábrica de preguntas (modo semiautomático): de los apuntes que sube un usuario a un examen listo.
//
//   node tools/fabrica.mjs pendientes                 exámenes enviados a preparar
//   node tools/fabrica.mjs descargar <examen>         baja sus apuntes a fuentes/<examen>/originales/
//   python tools/fabrica_paginas.py <examen>          páginas + palabras con posición (OCR)
//   … se leen las páginas y se escriben las preguntas en fuentes/<examen>/preguntas/*.json …
//   node tools/fabrica.mjs construir <examen>         valida (regla de oro), subraya y genera contenido/<examen>/
//   node tools/fabrica.mjs publicar <examen>          lo sube y marca el examen como listo (el usuario ve "¡ya está!")
//
// Por defecto trabaja contra Cloudflare (--remote). Con --local, contra `wrangler dev`.
//
// Formato de cada pregunta: { id, tema, seccion, concepto, pregunta, opciones[4], correcta (0-3),
//   fuente (cita literal), pagina, importancia (3 = imprescindible, 2 = importante, 1 = detalle) }
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localizar, normaliza, UMBRAL } from './subrayar.mjs';
import { avisarUsuario } from '../worker/push.js';

const UMBRAL_TRANSCRIPCION = 0.9; // la transcripción es fiel: la cita tiene que estar casi letra por letra
const UMBRAL_SUBRAYADO = 0.6;     // para subrayar basta con reconocer buena parte de la frase en la foto

const ROOT = fileURLToPath(new URL('..', import.meta.url));

export function validarPregunta(p) {
  for (const k of ['id', 'tema', 'seccion', 'concepto', 'pregunta', 'fuente']) if (!p[k] || typeof p[k] !== 'string') return `falta "${k}"`;
  if (!Array.isArray(p.opciones) || p.opciones.length !== 4 || p.opciones.some(o => !o || typeof o !== 'string')) return 'tiene que tener 4 opciones';
  if (new Set(p.opciones.map(normaliza)).size !== 4) return 'opciones repetidas';
  if (![0, 1, 2, 3].includes(p.correcta)) return 'la correcta tiene que ser 0-3';
  if (!Number.isInteger(p.pagina) || p.pagina < 1) return 'página no válida';
  if (![1, 2, 3].includes(p.importancia)) return 'importancia tiene que ser 1, 2 o 3';
  return null;
}

// ---------- wrangler ----------
// Se llama a wrangler con node directamente (sin consola de por medio: así no hay líos con las comillas)
const WRANGLER = join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
function wrangler(args, { json = false } = {}) {
  const out = execFileSync(process.execPath, [WRANGLER, ...args], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  return json ? JSON.parse(out.slice(out.indexOf('['))) : out;
}
const donde = local => (local ? ['--local', '--persist-to', '.wrangler/state'] : ['--remote']);
const sql = (q, local) => wrangler(['d1', 'execute', 'kai', ...donde(local), '--json', '--command', q.replace(/\s+/g, ' ')], { json: true })[0].results;
const id = s => { if (!/^[\w-]{8,64}$/.test(s || '')) throw new Error('Id de examen no válido'); return s; };

// ---------- comandos ----------
const comandos = {
  pendientes(local) {
    const rows = sql(`select e.id, e.nombre, e.fecha, u.email, (select count(*) from documento d where d.examen_id = e.id) as archivos
      from examen e join "user" u on u.id = e.user_id where e.estado = 'procesando' order by e.enviado`, local);
    if (!rows.length) return console.log('Nada pendiente 🎉');
    rows.forEach(r => console.log(`${r.id}  ${r.nombre}  (${r.email}, ${r.archivos} archivos${r.fecha ? `, examen ${r.fecha}` : ''})`));
  },

  descargar(local, eid) {
    id(eid);
    const docs = sql(`select id, nombre, tipo, clave from documento where examen_id = '${eid}' order by creado`, local);
    const dir = join(ROOT, 'fuentes', eid, 'originales');
    mkdirSync(dir, { recursive: true });
    const meta = docs.map((d, i) => {
      const archivo = `${String(i + 1).padStart(3, '0')}-${d.id}.${d.clave.split('.').pop()}`;
      wrangler(['r2', 'object', 'get', `kai-apuntes/${d.clave}`, '--file', join(dir, archivo), ...donde(local)]);
      console.log(`  ${archivo}  (${d.nombre})`);
      return { archivo, nombre: d.nombre, tipo: d.tipo };
    });
    writeFileSync(join(ROOT, 'fuentes', eid, 'documentos-subidos.json'), JSON.stringify(meta, null, 1));
    const ex = sql(`select nombre, fecha, opciones, penalizacion, nivel from examen where id = '${eid}'`, local)[0];
    writeFileSync(join(ROOT, 'fuentes', eid, 'examen.json'), JSON.stringify(ex, null, 1));
    console.log(`${docs.length} archivos en ${dir}\nSiguiente: python tools/fabrica_paginas.py ${eid}`);
  },

  construir(_local, eid) {
    id(eid);
    const docs = JSON.parse(readFileSync(join(ROOT, 'contenido', eid, 'documentos.json'), 'utf8'));
    const dirP = join(ROOT, 'fuentes', eid, 'preguntas');
    if (!existsSync(dirP)) throw new Error(`No hay preguntas en ${dirP}`);
    const palabras = {};
    const pal = key => (palabras[key] ??= existsSync(join(ROOT, 'fuentes', eid, 'paginas', `${key}.json`))
      ? JSON.parse(readFileSync(join(ROOT, 'fuentes', eid, 'paginas', `${key}.json`), 'utf8')) : []);
    const todas = readdirSync(dirP).filter(f => f.endsWith('.json')).flatMap(f => JSON.parse(readFileSync(join(dirP, f), 'utf8')));
    let subrayadas = 0;
    const ok = [], resaltados = {}, rechazadas = [], vistas = new Set();
    const trans = {};
    const transcripcion = key => {
      if (!(key in trans)) {
        const f = join(ROOT, 'fuentes', eid, 'paginas', `${key}.transcripcion.txt`);
        // La transcripción se trata como palabras sin posición (solo sirve para validar)
        trans[key] = existsSync(f) ? readFileSync(f, 'utf8').split(/\s+/).filter(Boolean).map(t => ({ t, b: [0, 0, 0, 0] })) : null;
      }
      return trans[key];
    };
    for (const p of todas) {
      const err = validarPregunta(p);
      if (err) { rechazadas.push([p.id, err]); continue; }
      const clave = normaliza(p.pregunta);
      if (vistas.has(clave)) { rechazadas.push([p.id, 'duplicada']); continue; }
      // Regla de oro: la cita tiene que estar en su página (o en otra del mismo documento: se corrige).
      // Se comprueba contra la transcripción de la página si existe; si no, contra el OCR (más exigente).
      const doc = docs.find(d => d.tema === p.tema);
      const candidatas = [p.pagina, ...(doc?.paginas || []).filter(n => n !== p.pagina)];
      let pagina = null, mejor = 0;
      for (const n of candidatas) {
        const tr = transcripcion(`${p.tema}-${n}`);
        const s = tr ? localizar(p.fuente, tr).score : localizar(p.fuente, pal(`${p.tema}-${n}`)).score;
        const ok = s >= (tr ? UMBRAL_TRANSCRIPCION : UMBRAL);
        if (s > mejor) mejor = s;
        if (ok) { pagina = n; break; }
      }
      if (pagina == null) { rechazadas.push([p.id, `la cita no está en los apuntes (${Math.round(mejor * 100)} %)`]); continue; }
      // Subrayado: dónde está la frase en la foto, según el OCR (si no se encuentra bien, la página sin subrayar)
      const r = localizar(p.fuente, pal(`${p.tema}-${pagina}`));
      vistas.add(clave);
      ok.push({ ...p, pagina });
      resaltados[p.id] = { img: `paginas/${p.tema}-${pagina}.jpg`, rects: r.score >= UMBRAL_SUBRAYADO ? r.rects : [] };
      if (r.score >= UMBRAL_SUBRAYADO) subrayadas++;
    }
    const temas = docs.map(d => ({ id: d.tema, nombre: d.titulo, corto: d.titulo.slice(0, 24), emoji: d.tema === 'fotos' ? '📸' : '📄', fuente: d.origen }))
      .filter(t => ok.some(p => p.tema === t.id));
    const out = join(ROOT, 'contenido', eid);
    writeFileSync(join(out, 'preguntas.json'), JSON.stringify({ version: Date.now(), temas, preguntas: ok }));
    writeFileSync(join(out, 'resaltados.json'), JSON.stringify(resaltados));
    const porImp = [3, 2, 1].map(i => ok.filter(p => p.importancia === i).length);
    console.log(`✅ ${ok.length} preguntas (★★★ ${porImp[0]} · ★★ ${porImp[1]} · ★ ${porImp[2]}) en ${new Set(ok.map(p => p.concepto)).size} conceptos · ${subrayadas} con subrayado en la foto`);
    if (rechazadas.length) { console.log(`❌ ${rechazadas.length} rechazadas:`); rechazadas.forEach(([i, e]) => console.log(`   ${i}: ${e}`)); }
    console.log(`Siguiente: node tools/fabrica.mjs publicar ${eid}`);
  },

  async publicar(local, eid) {
    id(eid);
    const n = JSON.parse(readFileSync(join(ROOT, 'contenido', eid, 'preguntas.json'), 'utf8')).preguntas.length;
    if (!n) throw new Error('No hay preguntas que publicar');
    execFileSync('node', ['tools/subir_contenido.mjs', eid, local ? '--local' : '--remote'], { cwd: ROOT, stdio: 'inherit' });
    sql(`update examen set contenido = '${eid}', estado = 'listo', listo_aviso = 1 where id = '${eid}'`, local);
    console.log(`🎉 Publicado: ${n} preguntas. El usuario verá "¡Tus apuntes ya están listos!" al abrir KAI.`);
    await avisarListo(local, eid, n);
  },
  // Repetir solo el aviso al móvil (p. ej. para probar)
  async avisar(local, eid) {
    id(eid);
    const n = JSON.parse(readFileSync(join(ROOT, 'contenido', eid, 'preguntas.json'), 'utf8')).preguntas.length;
    await avisarListo(local, eid, n);
  },
};

// Aviso al móvil del usuario: "tus preguntas están listas" (clave VAPID privada en .vapid.json, fuera de git)
async function avisarListo(local, eid, n) {
  const fichero = join(ROOT, '.vapid.json');
  if (!existsSync(fichero)) return console.log('(sin .vapid.json: no se envía aviso al móvil)');
  const [ex] = sql(`select user_id, nombre from examen where id = '${eid}'`, local);
  if (!ex) return;
  const db = {
    todas: uid => sql(`select endpoint, p256dh, auth from push where user_id = '${uid.replace(/'/g, "''")}'`, local),
    borrar: endpoint => sql(`delete from push where endpoint = '${endpoint.replace(/'/g, "''")}'`, local),
  };
  const r = await avisarUsuario(db, ex.user_id, {
    titulo: '¡Tus preguntas están listas! 🎉',
    texto: `He preparado ${n} preguntas de «${ex.nombre}». ¿Empezamos?`,
    url: `/?examen=${eid}`,
  }, { jwk: JSON.parse(readFileSync(fichero, 'utf8')) });
  console.log(r.dispositivos ? `📲 Aviso enviado a ${r.entregados} de ${r.dispositivos} dispositivos` : '📵 El usuario no tiene los avisos activados');
}

// Ejecutar solo si se llama desde la terminal (los tests importan validarPregunta)
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const local = args.includes('--local');
  const [cmd, eid] = args.filter(a => !a.startsWith('--'));
  if (!comandos[cmd]) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(0, 13).join('\n'));
    process.exit(1);
  }
  Promise.resolve().then(() => comandos[cmd](local, eid)).catch(e => { console.error(`Error: ${e.message}`); process.exit(1); });
}

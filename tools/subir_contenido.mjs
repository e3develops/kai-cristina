// Sube el contenido de un examen (contenido/<id>/) al KV privado de Cloudflare.
// Uso: node tools/subir_contenido.mjs <id> [--local | --remote]
//   --local  → al KV de `wrangler dev` (pruebas en este ordenador)
//   --remote → al KV real de Cloudflare
import { readdirSync, readFileSync, statSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const [id, modo = '--local'] = process.argv.slice(2);
if (!id || !['--local', '--remote'].includes(modo)) {
  console.error('Uso: node tools/subir_contenido.mjs <id> [--local | --remote]');
  process.exit(1);
}
const dir = join('contenido', id);
const files = [];
const walk = d => readdirSync(d).forEach(f => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); });
walk(dir);

const entries = files.map(p => {
  const key = `${id}/${relative(dir, p).replaceAll('\\', '/')}`;
  const buf = readFileSync(p);
  return p.endsWith('.json') ? { key, value: buf.toString('utf8') } : { key, value: buf.toString('base64'), base64: true };
});
const tmp = mkdtempSync(join(tmpdir(), 'kai-kv-'));
const bulk = join(tmp, 'bulk.json');
writeFileSync(bulk, JSON.stringify(entries));
console.log(`${entries.length} ficheros de ${dir} → KV (${modo === '--local' ? 'local' : 'Cloudflare'})`);
try {
  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['wrangler', 'kv', 'bulk', 'put', bulk, '--binding', 'CONTENIDO', modo], { stdio: 'inherit', shell: process.platform === 'win32' });
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// Ejecuta todas las pruebas E2E. Cada prueba imprime al final un arreglo de errores de página: debe ser [].
// La prueba "dian" necesita el servidor en :8099 (se levanta aquí con almacenamiento en archivo).
const { spawn, spawnSync } = require('child_process'), path = require('path'), fs = require('fs');
const { ROOT, OUT } = require('./helpers.js');
const only = process.argv.slice(2);
const files = fs.readdirSync(path.join(__dirname, 'e2e')).filter(f => f.endsWith('.test.js')).filter(f => !only.length || only.some(o => f.startsWith(o)));
// pg.html base que usan varias pruebas
fs.writeFileSync(path.join(OUT, 'pg.html'), '<!doctype html><body><script>localStorage.setItem("lmf-tour","1");window.claude={use:async()=>null}</script>' + fs.readFileSync(path.join(ROOT, 'dist', 'mirai.html'), 'utf8') + '</body>');
let srv = null;
if (files.some(f => f.startsWith('dian'))) {
  const data = path.join(OUT, 'e2e-store.json'); try { fs.unlinkSync(data); } catch {}
  srv = spawn(process.execPath, ['index.js'], { cwd: path.join(ROOT, 'server'), env: { ...process.env, PORT: '8099', MIRAI_TOKEN: 't', ENCRYPTION_KEY: 'clave-de-pruebas-local', STORE: 'file', DATA_FILE: data }, stdio: 'ignore' });
  spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},1500)']);
}
let fail = 0;
for (const f of files) {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'e2e', f)], { cwd: OUT, encoding: 'utf8', timeout: 120000 });
  const out = (r.stdout || '') + (r.stderr || ''); const last = out.trim().split('\n').slice(-1)[0] || '';
  const ok = r.status === 0 && /\[\]\s*$/.test(out.trim());
  if (!ok) fail++;
  console.log(`${ok ? '✔' : '✘'} ${f.replace('.test.js', '').padEnd(8)} ${ok ? '' : last.slice(0, 160)}`);
}
if (srv) srv.kill();
console.log(fail ? `\n${fail} prueba(s) con problemas. Capturas en tests/.out/` : '\nTodas las pruebas pasaron.');
process.exit(fail ? 1 : 0);

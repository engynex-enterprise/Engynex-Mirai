// Rutas compartidas por las pruebas E2E (Playwright).
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'tests', '.out');            // capturas y HTML temporales (ignorado por git)
fs.mkdirSync(OUT, { recursive: true });
const APP = path.join(ROOT, 'dist', 'mirai.html');       // generado por `npm run build`
module.exports = { ROOT, OUT, APP };

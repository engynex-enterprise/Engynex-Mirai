// Regenera CHANGELOG.md desde RELEASES (src/k_ayuda.js).
const fs = require('fs'), path = require('path');
const s = fs.readFileSync(path.join(__dirname, '..', 'src', 'k_ayuda.js'), 'utf8');
const i = s.indexOf('const RELEASES=['); let d = 0, j = i + 15;
for (; j < s.length; j++) { if (s[j] === '[') d++; if (s[j] === ']') { d--; if (!d) break; } }
const R = eval(s.slice(i + 15, j + 1)); const T = { new: 'Nuevo', imp: 'Mejora', fix: 'Corrección' }; const strip = x => String(x || '').replace(/<[^>]+>/g, '');
let md = '# Changelog\n\nGenerado desde `RELEASES` en `src/k_ayuda.js` (Ayuda › Novedades). No editar a mano: `node scripts/changelog.js`.\n\n';
for (const r of R) { md += `## v${r.v} — ${r.t} (${r.f})\n\n`; for (const it of r.items) md += `- **${T[it[0]] || it[0]} · ${strip(it[1])}:** ${strip(it[2])}\n`; md += '\n'; }
fs.writeFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), md); console.log(`CHANGELOG.md: ${R.length} versiones`);

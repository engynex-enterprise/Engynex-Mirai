#!/usr/bin/env python3
"""Construye Mirai: concatena src/*.js en orden, inyecta íconos (Lucide) e isotipos y genera
   dist/mirai.html (single-file) y server/public/index.html (documento completo para Vercel/Express).
   Uso: python3 build.py
"""
import re, os, json, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
# ORDEN IMPORTA: los módulos posteriores envuelven/reasignan funciones de los anteriores.
ORDER = ['b_core.js','c_views.js','c2_views.js','e_ai.js','d_app.js','f_extra.js','g_auth.js','h_forms.js','i_geo.js',
         'j_loans.js','k_ayuda.js','l_ajustes.js','m_nomina.js','n_servidor.js','o_asesor.js','p_calendario.js',
         'q_integraciones.js','r_gamif.js','s_dian.js','z_boot.js']
js = ''.join(open(os.path.join(SRC, f), encoding='utf-8').read() + '\n' for f in ORDER)
shell = open(os.path.join(SRC, 'a_shell.html'), encoding='utf-8').read()

# --- Íconos Lucide: solo los que se usan. Fuente: node_modules/lucide-static (si existe) o vendor/lucide-icons.json
names = set(re.findall(r"""['"`]([a-z0-9]+(?:-[a-z0-9]+)*)['"`]""", js + shell)) | set(re.findall(r'data-icon="([a-z0-9-]+)"', shell))
VENDOR = os.path.join(ROOT, 'vendor', 'lucide-icons.json')
cache = json.load(open(VENDOR)) if os.path.exists(VENDOR) else {}
IC = os.path.join(ROOT, 'node_modules', 'lucide-static', 'icons')
icons, added = {}, 0
for n in sorted(names):
    f = os.path.join(IC, n + '.svg')
    if os.path.exists(f):
        inner = re.search(r'<svg[^>]*>(.*)</svg>', open(f).read(), re.S).group(1)
        icons[n] = re.sub(r'\s+', ' ', inner).replace(' />', '/>').strip()
        if cache.get(n) != icons[n]: cache[n] = icons[n]; added += 1
    elif n in cache:
        icons[n] = cache[n]
if added:
    json.dump(cache, open(VENDOR, 'w'), separators=(',', ':'), sort_keys=True)
js = js.replace('/*ICONS*/{}', json.dumps(icons, separators=(',', ':')), 1)

# --- Isotipos (íconos ilustrados del menú). iso/iso.json es la fuente de verdad.
ISO = json.load(open(os.path.join(ROOT, 'iso', 'iso.json')))
js = 'const ISO=' + json.dumps(ISO['icons'], separators=(',', ':')) + ';\n' + js
shell = shell.replace('<div class="shell">', '<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>' + ISO['defs'] + '</defs></svg>\n<div class="shell">', 1)

out = shell + '\n<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>\n<script>\n' + js + '</script>\n'
os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
open(os.path.join(ROOT, 'dist', 'mirai.html'), 'w', encoding='utf-8').write(out)          # fragmento (artifact claude.ai)
open(os.path.join(ROOT, 'dist', 'app.check.js'), 'w', encoding='utf-8').write(js)         # para `node --check`
os.makedirs(os.path.join(ROOT, 'server', 'public'), exist_ok=True)
open(os.path.join(ROOT, 'server', 'public', 'index.html'), 'w', encoding='utf-8').write(
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
    '<meta name="theme-color" content="#1F2B4B"><title>Mirai · Tu futuro financiero</title></head><body>' + out + '</body></html>')
missing = sorted(n for n in names if n not in icons and '-' in n and len(n) < 30)
print(f'{len(icons)} íconos · {len(out)//1024} KB · dist/mirai.html + server/public/index.html' + (f' · {added} íconos nuevos en vendor' if added else ''))

# CLAUDE.md — Mirai

> Instrucciones y contexto para Claude Code (y cualquier agente) al trabajar en este repositorio.
> Las reglas detalladas están en `.agents/rules/` y los flujos en `.agents/workflows/`. Este archivo es el punto de entrada.

## 1. Qué es Mirai

**Mirai** (未来, "futuro" en japonés; antes "Nido" y "Libro Mayor Familiar") es una plataforma web de **finanzas personales y familiares para Colombia**. La usa el dueño del producto (Alberto) con su familia y está pensada para personas **sin conocimientos financieros**.

- **Idioma:** toda la interfaz, los textos, los comentarios de cara al usuario y las respuestas al dueño del producto van en **español de Colombia**, con trato de "tú".
- **Principio de producto:** *extremadamente simple*. Nada de jerga sin explicar. Cada campo tiene un ícono de información, cada modal una descripción, cada sección un botón "Cómo funciona". Si hay que elegir entre "potente" y "entendible", gana entendible.
- **Dónde vive:** **no** en claude.ai. Se publica en un servidor propio (**Vercel + Supabase** recomendado; también Express en VPS/Hostinger/Cloud Run/Docker). Las integraciones (correo, WhatsApp, IA) se gestionan en ese servidor, nunca en el navegador.
- **Versión actual:** 4.0 (ver `CHANGELOG.md` y `RELEASES` en `src/k_ayuda.js`).

## 2. Comandos

```bash
npm run setup          # instala dependencias (raíz + server) y Chromium para Playwright
npm run build          # python3 build.py + node --check  → dist/mirai.html y server/public/index.html
npm test               # build + 19 pruebas E2E (Playwright). Cada prueba debe terminar imprimiendo []
npm run test:one dian  # una prueba (prefijo del archivo en tests/e2e/)
npm run dev            # build + servidor Express en http://localhost:8080 (usa server/.env)
```

**Siempre** ejecuta `npm run build` después de tocar `src/` o `iso/`, y `npm test` antes de dar por terminado un cambio. Las capturas quedan en `tests/.out/` (revísalas cuando cambies UI).

## 3. Arquitectura en una mirada

```
src/            Frontend en módulos que build.py concatena EN ORDEN en un solo <script>
  a_shell.html  Marcado base (sidebar + .inset) y TODO el CSS (se agrega por bloques al final, antes de </style>)
  b_core.js     Estado por defecto, normalize/migrate, motor de préstamos (engine), helpers ($, fdate, ic, isoIcon…)
  c_views.js    Helpers de formularios (sel, txt, num, money, datep, field, pick…), MENU, renderNav, vistas base
  c2_views.js   Metas, ajustes (cabecera), perfil
  d_app.js      S (estado), M (modales), submit de formularios, acciones (data-act), render(), commit(), toast()
  e_ai.js       Llamadas de IA (window.claude.use + adaptadores)
  f_extra.js    Retos, primas, tour, apps, HELP (ayudas por sección), RDOCS
  g_auth.js     Contraseña local (PBKDF2), 2FA, bloqueo
  h_forms.js    Íconos de información (FHELP), descripciones de modales (MDESC), toasts nuevos (toastX), crear categoría/entidad con IA
  i_geo.js      Ciudades de Colombia y parseo de direcciones
  j_loans.js    Detalle de préstamos, pagos previos, OCR, empeños, suscripciones, imprevistos, fondo de emergencia, aportes
  k_ayuda.js    APP_VER, RELEASES (novedades), FAQ, manual
  l_ajustes.js  Pestañas de ajustes, IA (proveedores), alertas y notificaciones (canales y matriz)
  m_nomina.js   SMMLV/UVT, descuentos de nómina (salud, pensión, FSP, retención art. 383)
  n_servidor.js Conexión con el servidor Mirai (srvCfg, srvFetch, aiPick, snapshot para el cron)
  o_asesor.js   Consejero antes de gastar + chat flotante con historial, familia (M.miembro), date picker
  p_calendario.js Próximos pagos (estilo Google Calendar) y Calendario fiscal y laboral (FPL, RENTA26)
  q_integraciones.js Integraciones guardadas en el servidor: correo (Gmail/SendGrid/Resend/SMTP), WhatsApp, claves de IA
  r_gamif.js    Logros: puntos, niveles, rachas, insignias ilustradas, misiones semanales
  s_dian.js     Menú DIAN: declaración de renta, bienes, dependientes, estimados del calendario, acceso del contador
  z_boot.js     Arranque (normalBoot o contBoot si la URL trae ?contador=)
iso/iso.json    Isotipos (íconos ilustrados con degradados) — FUENTE DE VERDAD (ver gotchas)
vendor/lucide-icons.json  Caché de íconos Lucide usados (build.py la actualiza si existe node_modules/lucide-static)
server/         Servidor Node 20 (Vercel Functions + Express) — ver server/README.md
  lib/core.js   handle(): todas las rutas /api/*; correo, WhatsApp, IA, cron, accesos del contador
  lib/store.js  Supabase | Firestore | archivo JSON
  lib/crypto.js AES-256-GCM para credenciales (ENCRYPTION_KEY)
  api/[...path].js  Entrada Vercel · index.js Entrada Express · supabase/schema.sql · vercel.json
tests/e2e/      Pruebas Playwright (una por funcionalidad) · tests/run-all.js
dist/           Salida del build (no editar a mano)
assets/brand/   Logo Mirai (png/svg) e isotipos
```

### Patrón del frontend (léelo antes de tocar código)
- **Render por strings**: cada vista es `V.nombre = () => '<html…>'`; `render()` pinta `V[view()]` en `#main`. La ruta es `location.hash`.
- **Estado global `S`** (se guarda en `localStorage` con `commit()`; en claude.ai también en la nube vía `window.claude.use('db')`). Nunca guardes sin `commit()`.
- **Modales**: `M.tipo = ds => ({t, d, b, f, wide})`; se abren con `data-modal="tipo"` o `openModal('tipo', ds)`. El formulario `data-form="tipo"` se procesa en `d_app.js` o en `EXTRA_FORM.tipo = (d, f) => {}` (devolver `false` evita cerrar).
- **Acciones**: `data-act="x"` → `switch` en `d_app.js` o `EXTRA_ACT.x = btn => {}`.
- **Cambios en inputs**: `data-edit="coleccion|id|campo"` (genérico), `data-x="clave"` → `EXTRA_CHANGE.clave(el)`, `data-aj="…"` (ajustes).
- **Extender sin reescribir**: los módulos posteriores **envuelven** funciones anteriores (`const _f = f; f = function(){ … _f() … }`). Por eso el ORDEN de `build.py` importa y las funciones clave son `function` (reasignables), no `const`. No conviertas esas funciones a `const`.
- **Helpers UI**: `field(label, control, {tip, hint, cls, show})`, `sel(name, opts, val)`, `money()`, `num()`, `txt()`, `datep()`, `pick()`, `chips()`, `kpi()`, `alertBox()`, `empty()`, `pageH()`, `ic('lucide-name')`, `isoIcon('clave', px)`, `toast(msg, {type, title, undo, action:{l, fn}})`.
- **Ayuda obligatoria** en toda funcionalidad nueva: `HELP.vista` (botón "Cómo funciona"), `MDESC.modal`, `FHELP`/`tip` en campos, entrada en `RELEASES` y, si aplica, `FAQ`.

### Servidor
- Un despliegue = **un hogar** (token único `MIRAI_TOKEN`). Las claves de proveedores se guardan cifradas en `mirai_integrations`. El navegador solo ve `••••1234`.
- **Acceso del contador**: datos cifrados en el navegador (AES-GCM); la llave va solo en el fragmento del enlace (`#k=`), el servidor nunca la ve. Rutas públicas `/api/public/share/:id`.
- Variables: ver `server/.env.example`. Nunca cambies `ENCRYPTION_KEY` en un despliegue existente.

## 4. Diseño
- Estilo **Microsoft 365 / Fluent** + componentes tipo **shadcn** (sidebar a la izquierda, sin header superior; la miga de pan va en el contenido).
- Paleta **Engynex**: navy `#1F2B4B`, lima `#9EDB4E`, verde bosque `#3F7A1E`, fondo off-white. Modo oscuro con `html.dk`.
- Isotipos propios con degradados (estilo Fluent) para cada sección; insignias de logros con marco por nivel (bronce/plata/oro).
- **No** uses logos de marcas de terceros (bancos, streaming, proveedores de IA): se decidió no incluirlos por marcas registradas; el usuario puede subir los suyos.
- Mobile first: probar a 400 px de ancho, sin scroll horizontal.

## 5. Dominio Colombia (resumen — detalle en `.agents/rules/colombia.md`)
- SMMLV 2026 = $1.750.905 · UVT 2025 = $49.799 · UVT 2026 = $52.374 · IPC 2025 = 5,1 %.
- Renta personas naturales: topes 1.400 UVT (ingresos, consumos, tarjeta, consignaciones) y 4.500 UVT (patrimonio); tabla art. 241; límite 40 % / 1.340 UVT; 72 UVT por dependiente (máx. 4) fuera del límite; 1 % factura electrónica (máx. 240 UVT).
- Calendario DIAN 2026 (año gravable 2025) en `RENTA26`. El de 2027 aún no está publicado: actualizar cuando la DIAN lo publique.
- Los valores que cambian cada año (SMMLV, UVT, fechas) **se verifican con fuentes oficiales** antes de actualizarlos; nunca se inventan.
- Todo cálculo tributario se presenta como **estimado**; el valor final lo da el contador.

## 6. Reglas de trabajo
1. Español en UI y en respuestas. Explica términos técnicos o financieros con palabras simples.
2. Cambios pequeños y verificables. Tras cada cambio: `npm run build` → `npm test` → revisar capturas si tocaste UI.
3. Agrega una prueba en `tests/e2e/` para cada funcionalidad nueva (ver `.agents/workflows/add-feature.md`).
4. Al cerrar una versión: sube `APP_VER`, agrega la entrada en `RELEASES` (k_ayuda.js), regenera `CHANGELOG.md` (`.claude/commands/release.md`).
5. No metas secretos en el código ni en `localStorage` cuando hay servidor conectado. No registres datos personales en logs.
6. No agregues dependencias al frontend: es un solo HTML sin bundler (solo CDN jsPDF y qrcodejs). Íconos: Lucide vía `ic()`.
7. Respeta lo que ya existe: si algo parece raro, revisa si otro módulo lo envuelve antes de cambiarlo.

## 7. Gotchas conocidos
- `iso/gen.py` es el generador original de isotipos, pero **`iso/iso.json` tiene ediciones manuales** (`logros`, `contador`). Si regeneras con `gen.py` se pierden: agrega primero esos isotipos a `gen.py`.
- `downloadFile()` usa `window.claude.use('downloads')` en claude.ai y un `<a download>` fuera de él (envuelto en `s_dian.js`).
- `CLAUDE_RT` indica si corre dentro de claude.ai. Fuera de ahí "Claude (incluido)" no existe: la IA va por el servidor (`/api/ai`) o por una clave propia.
- Los datos del usuario viven en el navegador (`localStorage`, clave `libro-mayor-familiar-v3`). **Todavía no hay cuentas de usuario ni sincronización multi-dispositivo fuera de claude.ai** → es el siguiente gran paso (ver `docs/BACKLOG.md`).
- Cron en Vercel Hobby: solo una vez al día.
- El Excel del contador es SpreadsheetML (`.xls`): Excel muestra un aviso de formato al abrirlo.
- Las pruebas usan `sample()` (datos de ejemplo de la familia Navarro) y fijan fechas relativas a "hoy".

## 8. Mapa de documentación
- `AGENTS.md` — versión corta para otros agentes (Codex, Cursor, Copilot…).
- `.agents/rules/` — arquitectura, estilo de código, UX y textos, dominio Colombia, seguridad.
- `.agents/workflows/` — build y pruebas, nueva funcionalidad, release, despliegue Vercel + Supabase.
- `.claude/commands/` — comandos `/build`, `/test`, `/release`, `/feature`, `/deploy`.
- `.claude/agents/` — subagentes: QA Playwright, experto tributario/laboral Colombia, revisor de UX simple.
- `docs/BACKLOG.md` — pendientes, ideas y limitaciones. `docs/HISTORIAL.md` — decisiones tomadas en la construcción.
- `server/README.md` — despliegue y API del servidor.

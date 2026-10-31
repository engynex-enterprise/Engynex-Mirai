# Arquitectura

## Frontend (src/ → dist/mirai.html)
- `build.py` concatena los módulos en el orden de `ORDER` dentro de **un solo `<script>`** (scope compartido: todo es global). Inyecta los íconos Lucide usados (`ICONS`) y los isotipos (`ISO` + `<defs>` SVG).
- Dos salidas: `dist/mirai.html` (fragmento, apto para artifact de claude.ai) y `server/public/index.html` (documento completo que sirve Vercel/Express).
- Sin framework ni bundler. Render por strings + delegación de eventos en `document`.

### Piezas globales
| Pieza | Qué es |
|---|---|
| `S` | Estado completo del libro (ingresos, gastos, fijos, préstamos `cobrar`/`pagar`, activos/pasivos, inversiones, metas, retos, calendario, bienes, renta, gami, dian, cfg, perfil…). `normalize()` completa campos faltantes. |
| `commit()` | Guarda `S` (localStorage + nube en claude.ai). Envuelto por: gamificación (detecta logros) y acceso del contador (re-sube datos cifrados). |
| `render()` | Pinta `V[view()]`. Envuelto en modo contador (banner + solo lectura). |
| `renderNav(v)` | Sidebar (MENU, badges, buscador, notificaciones, usuario). |
| `MENU` | Secciones y grupos del sidebar. Los módulos lo modifican al cargar (p. ej. `s_dian.js` crea el grupo DIAN). |
| `V`, `M` | Vistas y modales. |
| `EXTRA_ACT`, `EXTRA_FORM`, `EXTRA_CHANGE` | Extensiones de acciones, formularios y cambios. |
| `HELP`, `MDESC`, `FHELP` | Ayudas por sección, descripción de modales, ayuda de campos. |
| `OPTS.p/m/x` | Opciones registradas por `sel()` (scope página/modal/popover). |
| `CLAUDE_RT` | `true` si corre dentro de claude.ai (`window.claude` real). |

### Datos y persistencia
- `localStorage['libro-mayor-familiar-v3']` (por libro: `LKEY()`), preferencias en claves `mirai-*` (`mirai-ui`, `mirai-srv`, `mirai-ia-keys`, `mirai-chat-pos`, `mirai-calp`, `mirai-prov-logos`).
- Fuera de claude.ai no hay sincronización multi-dispositivo todavía (ver BACKLOG).

### Modo contador
`?contador=ID#k=LLAVE` → `z_boot.js` llama `contBoot()` en vez de `normalBoot()`: descarga `/api/public/share/ID`, descifra con la llave del fragmento, reemplaza `S` en memoria, desactiva `commit`/`store.set`, recorta `MENU` según permisos y agrega "Notas".

## Servidor (server/)
- `lib/core.js` exporta `handle({method,path,headers,body,query})` → `{status,json}`; lo usan `api/[...path].js` (Vercel) e `index.js` (Express + estáticos + cron interno opcional).
- Rutas: `GET /api/health`, `GET|PUT|DELETE /api/integrations/:kind`, `POST /api/integrations/:kind/test`, `POST /api/notify`, `POST /api/ai`, `POST /api/alerts/snapshot`, `GET|POST /api/cron/send` (CRON_SECRET), `GET /api/shares`, `PUT|DELETE /api/shares/:id`, públicas `GET /api/public/share/:id` y `POST …/notes`.
- Autenticación: `Authorization: Bearer MIRAI_TOKEN` (un hogar por despliegue).
- `lib/store.js`: `supabase` (tablas `mirai_integrations`, `mirai_alert_snapshots`, `mirai_shares` con RLS y sin acceso anon), `firestore` o `file`.

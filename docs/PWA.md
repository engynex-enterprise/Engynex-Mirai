# Mirai como app instalada (PWA)

Mirai se instala desde el navegador (sin tienda de apps) en iPhone/iPad, Android y computadores (Chrome/Edge en Windows,
macOS, Linux y ChromeOS; Safari en Mac). Esta guía dice qué hace cada pieza, qué funciona en cada plataforma y cómo
regenerar las imágenes.

## Piezas

| Pieza | Archivo | Qué hace |
| --- | --- | --- |
| Configuración | `lib/pwa/config.ts` | Colores, accesos directos (`PWA_SHORTCUTS`), rutas de compartir/protocolo, página offline. |
| Manifest | `lib/pwa/manifest.ts` → `app/manifest.ts` (`/manifest.webmanifest`) | `id` estable (`/inicio`), `start_url` con `?source=pwa`, `display_override`, íconos any/maskable/monochrome, capturas, accesos directos, `share_target`, `protocol_handlers`, `file_handlers`, `launch_handler`, `handle_links`, `edge_side_panel`. |
| Service worker | `public/sw.js` | Página offline, caché de archivos estáticos, compartir a Mirai, push con acciones y número en el ícono, actualización controlada. |
| Página offline | `public/offline.html` | Autocontenida (sin archivos externos), clara/oscura, se recarga sola al volver la señal. |
| Raíz | `features/pwa/pwa-root.tsx` (en `app/layout.tsx`) | Registra el SW, aviso "Hay una versión nueva · Actualizar", navega al tocar una notificación o un acceso directo con la app abierta (`launchQueue`), archivos abiertos con Mirai, color de la barra según el tema escogido, quita `?source=pwa`. |
| Bordes | `features/pwa/title-bar.tsx` | Franja de la barra de estado en iPhone y barra de título propia en escritorio (Window Controls Overlay). |
| Shell | `features/pwa/pwa-shell.tsx` (en `components/app/app-shell.tsx`) | Número en el ícono (avisos sin leer), barra de carga superior, deslizar para actualizar, aviso e instrucciones de instalación. |
| Ajustes | `features/pwa/app-tab.tsx` (Ajustes › Mirai como app, `?tab=app`) | Instalar, accesos directos, buscar actualizaciones, liberar espacio. |
| Plataforma | `lib/pwa/platform.ts` | Detecta iPhone/Android/escritorio y marca `<html class="standalone ios">` antes de pintar. |
| Estilos | `app/globals.css` › "PWA" | Zonas seguras (`env(safe-area-inset-*)`), sin rebote, sin resaltado al tocar, `user-select` en la interfaz, barra de título, transición entre secciones. |
| Transición | `app/(app)/template.tsx` | `<ViewTransition>` de React 19.3: fundido corto al cambiar de sección (sin efecto con reducir animaciones). |
| Rutas | `app/compartir/route.ts`, `app/abrir/route.ts`, `app/api/public/version/route.ts` | Respaldo de compartir sin SW, enlaces `web+mirai://`, versión desplegada. |
| Utilidades | `lib/pwa/haptics.ts`, `save-file.ts`, `contacts.ts`, `links.ts` | Vibración suave, guardar/compartir archivos, Contact Picker, enlaces y texto compartido. |

## Accesos directos del ícono

En orden (Android muestra los primeros 4-5 según el lanzador; Windows/macOS hasta 10):

1. **Registrar gasto** → `/gastos?nuevo=1` (fondo rosado, isotipo de gastos y "+")
2. **Registrar ingreso** → `/ingresos?nuevo=1` (verde)
3. **Nueva deuda (Le debo)** → `/le-debo?nuevo=1` (amarillo)
4. **Nuevo préstamo (Me deben)** → `/me-deben?nuevo=1` (azul)
5. **Nuevo recordatorio** → `/calendario?nuevo=1` (lila). El calendario fiscal es Premium: en Gratis abre la invitación a Premium.
6. **Consejero IA** → `/consejero` (verde agua, sin "+")
7. **Dashboard** → `/dashboard` (lavanda, sin "+")

Los íconos (96 y 192 px) son un cuadro pastel opaco con el isotipo de la sección: se leen en lanzadores claros y oscuros
y aguantan que Android los recorte en círculo. Cada vista abre el formulario con `useNewParam()` (la prueba
`lib/pwa/manifest.test.ts` revisa que la ruta exista y que su vista lo use).

## Qué funciona en cada plataforma

| Función | iPhone / iPad (Safari) | Android (Chrome, Edge, Samsung) | Escritorio (Chrome / Edge) | Mac (Safari 17+) |
| --- | --- | --- | --- | --- |
| Instalar | Compartir › **Agregar a inicio** (Mirai muestra instrucciones ilustradas; no existe `beforeinstallprompt`). En iOS 16.4+ también desde Chrome/Edge para iOS. Dentro de Instagram/Facebook no se puede: pide abrir en Safari. | Botón propio "Instalar" (`beforeinstallprompt`) o menú ⋮ › Instalar app. Diálogo enriquecido con capturas. | Botón propio o ícono de instalar en la barra de direcciones. | Archivo › Agregar al Dock. |
| Pantalla de carga | Splash propio por tamaño de pantalla (claro/oscuro) | Generada por Android con `background_color` + ícono maskable | No aplica | No aplica |
| Ícono | `apple-touch-icon` 180 px (fondo navy, iOS redondea) | Maskable (navy a sangre) y monocromo (íconos temáticos de Android 13+) | `any` (cuadro navy redondeado) | `apple-touch-icon` |
| Accesos directos del ícono | **No** (iOS no los soporta) | Sí, al mantener presionado | Sí, clic derecho en la barra de tareas / Dock | No |
| Compartir a Mirai (`share_target`) | **No** | Sí: foto o PDF de factura → Registrar gasto con lectura IA | Sí en ChromeOS; en Windows/macOS depende del navegador | No |
| Abrir CSV/Excel con Mirai (`file_handlers`) | No | No | Sí (Chrome/Edge 102+): doble clic → Importar | No |
| Enlaces `web+mirai://` | No | Sí, con la app instalada | Sí | No |
| Notificaciones push | Solo con Mirai **instalado** y iOS **16.4+**; sin botones de acción | Sí, con botones (Ver pagos, Registrar gasto) | Sí, con botones | Sí (macOS 13+) |
| Número en el ícono (Badging) | Sí, instalado en iOS 16.4+ con permiso de notificaciones | Sí en lanzadores compatibles (si no, punto) | Sí (Windows/macOS) | Sí |
| Barra de título integrada (WCO) | No | No | Sí, si la persona la activa (flecha en la barra de título) | No |
| Sin conexión | Página offline propia | Página offline propia | Página offline propia | Página offline propia |
| Vibración suave | **No** (Safari no la permite) | Sí (respeta reducir animaciones) | No | No |
| Contact Picker (Contactos › Nuevo contacto) | No | Sí (Chrome) | No | No |
| Deslizar para actualizar | Sí (propio de Mirai) | Sí (propio de Mirai) | No aplica | No aplica |
| Guardar PDF/Excel/CSV | Abre la hoja Compartir (Guardar en Archivos, WhatsApp…) en vez de descargar (una descarga en iOS instalado deja a la persona sin botón para volver) | Hoja Compartir en la app instalada; descarga en el navegador | Descarga normal | Descarga normal |
| Transición entre secciones | Safari 18+ | Chrome 111+ | Chrome/Edge 111+ | Safari 18+ |

## Service worker, sin conexión y privacidad

- **Sin conexión (desde 2026-11-08, a pedido del dueño):** las páginas de la app que la persona abre, y las principales
  que la app pide preparar (`WARM`, cada 12 h, `features/pwa/offline-sync.tsx › OFFLINE_PAGES`), se guardan en la caché
  `mirai-pages` con sus archivos `/_next/static`. Con internet la navegación va siempre a la red (con *navigation
  preload*) y actualiza la copia; sin internet se sirve la guardada o `offline.html`, que lista las guardadas.
- Los datos (consultas de TanStack) se guardan en IndexedDB `mirai-offline` (por persona, una semana:
  `lib/offline/persist.ts`). Lo que se registra sin conexión con `useSave`/`useSoftDelete` queda en la cola `outbox` y se
  envía al volver la red (la app, o el SW por Background Sync en Android/Chrome; candado `mirai-outbox` + Idempotency-Key).
- Privacidad: todo eso es de la persona y queda solo en su dispositivo. Se borra al cerrar sesión (`lib/offline/clear.ts`
  + `CLEAR_PRIVATE` al SW) y en Ajustes › Mirai como app › Usar sin conexión › Borrar. **Nunca** se guardan respuestas
  RSC (`RSC: 1`, `?_rsc`), `/api`, `/v1`, `/auth`, el login, el portal del contador ni la consola.
- Sin conexión, los enlaces internos se abren como página completa (la navegación interna de Next pediría datos al
  servidor). Periodic Background Sync (`mirai-paginas`) refresca las páginas guardadas en Android/Chrome instalado.
- Actualización: al cambiar `public/sw.js` **sube `VERSION`**. El nuevo SW queda en espera y la app muestra "Hay una
  versión nueva · Actualizar"; al tocarlo se activa (`SKIP_WAITING`) y la página se recarga. Además, cada despliegue
  cambia `NEXT_PUBLIC_BUILD_ID` (SHA de Vercel): si la app lleva abierta mucho tiempo y el servidor tiene otra versión
  (`/api/public/version`), también ofrece actualizar.
- `/sw.js`, `/manifest.webmanifest`, `/offline.html`, `/pwa/*`, `/compartir` y `/abrir` no pasan por el login
  (`proxy.ts` y `utils/supabase/middleware.ts`). Cabeceras en `next.config.ts` (`Cache-Control: no-cache` y
  `Service-Worker-Allowed: /` para el SW). La CSP (`lib/security/headers.ts`) ya permite `worker-src 'self'` y
  `manifest-src 'self'`.
- El SW se registra solo en producción (`pnpm build && pnpm start`); en `pnpm dev` no.
- Push: `lib/notify/channels.ts` › `sendPush` acepta `actions` (máx. 2), `badge`, `image`, `requireInteraction`,
  `renotify`. El resumen diario trae "Ver pagos" y "Registrar gasto".
- Apariencia nativa: ver `lib/pwa/platform.ts` (clases por plataforma, sin zoom con los dedos), `components/app/mobile-topbar.tsx`
  y `features/pwa/native.tsx` (tablet, teclado, deslizar para volver, Atrás cierra ventanas).

## Compartir a Mirai (Android)

1. Otra app comparte una foto/PDF o un texto → `POST /compartir` (multipart).
2. El SW guarda el archivo y el texto en la caché `mirai-compartido` y redirige (303) a `/gastos?nuevo=1&compartido=archivo`.
3. El formulario de gasto (`features/expenses/expense-form.tsx`) lee la caché una sola vez (`features/pwa/shared.ts`),
   pone la descripción y el valor del texto y lee la factura con IA (`readInvoice`). Se descarta si tiene más de 10 min.
4. Sin SW (primera vez): `app/compartir/route.ts` pasa el texto por la URL (`desc`, `valor`); el archivo no se puede
   pasar y el formulario pide tomar la foto.

## Regenerar íconos, splash y capturas

```bash
pnpm --filter web pwa:assets          # íconos, accesos directos, splash de iPhone/iPad y capturas de muestra (sharp)
pnpm --filter web pwa:assets --sin-capturas  # todo menos las capturas
# Capturas reales con Playwright (app corriendo y una cuenta con datos de ejemplo, nunca de una persona real):
BASE_URL=http://localhost:3100 PWA_EMAIL=… PWA_PASSWORD=… pnpm --filter web pwa:screenshots
npx vitest run lib/pwa                # revisa que todo exista con su tamaño
```

- Agregar un acceso directo: súmalo a `PWA_SHORTCUTS` (máx. 10; `short_name` ≤ 12 letras), corre `pnpm --filter web pwa:assets` y
  la prueba.
- Un iPhone nuevo: agrega su tamaño en `lib/pwa/splash.ts › APPLE_DEVICES` y regenera.
- `sharp` es dependencia de desarrollo de `apps/web` (con pnpm no se puede usar la que trae Next).

## Probar en un dispositivo real (pendiente de QA manual)

- **iPhone (iOS 16.4+)**: Agregar a inicio desde Safari → splash claro/oscuro, barra de estado navy con reloj blanco,
  nada tapado por la isla dinámica ni la barra de inicio (barra inferior, Agregar, chat, Drawers), deslizar para
  actualizar, push instalado y número en el ícono, guardar un PDF (abre Compartir).
- **Android (Chrome)**: diálogo de instalación con capturas, accesos directos al mantener presionado, compartir una foto
  desde Galería/WhatsApp → gasto con IA, botones en la notificación, ícono temático (Android 13+), vibración al guardar,
  traer un contacto.
- **Windows/macOS (Chrome/Edge)**: instalar, jump list con accesos directos, activar la barra de título integrada,
  abrir un CSV con "Abrir con › Mirai", `web+mirai://gasto` desde otra app, aviso de versión nueva tras un despliegue.
- Lighthouse / DevTools › Application › Manifest: sin advertencias.

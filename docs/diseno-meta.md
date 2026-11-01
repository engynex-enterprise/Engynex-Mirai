# Diseño inspirado en Meta (Facebook Design System)

Mirai 5 toma las **medidas y comportamientos** del sistema de diseño de Facebook (FDS) y los aplica con la marca Engynex
(verde en lugar del azul). No se copian logos, íconos, ilustraciones ni fotos de Meta: son marcas y material protegido.

## Fuente

Captura pasiva con REA (`capture_browser_scenario`) de `https://www.facebook.com/` sin sesión, 1366 × 860, es-CO,
31-oct-2026. Los tokens salen de las variables CSS del DOM (bloques `.__fb-light-mode` y `.__fb-dark-mode`, 471 cada uno).

| Evidencia | Contenido |
|---|---|
| `ev_e5f860a7ea816649cc6e56afd89223638fdd3af5cc62875b6cb0245825958629` | Modo claro: captura + DOM con los tokens de ambos modos |
| `ev_2825296d7826bfe048821e8ddb9c06c85fa26a09addab131781e1ca47a0efe0c` | Captura con `prefers-color-scheme: dark` (la página pública no cambia de tema; los valores oscuros vienen del CSS) |

Límite: la página pública es la de inicio de sesión; los tokens son los mismos del producto, pero el *layout* del feed
se tomó del conocimiento del producto, no de esta captura.

## Tokens aplicados (FDS → Mirai)

| FDS | Claro | Oscuro | En Mirai |
|---|---|---|---|
| `--web-wash` | `#F0F2F5` | `#18191A` | `--background` |
| `--card-background` | `#FFFFFF` | `#242526` | `--card` |
| `--primary-text` / `--secondary-text` | `#050505` / `#65676B` | `#E4E6EB` / `#B0B3B8` | `--foreground` / `--muted-foreground` |
| `--secondary-button-background` | `#E4E6EB` | `rgba(255,255,255,.1)` | `--secondary` (botón gris) |
| `--divider`, `--input-border-color` | `#CED0D4` | `#3E4042` | `--border`, `--input` |
| `--hover-overlay` / `--press-overlay` | `rgba(0,0,0,.05)` / `.10` | `rgba(255,255,255,.1)` / `.2` | `--hover` / `--press` |
| `--placeholder-text` | `#65676B` | `#8A8D91` | `--placeholder` |
| `--highlight-bg` (botón "deemphasized") | `#E7F3FF` | `rgba(45,136,255,.2)` | `--brand-soft` (en verde) |
| `--accent` / `--primary-button-background` | azul `#1B74E4` | `#2374E1` | **verde Engynex** `#2A7F14` / lima `#9EDB4E` |
| `--notification-badge` | `#E41E3F` | `#E41E3F` | `--expense` (globos de notificación) |
| `--shadow-base` | `0 1px 2px rgba(0,0,0,.2)` | igual | `--shadow-card` |
| `--card-box-shadow` / `--shadow-elevated` | `0 12px 28px rgba(0,0,0,.2), 0 2px 4px rgba(0,0,0,.1)` | igual | `--shadow-float` (menús, diálogos) |
| `--card-corner-radius`, `--dialog-corner-radius`, `--nav-list-cell-corner-radius` | 8 px | | tarjetas, diálogos y filas del menú (`rounded-lg`) |
| `--button-corner-radius` / `-large` | 6 px / 12 px | | botones (`rounded-md`; grande `rounded-lg`) |
| `--button-height-medium` / `-large` | 36 / 40 px | | `h-9` / `h-10` |
| `--input-corner-radius` | 6 px | | campos (`rounded-md`) |
| `--comment-bubble` | 18 px | | burbujas del chat y notas del contador |
| `--font-family-system-fds` | system-ui, -apple-system, BlinkMacSystemFont, Segoe UI Historic, Segoe UI, Helvetica, Arial | | `--font-sans`; cuerpo 15 px / 1,3333 |
| `--fds-animation-enter-exit-in`, `--fds-duration-short-in` | `cubic-bezier(.14,1,.34,1)`, 280 ms | | `.appear`, `.lift` |
| `--fds-soft` | `cubic-bezier(.08,.52,.52,1)` | | `.press` (escala .96 al presionar) |
| glimmer (`--glimmer-opacity-min/max`) | .25 ↔ 1 | | `Skeleton` (`animate-[glimmer…]`) |

## Patrones de interfaz

- **Menú lateral**: tu foto y nombre arriba, accesos con ícono en círculo, filas de 8 px de radio, buscador en píldora gris.
- **Inicio tipo feed**: "¿Qué gastaste hoy?" como el "¿Qué estás pensando?", historias deslizables con degradado,
  tarjetas de actividad con avatar y columna derecha (próximos pagos, familia en línea, nivel).
- **Diálogos**: título centrado en negrita (20 px), línea divisoria y cerrar en círculo gris.
- **Filtros/segmentados**: chips en píldora grises; el activo en verde suave.

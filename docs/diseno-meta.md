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

## Portada y fondo estilo developers.facebook.com

Segunda captura con REA de `https://developers.facebook.com/` (1366 × 860, es-CO, 31-oct-2026). Colores muestreados
de la captura con `sharp`; recetas y radios leídos del CSS público. Igual que arriba: solo medidas y estilos, ningún logo,
ícono ni imagen de Meta.

| Evidencia | Contenido |
|---|---|
| `ev_a18d1b8905c40031d82611a2d5d62a9371c9205cfc24eb54e813a9c07fb70856` | Captura + DOM de la portada de developers.facebook.com |

| Medida (developers) | Valor | En Mirai |
|---|---|---|
| Panel de portada (`._apnp`) | `border-radius: 32px` | `PageHeader`: `rounded-[32px]` (24 px en móvil) |
| Degradado pastel del panel | `#FFDFF0` (rosa, arriba-izq.) → `#EBE0FC` → `#CFEDFE` → `#B1F0FA` → `#A7F3F5` (aguamarina, derecha); abajo `#DCF0FF` → `#A3F9EB` | `--gradient-meta` (claro); versión oscura con los mismos tonos al 18–22 % sobre `#18191A` |
| Lavado de fondo | `linear-gradient(295.2deg,#def9ea,#ddf7ec 10%,#daebfd 28%,#e1e6fa 67%,#f5e4f4 89%,#fdefe6)` | `--gradient-meta-wash`; `.bg-meta-wash` lo funde con `--background` en los primeros 520 px |
| Texto principal | `#1C2B33` | `--foreground` / `--meta-text` (claro) |
| Títulos | centrados, peso medio, tracking negativo | `h1` 30/44 px `font-medium tracking-[-0.02em]` |
| Enlaces de acción | azul `#0064E0`, negrita, con flecha → | variante `link` del botón (verde, negrita, flecha que se desplaza) |
| Mosaicos de ícono | cuadrado oscuro `#172C34` | `--meta-tile` (guías del Manual) |
| Franja de anuncio | gris `#F1F4F7` | `--meta-banner` (aviso de puesta en marcha en Inicio) |
| Borde de navegación | `#E1E2E3` | sin encabezado: el colapso del menú y el ojo de montos viven en el menú lateral |

### Navegación sin encabezado

Se quitó la barra superior y las migas de pan. El botón para contraer el menú (Ctrl B) está junto al selector de libro
en la cabecera del menú lateral; el ojo para ocultar montos está al lado del buscador y también en el menú de usuario.
En móvil siguen la barra inferior y el menú como hoja.

## Vidrio y degradado de Meta Business Suite (vigente)

Referencia: captura de Meta Business Suite › Settings que compartió el dueño del producto (31-oct-2026), muestreada con
`sharp`. Reemplaza el lavado de developers.facebook.com: ahora el degradado cubre **toda** la app y la portada de cada
sección no tiene caja propia (el título va directo sobre el degradado, como "Settings").

| Medida (captura) | Valor | En Mirai |
|---|---|---|
| Fondo arriba-izquierda / centro / arriba-derecha / abajo | `#FAF0F1` / `#F3EDF5` / `#EDEEF7` / `#E6EDF9` | `--gradient-app` en `body` (`background-attachment: fixed`), un poco más saturado |
| Menú lateral | blanco translúcido sobre el degradado | `--sidebar: rgba(255,255,255,.55)` + `backdrop-blur-xl` (oscuro `rgba(36,37,38,.5)`) |
| Tarjetas del área principal | blanco translúcido | `--card: rgba(255,255,255,.74)` (oscuro `rgba(36,37,38,.74)`); menús, diálogos y paneles siguen opacos (`--popover`) |
| Ítem activo ("Profiles") | pizarra `#283943`, texto blanco | `--nav-active` / `--nav-active-foreground` (menú lateral y menú de Ajustes); en oscuro `#E4E6EB` con texto `#1C2B33` |
| Texto | `#1C2B33` | `--foreground` |

Reglas: un borde con degradado (`p-[2px]` sobre un fondo de color) necesita relleno opaco `bg-popover`, si no el color
se transparenta. Los separadores de formulario no usan fondo detrás del texto (líneas a cada lado).

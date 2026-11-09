# Consola de Mirai (`pnpm mirai`) — diseño

> Fecha: 2026-11-08 · Estado: aprobado por el dueño del producto · Siguiente paso: plan de implementación.

Una consola interactiva para el monorepo de Mirai, con **dos caras sobre un mismo motor**:

- **En la terminal** (`pnpm mirai`): TUI de pantalla completa al estilo de Linux (`lazygit`, `k9s`, `htop`),
  con logo, menú navegable por teclado y ratón.
- **En el navegador** (`pnpm mirai --web`): la misma información en `http://127.0.0.1:4700`, con el diseño
  de Mirai (paleta Engynex, logo real, modo claro y oscuro).

Las dos muestran lo mismo —salud, stack, infraestructura, arquitectura— y ejecutan los mismos comandos,
porque la lógica vive en `src/datos/*` y no sabe nada de cómo se pinta.

## 1. Para qué

Hoy la información del proyecto está repartida entre `CLAUDE.md`, `AGENTS.md`, los `README.md` de
`infra/`, los `docker-compose.yml` y una docena de scripts sueltos (`infra/local/stack.mjs`,
`infra/local/e2e-local.mjs`, `infra/servidor/migrar.mjs`, `scripts/revisar-secretos.mjs`). Para saber si
algo está bien hay que recordar el comando exacto.

La consola junta eso en un solo lugar:

1. **Ver de un vistazo** si el local, la producción, el repositorio y el VPS están sanos.
2. **Entender** el proyecto (stack, infraestructura, arquitectura) con datos leídos del repositorio, no de
   un texto que se desactualiza.
3. **Hacer** las tareas de siempre sin recordar el comando, con confirmación en lo peligroso.

Dos caras porque sirven a momentos distintos: la terminal para el día a día y para cuando estás dentro de
un `ssh`; el navegador para mirar con calma, mostrarle el proyecto a alguien o tener los paneles abiertos
en una pestaña mientras trabajas.

No reemplaza a `pnpm dev`, `/deploy` ni a los scripts: los envuelve.

## 2. Dónde vive y cómo se abre

Paquete nuevo del workspace: **`packages/cli`**, nombre **`@mirai/cli`**, privado.

TypeScript con JSX, ejecutado **sin compilar** con [`tsx`](https://tsx.is) — igual que los demás `@mirai/*`
se consumen como TS crudo. No hay paso de build ni artefacto `dist/`.

```jsonc
// package.json de la raíz, en "scripts"
"mirai": "tsx --tsconfig packages/cli/tsconfig.json packages/cli/src/main.tsx"
```

`--tsconfig` no es opcional: `tsx` busca el tsconfig en el directorio donde se ejecuta (la raíz), no junto al
archivo, y sin él no aplica `"jsx": "react-jsx"` — el JSX falla con «React is not defined».

```bash
pnpm mirai                 # abre la consola (pantalla completa)
pnpm mirai salud           # abre directo en ese panel
pnpm mirai stack           # idem: salud | stack | infra | arquitectura | comandos
pnpm mirai salud --json    # imprime JSON y sale (CI, agentes); no entra a modo interactivo
pnpm mirai --web           # levanta la versión del navegador y la abre (127.0.0.1:4700)
pnpm mirai --web --puerto 4800 --no-abrir   # otro puerto, sin abrir el navegador solo
pnpm mirai --sin-color     # sin color ni degradados (terminales pobres, tuberías)
pnpm mirai --sin-raton     # desactiva el modo ratón del terminal
pnpm mirai --dominio otro.com  # revisar otro dominio en vez de mirai.engynex.com
pnpm mirai --ayuda         # uso y atajos, en texto plano
```

**Degradación sin TTY:** si `process.stdout.isTTY` es falso (tubería, CI, `| cat`), no se renderiza la TUI:
se imprime el panel pedido como texto plano y el proceso termina. Sin subcomando y sin TTY, imprime la
ayuda y sale con código 0.

**Códigos de salida:** 0 todo bien; 1 error de la consola; 2 en `--json`/sin TTY cuando algún chequeo de
salud quedó en rojo (para poder encadenarlo en un script).

### Dependencias

En `packages/cli/package.json`:

| Paquete | Para qué |
|---|---|
| `ink` ^8 | React para la terminal (pide React ≥19.3.0; la web ya usa 19.3.0) |
| `react` ^19.3.0 | — |
| `ink-gradient`, `ink-big-text` | El logo MIRAI en degradado navy → lima |
| `ink-spinner` | Giradores mientras se consulta |
| `ink-text-input` | El campo de filtro (`/`) y el de confirmación |
| `yaml` | Leer los `docker-compose.yml` |

Dev: `tsx`, `@types/react`, `typescript`, `vitest`, `eslint`, `@mirai/config`, `ink-testing-library`.

`tsx` va **también en las `devDependencies` de la raíz**, porque el script `mirai` lo invoca desde ahí
(pnpm solo expone en `node_modules/.bin` de la raíz lo que la raíz declara).

**La cara web no agrega ninguna dependencia:** `node:http` viene con Node, y el navegador se abre con el
comando del sistema (`open` en macOS, `xdg-open` en Linux, `start` en Windows), no con un paquete.

Los menús, tablas, marcos y el modo ratón se escriben en el paquete: los componentes publicados del
ecosistema (`ink-select-input`, `ink-table`) no manejan ratón ni filtro y varios están sin mantener.

## 3. La pantalla en la terminal

Dos columnas: menú a la izquierda (ancho fijo 18), contenido a la derecha; encabezado con el logo y barra
de estado abajo con los atajos vigentes.

```
┌─ Mirai 未来 ───────────────────────────── v5.0.0 · main ● · prod ● 184ms ─┐
│   ███╗   ███╗██╗██████╗  █████╗ ██╗                                       │
│   ████╗ ████║██║██╔══██╗██╔══██╗██║        degradado navy → lima          │
│   ██╔████╔██║██║██████╔╝███████║██║                                       │
├────────────────┬──────────────────────────────────────────────────────────┤
│  ▸ 1 Salud     │  SALUD                                        r refrescar│
│    2 Stack     │                                                          │
│    3 Infra     │  Local        ● db 55432   ● api 55080   ○ web 55300     │
│    4 Arquitec. │  Producción   ● /login 184ms   ● /healthz 96ms           │
│    5 Comandos  │  Repo y CI    ▲ 25 sin commitear · CI ● · 0 migr. pend.  │
│    6 Ayuda     │  VPS          ⏎ consultar por SSH                        │
│                │                                                          │
├────────────────┴──────────────────────────────────────────────────────────┤
│ ↑↓/jk mover · ⏎ entrar · Esc volver · / filtrar · r refrescar · ? · q salir│
└───────────────────────────────────────────────────────────────────────────┘
```

**Ancho mínimo 80 columnas.** Por debajo de 80 se oculta el menú lateral (se navega solo con `1-9` y
`Tab`); por debajo de 60 el logo cae a `MIRAI 未来` en una línea. Alto mínimo 20 filas; por debajo, el
contenido hace scroll.

### Atajos

| Tecla | Qué hace |
|---|---|
| `↑` `↓` `j` `k` | Mover la selección |
| `Tab` / `⇧Tab` | Cambiar de panel (menú ↔ contenido) |
| `Enter` / `→` / `l` | Entrar / activar |
| `Esc` / `←` / `h` | Volver (desde la raíz no hace nada) |
| `1`–`9` | Saltar a la sección por número |
| `/` | Filtrar la lista visible (Esc limpia) |
| `r` | Refrescar el panel actual |
| `?` | Ayuda |
| `q` / `Ctrl-C` | Salir (si hay un comando corriendo, lo corta primero) |
| `PgUp`/`PgDn` | Scroll del contenido |

### Ratón

Al arrancar (salvo `--sin-raton` o sin TTY) se activa el modo SGR del terminal:
`\x1b[?1000h\x1b[?1006h`, y al salir se desactiva **siempre** (incluso con `Ctrl-C`, `SIGTERM` y ante una
excepción no capturada: si no, el terminal queda inservible).

Clic = seleccionar la fila; rueda = scroll. Se parsean las secuencias `\x1b[<b;x;yM` (abajo) y `…m`
(arriba). Como Ink no expone la posición absoluta de un componente, el layout publica un **registro de
zonas** (`{ fila, alto, id }`) calculado por el propio layout, que es de altura conocida. La función que
mapea `y → id` (`zonaDeClic`) es pura y va con pruebas.

Soportado en iTerm2, Terminal.app, VS Code, Ghostty, Alacritty y kitty. **Si el ratón falla, el teclado
siempre funciona**: es un extra, nunca el único camino.

### Colores

Paleta Engynex de `app/globals.css`: navy `#1F2B4B`, lima `#9EDB4E`, verde `#3F7A1E`. En un terminal sin
color verdadero se cae a los 16 colores ANSI; con `--sin-color` o `NO_COLOR` en el entorno, a texto puro
con símbolos (`+`, `!`, `x`) en vez de `●`.

Semáforo: **●** verde `<500ms` / ok · **●** amarillo `<2s` o advertencia · **●** rojo caído o error ·
**○** gris apagado o sin consultar.

## 4. Los paneles (iguales en las dos caras)

Todos combinan **lectura en vivo del repositorio** con **textos cortos en español** (`src/datos/contenido.ts`)
que explican para qué sirve cada cosa.

### 4.1 Salud

Cuatro bloques. Los tres primeros se consultan al abrir el panel, en paralelo, cada uno con su girador y su
tiempo límite; el cuarto solo bajo demanda.

**Local** — `docker ps` filtrado por los contenedores del `infra/local/docker-compose.yml`; puertos 55300
(web), 55080 (API), 55081 (tiempo real), 55432 (base), 55430 (PostgREST), 55379 (Redis), 55900 (MinIO);
versiones de node, pnpm y docker contra lo que pide `engines`; `.env.local` contra `.env.example` (cuáles
faltan); enlace simbólico `apps/web/.env.local`; y el aviso de un `next start` zombi en 3100.

**Producción** — `GET` con tiempo límite de 5 s a `https://mirai.engynex.com` en `/login`, `/api/auth/ok`,
`/sw.js`, `/healthz`, `/readyz` y `/v1/version`, con milisegundos y semáforo. El dominio se puede cambiar
con `--dominio`.

**Repo y CI** — rama, archivos sin commitear, commits sin subir (`git`), y con `gh` (si está instalado y
autenticado) el último CI y el último `Desplegar VPS`. Las migraciones pendientes del VPS se muestran solo
si ya se consultó el VPS (requieren el túnel SSH): mientras tanto, `○ ⏎ consultar`.

**VPS por SSH** — `○` apagado hasta que se pulsa `Enter`. Entonces, con la misma llave y destino que
`infra/servidor/migrar.mjs` (`~/.ssh/mirai_vps`, `root@ssh.engynex.com`, `BatchMode=yes`, tiempo límite
10 s), consulta en **una sola sesión**: `docker ps`, `df -h /`, `free -m` y la última copia de
`db-backup`. Si no hay llave o no responde, lo dice en una línea clara ("No pude entrar por SSH: revisa
`~/.ssh/mirai_vps`") y nunca se queda colgado.

Abrir SSH automáticamente al entrar a la consola sería lento y molesto; por eso es a pulso.

### 4.2 Stack

Las tecnologías con su **versión real**, leídas de los `package.json` de cada paquete del workspace, cada
una con una línea de para qué se usa en Mirai: Next, React, NestJS, Better Auth, ts-rest, zod, TanStack
Query, shadcn/Radix, Tailwind, socket.io, Postgres, PostgREST, Redis, SeaweedFS, Playwright, Vitest,
Turborepo, pnpm. Las versiones de los servicios (Postgres 17, PostgREST…) salen de las etiquetas de imagen
del compose, no de un texto.

Se agrupa por capa: front · API · datos · infraestructura · herramientas.

### 4.3 Infraestructura

De `infra/servidor/docker-compose.yml` y `infra/local/docker-compose.yml`: los servicios con su imagen,
puertos, dominios y de qué depende cada uno; el mapa de puertos locales (los `55xxx`); y las variables de
entorno que el compose exige (`${VAR:?}`) frente a las que hay definidas.

**De las variables solo se reporta presencia** — `definida` / `falta` — nunca el valor, ni completo ni
recortado. Aplica a `.env.local` y a `~/.mirai/servidor-<dominio>.secretos`.

También: dónde vive producción (Hostinger + Dokploy), cómo se despliega (push a `main` → CI →
`desplegar-vps.yml`) y dónde están las copias.

### 4.4 Arquitectura

- El mapa del monorepo (`apps/*`, `packages/*`) con la responsabilidad de cada paquete.
- El flujo de datos: `web → /v1 (ts-rest) → API NestJS → PostgREST → Postgres (RLS)`, con el tiempo real
  por socket.io al lado.
- Los **módulos de la API** leídos de `apps/api/src/modules/` (hoy 33), cada uno con su descripción corta.
- Las **secciones de la web** leídas de `apps/web/lib/nav.ts`.
- Las reglas duras, en una lista: un solo camino (la API), RLS en todas las tablas, borrado lógico,
  escrituras con secretos solo en la API, migraciones aditivas.

Entrar en un módulo o sección (`Enter`) muestra su detalle: ruta en el repositorio y qué hace.

### 4.5 Comandos

Lista de comandos con descripción en español. `Enter` lo ejecuta; la salida aparece en vivo en un panel con
scroll y marca de tiempo. `Ctrl-C` **corta el comando, no la consola**; al terminar muestra el código de
salida y cuánto tardó.

| Riesgo | Comandos | Confirmación |
|---|---|---|
| Ninguno | `dev`, `build`, `lint`, `typecheck`, `test`, `e2e:local`, `secretos`, `local:up`, `local:down` | Ejecuta directo |
| Alto | `local:reset` (borra la base local), `db:migrate:vps` (toca producción) | Pide escribir una palabra |

Para `db:migrate:vps`, antes de ofrecer la ejecución real siempre corre `-- --pendientes` y muestra la
lista: no se migra a ciegas.

**No incluye desplegar.** Subir a producción sigue siendo `/deploy`, que verifica, revisa el diff, migra y
observa el CI. Meter ese flujo en un menú invitaría a saltarse pasos.

Los comandos largos (`dev`, `e2e:local`) toman la pantalla completa mientras corren y devuelven el control
al terminar.

## 5. La ventana en el navegador (`--web`)

`pnpm mirai --web` levanta un servidor HTTP **solo en `127.0.0.1`** (nunca en `0.0.0.0`), por defecto en el
puerto **4700**, y abre el navegador en `http://127.0.0.1:4700/?t=<token>`. `Ctrl-C` lo apaga.

Es una herramienta de desarrollo del monorepo: **no se despliega, no entra en `apps/web` y no sale de este
computador.**

### Por qué un servidor propio y no una ruta de `apps/web`

La consola lee el sistema de archivos, habla con Docker y abre SSH al VPS. Eso no puede vivir en la app que
se despliega a producción, ni siquiera detrás de un permiso: una ruta así sería la peor puerta trasera
posible. Servidor aparte, que solo existe mientras lo corres a mano.

### Tecnología

`node:http` a pelo, sin framework y sin paso de compilación. Sirve tres archivos estáticos
(`estilo.css`, `consola.js`, `mirai-logo.svg`) y una página; los datos llegan por JSON.

| Ruta | Qué devuelve |
|---|---|
| `GET /` | La página (una sola) |
| `GET /api/salud` `…/stack` `…/infra` `…/arquitectura` | El mismo JSON que `pnpm mirai <panel> --json` |
| `GET /api/salud/vps` | El bloque del VPS, solo cuando se pide (igual que el `Enter` de la TUI) |
| `GET /api/comandos` | El catálogo con su nivel de riesgo |
| `POST /api/comandos/:id` | Lanza el comando; responde el id de la ejecución |
| `GET /sse/comandos/:ejec` | La salida en vivo por *Server-Sent Events* |
| `DELETE /api/comandos/:ejec` | Corta el comando |

Sin React, sin bundler, sin Tailwind por CDN: JavaScript del navegador con `fetch` y `EventSource`, y CSS
propio. La página funciona sin internet (el CDN se caería justo cuando lo necesitas).

### Diseño

El mismo lenguaje visual de Mirai, no un panel genérico: logo real de `assets/brand/mirai-logo.svg`,
paleta Engynex (navy `#1F2B4B`, lima `#9EDB4E`, verde `#3F7A1E`), tipografía del sistema, tarjetas con
borde suave estilo Fluent y limpieza tipo Meta. Modo claro y oscuro según `prefers-color-scheme`.

Barra lateral con las mismas seis secciones; el contenido a la derecha en tarjetas. El semáforo usa color
**y** símbolo (nunca solo color: hay daltonismo). Responsive: en una ventana angosta la barra lateral pasa
a pestañas arriba.

La salud se refresca sola cada 30 s (se puede apagar); el panel de comandos muestra la salida en una
consola de texto monoespaciada con autoscroll.

### Seguridad

- Escucha **solo en loopback**. No hay opción de exponerlo en la red.
- Token aleatorio por arranque, en la URL que se abre y exigido en cada petición (`X-Mirai-Token`): así una
  página cualquiera abierta en otro tab no le puede pegar al servidor.
- `Origin` distinto del propio → rechazado. Sin CORS abierto.
- Los comandos de riesgo alto piden confirmación escrita en la página **y** el servidor vuelve a exigirla
  en el cuerpo de la petición: la confirmación no es solo decorado del front.
- El mismo filtro de secretos del §8 se aplica a todo lo que sale por JSON y por SSE.

## 6. Estructura del paquete

```
packages/cli/
  package.json · tsconfig.json · vitest.config.ts · eslint.config.mjs
  src/
    main.tsx              banderas, TTY, --json, render(<App/>), limpieza del terminal al salir
    app.tsx               estado global: panel activo, foco, filtro, refresco, atajos globales
    ui/
      logo.tsx            logo + 未来 + versión + rama + semáforo de producción
      marco.tsx           Box con borde y título (estilo Fluent)
      menu.tsx            lista navegable: teclado, números, filtro, zonas de clic
      tabla.tsx           columnas alineadas con ancho automático
      semaforo.tsx        ● / ○ + milisegundos + degradación sin color
      registro.tsx        salida en vivo con scroll
      confirmar.tsx       diálogo de confirmación escrita
      tema.ts             colores Engynex y degradación
    raton.ts              activar/desactivar modo SGR, parseo, zonaDeClic (puro)
    app.tsx               ── la cara de la terminal (Ink) ── estado, teclado, ratón y los paneles
    web/                  ── la cara del navegador ──
      servidor.ts         node:http, token, rutas /api/*, SSE, apagado limpio
      estaticos/          pagina.html · estilo.css · consola.js · mirai-logo.svg
    datos/                ── lógica pura, probada con Vitest ──
      repo.ts             workspace y package.json → stack por capas
      compose.ts          docker-compose → servicios, puertos, variables exigidas
      modulos.ts          apps/api/src/modules + apps/web/lib/nav.ts
      salud-local.ts · salud-prod.ts · salud-repo.ts · salud-vps.ts
      comandos.ts         catálogo con nivel de riesgo
      contenido.ts        los textos en español
      ejecutar.ts         spawn con señales, tiempo límite y recolección de salida
    __fixtures__/         compose y package.json de ejemplo para las pruebas
```

**Regla de separación:** `datos/*` no importa nada de `ink`, de React ni de `node:http`, y no escribe en
pantalla: devuelve estructuras. `app.tsx` y `ui/` pintan en la terminal; `web/` las sirve como JSON y
HTML. Una funcionalidad nueva se agrega **una sola vez** en `datos/` y aparece en las dos caras.

## 7. Errores

Ningún fallo de un bloque tumba la consola. Cada consulta devuelve
`{ estado: "ok" | "aviso" | "error" | "apagado", detalle, ms }` y la pantalla pinta el estado. Si falta una
herramienta externa, se dice qué falta y qué hacer: sin `docker` → "Docker no está corriendo"; sin `gh` →
"Instala GitHub CLI para ver el CI"; sin llave SSH → la frase del §4.1.

Todas las consultas tienen tiempo límite (5 s red, 10 s SSH, 3 s procesos locales). Un error no previsto se
captura, se muestra en un marco rojo con la opción de ver la traza (`t`), y la consola sigue viva.

## 8. Seguridad

- **Nunca se imprime un secreto.** Ni completo, ni recortado, ni en la salida de un comando. De
  `.env.local` y `~/.mirai/*.secretos` solo se reporta presencia.
- La salida de los comandos ejecutados pasa por el mismo filtro antes de mostrarse, reutilizando los
  patrones de `scripts/revisar-secretos.mjs`.
- SSH siempre con `BatchMode=yes`: nunca pide contraseña interactiva ni se cuelga esperando.
- Solo lee y ejecuta comandos ya existentes del repositorio. No escribe archivos del proyecto, no toca
  `.env`, no hace `git push`.

## 9. Pruebas

**Vitest** en `packages/cli` (entra en `pnpm test` por Turborepo):

- `datos/*` con fixtures: parseo del compose, armado del stack, lectura de módulos, interpretación de la
  salida de `docker ps` y `git status`, comparación `.env.local` ↔ `.env.example`, clasificación del
  semáforo por milisegundos, catálogo de comandos y su riesgo.
- `raton.ts`: parseo de secuencias SGR y `zonaDeClic`.
- El filtro del menú y la navegación (funciones puras de selección).
- 2–3 pantallas con `ink-testing-library` (que el logo salga, que el menú marque la selección, que un
  bloque en error se pinte sin tumbar la pantalla).
- Una prueba de que **ningún secreto de los fixtures aparece** en la salida renderizada.
- El servidor web, con `fetch` contra una instancia en un puerto libre: que cada `/api/*` responda el mismo
  objeto que el `--json` de la TUI (la prueba que garantiza que las dos caras no se desincronicen), que sin
  token devuelva 401, que un `Origin` ajeno se rechace, y que un comando de riesgo alto sin la confirmación
  en el cuerpo no se ejecute.

Sin Playwright: la página del navegador es una herramienta de desarrollo, no una pantalla del producto, y
la batería E2E es para `apps/web`.

## 10. Orden de construcción

Cuatro tandas, cada una verificable sola:

| Fase | Qué entrega |
|---|---|
| **F1** | Paquete, `pnpm mirai`, logo, layout, menú con teclado y ratón, paneles **Stack** y **Arquitectura**, ayuda |
| **F2** | **Salud**: local, producción, repo y CI |
| **F3** | **Comandos** con salida en vivo y confirmación |
| **F4** | **Salud › VPS** por SSH, `--json`, modo sin TTY, panel **Infraestructura** completo |
| **F5** | **La cara web** (`--web`): servidor, token, página con el diseño de Mirai, los cuatro paneles y los comandos por SSE |

La cara web va al final a propósito: para entonces `datos/*` ya está completo y probado, así que es
casi solo la capa que pinta. Si prefieres verla antes, se puede adelantar F5 justo después de F2 (con
salud y stack ya funcionando) y dejar comandos y VPS para después; dilo y reordeno el plan.

## 11. Riesgos

| Riesgo | Mitigación |
|---|---|
| ~~`tsx` no toma el `jsx: react-jsx` del tsconfig del paquete~~ | **Pasó.** Resuelto con `--tsconfig packages/cli/tsconfig.json` en el script de la raíz (§2) |
| El ratón deja el terminal en mal estado al salir mal | Desactivar el modo SGR en `exit`, `SIGINT`, `SIGTERM` y `uncaughtException`; `--sin-raton` como escape |
| Las zonas de clic se desalinean si cambia el layout | El teclado nunca depende de ellas; `zonaDeClic` con pruebas |
| Ink 8 pide React ≥19.3.0 | La web ya usa 19.3.0; `packages/cli` declara la suya y no la comparte con la web |
| El panel crece hasta volverse otro CLAUDE.md | Los textos curados son una línea por cosa; lo largo se lee en el repositorio |
| Las dos caras se desincronizan (una muestra algo que la otra no) | Ninguna cara calcula nada: ambas consumen `datos/*`, y hay una prueba que compara el JSON de las dos |
| Alguien expone el servidor web o lo deja corriendo | Solo loopback (sin opción de cambiarlo), token por arranque, y muere con la terminal que lo lanzó |

## 12. Fuera de alcance

Desplegar a producción · editar archivos del proyecto · ver o cambiar datos de hogares (eso es la consola
`/admin` de la web, y por privacidad nunca muestra montos) · registros de Dokploy en vivo · reemplazar
`CLAUDE.md`.

De la cara web, además: **no se despliega a ningún servidor**, no se agrega a `apps/web`, no tiene login
(no lo necesita: vive en loopback y muere con el proceso) y no se expone en la red local.

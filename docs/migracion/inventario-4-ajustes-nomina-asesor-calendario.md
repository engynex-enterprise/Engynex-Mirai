# Inventario 4 — Ajustes, nómina, servidor, asesor, calendario e integraciones

> Fuente: `src/l_ajustes.js`, `src/m_nomina.js`, `src/n_servidor.js`, `src/o_asesor.js`, `src/p_calendario.js` y `src/q_integraciones.js` (Mirai 4.0), con referencias puntuales a `c2_views.js` (cuerpo de algunas pestañas de Ajustes), `d_app.js` (`analizar`, `maybePopups`, `CONS`, formulario `miembro`), `b_core.js` (`notifs`, valores por defecto de `S.cfg`), `s_dian.js` (`calEst`) y `server/lib/core.js` (cron).
> Objetivo: reimplementar en Next.js + shadcn + Supabase **sin perder comportamiento**. Las fórmulas y los textos clave se copian literalmente.

---

## 0. Claves de almacenamiento que tocan estos módulos

| Clave | Dónde | Contenido |
|---|---|---|
| `S.cfg.*` | estado del libro (`localStorage['libro-mayor-familiar-v3']`) | Ajustes que viajan con el libro (ver §1). |
| `mirai-ui` | localStorage | `{tema:'claro'\|'oscuro'\|'auto', fs:'m'\|'l'\|'xl', dens:'c'\|'d', rm:bool, privOpen:bool, privBlur:bool}` |
| `lmf-tema` (`KTHEME`) | localStorage | `'claro'\|'oscuro'` (legado; se sincroniza con `mirai-ui.tema`) |
| `lmf-inicio` (`KHOME`) | localStorage | Vista de inicio (por defecto `inicio`) |
| `lmf-privado` (`KPRIV`) | localStorage | bool: montos ocultos ahora |
| `lmf-leidas` (`KREAD`) | localStorage | ids de avisos leídos (los popups no muestran leídos) |
| `mirai-ia-keys` (`KAI`) | localStorage | `{anthropic?:key, openai?:key, gemini?:key}` — claves de IA **en el navegador** |
| `mirai-prov-logos` (`KPLOGO`) | localStorage | `{provId: dataURL PNG 72×72}` logos subidos por el usuario |
| `mirai-srv` (`KSRV`) | localStorage | `{url, token}` del servidor Mirai |
| `mirai-srv-info` (`KSRVI`) | localStorage | Última respuesta de `GET /api/health` |
| `mirai-device` | localStorage | id de dispositivo `uid()+uid()` para el snapshot del cron |
| `mirai-chat-pos` (`KCHATPOS`) | localStorage | `{x,y}` posición de la burbuja del chat |
| `mirai-calp` (`KCALP`) | localStorage | `{view:'mes'\|'semana'\|'agenda', off:{[cat]:true}}` del calendario de pagos (la fecha actual `d` **no** se persiste) |
| `S.consejos` | libro | Historial del consejero (máx. 20) |
| `S.chats` | libro | Conversaciones del chat flotante |
| `S.perfil.miembros` | libro | Integrantes de la familia |
| `S.perfil.digitos` | libro | 2 últimos dígitos de la cédula (renta) |
| `S.calendario` | libro | Fechas del calendario fiscal |

Valores por defecto relevantes de `S.cfg` (`b_core.js`): `umbral:25000, limite:250000, trm:{USD:4100,EUR:4450}, pct:{n:50,g:30,a:20}, emergMeta:6, anticipo:5, usura:26, notif:{pagos,cobros,hormiga,presupuesto,inversiones,metas,popup: true}, ia:{autocat:true,hormiga:true}, corteQ:15, alertaPres:100, uvt:{2025:49799,2026:52374}, estricto:'equilibrado', def:{cat:'',medio:'',quien:'familia',sistema:'frances',frec:'mensual',plazo:12}`, más `reglas, categorias, catIngreso, entidades, medios, relaciones, apps`.
`S.cfg.canales` y `S.cfg.nmat` los crea `ensureCan()` (ver §1.6).

---

## 1. Ajustes

### 1.1 Layout (`ajLayout`)
- Lista `AJTABS` = `[id, título, ícono lucide, grupo, descripción]`. Orden final (tras `n_servidor.js`, que inserta `servidor` antes de `respaldo`):

| id | Título | Ícono | Grupo | Descripción |
|---|---|---|---|---|
| general | General | settings | Cuenta | Pantalla de inicio, ayudas y tour |
| apariencia | Apariencia | palette | Cuenta | Tema, tamaño de letra y densidad |
| privacidad | Privacidad | eye-off | Cuenta | Ocultar montos y datos en mensajes |
| seguridad | Seguridad | shield-check | Cuenta | Contraseña, dos pasos y bloqueo (cuerpo en `g_auth.js` → `seguridadTab()`) |
| ia | Inteligencia artificial | sparkles | Inteligencia | Activar, proveedor (Claude, OpenAI, Gemini) y funciones |
| alertas | Alertas y notificaciones | bell | Avisos | App, correo y WhatsApp |
| finanzas | Finanzas | calculator | Finanzas | Quincenas, 50/30/20, fondo y tasas |
| defs | Valores por defecto | sliders-horizontal | Finanzas | Lo que aparece ya puesto en los formularios |
| cats | Categorías de gastos | tag | Finanzas | Nombres, íconos y topes |
| ings | Tipos de ingreso | arrow-down-to-line | Finanzas | Salario, honorarios, arriendos… |
| ents | Bancos y entidades | landmark | Finanzas | Bancos, cooperativas, casas de empeño |
| medios | Medios de pago | credit-card | Finanzas | Efectivo, tarjetas, Nequi… |
| rels | Relaciones | users | Finanzas | Tipos de contacto |
| reglas | Reglas de importación | file-up | Finanzas | Categorías automáticas por palabra |
| servidor | Servidor y conexiones | server | Conexiones | Correo, WhatsApp e IA con tu propio servidor |
| respaldo | Datos y cuenta | database | Datos | Respaldo, formatear y eliminar |

- Navegación lateral (escritorio) agrupada por grupo, con **buscador** `#ajQ` (filtra por `FN(título+descripción)` — `FN` = normalizar sin tildes/minúsculas; debounce 200 ms, conserva foco y cursor). Sin resultados → "Sin resultados.".
- Móvil: selector `ajMob` con búsqueda (opciones con grupo como `h` e ícono).
- Cuerpo: cabecera con ícono, título y descripción de la pestaña.
- Estado de pestaña: variable global `ATAB` (no persistida; por defecto `general`). Acción `data-act="atab" data-t="…"` cambia de pestaña (se usa desde otras pantallas, p. ej. "Configurar servidor").
- Helpers: `row(título, descripción, control)`, `tog(clave, on)` (switch con `data-aj`), `ajSec(ícono, título, cuerpo, descripción)`.

### 1.2 Mecanismo de guardado `data-aj` (listener `change`)
`data-aj="prefijo|a|b"`; valor = `checked` si es checkbox, si no `value`. Tras aplicar: `commit()` + `toast('Guardado')` + `render()` (salvo donde se indica `rr=false`).

| Prefijo | Efecto |
|---|---|
| `ia|campo` | `S.cfg.ia[campo]=val` |
| `notif|tipo` | `S.cfg.notif[tipo]=val` |
| `can|campo` | `S.cfg.canales[campo]=val` (re-render). Si `campo==='popup'` también `S.cfg.notif.popup=val`. |
| `canv|campo` | Igual que `can` pero **sin** re-render. `waNum` se guarda solo con dígitos. |
| `smmlv` / `uvt` | `S.cfg[smmlv|uvt][añoActual]=parseMoney(val)`; sin re-render |
| `mat|aviso|canal` | `S.cfg.nmat[aviso][canal]=val`; sin re-render |
| `ui|clave` | `setUI(clave,val)` → localStorage `mirai-ui` (no va al libro, pero igual hace `commit`) |
| `priv|now` | alterna clase `priv` en `<html>` y guarda `lmf-privado` |

Además, cualquier `change` con `data-aj` programa `pushSnapshot()` al servidor con debounce de 1,5 s (§3.4).
Otros controles usan `data-edit="cfg|campo"`, `pct|n`, `trm|USD`, `def|campo`, `cat|id|campo`, `cfgl|col|id|campo`, `local|home` (mecanismo genérico de `d_app.js`).

### 1.3 Pestaña General (`ajGeneral`)
- **Al abrir Mirai › Pantalla de inicio**: selector con búsqueda de todas las páginas del menú (`MENUPAGES()`); guarda `lmf-inicio` (`data-edit="local|home"`). Texto: "La sección que ves primero cada vez que entras. Se guarda en este navegador."
- **Ayuda**: botón "Hacer el tour" (`tourStart`); "Mostrar de nuevo" (`helpReset`) reabre los recuadros "¿Para qué sirve esta sección?"; botones a `#novedades` y `#manual`.
- **Fechas y moneda** (solo informativo): "COP · Peso colombiano" (las cuentas en otra moneda se convierten con la TRM de Finanzas) y formato "31 oct 2026 · $ 1.250.000".

### 1.4 Pestaña Apariencia (`ajApariencia`) — todo en `mirai-ui`
- Tema: `claro` (Fondo blanco, sun), `oscuro` (Descansa la vista de noche, moon), `auto` (Igual que tu equipo, monitor; escucha `prefers-color-scheme`).
- Tamaño de texto: `m` Normal, `l` Grande, `xl` Muy grande (clases `fs-l`, `fs-xl`).
- Densidad: `c` Cómoda, `d` Compacta (clase `dense`).
- Movimiento: "Reducir animaciones" → `rm` (clase `rm`).
- `applyUI()` aplica clases `dk`, `fs-l`, `fs-xl`, `dense`, `rm` y sincroniza `lmf-tema`. Al primer arranque migra `lmf-tema` a `mirai-ui`. El botón de tema del sidebar (`themeToggle` / `data-pick=tema`) actualiza `mirai-ui.tema` 50 ms después.
- Nota: "La apariencia se guarda en este navegador." → en la migración decidir si pasa a preferencias de usuario en Supabase.

### 1.5 Pestaña Privacidad (`ajPrivacidad`)
- **Ocultar los montos ahora** (`priv|now`): clase `priv` (cifras como puntos; hover para ver; también el ojo del encabezado).
- **Ocultar siempre al abrir** (`ui|privOpen`): al arrancar agrega `priv`.
- **Ocultar al cambiar de ventana** (`ui|privBlur`): en `blur`/`visibilitychange hidden` agrega `priv-blur` (difumina); al volver lo quita.
- **No incluir valores en correos y WhatsApp** (`can|hideAmt`): `nLine` borra `$ 1.234.567` de los textos del resumen (el servidor hace lo mismo con `hideAmt`).
- Texto IA: "Solo el texto del movimiento, valores y fotos que tú subas, en el momento en que usas la función." + botón a pestaña IA.

### 1.6 Pestaña Inteligencia artificial (`ajIA`, envuelta en `n_servidor.js` y `q_integraciones.js`)

**Proveedores `AIP`:**

| id | Nombre | Descripción | Color | ¿Clave? | Dónde crearla | Modelo por defecto |
|---|---|---|---|---|---|---|
| claude | Claude (incluido) | Funciona dentro de claude.ai sin configurar nada. | #D97757 | no | — | — |
| anthropic | Claude con tu API | Usa tu propia clave de la API de Anthropic. | #D97757 | sí | console.anthropic.com | claude-sonnet-4-5 |
| openai | OpenAI (ChatGPT) | Usa tu clave de la API de OpenAI. | #10A37F | sí | platform.openai.com | gpt-4o-mini |
| gemini | Google Gemini | Usa tu clave de Google AI Studio. | #4285F4 | sí | aistudio.google.com | gemini-2.0-flash |

**Opciones en `S.cfg.ia`:**
- `on` (interruptor maestro; `undefined` = activado). Apagada: "Mirai funciona igual con tus reglas, tu historial y palabras clave…"; se ocultan el resto de secciones.
- `prov` (`claude` por defecto). Tarjetas de proveedor (clic en `[data-prov]` → guarda, borra resultado de prueba). Pills: "Recomendado" (claude) / "Clave guardada".
- `model[prov]`: texto libre; por defecto `AIP[prov].m`.
- Funciones (`ia|clave`, todas activas salvo `false`):
  - `autocat` Categoría automática — Elige la categoría mientras escribes el gasto.
  - `hormiga` Detectar gastos hormiga — Marca los gastos pequeños y frecuentes.
  - `ocr` Leer fotos y documentos — Facturas, extractos, pagarés y comprobantes.
  - `consejero` Consejero IA — Analiza si te alcanza antes de gastar o prestar.
  - `asist` Asistentes inteligentes — Crear categorías, identificar bancos por NIT y detectar ciudades.
- `viaSrv` (no tiene UI; si es `false` se prefiere la clave local a la del servidor).
- **Consejero › ¿Qué tan estricto es el consejero?** → `S.cfg.estricto`: `prudente` (shield-check), `equilibrado` (scale), `flexible` (zap). Efecto en límites de `analizar()` (§4.4).

**Bloque "Conectar <proveedor>"** (solo si `key:true`):
- Aviso: las cuentas personales (ChatGPT Plus, Gemini Advanced, Claude Pro) no sirven; se usa una **clave de API** creada en `<url>`; el uso se cobra en esa cuenta.
- Campos: Clave de API (`#aiKey`, password, botón ojo `aiKeyShow`), Modelo (`aiModel`).
- Botones: Guardar clave (`aiSave` → `mirai-ia-keys[prov]=key` o la borra si vacío; guarda modelo; toast), Probar conexión (`aiTest`), Borrar clave (`aiDelKey`).
- Prueba: guarda primero; sin clave → "Primero pega tu clave de API."; llama `extCall(prov,key,modelo,'Responde solo con el JSON {"ok":true,"saludo":"hola"}',{json:true})`, extrae `{…}` y valida `ok`. Mensajes OK: "Conexión exitosa con <n>. Mirai ya usa este proveedor."; si no "Respondió, pero no como esperábamos. Revisa el modelo."
- `aiErrMsg(err)`:
  - `/401|403|invalid|API key/` → "La clave no es válida o no tiene permisos. Revísala en <url>."
  - `/404|model/` → "El modelo no existe o no está disponible en tu cuenta…"
  - `/429|quota|rate/` → "Tu cuenta no tiene saldo o superó el límite de uso."
  - `/Failed to fetch|NetworkError|CSP|blocked|Load failed/` → aviso de que claude.ai bloquea la conexión; funcionará en dominio propio; mientras tanto Claude incluido.
  - otro → "No se pudo conectar: " + 140 caracteres.
- Nota: "La clave se guarda solo en este navegador… Si la conexión falla, Mirai usa Claude incluido".

**Envolturas de `n_servidor.js`:**
- Alerta superior: dentro de claude.ai (info, "Estás usando Mirai dentro de claude.ai…") o fuera (warn, "Mirai está en tu propio servidor — 'Claude (incluido)' no está disponible fuera de claude.ai. Configura ANTHROPIC_API_KEY, OPENAI_API_KEY o GEMINI_API_KEY en tu servidor, o pega una clave aquí.").
- Fuera de claude.ai, la descripción de "Claude (incluido)" cambia a "Usando la clave de Claude de tu servidor." (si el servidor tiene `anthropic`) o "Solo funciona dentro de claude.ai. En tu servidor configura ANTHROPIC_API_KEY."
- Si el servidor tiene clave del proveedor elegido: alerta ok "Tu servidor tiene una clave para este proveedor… Solo pega una clave aquí si quieres usar otra."

**Envoltura de `q_integraciones.js`:** agrega al final la sección "Claves de IA en tu servidor" (§6.3).

**Logos de proveedor (`provLogo`, en `p_calendario.js`):** cada tarjeta muestra un logo subido por el usuario (input file `data-plogo`, se recorta al cuadrado central y se reduce a 72×72 PNG en `mirai-prov-logos`) o, si no hay, un círculo con la inicial y el color del proveedor. (Decisión de producto: no se incluyen logos de marcas de terceros.)

**Adaptadores de proveedor (`extCall`)** — llamadas directas desde el navegador:
- OpenAI: `POST https://api.openai.com/v1/chat/completions`, `Authorization: Bearer`, `messages:[{role:'user',content:[{type:'text'},…{type:'image_url',image_url:{url:dataURL}}]}]`, si JSON `response_format:{type:'json_object'}`. Respuesta `choices[0].message.content`.
- Gemini: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=…`, `contents:[{parts:[{text},…{inline_data:{mime_type,data}}]}]`, si JSON `generationConfig.responseMimeType='application/json'`. Respuesta: concatenar `candidates[0].content.parts[].text`.
- Anthropic: `POST https://api.anthropic.com/v1/messages`, headers `x-api-key`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true`, `max_tokens:2048`, imágenes primero (`type:'image', source base64`) y luego el texto. Respuesta: concatenar `content[].text`.
- Imágenes: `fileB64` acepta `File` o dataURL y devuelve `{mime,b64}`.
- `extAdapter(pv,key,model,fallback)`: devuelve una función `f(prompt,o)→{text}` con `f.json(prompt,o)` (añade "\n\nResponde únicamente con JSON válido, sin texto adicional.", extrae el primer `{…}` o `[…]` y hace `JSON.parse`) y `f.limits()→{images:true}`. Si falla y hay `fallback` (Claude incluido), avisa **una vez** con toast warn "No pudimos usar <n>; usamos Claude incluido. <motivo>" y reintenta con el fallback.
- `window.claude.use` se envuelve: `use('sample')` pasa por `aiPick` (§3.2); el resto va al original. `CLAUDE_RT = !!(window.claude && window.claude.use)` antes de envolver.
- `iaMsg()`: mensajes cuando la IA no está disponible ("La inteligencia artificial está apagada…", "La lectura de fotos está desactivada…", "La lectura con IA solo funciona dentro de claude.ai o con un proveedor configurado en Ajustes.").

> **Migración**: en Next.js las claves deben vivir solo en el servidor (Supabase cifrado); `extCall` desde el navegador y `mirai-ia-keys` deberían desaparecer o quedar como modo avanzado. El contrato `{text}` / `.json()` / `modelTier:'quick'|'default'` conviene mantenerlo como interfaz del servicio de IA.

### 1.7 Pestaña Alertas y notificaciones (`ajNotif` + envolturas)

**Tipos de aviso `NEV`** (clave → título, ícono, descripción):
- `pagos` Pagos por vencer y vencidos (receipt) — Gastos fijos, cuotas, empeños y aportes de ahorro.
- `cobros` Cuotas que te deben pagar (hand-coins) — Cuando alguien que te debe tiene una cuota próxima o atrasada.
- `hormiga` Gastos hormiga (coffee) — Cuando te acercas o pasas tu límite mensual.
- `presupuesto` Presupuesto (chart-pie) — Cuando una categoría llega al porcentaje que definas.
- `inversiones` Inversiones (trending-up) — Cuando un CDT o inversión está por vencer.
- `metas` Metas (target) — Cuando una meta está cerca de su fecha.

**Canales `NCH`**: `app` En la app (bell), `email` Correo (mail), `wa` WhatsApp (message-circle).

**`S.cfg.canales` (defaults `defCan()`):**
```
emailVia: CLAUDE_RT ? 'gmail' : 'srv'   // 'gmail' (MCP de claude.ai) | 'srv'
waVia: 'link'                            // 'link' (wa.me) | 'api' (WhatsApp Cloud API vía servidor)
hora: '7'                                // hora del resumen (0–23, hora Colombia)
app: true, popup: true, email: false, wa: false
emailTo: '' (si vacío y hay AUTH.acc.email, se usa ese)
waNum: ''   (solo dígitos)
frec: 'diario' | 'semanal'               // semanal = lunes
hideAmt: false
lastEmail: '', lastWa: ''                // fecha ISO del último envío
silencio: false, silIni: '22', silFin: '7'
```
Si `S.cfg.notif.popup===false` (legado) → `canales.popup=false`. Fuera de claude.ai, `q_integraciones` fuerza `emailVia='srv'` si estaba en `gmail`.

**Matriz `S.cfg.nmat` (defaults `defMat()`):** para cada aviso `{app:true, email: pagos|cobros|inversiones, wa: pagos|cobros}`.

| Aviso | App | Correo | WhatsApp |
|---|---|---|---|
| pagos | ✔ | ✔ | ✔ |
| cobros | ✔ | ✔ | ✔ |
| hormiga | ✔ | ✘ | ✘ |
| presupuesto | ✔ | ✘ | ✘ |
| inversiones | ✔ | ✔ | ✘ |
| metas | ✔ | ✘ | ✘ |

UI de la matriz: tabla con un switch por aviso (`notif|k`, apaga el aviso en todos los canales; fila con clase `off`) y un checkbox por canal (`mat|k|ch`), deshabilitado si el aviso está apagado o el canal está apagado arriba.

**Tarjetas de canal:**
1. **En la aplicación** (`can|app`): "Avisos emergentes al abrir" (`can|popup`, hasta 3); "Horario de silencio" (`can|silencio`) con Desde/Hasta (`canv|silIni`, `canv|silFin`, 0–23 h). Recuadro "Resumen diario en tu celular" (dentro de claude.ai: notificación desde la app de Claude; fuera: se reemplaza por "Lo urgente, primero — Cuando entras a Mirai te mostramos primero lo urgente…").
2. **Correo electrónico** (`can|email`):
   - "Enviar con" (`can|emailVia`): `gmail` "Gmail conectado a Claude (solo dentro de claude.ai)" / `srv` "Mi servidor (Gmail, SendGrid, Resend o SMTP)". Fuera de claude.ai la opción gmail se elimina del selector.
   - "Hora del resumen" (`canv|hora`) solo si `emailVia==='srv'`.
   - "Enviar a" (`canv|emailTo`, email), "¿Cada cuánto?" (`canv|frec`: "Un resumen al día" / "Un resumen a la semana (lunes)").
   - Botón "Enviar resumen ahora" (`nTestEmail`), "Último envío: <fecha>".
   - Si `email && emailVia==='srv'` se inyecta el bloque de proveedor de correo (§6.1) antes del botón.
   - Nota según modo: gmail "se envía la primera vez que abres Mirai en el día…"; srv con cron "Tu servidor envía el resumen a la hora elegida, aunque no abras Mirai."; srv sin cron "Se envía la primera vez que abres Mirai en el día. Programa el cron del servidor…".
3. **WhatsApp** (`can|wa`):
   - "Enviar con" (`can|waVia`): `link` "Abrir WhatsApp (un toque)" / `api` "API de WhatsApp (automático)".
   - Número (`canv|waNum`, prefijo visual +57, `inputmode=numeric`).
   - Botón "Abrir WhatsApp con el resumen" (`nTestWa`) — en modo `api` se llama "Enviar resumen ahora".
   - Si `wa && waVia==='api'` se inyecta el bloque WhatsApp Cloud API (§6.2). Nota: Meta exige plantilla aprobada.
   - Si `(emailVia==='srv' || waVia==='api')` y no hay servidor: alerta "Falta conectar tu servidor" con botón a la pestaña servidor.

**¿Cuándo?:**
- "Avisarme con (días de anticipación)" → `cfg.anticipo` (def. 5).
- "Avisar cuando una categoría llegue al (%) de su tope" → `cfg.alertaPres` (def. 100).
- "Límite de gastos hormiga al mes" → `cfg.limite` (def. 250.000).
- "Valor de referencia de un gasto hormiga" → `cfg.umbral` (def. 25.000).

**Generación de avisos** (`notifs()` en `b_core.js`; ids con prefijo que determina la categoría):
- `c:` cobros (de `agenda()`): atrasado `lvl bad` "<…> está atrasada"; por vencer (`d<=anticipo`) `lvl info`.
- `p:k:id:fecha` pagos: vencido `bad` "Pago vencido: <título>"; por vencer `warn` "<lbl>: <título> · Ten listos $X".
- `h:YYYY-MM` hormiga: si `hormigas().over` → "Los gastos hormiga se están saliendo de control".
- `b:catId:YYYY-MM` presupuesto: categorías con `tope>0` y grupo ≠ ahorro, si gastado ≥ `tope*alertaPres/100`.
- `i:id` inversiones: vence en 0–10 días.
- `m:id` metas: fecha en 0–30 días y no cumplida.
- Orden: bad, warn, info, ok; luego por fecha.
- `nCat`: `{b:presupuesto,c:cobros,h:hormiga,i:inversiones,m:metas,p:pagos,pr:pagos}` (por defecto pagos).

**Filtros por canal:**
- `notifsCh(ch)`: `_rawNotifs()` filtrado por `nmat[cat][ch]` (`app`: mientras no sea `false`; email/wa: debe ser `true`).
- `notifs()` se redefine: si `canales.app===false` → `[]` (apaga campana y popups); si no, `notifsCh('app')`.
- `maybePopups()` (envuelto): no muestra si `!popup` o `app===false`, ni en horario de silencio (`a>b ? h>=a || h<b : h>=a && h<b`). El original muestra hasta 3 avisos `bad|warn` no leídos (`lmf-leidas`), escalonados 600 ms + 500 ms.

**Resumen (digest):**
- `nLine(n)` = `• <t> — <b>` (sin montos si `hideAmt`).
- `digestText(list)`:
  ```
  Hola <primer nombre>, este es tu resumen de Mirai (<fecha>):

  • …(máx. 15)
  …y N avisos más.

  Abre Mirai para ver el detalle.
  ```
- Asunto: `Mirai: N aviso(s) para hoy`.
- `sendEmailDigest(force)`:
  - Modo `gmail`: `mcpCall('Gmail','send_message',{to:[emailTo],subject,body})`; guarda `lastEmail=hoy`.
  - Modo `srv` (envoltura): si no es forzado y el servidor tiene cron → no hace nada (lo hace el cron). Si no, `POST /api/notify {channel:'email',to,subject,text}`; toast con `r.provider`.
  - Validaciones: correo apagado o sin dirección → "Activa el correo y escribe la dirección."; sin avisos → "No tienes avisos pendientes para enviar por correo."
- `openWa(list)`:
  - Modo `link`: abre `https://wa.me/<57+num si tiene 10 dígitos>?text=<digest>`; `lastWa=hoy`.
  - Modo `api`: `POST /api/notify {channel:'whatsapp',to:waNum,text:digest}`.
  - `nTestWa` sin avisos manda uno de prueba "Prueba de Mirai — Así te llegarán los avisos."
- **Automatismos al abrir la app:**
  - +4,5 s: si `email` y toca (diario: `lastEmail≠hoy`; semanal: lunes y `lastEmail≠hoy`) → `sendEmailDigest(false)`.
  - +4,5 s (+2,5 s): si `wa`, `waVia≠'api'`, `lastWa≠hoy` y hay avisos → toast info 12 s "Tienes N avisos para enviar a tu WhatsApp." con acción "Enviar a WhatsApp".
  - +7 s: si `wa`, `waVia==='api'`, servidor conectado **sin cron** y `lastWa≠hoy` → envía automáticamente.

> **Migración**: todo esto pasa a un job del servidor (cron de Vercel/Supabase) que calcula los avisos desde la base de datos, sin depender del snapshot ni de que el usuario abra la app. Mantener: matriz por canal, `hideAmt`, frecuencia diaria/semanal, hora local, silencio, máx. 3 popups, máx. 15 líneas.

### 1.8 Pestaña Finanzas (cuerpo en `c2_views.js`)
- Salario mínimo del año (`data-aj="smmlv"` → `cfg.smmlv[año]`), tip: se usa para el FSP y la base mínima de independientes.
- Valor de la UVT del año (`data-aj="uvt"` → `cfg.uvt[año]`).
- Corte de la primera quincena (día) → `cfg.corteQ` (15).
- Meses de fondo de emergencia → `cfg.emergMeta` (6; recomendado 3–6).
- % Necesidades / Gustos / Ahorro → `cfg.pct.n/g/a` (50/30/20). Si no suman 100 → alerta "Los porcentajes suman X%".
- Dólar hoy (TRM) → `cfg.trm.USD`; Euro hoy → `cfg.trm.EUR`.
- Tasa de usura (% E.A.) → `cfg.usura` (26), tip: cambia cada mes, verificar en la Superfinanciera.

### 1.9 Otras pestañas (resumen, cuerpo en `c2_views.js`)
- **defs**: gasto (categoría — incluye "Que se ponga sola" —, medio de pago, quién gasta) y préstamo (sistema francés/alemán/simple/americano, frecuencia, número de cuotas) → `cfg.def.*`.
- **cats**: crear (nombre, tipo n/g/a, ícono) y tabla editable (ícono, nombre, tipo, tope mensual, borrar).
- **ings / ents / medios**: listas simples (nombre + ícono; entidades con tipo Banco/Cooperativa/Fintech/Billetera/Fondo/Otro).
- **rels**: chips de relaciones (agregar/quitar).
- **reglas**: "Si contiene" → categoría (para importar extractos).
- **seguridad**: `seguridadTab()` de `g_auth.js` (fuera de este inventario).
- **respaldo**: estado nube/local, exportar/importar JSON, datos de ejemplo, borrar todo (doble clic en 5 s), formatear por bloques (gastos, ingresos, fijos, préstamos, contactos, inversiones, balance, metas, consejos, config, perfil) con confirmación "BORRAR".

### 1.10 Pestaña Servidor y conexiones (`ajServidor`, `n_servidor.js` + texto de `q_integraciones.js`)
- Texto (versión Vercel): "Mirai se publica en tu propio servidor —recomendado Vercel con base de datos Supabase— y desde allí envía correos (Gmail, SendGrid, Resend o SMTP), mensajes por la API de WhatsApp y usa la IA…"
- Campos: Dirección del servidor (`#srvUrl`, placeholder `https://mirai.vercel.app`; por defecto `location.origin` fuera de claude.ai) y Token de acceso (`#srvToken`, password, "El valor de MIRAI_TOKEN").
- Botones: Guardar (`srvSave`, quita `/` final), Probar servidor (`srvTest`), Desconectar (`srvDel` → borra `mirai-srv` y `mirai-srv-info`).
- Prueba: `GET /api/health` → guarda en `mirai-srv-info`, "Conectado a Mirai Server <version>.", y hace `pushSnapshot()`. Errores de red: dentro de claude.ai → "esta página no puede comunicarse con otros servicios"; fuera → "Revisa la dirección y que ALLOWED_ORIGINS incluya este dominio."
- "Lo que tiene configurado tu servidor" (si hay `health`):
  - Correo: `email` (proveedor) · `emailFrom`.
  - WhatsApp Cloud API: Activo · plantilla `<whatsappTemplate>` o "sin plantilla".
  - Inteligencia artificial: lista `ai[]` (nombres de `AIP`).
  - Avisos aunque no abras Mirai: `cron` → "Activo · Supabase|Firestore|archivo" (`store`); texto "Cron de Vercel (o del hosting) que envía los avisos a su hora."
  - Enviar prueba: botones Correo (`srvTryEmail` → `POST /api/notify {channel:'email',to:emailTo||AUTH.acc.email,subject:'Prueba de Mirai',text:'¡Hola! Así te llegarán los avisos de Mirai.'}`) y WhatsApp (`srvTryWa` → `{channel:'whatsapp',to:waNum,text:'Prueba de Mirai: así te llegarán tus avisos.'}`).
  - Si `encryption===false`: alerta "Falta ENCRYPTION_KEY".
- "Cómo instalarlo" (Vercel + Supabase): 1) Supabase: ejecutar `supabase/schema.sql`, copiar Project URL y `service_role`; 2) subir `mirai-server` a GitHub; 3) Vercel: variables `MIRAI_TOKEN`, `ENCRYPTION_KEY` (`openssl rand -base64 32`), `CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; 4) pegar dirección y token y probar; 5) configurar correo/WhatsApp/IA. Nota: cron de Vercel cada hora solo en Pro; Hobby una vez al día (ajustar `vercel.json` o usar cron-job.org contra `/api/cron/send` con `Authorization: Bearer CRON_SECRET`).

---

## 2. Nómina (`m_nomina.js`)

### 2.1 Parámetros
```js
smmlv  = S.cfg.smmlv[añoActual] || 1750905
uvtHoy = S.cfg.uvt[añoActual]   || 52374
ARLN = [['1','Riesgo I (oficina)',0.522],['2','Riesgo II',1.044],['3','Riesgo III',2.436],['4','Riesgo IV',4.35],['5','Riesgo V',6.96]]  // % sobre IBC
```
Tipos `DTIPOS`:
- `empleado` Empleado con contrato — "Te descuentan salud 4%, pensión 4% y, si aplica, fondo de solidaridad y retención." (briefcase)
- `independiente` Independiente / prestación de servicios — "Pagas tu seguridad social sobre el 40% de lo que facturas: salud 12,5%, pensión 16% y ARL." (file-signature)
- `pensionado` Pensionado — "Te descuentan salud de tu mesada." (armchair)
- `otro` Otro / solo descuentos propios — "Escribe tus descuentos uno por uno." (sliders-horizontal)

### 2.2 Fondo de solidaridad pensional (literal)
```js
function fspPct(base){const n=base/smmlv();
  if(n<4)return 0; if(n<16)return 1; if(n<17)return 1.2; if(n<18)return 1.4;
  if(n<19)return 1.6; if(n<20)return 1.8; return 2}
```

### 2.3 Retención en la fuente, empleado (procedimiento 1, tabla art. 383) (literal)
```js
function retEmpleado(mensual,aportes){const U=uvtHoy();
  const neto=Math.max(0,mensual-aportes);           // ingreso − salud − pensión − FSP
  const ex=Math.min(neto*0.25,790/12*U);            // renta exenta 25% con tope 790 UVT/año
  const base=(neto-ex)/U;                            // base en UVT
  let r=0;
  if(base>2300)r=(base-2300)*0.39+770;
  else if(base>945)r=(base-945)*0.37+268;
  else if(base>640)r=(base-640)*0.35+162;
  else if(base>360)r=(base-360)*0.33+69;
  else if(base>150)r=(base-150)*0.28+10;
  else if(base>95)r=(base-95)*0.19;
  return Math.round(r*U/1000)*1000}                  // a pesos, redondeado a miles
```
Observaciones: no aplica el límite global del 40 % / 1.340 UVT, ni dependientes, intereses de vivienda, medicina prepagada o aportes voluntarios. Es un "cálculo aproximado".

### 2.4 `dedCalc(bruto, frec, D)` (literal en lógica)
- Si no hay `D` o `bruto` → `{neto:bruto||0, items:[], total:0}`.
- Factor mensual `k = {quincenal:2, semanal:52/12, anual:1/12}[frec] || 1`; `M = bruto*k` (equivalente mensual para topes). Cada ítem se guarda como `valorMensual/k` (valor del periodo).
- **Empleado**:
  - `sp = +D.saludP || 4`, `pp = +D.pensionP || 4`.
  - Salud `s = D.salud!==false ? M*sp/100 : 0`; Pensión `p = D.pension!==false ? M*pp/100 : 0`.
  - FSP `fp = D.fsp!==false ? fspPct(M) : 0`, `f = M*fp/100`; texto "X% (ganas N,N salarios mínimos)".
  - Retención (si `D.ret!==false`): `manual` → `retV*k` (valor fijo por periodo); `pct` → `M*retV/100`; `auto` → `retEmpleado(M, s+p+f)`.
- **Independiente**:
  - `ib = Math.max(smmlv(), M*(+D.ibcP||40)/100)` (IBC = 40 % de lo facturado, mínimo 1 SMMLV; **no** aplica tope de 25 SMMLV).
  - `sp = +D.saludP || 12.5`, `pp = +D.pensionP || 16`; Salud `ib*sp/100`, Pensión `ib*pp/100`.
  - FSP `ib*fspPct(ib)/100`.
  - ARL `ib * ARLN[arlN].pct/100` (por defecto Riesgo I).
  - Retención solo si `D.ret!==false && +D.retV`: `manual` → `retV*k`; si no → `M*retV/100` ("% de lo facturado").
- **Pensionado**: `sp = +D.saludP || 12`; salud `M*sp/100`.
- **Otros descuentos** (`D.otros[]`, todos los tipos): `{n, v, pct}`; si `pct` → `bruto*v/100` (sobre el valor del periodo), si no valor fijo `v`.
- Resultado: `total = Σ items`; `neto = max(0, round(bruto−total))`; items redondeados.
- Nota: un porcentaje 0 en `saludP`/`pensionP` cae al valor por defecto (por el `||`).

### 2.5 Formulario (`dedForm`) — se inyecta en `M.ingreso`
- Pregunta "¿El valor que escribiste es lo que te llega a la cuenta?" (`calc`): `neto` "Sí, es lo que me llega" / `bruto` "No, es el salario o valor del contrato".
- Con `bruto`: tipo (`dTipo`, tarjetas `DTIPOS`) y rejilla:
  - `dSalud` + `dSaludP` (% "Auto") — empleado/independiente/pensionado.
  - `dPension` + `dPensionP` — empleado/independiente.
  - `dFsp` "Automático: solo si ganas 4 salarios mínimos o más" — empleado/independiente.
  - `dArl` + `dArlN` (Riesgo I–V con %) — independiente.
  - `dIbcP` Base de cotización (% de lo facturado, def. 40) — independiente.
  - `dRet` + `dRetModo` (`auto` Calcular aproximado / `pct` Porcentaje / `manual` Valor fijo; por defecto `pct` si independiente, `auto` si no) + `dRetV`.
  - Otros descuentos: mínimo 3 filas, hasta 8 (`dON{i}` nombre, `dOV{i}` valor, `dOP{i}` "es %"). Ejemplos: libranza, cooperativa, fondo de empleados, medicina prepagada, ahorro voluntario.
- Vista previa en vivo (`#dedPrev`, envoltura de `updatePreviews`): "Lo que te llega a la cuenta <por quincena|por semana|al año|al mes>", neto grande, tabla bruto − cada descuento (con su explicación) y "Total descuentos (X%)", nota "Cálculo aproximado con salario mínimo $… y UVT $… Compáralo con tu desprendible de pago…".
- Descripción del modal: "El dinero que recibes con regularidad. Si escribes el salario o el valor del contrato, calculamos salud, pensión, retención y otros descuentos para saber cuánto te llega realmente."
- Al editar un ingreso con `bruto`, el campo valor muestra el bruto.
- `applyDed(o,d,f)`: si `calc!=='bruto'` → `o.bruto=0, o.desc=null`; si no `o.bruto=valor, o.desc=D, o.valor=neto, o.dedTotal=total`.
- Lista de ingresos: `dedLine(x)` → "Bruto $X − descuentos $Y: Salud, Pensión, …".

---

## 3. Conexión con el servidor (`n_servidor.js`)

### 3.1 Configuración y `srvFetch`
- `srvCfg()` = `{url: CLAUDE_RT ? '' : (location.origin si es http), token:'', ...mirai-srv}`; `srvOk()` = hay url y token; `srvInfo()` = `mirai-srv-info`.
- `srvFetch(path, body, method)`:
  - Sin url/token → error "Configura tu servidor en Ajustes › Servidor y conexiones."
  - `fetch(url+path, {method: method || (body?'POST':'GET'), headers:{'Content-Type':'application/json', Authorization:'Bearer '+token}, body: JSON})`.
  - Respuesta JSON (si falla el parseo `{}`); error si `!r.ok || j.ok===false` con `j.error || 'Error '+status`.
- Al cargar (+5 s): si `srvOk()` → refresca `/api/health` y `pushSnapshot()`.

Respuesta de `/api/health` (servidor): `{ok, version, store:'supabase'|'firestore'|'file', email: proveedor|null, emailFrom, whatsapp: bool, whatsappTemplate, ai: ['anthropic','openai','gemini'…], cron: bool (hay CRON_SECRET), shares: true, encryption: bool}`.

### 3.2 `aiPick(orig)` — quién responde la IA (literal en lógica)
```
ia = S.cfg.ia; si ia.on===false → null
pv = ia.prov || 'claude'; onSrv(p) = srvOk() && health.ai incluye p
si pv==='claude' (o desconocido):
   CLAUDE_RT → orig()            (Claude incluido)
   onSrv('anthropic') → srvAdapter('anthropic', ia.model.anthropic)
   si no → null
key = mirai-ia-keys[pv]; model = ia.model[pv] || AIP[pv].m
onSrv(pv) && (!key || ia.viaSrv!==false) → srvAdapter(pv, model)   // el servidor gana
key → extAdapter(pv, key, model, CLAUDE_RT ? orig().catch(()=>null) : null)
si no → CLAUDE_RT ? orig() : null
```
`srvAdapter(pv,model)`: `POST /api/ai {provider, model, prompt, images:[{mime,b64}], json}` → `.text`; misma interfaz `f()`, `f.json()`, `f.limits()` que `extAdapter`.

### 3.3 Envíos por el servidor
Ver §1.7 (`sendEmailDigest` y `openWa` envueltos) y §1.10 (pruebas). Endpoint único `POST /api/notify {channel:'email'|'whatsapp', to, subject?, text}` → `{provider, template?}`.

### 3.4 Snapshot para el cron (`pushSnapshot`)
- Solo si `srvOk()`. Cuándo: +5 s al cargar, tras "Probar servidor" y 1,5 s después de cualquier cambio `data-aj`. **No** se reenvía cuando cambian los datos financieros (gastos, préstamos…), así que el snapshot puede quedar viejo hasta el siguiente arranque → en la migración el cron debe leer los datos reales.
- `POST /api/alerts/snapshot` con:
```js
{ device,                         // mirai-device (uid()+uid())
  nombre: primer nombre de S.perfil.nombre,
  email: canales.emailTo, wa: canales.waNum,
  emailOn: canales.email && canales.emailVia==='srv',
  waOn: canales.wa && canales.waVia==='api',
  hour: +canales.hora || 7,
  tz: Intl…timeZone || 'America/Bogota',
  frec: canales.frec, hideAmt: !!canales.hideAmt,
  anticipo: S.cfg.anticipo,
  items: _rawNotifs().map(n => ({ t:n.t, b:n.b, lvl:n.lvl,
           fecha: ISO o '', ch: ['email','wa'].filter(c => nmat[nCat(n)][c]) })) }
```
(Datos personales enviados: primer nombre, correo, número de WhatsApp y textos de avisos con montos.)
- Servidor: guarda por `device` (máx. 100 ítems). `runCron`: para cada snapshot, en la zona horaria `tz`, si `hora === hour`, `lastSent ≠ hoy` y (si semanal) es lunes → arma el resumen por canal con ítems cuyo `ch` incluye el canal y `fecha <= hoy + anticipo`, envía correo/WhatsApp y marca `lastSent`. Mismo formato de texto que `digestText` (la fecha sale como ISO).

---

## 4. Asesor antes de gastar, chat, familia y date picker (`o_asesor.js`)

### 4.1 Estado
- `ASR = {step:1|2, txt, d, loading, interp, tab:'simple'|'fin', src:'ia'|'local'|'manual'}` (memoria).
- `CONS = {last, loading}` (`d_app.js`).
- `S.consejos[]` (máx. 20, el más nuevo primero): `{id, fecha, d:{tipo,desc,valor,contactoId}, full:<todos los datos>, txt, v:'si'|'cuidado'|'no', R:[razones], m:<métricas>, X:<extras>, ai:<respuesta IA>|null, aiErr:bool}`.

### 4.2 Tipos de decisión `ATIPOS`
| tipo | Etiqueta | Descripción | Ícono | Isotipo |
|---|---|---|---|---|
| comprar | Comprar algo | Celular, nevera, viaje, muebles… | shopping-bag | tarjetas |
| tarjeta | Sacar una tarjeta de crédito | Saber si te conviene y cuánto cuesta | credit-card | tarjetas |
| credito | Pedir un préstamo o crédito | Banco, libranza, vehículo, vivienda | landmark | le-debo |
| prestar | Prestarle dinero a alguien | Familiar, amigo o cliente | hand-coins | me-deben |
| fijo | Asumir un gasto mensual | Arriendo, plan, colegio, gimnasio | repeat | suscripciones |
| invertir | Invertir o ahorrar | CDT, cuenta de ahorro, fondo | trending-up | inversiones |
| abonar | Abonar a una deuda | Pagar antes para ahorrar intereses | piggy-bank | estrategia |
| empeno | Empeñar algo | Dejar un objeto a cambio de dinero | gem | le-debo |

Ejemplos (`AEJ`, chips): "Quiero sacar una tarjeta de crédito, me aprueban un cupo de 5 millones", "Comprar un celular de 3 millones a 12 cuotas con la tarjeta", "Prestarle 2 millones a mi hermano y que me pague en 6 meses", "Pedir un crédito de libre inversión de 15 millones a 36 meses", "Mudarme a un arriendo de 2.300.000 al mes", "Meter 10 millones en un CDT a 6 meses".

### 4.3 Paso 1 — texto libre e interpretación
- Vista: textarea `#asTxt` (placeholder "Ej. Me ofrecieron una tarjeta de crédito con cupo de 5 millones y cuota de manejo de 30 mil. ¿Me conviene?"), chips de ejemplo (`asEj` llena el textarea), botón "Continuar" (`asInterp`, muestra "Entendiendo…"), y botones de tipo directos (`asTipo` → paso 2 con `src:'manual'`, `forma:'contado'`, `modoInt: credito→'tasa' si no 'no'`, `tasa` tarjeta 1,9 / empeño 4).
- `asInterpret(t)`: menos de 4 caracteres → toast "Cuéntame un poco más: qué quieres hacer y por cuánto.". Intenta `aiInterp`; si falla, `localInterp` (`src:'local'`). Siempre completa `valor`, `cuotas`, `tasa` faltantes con `localInterp`. Busca contacto por nombre (`persona`). Defaults: tarjeta `tasa=1.9`, empeño `tasa=4`. `modoInt`: `'tasa'` si hay tasa o EA; `'cuota'` si hay valor de cuota; si no `prestar→'no'`, `credito→'tasa'`, resto `'no'`. Si hay EA y no tasa mensual: `tasa = ((1+ea/100)^(1/12) − 1)*100` (2 decimales). Pasa a paso 2; si no estaba en `#consejero` navega allí (lo usa el chat).
- `moneyIn(t)`: regex `(\d+(?:[.,]\d+)*)\s*(millones|millon|mill|mll|m\b|mil|k\b|lucas|palos?)?`; quita puntos de miles, coma decimal; ×1e6 para millones/m/palo(s), ×1e3 para mil/k/lucas; solo valores ≥ 1000.
- `localInterp(t)` (texto normalizado):
  - `tarjeta`: `/tarjeta de credito|sacar (una )?tarjeta|cupo de|me aprueban (un )?cupo/` y no "con (la) tarjeta".
  - `prestar`: `/prestar(le)?|le presto|presto a/`.
  - `credito`: `/credito|prestamo|libranza|financiar|financiado/` sin "comprar".
  - `fijo`: `/arriendo|arrendar|mensualidad|al mes|cada mes|plan de|gimnasio|colegio|suscrip/`.
  - `invertir`: `/cdt|invertir|inversion|ahorrar en|fondo de inversion|acciones/`.
  - `abonar`: `/abonar|abono|prepagar|pagar antes/`; `empeno`: `/empen/`; por defecto `comprar`.
  - Extrae: valor (primer monto), cuotas `(\d+)\s*(cuotas|meses)`, tasa `(\d+[.,]?\d*)\s*%`, días `(\d+)\s*dias`. comprar: `forma='cuotas'` si menciona cuota/tarjeta/financ. tarjeta: `pagoModo='total'`. invertir: `dias = meses*30` o días; sin cuotas. fijo: sin cuotas. prestar: persona por regex de parentescos o nombre propio después de "a"/"a mi".
- `aiInterp(t)` — `window.claude.use('sample')` → `s.json(prompt,{modelTier:'quick'})`. **Prompt literal:**
```
Eres un asistente financiero para familias colombianas. El usuario describe lo que piensa hacer con su dinero:
"${t}"
Clasifícalo y extrae los datos. Tipos: comprar (compra de contado, a cuotas o con tarjeta), tarjeta (sacar/obtener una tarjeta de crédito nueva), credito (pedir un préstamo o crédito), prestar (prestarle dinero a otra persona), fijo (asumir un gasto mensual nuevo), invertir (CDT, ahorro, inversión), abonar (pagar antes una deuda que ya tiene), empeno (empeñar un objeto).
Responde SOLO JSON: {"tipo":"...","desc":"resumen de 3 a 8 palabras","valor":número o null,"forma":"contado"|"cuotas"|null,"cuotas":número o null,"tasa_mensual":número o null,"tasa_ea":número o null,"cuota":número o null,"cuota_manejo":número o null,"uso_mensual":número o null,"pago_tarjeta":"total"|"cuotas"|null,"seguros":número o null,"plazo_dias":número o null,"reemplaza":número o null,"persona":texto o null,"dudas":["1 a 3 preguntas cortas y sencillas sobre datos que faltan para un mejor consejo"]}
Reglas: "valor" según el tipo: comprar=precio total; tarjeta=cupo aprobado; credito/empeno=monto prestado; prestar=monto a prestar; fijo=valor mensual; invertir=monto a invertir; abonar=valor del abono. Montos en pesos sin puntos ("3 millones"=3000000, "500 mil"=500000). No inventes datos: usa null si no aparecen.
```
  Mapeo: `tasa_mensual→tasa`, `tasa_ea→ea`, `cuota→cuotaV`, `cuota_manejo→manejo`, `uso_mensual→uso`, `pago_tarjeta→pagoModo` (def. total), `plazo_dias→dias`, `dudas` (máx. 3). Si comprar sin forma → `cuotas? 'cuotas':'contado'`. Tipo inválido → null.

### 4.4 Paso 2 — formulario dinámico (`asForm`, `data-form="asesor"`)
- Cabecera: "Cambiar descripción" (`asBack` → paso 1) y la frase original entre comillas.
- Alertas: si `src='ia'` "Llenamos el formulario con lo que nos contaste — Revisa los datos marcados con IA…" (pill violeta "IA" junto a cada campo que vino de la IA); si `local` "Llenamos lo que pudimos entender".
- `dudas` de la IA: "Para un mejor consejo, ten en cuenta:" + lista.
- "1 ¿Qué quieres hacer?": selector de tipo (`asSwitch` conserva lo escrito; tarjeta sin tasa → 1,9).
- "2 <tipo>: los detalles": `desc` "¿Qué es?" (obligatorio, "Ej. Nevera nueva") + campos por tipo:
  - **comprar**: `valor` "¿Cuánto cuesta en total?"; `forma` contado/cuotas; con cuotas → bloque cuotas.
  - **Bloque cuotas**: `cuotas` (Ej. 12); `modoInt` "¿Tiene intereses?" (`no` Sin intereses / `tasa` Sé el porcentaje / `cuota` Sé el valor de la cuota); `tasa` "Interés mensual (%)" (tip: tarjetas 1,8–2,2 % mensual); `cuotaV` "Valor de cada cuota".
  - **tarjeta**: `valor` "Cupo que te aprueban" (tip: no es dinero tuyo); `manejo` cuota de manejo; `tasa` (def. 1,9); `uso` gasto mensual con ella; `pagoModo` total/cuotas; `cuotas` (def. 6) si difiere.
  - **credito**: `valor` "¿Cuánto te prestan?"; bloque cuotas "¿En cuántos meses lo pagas?"; `seguros` mensuales.
  - **prestar**: `valor`; `contactoId` "¿A quién?" (selector de contactos con búsqueda; placeholder menciona la persona detectada; sin contactos → nota); bloque cuotas "¿En cuántas cuotas te pagará?".
  - **fijo**: `valor` mensual; `reemplaza` "¿Dejarías de pagar otro gasto? ¿Cuánto?".
  - **invertir**: `valor`; `dias` plazo en días; `ea` tasa E.A.
  - **abonar**: `loanId` deuda (de `S.pagar`; sin deudas → nota) y `valor`.
  - **empeno**: `valor`; `tasa` (Ej. 4); `cuotas` meses.
- Botón "Analizar si me conviene" (deshabilitado/"Analizando…" mientras carga). Sin valor → "Escribe el valor".

### 4.5 Análisis (`asAnalyze` + `analizar` de `d_app.js`)
**`analizar(d)` (reglas base):**
- Métricas: `ing=ingresoMensual()`, `fij=fijosMes()`, `cuo=cuotasMes('pagar')`, `subs=subsMes()`, `varr=gastoVariableReal()`, `libre=ing−fij−cuo−subs−varr`, `liq=liquidez()`, `bas=gastosBasicos()||1`.
- `enCuotas = credito | prestar | (comprar y forma='cuotas')`. Con cuotas: `modoInt='tasa'` → `cuota=annuity(valor,tasa/100,n)`; `'cuota'` → `tasa=rateFromCuota(valor,cuotaV,n,'mensual')`; `'no'` → `valor/n`. `total=cuota*n`, `intereses=max(total−valor,0)`, `ea=(1+tasa/100)^12−1`.
- Después: `fijo` → `libreD=libre−valor`; `prestar` → `liqD=liq−valor`; con cuotas → `libreD=libre−cuota`, `ratioD=(cuo+cuota)/ing`; de contado → `liqD=liq−valor`. `emergA=liq/bas`, `emergD=liqD/bas`.
- Límites por `S.cfg.estricto` `[deudaSana, deudaMáx, mesesColchón, %libreMín]`: prudente `[.25,.35,4,.15]`, equilibrado `[.3,.4,3,.1]`, flexible `[.35,.5,2,.05]`.
- Veredicto (empeora `si → cuidado → no`):
  - `libreD<0` → no ("te faltarían $X cada mes"); `libreD<ing*%libreMín` → cuidado; si no, razón positiva.
  - Con cuotas (excepto prestar): `ratioD>deudaMáx` → no; `>deudaSana` → cuidado.
  - Prestar o contado (no fijo): `liqD<0` → no; `emergD<1` → no; `emergD<mesesColchón` → cuidado.
  - `ea*100 > S.cfg.usura` → cuidado.
  - Prestar con historial de mora del contacto → cuidado.
  - Intereses > 0 → razón "Pagarías $X en intereses (en total $Y)".
  - `dias = valor/(ing/30)` (días de trabajo equivalentes).
- Devuelve `{v, R, m:{ing,libre,libreD,ratioD,liq,liqD,emergA,emergD,cuota,total,intereses,ea,n,dias,valor,enCuotas,hist,varr,fij,cuo,subs}}`.

**Ajustes por tipo en `asAnalyze`:**
- comprar: usa `forma`. credito/prestar: tipo directo.
- fijo: `valor = max(0, valor − reemplaza)`.
- tarjeta: `man`, `uso`, `tm=tasa/100` (def. 1,9 %), `n=cuotas` (def. 6). `intMes = pagoModo='cuotas' && uso ? (annuity(uso,tm,n)*n − uso)/n : 0`. `X={manejo, intMes, costoAnual:(man+intMes)*12}`; se analiza como gasto fijo de `man+intMes`. Razones: "El cupo… no es dinero tuyo…"; costo en intereses o "Si pagas el total cada mes no pagas intereses; solo la cuota de manejo…"; si `uso > 30 % del ingreso` advertencia.
- invertir: `gan = valor*((1+ea)^(dias/365) − 1)` (días def. 180), `net = gan*0.96` (retención 4 %); razones de ganancia y de no poder usar el dinero. Si veredicto `no` y `liqD>=0` → `cuidado`.
- abonar: simula abono con `modo:'plazo'` en el motor de préstamos: `ahorro = intTotal antes − después`, `menos = cuotas antes − después`. Si ahorro > 0, veredicto `cuidado` y `emergD>=1` → `si`.
- empeño: `im = valor*tasa/100` (def. 4 %), analizado como fijo de `im`; razones de interés mensual y total en N meses (def. 3).
- crédito con seguros: `libreD −= seguros`, `cuota += seguros`, razón adicional.
- `R = [extras, …reglas]`, `X` adjunto.

**IA (`asAskAI`)** — solo si `S.cfg.ia.consejero!==false` y hay IA; `modelTier:'default'`. Contexto enviado:
```
{quiere, descripcion, texto_original, detalles:<d sin vacíos ni dudas>,
 calculos:{cuota_mensual, intereses_totales, tasa_efectiva_anual_pct, ...X redondeado},
 finanzas:{ingreso_mensual, gastos_fijos_mes, cuotas_deudas_mes, suscripciones_mes, gasto_variable_mes,
           libre_mes_antes, libre_mes_despues, deudas_sobre_ingreso_despues_pct, disponible_hoy,
           disponible_despues, meses_colchon_antes, meses_colchon_despues},
 veredicto_reglas, observaciones}
```
**Prompt literal:**
```
Eres un asesor financiero para familias colombianas (cifras en pesos COP). Analiza la decisión con los datos reales y responde SOLO JSON válido:
{"veredicto":"si"|"con_cuidado"|"no","titular":"máx 12 palabras","explicacion":"2-3 frases en español sencillo, sin tecnicismos","razones":["3 a 5 razones con cifras en formato $ 1.234.567"],"alternativas":["2 a 4 opciones prácticas"],"plan":["3 pasos concretos si decide hacerlo"],"pregunta":"una pregunta para reflexionar","tecnico":{"resumen":"3-4 frases para alguien que sabe de finanzas: flujo de caja, endeudamiento (DTI), liquidez, costo financiero, TEA","indicadores":[{"nombre":"...","valor":"...","lectura":"sano|alerta|riesgo"}],"recomendacion":"1-2 frases técnicas"}}
Sé honesto y amable. Respeta el veredicto de las reglas salvo razón clara (explícala). No inventes datos.
DATOS: ${JSON.stringify(ctx)}
```
Veredicto final: el de la IA (`si`/`no`, cualquier otro → `cuidado`) o el de reglas si no hubo IA. Se guarda en `S.consejos` (corta a 20), `commit`, y hace scroll a `.as-res`.

### 4.6 Resultado (tarjetas, dos pestañas)
- Cabecera según veredicto: `si` "Te alcanza" (thumbs-up), `no` "Mejor no, por ahora" (thumbs-down), `cuidado` "Puedes, pero con cuidado" (triangle-alert); titular de la IA o por defecto ("Puedes hacerlo sin poner en riesgo tus finanzas" / "Esto pondría en aprietos tus finanzas" / "Es posible, pero te deja con poco margen"); descripción · valor.
- Pestañas (`asTab`): **Explicación sencilla** (smile) y **Vista financiera** (chart-no-axes-combined).
- **Sencilla**: "En pocas palabras" (explicación IA); "Los números que importan" (4 cifras según tipo):
  - con cuotas: cuota mensual, intereses, libre al mes (rojo si < 0), meses de colchón.
  - tarjeta: cuota de manejo, intereses al mes, costo al año, libre al mes.
  - invertir: ganancia neta, disponible, colchón, libre al mes.
  - abonar: ahorro en intereses, cuotas que terminas antes, disponible, colchón.
  - resto: días de trabajo que equivale, disponible (rojo si < 0), libre al mes, colchón.
  - "¿Por qué?" (razones IA o reglas), "Otras opciones", "Si decides hacerlo" (pasos), "Piénsalo" (pregunta).
- **Financiera**: "Lectura técnica" (resumen + recomendación IA); tabla de indicadores con semáforo:
  - Ingreso mensual; Gastos fijos + suscripciones; Cuotas actuales; Gasto variable promedio.
  - Flujo libre antes → después (riesgo < 0; alerta < 10 % del ingreso; si no sano).
  - DTI antes → después (riesgo > 40 %; alerta > 30 %; sano).
  - Liquidez antes → después (riesgo < 0).
  - Cobertura de emergencias (riesgo < 1; alerta < 3; sano).
  - Con cuotas: cuota, TEA (riesgo si > usura), costo financiero total, total a pagar.
  - Extras: costo anual de la tarjeta, rendimiento bruto/neto, intereses evitados.
  - "Indicadores del asesor IA" (de `tecnico.indicadores`), "Observaciones" (`R`).
- Pie: nota (sin IA: "Sin IA disponible: ves el análisis automático con tus números." / con IA: "Orientación basada en tus datos. No reemplaza a un asesor financiero certificado."). Acciones si veredicto ≠ no: prestar → "Registrar este préstamo" (modal `loan` kind cobrar con contacto y monto); crédito → "Registrar esta deuda" (`loan` pagar); invertir → "Registrar inversión"; tarjeta → "Ir a Tarjetas". Siempre: "Preguntar al asesor" (abre el chat con "Tengo dudas sobre este análisis: <desc>").
- Vista `#consejero`: cabecera "Consejero antes de gastar" + botón "Abrir chat del asesor"; layout 2 columnas (izq.: paso 1 o formulario; der.: skeleton "Revisando tus finanzas…", resultado o vacío "Aquí verás mi recomendación…"). "Consultas anteriores": últimas 8 (ícono por veredicto, tipo · fecha · valor); `consShow` las reabre (si tienen `full`, carga el formulario en paso 2).
- `HELP.consejero` con 4 pasos y 2 tips (burbuja arrastrable, tono Sencillo/Financiero).

### 4.7 Chat flotante del asesor
- Estado `CH = {open, cur, busy, side:true, tono:'simple'|'fin'}` (no persistido; en < 700 px `side=false` al iniciar).
- Datos `S.chats[]`: `{id, t:<primeros 48 caracteres de la 1ª pregunta>, fecha, msgs:[{r:'u'|'a', t, go?}]}`.
- **Burbuja (FAB `#asFab`)**: SVG de globo navy con 3 puntos lima y destello; tooltip "Pregúntale a Mirai"; oculta si la pantalla de autenticación está visible o `body.locked` (MutationObserver sobre `#auth`). **Arrastre** con pointer events: umbral 6 px, límites 8 px de los bordes, guarda `{x,y}` en `mirai-chat-pos`; clic sin arrastre abre/cierra; en `resize` se reubica si queda fuera. Se re-crea tras cada `renderNav`.
- **Panel**: barra lateral con "Nueva conversación" e historial agrupado (Hoy, Ayer, Últimos 7 días, Últimos 30 días, Anteriores) con borrar; cabecera (botón historial, título "Asesor financiero" + título de conversación, selector de tono Sencillo/Financiero, cerrar); mensajes (asistente con avatar e `mdLite`: `**negrita**`, listas con `-`/`•`, párrafos); estado vacío "¿En qué te ayudo hoy?" con 5 chips ("¿Cómo puedo ahorrar más cada mes?", "¿Qué deuda debería pagar primero?", "¿Me conviene sacar una tarjeta de crédito?", "Explícame qué es la tasa E.A.", "¿Cuánto debería tener en el fondo de emergencia?"); indicador de escritura; textarea autoajustable (máx. 140 px), Enter envía, Shift+Enter salto, Esc cierra (si no hay modal). Aviso: "Orientación basada en tus datos de Mirai. No reemplaza a un asesor certificado."
- **`chatSend(q)`**: crea la conversación si no existe; agrega mensaje; IA si `ia.on!==false`. Contexto `finCtx()`: `ingreso_mensual, gastos_fijos_mes, cuotas_deudas_mes, suscripciones_mes, gasto_variable_mes, disponible, fondo_emergencia, deudas[≤8]{nombre,saldo,tasa_mensual,cuota}, te_deben, metas[≤6]{nombre,objetivo,ahorrado,fecha}, hormiga_mes`. Historial: últimos 10 mensajes como "Usuario:/Asesor:". **Prompt literal:**
```
Eres el asesor financiero de Mirai para una familia colombiana (cifras en pesos COP). ${tono==='fin'
 ? 'El usuario sabe de finanzas: puedes usar términos técnicos (flujo de caja, DTI, liquidez, TEA, amortización) con precisión.'
 : 'El usuario NO sabe de finanzas: habla en español sencillo de Colombia, frases cortas, sin tecnicismos (si usas uno, explícalo entre paréntesis).'}
Datos reales del usuario: ${JSON.stringify(finCtx())}
Conversación:
${hist}
Decide: si el último mensaje describe una decisión concreta de gastar, comprar, endeudarse, sacar tarjeta o crédito, prestar dinero, invertir, abonar o empeñar (algo que quiere evaluar antes de hacerlo), la acción es "consejero". En cualquier otro caso responde tú.
Responde SOLO JSON: {"accion":"consejero"|"responder","respuesta":"tu respuesta (máx 180 palabras, puedes usar **negritas** y listas con guiones). Si la acción es consejero, una frase corta diciendo que lo vamos a analizar con sus números."}
```
  - Sin IA: si `CONS_RE` coincide → redirige al consejero ("Esto vale la pena analizarlo con tus números. Te llevo al **Consejo antes de gastar**…"); si IA apagada → mensaje para activarla en Ajustes; si no → "No pude conectarme con la IA en este momento…".
  - `CONS_RE = /(quiero|voy a|pienso|debo|deberia|me conviene|me alcanza|estoy pensando|vale la pena|es buena idea).{0,40}(comprar|sacar|pedir|prestar|financiar|endeudar|tarjeta|credito|prestamo|arrendar|arriendo|invertir|cdt|empen|abonar|cuotas)|me alcanza para|puedo comprar|presto|prestarle/` (sobre texto normalizado).
  - Si `go`: el mensaje lleva botón "Abrir Consejo antes de gastar" y a los 1,4 s se ejecuta `chatGoCons(q)`: cierra el chat si `innerWidth<900`, pone el texto en el paso 1, navega a `#consejero` y llama `asInterpret`.
- Acciones: `chatOpen` (con `data-q` abre conversación nueva con la pregunta precargada), `chatClose`, `chatNew`, `chatPick` (en < 700 px oculta el historial), `chatDel`, `chatSide`, `chatTono`, `chatAsk`, `chatGoCons`.

### 4.8 Integrantes de la familia (`M.miembro`)
- Parentescos `PARENTESCOS` (valor, ícono): Titular (user-round), Cónyuge o pareja (heart), Hijo (baby), Hija (baby), Padre (user), Madre (user), Hermano (users), Hermana (users), Abuelo, Abuela (user), Nieto, Nieta (baby), Tío, Tía, Primo, Prima, Suegro, Suegra, Cuñado, Cuñada (user), Empleado del hogar (house), Otro familiar (users), Otra persona (user). `PARENT_IC` agrega los legados "Cónyuge" (heart) y "Hijo/a" (baby). Si el rol guardado no está en la lista, se agrega como opción.
- Modal: título "Agregar integrante"/"Editar integrante"; descripción "Agrega a las personas del hogar. Así puedes registrar quién hizo cada gasto y, si quieres, darle a cada uno un presupuesto mensual."
  - `nombre` (obligatorio, "Ej. Sofía"), `rol` "¿Qué es para ti?" (selector con búsqueda), `tieneCupo` "¿Quieres darle un presupuesto mensual?" (`no` "No, gasta del dinero de la casa" / `si` "Sí, tiene un límite al mes") con nota explicativa, `cupo` "Presupuesto al mes" (solo si `si`).
  - Botones Cancelar / Agregar | Guardar cambios.
- Guardado (`d_app.js`): `{nombre, rol: rol||'Otro familiar', cupo: tieneCupo==='si' ? cupo : 0}`; nuevo con `uid()`; toasts "X ya hace parte de tu familia en Mirai." / "Se actualizaron los datos de X."; resalta y hace scroll a la tarjeta 2,5 s.
- FHELP: "¿Qué es para ti?" → "El parentesco o la relación de esta persona contigo."; "Presupuesto al mes" → "Lo máximo que esta persona puede gastar al mes en sus cosas. Mirai te avisa si se pasa." MDESC: "Las personas del hogar con las que compartes el dinero."

### 4.9 Plazos cómodos (formulario de inversión)
- `plazoDias(n, unidad, inicio)`: `dias` → n; `semanas` → n*7; `anos` → días entre inicio y `addMonths(inicio, n*12)`; meses (por defecto) → días hasta `addMonths(inicio, n)`; mínimo 1.
- Botones `data-plazo="n|unidad"` llenan `plazoN`/`plazoU`; `#plazoHint` muestra "Son N días · vence el <fecha>".

### 4.10 Selector de fecha (date picker, redefine `drawCal`)
- Modos: `d` (días: cuadrícula de 42 celdas lunes a domingo, marca hoy `t`, seleccionado `s`, otros meses `o`; título con botones de mes y año), `m` (12 meses, flechas ±1 año) y `y` (rejilla de 12 años desde `y0 = y−4`, flechas ±12 años).
- Campo para escribir la fecha `#calTyped` (dd/mm/aaaa) + botón ✓; Enter confirma; al escribir una fecha válida el calendario salta a ese mes.
- `parseTyped`: `d/m/aaaa` con separadores `/ - . espacio` (año de 2 dígitos → +2000; valida mes), `aaaa-mm-dd`, o texto con nombre del mes + año ("15 marzo 2030"). Error → toast "Escribe la fecha como dd/mm/aaaa, por ejemplo 15/03/2030."
- Atajos: Hoy, +1 mes, +6 meses, +1 año, +5 años. Pie: "Toca el mes o el año para saltar" + Cerrar.

---

## 5. Calendarios (`p_calendario.js`)

### 5.1 Próximos pagos (`#recordatorios`)
**Categorías `ECAT`** (clave → nombre, color, ícono):
| k | Nombre | Color | Ícono |
|---|---|---|---|
| fijo | Gastos fijos | #2F6FED | house |
| pagar | Cuotas de deudas | #E5484D | landmark |
| cobrar | Cobros | #16A34A | hand-coins |
| ingreso | Ingresos | #0EA5A4 | arrow-down-to-line |
| sub | Suscripciones | #8E4EC6 | repeat |
| tarjeta | Tarjetas | #F97316 | credit-card |
| cal | Calendario fiscal | #A16207 | calendar |
| inv | Inversiones | #0891B2 | trending-up |
| aporte | Ahorro programado | #3F7A1E | piggy-bank |

**Evento**: `{id, k, fecha:Date, titulo, monto, dir:'pagar'|'cobrar', st:'ok'|'pend'|'bad', go:<vista>, act?:{modal,id,per?,kind?}, sub?, rng?}`.

**`calEvents(a,b)`** — solo eventos con `a ≤ fecha ≤ b`; se excluyen las categorías apagadas (`CALP.off`); orden por fecha y, en el mismo día, primero `pagar`.
- **Gastos fijos** (`S.fijos`): por cada mes del rango, `fijoPeriods(f,y,m)` (periodos según frecuencia). Se omite si el vencimiento es anterior a `f.inicio`, o (sin `inicio`) si el mes es anterior a `f.desde`. `k = f.link ? 'aporte' : 'fijo'`. Pagado si existe `f.pagos` con `per` igual → `st:'ok'` y monto pagado; si no, `bad` si venció o `pend`, con acción `pagarFijo {id, per}`. `rng = "$vmin – $vmax"` si es variable.
- **Préstamos** (`S.pagar` → `pagar`, `S.cobrar` → `cobrar`): `engine(L)`. Cuotas pagadas (`hist` tipo `cuota`) en su fecha programada `prog`, `st:'ok'`; plan pendiente (`plan`) con `st` bad/pend y acción modal `pago {kind,id}`; título "Cuota N · nombre" o "Cobro N · nombre"; `sub = concepto`; `go` le-debo/me-deben.
- **Ingresos** (`S.ingresos`): quincenal → días 15 y último; mensual → `min(dia||30, último)`; semanal → todos los viernes; (anual u otras no generan). Monto `conv(valor, moneda)`; `st:'ok'` si ya pasó, si no `pend`.
- **Suscripciones**: desde `proximo`, retrocede por ciclo (1 mes o 12 si anual) hasta antes de `a` y avanza hasta `b` (máx. 40 iteraciones).
- **Tarjetas**: por mes, día `min(c.pago||15, último)`; monto `tarjetaPagoMes(c, offsetMeses)` (suma cuotas pendientes de compras); solo si > 0.
- **Calendario fiscal** (`S.calendario`): una vez por año del rango (`unaVez` → solo la fecha original); `dir` cobrar si `tipo==='ingreso'`; `sub = nota`.
- **Inversiones**: un evento en `inv(x).venc`, título "Vence <nombre>", monto `final || capital`, `dir:'cobrar'`.

**Rangos (`calRange`)**: mes → 42 días desde el lunes de la semana del día 1; semana → lunes a domingo; agenda → 45 días desde `CALP.d`.

**Vistas:**
- **Mes**: cuadrícula 7×6, cada día con número, neto del día (+/−, sin espacio tras `$`), hasta 3 chips de evento (color de categoría, clases de estado/dirección) y "+N más" (va a agenda en ese día). Clic en el espacio libre de la celda → agenda de ese día.
- **Semana**: 7 columnas con eventos (ícono, título, monto con `+` si cobrar, pill Vencido/Hecho), "Libre" si vacío, y pie con total por pagar (−) y por cobrar (+).
- **Agenda**: días con eventos: fecha grande, día de semana, mes, tiempo relativo; cada evento con punto de color, título, categoría · sub · rango, monto y pill Vencido/Hecho/Pendiente.
- Barra: Hoy, ←/→ (`calMove`: mes ±1 mes, semana ±7 días, agenda ±30 días), título (mes y año / rango de semana / "Desde <fecha>"), selector Agenda/Semana/Mes (persistido).
- Lateral: mini-calendario del mes (marca días con eventos, navega con flechas), resumen "Por pagar este mes / en el periodo" (eventos `pagar` no hechos, solo del mes visible en vista mes) y "Entradas y cobros"; "Mis calendarios" (checkbox por categoría → `CALP.off`, persistido).
- Alerta superior si hay vencidos en el rango: "Tienes N pago(s) vencido(s) por $X" + "Verlos" (agenda).
- **Popup de evento** (`evPopup`): título, fecha + relativa, categoría · sub, monto (y "normalmente $a – $b"), estado; botones "Pagar"/"Registrar cobro" (si tiene acción y no está hecho) y "Ver detalle" (navega a `go`).
- Cabecera: "Google Calendar" (modal `gcal` de `f_extra.js`: eventos de la agenda de los próximos 45 días), "Exportar .ics", "Agregar" (menú: Gasto fijo, Suscripción, Fecha importante, Deuda o crédito → modal `loan` kind pagar, Ingreso).
- **Exportar .ics** (`calIcs`): eventos de −30 a +365 días, no hechos y sin ingresos. `VCALENDAR 2.0`, `PRODID:-//Mirai//Finanzas//ES`; cada `VEVENT` con `UID:<id>@mirai`, `DTSTART;VALUE=DATE`, `DTEND` +1 día, `SUMMARY:"Pagar: "|"Cobrar: " + título + " ($X)"` (sin `,` `;`), `DESCRIPTION:<categoría> - Mirai`, alarma `TRIGGER:-P1D`. Archivo `mirai-pagos.ics` vía `downloadFile`.
- `HELP.recordatorios` con 5 pasos.

### 5.2 Calendario fiscal y laboral (`#calendario`)
**Categorías `FCAT`**: laboral (Laboral, #16A34A, briefcase), dian (Impuestos DIAN, #E5484D, landmark), local (Impuestos locales, #F97316, building-2), vehiculo (Vehículo, #2F6FED, car), hogar (Hogar y familia, #8E4EC6, house), personal (Personal, #0891B2, user).
`fcatOf(c)`: `c.cat` o por regex del título (cesant|prima|dotaci|salario → laboral; renta|dian|exterior → dian; predial|vehicular|ica → local; soat|tecnico|mecanica → vehiculo; matr|arriendo|colegio → hogar; resto personal).

**Plantillas `FPL(año)`** (fecha `D(mes,día)` del año actual):

| k | cat | Título | Fecha | Tipo | Nota (resumen) | Fuente |
|---|---|---|---|---|---|---|
| int_ces | laboral | Intereses sobre cesantías | 31 ene | ingreso | Los paga el empleador a más tardar el 31 de enero (12 % anual sobre las cesantías). | |
| ces | laboral | Consignación de cesantías al fondo | 14 feb | ingreso | Plazo para consignar las del año anterior (Porvenir, Protección, Colfondos, FNA…). | |
| prima1 | laboral | Prima de servicios (1er semestre) | 30 jun | ingreso | Medio salario por semestre. Plazo legal: 30 de junio. | |
| prima2 | laboral | Prima de servicios (2º semestre) | 20 dic | ingreso | Medio salario. Plazo legal: 20 de diciembre. | |
| dot1 | laboral | Dotación de vestido y calzado (1ª entrega) | 30 abr | ingreso | Si ganas hasta 2 SMMLV. Entregas: 30 abr, 31 ago y 20 dic. | |
| dot2 | laboral | Dotación (2ª entrega) | 31 ago | ingreso | Hasta 2 SMMLV. | |
| dot3 | laboral | Dotación (3ª entrega) | 20 dic | ingreso | Hasta 2 SMMLV. | |
| smmlv | laboral | Nuevo salario mínimo | 1 ene | ingreso | Rige el aumento del SMMLV y del auxilio de transporte. | |
| renta | dian | Declaración de renta (DIAN) | 12 ago | egreso | Depende de los 2 últimos dígitos de la cédula. | dian.gov.co |
| activos | dian | Declaración de activos en el exterior | 12 ago | egreso | Si tenías activos en el exterior > 2.000 UVT al 1 de enero. Mismo plazo que la renta. | |
| pred_bog | local | Predial Bogotá con 10% de descuento | 17 abr | egreso | 2026: con descuento hasta 17 abr; sin descuento hasta 10 jul. | bogota.gov.co |
| pred_bog2 | local | Predial Bogotá (último plazo) | 10 jul | egreso | Último plazo sin descuento en 2026. | bogota.gov.co |
| veh_bog | local | Impuesto vehicular Bogotá con 10% de descuento | 15 may | egreso | 2026: con descuento hasta 15 may; sin descuento hasta 24 jul. | bogota.gov.co |
| veh_bog2 | local | Impuesto vehicular Bogotá (último plazo) | 24 jul | egreso | Último plazo sin descuento en 2026. | bogota.gov.co |
| soat | vehiculo | Renovar SOAT | hoy | egreso | Vence un año después de comprado. Cambia la fecha. | |
| rtm | vehiculo | Revisión técnico-mecánica | hoy | egreso | Carros desde el 5º año de matrícula, motos desde el 2º. | |
| matri | hogar | Matrículas y útiles escolares | 15 ene | egreso | Calendario A: enero; B: julio. | |
| arriendo | hogar | Ajuste anual del arriendo | día 1 del mes actual | egreso | Máximo el IPC del año anterior, en el aniversario del contrato. | |
| navidad | personal | Presupuesto de diciembre (regalos y fiestas) | 1 dic | egreso | Separa desde antes. | |
| vacas | personal | Vacaciones de mitad de año | 15 jun | egreso | Planea el presupuesto del viaje. | |

Modal `fplant` ("Fechas importantes de Colombia", ancho): agrupado por categoría; las que ya existen (por `k` o título) aparecen marcadas y deshabilitadas con "Ya la tienes". Al guardar crea `{id,k,cat,titulo,fecha,tipo,monto:0,nota,fuente?}`; si es `renta` y hay dígitos usa `rentaFecha`. Toast "Agregamos N fecha(s)…".

**RENTA26** (renta personas naturales 2026, año gravable 2025). Se calcula: 33 días hábiles desde el 12-ago-2026 excluyendo sábados, domingos y festivos `2026-08-17` y `2026-10-12` (índices 0–32), luego 17 fechas explícitas de octubre (índices 33–49).
`rentaFecha(dig)`: toma los 2 últimos dígitos `n`; índice `n===0 ? 49 : floor((n−1)/2)`.

| Índice | Últimos 2 dígitos | Fecha límite |
|---|---|---|
| 0 | 01 y 02 | 2026-08-12 |
| 1 | 03 y 04 | 2026-08-13 |
| 2 | 05 y 06 | 2026-08-14 |
| 3 | 07 y 08 | 2026-08-18 |
| 4 | 09 y 10 | 2026-08-19 |
| 5 | 11 y 12 | 2026-08-20 |
| 6 | 13 y 14 | 2026-08-21 |
| 7 | 15 y 16 | 2026-08-24 |
| 8 | 17 y 18 | 2026-08-25 |
| 9 | 19 y 20 | 2026-08-26 |
| 10 | 21 y 22 | 2026-08-27 |
| 11 | 23 y 24 | 2026-08-28 |
| 12 | 25 y 26 | 2026-08-31 |
| 13 | 27 y 28 | 2026-09-01 |
| 14 | 29 y 30 | 2026-09-02 |
| 15 | 31 y 32 | 2026-09-03 |
| 16 | 33 y 34 | 2026-09-04 |
| 17 | 35 y 36 | 2026-09-07 |
| 18 | 37 y 38 | 2026-09-08 |
| 19 | 39 y 40 | 2026-09-09 |
| 20 | 41 y 42 | 2026-09-10 |
| 21 | 43 y 44 | 2026-09-11 |
| 22 | 45 y 46 | 2026-09-14 |
| 23 | 47 y 48 | 2026-09-15 |
| 24 | 49 y 50 | 2026-09-16 |
| 25 | 51 y 52 | 2026-09-17 |
| 26 | 53 y 54 | 2026-09-18 |
| 27 | 55 y 56 | 2026-09-21 |
| 28 | 57 y 58 | 2026-09-22 |
| 29 | 59 y 60 | 2026-09-23 |
| 30 | 61 y 62 | 2026-09-24 |
| 31 | 63 y 64 | 2026-09-25 |
| 32 | 65 y 66 | 2026-09-28 |
| 33 | 67 y 68 | 2026-10-01 |
| 34 | 69 y 70 | 2026-10-02 |
| 35 | 71 y 72 | 2026-10-05 |
| 36 | 73 y 74 | 2026-10-06 |
| 37 | 75 y 76 | 2026-10-07 |
| 38 | 77 y 78 | 2026-10-08 |
| 39 | 79 y 80 | 2026-10-09 |
| 40 | 81 y 82 | 2026-10-13 |
| 41 | 83 y 84 | 2026-10-14 |
| 42 | 85 y 86 | 2026-10-15 |
| 43 | 87 y 88 | 2026-10-16 |
| 44 | 89 y 90 | 2026-10-19 |
| 45 | 91 y 92 | 2026-10-20 |
| 46 | 93 y 94 | 2026-10-21 |
| 47 | 95 y 96 | 2026-10-22 |
| 48 | 97 y 98 | 2026-10-23 |
| 49 | 99 y 00 | 2026-10-26 |

> ⚠ Verificar con el calendario oficial DIAN (Decreto de plazos): el 29 y 30 de septiembre de 2026 quedan sin asignar entre los índices 32 y 33. Puede ser correcto o un hueco del algoritmo. En la migración, guardar la tabla como **datos** (tabla `calendario_dian` por año) y no como algoritmo, y agregar 2027 cuando la DIAN lo publique.

**Vista `#calendario`:**
- Próxima ocurrencia `nx(c)`: `unaVez` → la fecha; si no, misma fecha en el año actual, o el siguiente si ya pasó (tolerancia de 1 día).
- KPIs: "Próxima fecha" (días que faltan + fecha, color de categoría); "Te van a pagar (12 meses)" y "Vas a pagar (12 meses)" = suma de `calVal(c)` (monto o estimado) de fechas en los próximos 365 días por tipo.
- Tarjeta "¿Cuándo declaras renta?": input `#rentaDig` (2 dígitos; al completar 2 guarda `S.perfil.digitos` y re-renderiza conservando el foco). Resultado: "Tu fecha límite en 2026 era <fecha>" + pill "Ya pasó · el calendario 2027 lo publica la DIAN a inicio de año" o "En N días"; botón "Usar esta fecha en mi calendario" (`rentaSet`: crea o actualiza el ítem `k:'renta'` con la fecha, nota "Según los dígitos XX. Calendario DIAN 2026; actualízala cuando salga el de 2027." y fuente). Nota sobre los topes y enlace a `#renta`.
- Filtros (chips): Todas + cada `FCAT` con contador.
- Lista agrupada por mes de la próxima ocurrencia: día/mes, título, pill de categoría, pill "Te pagan"/"Pagas", "Hoy/Hace N días/En N días" · nota · enlace "Fuente"; edición en línea de **fecha** (`datep`, `data-edit="calendario|id|fecha"`) y **monto** (`money`, placeholder "Estimado $X" si hay estimado); bloque de estimado (`calEstHtml`) con botón "Usar este valor" (`calEstUse`) y "Ver detalle"; acciones "Recordar" (solo egresos, `cal2fijo` → crea gasto fijo anual variable con el mismo día y mes, categoría Otros) y eliminar.
- **Estimados `calEst(c)`** (`s_dian.js`): prima = salario/2; intereses de cesantías = salario × 12 %; cesantías = 1 salario; dotación = en especie solo para quien gana ≤ 2 SMMLV; renta = saldo de `calcRenta(año−1)` (o "A favor"); predial = Σ (predial registrado o 0,7 % del avalúo) × % de propiedad (×0,9 si es la fecha con descuento); vehicular = impuesto registrado o tarifa 1,5 % (≤ 60 M), 2,5 % (≤ 135 M), 3,5 % del avalúo (×0,9 con descuento); SOAT = valor de póliza registrado; matrícula = una mensualidad de fijos de colegio/jardín/universidad; arriendo = 5,1 % (IPC 2025) del canon; diciembre = exceso de diciembre del año anterior vs. promedio, o 30 % de media prima.
- Migración de datos de ejemplo al arrancar: asigna `cat` faltante; notas "Fecha de ejemplo" de renta/predial/vehicular se reemplazan por textos 2026 y fuente.
- `HELP.calendario` con 4 pasos.

---

## 6. Integraciones en el servidor (`q_integraciones.js`)

Comunes:
- Requieren servidor conectado; si no: alerta "Primero conecta tu servidor — Las claves de los proveedores se guardan en tu servidor…, nunca en el navegador." con botón a la pestaña Servidor.
- Carga: `GET /api/integrations` → `{integrations:{email?, whatsapp?, ai_anthropic?, ai_openai?, ai_gemini?}}` en `window._INT` (caché en memoria; "Leyendo la configuración de tu servidor…"; error con botón Reintentar `intReload`).
- Cada integración guardada: campos no secretos en claro + `secrets:{campo:'••••1234'}` + `updated`. Pill "<nombre> · guardado <fecha>" o "Sin configurar".
- Campos secretos: input password vacío; placeholder "••••1234 (déjala vacía para conservarla)"; hint "Guardada y cifrada en tu servidor.". Solo se envían si tienen texto.
- **Guardar** (`intSave`): `PUT /api/integrations/:kind` con `{...cfg, secrets:{…}, provider?}`. Valida que todo secreto exista (nuevo o ya guardado del mismo proveedor) → si no, "Falta la clave o contraseña para guardar.". Al guardar email → `canales.emailVia='srv'`; whatsapp → `canales.waVia='api'`. Refresca `/api/health` y la lista.
- **Probar** (`intTest`): `POST /api/integrations/:kind/test {to}`; email usa `canales.emailTo` (o el correo de la cuenta), WhatsApp `canales.waNum`, IA sin destino. Mensajes: IA "La IA respondió correctamente." / "…pero no como esperaba."; otros "Prueba enviada a X. Revisa tu bandeja (y spam) | tu WhatsApp."
- **Quitar** (`intDel`): `DELETE /api/integrations/:kind`.
- Nota: "Se guarda cifrado (AES-256) en tu base de datos. Nadie, ni siquiera desde este navegador, puede volver a ver la clave completa."

### 6.1 Correo (`kind: email`, campo `provider`)
Selector en mosaico (radiogroup; `intPick` guarda un borrador del proveedor; por defecto `resend`; check en el proveedor guardado). Cada uno muestra su ayuda:

| Proveedor | Descripción | Campos (`clave`, etiqueta, placeholder, tipo) | Ayuda |
|---|---|---|---|
| gmail (mail) | Tu cuenta de Gmail o Google Workspace con una contraseña de aplicación. | `user` Tu correo de Gmail (tu@gmail.com, email); `fromName` Nombre que verá quien recibe (Mirai); `appPassword` Contraseña de aplicación (16 letras, **secreto**) | Activar verificación en 2 pasos y crear contraseña de aplicación (myaccount.google.com › Seguridad › Contraseñas de aplicaciones). ~500 correos/día. |
| sendgrid (send) | Servicio de envío de Twilio. Plan gratis con límite diario. | `from` Remitente verificado (`Mirai <avisos@tudominio.com>`); `apiKey` API key (SG.xxxxx, **secreto**) | Settings › API Keys con permiso Mail Send y verificar remitente (Sender Authentication). |
| resend (zap) | Fácil de configurar y muy usado con Vercel. Plan gratis mensual. | `from` Remitente; `apiKey` (re_xxxxx, **secreto**) | resend.com › API Keys y verificar dominio; para probar `onboarding@resend.dev`. |
| smtp (server) | El correo de tu hosting (Hostinger, Zoho, Outlook…) o cualquier SMTP. | `host` Servidor SMTP (smtp.hostinger.com); `port` Puerto (465, número); `secure` Conexión segura (SSL) (bool, activo por defecto); `user` Usuario; `pass` Contraseña (**secreto**); `from` Remitente | Datos en el panel del proveedor. 465 = SSL; 587 = STARTTLS. |

Botones: "Guardar en el servidor", "Enviar correo de prueba" (deshabilitado si no está guardado), "Quitar". `/api/health.emailFrom` = `user` si gmail, si no `from`.

### 6.2 WhatsApp Cloud API (`kind: whatsapp`)
Campos `WAF`: `phoneId` ID del número de teléfono (123456789012345); `template` Nombre de la plantilla aprobada (mirai_resumen); `lang` Idioma de la plantilla (es); `token` Token de acceso permanente (EAAG…, **secreto**).
Ayuda: en developers.facebook.com crear app Business con WhatsApp; en WhatsApp › API Setup copiar el ID del número; crear un usuario del sistema en Business Settings para token permanente; plantilla categoría "Utility" con una variable `{{1}}`.
Botones: Guardar en el servidor, Enviar mensaje de prueba, Quitar.

### 6.3 Claves de IA (`kind: ai_anthropic | ai_openai | ai_gemini`)
Sección "Claves de IA en tu servidor" (solo con servidor): "Recomendado: la clave queda cifrada en el servidor y la IA responde desde allí. Solo necesitas la del proveedor que elegiste arriba."

| kind | Nombre | Placeholder clave | Modelo por defecto (placeholder) |
|---|---|---|---|
| ai_anthropic | Claude (Anthropic) | sk-ant-… | claude-sonnet-4-5 |
| ai_openai | ChatGPT (OpenAI) | sk-… | gpt-4o-mini |
| ai_gemini | Gemini (Google) | AIza… | gemini-2.0-flash |

Campos: `apiKey` (secreto) y `model` "Modelo (opcional)". Botones Guardar / Probar / Quitar. Al guardarse, `/api/health.ai` incluye el proveedor y `aiPick` empieza a usar el servidor.

### 6.4 Inyecciones en Ajustes
- `ajNotif` (fuera de claude.ai): fuerza `emailVia='srv'`, elimina la opción Gmail-MCP, renombra opciones y textos, inserta `intEmailBlock()` y `intWaBlock()` según el canal.
- `sel()` se envuelve fuera de claude.ai para quitar `gmail` de `emailVia`.
- `ajIA` agrega `intAiBlock()`.
- `ajServidor` cambia textos a Vercel + Supabase, placeholder `https://mirai.vercel.app`, nombre del almacenamiento, alerta `ENCRYPTION_KEY` y pasos de instalación.

---

## 7. Recomendaciones para la migración (Next.js + shadcn + Supabase)

1. **Preferencias**: separar `user_preferences` (apariencia, privacidad, inicio, posición del chat, vista del calendario) de `household_settings` (`S.cfg`: finanzas, defaults, categorías, IA, canales, matriz).
2. **IA**: solo en el servidor (Route Handler `/api/ai`) con proveedor elegido y claves cifradas por hogar; quitar `mirai-ia-keys` y las llamadas directas desde el navegador; mantener `modelTier` quick/default y el modo JSON.
3. **Avisos**: mover `notifs()` a una función compartida (servidor + cliente) que lea Supabase; el cron envía según `canales` y `nmat` sin snapshot (o con snapshot recalculado en cada cambio de datos).
4. **Nómina**: portar `dedCalc`, `fspPct` y `retEmpleado` como funciones puras con pruebas unitarias (ejemplos con 1, 4, 16 y 20 SMMLV; quincenal vs. mensual; independiente con IBC mínimo). SMMLV/UVT como tabla por año.
5. **Calendario DIAN**: tabla de datos por año gravable; revisar el hueco 29–30 sep 2026; preparar 2027.
6. **Consejero y chat**: conservar los prompts literales, el respaldo local (`localInterp`, `CONS_RE`), los límites por nivel de exigencia y el formato de resultado en dos pestañas; guardar `consejos` y `chats` en tablas propias (límite 20 consejos).
7. **Integraciones**: mantener contrato `GET/PUT/DELETE /api/integrations/:kind` y `POST …/test`, secretos enmascarados `••••1234`, cifrado AES-256-GCM.
8. **Textos**: todos en español de Colombia; conservar ayudas (`HELP`, `MDESC`, `FHELP`) citadas arriba.

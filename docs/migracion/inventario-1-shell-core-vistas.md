# Inventario 1 — Shell, núcleo y vistas base

> Fuente de verdad para migrar Mirai 4.0 a **Next.js + shadcn/ui + Supabase**.
> Cubre COMPLETOS: `src/a_shell.html`, `src/b_core.js`, `src/c_views.js`, `src/c2_views.js`.
> Cuando una pieza usada aquí vive en otro módulo se indica con **→ módulo** (lo cubren los otros inventarios).
> Fecha del análisis: 2026-10-31. No se modificó código.

---

## 0. Advertencias de migración (leer primero)

1. **Hay vistas de estos archivos que otros módulos reemplazan o envuelven**. Lo que ve el usuario hoy NO es solo lo que está aquí:
   - `V.recordatorios` y `V.calendario` de `c2_views.js` son **reemplazados** por `p_calendario.js` (calendario estilo Google y calendario fiscal con `RENTA26`). Las versiones de aquí son la base lógica (agenda/listas) — migrar la de `p_calendario`.
   - `V.inicio` es **envuelto** por `r_gamif.js` (agrega la franja de logros `g-strip`).
   - `V.renta` (asistente) se reemplaza en `s_dian.js`.
   - `loanDetail` (→ `j_loans.js`) se envuelve para empeños (`prenda`).
2. **El `MENU` final es distinto al literal** de `c_views.js`: `r_gamif.js` agrega `logros` a Planeación y `s_dian.js` quita `renta` de Informes y `calendario` de Agenda, y crea la sección **Impuestos → DIAN**. Ver §4.2 (menú efectivo).
3. **El CSS se escribió en capas que se sobrescriben** (1º estilo "Meta", 2º "Fluent 2", 3º "shadcn sidebar sin header", 4º "v3.9 sin header"). Los valores efectivos son los de la última capa; en §5 se dan los **valores finales** y, entre paréntesis, los antiguos que quedaron pisados.
4. Varias funciones usadas aquí se definen después: `gastosBasicos` (d_app), `isHormiga`/`localHormiga` (e_ai), `tarjetaPagoMes`/`tarjetasDeuda`/`proxDia`/`libroActual`/`defApps`/`helpStrip`/`resumenCard` (f_extra), `dedLine`/`smmlv`/`uvtHoy` (m_nomina), `loanPlanTab`/`loanDetail`/`fondoBlock`/`aporteRow`/`subAv` (j_loans), `addrFields` (i_geo), `PARENT_IC` (o_asesor), `AJTABS`/`ajLayout`/`ajGeneral`/`ajApariencia`/`ajPrivacidad`/`ajIA`/`ajNotif`/`ajServidor` (l_ajustes), `seguridadTab` (g_auth), `SYNC`/`CLOUD`/`view`/`render`/`commit` (d_app).
5. **No hay modales `M.*` definidos en estos 4 archivos**. Aquí solo se *invocan* (con `data-modal`). Lista de modales invocados en §3.21; sus formularios se documentan en los inventarios de `d_app.js`, `h_forms.js`, `j_loans.js`, `o_asesor.js`, etc.
6. Toda la lógica de fechas usa **hora local** y `today()` con horas en 0. Fechas guardadas como `'YYYY-MM-DD'` (string), meses como `'YYYY-MM'`. Al pasar a Postgres usar `date` y cuidar zona horaria (America/Bogota).
7. Moneda: todo se convierte a COP con `S.cfg.trm` (USD/EUR) **manual**. No hay API de TRM.

---

## 1. Modelo de datos

### 1.1 Claves de almacenamiento (`b_core.js`)

| Constante | Clave localStorage | Uso |
|---|---|---|
| `KEY` | `libro-mayor-familiar-v3` | Estado `S` del libro **principal** |
| `LKEY()` | `KEY` si `BOOK==='principal'`, si no `KEY + ':' + BOOK` | Estado por libro (multi-libro) |
| `KEY2` | `libro-mayor-familiar-v2` | Versión anterior (para migrar) |
| `KEY1` | `libro-mayor-familiar-v1` | Versión anterior (para migrar) |
| `KTHEME` | `lmf-tema` | Tema claro/oscuro |
| `KREAD` | `lmf-leidas` | Array de IDs de notificaciones leídas |
| `KNAV` | `lmf-nav` | `{grupoId: bool}` grupos del menú abiertos |
| `KHOME` | `lmf-inicio` | Vista inicial elegida (default `'inicio'`) |
| `KPRIV` | `lmf-privado` | Modo privado (montos borrosos) |
| `KSIDE` | `lmf-menu-contraido` | Sidebar contraído (bool) |

Rutas en la nube de claude.ai (solo dentro de claude.ai): `P_EST()` = `'libro/estado'` (principal) o `'libros/'+BOOK`; `P_G()` = `'gastos'` o `'libros/'+BOOK+'/gastos'` (los gastos se guardan aparte, por mes → d_app).

`store` = wrapper `get(k, d)` (JSON.parse con try/catch, devuelve `d` si no existe) y `set(k, v)` (JSON.stringify, ignora errores).

Otras claves `mirai-*` (otros módulos): `mirai-ui`, `mirai-srv`, `mirai-ia-keys`, `mirai-chat-pos`, `mirai-calp`, `mirai-prov-logos`.

### 1.2 Estado por defecto `defaults()`

```js
{ v: 3, sample: false,
  perfil, cfg, setup,
  tarjetas: [], grupos: [], retos: [], extras: [], kids: {}, resumenes: {}, renta: {}, calIds: {},
  correoIds: [], contactos: [], ingresos: [], activos: [], pasivos: [], cobrar: [], pagar: [],
  inversiones: [], metas: [], fijos: [], suscripciones: [],
  calendario: defCalendar(añoActual), gastos: [], consejos: [] }
// normalize() agrega además: fondo: {saldo:0, mov:[], on:false}
```

#### `perfil`
| Campo | Tipo | Default | Notas |
|---|---|---|---|
| `nombre` | string | `''` | Paso 1 de puesta en marcha se cumple si no está vacío |
| `ciudad` | string | `''` | |
| `ocupacion` | string | `''` | |
| `digitos` | string (2) | `''` | Últimos 2 dígitos de la cédula (fechas DIAN) |
| `riesgo` | enum | `'moderado'` | `conservador` \| `moderado` \| `arriesgado` |
| `meta` | string | `''` | Meta financiera principal |
| `miembros` | array | `[]` | `{id, nombre, rol, cupo:number}` (rol: Titular, Cónyuge, Hija/o… íconos en `PARENT_IC` → o_asesor) |
| `docTipo` | enum (no en defaults) | `'CC'` al mostrar | `CC` \| `CE` \| `PA` |
| `doc` | string (no en defaults) | | Se usa en acuerdos de pago |
| `direccion`… | (no en defaults) | | Campos de `addrFields` → i_geo |

#### `cfg`
| Campo | Tipo | Default | Significado |
|---|---|---|---|
| `umbral` | number | `25000` | Valor máximo de un gasto "hormiga" (COP) |
| `limite` | number | `250000` | Límite mensual de gastos hormiga (alerta) |
| `trm` | `{USD, EUR}` | `{USD:4100, EUR:4450}` | Tasa de cambio manual |
| `pct` | `{n,g,a}` | `{n:50, g:30, a:20}` | Regla 50/30/20 (necesidades/gustos/ahorro) |
| `emergMeta` | number | `6` | Meses de fondo de emergencia |
| `anticipo` | number | `5` | Días de anticipación de avisos |
| `usura` | number | `26` | Tasa de usura % E.A. (manual) |
| `reglas` | array | `[]` | `{k: palabra, cat: nombreCategoria}` |
| `categorias` | array | `defCats()` | `{id, nombre, grupo:'n'|'g'|'a', icon, tope:number}` |
| `catIngreso` | array | `defCatIng()` | `{id, nombre, icon}` |
| `entidades` | array | `defEntidades()` | `{id, nombre, tipo, nit?}` tipo ∈ Banco, Cooperativa, Fintech, Billetera, Fondo, Otro |
| `medios` | array | `defMedios()` | `{id, nombre, icon}` |
| `relaciones` | string[] | `defRel()` | |
| `notif` | obj | `{pagos, cobros, hormiga, presupuesto, inversiones, metas, popup}` todos `true` | Qué notificaciones generar |
| `ia` | obj | `{autocat:true, hormiga:true}` | |
| `apps` | array | `defApps()` (→ f_extra) | Lanzador de apps |
| `corteQ` | number | `15` | Último día de la 1ª quincena (se limita a 1..27) |
| `alertaPres` | number | `100` | % del tope de categoría a partir del cual se avisa |
| `uvt` | `{año: valor}` | `{2025:49799, 2026:52374}` | |
| `smmlv` | `{año: valor}` (no en defaults) | fallback `1750905` | Leído por `smmlv()` → m_nomina |
| `estricto` | enum | `'equilibrado'` | Tono/estrictez del consejero (→ o_asesor) |
| `def` | obj | `{cat:'', medio:'', quien:'familia', sistema:'frances', frec:'mensual', plazo:12}` | Valores por defecto de formularios. `cat:''` = "que se ponga sola" |

`setup`: `{skip: {clavePaso: true}, dismissed: false}`.

#### Listas por defecto

- **`defCats()`** (nombre, grupo, ícono, tope=0): Vivienda n house · Servicios públicos n zap · Mercado n shopping-cart · Transporte n car · Educación n graduation-cap · Salud n heart-pulse · Comisiones bancarias n landmark · Mascotas n dog · Imprevistos n siren · Restaurantes g utensils · Café g coffee · Domicilios g bike · Snacks g cookie · Entretenimiento g film · Suscripciones g repeat · Ropa g shirt · Regalos g gift · Viajes g plane · Ahorro a piggy-bank · Inversión a trending-up · Otros g circle-ellipsis.
- **`defCatIng()`**: Salario briefcase · Honorarios file-text · Arriendos house · Negocio propio store · Intereses y rendimientos percent · Otros ingresos coins.
- **`defEntidades()`**: Bancolombia, Banco de Bogotá, Davivienda, BBVA Colombia, Banco de Occidente, Banco Popular, Scotiabank Colpatria, Banco Caja Social, Banco AV Villas, Banco Agrario (Banco) · Fondo Nacional del Ahorro (Fondo) · Nu Colombia, Lulo Bank (Fintech) · Nequi, Daviplata (Billetera) · Cooperativa de ahorro y crédito (Cooperativa).
- **`defMedios()`**: Efectivo banknote · Tarjeta débito credit-card · Tarjeta de crédito credit-card · Transferencia arrow-left-right · Nequi / Daviplata smartphone.
- **`defRel()`**: Familiar, Amigo, Compañero de trabajo, Cliente, Vecino, Proveedor, Otro.
- **`ICON_CHOICES`** (íconos elegibles para categorías/medios): house, zap, droplets, wifi, shopping-cart, car, bus, fuel, graduation-cap, heart-pulse, landmark, utensils, coffee, bike, cookie, film, tv, shirt, repeat, dog, gift, plane, piggy-bank, trending-up, briefcase, store, baby, dumbbell, smartphone, receipt, banknote, credit-card, coins, percent, file-text, tag, umbrella, sprout, circle-ellipsis.
- **`defCalendar(y)`** (todas `monto:0`):
  | Título | Fecha | Tipo | Nota |
  |---|---|---|---|
  | Intereses sobre cesantías | y-01-31 | ingreso | Tu empleador te los paga a más tardar el 31 de enero. |
  | Consignación de cesantías al fondo | y-02-14 | ingreso | Plazo para que tu empleador consigne las cesantías en tu fondo. |
  | Prima de servicios de junio | y-06-30 | ingreso | Medio salario por semestre trabajado. |
  | Prima de servicios de diciembre | y-12-20 | ingreso | Plazo legal: 20 de diciembre. |
  | Declaración de renta (DIAN) | y-08-20 | egreso | Fecha de ejemplo: ajústala según los dos últimos dígitos de tu cédula en el calendario DIAN del año. |
  | Impuesto predial | y-04-10 | egreso | Fecha de ejemplo: cada municipio publica su calendario. |
  | Impuesto vehicular | y-05-15 | egreso | Fecha de ejemplo: verifica el calendario de tu departamento. |

### 1.3 Forma de cada colección (inferida de defaults, `sample()`, `migrate()` y el uso en vistas)

| Colección | Campos (tipo) | Enumeraciones / notas |
|---|---|---|
| `ingresos[]` | `id`, `concepto` str, `cat` str (nombre de `catIngreso`), `valor` num (valor **por pago**), `frec`, `dia` num, `quien` ('familia' \| id miembro), `moneda`, `bruto?` num, `desc?` (descuentos de nómina → m_nomina) | `frec`: mensual \| quincenal \| semanal \| anual. Si `bruto` existe, la lista muestra pill "neto" y `dedLine()` |
| `gastos[]` | `id`, `fecha` 'YYYY-MM-DD', `desc` str, `cat` str (nombre categoría), `valor` num, `quien`, `medio` str, `fijoId?` (pago de gasto fijo), `per?` (periodo del fijo), `hormiga?` bool, `hormigaSrc?` 'ia' \| 'manual', `hormigaRazon?` str | Un gasto con `fijoId` nunca es hormiga ni muestra el botón de taza |
| `fijos[]` | `id`, `nombre`, `cat`, `valor` (promedio si variable), `frec`, `dia` (1-31), `dia2?` (2ª fecha quincenal, default 30), `mes?` (1-12, para anual), `fecha?` (para único), `inicio?` (no generar periodos antes), `variable` bool, `vmin?`, `vmax?`, `medio`, `proveedor`, `desde` 'YYYY-MM', `pagos[]: {per, fecha, valor, medio?}` | `frec` = claves de `FFREC`: mensual, quincenal, bimestral, trimestral, semestral, anual, unico. `per`: `'YYYY-MM'`, `'YYYY-MM-Q1'`/`'-Q2'`, `'YYYY'` (anual), `'U'` (único) |
| `suscripciones[]` | `id`, `nombre`, `valor`, `ciclo` 'mensual'\|'anual', `proximo` fecha, `moneda`, `comparte?` num (>1 = dividir), `medio?`, `logo?` (dataURL) | |
| `cobrar[]` (me deben) | `id`, `contactoId`, `concepto`, `monto`, `sistema`, `tasa` (% **por mes**), `frec`, `plazo` (n.º cuotas), `inicio` fecha, `pagos[]`, `extra` num | `pagos[]: {id, fecha, tipo:'cuota'|'abono', valor (0 en cuotas: el motor lo calcula), modo?: 'cuota'|'plazo'}` |
| `pagar[]` (le debo) | igual que cobrar pero `acreedor: {kind:'entidad'|'contacto', id}` en vez de `contactoId`; `extra` = seguros/cargos fijos sumados a cada cuota; `prenda?` (empeño → j_loans) | |
| `contactos[]` | `id`, `tipo` 'persona'\|'empresa', `nombre`, `docTipo` (CC, NIT…), `doc`, `telefono`, `email`, `direccion`, `ciudad`, `relacion`, `notas` | |
| `activos[]` | `id`, `cod` (PUC), `nombre`, `valor`, `moneda` | `PUC_A`: 1105 Efectivo (banknote), 1110 Cuenta bancaria (landmark), 1516 Inmueble (house), 1540 Vehículo (car), 1995 Otro bien (tag). **Liquidez = cod que empieza por `11`** |
| `pasivos[]` | igual | `PUC_P`: 2380 Tarjeta de crédito (credit-card), 2381 Deuda informal (hand-coins), 2408 Impuestos por pagar (receipt), 2895 Otra deuda (tag) |
| `inversiones[]` | `id`, `tipo`, `nombre`, `entidad` (id de entidad), `capital`, `tasa` (% E.A.), `inicio`, `dias` (plazo CDT), `ret` (% retención, 4 en CDT), `moneda`, `actual` (valor hoy, para fondo/acciones/cripto/otro) | `tipo`: cdt, ahorro, fondo, acciones, cripto, otro (ver `INVT` §3.13) |
| `metas[]` | `id`, `nombre`, `objetivo`, `ahorrado`, `fecha`, `icon` | |
| `calendario[]` | `id`, `titulo`, `fecha`, `tipo` 'ingreso'\|'egreso', `monto`, `nota` | Se repite cada año (solo importan mes y día) |
| `extras[]` | `fecha`, `desc`, `valor` | Ingresos extra puntuales (→ f_extra) |
| `tarjetas[]` | `id`, `nombre`, `pago` (día), `compras[]` | → f_extra (`compraEstado`) |
| `fondo` | `{saldo, mov[], on}` | Fondo de emergencia separado (→ j_loans `fondoBlock`) |
| `consejos[]`, `retos[]`, `grupos[]`, `kids{}`, `resumenes{mes}`, `renta{}`, `calIds{}`, `correoIds[]` | | Otros módulos (consejero, retos, compartidos, mesadas, resumen IA, renta, Google Calendar, correo) |

### 1.4 `migrate(o)` (v1/v2 → v3)

- Si `o` no es objeto → `defaults()`. Si `o.v===3` → se devuelve tal cual.
- `perfil.ingresos` (v2) → `S.ingresos` con `cat:'Salario'`, `dia:30`, `frec` (default mensual), `quien` (default familia), `moneda` (default COP).
- `cfg`: conserva `umbral`, `limite`, `trm`, `pct`, `emergMeta` (6), `anticipo` (5), `reglas`.
- `o.presupuesto[] {cat, grupo, tope}` → actualiza tope/grupo de la categoría con el mismo nombre (insensible a mayúsculas) o crea una nueva con ícono `tag`.
- Copia directa: `activos, pasivos, inversiones, metas, suscripciones, gastos`.
- `inversiones.tipo`: `'CDT'→'cdt'`, `'Fondo'→'fondo'`, `'Acciones'→'acciones'`, `'Cripto'→'cripto'`, otro → tal cual o `'otro'`.
- `calendario` se copia si trae elementos.
- `o.recordatorios[]` → `fijos[]`: `nombre=titulo`; `cat` por regex: `/arriendo|admin/i`→Vivienda, `/energ|agua|gas|internet|tv/i`→Servicios públicos, `/coleg|pensi/i`→Educación, si no Otros; `frec`: `rec==='anual'`→anual, `'unico'`→unico, otro→mensual; `dia` y `mes` de `fecha`; `variable:false`, `desde: mes actual`, `pagos: []`.
- Préstamos v2 → v3 (`toLoan`): si `L.tipo==='EA'` la tasa se convierte a mensual: `i = ((1+tasa/100)^(1/12) − 1)·100`, redondeada a 4 decimales; si no, se usa tal cual. Se generan `L.pagadas` pagos tipo `cuota` (valor 0) en `inicio + j+1 meses`. Base: `{sistema:'frances', frec:'mensual', extra:0, concepto:''}`.
  - `cobrar`: crea un contacto `persona` con `nombre=L.nombre`, `docTipo:'CC'` → `contactoId`.
  - `pagar`: busca entidad por nombre (insensible a mayúsculas) o la crea con `tipo:'Otro'` → `acreedor:{kind:'entidad', id}`.

### 1.5 `normalize(o)` (siempre se aplica al cargar)

1. `r0 = migrate(o)`; `r = {...defaults(), ...r0}`; `perfil` y `cfg` se mezclan con defaults (1 nivel); `cfg.trm`, `cfg.pct`, `cfg.notif`, `cfg.ia`, `cfg.def` se mezclan campo a campo.
2. Si no son array → default: `cfg.categorias, catIngreso, entidades, medios, relaciones, reglas, apps`.
3. Si no son array → `[]`: `contactos, ingresos, activos, pasivos, cobrar, pagar, inversiones, metas, fijos, suscripciones, calendario, gastos, consejos, tarjetas, grupos, retos, extras, correoIds`.
4. Si no son objeto plano → `{}`: `kids, resumenes, renta, calIds`.
5. `cfg.uvt = {2025:49799, 2026:52374, ...cfg.uvt}`.
6. `perfil.miembros` → array. `setup = {skip:{}, dismissed:false, ...r0.setup}`.
7. `activos/pasivos[].moneda ||= 'COP'`; `gastos[].quien ||= 'familia'`; préstamos: `pagos ||= []`, `extra = +extra || 0`, `frec ||= 'mensual'`, `sistema ||= 'frances'`.
8. `fijos`: `pagos ||= []`, `desde ||= mes actual`; si `variable && !vmin`: `vmin = round(valor·0,85/1000)·1000`, `vmax = round(valor·1,15/1000)·1000`.
9. Si no existe la categoría `Imprevistos` se agrega (`grupo n`, ícono `siren`, tope 0).
10. `fondo` → `{saldo:0, mov:[], on:false}` si falta. `v = 3`.

### 1.6 Datos de ejemplo `sample()` (familia Navarro — lo usan las pruebas)

- Perfil "Alberto Navarro", meta "Fondo de emergencia de 6 meses", miembros: Alberto (Titular, cupo 600.000), Cónyuge (600.000), Hija (150.000).
- Topes: Vivienda 1.700.000 · Servicios 450.000 · Mercado 1.400.000 · Transporte 650.000 · Educación 1.150.000 · Salud 250.000 · Comisiones 40.000 · Restaurantes 350.000 · Café 90.000 · Domicilios 60.000 · Snacks 50.000 · Entretenimiento 150.000 · Suscripciones 120.000 · Ropa 200.000 · Ahorro 1.500.000 · Inversión 800.000.
- Ingresos: Salario titular 4.750.000 quincenal día 15 · Salario cónyuge 4.200.000 mensual día 30 · Arriendo apartaestudio 1.300.000 mensual día 5 (familia).
- Contactos: Andrés Navarro (persona, CC, Familiar, Bogotá) · Muebles Rivera SAS (empresa, NIT, Cliente) · Laura Gómez (persona, Amigo, Chía).
- Cobrar: 4.000.000 francés 1 % mensual 8 cuotas (2 pagadas + abono 500.000 modo cuota hace 10 días) · 2.500.000 sin interés quincenal 5 (2 pagadas) · 1.000.000 simple 2 % 4 cuotas (1 pagada).
- Pagar: Banco de Bogotá vehículo 30.000.000 francés 1,23 % 48 cuotas (14 pagadas, extra 65.000) · Davivienda libre inversión 8.000.000 1,84 % 24 (5 pagadas, extra 12.000).
- Activos: Efectivo 850.000 (1105) · Cuenta ahorros 12.400.000 (1110) · Cuenta en dólares 2.500 USD (1110) · Vehículo 38.000.000 (1540). Pasivo: Tarjeta 2.350.000 (2380).
- Inversiones: CDT 180 días 15.000.000 al 9,8 % ret 4 % (Bancolombia) · Bolsillo Nu 3.000.000 8,25 % · Fondo 5.000.000 valor actual 5.420.000.
- Metas: Viaje a Cartagena 8.000.000/2.600.000 (+8 meses) · Cuota inicial vivienda 60.000.000/14.500.000 (+30 meses).
- Fijos: Arriendo 1.700.000 (pagado mes anterior), Energía variable 186.000 (150–222 mil), Agua bimestral variable 142.000, Internet 129.900, Administración 420.000, Pensión colegio 1.150.000, SOAT anual 1.050.000.
- Suscripciones: Netflix 44.900, Gimnasio 139.000, Almacenamiento en la nube 99,99 USD anual.
- Gastos: 110 hormiga (Café, Domicilios, Snacks, Taxi, Retiro en cajero) cada ~1,6 días + 6 meses de Mercado ×2, Spotify, Restaurante, Gasolina + pago del arriendo vinculado al fijo.
- Reglas: netflix/spotify→Suscripciones, rappi→Domicilios, exito/carulla/d1→Mercado, terpel/uber→Transporte, juan valdez→Café, cuota de manejo→Comisiones bancarias.

---

## 2. Lógica de negocio pura (`b_core.js`)

### 2.1 Utilidades de formato y fecha

| Función | Firma | Comportamiento exacto |
|---|---|---|
| `NF` | `Intl.NumberFormat('es-CO', {maximumFractionDigits:0})` | |
| `$` | `(v) → string` | `n=round(+v||0)`; `'$ '+NF(abs)` con prefijo `'-$ '` si negativo. Ej. `$ 1.234.567` (espacio no separable) |
| `$k` | `(v)` | `|v|≥1e6` → `'$'+(v/1e6 con máx 1 decimal)+' M'`; `≥1e3` → `'$'+round(v/1e3)+' mil'`; si no `$(v)` |
| `fx` | `(v, m)` | COP o vacío → `$(v)`; otra → `'USD 2.500'` (máx 2 decimales) |
| `pct` | `(v, d=1)` | `v·100` con máx `d` decimales + `'%'` (no finito → 0) |
| `uid` | `()` | `Math.random().toString(36).slice(2,10)` (8 chars) → en Supabase usar uuid |
| `esc` | `(s)` | escapa `& < > " '` |
| `MES` / `MESL` | | `['ene'…'dic']` / `['enero'…'diciembre']` |
| `today` | | Fecha local con 00:00:00 |
| `iso(d)` | | `'YYYY-MM-DD'` local |
| `parse(s)` | | `'YYYY-MM-DD'` → Date local; vacío → hoy |
| `addMonths(d,n)` | | Mismo día, recortado al último día del mes destino (31 ene + 1 = 28/29 feb) |
| `addDays`, `days(a,b)` | | `days = round((b−a)/864e5)` |
| `lastDay(y,m)` | | m base 0 |
| `fdate` / `fshort` | | `'5 ene 2026'` / `'5 ene'` |
| `mkey(d)` | | `'YYYY-MM'` |
| `parseMoney(s)` | | Quita todo menos `\d , . -`; si hay coma: puntos = miles, coma = decimal; si no: puntos = miles |
| `parseNum(s)` | | Cambia la primera coma por punto |
| `fmtMoneyInput(v, dec)` | | '' si vacío; con decimales máx 2 o entero con `NF` |
| `initials(n)` | | 2 iniciales en mayúscula o `'?'` |
| `hashC(s)` | | `h=(h*31+charCode)|0`; devuelve `'c'+(|h|%5)` → clase de avatar c0..c4 |
| `relTime(d)` | | `Hoy`, `Mañana`, `Ayer`, `En N días`, `Hace N días` |

### 2.2 Motor de préstamos

**`SISTEMAS`** (nombre simple / técnico / ícono / descripción):
- `frances`: "Cuota fija" / "Sistema francés" / `equal` — "Pagas el mismo valor en cada cuota. Es el que usan los bancos en Colombia para créditos de consumo, libranza y vehículo."
- `aleman`: "Cuota que va bajando" / "Abono fijo a capital (sistema alemán)" / `trending-down` — "Cada cuota abona lo mismo a la deuda y los intereses se calculan sobre lo que falta, así que la cuota empieza alta y baja. Pagas menos intereses en total."
- `simple`: "Interés sobre lo prestado" / "Interés simple" / `percent` — "Muy común entre conocidos ("te presto al 2%"): el interés de cada cuota se calcula sobre el valor prestado y la cuota es fija."
- `americano`: "Solo intereses y al final el capital" / "Sistema americano" / `hourglass` — "Cada periodo se pagan solo los intereses y el valor prestado se devuelve completo en la última cuota."
- `sin`: "Sin intereses" / "Partes iguales" / `hand-coins` — "Se divide el valor en cuotas iguales, sin cobrar intereses."

**`FRECS`** (`n`, `per`, `k` = fracción de mes, `pl`): mensual (Mensual, mes, 1, meses) · quincenal (Quincenal, quincena, 0,5, quincenas) · semanal (Semanal, semana, 12/52, semanas) · diario (Diario, día, 12/365, días) · diariohab (Diario (lunes a sábado), día hábil, 12/313, días hábiles).
**`FMES`** (cuotas por mes): mensual 1, quincenal 2, semanal 52/12, diario 365/12, diariohab 313/12.

```js
function addBiz(d,k){let x=new Date(d),c=0;while(c<k){x=addDays(x,1);if(x.getDay()!==0)c++}return x}  // salta domingos
function periodRate(L){const im=(+L.tasa||0)/100;if(L.sistema==='sin'||!im)return 0;
  const k=FRECS[L.frec]?.k||1;return L.sistema==='simple'?im*k:Math.pow(1+im,k)-1}
const addPeriod=(ini,frec,k)=>frec==='quincenal'?addDays(parse(ini),15*k):frec==='semanal'?addDays(parse(ini),7*k)
  :frec==='diario'?addDays(parse(ini),k):frec==='diariohab'?addBiz(parse(ini),k):addMonths(parse(ini),k);
const annuity=(S,i,n)=>n<=0?S:i===0?S/n:S*i/(1-Math.pow(1+i,-n));
```

> **La tasa `L.tasa` es % mensual.** Para frecuencias distintas se convierte: compuesta `(1+im)^k − 1`; en `simple` lineal `im·k`. Quincenal = cada 15 días exactos (no 15 y 30).

**`engine(L)`** — algoritmo completo (copiado literal):

```js
function engine(L){
  const i=periodRate(L),sys=SISTEMAS[L.sistema]?L.sistema:'frances';
  let S=+L.monto,nRem=+L.plazo,k=0,base=S;let C=annuity(S,i,nRem),capF=S/nRem;const extra=+L.extra||0;
  const next=()=>{if(S<=.5||nRem<=0)return null;let int=0,cap=0;
    if(sys==='frances'){int=S*i;cap=nRem<=1?S:Math.min(Math.max(C-int,0),S)}
    else if(sys==='aleman'){int=S*i;cap=nRem<=1?S:Math.min(capF,S)}
    else if(sys==='americano'){int=S*i;cap=nRem<=1?S:0}
    else if(sys==='simple'){int=base*i;cap=nRem<=1?S:Math.min(capF,S)}
    else{int=0;cap=nRem<=1?S:Math.min(capF,S)}
    return{int,cap,valor:int+cap+extra}};
  const hist=[];let intPag=0,pagado=0;
  const pagos=[...L.pagos].map((p,ix)=>({...p,ix})).sort((a,b)=>a.fecha.localeCompare(b.fecha)||a.ix-b.ix);
  for(const p of pagos){
    if(p.tipo==='cuota'){const q=next();if(!q)continue;S-=q.cap;k++;nRem--;intPag+=q.int;pagado+=q.valor;
      hist.push({id:p.id,tipo:'cuota',n:k,fecha:parse(p.fecha),prog:addPeriod(L.inicio,L.frec,k),valor:q.valor,int:q.int,cap:q.cap,extra,saldo:Math.max(S,0)})}
    else{const v=Math.min(+p.valor||0,S);if(v<=0)continue;S-=v;pagado+=v;
      hist.push({id:p.id,tipo:'abono',fecha:parse(p.fecha),valor:v,int:0,cap:v,extra:0,saldo:Math.max(S,0),modo:p.modo});
      if(S<=.5){S=0;nRem=0;continue}
      if(p.modo==='plazo'&&(sys==='frances'||sys==='aleman'||sys==='simple'||sys==='sin')){
        if(sys==='frances'){nRem=i===0?Math.ceil(S/C):Math.max(1,Math.ceil(-Math.log(1-Math.min(S*i/C,.999999))/Math.log(1+i)))}
        else nRem=Math.max(1,Math.ceil(S/capF-1e-9));
      }else{C=annuity(S,i,nRem);capF=S/nRem;base=S}
      if(sys==='simple')base=S}}
  const plan=[];{const sv={S,nRem,k,C,capF,base};let j=k;while(S>.5&&nRem>0&&plan.length<1200){const q=next();j++;S-=q.cap;nRem--;
    plan.push({n:j,fecha:addPeriod(L.inicio,L.frec,j),valor:q.valor,int:q.int,cap:q.cap,extra,saldo:Math.max(S,0)})}({S,nRem,k,C,capF,base}=sv)}
  const saldo=Math.max(S,0),nx=plan[0]||null,t=today();const mora=nx&&nx.fecha<t?days(nx.fecha,t):0;
  const vencidas=plan.filter(r=>r.fecha<t);
  const intFut=plan.reduce((a,r)=>a+r.int,0),extraFut=plan.reduce((a,r)=>a+r.extra,0);
  return{i,sys,saldo,hist,plan,next:nx,mora,vencidas,k,intPag,pagado,intTotal:intPag+intFut,
    totalPagar:pagado+plan.reduce((a,r)=>a+r.valor,0),done:saldo<=.5,progreso:L.monto?1-saldo/L.monto:1,extraFut}}
```

Puntos clave y casos borde:
- Los pagos tipo **cuota** no guardan valor: el motor calcula interés/capital en el orden de fechas (empate por orden de inserción).
- **Abono** (pago extraordinario a capital): `modo:'plazo'` → recalcula **número de cuotas** manteniendo la cuota (francés: `n = ceil(−ln(1 − S·i/C)/ln(1+i))`, con `S·i/C` limitado a 0,999999; con i=0 `ceil(S/C)`; alemán/simple/sin: `ceil(S/capF − 1e-9)`). `modo:'cuota'` (o sistema americano) → mantiene el plazo y **recalcula la cuota** (`C=annuity(S,i,nRem)`, `capF=S/nRem`, `base=S`).
- En `simple` el interés se calcula sobre `base` (monto inicial, o saldo tras un abono).
- Última cuota (`nRem<=1`) liquida todo el saldo. Saldo ≤ 0,5 se considera pagado.
- `extra` (seguros/cargos) se suma a cada cuota pero no a capital ni a interés.
- `plan` = cuotas futuras (máx 1200). Fechas programadas = `addPeriod(inicio, frec, n)`, **no** la fecha real del pago.
- `mora` = días desde la próxima cuota si ya pasó; `vencidas` = cuotas del plan con fecha < hoy.
- `progreso = 1 − saldo/monto`.

**`previewLoan(p)`** → `{cuota (1ª), cuotaFin (última), total, int, fin (fecha última), ea, plan}`. `ea` (tasa efectiva anual mostrada): `simple` → `tasa·12/100`; resto → `(1+tasa/100)^12 − 1`.

**`rateFromCuota(M, cuota, n, frec)`** → tasa mensual % que produce esa cuota: si `cuota·n ≤ M` devuelve 0; bisección 80 iteraciones en `[0,1]` mensual, `ip=(1+mid)^k−1`, compara `annuity(M,ip,n)` con `cuota`; devuelve `lo·100`.

**`loanName(L, kind)`**: cobrar → nombre del contacto o "Sin contacto"; pagar → contacto (si `acreedor.kind==='contacto'`) o nombre de entidad, o "—".

**`loanStatus(e)`** → `[clasePill, texto, ícono]`: `done` → `['ok','Pagado','circle-check']`; `mora>0` → `['bad','Atrasado N d','circle-alert']`; próxima cuota en ≤ `cfg.anticipo` días → `['warn','Cuota pronto','clock']`; si no `['info','Al día','check']`.

**`loanCal(L)`** → filas `{fecha, valor, paid, n}`: cuotas pagadas (fecha programada `prog`) + plan.

### 2.3 Gastos fijos

`FFREC` (texto): mensual "Cada mes" · quincenal "Cada quincena" · bimestral "Cada dos meses" · trimestral "Cada tres meses" · semestral "Cada seis meses" · anual "Una vez al año" · unico "Una sola vez". `FSTEP`: mensual 1, bimestral 2, trimestral 3, semestral 6, anual 12.

```js
function fijoPeriods(f,y,m){const ld=lastDay(y,m),mk=`${y}-${String(m+1).padStart(2,'0')}`,dd=x=>new Date(y,m,Math.min(x||1,ld));
  if(f.frec==='mensual')return[{per:mk,due:dd(f.dia)}];
  if(f.frec==='quincenal')return[{per:mk+'-Q1',due:dd(f.dia&&f.dia<=15?f.dia:15)},{per:mk+'-Q2',due:dd(f.dia2||30)}];
  if(FSTEP[f.frec]>1&&f.frec!=='anual'){const n=FSTEP[f.frec];const [dy,dm]=(f.desde||mk).split('-').map(Number);
    const diff=(y-dy)*12+(m-(dm-1));return diff>=0&&diff%n===0?[{per:mk,due:dd(f.dia)}]:[]}
  if(f.frec==='anual')return(+f.mes===m+1)?[{per:String(y),due:dd(f.dia)}]:[];
  if(f.frec==='unico'){const d=parse(f.fecha);return d.getFullYear()===y&&d.getMonth()===m?[{per:'U',due:d}]:[]}
  return[]}
```
- Bimestral/trimestral/semestral: la fase la da `desde` (`'YYYY-MM'`): hay periodo solo cuando `(meses desde desde) % n === 0`.
- Día mayor al último del mes se recorta (31 → 28/30).

`fijoStatus(f)`: recorre meses desde `max(1er día de desde, 1er día de hace 3 meses)` hasta `hoy+13 meses`; ignora periodos con `due < f.inicio`; cada periodo `{per, due, pago}` (pago = registro en `f.pagos` con mismo `per`). Devuelve `{periods, venc (sin pago y due<hoy), prox (primer sin pago con due≥hoy), mensual}`.
`fijoProxIso(f)` → iso del primer vencido o del próximo; si no, hoy+10.
`fijoMensual(f)` = quincenal `valor·2`; con FSTEP `valor/FSTEP`; único → 0.

### 2.4 Cálculos generales

```js
const conv=(v,m)=>(+v||0)*(m&&m!=='COP'?(+S.cfg.trm[m]||0):1);
const FREC={mensual:1,quincenal:2,semanal:52/12,anual:1/12};
const ingresoMensual=()=>S.ingresos.reduce((a,x)=>a+conv(x.valor,x.moneda)*(FREC[x.frec]||0),0);
const subMensual=x=>conv(x.valor,x.moneda)*(x.ciclo==='anual'?1/12:1)/(+x.comparte>1?+x.comparte:1);
const liquidez=()=>S.activos.filter(a=>/^11/.test(a.cod)).reduce((s,a)=>s+conv(a.valor,a.moneda),0)
                 +S.inversiones.filter(x=>x.tipo==='ahorro').reduce((a,x)=>a+inv(x).valor,0);
const cuotasMes=kind=>S[kind].reduce((a,L)=>{const e=engine(L);if(e.done||!e.next)return a;return a+e.next.valor*(FMES[L.frec]||1)},0);
const fijosMes=()=>S.fijos.reduce((a,f)=>a+fijoMensual(f),0);
const subsMes=()=>S.suscripciones.reduce((a,s)=>a+subMensual(s),0);
const gastosMesK=k=>S.gastos.filter(g=>g.fecha.startsWith(k));
const fijoCats=()=>new Set(S.fijos.map(f=>String(f.cat).toLowerCase()));
// Presupuesto variable = topes de categorías que no son ahorro, no tienen gasto fijo y no son "Suscripciones"
const variableMes=()=>{const fc=fijoCats();return S.cfg.categorias.filter(c=>c.grupo!=='a'&&!fc.has(c.nombre.toLowerCase())&&c.nombre!=='Suscripciones').reduce((a,c)=>a+ +c.tope,0)};
// Promedio de gasto variable real de los 3 meses anteriores con datos (sin pagos de fijos); si no hay → variableMes()
function gastoVariableReal(){…}
```
- `catOf(n)` busca categoría por nombre (insensible a mayúsculas); `catIcon(n)` → ícono o `'tag'`; `entName(id)` → nombre entidad o "—".
- `gastosBasicos()` (→ d_app) = `fijosMes() + cuotasMes('pagar') + subsMes() + Σ topes de categorías 'n' sin gasto fijo`.

**`inv(x)`** (valor de una inversión hoy; `trans` = días desde `inicio`):
```js
if(x.tipo==='cdt'){const D=+x.dias||0;const bruto=x.capital*(Math.pow(1+x.tasa/100,D/365)-1);const ret=bruto*(+x.ret||0)/100;
  const hoyR=x.capital*(Math.pow(1+x.tasa/100,Math.min(trans,D)/365)-1);const venc=addDays(ini,D);
  return{bruto,ret,neto:bruto-ret,valor:x.capital+hoyR,final:x.capital+bruto-ret,venc,prog:D?Math.min(trans/D,1):1,
    rest:Math.max(days(t,venc),0),ganHoy:hoyR,mes:(bruto-ret)/(D/30.4||1)}}
if(x.tipo==='ahorro'){const g=x.capital*(Math.pow(1+x.tasa/100,trans/365)-1);
  return{bruto:g,ret:0,neto:g,valor:x.capital+g,final:null,venc:null,prog:null,ganHoy:g,mes:x.capital*(Math.pow(1+x.tasa/100,1/12)-1)}}
const v=+x.actual||+x.capital;  // fondo, acciones, cripto, otro
return{bruto:v-x.capital,ret:0,neto:v-x.capital,valor:v,final:null,venc:null,prog:null,ganHoy:v-x.capital,rent:x.capital?v/x.capital-1:0,mes:null}
```

**`totales()`** → `{xc: Σ saldo cobrar, xp: Σ saldo pagar, xi: Σ conv(inv.valor), xt: tarjetasDeuda(), A: activos+xc+xi, P: pasivos+xp+xt, pat: A−P}`.

**`hormigas()`**: `small = gastos.filter(isHormiga)`; `mes` = los del mes actual; `porCat {cat:{n,v}}`; `totalMes`; `meses` = 6 últimos meses `{l: 'ene', v}`; `proy = totalMes / díaDeHoy · díasDelMes`; `anual = proy·12`; `over = proy > cfg.limite`.
`isHormiga(g)` (→ e_ai): con `fijoId` nunca; si `g.hormiga` es bool manda; si no `localHormiga`: no si `valor > umbral·2`; no si la categoría es de ahorro o es Vivienda/Servicios públicos/Educación/Salud; sí si la descripción coincide con palabras clave `HKW`; sí si `valor ≤ umbral` y categoría de grupo 'g'; sí si `valor ≤ umbral` y sin categoría conocida.

**`subOcc(s, a, b)`**: ocurrencias de una suscripción entre `a` y `b` partiendo de `proximo`, paso 1 mes (o 12 si anual), retrocediendo y avanzando.

### 2.5 Quincenas — `quincena(y, m, which)`

- `cq = min(max(corteQ||15, 1), 27)`. `which`: `'q1'` → del 1 al `cq`; `'q2'` → `cq+1` al último día; cualquier otro (p. ej. `'mes'`) → mes completo.
- **Entradas (`ent`)**: ingresos mensuales en `min(dia||30, últimoDía)`; quincenales el 15 y el último día (cada uno por `valor`); semanales: cuenta los **viernes** del rango × valor; cuotas de `cobrar` (con `paid`); calendario tipo ingreso con monto>0 (se proyecta al año `y`); `extras` (paid).
- **Salidas (`sal`)**: gastos fijos del mes (valor pagado si hay pago, si no el valor); cuotas de `pagar`; suscripciones (`subOcc`); calendario egreso con monto; tarjetas (pago mínimo `tarjetaPagoMes` el día `t.pago||15`); **"Gasto variable estimado"** = `variableMes()` (mes completo) o la mitad (quincena), fecha = fin del rango, subtítulo "Mercado, transporte, gustos… según tu presupuesto".
- Devuelve `{a, b, ent, sal, E, Sa, disp: E−Sa}` (listas ordenadas por fecha). Cada ítem `{icon, n, s, v, fecha, paid?}`.

### 2.6 Agenda y notificaciones

**`agenda()`** (A = `cfg.anticipo||5`), ítems `{k, id, per?, icon, titulo, sub, monto, fecha, dir:'pagar'|'cobrar', go}`:
- Fijos: todos los vencidos + el próximo si es ≤ 45 días (`go:'fijos'`).
- Pagar: hasta 3 vencidas (o la próxima); si hay vencidas y la próxima es futura también se agrega (`'Cuota N · Nombre'`, `go:'le-debo'`).
- Cobrar: la próxima (`'Cobrar cuota N · Nombre'`, `dir:'cobrar'`, `go:'me-deben'`).
- Tarjetas con pago mínimo > 0 en `proxDia(pago)` (`go:'tarjetas'`).
- Suscripciones en `proximo` (`go:'suscripciones'`).
- Calendario: fecha de este año (o del siguiente si ya pasó) si ≤ 45 días (`go:'calendario'`).
- Se agrega `d` = días hasta la fecha, `st` = `bad` (<0) / `warn` (≤A) / `ok`, `lbl = relTime`. Orden por fecha.

**`notifs()`** (respeta `cfg.notif.*`), cada una `{id, lvl:'bad'|'warn'|'info', icon, bg, t, b, fecha, go}`; orden `bad, warn, info, ok` y luego fecha:
| Origen | id | Condición | Título / cuerpo |
|---|---|---|---|
| cobro atrasado | `c:{id}:{fecha}` | `notif.cobros`, d<0 | "La cuota N · X está atrasada" / "Debían pagarte $ … hace N días." (bg `b-red`) |
| cobro próximo | idem | d≤A | título agenda / "Te deben pagar $ … en N días." (`b-green`, info) |
| pago vencido | `p:{k}:{id}:{fecha}` | `notif.pagos`, d<0 | "Pago vencido: X" / "$ … · venció hace N días." (`b-red`) |
| pago próximo | idem | d≤A | "Mañana: X" / "Ten listos $ …." (`b-amber`, warn) |
| hormiga | `h:{YYYY-MM}` | `notif.hormiga` y `over` | "Los gastos hormiga se están saliendo de control" / "Vas camino a $X este mes y tu límite es $Y." |
| presupuesto | `b:{catId}:{YYYY-MM}` | `notif.presupuesto`, categoría con tope, no ahorro, gastado ≥ tope·alertaPres/100 | "Te pasaste del presupuesto en X" o "Vas en el N% del presupuesto de X" / "Llevas $ de $." |
| inversión | `i:{id}` | `notif.inversiones`, vence en 0..10 días | "Tu X vence en N días" / "Recibirás cerca de $ …. Decide si lo renuevas." (`b-teal`) |
| meta | `m:{id}` | `notif.metas`, vence en 0..30 días y no cumplida | "Tu meta "X" vence pronto" / "Te faltan $ y quedan N días." (`b-violet`) |

Leídas: `localStorage[lmf-leidas]` (array de ids). Contador no leídas en sidebar ("9+" si >9).

### 2.7 Indicadores de salud financiera — `indicadores()`

Variables: `ing = ingresoMensual()`, `cuo = cuotasMes('pagar')`, mes previo `gPrev`, mes actual `gCur`. `gReal = Σ gPrev sin fijoId + fijosMes() + cuo + subsMes()`; `bas = gastosBasicos()`; `liq = liquidez()`.
Disponibilidad de datos: `hayIng = ing>0`; `hayGastosPrev = gPrev.length≥5 || (hay fijos && gPrev.length>0)`; `hayLiq` = activo 11xx o inversión 'ahorro'; `hayAct` = algún activo o inversión; `hayGastosCur`.
Cada indicador `{k, v, r, st, meta, d, max, icon, ok, falta[], go}` (ok = todos los requisitos cumplidos):

| # | Pregunta (k) | Fórmula `r` | ok / warn / bad | meta | max | Requiere |
|---|---|---|---|---|---|---|
| 1 | ¿Cuánto de tu sueldo se va en deudas? | `cuo/ing` | ≤0,3 / ≤0,4 / > | "Lo sano es menos del 30%" | 0,6 | ingresos |
| 2 | ¿Cuánto logras ahorrar? | `(ing−gReal)/ing` | ≥0,2 / ≥0,1 / < | "Lo ideal es guardar 20% o más" | 0,4 | ingresos + gastos mes anterior (≥5) |
| 3 | Si dejaras de recibir ingresos, ¿cuánto aguantas? | `liq/bas` (meses, 1 decimal) | ≥emergMeta / ≥3 / < | "La meta es N meses" | `max(emergMeta·1,5, 1)` | cuentas/efectivo + gastos fijos o presupuesto de necesidades |
| 4 | ¿Qué parte de lo que tienes es deuda? | `P/A` | <0,4 / <0,6 / ≥ | "Lo sano es menos del 40%" | 1 | bienes |
| 5 | Gastos hormiga | `H.proy/ing` | <0,03 / <0,06 / ≥ | "Menos del 3% del ingreso" | 0,1 | ingresos + gastos del mes |
| 6 | Dinero libre cada mes | `ing−gReal` ($) | >15 % ing / >0 / ≤0 | "Lo que sobra después de todos tus gastos" | `max(ing·0,4,1)` | ingresos + gastos mes anterior |

Textos `d` dinámicos (ej. "Pagas $X en cuotas al mes de un ingreso de $Y." / "No tienes deudas registradas en Le debo.").

### 2.8 Flujo de caja 12 meses — `flujo()`

Saldo inicial = `liquidez()`. Para cada mes k=0..11 (`a` 1er día, `b` último):
- `ing` = Σ ingresos `valor·FREC` (**los anuales cuentan 0**) + calendario ingreso con monto en ese mes (por mes, sin importar año) + `extras` de ese mes.
- `cob` = cuotas del plan de `cobrar` en el mes.
- `cuo` = cuotas del plan de `pagar` en el mes; **en k=0 también las vencidas** (fecha < a) + Σ `tarjetaPagoMes(t, k)`.
- `fij` = fijos con periodo en el mes **sin pago registrado** + calendario egreso con monto.
- `sub` = ocurrencias de suscripciones × valor.
- `var` = `variableMes()`.
- `I = ing+cob`, `E = cuo+fij+sub+var`, `saldo += I−E`. Etiqueta `l` = 'ene' (+ ' 26' si es enero o el primer mes).

### 2.9 Otros cálculos en vistas

- **`detectSubs()`** (suscripciones sugeridas): agrupa gastos sin `fijoId` por descripción normalizada (minúsculas, trim); requiere ≥3 meses distintos, todos los valores a ±15 % de la mediana, no más de 1,5 cobros por mes, y que el nombre no coincida (contiene/está contenido) con una suscripción existente. Devuelve `{desc, valor: mediana, meses, cat}`.
- **Importar CSV**: `pnum(s)` (detecta separador decimal: si hay coma y punto, el último es el decimal; solo coma con 1–2 decimales → decimal, si no miles; solo puntos con grupos de 3 → miles), `pdate(s)` (`YYYY-MM-DD`/`YYYY/MM/DD` o `dd/mm/aa(aa)` con `/ - .`; año de 2 dígitos → 20xx), `classify(desc)` (primera regla cuya palabra esté contenida; si no `'Otros'`), `parseCSV(txt)`: separador `;` si tiene ≥ comas, si no tab, si no `,`; soporta comillas; encabezados: fecha `/fecha|date/`, desc `/desc|concepto|detalle|referencia|movimiento/`, valor `/valor|monto|importe|d[eé]bito|amount/`; sin encabezado si la 1ª celda es fecha (desc = col 1, valor = última). Filas con fecha o valor inválido se cuentan como `skipped`. `incl = valor<0` (débitos); si no hay negativos, todas incluidas; luego `valor = |valor|`. Errores: "El archivo está vacío." / "No encontré columnas de fecha, descripción y valor. Usa un encabezado como: Fecha;Descripción;Valor".
- **Simulador de deudas `sim(extra, order, roll=true)`**:
  ```js
  const D=S.pagar.map(L=>{const e=engine(L);return{n:loanName(L,'pagar')+(L.concepto?' · '+L.concepto:''),s:e.saldo,i:e.i,c:e.next?e.next.valor-(+L.extra||0):0}}).filter(d=>d.s>1);
  const budget=D.reduce((a,d)=>a+d.c,0)+extra; // mes a mes (máx 600): interés s+=s·i; paga cuota mínima c; el sobrante (avl) va en el orden `order` (roll)
  // pay[n] = mes en que se termina cada deuda; devuelve {m, ti (intereses totales), pay, ord}
  ```
  Base = `sim(0, ()=>0, false)`; **Avalancha** = orden por tasa desc; **Bola de nieve** = orden por saldo asc. Recomendado = el de menor interés total.
- **Simulador de abono**: clona el crédito y agrega un abono `{id:'sim', fecha:hoy, tipo:'abono', valor, modo}`; compara saldo, n.º de cuotas restantes, valor de cuota y `intTotal`.
- **Simulador CDT** (`ISIM = {c:10.000.000, t:9,5, d:360}`): `sb = c·((1+t/100)^(d/365) − 1)`, `sr = sb·0,04`; recibe `c + sb − sr`.
- **Metas**: `meses = max(1, (añoMeta−añoHoy)·12 + mesMeta − mesHoy)`; "Guarda al mes" = `falta/meses`; aporte sugerido = `ceil(falta/meses/1000)·1000`.
- **Fondo de emergencia**: objetivo = `gastosBasicos()·emergMeta`; tienes = `fondo.saldo` si `fondo.on`, si no `liquidez()`.
- **Presupuesto por grupo**: ideal = `ing·pct/100`; real = Σ gastos del mes en categorías del grupo (ahorro usa Σ topes "Planeado"). Estado: ahorro `tope≥ideal` ok si no warn; otros `r≤ideal` ok, `≤1,1·ideal` warn, si no bad. Por categoría: uso `u = real/tope`: ahorro → "Ahorro" (vio); sin tope → "Sin tope"; `u≤0,8` "Bien"; `≤1` "Cerca del tope"; si no "Te pasaste". Color de barra: >1 rojo, >0,8 `#E08A00`, si no `--blue`.
- **Por miembro**: gasto del mes por `quien`; aporte = Σ ingresos del miembro (mensualizados); gastos compartidos (`quien==='familia'`) repartidos proporcional al aporte. Estado cupo: ≤0,8 ok, ≤1 warn, bad.
- **Puntaje salud**: solo si ≥4 de 6 indicadores disponibles: `sc = round(promedio(ok 100, warn 60, bad 20))`; ≥80 "Muy sana" (thumbs-up), ≥55 "Hay cosas por mejorar" (triangle-alert), si no "Necesita atención" (circle-alert). `comp` = disponibles/6.
- **`reportData(k)`**: `grp {n,g,a,x}` gasto del mes por grupo de categoría (x = sin categoría); `res = ing − cuo − sub − gas`; `cats` ordenadas desc.

---

## 3. Vistas (`V.*`) y componentes

Ruta = `location.hash` (`#gastos`). `view()` (→ d_app) devuelve el hash si existe `V[hash]`, si no la vista de inicio guardada (`lmf-inicio`) o `inicio`. Cada vista es `() => string HTML`.

### 3.0 Helpers de UI (`c_views.js`) — equivalentes shadcn

| Helper | Firma | HTML / comportamiento | Equivalente sugerido |
|---|---|---|---|
| `sel(name, opts, val, o)` | opts `{v, l, icon?, ib?, h?}`; o `{search, create, id, attrs, req, ph}` | `.ui-sel` con input hidden + botón `.ui-trigger`; buscador si `o.search` o >8 opciones; `data-create` = 'cat' o tipo para "crear nueva" en el pie del popover; placeholder "Selecciona…" | `Combobox` (Popover + Command) |
| `datep(name, val, o)` | | `.ui-date` + ícono calendar, texto `fdate` o "Elige una fecha" | `DatePicker` |
| `money(name, val, o)` | o `{dec, cur, ph, req, attrs}` | `.ui-money` con prefijo `$`, `inputmode numeric/decimal`, formateo `es-CO` en vivo | Input con máscara |
| `txt`, `num` | | `input.inp`; `num` con `inputmode=decimal` y `data-num` | `Input` |
| `tip(t)` | | `span.tip` "?" con `data-tip` (luego reemplazado por `.finfo` (i) y `#ftip` → h_forms) | `Tooltip` |
| `field(label, ctrl, {tip, hint, cls, show})` | | `.f` > label (+tip) + control + `.hint`; `data-show` para mostrar condicional | `FormItem` |
| `pick(name, items, val, cls='choice')` | items `{v, l, d?, icon?, ib?, iso?, rec?}` | Tarjetas seleccionables `.choice` (con pill "Recomendado") o botones planos en `.seg` | `RadioGroup` tipo cards / `ToggleGroup` |
| `chips(name, vals, cur, fmt)` | | `.chips > .chip.on` | `ToggleGroup` |
| `kpi(icon, tono, label, valor, sub, clsValor)` | | `.card.kpi` con `.ki` (ícono en círculo tono `t-*`), `.kl`, `.kv`, `.ks` | Card KPI |
| `bar(label, v, max, color, valTexto, icon)` | | Barra horizontal con `.track > i` ancho `min(max(v,0)/max,1)` | `Progress` |
| `av(nombre, cls)` | | Avatar con iniciales y degradado `c0..c4` por hash | `Avatar` |
| `alertBox(lvl, icon, t, b)` | lvl ok/warn/bad/info | `.alert.{lvl}` | `Alert` |
| `stPill([cls, txt])`, `dateBox(d)` | | Pill de estado; caja de fecha "MES / día" | `Badge` |
| `empty(icon, texto, btn)` | | Estado vacío; usa isotipo de 72 px si `EMISO[icon]` existe | Empty state |
| `pageH(icon, bg, t, p, act)` | | Encabezado de página: isotipo 56 px de la vista (o ícono sobre fondo `b-*`), h1, descripción, botón **"Cómo funciona"** (`data-act="help"`) + acciones; luego `sampleBar()` y `helpStrip(view)` (→ f_extra) | `PageHeader` |
| `sampleBar()` | | Si `S.sample`: alerta info "Estás viendo datos de ejemplo — Las cifras son ilustrativas y no se guardan. Empieza tu libro en blanco o usa el ejemplo como punto de partida." Botones `keep` "Usar como base" y `blank` "Empezar en blanco" | Banner |
| `quienOpts()` | | `[{familia, 'Toda la familia', users}, ...miembros (user)]` |
| `quienName(id)` | | 'Familia' o nombre o '—' |
| `catOpts()` | | categorías con `h` = Necesidad/Gusto/Ahorro |
| `medioOpts()`, `monOpts()` | | COP "Pesos (COP)", USD "Dólares (USD)", EUR "Euros (EUR)" |
| `contactOpts()` | | ícono building-2/user-round, `h` = relación · teléfono |
| `entOpts()` | | ícono landmark, `h` = tipo · NIT |

`OPTS = {p:{}, m:{}, x:{}}` registro de opciones por ámbito (página/modal/popover); `regOpts` genera clave `SCOPE+n`.
`EMISO` (ícono → isotipo para estados vacíos): receipt→gastos, house→fijos, repeat→suscripciones, hand-coins/handshake→me-deben, landmark→le-debo, users→contactos, target→metas, trending-up→inversiones, briefcase→ingresos, credit-card→tarjetas, split→compartidos, baby→mesadas, calendar→calendario, gauge→indicadores, bell→recordatorios, message-circle-question/lightbulb→consejero, circle-check/party-popper→retos.

Isotipos disponibles en `iso/iso.json` (`icons`): ajustes, balance, calendario, compartidos, consejero, contactos, contador, correo, estrategia, familia, fijos, flujo, gastos, importar, indicadores, ingresos, inicio, inversiones, le-debo, logros, me-deben, mesadas, metas, mirai, perfil, presupuesto, primas, puesta, recordatorios, renta, reportes, retos, suscripciones, tarjetas.

### 3.1 `V.puesta` — Puesta en marcha (onboarding)

`SETUP` (9 pasos, en orden; `act` = `go:vista` o `modal:tipo[:kind]`; isotipo por `SISO`):

| k | Título | Descripción | Hecho si | Acción / botón | Omitir |
|---|---|---|---|---|---|
| perfil | Cuéntanos quién eres | Tu nombre y, si quieres, los integrantes de tu familia. Así personalizamos el libro y el presupuesto por miembro. | `perfil.nombre` | go:perfil "Completar perfil" | — |
| ingresos | Registra tus ingresos | Tu salario, honorarios o arriendos, y cada cuánto te pagan. Es lo más importante: sin esto no podemos decirte cuánto te queda ni si te alcanza para algo. | ingresos>0 | modal:ingreso "Agregar ingreso" | — |
| cuentas | Agrega tus cuentas y efectivo | Cuánto tienes hoy en el banco, en Nequi o en efectivo. Sirve para calcular tu colchón de emergencia y tu patrimonio. | activo 11xx | modal:activo "Agregar cuenta" | — |
| fijos | Anota tus gastos fijos | Arriendo, servicios, administración, colegio… Te avisaremos antes de cada fecha de pago. | fijos>0 | modal:fijo "Agregar gasto fijo" | "No tengo gastos fijos" |
| deudas | Registra tus deudas y créditos | Créditos con bancos, tarjetas o plata que le debes a alguien. Verás cuánto te falta y cuándo pagar. | pagar>0 | modal:loan:pagar "Agregar deuda" | "No tengo deudas" |
| prestamos | ¿Le prestaste plata a alguien? | Registra a quién y cómo te va a pagar, para que no se te olvide cobrar. | cobrar>0 | modal:loan:cobrar "Registrar préstamo" | "Nadie me debe" |
| presupuesto | Ponle tope a tus gastos | Escribe cuánto quieres gastar como máximo en mercado, transporte, restaurantes… Te avisamos si te acercas al límite. | alguna categoría con tope>0 | go:presupuesto "Definir presupuesto" | "Lo hago después" |
| gasto | Registra tu primer gasto | Escribe en qué gastaste y la categoría se pone sola. Hazlo cada día: toma segundos y es lo que hace funcionar todo. | gastos>0 | modal:gasto "Registrar gasto" | — |
| meta | Crea una meta de ahorro | Un viaje, la cuota inicial de la casa o tu fondo de emergencia. Te decimos cuánto guardar cada mes. | metas>0 | modal:meta "Crear meta" | "Ahora no" |

- `setupProgress()` → `{st (con ok y skipped), done (ok u omitidos), total 9, next}`. `setupDone()` = `S.sample` o todos hechos o `setup.dismissed`. El ítem de menú "Puesta en marcha" solo aparece si `!setupDone()` y muestra badge `done/total`.
- UI: banner con degradado `120deg #1F2B4B → #2C4A3A 60% → #3F7A1E`, isotipo `mirai` en cuadro blanco de 72 px, título "¡Bienvenido a Mirai, {nombre}! Organicemos tus finanzas" (si 0 hechos) o "Vas muy bien, {nombre}", texto "Sigue estos pasos en orden. Cada uno toma un par de minutos y le enseña al libro lo que necesita para avisarte, aconsejarte y mostrarte números exactos.", contador "N de 9" con barra lima `#9EDB4E` "pasos completados".
- Tarjeta "SIGUIENTE PASO" (ai-card) con botón grande; o, si todo listo, vacío `party-popper`: "¡Listo! Tu libro está configurado. Desde ahora te avisaremos de pagos y te ayudaremos a decidir antes de gastar." + `setupFinish` "Ir al inicio".
- Lista de pasos: isotipo 44 px con check verde (`.step-ok`) si hecho; pills "Hecho"/"Omitido"; botones: hecho → "Agregar más"; pendiente → botón (pri si es el siguiente, si no soft) + `setupSkip` (texto de omitir) o `setupUnskip` "Deshacer".
- Pie: "¿Quieres ver primero cómo se ve un libro lleno? Puedes cargar datos de ejemplo y volver a empezar cuando quieras desde Ajustes." + `loadsample` "Ver un ejemplo" + `setupDismiss` "Ocultar esta guía".

### 3.2 `V.inicio` — Inicio (envuelto por r_gamif)

1. `sampleBar()` + banner de puesta en marcha si no terminó ("Completa la puesta en marcha (N de 9)", "Siguiente: …", barra lima, botón "Continuar" → puesta).
2. **Compositor en lenguaje natural** (`form data-form="nl"`, campo `texto`): avatar + input placeholder `Escribe lo que pasó, {nombre}: "gasté 15 mil en almuerzo ayer"`, botón IA "Registrar" (sparkles). Nota: "La IA entiende frases como "pagué 120 mil de la luz" o "me pagaron 300 mil por un trabajo"." Accesos rápidos (`.quick`): Gasto (modal gasto), Presté dinero (modal loan cobrar), Gasto fijo (modal fijo), ¿Me alcanza? (→ consejero), cada uno con isotipo 26 px.
3. **KPIs (g4)**: "Lo que tienes menos lo que debes" = patrimonio (sub "Patrimonio neto", rojo si <0) · "Te queda esta quincena" = `q.disp` (sub "Entra $k · sale $k"; tono verde/rojo) · "Cuotas de deudas al mes" = `cuotasMes('pagar')` (sub "Te deben $k en total") · "Gastos hormiga este mes" (sub "Por encima de tu límite"/"Dentro de tu límite", ámbar si over).
4. **g21**: Tarjeta "Primera/Segunda quincena de {mes}" (según `día ≤ corteQ`) con enlace "Ver detalle" (`data-act="balq"`), cuenta T Entra/Sale (máx 5 por lado, check si pagado, "y N más…"), banda "Te sobra / Te falta" (fondo verde o rojo suave). Columna derecha: ai-card "Consejero antes de gastar" (isotipo consejero, texto "¿Vas a comprar algo, prestar plata o sacar un crédito? Cuéntame el valor y te digo si te alcanza, con base en tus ingresos y gastos.", botón "Preguntar al consejero") + tarjeta **Avisos** (4 primeras `notifs()`, botón "Ver todos" → `bell`; vacío "Todo al día. No tienes avisos.").
5. **g3**: "Próximos 15 días" (agenda con d≤15, máx 6, `agRow`; vacío "Nada pendiente en los próximos 15 días.") · "Metas" (barras navy `#1F2B4B` con % ; vacío "Aún no tienes metas.") + "Gasto hormiga" (gráfico SVG 300×96 de 6 barras, mes actual en `#F7B928`, resto `--line-2`) · "Préstamos" (barra de progreso por préstamo con pill "me debe" verde `#3F7A1E` / "le debo" rojo `#E41E3F`; vacío "Sin préstamos registrados.").

`agRow(x)`: `dateBox` + título + "sub · pill(relTime)" + monto (`+` y verde si cobrar) + botón: fijo → "Pagar" (modal `pagarFijo` id+per); pagar/cobrar → "Pagar"/"Cobrar" (modal `pago` kind+id); sub → "Pagada" (`subdone`).

### 3.3 `V.balance` — Balance y quincenas

Estado `BAL = {tab:'general', y, m}`. Pestañas: `general` "Lo que tengo y lo que debo" (scale) · `q1` "1ª quincena" · `q2` "2ª quincena" (calendar) · `mes` "Mes completo" (calendar-days). Acción `baltab` (data-t).
- **General** (cuenta T): Activos ("Lo que tengo · ACTIVOS · DEBE") = activos + línea calculada "Inversiones" (link Inversiones) + "Lo que me deben" (link Me deben). Pasivos ("Lo que debo · PASIVOS · HABER") = pasivos + "Créditos y préstamos" (link Le debo). Cada línea: ícono PUC, nombre, subtítulo ("Se calcula solo desde X" / "USD 2.500 × $4.100" / "PUC 1110"), valor COP, botón eliminar (`del` col activos/pasivos) salvo las calculadas. Totales; banda "Patrimonio — Lo que tengo − lo que debo". Nota: "Tus gastos del mes (arriendo, mercado, servicios) no van aquí: regístralos en Gastos fijos o Gastos. Aquí solo van bienes que tienes y deudas que debes." Vacíos: "Agrega tus cuentas, efectivo y bienes." / "Sin deudas registradas."
- **Quincenas/mes**: navegador de mes (`balm` data-d ±1), "Del X al Y"; KPIs Entra / Sale / "Te sobra|Te falta" ("Disponible del periodo"); cuenta T Entradas (DEBE) / Salidas (HABER) con pill "Hecho" si pagado. Vacío entradas: "Sin entradas. Registra tus ingresos en Mi dinero › Ingresos."
- Header: "Balance y quincenas" — "Mira lo que tienes y lo que debes, o cuánto entra y sale en cada quincena del mes." Botón (solo en general) "Agregar cuenta o bien" → modal `activo`.

### 3.4 `V.ingresos`

Header "Ingresos" — "Tu salario, honorarios, arriendos y cualquier dinero que recibas con regularidad." Botón "Agregar ingreso" (modal `ingreso`).
KPIs: "Ingreso mensual" (`ingresoMensual`, sub "N fuentes") · "1ª quincena (1–corteQ)" · "2ª quincena (corteQ+1–fin)" (Σ entradas con ícono briefcase de `quincena`).
Lista: ícono de su tipo de ingreso, concepto (+pill "neto" si `bruto`), "Cat · frecuencia · quién" (mensual "Cada mes el día N", quincenal "Cada quincena (15 y 30)", semanal "Cada semana", anual "Una vez al año"), `dedLine(x)`, valor `fx`, editar (modal `ingreso` data-id) / eliminar (`del` col ingresos). Vacío: "Aún no registras ingresos." + "Agregar el primero".

### 3.5 `V.gastos` — Gastos y hormiga

Estado `GMES` (mes elegido, default actual). Header "Gastos y hormiga" — "Todo lo que gastas. La IA detecta los gastos "hormiga": pequeños, frecuentes y evitables, que juntos suman mucho. También puedes marcarlos tú con el ícono de la taza." Botones: "Foto de factura" (modal gasto `data-foto=1`), "Revisar hormiga con IA" (`reviewH`), "Registrar gasto" (modal gasto).
- Tarjeta "Gastos hormiga de este mes" + pill "Sobre el límite"/"En rango"; métricas Llevas / Proyección del mes / En un año; barras por categoría (`×n`, color `#F7B928`).
- Alertas: si over: "Vas camino a gastar $X en gastos hormiga este mes" / "Tu límite es $Y. En un año serían $Z."; por cada categoría con ≥6 compras: "{cat}: N compras este mes" / "Suman $X. Al año serían unos $(v/día·30·12)."; si ninguna: ok "Sin alertas — Tus gastos pequeños están bajo control."
- "Movimientos": conteo y total, selector de mes (12 últimos, `data-ui="gmes"`); agrupado por día (encabezado "Hoy · " / "Ayer · " + fecha); fila: ícono categoría (ámbar si hormiga), desc, "cat · quién · medio", pill "hormiga" (con ícono sparkles si IA, pencil si manual, `title` = razón), pill "fijo"; valor; botón taza `toggleH` (no en fijos; color `#D98300` si marcado; title "Quitar de hormiga"/"Marcar como hormiga"); eliminar. Vacío "No hay gastos en este mes."

### 3.6 `V.fijos` — Gastos fijos

Header "Gastos fijos" — "Arriendo, servicios, administración, colegio… lo que pagas cada mes. Te avisamos antes de cada fecha y, al pagar, queda registrado en tus gastos." Botón "Agregar gasto fijo".
KPIs: "Total al mes" (`fijosMes`) · "Falta pagar este mes" (periodos sin pago con due en el mes; sub "Ya pagaste $X") · "Vencidos" (n.º; "Págalos cuanto antes" / "Todo al día").
Fila: ícono categoría, nombre (+ pill "varía según consumo"), "cat · FFREC · próximo: fecha (1ª/2ª quinc.) · proveedor · pill estado" (estado: "Vencido hace N días" bad; próximo ≤anticipo warn; si no gray relTime; sin periodos "Al día"); valor o rango `vmin – vmax` + "promedio $"; botones "Pagar" (pri si vencido; modal `pagarFijo` id+per), editar, eliminar. Vacío: "Aún no tienes gastos fijos. Empieza por el arriendo y los servicios."
Tarjeta "Pagos registrados este mes": "Pagado el fecha · medio", valor, `unpayfijo` "Deshacer". Vacío "Aún no registras pagos este mes."

### 3.7 `V.suscripciones`

Header "Suscripciones" — "Streaming, apps, gimnasio y servicios que se cobran solos. Las que encontramos repetidas en tus gastos aparecen como sugerencia." Botón "Agregar" (modal `sub`).
KPIs: "Te cuestan al mes" (`subsMes`, "N activas") · "En un año" (×12, "Si no cancelas ninguna") · "Detectadas en tus gastos" (`detectSubs().length`, "Cobros que se repiten").
"¿Las sigues usando?": sugerencias "Se repite en N meses · cat", valor, `addsub` (data-i) "Agregar".
Lista: `subAv(nombre, logo)` (→ j_loans), nombre + pill "compartida entre N", "Mensual/Anual · próximo cobro fecha · medio · tu parte: $ al año", valor `fx`, eliminar. Vacío "Sin suscripciones registradas."

### 3.8 `V.importar` — Importar extractos

Estado `IMP = {txt, rows[], skipped, err, ai: 'pensando'|'ok'}`. Header "Importar extractos" — "Descarga el extracto de tu banca en línea en formato CSV y súbelo aquí. Los débitos se vuelven gastos y se clasifican solos con tus reglas."
- Subir archivo (`#impFile`, `.csv,.txt,text/csv`), "Probar con un extracto de ejemplo" (`impsample`, usa `SAMPLE_CSV` con 8 movimientos: COMPRA EXITO CALLE 80 −245.300, RAPPI*RESTAURANTE −38.900, PAGO NOMINA 4.750.000, JUAN VALDEZ CAFE −9.800, UBER TRIP −17.400, TERPEL EDS −160.000, CUOTA DE MANEJO −14.900, FARMACIA −52.000), textarea "O pega aquí el contenido" (hint "Separador ; o , · fechas dd/mm/aaaa · valores como 1.234.567,89 o -45000"), "Leer movimientos" (`impparse`).
- Error: alerta bad "No se pudo leer el archivo".
- Revisión: alerta IA ("La IA está clasificando tus movimientos…" / "La IA ya clasificó los movimientos — Revisa y corrige lo que necesites antes de importar."), "N de M seleccionados · K líneas ignoradas"; tabla: checkbox incluir (`data-imp="i|incl"`), Fecha, Descripción, Valor, Categoría (sel con búsqueda, `data-imp="i|cat"`), Hormiga (checkbox + sparkles si `aiH`). "¿De quién son estos gastos?" (`impQ`), "Importar seleccionados" (`impgo`), "Descartar" (`impclear`).

### 3.9 `loansView(kind)` → `V['me-deben']` (cobrar) y `V['le-debo']` (pagar)

Estado `SEL = {cobrar, pagar}` (préstamo seleccionado, default el primero), `LTAB` ('plan' | 'hist' | 'ct').
- Header: "Me deben" — "Personas o clientes que te deben dinero. Registra cada pago, sea la cuota exacta o un abono." / "Le debo" — "Créditos con bancos y deudas con personas. Registra cada pago y mira cuánto te falta." Botones: (solo Le debo) "Registrar empeño" (`empeno`, gem) + "Nuevo préstamo"/"Nueva deuda" (modal `loan` kind).
- KPIs: "Total que te deben"/"Total que debes" (Σ saldos, "N préstamos/deudas") · "Cuotas al mes" (`cuotasMes(kind)`, "Lo que deberías recibir"/"Lo que debes pagar") · "Atrasados" (n.º con mora; "Personas con pagos atrasados"/"Deudas en mora"/"Ninguno").
- Grid `.loans-grid` (0,75fr / 2fr): lista "Quién me debe"/"A quién le debo" (avatar o ícono landmark, nombre, "concepto · pill estado", barra progreso verde `#3F7A1E`/roja `#E41E3F`, saldo; clic `selLoan`, fila seleccionada fondo `--blue-soft`; vacío "Sin registros.").
- Detalle (→ j_loans `loanDetail` devuelve `head, now, tiles, split, acts`), pestañas "Plan de pagos" (`loanPlanTab`), "Pagos recibidos"/"Pagos hechos" (historial inverso: abono "Abono a la deuda · para terminar antes/para bajar la cuota", cuota "Cuota N completa · interés $ + abono $", "quedó en $"; solo el más reciente con `undoPago` "Deshacer"), "Datos del contacto" (`contactCardBody`). Vacío detalle: "Registra a quién le prestaste dinero y lleva el control de cada pago." / "Registra tus créditos y deudas para saber cuánto debes y cuándo pagar."

### 3.10 `V.contactos`

Header "Contactos" — "Las personas y empresas con las que tienes préstamos. Guarda sus datos una vez y úsalos cada vez que registres un préstamo." Botón "Nuevo contacto" (modal `contacto`).
Tarjetas (g3): avatar, nombre, "relación (o Empresa/Persona) · ciudad", editar; teléfono, documento, dirección; métricas "Te debe" (verde) / "Le debes" (rojo); pill "Tiene pagos atrasados"; "Prestarle" (modal loan cobrar con `data-cid`) y eliminar (`delContact`). Vacío: "Aún no tienes contactos." + "Agregar contacto".
`contactCardBody(c)`: Teléfono (copiar), Correo (copiar), Documento, Dirección (+ciudad), Relación, Notas; "Sin registrar" si vacío; acción `copy` data-v.

### 3.11 `V.estrategia` — Salir de deudas

Estado `EX = {extra: 500000, abono: {id, v: 2000000, modo:'plazo'}}`. Sin deudas: vacío "Registra tus créditos en Le debo para usar el simulador." + "Ir a Le debo".
- Header "Salir de deudas" — "Si cada mes pones un poco más de plata a tus deudas, terminas antes y pagas menos intereses. Aquí comparas dos métodos."
- Campo "¿Cuánto más puedes pagar al mes?" (money `data-ex="extra"`, hint "Hoy pagas $X en cuotas"); métricas "N meses — Sin pagar extra", "$ — Intereses sin pagar extra", "Avalancha|Bola de nieve — Método que más te conviene".
- Tarjetas **Avalancha** (zap): "Pones el dinero extra a la deuda con el interés más alto. Es la que menos plata te cuesta." / **Bola de nieve** (sprout): "Pones el dinero extra a la deuda más pequeña. Ves resultados rápido y te motiva a seguir." Cada una: pill "N meses", "Pagarías en intereses", "Te ahorras", orden con "terminas en el mes N".
- "¿Y si hago un abono extra a un crédito?": Crédito (sel `data-ex="abono.id"`), Valor del abono (`abono.v`), "¿Qué prefieres?" seg `abmodo`: "Terminar antes" (plazo) / "Pagar menos cada mes" (cuota). Métricas: Lo que debes (antes → después), Cuotas que faltan, Valor de la cuota, Ahorro en intereses. Nota: "Terminar antes casi siempre ahorra más intereses. Pagar menos cada mes te deja más plata libre. Cuando hagas el abono de verdad, regístralo en Le debo › Registrar pago › Abono."

### 3.12 `V.presupuesto` — Presupuesto 50/30/20

Header: "Presupuesto 50/30/20" — "La regla más usada para organizar el sueldo: N% para lo necesario, N% para gustos y N% para ahorrar. Con tu ingreso de $X queda así:" Botón "Editar categorías" (→ ajustes, `data-tab="cats"`).
Tres tarjetas: Necesidades (house, `#1F2B4B`, "Arriendo, mercado, servicios, transporte, salud") · Gustos (coffee, `#9EDB4E`, "Restaurantes, salidas, ropa, suscripciones") · Ahorro e inversión (piggy-bank, `#3F7A1E`, "Lo que guardas para el futuro"); pill con %, monto ("Gastado este mes" o "Planeado"), "recomendado $", barra.
Tabla "Cada categoría este mes" ("Escribe cuánto quieres gastar como máximo en cada una"): Categoría, Tipo, **Tope al mes (editable en línea, `data-edit="cat|id|tope"`)**, Llevas, Uso (barra), Estado. Filas extra para gastos con categoría desconocida: "No está en tus categorías" + pill "Sin categoría".

### 3.13 `V.flujo` — Flujo de caja

Header "Flujo de caja" — "Cuánto te entra y cuánto te sale en los próximos 12 meses, y con cuánta plata quedarías al final de cada mes."
KPIs: "Hoy tienes disponible" (`liquidez`, "Efectivo, bancos y ahorros") · "Te sobra en promedio" (Σneto/12, "Por mes") · "En 12 meses tendrías" (saldo mes 12) · "Meses en rojo" (n.º y lista de meses).
Gráfico SVG 760×240 (min-width 620): barras Entra `#9EDB4E` y Sale `#E41E3F` (opacidad .85), línea del acumulado `--navy` 2,5 px con puntos (r=5 el último), eje Y en millones ("12M"), leyenda. Tabla: Mes, Ingresos, Te pagan, Cuotas, Gastos fijos, Suscripciones, Variables, Resultado (verde/rojo, negrita), Acumulado. Nota: "Las primas y otros ingresos extra se suman en su mes si escribes el valor en el Calendario fiscal."

### 3.14 `V.metas` — Metas y fondo de emergencia

Header "Metas y fondo de emergencia" — "Ponle nombre y fecha a lo que quieres lograr y te decimos cuánto guardar cada mes." Botón "Nueva meta" (modal `meta`).
- Tarjeta **Fondo de emergencia** (umbrella): pill con el indicador 3 (o "Faltan datos"); texto "Es un colchón para imprevistos (perder el trabajo, una enfermedad, un daño en la casa). Lo recomendado es tener guardados N meses de tus gastos básicos."; métricas "Tienes guardado en el fondo"/"Tienes disponible (todas tus cuentas)", "Meta (N meses)", "Te falta"; barra lima; `fondoBlock()` (→ j_loans).
- Tarjeta por meta (g2): ícono, nombre, eliminar; "$ahorrado de $objetivo"; barra navy; métricas Avance %, Fecha, "Guarda al mes" (o "¡Lograda!"); `aporteRow({t:'meta', id}, sugerido, !!falta)` (→ j_loans, aporte automático como gasto fijo); formulario `data-form="abonometa"` (money `v` "¿Cuánto guardaste?", requerido, botón "Abonar"). Vacío "Aún no tienes metas." + "Crear meta".

### 3.15 `V.familia` — Presupuesto por miembro

Header "Presupuesto por miembro" — "El presupuesto de cada integrante de la familia, lo que lleva gastado y cuánto aporta cada uno." Botón "Editar integrantes" (→ perfil).
Tarjetas por miembro: avatar, nombre, rol, pill % de uso, "$gastado de $cupo", barra (rojo/`#E08A00`/lima), campo "Presupuesto al mes" editable (`data-edit="miembros|id|cupo"`). "Lo que aporta cada uno" (barras `#3F7A1E`, "$ · %"; nota "Según los ingresos asignados a cada integrante."). "Gastos compartidos: $X" — "Si los reparten según lo que gana cada uno, a cada quien le toca:". Vacío: "Agrega los integrantes de tu familia en tu perfil." + "Ir a Perfil".

### 3.16 `V.inversiones`

`INVT`: cdt "CDT" landmark t-blue "Le prestas tu dinero al banco por un tiempo fijo y te devuelve más. Seguro y sabes desde el inicio cuánto ganas." · ahorro "Cuenta o bolsillo que rinde" piggy-bank t-green "Tu plata gana intereses cada día y la puedes sacar cuando quieras (Nu, Lulo, bolsillos, cuentas de alto rendimiento)." · fondo "Fondo de inversión" layers t-violet "Juntas tu dinero con el de otras personas y expertos lo invierten. Puede subir o bajar." · acciones "Acciones o ETF" chart-line t-amber "Compras una parte de empresas. A largo plazo suelen crecer, pero su valor cambia todos los días." · cripto "Criptomonedas" coins t-red "Muy riesgosas: su valor puede subir o caer mucho en poco tiempo." · otro "Otra inversión" briefcase t-gray "Un negocio, un lote, ganado u otra inversión que quieras seguir."
Header "Inversiones" — "Mira cuánto está creciendo tu dinero, explicado sin palabras raras." Botón "Agregar inversión" (modal `inversion`).
KPIs: "Tu dinero invertido vale hoy" ("Pusiste $") · "Has ganado" ("% sobre lo que pusiste") · "Próximo vencimiento" ("Te avisamos 10 días antes").
Tarjeta por inversión: "Pusiste / Vale hoy"; CDT: barra de avance, "Faltan N días · vence el fecha" o "¡Ya venció! Decide si lo renuevas o retiras.", "Al final recibirás $: ganas $ y el banco descuenta $ de retención en la fuente (tip: "Es un impuesto que el banco cobra por adelantado sobre lo que ganas: 4% de los rendimientos. Lo puedes descontar en tu declaración de renta.")", "Equivale a unos $ por mes · tasa N% E.A."; ahorro: "Llevas ganados $. Al N% E.A. tu plata crece unos $ al mes y la puedes retirar cuando quieras."; otros: "Ha subido/Ha bajado N% desde que invertiste. Actualiza el valor cuando revises tu extracto." + campo "¿Cuánto vale hoy?" (`data-edit="inversiones|id|actual"`).
Simulador "¿Cuánto ganaría en un CDT?": "Si pongo" (money `data-isim="c"`), "A una tasa E.A. de (%)" (num `t`), "Por (días)" (sel 30, 60, 90, 180, 360, 540, 720 `d`) → "Al final recibirías $ — Ganas $ después de la retención ($)".
Glosario "Palabras que vas a escuchar": E.A. (efectiva anual) · Plazo · Retención en la fuente · Renovar · Riesgo (textos literales en el código, líneas 59 de c2_views).

### 3.17 `V.recordatorios` y `V.calendario` (versión base — reemplazadas por p_calendario)

- Recordatorios: "Próximos pagos" — "Todo lo que tienes que pagar o cobrar: gastos fijos, cuotas, suscripciones y fechas del calendario. Necesitas $X para lo vencido y lo de los próximos N días." Botones "Agregar a Google Calendar" (modal `gcal`) y "Agregar gasto fijo". Secciones Vencidos (bad), Próximos N días (warn), Más adelante (gray) con `agRow`; vacío "Nada por aquí."
- Calendario: "Calendario fiscal y laboral" — "Fechas que se repiten cada año: primas, cesantías e impuestos. Las de impuestos dependen de tu cédula y municipio; ajústalas con el calendario oficial." Botón "Agregar fecha" (modal `cal`). Lista ordenada por próxima ocurrencia: dateBox, título + pill "te pagan"/"pagas", "relTime · nota", campos en línea Fecha (`data-edit="calendario|id|fecha"`) y Valor estimado (`…|monto`), "Recordar" (`cal2fijo`, solo egresos), eliminar. Nota: "Consulta las fechas de renta en dian.gov.co con tus dígitos NN."

### 3.18 `V.indicadores` — Salud financiera

Header "Salud financiera" — "Seis preguntas que se hacen los asesores para saber si las finanzas de un hogar están sanas. Solo mostramos un resultado cuando tienes los datos necesarios para que sea exacto."
- Con ≥4 indicadores: anillo SVG 120 px (stroke 12, color ok `#9EDB4E` / warn `#E08A00` / bad `#C8213B`, `stroke-dasharray = sc·3,1416`), "Tu salud financiera", nivel, "Calculada con N de 6 indicadores…", barra "Datos completos: N%".
- Con <4: "Todavía no puedo darte un puntaje confiable" — "Para que el resultado sea exacto necesito al menos 4 de los 6 indicadores. Hoy tengo N. Me falta registrar:" + lista de faltantes.
- Tarjeta por indicador: ícono en círculo, pill Sano/Vigilar/En riesgo, pregunta, valor grande, barra `r/max`, "**meta.** detalle". Si faltan datos: borde punteado, pill "Faltan datos", "Para calcularlo con exactitud necesito X y Y.", botón "Completar" (→ `go`).

### 3.19 `V.reportes`

Estado `RPT` (mes). Header "Reportes" — "Tu balance y el resultado de {mes año}, listos para revisar en familia o guardar en PDF." Mes (sel 12 meses `data-ui="rpt"`), "Descargar PDF" (`pdf`), "Movimientos en Excel (CSV)" (`csv`). `resumenCard()` (→ f_extra, resumen IA). Tabla Balance (activos, Inversiones, Lo que me deben, Total que tengo; pasivos, Créditos y préstamos, Total que debo; pie Patrimonio). Tabla "Resultado del mes": Ingresos, Necesidades, Gustos, Otros gastos (x+a), Cuotas de créditos, Suscripciones; pie "Te sobró/Te faltó". Barras top 6 categorías (navy).

### 3.20 `V.perfil`

Portada degradado `120deg #1F2B4B → #3F7A1E 70% → #9EDB4E` (150 px), avatar lg 84 px, nombre (o "Tu nombre"), "ocupación · ciudad · N integrantes", pill "Perfil {riesgo}".
"Tus datos" (todos se guardan al cambiar, `data-edit="perfil|campo"`): Nombre completo (full) · `addrFields` (dirección/ciudad → i_geo) · Ocupación · Tipo de documento (CC "Cédula de ciudadanía", CE "Cédula de extranjería", PA "Pasaporte") · Número de documento (tip "Se usa en los acuerdos de pago que generes.") · Últimos 2 dígitos de tu cédula (máx 2, placeholder "Para fechas DIAN", tip "La DIAN asigna la fecha de tu declaración de renta según estos dígitos.") · ¿Cómo te sientes con el riesgo? (conservador "Conservador: prefiero no perder" shield-check / moderado "Moderado: algo de riesgo" scale / arriesgado "Arriesgado: busco ganar más" zap) · Tu meta financiera principal (full).
"Resumen": Ingreso mensual, Patrimonio, Contactos, Metas + enlace "Ver mis ingresos".
"Integrantes de la familia" (`#famCard`) — "Las personas con las que compartes el dinero de la casa. Te sirve para saber quién gasta qué y para darle a cada uno un presupuesto." Botón "Agregar integrante" (modal `miembro`). Tarjeta `.fam` (resaltada `.new` si `window._famNew`): avatar, nombre, pill rol con ícono `PARENT_IC`, "Presupuesto: $ al mes"/"Sin presupuesto propio", editar (modal miembro), eliminar (`delMiembro`). Vacío: "Aún no agregas integrantes. Agrega a tu pareja, hijos u otras personas del hogar."

### 3.21 `V.ajustes`

Estado `ATAB` (pestaña), `wipeArm` (timestamp de confirmación del borrado, 5 s). Layout `ajLayout` (→ l_ajustes: navegación lateral agrupada con buscador). Pestañas (`AJTABS`): Cuenta: general, apariencia, privacidad, seguridad · Inteligencia: ia · Avisos: alertas · Finanzas: finanzas, defs, cats, ings, ents, medios, rels, reglas · Datos: respaldo. Las de general/apariencia/privacidad/ia/alertas/servidor/seguridad se construyen en otros módulos. Definidas aquí:
- **finanzas**: Salario mínimo {año} (money `data-aj="smmlv"`, tip "Se usa para calcular el fondo de solidaridad pensional y la base mínima de cotización de independientes.") · Valor de la UVT {año} (`data-aj="uvt"`, tip "La fija la DIAN cada año. Se usa en la retención en la fuente y en el asistente de renta.") · Corte de la primera quincena (día) (`cfg|corteQ`, tip "Normalmente la 1ª quincena va del 1 al 15. Si te pagan otro día, cámbialo.") · Meses de fondo de emergencia (`cfg|emergMeta`, hint "Lo recomendado: entre 3 y 6") · % Necesidades / % Gustos / % Ahorro (`pct|n|g|a`) · Dólar hoy (TRM) (decimal, `trm|USD`, tip "Tasa oficial del día que publica la Superintendencia Financiera.") · Euro hoy (`trm|EUR`) · Tasa de usura (% E.A.) (`cfg|usura`, tip "Es el interés máximo que se puede cobrar legalmente en Colombia. Cambia cada mes: verifica el valor vigente en la Superintendencia Financiera."). Validación: si n+g+a ≠ 100 → alerta "Los porcentajes suman N%" / "Ajústalos para que sumen 100%."
- **defs** ("Lo que elijas aquí aparece ya puesto cuando registras algo nuevo. Siempre lo puedes cambiar en el formulario."): Al registrar un gasto → Categoría (opción "Que se ponga sola" wand-sparkles + categorías), Medio de pago, ¿Quién gasta normalmente? · Al registrar un préstamo → Forma de calcular la cuota (frances/aleman/simple/americano), ¿Cada cuánto se paga? (FRECS), Número de cuotas. (`data-edit="def|…"`)
- **cats**: formulario `catNew` (Nueva categoría req. placeholder "Ej. Mascotas", Tipo Necesidad/Gusto/Ahorro default Gusto, Ícono default tag) + tabla editable en línea (Ícono, Nombre, Tipo, Tope al mes, eliminar `delcfg`).
- **ings / ents / medios** (`simple()` con `data-form="cfgNew" data-col`): "Nuevo tipo de ingreso" (+Ícono, default coins) · "Nuevo banco o entidad" (+Tipo Banco/Cooperativa/Fintech/Billetera/Fondo/Otro) · "Nuevo medio de pago" (+Ícono, default credit-card). Lista editable (`data-edit="cfgl|col|id|campo"`) y eliminar.
- **rels**: `relNew` (placeholder "Ej. Socio") + chips con quitar (`delrel` data-i).
- **reglas**: "Cuando importes un extracto, si la descripción contiene la palabra, el gasto queda en esa categoría." Formulario `regla`: Si contiene (placeholder "rappi"), Categoría (default Domicilios, con crear). Lista `"k" → cat` + `delregla`.
- **respaldo**: alerta de estado nube (`CLOUD.db`: "Tus datos se guardan en la nube"/"Solo lectura"/"Solo en este navegador — Exporta un respaldo con frecuencia."); botones Exportar respaldo (`exportjson`), Importar respaldo (`#impJson`), Ver datos de ejemplo (`loadsample`), Borrar todos los datos (`wipe`, doble clic en 5 s: "Confirmar: borrar todo"). Nota "Importar un respaldo reemplaza todos los datos actuales." **Formatear datos** (checkboxes `data-fmt`: gastos, ingresos, fijos (y suscripciones), prestamos, contactos, inversiones, balance (Cuenta T), metas, consejos, config (de fábrica), perfil) + escribir **BORRAR** (`#fmtConfirm`) + `formatear`. **Eliminar cuenta** (caja roja): "Borra todo tu libro… No se puede deshacer…" + escribir **ELIMINAR** (`#delConfirm`) + `deleteAccount`.
- Header: "Ajustes" — "Personaliza Mirai: apariencia, inteligencia artificial, notificaciones, seguridad, categorías y tus datos."

### 3.22 Modales invocados desde estas vistas (definidos en otros módulos)

`gasto` (con `data-foto`), `ingreso` (alta/edición), `fijo`, `pagarFijo` (id, per), `loan` (kind cobrar/pagar, `cid`), `pago` (kind, id), `activo`, `contacto`, `meta`, `sub`, `inversion`, `miembro`, `gcal`, `cal`, `buscar` (Ctrl+K sin sidebar visible). Menú "Agregar" (`openCreate`): gasto, fijo, ingreso, loan|cobrar "Préstamo que hice", loan|pagar "Deuda o crédito", contacto, inversion, meta.

### 3.23 Acciones `data-act` y ediciones usadas en estas vistas

`help, keep, blank, navg, libroMenu, sbToggle, create, sbSearch, bell, userMenu, setupSkip, setupUnskip, setupFinish, setupDismiss, loadsample, balq, baltab, balm, del (data-col, data-id), reviewH, toggleH, unpayfijo, addsub, subdone, impsample, impparse, impgo, impclear, selLoan, ltab, undoPago, empeno, copy, delContact, cal2fijo, pdf, csv, delMiembro, delcfg, delrel, delregla, exportjson, wipe, formatear, deleteAccount, readall`. Navegación: `data-go="vista"` (+`data-tab`). Ediciones genéricas: `data-edit="col|id|campo"`, `perfil|campo`, `cfg|campo`, `pct|k`, `trm|k`, `def|k`, `cat|id|campo`, `cfgl|col|id|campo`, `miembros|id|cupo`, `inversiones|id|actual`, `calendario|id|campo`; `data-ex`, `data-isim`, `data-imp`, `data-ui` (gmes, rpt), `data-aj`, `data-fmt`. Formularios: `nl`, `abonometa`, `catNew`, `cfgNew`, `relNew`, `regla`. (Los manejadores están en d_app → otro inventario.)

---

## 4. Menú, navegación y sidebar

### 4.1 `MENU` literal (`c_views.js`)

| Tipo | id / g | Etiqueta | Ícono | bg |
|---|---|---|---|---|
| sección | — | General | | |
| ítem | puesta | Puesta en marcha (solo si `!setupDone()`) | rocket | b-grad |
| ítem | inicio | Inicio | house | b-blue |
| ítem | consejero | Consejero IA | sparkles | b-grad |
| sección | — | Finanzas | | |
| grupo | dinero | Mi dinero | wallet | b-green |
| | | balance "Balance y quincenas" (scale) · ingresos "Ingresos" (arrow-down-to-line) · gastos "Gastos y hormiga" (receipt) · fijos "Gastos fijos" (house) · tarjetas "Tarjetas de crédito" (credit-card) · suscripciones "Suscripciones" (repeat) · correo "Correo del banco" (mail) · importar "Importar extractos" (file-up) | | |
| grupo | prestamos | Préstamos y deudas | handshake | b-amber |
| | | me-deben "Me deben" (hand-coins) · le-debo "Le debo" (landmark) · contactos "Contactos" (users) · estrategia "Salir de deudas" (trending-down) | | |
| grupo | plan | Planeación | target | b-violet |
| | | presupuesto "Presupuesto 50/30/20" (chart-pie) · flujo "Flujo de caja" (chart-line) · metas "Metas y emergencia" (piggy-bank) · retos "Retos de ahorro" (trophy) · primas "Primas y cesantías" (gift) · familia "Por miembro" (users) · mesadas "Mesada de los hijos" (baby) · compartidos "Gastos compartidos" (split) | | |
| ítem | inversiones | Inversiones | trending-up | b-teal |
| sección | — | Seguimiento | | |
| grupo | agenda | Agenda | calendar-days | b-red |
| | | recordatorios "Próximos pagos" (bell) · calendario "Calendario fiscal" (calendar) | | |
| grupo | informes | Informes | chart-column | b-pink |
| | | indicadores "Salud financiera" (gauge) · reportes "Reportes y resumen IA" (file-text) · renta "Asistente de renta" (file-check) | | |
| sección | — | Soporte | | |
| grupo | ayuda | Ayuda | life-buoy | b-blue |
| | | novedades "Novedades" (megaphone) · faq "Preguntas frecuentes" (circle-help) · manual "Manual e instructivos" (book-open) | | |
| sección | — | Configuración | | |
| ítem | perfil | Perfil | user | b-gray |
| ítem | ajustes | Ajustes | settings | b-gray |

`GISO` (isotipo del grupo): ayuda→consejero, dinero→ingresos, prestamos→me-deben, plan→metas, agenda→calendario, informes→reportes (+ dian→renta en s_dian). Ítems sueltos y subítems usan el isotipo con su mismo id (22 px / 18 px) o el ícono Lucide si no existe.

### 4.2 MENU efectivo tras los otros módulos

- **Planeación**: se inserta `logros` "Logros y nivel" (medal) después de `retos` (r_gamif).
- **Informes**: queda indicadores + reportes (se quita `renta`).
- **Agenda**: queda solo recordatorios (se quita `calendario`).
- Antes de "Seguimiento" se inserta sección **Impuestos** con grupo `dian` "DIAN" (landmark, b-red): renta "Declaración de renta" (file-check), calendario "Calendario fiscal y laboral" (calendar), contador "Acceso de tu contador" (user-round-check).
- En **modo contador** se recorta el MENU según permisos y se agrega sección "Contador" con `cnotas` "Notas con {nombre}".

`MENUPAGES()` = lista plana `[id, etiqueta, ícono]` de páginas visibles (buscador, selector de inicio en ajustes). `CTABS` (inicio, consejero, gastos, me-deben "Préstamos", recordatorios) está definido pero no se usa en estos archivos (resto de la barra de pestañas antigua).

### 4.3 `renderNav(v)` — sidebar

Estructura (`#side`):
1. **Cabecera**: botón marca (`libroMenu`, "Cambiar de libro"): isotipo `mirai` 34 px (libro principal) o ícono del libro; nombre del libro (`libroActual().nombre`, p. ej. "Hogar") + "Mirai · Tu futuro financiero" + chevrons-up-down. Botón `sbToggle` (panel-left-close/open, title "Contraer/Expandir el menú (Ctrl+B)").
2. **Herramientas**: botón primario **"Agregar"** (`create`, circle-plus, kbd "N"); **buscador** `#q` "Buscar…" con kbd "Ctrl K" (contraído: solo lupa, `sbSearch`); **Notificaciones** (`bell`, con punto rojo "9+" en contraído o badge de no leídas).
3. **Cuerpo** (`nav.sb-body`): etiquetas de sección; ítems con `.on` si activo; grupos como botón (`navg`, `aria-expanded`) con chevron que rota 90°, submenú `.sb-sub`; badges: `recordatorios` = n.º de pagos vencidos (dir pagar), `gastos` = "!" si hormiga sobre el límite, `puesta` = "N/9" (badge lima `info`). Grupo cerrado muestra la suma de badges numéricos de sus hijos. Grupo activo y cerrado (o sidebar contraído) se marca `.on`.
4. **Pie**: estado de sincronización (`SYNC`: punto verde nube / ámbar local / rojo error + texto) y botón usuario (`userMenu`): avatar, nombre ("Tu perfil"), ocupación ("Libro familiar").

Reglas de apertura: `NAVOPEN` (en `lmf-nav`) se inicializa dejando **solo un grupo abierto**; al navegar (`hashchange`) se abre el grupo de la página actual y se cierran los demás; cerrar el menú móvil (`nav-open`) y `scrollTo(0,0)`.
Migas (`#crumbs`): "{Libro}" (→ #inicio) › sección › grupo › **página actual** (en móvil ≤820 px se ocultan los intermedios `.mid`).
Sidebar contraído (`body.sb-col`, ancho 68 px, guardado en `lmf-menu-contraido`): solo íconos con `title`; en ≤820 px el toggle abre/cierra el panel deslizante (`nav-open`, ancho `min(320px, 86vw)`, scrim negro 35 %) y existe el botón flotante `.mob-nav` (40×40, arriba a la izquierda).

### 4.4 Buscador (`openSearch`, → d_app)

Busca (minúsculas, `includes`) en: páginas del menú ("Sección"), contactos ("Contacto"), préstamos por nombre + concepto ("Me debe"/"Le debo", además selecciona ese préstamo), gastos fijos ("Gasto fijo"). Máx 10 resultados en popover; Enter abre el primero; "Sin resultados".

### 4.5 Notificaciones (`openBell`)

Popover `.npanel` (380 px): título "Notificaciones", "Marcar todo como leído" (`readall`), ítems `.nitem` (círculo de 48 px con color `bg`, título en negrita + cuerpo, `relTime` en azul si no leída, punto azul de no leída), clic navega a `go` y marca leída. Vacío: "No tienes notificaciones. Te avisaremos cuando se acerque un pago."

### 4.6 Atajos de teclado (d_app / h_forms / o_asesor)

| Atajo | Acción |
|---|---|
| `Ctrl/⌘ + K` | Enfocar el buscador del sidebar; si no está visible abre el modal `buscar` |
| `Ctrl/⌘ + B` | Contraer/expandir sidebar (en móvil abre/cierra) — no si se está escribiendo |
| `N` | Abrir menú "Agregar" (no si escribe, hay modal, chat abierto o pantalla bloqueada) |
| `Esc` | Cierra popover → modal → menú móvil (en orden); cierra el chat flotante; oculta tooltip |
| `↑ / ↓ / Enter` | Navegar y elegir en el select abierto |
| `Enter` en buscador | Ir al primer resultado |
| `Enter / Espacio` en `.rowi[data-act]` | Activar la fila |
| `Enter` en chat | Enviar (Shift+Enter = salto de línea) |
| `Backspace` en OTP vacío | Volver a la casilla anterior |

---

## 5. Sistema de diseño (`a_shell.html`)

### 5.1 Tokens de color (VALORES EFECTIVOS)

Claro (`:root`):
| Token | Valor final | (Valor anterior pisado) |
|---|---|---|
| `--bg` | `#F5F5F5` | (#F4F4F4) |
| `--card` | `#FFFFFF` | |
| `--ink` | `#242424` | (#141B2D) |
| `--muted` | `#616161` | (#5E6577) |
| `--line` | `#D1D1D1` | (#D3D7DE) |
| `--line-2` | `#E0E0E0` | (#E6E8EC) |
| `--hover` | `#F0F0F0` | (#EFF1F3) |
| `--field` | `#FFFFFF` | (#F1F2F4) |
| `--nav` | `#FAFAFA` | nuevo (fondo sidebar) |
| `--navsel` | `#EBEBEB` | nuevo (ítem seleccionado) |
| `--navy` | `#1F2B4B` | |
| `--lime` | `#9EDB4E` | |
| `--forest` | `#3F7A1E` | |
| `--pri-bg` / `--pri-fg` | `#1F2B4B` / `#FFFFFF` | |
| `--blue` (acento, en realidad verde) | `#3F7A1E` | |
| `--blue-2` | `#2F6116` | |
| `--blue-soft` | `#EDF7E1` | |
| `--blue-ink` | `#2F6116` | |
| `--green` / `--green-soft` | `#3F7A1E` / `#EDF7E1` | |
| `--red` / `--red-soft` | `#C8213B` / `#FCE8EB` | |
| `--amber` / `--amber-soft` | `#8A5A00` / `#FEF3D6` | |
| `--violet` / `--violet-soft` | `#1F2B4B` / `#E7EAF2` | |
| `--shadow` | `0 0 2px rgba(0,0,0,.12), 0 2px 4px rgba(0,0,0,.14)` | (0 1px 2px rgba(20,27,45,.12)) |
| `--shadow-lg` | `0 0 2px rgba(0,0,0,.12), 0 14px 28px rgba(0,0,0,.14)` | |
| `--r` | `8px` | (10px) |
| `--top` | `0px` | (56px → 48px → 0) |
| `color-scheme` | light | |

Oscuro (`html.dk`):
| Token | Valor final | (anterior) |
|---|---|---|
| `--bg` | `#1F1F1F` | (#10151F) |
| `--card` | `#292929` | (#1A2131) |
| `--ink` | `#FFFFFF` | (#E6E9EF) |
| `--muted` | `#ADADAD` | (#A3AABB) |
| `--line` | `#4D4D4D` | |
| `--line-2` | `#3D3D3D` | |
| `--hover` | `#333333` | |
| `--field` | `#1F1F1F` | |
| `--nav` / `--navsel` | `#242424` / `#3D3D3D` | |
| `--navy` | `#C9D3EA` | |
| `--pri-bg` / `--pri-fg` | `#9EDB4E` / `#1F2B4B` | (el botón primario se vuelve lima con texto navy) |
| `--blue` / `--blue-2` / `--blue-soft` / `--blue-ink` | `#9EDB4E` / `#B5E57A` / `#24331C` / `#B5E57A` | |
| `--green` / `--green-soft` | `#9EDB4E` / `#24331C` | |
| `--red` / `--red-soft` | `#F2647A` / `#3D2028` | |
| `--amber` / `--amber-soft` | `#F7B928` / `#3A3020` | |
| `--violet` / `--violet-soft` | `#AFC0E8` / `#273149` | |
| `--shadow` | `0 0 2px rgba(0,0,0,.24), 0 2px 4px rgba(0,0,0,.28)` | |
| `--shadow-lg` | `0 0 2px rgba(0,0,0,.24), 0 14px 28px rgba(0,0,0,.4)` | |

Colores fijos de marca/estado (no cambian con el tema):
- Tonos de ícono `t-*` (fondo suave + color): t-blue, t-green, t-red, t-amber, t-violet (con tokens), t-gray (`--line-2`/`--muted`).
- Fondos sólidos `b-*` (íconos de página / notificaciones): b-blue `#1F2B4B`, b-green `#3F7A1E`, b-red `#C8213B`, b-amber `#D98300`, b-violet `#3B4C7C`, b-teal `#5E9A2C`, b-pink `#2C3E6B`, b-gray `#5E6577`, b-grad `linear-gradient(135deg,#1F2B4B,#3F7A1E 70%,#9EDB4E)`.
- Avatares: base `linear-gradient(135deg,#1F2B4B,#3F7A1E)`; c1 `#3F7A1E→#9EDB4E`; c2 `#C2571A→#F7B928`; c3 `#1F2B4B→#5A6C9E`; c4 `#2C3E6B→#3F7A1E` (c0 = base).
- Badge rojo `#E41E3F` / `#E5484D`; hormiga `#F7B928`; advertencia `#E08A00`; gráficos: entra `#9EDB4E`, sale `#E41E3F`, acumulado navy; préstamos: cobrar `#3F7A1E`, pagar `#E41E3F`.
- Paleta "estado" de componentes nuevos (préstamo, toasts, calendario): éxito `#16A34A`, error `#DC2626`/`#E5484D` (texto `#C62E33`), warn `#E8A100`/`#F2B233` (texto `#A06A00`/`#C27C00`), info `#2F6FED`, violeta empeño `#8E4EC6`. Interés en tablas `.c-int` `#A06A00` (oscuro `#F2B233`).
- Tooltip `#ftip` fondo `#1F2B4B`; ai-card borde degradado `135deg #1F2B4B → #9EDB4E`; botón IA `.btn.ai` `linear-gradient(135deg,#1F2B4B,#3F7A1E)` texto blanco.
- Modal fondo `rgba(0,0,0,.4)` (modal2 `.35`); scrim móvil `rgba(0,0,0,.35)`.

### 5.2 Tipografía

- Fuente: `"Segoe UI Variable Text","Segoe UI",-apple-system,BlinkMacSystemFont,Roboto,"Helvetica Neue",Arial,sans-serif` (antes system-ui). Mono (textareas, secretos, códigos): `ui-monospace, Menlo, monospace`.
- `body`: 14px / 20px, antialiased. `.num` y montos: `font-variant-numeric: tabular-nums`.
- h1 página 28px/36px peso 600; descripción 14px/20px muted (máx 72ch).
- `.card h2` 16px/22px 600; `.card h3` 14px 600; KPI valor 22px/30px 600, etiqueta 12px, sub 12,5px.
- Labels de campo 14px 600; hint 12,5px; `.note` 13px muted; `.lbl-s` 12,5px 600 muted; pills 12px 600; tablas 14px, th 12px 600 muted.
- Diálogo título 20px/28px 600, descripción 14px/1,5 muted (máx 60ch).
- Escala de apariencia: `html.fs-l body{zoom:1.1}`, `html.fs-xl body{zoom:1.22}`; densidad `html.dense` (card 14px, filas 6px, inputs 38px).

### 5.3 Radios, sombras, espaciado

- Radios: tarjeta 8px; botones 4px; inputs 8px (44px de alto); pills 999px; chips 4px; choice 8px; alertas 8px; diálogos 8px; popover 8px; opciones 4px; sidebar ítems 4px (búsqueda 8px); toasts 10px; KPI ícono 8px (40×40); avatar redondo; métricas 4px.
- Sombras: tarjeta `--shadow`; diálogo `0 0 8px rgba(0,0,0,.12), 0 32px 64px rgba(0,0,0,.14)`; toast `0 2px 6px rgba(0,0,0,.06), 0 16px 40px rgba(15,23,42,.16)`.
- Card padding 20px, gap interno 12px; grid gap 16px; `main` padding `24px max(16px,2.2vw) 64px`, ancho completo (sin max-width efectivo); formulario `grid auto-fit minmax(min(100%,180px),1fr)`, gap `20px 22px`.

### 5.4 Layout y breakpoints

Estructura: `.shell` = grid `[sidebar var(--sbw,268px) | .inset]` (contraído 68px) → `.inset` contiene `.mob-nav`, `#crumbs.ct-crumbs`, `main#main`. Overlays: `#scrim`, `#modal`, `#pop`, `#toasts`, `#auth`. **No hay barra superior** (v3.9): las migas van en el contenido.
Sidebar: sticky, `height:100vh`, fondo `--nav`, borde derecho `--line-2`; ítem 36px; indicador seleccionado barra 3×16px `#3F7A1E` (oscuro `#9EDB4E`) a la izquierda; subítems 32px con sangría 22px; botón "Agregar" navy (oscuro lima).
Grids: `.g4` 4 col, `.g3` 3, `.g2` 2, `.g21` 1,5fr/1fr, `.g12` 1fr/1,6fr, `.loans-grid` `minmax(250px,.75fr) 2fr`, `.aj` 280px/1fr.

| Breakpoint | Cambios |
|---|---|
| ≤1180px | (topbar antigua) |
| ≤1100px | `.g4`→2 col; `.g21/.g12`→1 col; loans-grid y consejero 1 col; oculta isotipos del login |
| ≤1000px | calendario de pagos 1 col |
| ≤900px | `.g3`→2 col; ajustes sin nav lateral (selector móvil `.aj-mob`); g-hero 2 col |
| ≤860px | login en 1 columna |
| ≤820px | **móvil**: shell 1 col; sidebar fijo deslizante `min(320px,86vw)`, `nav-open`; `.mob-nav` visible; `.g2/.g3`→1 col; cuenta T apilada; migas sin intermedios |
| ≤700px | chat a pantalla completa; consejero 1 col; calendario compacto |
| ≤640px | formularios gap 16px, diálogo padding 16/18px; toasts ancho completo arriba; préstamo compacto (oculta columnas capital/interés) |
| ≤520px | `.g4`→1 col; acciones de página a ancho completo; oculta botón privacidad |
| `prefers-reduced-motion` | sin transiciones ni animaciones (también `html.rm`) |

Objetivo: probar a 400 px sin scroll horizontal (tablas en `.tbl-wrap` con `overflow-x:auto`).

### 5.5 Componentes visuales

- **Botón `.btn`**: 32px, padding 0 12px, borde `--line`, fondo `--card`; variantes `pri` (navy/lima, hover `#2C3D69`/`#B5E57A`), `soft` (blue-soft), `ghost`, `danger` (borde y texto rojo), `ai` (degradado), `sm` 28px/13px, `lg` 40px/15px, `icon` cuadrado (36/30), `block`, `:disabled` opacidad .45. `.help-btn` con borde.
- **Inputs** (`.inp`, `.ui-trigger`, `.ui-money`): 44px, radio 8, borde inferior más oscuro (`#616161`/`#ADADAD`), foco = borde inferior + `inset 0 -1px 0 var(--blue)` (estilo Fluent); error `.f.err` borde rojo; textarea mono mín 110px.
- **Checkbox `.chk`** 18px, marcado `--forest`; **switch** 40×20 con perilla 12px (marcado `--blue`).
- **`.seg`** (segmentado) fondo `--hover`, botón activo con fondo card y sombra. **`.choice`** tarjeta seleccionable (activo borde 2px `--blue` + fondo blue-soft, pill "Recomendado" arriba a la derecha). **`.chip`** (activo = color primario).
- **Tooltips**: `.finfo` (i) 20px + burbuja global `#ftip` navy con flecha (arriba/abajo).
- **Popover `#pop`**: fijo, z 70, sombra lg, máx `min(380px,100vw−24px)`; lista máx 300px; búsqueda; opción `.opt` (32px, `.oi` círculo 28px, `.oh` ayuda, check `.ck`); pie "crear" `.pop-foot/.pf-btn`. Calendario `.cal` 292px (días 36px, hoy con anillo, seleccionado primario, vista de meses `.cal-mg`, entrada escrita `.cal-typed`, accesos rápidos `.cal-q`).
- **Tarjeta `.card`** y variantes: `.kpi` (fila), `.ai-card` (borde degradado), `.metric` (bloque gris con número 16px), `.preview` (fondo blue-soft, borde izquierdo lima 4px, `.big` 22px 800), `.band` (banda de resultado, valor 22px 800), `.alert` ok/warn/bad/info (círculo de ícono 32px sólido), `.empty`.
- **Pills** ok/warn/bad/info/gray/vio, `.pill.sm`. **`.datebox`** 46px (cabecera navy con mes en mayúsculas 10,5px, día 18px). **`.track`** 6px (`.lg` 12px). **`.legend`**.
- **Listas `.rowi`**: fila flex con `.ri` (círculo 40px), `.rb` (título `.rt` 14,5px 600 + `.rs` 13px muted), `.rv` (monto 700 tabular), `.ra` (acciones). `.list` margen −8px.
- **Tablas**: th 12px muted, td 10px 8px, borde `--line-2`, `tfoot` 700 con borde superior 2px, `tr.done` atenuado, `tr.next` resaltado, `td.r` derecha.
- **Pestañas `.tabs`**: botones 12px de padding, activo texto ink 600 con barra inferior 3px `--blue` redondeada.
- **Cuenta T `.taccount`**: 2 columnas con borde superior 3px y divisor 3px `--ink`; líneas `.tline` (grid 32px / 1fr / auto / auto, borde punteado); `.ttotal`.
- **Composer** (inicio): input píldora con fondo `--bg`; `.quick` botones 40px.
- **Diálogo**: `#modal` (z 50) centrado; `.dlg` `min(700px,100%)` (`.wide` 820px), cabecera alineada a la izquierda con título + descripción `.dlg-d` + cerrar (`.rbtn` 32px arriba a la derecha), cuerpo con scroll (padding 20/28/26, gap 22), pie con botones a la derecha (padding 16/28). Segunda capa `#modal2` (z 65, 520px) con animación `fin`.
- **Toasts** (`#toasts`, arriba a la derecha, top 68px, ancho 400px, z 90): `.toast.tx` con ícono circular 34px, título 14,5px 650, cuerpo 13,5px, acciones `.tx-btn`, cerrar `.tx-x`, barra de progreso inferior 3px (`txp`, se pausa al pasar el mouse); tipos `t-success` `#16A34A`, `t-warn` `#E8A100` (ícono `#C27C00`), `t-error` `#DC2626`, `t-del` (rojo + botón "Deshacer" navy / lima en oscuro), `t-info` navy (`#9EB4FF` en oscuro). Versión simple `.toast.simple` con borde izquierdo 4px `--blue`.
- **Privacidad**: `html.priv` difumina (blur 7px) montos `.num, .kv, .rv, .bv, .big, .metric b, .ttotal span:last-child, .ui-money input`; se ven al pasar el mouse. `html.priv-blur` difumina `#main` y `#side` (14px) — protección al cambiar de pestaña.
- **Login / bloqueo** (`#auth`, z 85): dos columnas (marca con degradado `150deg #1F2B4B → #253A57 55% → #2E5B33`, isotipos flotando `abf` 6s; formulario 420px), medidor de contraseña 4 barras, requisitos, OTP 46×54 con borde inferior 2px, caja QR 168px, códigos de respaldo. `body.locked` oculta la app.
- **Tour** (`#tour`, z 90): anillo con sombra `0 0 0 9999px rgba(15,23,42/20,35,.55)` + borde lima 3px, tarjeta flotante.
- Componentes de otros módulos con CSS aquí (documentar en sus inventarios): detalle de préstamo `.ld-*`, `.sbar`, `.how`, `.ltbl`; `.ocr-box`, `.subq`, `.subav`, `.prenda`, `.fondo`, `.imp-box`, `.aporte`, `.ded/.dd-*` (nómina); novedades `.rel-*`, FAQ/manual `.faq/.guide/.mod/.steps/.tips`; ajustes `.aj-*`, `.ap-grid`, `.ia-master`, `.prov-*`, `.ch-*`, `.nmat`; consejero `.as-*` y chat flotante `#asFab/#asChat/.ch-panel/.msg/.bub/.typing`; familia `.fam`; calendario de pagos `.gcal/.gc-*/.ev/.gw-*/.ga-*/.evpop`; calendario fiscal `.fc-*`, `.fp`; integraciones `.int-*`, `.ptile`; gamificación `.g-*`; DIAN `.r-*`, `.acc-*`, `.cont-*`; lanzador `.launcher/.ln-*`; `canvas.confetti`.

### 5.6 Animaciones

| Nombre | Uso | Definición |
|---|---|---|
| `sk` | esqueleto de carga `.skel` | gradiente que se desplaza, 1,2s infinito |
| `tin` | toast simple | de opacidad 0 y +10px, .25s |
| `txin` / `txout` | toast nuevo | entra desde −12px y escala .97 (.28s `cubic-bezier(.2,.9,.3,1.2)`); sale a +24px en X (.2s) |
| `txp` | barra de tiempo del toast | `scaleX(1→0)` lineal |
| `fin` | segundo modal | opacidad .15s |
| `sp` | spinner `.spin` | rotación .7s |
| `abf` | isotipos del login | sube 8px, 6s |
| `chin` | panel de chat | entra desde +12px, .2s |
| `tp` | "escribiendo…" | 3 puntos con retraso .15s |
| `fabdot` | puntos del botón de chat | 1,6s |
| transiciones | sidebar (grid .2s, móvil transform .22s), chevrons (.2s), switch (.2s), inputs (.15s), tour (.25s), barras de logros (.6s/.8s) |

### 5.7 Iconografía

- Lucide (trazo 2, 24×24 viewBox, 20px por defecto, 18/16 px en sidebar y botones) vía `ic(nombre)`; fallback `circle-help`.
- Isotipos propios (SVG 256×256 con degradados, `isoIcon(clave, px)`) para cada sección, logo `mirai`, estados vacíos (72px), encabezado de página (44–56px), sidebar (22/18px), menú Agregar (30px), accesos rápidos (26px).
- **Prohibido** usar logos de marcas de terceros (bancos, streaming, IA); el usuario puede subir los suyos (suscripciones/proveedores).

---

## 6. Checklist rápida para la migración de esta parte

- [ ] Tablas Supabase por colección de §1.3 (+ `cfg`, `perfil`, `setup`, `fondo` como JSONB o tablas) con `hogar_id`; pagos de préstamos y de fijos como tablas hijas.
- [ ] Portar §2 como funciones puras TypeScript con pruebas unitarias (engine, fijoPeriods/fijoStatus, quincena, agenda, notifs, indicadores, flujo, inv, sim, parseCSV/pnum/pdate) usando los datos de `sample()` como fixture.
- [ ] Rutas Next.js por cada vista de §3 (respetando el MENU efectivo de §4.2) y los reemplazos de §0.
- [ ] Sidebar shadcn (`Sidebar` colapsable, grupos con un solo abierto, badges, buscador ⌘K, botón Agregar con tecla N, ⌘B).
- [ ] Tokens de §5.1 en CSS variables de shadcn (`--background`, `--card`, `--primary` = navy/lima en oscuro, `--accent` = forest…), radios 8/4, fuente Segoe UI Variable.
- [ ] Mantener todos los textos de ayuda literal (son parte del producto: español de Colombia, trato de "tú").

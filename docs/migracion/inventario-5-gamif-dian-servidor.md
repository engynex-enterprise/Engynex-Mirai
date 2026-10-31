# Inventario 5 — Gamificación, DIAN, acceso del contador, servidor y pruebas E2E

> Fuente: lectura completa de `src/r_gamif.js`, `src/s_dian.js`, `src/z_boot.js`, `server/lib/core.js`, `server/lib/store.js`, `server/lib/crypto.js`, `server/index.js`, `server/api/[...path].js`, `server/vercel.json`, `server/supabase/schema.sql`, `server/.env.example`, `tests/helpers.js`, `tests/run-all.js` y los 19 `tests/e2e/*.test.js` (estado del repo en el commit `72c3d27`, Mirai 4.0).
> Objetivo: reimplementar en Next.js + shadcn + Supabase **sin perder comportamiento**. Las fórmulas se copian literalmente. Al final de cada bloque hay una lista de **"Ojo al migrar"** con rarezas o errores detectados (no se corrigieron: esto es solo análisis).
>
> Helpers externos que se usan aquí y viven en otros módulos: `today()`, `iso(d)` (YYYY-MM-DD), `parse(s)`, `addDays(d,n)`, `days(a,b)`, `engine(L)` (motor de préstamos), `conv(valor,moneda)` (a COP con TRM), `inv(x)` (inversión: `{valor,bruto,ret}`), `FREC={mensual:1,quincenal:2,semanal:52/12,anual:1/12}`, `fspPct()` y `retEmpleado()` (`m_nomina.js`), `smmlv()`, `uvtHoy()`, `hormigas()`/`isHormiga()`, `agenda()`, `retoEstado()`, `rentaFecha()`/`RENTA26` (`p_calendario.js`), `RDOCS` (`f_extra.js`), `b64()` (`g_auth.js`), `srvCfg/srvOk/srvFetch` (`n_servidor.js`).

---

## 1. Gamificación (`src/r_gamif.js`)

### 1.1 Principio
- **Nada se "otorga" a mano**: los puntos (XP) se **recalculan siempre** a partir de los datos del libro (`S`). Solo se persisten en `S.gami`: visitas, insignias desbloqueadas, misiones cumplidas, nivel máximo alcanzado y fecha de inicio.
- Interruptor: `S.cfg.gami` (activo salvo que valga `false`). `gamiOn = S.cfg.gami !== false`. En el portal del contador se fuerza `S.cfg.gami=false`.
- Menú: agrega `['logros','Logros y nivel','medal']` en el grupo `plan`, justo después de `retos`.

### 1.2 Modelo persistido `S.gami`
| Campo | Tipo | Uso |
|---|---|---|
| `visitas` | `string[]` (YYYY-MM-DD) | Días en que se abrió Mirai. Se recorta a los **últimos 400**. |
| `unl` | `{[badgeId]: 'YYYY-MM-DD'}` | Insignias desbloqueadas y fecha. **Nunca se quitan** aunque la condición deje de cumplirse. |
| `mis` | `{[semanaISO_lunes]: string[]}` | Claves de misiones cumplidas por semana. Se conservan **solo las 12 semanas más recientes**. |
| `lvl` | number | Nivel máximo visto (para detectar "subiste de nivel"). |
| `init` | 'YYYY-MM-DD' | Primera evaluación. Si no existe, la primera evaluación es **silenciosa** (no celebra lo ya cumplido). |

### 1.3 Niveles (`GLV`) — umbrales de XP
| Nivel | Desde XP | Nombre | Ícono Lucide |
|---|---|---|---|
| 1 | 0 | Semilla | sprout |
| 2 | 150 | Brote | leaf |
| 3 | 400 | Planta | flower-2 |
| 4 | 800 | Arbusto | shrub |
| 5 | 1.500 | Árbol | tree-deciduous |
| 6 | 2.500 | Roble | tree-pine |
| 7 | 4.000 | Bosque | trees |
| 8 | 6.500 | Mirai | sparkles |

`nivel(xp)` → `{i, n:i+1, name, icon, min, next (XP del siguiente o null), nextName, prog:(xp-min)/(next-min) | 1 si es el máximo}`.

### 1.4 Puntos (`gamiXP()`) — fórmula exacta por fuente
Cada parte: `{k, l (etiqueta), icon, v: Math.round(v), n (conteo)}`; solo se agrega si `v>0`. `total = Σ v`.

| k | Etiqueta | Fórmula | n |
|---|---|---|---|
| gastos | Gastos registrados | Agrupa `S.gastos` por `fecha`; `Σ_días min(cantidad_del_día,10) × 5` | `S.gastos.length` |
| ingresos | Ingresos registrados | `S.ingresos.length × 20` | idem |
| cuotas | Cuotas pagadas (a tiempo valen más) | `a×25 + (t−a)×10` con `puntuales()` | `t` |
| fijos | Gastos fijos pagados | `Σ_fijos (f.pagos||[]).length × 10` | total pagos |
| metas | Avance en metas | `Σ_metas con objetivo>0: min(ahorrado/objetivo,1)×60 + (ahorrado≥objetivo ? 100 : 0)` | `S.metas.length` |
| retos | Retos de ahorro | `cumplidos×100 + (S.retos.length−cumplidos)×15` (cumplido = `retoEstado(r).ok`) | `S.retos.length` |
| visitas | Días que entraste | `días únicos en visitas × 3` | idem |
| insignias | Insignias ganadas | `Object.keys(unl).length × 50` | idem |
| misiones | Misiones semanales | `Σ_semanas Σ_claves xp de la misión (GMIS)` | total misiones |

`puntuales()`: para cada préstamo en `S.pagar`, `engine(L).hist` filtrado a `tipo==='cuota'`; `t++` por cuota; `a++` si `h.fecha <= addDays(h.prog, 2)` (pagada hasta 2 días después de la fecha programada). Errores del motor se ignoran.

Tabla "Cómo ganar puntos" (texto mostrado al usuario): registrar gasto 5 (hasta 10 al día) · ingreso 20 · cuota a tiempo 25 (tarde 10) · gasto fijo pagado 10 · cumplir meta "100 + avance" · reto 100 · entrar 3 por día · misión semanal 30 a 50 · insignia 50. Nota: "Los puntos salen de lo que ya registras. No compiten con nadie".

### 1.5 Rachas
- `racha()`: días consecutivos con visita terminando **hoy**; si hoy no hay visita, empieza a contar desde **ayer** (la racha no se pierde hasta que acaba el día).
- `rachaMax()`: la secuencia más larga de días consecutivos en `visitas` (ordenadas, deduplicadas, `days(prev,d)===1`).
- `gamiVisit()`: se ejecuta 1.200 ms después de cargar; si hoy no está en `visitas`, lo agrega, recorta a 400 y guarda (`_commitG`), luego `gamiCheck(true)` (silencioso).

### 1.6 Insignias (`GBADGES`) — 18
Formato: `[id, nombre, descripción, ícono, nivel, condición]`. Nivel: `b`=Bronce `#B87333`, `s`=Plata `#8A97A8`, `g`=Oro `#E0A500` (`GTIER`).

| id | Nombre | Descripción (texto UI) | Ícono | Nivel | Condición literal |
|---|---|---|---|---|---|
| perfil | Me presento | Completa tu nombre en el perfil. | user-check | Bronce | `!!S.perfil.nombre` |
| gasto1 | Primer registro | Registra tu primer gasto. | receipt | Bronce | `S.gastos.length>=1` |
| gasto50 | Contador experto | Llega a 50 gastos registrados. | list-checks | Plata | `S.gastos.length>=50` |
| gasto200 | Ojo de halcón | Llega a 200 gastos registrados. | scan-eye | Oro | `S.gastos.length>=200` |
| ingreso | Sé lo que gano | Registra al menos un ingreso. | arrow-down-to-line | Bronce | `S.ingresos.length>=1` |
| fijos | Sin sorpresas | Registra 3 o más gastos fijos. | house | Bronce | `S.fijos.length>=3` |
| presu | Con presupuesto | Ponle un tope a 3 categorías. | chart-pie | Plata | `S.cfg.categorias.filter(c=>+c.tope>0).length>=3` |
| meta | Soñar con fecha | Crea tu primera meta de ahorro. | target | Bronce | `S.metas.length>=1` |
| metaok | Meta cumplida | Completa el 100% de una meta. | party-popper | Oro | alguna meta con `objetivo>0 && ahorrado>=objetivo` |
| fondo | Colchón listo | Abre tu bolsillo de emergencias con saldo. | shield-check | Plata | `S.fondo && S.fondo.on && +S.fondo.saldo>0` |
| puntual | Puntual | Paga 5 cuotas a tiempo. | calendar-check | Plata | `puntuales().a>=5` |
| libre | ¡Deuda saldada! | Termina de pagar una deuda. | badge-check | Oro | algún `engine(L).done` en `S.pagar` |
| hormiga | Domador de hormigas | Pasa la quincena del mes sin superar tu límite de gastos hormiga. | bug-off | Plata | `today().getDate()>=15 && H.mes.length>0 && !H.over` (`H=hormigas()`) |
| reto | Retador | Cumple un reto de ahorro. | trophy | Plata | algún `retoEstado(r).ok` |
| racha7 | Constante | Usa Mirai 7 días seguidos. | flame | Plata | `rachaMax()>=7` |
| racha30 | Imparable | Usa Mirai 30 días seguidos. | flame-kindling | Oro | `rachaMax()>=30` |
| inversor | Mi plata trabaja | Registra tu primera inversión. | trending-up | Plata | `S.inversiones.length>=1` |
| consejo | Pregunto antes de gastar | Usa el consejero o el chat de Mirai. | message-circle-question | Bronce | `(S.consejos||[]).length>0 || (Array.isArray(S.chats) && S.chats.length>0)` |

Totales: 7 bronce, 7 plata, 4 oro.

#### Ilustración de insignias (`badgeSvg`)
- SVG `viewBox 0 0 120 132`, tamaño por defecto 84 px (alto ×1,1), con `filter` sombra (`g-drop`).
- **Marco según nivel**: bronce = círculo r47 con anillo punteado interior; plata = hexágono r49 + hexágono interior blanco translúcido; oro = roseta de 16 puntas (r49/43) con laureles (7 hojas por lado, verdes `#7CC242`/`#3F7A1E`).
- **Estrellas** bajo el emblema: bronce 1, plata 2, oro 3 (relleno `#FFF7D6`, borde `#8A5A00`).
- **Gema central** (círculo r33 con degradado radial) + brillo superior + ícono Lucide en blanco escalado ×1,6 + cinta inferior.
- Paleta de gemas por insignia `GEMC`: perfil 0, gasto1/50/200 1, ingreso 2, fijos 3, presu 4, meta/metaok 5, fondo 2, puntual 3, libre 2, hormiga 6, reto 5, racha7/30 7, inversor 2, consejo 4.
- `GEMS` (claro, medio, oscuro): 0 azul `#8FB6FF/#3B6FD8/#1E3F8F`, 1 rosa `#FFB3C1/#F0506E/#A51E43`, 2 verde `#A8F0C6/#2FBF71/#137447`, 3 ámbar `#FFE08A/#F5A524/#B4650A`, 4 violeta `#D7C2FF/#8B5CF6/#5B2BB5`, 5 cian `#A8F0FF/#2CC7EA/#117FA8`, 6 lima `#C9F59A/#7CC242/#3F7A1E`, 7 naranja `#FFC59E/#FF7A2F/#C2410C`.
- `GMET` (metal: brillo, medio, oscuro, borde): b `#F6C9A0,#C98552,#8A4B22,#5E2F12`; s `#FFFFFF,#D5DCE6,#8A97A8,#5B6676`; g `#FFF4C2,#FFD24A,#D99A06,#8A5A00`.
- Las `<defs>` se inyectan una sola vez en `#gBadgeDefs`. Bloqueada: clase `lk` + candado superpuesto.
- La vista `logros` reemplaza vía regex el ícono plano de cada insignia por su SVG (envoltura de `V.logros`). En React esto es un componente `<Badge tier gem icon locked/>`.

### 1.7 Misiones semanales (`GMIS`) — 5 en el pool, 3 por semana
| k | Título | Descripción | Ícono | XP | Meta | Progreso (semana a=lunes, b=domingo) |
|---|---|---|---|---|---|---|
| reg5 | Registra 5 gastos | Anota lo que gastas esta semana, por pequeño que sea. | receipt | 40 | 5 | gastos con fecha en [a,b] |
| dias3 | Registra 3 días distintos | Crear el hábito vale más que hacerlo todo un solo día. | calendar-days | 40 | 3 | fechas distintas con gastos en [a,b] |
| visit4 | Entra 4 días a Mirai | Un vistazo rápido a tu plata cada día. | eye | 30 | 4 | visitas distintas en [a,b] |
| sinh | 3 días sin gastos hormiga | Ni el tintico ni el antojo: tres días limpios esta semana. | bug-off | 50 | 3 | para cada día d de a hasta min(b, hoy): cuenta si (d < hoy **o** hay algún gasto ese día) **y** ningún gasto de ese día es hormiga |
| aldia | Cero pagos vencidos | Termina la semana sin cuotas ni gastos fijos atrasados. | circle-check-big | 50 | 1 | `agenda().filter(x=>x.st==='bad'&&x.dir==='pagar').length ? 0 : 1` |

**Selección determinística** (`misionesSemana()`):
```
a = lunes de esta semana (wkStart: d - ((getDay()+6)%7), a medianoche local); b = a+6; wk = iso(a)
seed = Math.floor(a.getTime()/6048e5)          // número de semana desde epoch
pool = [...GMIS]; s = seed
while (pick.length<3 && pool.length) { s = (s*9301+49297)%233280; pick.push(pool.splice(s%pool.length,1)[0]) }
cada misión → {...m, p: min(prog(wk, iso(b)), goal), ok: p>=goal, wk, fin: b}
```
La UI muestra "Se renuevan en N días" (`days(today, fin)`) o "Se renuevan mañana".

### 1.8 Detección y celebración (`gamiCheck`)
- Se dispara **500 ms después de cada `commit()`** (debounce; `commit` está envuelto) y en silencio tras `gamiVisit`.
- Algoritmo: por cada insignia no desbloqueada, evalúa la condición (try/catch) → si se cumple guarda `unl[id]=hoy`. Por cada misión de la semana con `ok`, la agrega a `mis[wk]` si no estaba y (si no es la primera evaluación) muestra toast `+{xp} puntos · {título}` / título "Misión cumplida". Purga `mis` a 12 semanas. Calcula nivel; `subio = g.lvl && L.n > g.lvl`; `g.lvl = max(g.lvl, L.n)`.
- Primera vez (`!g.init`): guarda `init=hoy` y termina sin celebrar.
- Guarda (`_commitG`: `store.set(LKEY(),S)` + `scheduleCloud()`, **sin** pasar por `commit()` para no re-disparar) si hubo novedades.
- Celebración (no silenciosa): hasta 3 toasts de insignia, separados 900 ms, título `Insignia: {nombre}`, cuerpo = descripción, acción "Ver logros" (→ `#logros`) + confeti (110 partículas). Si subió de nivel: toast "¡Subiste de nivel!" — "Ahora eres nivel {n}: {nombre}. ¡Sigue así!" + confeti 160.
- Confeti: canvas a pantalla completa, 110 cuadros, colores `#9EDB4E #3F7A1E #1F2B4B #FFB547 #2CC7EA #fff`; respeta `prefers-reduced-motion`.

### 1.9 Dónde se ve
- **Inicio**: franja `gamiStrip()` arriba de la vista (enlace a `#logros`): ícono de nivel, "Nivel n · Nombre", barra de progreso, "X puntos · faltan Y para Z" / "nivel máximo", chip de racha (`hot` si >0, "día/días"), la primera misión pendiente con barra o "¡Todas cumplidas!".
- **Sidebar**: bajo el nombre del usuario (`.sb-user small`) muestra "{ícono} Nivel n · Nombre".
- **Vista `logros`**: cabecera con interruptor "Mostrar logros" (`data-aj="gami|on"`, cambia `S.cfg.gami`, toast "Logros activados"/"Logros ocultos"); si está apagado, estado vacío. Si está encendido: héroe con anillo de progreso (148 px, degradado lima→bosque), nombre del nivel, 8 puntos de niveles, KPIs (racha + récord, insignias `nb/18`, % cuotas a tiempo o "—"); tarjeta de misiones (barra, "p de goal", "+xp"); rejilla de insignias (nivel + fecha si desbloqueada); "De dónde vienen tus puntos" (partes ordenadas desc, "vez/veces"); "Cómo ganar puntos".
- `HELP.logros`: título "Logros y nivel", 4 puntos (puntos por usar Mirai; 3 misiones semanales; racha = días seguidos; apagar con el interruptor).

### Ojo al migrar (gamificación)
1. **Los XP pueden bajar**: borrar gastos/ingresos reduce puntos; la purga de `mis` a 12 semanas y de `visitas` a 400 días **resta** XP antiguos. Si se quiere un acumulado estable, persistir un ledger de puntos (tabla `gami_events`) en vez de recalcular.
2. La misión `aldia` (meta 1) se cumple apenas se evalúa sin vencidos (no espera al fin de semana) — contradice su texto.
3. `hormiga` solo se puede ganar del día 15 en adelante.
4. `nivel` mostrado se recalcula (puede bajar); `g.lvl` solo sirve para detectar subidas.
5. El cálculo de semana usa hora local del navegador; en servidor usar `America/Bogota`.
6. El reemplazo por regex del ícono de insignia es un truco del render por strings: en React es directo.

---

## 2. DIAN (`src/s_dian.js`)

### 2.1 Menú y navegación
- Quita `renta` del grupo `informes` y `calendario` del grupo `agenda`; inserta antes de la sección "Seguimiento" una sección **"Impuestos"** con el grupo `dian` (`'DIAN'`, ícono `landmark`, fondo `b-red`) con: `renta` "Declaración de renta" (file-check), `calendario` "Calendario fiscal y laboral" (calendar), `contador` "Acceso de tu contador" (user-round-check). `GISO.dian='renta'` (isotipo del grupo).

### 2.2 Constantes
- `UVTD = {2024: 47065, 2025: 49799, 2026: 52374}`; `uvtY(y) = +S.cfg.uvt[y] || UVTD[y] || uvtHoy()` (el usuario puede sobrescribir la UVT del año desde la barra superior).
- Año gravable por defecto `RENTAY = año actual − 1`; selector con 2024, 2025, 2026 ("{v} (declaras en {v+1})").
- "¿Quién declara?" (`RQUIEN`): cualquier miembro de `S.perfil.miembros` con `id`; por defecto `titularId()` = primer miembro cuyo `rol` contiene "titular", o el primero, o `'familia'`.
- `esDe(x,mid)`: el registro es de `mid` si `x.quien===mid`, o si `mid` es el titular y `x.quien` vacío o `'familia'`.
- `mensual(x) = conv(x.valor, x.moneda) × FREC[x.frec]`.
- `salarioDe(mid)` = Σ ingresos de `mid` cuyo `cat+' '+concepto` contiene "salari": usa `bruto × FREC` si hay `bruto`, si no `mensual(x)`. (Salario **mensual**.)

### 2.3 Datos por año y persona — `S.renta[y].por[mid]`
`rData(y,mid)` crea/normaliza:
```
S.renta[y] = { docs:{}, consig:0, consumos:0, por:{ [mid]: { docs:{}, consig, consumos, ing:{}, ded:{} } } }
```
Migración heredada: al crear la entrada del **titular**, copia `Y.docs`, `Y.consig`, `Y.consumos` del formato viejo (un solo declarante). Otros miembros arrancan vacíos.
- `ing[k]`: valores manuales de ingresos (si vacío → se usa el estimado). Claves = `RIK`.
- `ded[k]`: deducciones. Claves = `RDK`.
- `docs[k]`: checklist booleano (claves de `RDOCS`).
- `consig`, `consumos`: montos anuales para los topes.
- Edición: `data-x="rf" data-f="ing.lab"` etc. Vacío ⇒ `delete` la clave (vuelve al estimado). `parseMoney()` para montos.

### 2.4 Ingresos automáticos — `rentaAuto(y, mid)` (literal)
```
sal = salarioDe(mid)                                   // mensual
by(re) = Σ_{ingresos de mid que casan re y NO son salario} mensual(x) × 12
hon = by(/honorar|independ|servicio|freelance|contrato/i)
arr = by(/arriend/i)
pen = by(/pensi[oó]n/i)
otr = Σ ingresos de mid que NO casan /salari|honorar|independ|servicio|freelance|contrato|arriend|pensi[oó]n/i → mensual×12
fin    = (mid es titular) ? Σ inv(x).bruto de S.inversiones : 0
retInv = (mid es titular) ? Σ inv(x).ret : 0
lab = sal × 13                    // 12 meses + 1 salario de primas
ces = sal × 1.12                  // cesantías + intereses 12 %
fsp = sal ? fspPct(sal)/100 : 0
aportes = sal×12×(0.08+fsp) + hon×0.4×0.285     // 4 % salud + 4 % pensión + FSP; indep.: base 40 % × (12,5 % + 16 %)
retLab = sal ? retEmpleado(sal, sal×(0.08+fsp)) × 12 : 0   (try/catch)
return { lab, hon, ces, arr, fin, pen, otr, aportes: round(aportes), ret: round(retLab+retInv), volun:0, afc:0, sal }
```

### 2.5 Claves de ingresos (`RIK`) — pestaña Ingresos
| k | Etiqueta | Ayuda |
|---|---|---|
| lab | Salarios, primas y otros pagos laborales | Del certificado de ingresos y retenciones (formulario 220) de tu empleador. |
| hon | Honorarios o trabajo independiente | Lo que facturaste o te pagaron por servicios. |
| ces | Cesantías e intereses de cesantías | Lo que te consignaron en el año. |
| arr | Arriendos que recibiste | Total del año. |
| fin | Rendimientos financieros | Intereses de CDT, cuentas y fondos (certificados bancarios). |
| pen | Pensión | Si recibes pensión. |
| otr | Otros ingresos | Lo que no encaja arriba. |
| aportes | Aportes obligatorios a salud y pensión | Lo que te descontaron (o pagaste como independiente). No pagan impuesto. |
| volun | Aportes voluntarios a pensión | Certificado del fondo. |
| afc | Ahorro en cuentas AFC o AVC | Certificado del banco. |
| ret | Retenciones en la fuente que te hicieron | Suma de los certificados (empleador, bancos). Se restan del impuesto. |

UI: input con placeholder = estimado; pastilla "Del certificado" (manual) / "Estimado" / "Sin dato". Nota: "Deja vacío para usar el valor estimado (gris). Los salarios incluyen 12 meses más las primas."

### 2.6 Deducciones (`RDK`) — pestaña Deducciones
| k | Etiqueta | Ayuda | Tope UVT mostrado |
|---|---|---|---|
| intViv | Intereses del crédito de vivienda | Certificado del banco. Tope 1.200 UVT al año. | 1200 |
| prep | Medicina prepagada o póliza de salud | Tope 16 UVT al mes (192 al año). | 192 |
| gmf | 4×1000 que pagaste (GMF) | Certificado bancario: se deduce el 50%. | — |
| icetex | Intereses de crédito ICETEX | Tope 100 UVT al año. | 100 |
| fe | Compras con factura electrónica pagadas con tarjeta o transferencia | Puedes restar el 1% (tope 240 UVT), fuera del límite del 40%. | — |

### 2.7 Cálculo — `calcRenta(y, mid)` (literal)
```
U = uvtY(y); A = rentaAuto(y,mid); R = rData(y,mid)
g(k)  = (R.ing[k] definido y ≠ '' y ≠ null) ? +R.ing[k] : (A[k] || 0)
dd(k) = +R.ded[k] || 0
lab,hon,ces,arr,fin,pen,otr,aportes,volun,afc,ret = g(...)

trabajo = lab + hon + ces
brutos  = trabajo + arr + fin + otr + pen
RL      = max(0, trabajo + arr + fin + otr − aportes)        // la pensión NO entra aquí

// Cesantías exentas (art. 206 num. 4) según salario promedio mensual en UVT
salProm = A.sal || lab/13 ;  su = salProm / U
cesPct = su<=350 ? 1 : su<=410 ? .9 : su<=470 ? .8 : su<=530 ? .6 : su<=590 ? .4 : su<=650 ? .2 : 0
cesEx  = ces × cesPct

vol = min(volun + afc, 0.3×(lab+hon), 3800×U)
nD  = depsDe(mid).length

// Dependientes: elige la combinación más conveniente
d10  = nD ? min(0.1×(lab+hon), 384×U) : 0                   // 32 UVT/mes × 12
opA  = d10 + min(max(nD−1,0),4) × 72×U                      // 10 % con uno y 72 UVT con los demás
opB  = min(nD,4) × 72×U                                      // 72 UVT por cada uno
useA = nD && opA >= opB
dep10 = useA ? d10 : 0
dep72 = nD ? (useA ? min(nD−1,4) : min(nD,4)) × 72×U : 0

intViv = min(dd('intViv'), 1200×U)
prep   = min(dd('prep'), 192×U)
gmf    = dd('gmf') × 0.5
icetex = min(dd('icetex'), 100×U)
fe     = min(dd('fe') × 0.01, 240×U)

base25 = max(0, trabajo − aportes − (dep10+intViv+prep+gmf+icetex) − cesEx − vol)
r25    = min(base25 × 0.25, 790×U)

sub = cesEx + vol + dep10 + intViv + prep + gmf + icetex + r25
lim = min(0.4×RL, 1340×U)
apl = min(sub, lim)

penGrav = max(0, pen − 12000×U)                               // pensión exenta hasta 1.000 UVT/mes
RLG  = max(0, RL − apl − dep72 − fe) + penGrav
impU = tarifa241(RLG / U)
imp  = round(impU × U / 1000) × 1000                          // redondeo a miles
saldo = imp − ret                                             // >0 a pagar; <0 a favor
return {U,A,lab,hon,ces,arr,fin,pen,otr,aportes,volun,afc,ret,trabajo,brutos,RL,cesEx,cesPct,vol,nD,dep10,dep72,useA,
        intViv,prep,gmf,icetex,fe,r25,sub,lim,apl,recorte:sub−apl,RLG,imp,saldo}
```
**Tabla art. 241** (`tarifa241(u)`, u en UVT, devuelve UVT):
```
u<=1090: 0
u<=1700: (u−1090)×0.19
u<=4100: (u−1700)×0.28 + 116
u<=8670: (u−4100)×0.33 + 788
u<=18970: (u−8670)×0.35 + 2296
u<=31000: (u−18970)×0.37 + 5901
else:     (u−31000)×0.39 + 10352
```

### 2.8 Patrimonio — `patrimonio(mid)` (literal)
```
tit = (mid === titularId())
B = bienes con (b.duenio || titularId()) === mid
linked = set de b.aid (activos de "Mi dinero" ya importados como bien)
cuentas  = tit ? Σ conv(activos con cod que empieza por '11' y no linked) : 0     // PUC 11 = disponible
otrosAct = tit ? Σ conv(activos con cod que NO empieza por '11' y no linked) : 0
invs     = tit ? Σ conv(inv(x).valor, x.moneda) : 0
cobr     = tit ? Σ engine(L).saldo de S.cobrar : 0
bv       = Σ_B bValor(b) × (+b.pct||100)/100
deudas   = tit ? Σ conv(pasivos) + Σ engine(L).saldo de S.pagar : 0
bruto = cuentas + otrosAct + invs + cobr + bv ; liquido = bruto − deudas
bValor(b) = b.tipo==='inmueble' ? max(+costo||0, +avaluo||0) : (+valor31 || +costo || +avaluo || 0)
```

### 2.9 Topes — `topes(y, mid)` (¿Debo declarar?)
`gas` = Σ gastos del año (solo titular); `tc` = Σ compras de `S.tarjetas[].compras` del año (solo titular).

| Etiqueta | Valor | Tope UVT | Descripción |
|---|---|---|---|
| Ingresos brutos del año | `C.brutos` | 1.400 | Salario, primas, honorarios, arriendos, rendimientos… |
| Patrimonio bruto al 31 de diciembre | `P.bruto` | 4.500 | Todo lo que tienes: cuentas, inversiones, casa, carro, lo que te deben. |
| Compras con tarjeta de crédito | `tc` | 1.400 | Total pagado con tarjetas de crédito en el año. |
| Compras y consumos totales | `max(gas, R.consumos)` | 1.400 | Todo lo que gastaste en el año. |
| Consignaciones y depósitos bancarios | `R.consig` | 1.400 | Todo lo que te entró a tus cuentas en el año. |

Cada uno → `{l, v, u, d, tope: u×U, pasa: v >= u×U}`. **Veredicto**: `debe = algún pasa`; `cerca = !debe && algún v >= 0,85×tope`. Textos: "Sí, todo indica que debes declarar renta" / "Estás cerca de los topes: revisa con cuidado" / "Por ahora no superas los topes para declarar". La pestaña también tiene inputs "Consignaciones del año (aprox.)" (hint "Suma lo que te entró a tus cuentas.") y "Consumos totales del año (si no los registraste todos)".

### 2.10 Pestañas de "Declaración de renta" (`RTABS`)
Cabecera: `pageH` con botones **Informe** (`rInforme`) y **Excel** (`rExcel`); texto con enlace a `#contador` (oculto en modo contador). Barra `r-bar`: Año gravable, ¿Quién declara?, UVT del año (editable, tip con las 3 UVT). Pestañas (`data-act="rTab"`, `RTAB` en memoria, hace scroll al tope y centra la pestaña):

| # | k | Nombre | Ícono | Contenido |
|---|---|---|---|---|
| 1 | resumen | Resumen | layout-dashboard | Veredicto (si/cuidado/no) con nombre y año; fecha límite si es el titular y tiene dígitos (`rentaFecha(S.perfil.digitos)`), si no invita al Calendario fiscal. 3 KPIs: Impuesto estimado a pagar / Saldo estimado a favor (`|saldo|`, "Impuesto X − retenciones Y"), Patrimonio líquido ("Bienes − deudas"), Ingresos brutos del año. "Tu ruta para declarar" (n de 5): Revisa tus ingresos (ok si hay alguna clave en `R.ing`), Registra tus bienes (ok si hay bienes o activos), Revisa tus dependientes (ok si algún miembro tiene `depDe===mid`; muestra n válidos), Agrega tus deducciones (ok si algún `ded>0`), Reúne los documentos (ok si `listos >= 60 % de RDOCS`) + paso extra "Comparte con tu contador" (no en modo contador). Nota de alcance (no incluye dividendos, ganancias ocasionales, anticipo). |
| 2 | topes | ¿Debo declarar? | scale | Ver 2.9, cada tope con barra de progreso roja/lima y "Tope: N UVT = $". |
| 3 | ingresos | Ingresos | arrow-down-to-line | Ver 2.5. |
| 4 | bienes | Bienes | house | Tabla: Bien (ícono por tipo, tipo, ciudad, "desde fecha"), Identificación (+ entidad), Costo fiscal, Avalúo, %, Valor a declarar, acciones editar/eliminar (`data-act=del data-col=bienes`). Pie "Total bienes". Botones "Traer de Mi dinero" (`bImport`) y "Agregar bien". Nota: inmuebles al mayor entre costo y avalúo catastral. Si es titular: tarjeta "También suman a tu patrimonio (de Mi dinero)": Cuentas y efectivo, Inversiones, Lo que te deben, Otros bienes sin detalle. |
| 5 | deudas | Deudas | receipt | Solo titular (otros: "Las deudas registradas en Mirai se asignan al titular del libro."). Lista pasivos (nombre, nombre PUC por `cod` o "Deuda") y préstamos `pagar` (nombre/contacto/desc/"Crédito", entidad/"Préstamo", saldo motor). Total. Nota: pedir certificado al 31 dic. |
| 6 | dependientes | Dependientes | baby | Tarjetas por cada miembro distinto del declarante: avatar, rol, edad, documento, pastilla (válido / motivo / "Lo declara X" / "No es tu dependiente"), botón "Datos" (modal `depend`). Tarjeta "¿Cuánto te ahorran?": `dep10` y `dep72` con explicación y la combinación elegida. |
| 7 | deducciones | Deducciones | badge-percent | Inputs de `RDK` + "Cómo quedan aplicadas": Cesantías exentas (pct), Aportes voluntarios y AFC, Dependientes (10%), Intereses de vivienda, Medicina prepagada, 50% del 4×1000, Intereses ICETEX, Renta exenta del 25% → Subtotal → Límite 40 % / 1.340 UVT ("Pierdes $X por el límite" si `recorte>0`) → Aplicado → Fuera del límite (dep72 + fe). |
| 8 | documentos | Documentos | folder-check | Checklist `RDOCS` ("n de 9"); "Tu contador ve este avance". |
| 9 | borrador | Borrador del impuesto | calculator | "Cédula general · formulario 210". Líneas `rLines(C)` + tabla art. 241 resaltando el tramo actual y "Tu renta gravable: N UVT". |

`rLines(C)` (usado en borrador, informe y Excel):
```
Ingresos brutos                                          C.brutos
− Aportes obligatorios a salud y pensión (no gravados)   −C.aportes
= Renta líquida                                          C.RL
− Rentas exentas y deducciones (con límite)              −C.apl
− Dependientes adicionales (72 UVT)                      −C.dep72
− 1% compras con factura electrónica                     −C.fe
= Renta líquida gravable                                 C.RLG
Impuesto según la tabla del artículo 241                 C.imp
− Retenciones en la fuente                               −C.ret
= Saldo estimado a pagar | = Saldo estimado a favor      |C.saldo|
```

### 2.11 Documentos (`RDOCS`, en `f_extra.js`)
| k | Documento | Ayuda |
|---|---|---|
| cir | Certificado de ingresos y retenciones (formulario 220) | Te lo da tu empleador entre febrero y marzo. |
| banc | Certificados bancarios con saldos al 31 de diciembre | Cada banco lo genera en su app o página. |
| cdt | Certificados de rendimientos financieros y retención (CDT, fondos) | De cada entidad donde tengas inversiones. |
| cred | Certificados de deudas al 31 de diciembre | Créditos, tarjetas e hipoteca. |
| hip | Certificado de intereses pagados por crédito de vivienda | Son deducibles: pueden bajar tu impuesto. |
| pens | Certificados de aportes voluntarios a pensión o cuentas AFC | Pueden ser rentas exentas. |
| salud | Certificado de medicina prepagada o pólizas de salud | Deducción hasta un tope mensual. |
| dep | Datos de tus dependientes económicos | Hijos o personas a cargo: dan derecho a una deducción. |
| bienes | Valor de tus bienes (avalúo catastral, vehículo) | Del impuesto predial y vehicular. |

(Solo checklist; no se suben archivos.)

### 2.12 Bienes (`S.bienes[]`)
Tipos `BTIP`: `inmueble` Casa, apartamento o lote (house) · `vehiculo` Carro o moto (car) · `cuenta` Cuenta bancaria o efectivo (landmark) · `inversion` CDT, fondo o acciones (trending-up) · `cripto` Criptomonedas (bitcoin) · `exterior` Bien o cuenta en el exterior (globe) · `cobrar` Plata que te deben (hand-coins) · `otro` Otro bien (tag).

Modelo: `{id, aid?, tipo, nombre, ident, entidad, costo, avaluo, valor31, fechaAdq, duenio, pct, predial, impVeh, soat}`.

Modal `bien` (título "Agregar un bien"/"Editar bien"; desc "Lo que tienes a tu nombre al 31 de diciembre. Sirve para la declaración de renta y para calcular el predial y el impuesto vehicular."; `MDESC.bien` "Casas, carros, cuentas e inversiones para tu declaración de renta."):
- Selector visual de tipo (4 columnas).
- Nombre* (ph "Ej. Apartamento Cedritos"); Identificación (ph "Matrícula inmobiliaria, placa o número de cuenta"; tip matrícula/chip, placa, número y banco); Entidad, ciudad o lugar (ph "Bogotá · Banco · Notaría").
- Costo de compra (costo fiscal) (tip: lo pagado + mejoras + escrituración, o lo declarado el año anterior); Avalúo catastral o comercial (tip: catastral del predial; vehículo: comercial del recibo vehicular).
- Saldo o valor al 31 de diciembre — **solo** tipos cuenta, inversion, cripto, exterior, cobrar, otro.
- Fecha de compra; ¿De quién es? (miembros); Porcentaje tuyo (%) (tip sociedad).
- Predial del año (solo inmueble; si vacío se estima); Impuesto vehicular y SOAT (solo vehículo).
- Validación: nombre obligatorio ("Escribe el nombre del bien"). `pct = min(100, max(1, +pct||100))`. Toast "{nombre} quedó en tus bienes." / "Bien guardado".

`bImport` ("Traer de Mi dinero"): por cada activo con `cod` que no empieza por 11 y no importado (`aid`), crea bien con `tipo = cod 1516 → inmueble, 1540 → vehiculo, otro`, `costo = conv(valor)`, `pct 100`, dueño titular. Toast "Traje N bien(es)… Completa el costo fiscal y el avalúo." / "No hay bienes nuevos en Mi dinero."

### 2.13 Dependientes
Campos en el miembro (`S.perfil.miembros[]`): `depDe` (id de quien lo declara o ''), `depRel` (`hijo|conyuge|padre|hermano`), `nac`, `doc`, `estudia`, `sinIng`, `discap`.
- Parentesco inferido si falta `depRel`: rol con "hij" → hijo; "cónyuge/conyuge/pareja" → conyuge; "padre/madre" → padre; "herman" → hermano.
- `depInfo(m)` (literal):
  - sin `depDe` → no ("No marcado como dependiente").
  - hijo: discapacidad → sí ("Hijo con dependencia por discapacidad"); sin fecha → **sí** ("Agrega la fecha de nacimiento para confirmar"); < 18 → sí ("Menor de 18 años (e)"); ≤ 23 y estudia → sí ("e años y estudia (educación superior o técnica)"); si no → no ("e años: solo cuenta si estudia" si ≤23, si no "e años: solo cuenta con discapacidad").
  - cónyuge/padre/hermano: sí si `sinIng || discap` ("Sin ingresos mayores a 260 UVT o con discapacidad"), si no "Cuenta solo si no tuvo ingresos mayores a 260 UVT en el año".
  - otro → "Este parentesco no da deducción".
  - Edad calculada a **hoy**, no al 31 dic del año gravable.
- `depsDe(mid)` = miembros con `depDe===mid` y `ok`.
- Modal `depend` ("Datos de {nombre}", desc "Para saber si cuenta como tu dependiente en la declaración de renta."; `MDESC.depend` "Hijos y familiares que dependen de ti: reducen tu impuesto de renta."): ¿Es dependiente económico de…? ("De nadie (no lo uso en renta)" + otros miembros; tip "Solo una persona puede tomarlo como dependiente."), Parentesco para la DIAN, Fecha de nacimiento, Documento (ph "TI / RC / CC y número"), ¿Estudia? (No / Sí, educación superior, técnica o tecnológica), ¿Tuvo ingresos en el año? ("No, o menos de 260 UVT" por defecto / "Sí, más de 260 UVT"), ¿Tiene discapacidad que genere dependencia?. Toast según validez (warn si no cuenta).

### 2.14 Exportes
**Informe / PDF (`rInforme`)**: abre ventana nueva con documento HTML (`<title>Renta {Y}</title>`, fuente Segoe UI, color `#1F2B4B`, h2 con borde lima `#9EDB4E`, botón "Imprimir o guardar PDF" que llama `print()` y se oculta al imprimir). Si el navegador bloquea la ventana, descarga `renta-{Y}.html`. Contenido `rInformeHtml(y,mid)`:
1. "Información para la declaración de renta {y}" · nombre · "Generado por Mirai el {fecha}" · UVT.
2. ¿Debe declarar? (cada tope con valor y "· SUPERA").
3. Ingresos, aportes y retenciones (11 filas `RIK` con valores de `calcRenta`).
4. Patrimonio al 31 de diciembre: cada bien "nombre · ident (pct%)", Cuentas y efectivo, Inversiones, Cuentas por cobrar, Otros bienes, **Patrimonio bruto**, Deudas, **Patrimonio líquido**.
5. Dependientes ("nombre · doc" → motivo) o "Ninguno".
6. Deducciones (5 filas `RDK`).
7. Borrador del impuesto (estimado) = `rLines`.
8. Documentos ("✔ Listo" / "Pendiente").
9. Pie "Estimación orientativa. El valor final lo determina el contador."

**Excel (`rExcel`)** → archivo `mirai-renta-{Y}.xls`, MIME `application/vnd.ms-excel;charset=utf-8`, formato **SpreadsheetML 2003**:
```
<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Worksheet ss:Name="(máx 30 car.)"><Table><Row><Cell><Data ss:Type="Number|String">…</Data></Cell>…</Row></Table></Worksheet>…
</Workbook>
```
Números → `Math.round`; texto escapado `< & > "`. Hojas y columnas:
| Hoja | Encabezados | Filas |
|---|---|---|
| Borrador | Concepto, Valor | `rLines(C)` |
| Ingresos | Concepto, Valor | `RIK` con `C[k]` |
| Bienes | Tipo, Nombre, Identificación, Entidad, Costo fiscal, Avalúo, Saldo 31 dic, %, Valor a declarar | bienes del declarante |
| Cuentas | Cuenta, Moneda, Valor | **todos** `S.activos` |
| Inversiones | Inversión, Entidad, Capital, Valor hoy, Rendimientos, Retención | `S.inversiones` con `inv(x)` |
| Deudas | Deuda, Saldo | pasivos + préstamos `pagar` |
| Dependientes | Nombre, Documento, Nacimiento, Motivo | `depsDe(mid)` |
| Deducciones | Concepto, Valor | `RDK` |
| Gastos {Y} | Fecha, Descripción, Categoría, Valor, Medio | gastos del año |

`downloadFile` se envuelve: fuera de claude.ai crea `<a download>` con Blob (tipo por extensión: json/xls/html/text), toast "Descargado: {nombre}". (Excel muestra aviso de formato: conocido.)

### 2.15 Calendario: valor estimado — `calEst(c)` (literal)
Insumos: `salT` = Σ `salarioDe` de todos los miembros con id (o, sin miembros, Σ ingresos "salari" mensuales); `nom` = primeros nombres con salario; `inm` y `veh` = bienes por tipo; `vehA` = vehículos de bienes `{n, v: avaluo||costo, imp: impVeh, soat}` o, si no hay, activos `cod 1540`; `vehTar(v) = v<=60e6 ? 0.015 : v<=135e6 ? 0.025 : 0.035`; `fij(re)` = fijos cuyo `nombre+cat` casa `re`.

| Regla (clave `c.k` o título) | Resultado |
|---|---|
| `/prima/` o "prima de servicios" | `salT/2` — "Medio salario de {nom}." (null si no hay salario) |
| `int_ces` o "intereses sobre cesant" | `salT×0.12` — "12% de tus cesantías (un salario al año)." |
| `ces` o "cesant" | `salT` — "Un mes de salario por año trabajado." |
| `^dot` o "dotaci" | v 0; si hay miembros con salario ≤ 2×SMMLV: "Aplica para {nombres}…" txt "En especie"; si no: "No aplica…" txt "No aplica" |
| `renta` o "declaración de renta" | `y = año(c.nx || c.fecha) − 1`; `C=calcRenta(y, titular)`: si `saldo>0` → v=saldo ("Estimado con el borrador del año y: impuesto − retenciones"), si no v 0, txt "A favor"; `go:'renta'` |
| `^pred` o "predial" | sin inmuebles → "Registra tu casa o lote…" txt "Sin datos" go renta; si no `Σ (predial || (avaluo||costo)×0.007) × pct/100` × 0.9 si `k==='pred_bog'` o título con "descuento" |
| `^veh` o "vehicular" | sin vehículos → "Registra tu vehículo para estimarlo." txt "Sin datos"; si no `Σ (imp || v×vehTar(v))` × 0.9 si `veh_bog`/"descuento" |
| `soat` | Σ soat registrados; si hay vehículos sin SOAT → txt "Falta el valor"; si no null |
| `matri` o "matrícula" | Σ valor de fijos /colegio|pensión escolar|jardín|universidad/ ("Aprox. una mensualidad… Útiles aparte.") |
| `arriendo` | Σ fijos /arriendo|canon/ × 0.051 ("Hasta 5,1% más al mes (IPC 2025)…") |
| `navidad` o "diciembre|navidad" | (gasto de diciembre del año anterior − promedio mensual de ese año) si es mayor; si no `salT/2×0.3` ("Sugerencia: 30% de tu prima de diciembre.") |
| otro | null |

`calVal(c) = +c.monto || calEst(c)?.v || 0`. `calEstHtml(c)`: caja "Estimado: $X · cómo" con botón "Usar este valor"/"Usar el estimado" (`calEstUse` → `c.monto = round(v)`, toast "Valor actualizado") y "Ver detalle" si `go`. Oculto el botón en modo contador.

### 2.16 Acceso del contador (cifrado de extremo a extremo)
**Requisito**: servidor conectado (`srvOk()`); si no, alerta "Necesitas tu servidor Mirai" con botones Conectar servidor / Informe para el contador / Descargar Excel.

**Modelo local** `S.dian.accesos[]`: `{id, k, label, email, perms:'renta'|'todo', exp: ISO|null, created: 'YYYY-MM-DD', push?: ISO}`. **La llave `k` vive en el estado del titular** (localStorage).

**Creación (`accNew`)**:
- Formulario: Nombre de tu contador* (ph "Ej. Marcela Rojas"), Correo (opcional), ¿Qué puede ver? (`renta` "Lo de la declaración de renta" / `todo` "Todo mi libro (solo lectura)"), ¿Hasta cuándo? (30 días / 3 meses [defecto] / Hasta el 31 de diciembre de {año} 23:59 / Hasta que yo lo quite).
- `id = b64url(18 bytes aleatorios)` (24 car.), `k = b64url(32 bytes aleatorios)` (43 car.).
- `accPush(a)` y luego se agrega a la lista, `commit`, copia el enlace al portapapeles, toast "Copiamos el enlace para {nombre}. Envíaselo por un medio seguro." / "Acceso creado".
- **Enlace**: `{(srvCfg().url || location.origin) sin "/" final}/?contador={id}#k={k}`.

**Cifrado (WebCrypto)**:
- Llave: `importKey('raw', 32 bytes, 'AES-GCM')` → AES-256-GCM.
- `encJSON(obj, raw)`: `iv = 12 bytes aleatorios`; `data = UTF-8(JSON.stringify(obj))`; si existe `CompressionStream` → gzip y `gz=true`; `ct = encrypt(AES-GCM, iv)` (incluye la etiqueta de 16 bytes al final, comportamiento WebCrypto).
- **Formato del blob**: `base64(iv) + "." + base64(ct) [+ ".gz"]` — base64 estándar (no URL-safe).
- `decJSON`: split por ".", descifra y, si hay tercer segmento, descomprime gzip.
- **Verifier** (para autorizar notas): `hex(SHA-256(rawKey ‖ UTF-8("mirai-notas")))`.

**Contenido cifrado** `accSnapshot(a)`:
```
{ S: subconjunto, owner: S.perfil.nombre, perms, at: ISO }
perms 'todo'  → todas las claves de S excepto chats, consejos, correoIds, calIds
perms 'renta' → v, perfil, ingresos, activos, pasivos, inversiones, cobrar, pagar, bienes, renta, calendario, tarjetas, gastos, fijos, cfg
               con cfg reducido a {uvt, smmlv, trm, categorias} y gastos solo de RENTAY y RENTAY+1
si viene dian → dian.accesos = []   (nunca se filtran las llaves)
```
`accPush` → `PUT /api/shares/{id}` con `{label, email, perms, expires_at: exp|null, verifier, blob}`; marca `a.push`.

**Sincronización automática**: `commit()` envuelto: si no es modo contador, hay accesos vigentes (`!exp || exp > ahora`) y servidor, **15 s después** (debounce) re-sube el snapshot de cada acceso vigente y guarda localmente (`store.set`).

**Pantalla "Acceso de tu contador"**: 4 pasos explicativos (Creas un enlace · Se cifra en tu equipo · Tu contador entra · Te deja notas); "Accesos creados" con botón Actualizar; por acceso: avatar, nombre, alcance, vence/venció/sin vencimiento, "Entró {fecha} (N veces)" o "Aún no ha entrado" (de `GET /api/shares`: `last_access`, `views`), "Datos actualizados {fecha}…"; acciones **Copiar enlace** (fallback `prompt`), **Enviar** (si hay correo: `POST /api/notify` email con asunto "{titular} te dio acceso a su información en Mirai" y texto con el enlace), **WhatsApp** (`https://wa.me/?text=…` con el enlace), **refrescar** (`accPushNow`, toast "Tu contador ya ve los datos más recientes."), **Quitar acceso** (`DELETE /api/shares/{id}` ignorando errores + lo quita local; toast "{nombre} ya no puede entrar." / "Acceso quitado"). Acceso vencido con clase `off`. Notas: últimas 6, propias marcadas "Tú"; caja "Responder a {nombre}…". Nota de seguridad: "El enlace contiene la llave… quita el acceso."

**Notas** (`accNote(id,k,text,by,name)`): `note = encJSON({text, by:'titular'|'contador', name})` → `POST {base}/api/public/share/{id}/notes` (sin token) con `{verifier, note}`. Base = `location.origin` si está en modo contador; si no `srvCfg().url || location.origin`. `accLoad()` del titular: `GET /api/shares`, descifra las notas de cada acceso con su llave; errores se muestran como alerta "No pude consultar tu servidor".

**Portal del contador (`contBoot`)** — se activa si la URL trae `?contador=` (`CONT_Q`; `z_boot.js`: `if(CONT_Q) contBoot(); else normalBoot();`):
1. `body.cont`; oculta login local (`authHide`); vacía el sidebar; tarjeta "Abriendo la información… / Descifrando los datos en tu equipo."
2. Lee `k` del fragmento. Sin llave → "El enlace está incompleto: falta la llave. Pídele el enlace completo a tu cliente."
3. `GET {location.origin}/api/public/share/{id}` (sin token). Error → mensaje del servidor o "No se pudo abrir el acceso."
4. Descifra blob y notas (notas que fallan se descartan). `CONT = {id, k, label, perms, owner, at, notes, exp}`.
5. Desactiva persistencia: `store.set = noop`, `commit = noop`, `scheduleCloud = noop`. `S = normalize({...D.S, v:3})`; `S.cfg.gami=false`. **Borra el fragmento de la URL** (`history.replaceState`).
6. Menú: si `perms !== 'todo'` deja solo la sección "Impuestos" y el grupo DIAN **sin** "Acceso de tu contador". Siempre agrega sección "Contador" con ítem `cnotas` "Notas con {primer nombre del titular}".
7. `location.hash='renta'`.
8. Error → tarjeta "No se pudo abrir" + mensaje.
- **Render en modo contador** (envoltura de `render`): banner `cont-bar` "Portal del contador · {titular}" / "Solo lectura · datos del {at} · acceso hasta el {exp}" con botones Excel y PDF; deshabilita todos los `input`/`textarea` del main excepto `#contNote` y los de `.r-bar` (año, quién, UVT siguen activos, pero sin persistir); elimina `[data-modal]`, `[data-act=del]`, `[data-act=create]`, `.composer`, `.sb-create`. `RO()` (body.cont) oculta botones de edición en las vistas DIAN.
- Vista `cnotas`: "Notas con {titular}" — "Pide documentos, aclara dudas o avisa cuando la declaración esté lista. Las notas van cifradas." Lista de notas (las del contador = "Tú") + caja "Escribe una nota para {nombre}…" → `contNote` (by `contador`, name = label del acceso).
- `HELP.renta` (5 pasos) y `HELP.contador` (4 pasos); `MDESC.contador='Acceso para tu contador.'`.

### Ojo al migrar (DIAN y contador)
1. Topes usan `>=` también para patrimonio (la norma dice "> 4.500 UVT").
2. La edad de dependientes se calcula a hoy, no al 31-dic del año gravable; hijo sin fecha cuenta como válido.
3. `rentaAuto` solo atribuye inversiones, cuentas por cobrar y deudas al titular; las tarjetas/gastos para topes también solo al titular.
4. `fe` no forma parte del `sub` ni del límite (correcto según norma) pero sí resta en `RLG`.
5. Excel "Cuentas" exporta **todos** los activos (no solo cuentas) y todas las inversiones/deudas aunque el declarante no sea el titular.
6. Año del selector fijo 2024–2026; UVT 2027 no existe en `UVTD`.
7. Con `perms='todo'` el menú del portal conserva "Acceso de tu contador" (la vista mostraría el formulario sin datos de accesos). Revisar.
8. El servidor guarda el `verifier` del **primer** PUT y nunca lo reemplaza (correcto para que no lo cambie nadie, pero si se re-crea un id distinto no aplica).
9. `contBoot` siempre pide a `location.origin`: el enlace debe apuntar al mismo dominio del servidor (lo garantiza `accBase`).
10. La llave del contador vive en claro en `S.dian.accesos` del titular: en Supabase con cuentas reales, **no** guardarla en el servidor en claro (o cifrarla con una llave del usuario).

---

## 3. Servidor (`server/`)

### 3.1 Entradas y despliegue
- **Núcleo** `lib/core.js` → `handle({method, path, headers, body, query}) → {status, json}`; `VERSION = '2.1.0'`.
- **Vercel** `api/[...path].js`: Node 20, `maxDuration 30`; aplica CORS, responde 204 a `OPTIONS`, parsea body string a JSON, pasa `pathname` y `searchParams`.
- **Express** `index.js`: `express.json({limit:'15mb'})`; `app.all(['/api/*','/cron/*'])` → `handle`; estáticos desde `public/` (`index.html`, extensiones html); **cron interno** opcional `INTERNAL_CRON=1` + `CRON_SECRET` → cada 60 min `POST /api/cron/send` con `x-cron-secret`. Puerto `PORT` (8080).
- `vercel.json`: `outputDirectory: public`, funciones `api/**/*.js` 30 s, **cron `/api/cron/send` con `"0 * * * *"` (cada hora)**.
- **CORS** `cors(origin)`: `ALLOWED_ORIGINS` (coma; defecto `*`). Si el origen no está permitido, **no** se envían cabeceras. Si sí: `Access-Control-Allow-Origin: <origin>`, `Vary: Origin`, `Allow-Headers: Content-Type, Authorization`, `Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`.
- Errores: `{ok:false, error}`; códigos 400 (validación), 401 (token/verifier), 404 (ruta/acceso), 500 (sin MIRAI_TOKEN), 502 (excepción interna, incluye mensaje del proveedor).

### 3.2 Autenticación
- Rutas privadas: cabecera exacta `Authorization: Bearer {MIRAI_TOKEN}` (comparación de strings directa). Un despliegue = un hogar.
- Cron: `CRON_SECRET` en `x-cron-secret` **o** `Authorization: Bearer …` (Vercel envía este). También responde cualquier ruta que empiece por `/cron/`.
- Públicas: `/api/public/share/:id` (id `[A-Za-z0-9_-]{16,64}`), protegidas por conocer el id (y el verifier para notas).

### 3.3 Rutas (orden de evaluación del router)
| Método y ruta | Auth | Request | Response |
|---|---|---|---|
| `GET/POST /api/cron/send` (y `/cron/*`) | CRON_SECRET | query `force=1` opcional | `{ok:true, processed:[{id, email?:n, emailError?, wa?:n, waError?}]}` |
| `GET /api/public/share/:id` | ninguna | — | `{ok, id, label, perms, expires_at, blob, notes:[{id,at,note}], updated_at}`; además incrementa `views` y fija `last_access`. 404 con "Este acceso fue revocado por el titular." / "Este acceso ya venció. Pídele al titular uno nuevo." / "Acceso no encontrado." |
| `POST /api/public/share/:id/notes` | `verifier` en body | `{verifier, note}` (note = blob cifrado, ≤ 20.000 car.) | `{ok, notes}`; agrega `{id: random base36 8, at: ISO, note}` y conserva las **últimas 200**. 401 "No autorizado." / 400 "Nota inválida." |
| `GET /api/health` | token | — | `{ok, version, store: 'supabase'|'firestore'|'file', email: proveedor|null, emailFrom, whatsapp: bool, whatsappTemplate, ai: ['anthropic'|'openai'|'gemini'…], cron: bool(CRON_SECRET), shares: true, encryption: bool(ENCRYPTION_KEY)}` |
| `GET /api/integrations` | token | — | `{ok, integrations: {[kind]: {...config, secrets: meta enmascarada, updated}}, providers: EMAIL_PROVIDERS}` |
| `PUT/POST /api/integrations/:kind` | token | `{provider?, ...config, secrets:{…}}` | `{ok:true}`; kind ∈ `email|whatsapp|ai_anthropic|ai_openai|ai_gemini` (si no: "Integración desconocida."); email exige provider válido ("Elige un proveedor: gmail, sendgrid, resend o smtp.") |
| `DELETE /api/integrations/:kind` | token | — | `{ok:true}` |
| `POST /api/integrations/:kind/test` | token | email/whatsapp: `{to}` | email: envía "Prueba de Mirai" / "¡Hola! Así te llegarán los avisos de Mirai." → `{ok, provider, id?}`; whatsapp: "Prueba de Mirai: así te llegarán tus avisos." → `{ok, provider, id, template}`; IA: prompt `Responde solo con el JSON {"ok":true}` con `json:true` → `{ok: /true/.test(texto), provider}` |
| `GET /api/shares` | token | — | `{ok, shares:[{id,label,email,perms,expires_at,revoked,notes,last_access,views,created_at,updated_at}]}` (Supabase sin blob ni verifier) |
| `PUT /api/shares/:id` | token | `{label, email, perms, expires_at, verifier, blob}` | `{ok:true}`. Valida blob presente ("Falta la información cifrada.") y ≤ 4.000.000 car. ("…máx. 4 MB"). Guarda `label≤120`, `email≤160`, `perms` ('todo' o 'renta'), `revoked:false`, `verifier` = el previo si existe, `notes`, `views`, `created_at` previos. |
| `DELETE /api/shares/:id` | token | — | `{ok:true}` (borra la fila: luego el portal dice "Acceso no encontrado.") |
| `POST /api/notify` | token | `{channel:'email'|'whatsapp', to, subject?, text, mode?}` | `{ok, provider, id?…}`; faltan to/text → 400. Asunto por defecto "Mirai". |
| `POST /api/ai` | token | `{provider, model?, prompt, images:[{mime,b64}], json:bool}` | `{ok:true, text}` |
| `POST /api/alerts/snapshot` | token | ver 3.8 | `{ok:true}`; sin `device` → 400 |
| otra | — | — | 404 "Ruta no encontrada." |

### 3.4 Integraciones guardadas y cifrado
- Tabla/colección `mirai_integrations`: `{kind, config (no secreto), secrets_enc, meta (máscaras), updated_at}`.
- `saveIntegration(kind, body)`: separa `secrets` del resto (`config`). Si cambia `provider` respecto al guardado, **descarta** los secretos anteriores; si es el mismo, conserva y fusiona. Secretos vacíos no sobrescriben. `meta[k] = mask(v) = '••••' + últimos 4`. `secrets_enc = encrypt(merged)` o `null`.
- `loadIntegration(kind)` = `{...config, ...decrypt(secrets_enc)}`.
- **Prioridad**: lo guardado desde la app gana; si no hay, variables de entorno.
- **`crypto.js`** (AES-256-GCM, Node): llave = `ENCRYPTION_KEY` decodificada base64 si mide 32 bytes; si no, `SHA-256(ENCRYPTION_KEY)`. Error si falta. Formato: `base64(iv12).base64(authTag16).base64(ciphertext)` (nótese: **distinto** del formato del contador, que va `iv.ct+tag[.gz]`).

### 3.5 Correo (`sendEmail({to, subject, text, html})`)
`EMAIL_PROVIDERS`: gmail (secreto `appPassword`; campos `user`, `fromName`), sendgrid (`apiKey`; `from`), resend (`apiKey`; `from`), smtp (`pass`; `host, port, secure, user, from`).
- Config por env si no hay en BD: `EMAIL_PROVIDER`, `EMAIL_FROM`, `SENDGRID_API_KEY`/`RESEND_API_KEY` (según proveedor), `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `GMAIL_APP_PASSWORD`. Sin config → "No hay proveedor de correo configurado. Configúralo en Mirai › Ajustes › Alertas y notificaciones."
- HTML por defecto: `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1F2B4B">` + texto escapado con `\n→<br>`.
- Remitente: gmail = `"{fromName} <{user}>"` o `user`; resto = `from`. Sin remitente → "Falta el remitente (correo "De")."
- **SendGrid**: `POST https://api.sendgrid.com/v3/mail/send` (override `SENDGRID_URL`), Bearer; body `{personalizations:[{to:[{email}]}], from:{email,name} (parsea "Nombre <correo>"), subject, content:[text/plain, text/html]}`. Error "SendGrid {status}: {300 car.}".
- **Resend**: `POST https://api.resend.com/emails` (override `RESEND_URL`), Bearer; `{from, to:[to], subject, text, html}` → devuelve `id`.
- **Gmail**: nodemailer `smtp.gmail.com:465 secure` con `user` + contraseña de aplicación.
- **SMTP**: nodemailer `host`, `port||587`, `secure` (bool o "true"), auth si hay `user`. Caché de un solo transporte por configuración.

### 3.6 WhatsApp Cloud API (`sendWhatsApp({to, text, mode})`)
- Config BD `{token, phoneId, template?, lang?, apiVersion?}` o env `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE`, `WHATSAPP_TEMPLATE_LANG` (es), `WHATSAPP_API_VERSION` (v21.0). Sin config → "WhatsApp no está configurado…".
- Número: solo dígitos; si quedan 10 → antepone `57` (Colombia).
- Si hay plantilla y `mode !== 'text'`: mensaje `type:'template'` con `template:{name, language:{code}, components:[{type:'body', parameters:[{type:'text', text: oneLine(text).slice(0,1000)}]}]}` (`oneLine` cambia saltos/tabs por " · " y compacta espacios). Si no: `type:'text'`, `text:{preview_url:false, body: text.slice(0,4000)}`.
- `POST {WHATSAPP_BASE_URL|https://graph.facebook.com}/{apiVersion}/{phoneId}/messages`, Bearer token. Respuesta `{provider:'whatsapp', id: messages[0].id, template: bool}`. Error "WhatsApp {status}: {mensaje}".

### 3.7 Proxy de IA (`aiCall`)
| Proveedor | Clave (BD `ai_x.apiKey` o env) | Modelo por defecto (env override) | Llamada |
|---|---|---|---|
| anthropic | `ANTHROPIC_API_KEY` | `claude-sonnet-4-5` (`ANTHROPIC_MODEL`) | `POST https://api.anthropic.com/v1/messages` (override `ANTHROPIC_URL`), headers `x-api-key`, `anthropic-version: 2023-06-01`; `max_tokens 2048`; un mensaje user con imágenes base64 primero y luego el texto. Respuesta: concatena `content[].text`. (`json` no se usa: el cliente agrega la instrucción.) |
| openai | `OPENAI_API_KEY` | `gpt-4o-mini` (`OPENAI_MODEL`) | `POST /v1/chat/completions`, Bearer; contenido `[text, image_url data:…]`; si `json` → `response_format:{type:'json_object'}`. Respuesta `choices[0].message.content`. |
| gemini | `GEMINI_API_KEY` | `gemini-2.0-flash` (`GEMINI_MODEL`) | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key=…`; `parts:[{text}, {inline_data:{mime_type,data}}]`; si `json` → `generationConfig.responseMimeType='application/json'`. Respuesta: concatena `parts[].text`. |

El modelo del body tiene prioridad sobre el guardado. Cliente (`n_servidor.js` `srvAdapter`): agrega "Responde únicamente con JSON válido, sin texto adicional." en modo json, y extrae el primer `{…}`/`[…]` con regex antes de `JSON.parse`. `aiPick` decide si usar Claude de claude.ai, servidor o clave propia (otro inventario).

### 3.8 Avisos programados (cron)
**Snapshot** (`POST /api/alerts/snapshot`, lo envía el navegador con `pushSnapshot()` 1,5 s después de cambiar ajustes `data-aj`):
```
{ device (id aleatorio del navegador, 'mirai-device'), nombre (primer nombre), email, wa,
  emailOn (email activo y vía 'srv'), waOn (wa activo y vía 'api'), hour (defecto 7), tz (IANA, defecto America/Bogota),
  frec ('diario'|'semanal'), hideAmt, anticipo (días, defecto 5),
  items: [{t, b, lvl, fecha:'YYYY-MM-DD'|'', ch:['email','wa'] según matriz S.cfg.nmat}]  (máx. 100) }
```
Se guarda fusionando con el previo (`updated` ISO); Supabase: `mirai_alert_snapshots(device, data jsonb, last_sent)`.

**`runCron(force)`** (cada hora en Vercel; cada 60 min con cron interno):
- Para cada snapshot: hora local (`Intl` en `s.tz`). Se **salta** si (no `force`) y (hora ≠ `+s.hour || 7` **o** ya se envió hoy `lastSent===fecha` **o** `frec==='semanal'` y no es lunes).
- `digest(s, canal)`: items cuyo `ch` incluye el canal y (`sin fecha` o `fecha <= hoy + anticipo`). Si no hay → nada.
  - Asunto: `Mirai: {n} aviso{s} para hoy`.
  - Texto: `Hola {nombre}, este es tu resumen de Mirai ({YYYY-MM-DD}):\n\n• {t} — {b}` (máx. 15 líneas, luego `…y N avisos más.`) + `\n\nAbre Mirai para ver el detalle.` Con `hideAmt` se borran los montos `$ 1.234.567` del detalle.
- Envía correo si `emailOn && email`; WhatsApp si `waOn && wa` (con plantilla si existe). Errores por canal se reportan (`emailError`, `waError`) sin detener.
- Marca `lastSent = fecha` **siempre** (aunque no haya enviado nada o haya fallado).

### 3.9 Almacenamiento (`lib/store.js`)
Selección: `STORE` | `ALERTS_STORE` | (`SUPABASE_URL` ? supabase : file). Interfaz común: `getIntegration, allIntegrations, putIntegration, delIntegration, allSnapshots, putSnapshot, getShare, listShares, putShare, delShare`.
- **supabase** (`@supabase/supabase-js`, `SUPABASE_SERVICE_ROLE_KEY`, sin sesión): upserts con `updated_at`; `allSnapshots` mapea `{id: device, ...data, lastSent: last_sent}`; `putSnapshot` fusiona `data` previo.
- **firestore** (`@google-cloud/firestore`): colecciones `mirai_integrations`, `FIRESTORE_COLLECTION|mirai_alerts`, `mirai_shares` (merge).
- **file**: JSON en `DATA_FILE|ALERTS_FILE|./data/mirai.json` con `{integrations, alerts, shares}`.

**Esquema Supabase** (`supabase/schema.sql`): 
- `mirai_integrations(kind text pk, config jsonb, secrets_enc text, meta jsonb, updated_at)`.
- `mirai_alert_snapshots(device text pk, data jsonb, last_sent text, updated_at)`.
- `mirai_shares(id text pk, label, email, perms text default 'renta', expires_at timestamptz, revoked bool, verifier text, blob text, notes jsonb default '[]', views int, last_access, created_at, updated_at)`.
- RLS activado en las 3, **sin políticas**, `revoke all` para `anon` y `authenticated` → solo `service_role`.

### 3.10 Variables de entorno (`.env.example`)
Obligatorias: `MIRAI_TOKEN`, `ENCRYPTION_KEY` (`openssl rand -base64 32`; **no cambiar** en un despliegue existente), `CRON_SECRET`, `ALLOWED_ORIGINS`. BD: `STORE`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATA_FILE`, `FIRESTORE_COLLECTION`, `INTERNAL_CRON`. Opcionales (la app tiene prioridad): `EMAIL_PROVIDER`, `EMAIL_FROM`, `SENDGRID_API_KEY`, `RESEND_API_KEY`, `GMAIL_APP_PASSWORD`, `SMTP_HOST/PORT/SECURE/USER/PASS`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TEMPLATE`, `WHATSAPP_TEMPLATE_LANG`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`. No documentadas pero leídas: `ANTHROPIC_MODEL`, `OPENAI_MODEL`, `GEMINI_MODEL`, `WHATSAPP_API_VERSION`, `SENDGRID_URL`, `RESEND_URL`, `ANTHROPIC_URL`, `WHATSAPP_BASE_URL`, `ALERTS_STORE`, `ALERTS_FILE`, `PORT`.

### Ojo al migrar (servidor)
1. `vercel.json` programa el cron **cada hora**, pero CLAUDE.md dice que Vercel Hobby solo permite uno diario (en Hobby el despliegue falla o se limita). Definir plan o usar Supabase `pg_cron`/Edge Function.
2. `hour` 0 (medianoche) es imposible: `+s.hour || 7`.
3. `lastSent` se marca aunque falle el envío (no hay reintento) y también con `force=1`.
4. Comparación de token no es en tiempo constante; un solo token para todo el hogar (al pasar a Supabase Auth, reemplazar por sesión de usuario + `household_id` y RLS reales).
5. `listShares` en modo file/firestore devuelve también el `verifier` (Supabase no). Inofensivo pero inconsistente.
6. `revoked` nunca se pone en `true` (DELETE borra la fila); el mensaje "revocado" es inalcanzable.
7. Límite de cuerpo: Vercel ~4,5 MB vs blob 4 MB + JSON; Express 15 MB.
8. Cualquier ruta `/cron/*` dispara el cron.
9. El modelo por defecto de Anthropic (`claude-sonnet-4-5`) y los de OpenAI/Gemini están fijos en código: revisar vigencia al migrar.

---

## 4. Pruebas E2E (criterios de aceptación)

### 4.1 Infraestructura
- `tests/helpers.js`: `ROOT`, `OUT = tests/.out` (capturas), `APP = dist/mirai.html`.
- `tests/run-all.js`: filtra por prefijo (`npm run test:one dian`); escribe `pg.html` base (tour visto + `window.claude.use` que devuelve null). Si corre `dian`, levanta **el servidor Express real** en `:8099` con `MIRAI_TOKEN=t`, `ENCRYPTION_KEY=clave-de-pruebas-local`, `STORE=file`, `DATA_FILE=tests/.out/e2e-store.json` (borrado antes), espera 1,5 s. Cada prueba corre en proceso aparte (timeout 120 s). **Pasa si sale con código 0 y la última línea de salida es `[]`** (lista de errores de página vacía). Las pruebas casi no tienen `assert`: imprimen valores y toman capturas; el criterio automático es "sin errores JS"; los valores impresos son los resultados esperados a revisar.
- Patrón común: Playwright Chromium; bloquea toda red `http(s)` (salvo `dian`/`gam`); `authHide()`; `S=sample()` (familia Navarro), `S.sample=false`, `S.setup.dismissed=true`; navegación con `location.hash` + `render()`.

### 4.2 Qué verifica cada prueba (19)
| Prueba | Área | Qué hace / criterio |
|---|---|---|
| **aj** | Ajustes: IA, alertas, apariencia, nómina | Mock de `claude.use` con `sample` y `mcp` (registra llamadas). Pestaña IA: elige OpenAI, escribe `sk-test`, "Probar" → imprime `window._aiTest`. Adaptador `claude.use('sample').json('hola')` funciona. Apagar IA (`ia|on`) → `use('sample')` devuelve null. Pestaña Alertas: activar canal correo, escribir `a@b.co`, "Enviar prueba" → debe registrar llamada MCP de correo con destinatario y asunto. Apariencia: tamaño de letra grande + tema oscuro → clases en `<html>`. Ingreso "Salario Altipal" $12.000.000 en modo **bruto** con descuento "Libranza" $350.000 → vista previa `#dedPrev`; guardado con `[valor neto, bruto, dedTotal]`. Ingreso independiente "Contrato" $8.000.000 bruto con retención 10 % → previsualización. |
| **ap** | Aportes a metas y fondo | `payDays()`; crea aporte programado al fondo de emergencia y a la primera meta → aparecen como fijos enlazados (`link.t` fondo/meta) con nombre, valor, frecuencia, día y próximo vencimiento. Pagar ambos → suben `S.fondo.saldo` y `S.metas[0].ahorrado`, y se crean gastos con `aporte`. Borrar el gasto de aporte a meta **revierte** el ahorro. Sidebar en acordeón: abrir "dinero" y luego "plan" deja solo uno abierto. |
| **as** | Consejero y chat | Mock de IA. Consejero: texto "Me ofrecieron una tarjeta de crédito con cupo de 5 millones" → interpretar (tipo tarjeta, valores, dudas) → analizar → veredicto `con_cuidado`, pestaña "fin" (técnico). `localInterp('Comprar un celular de 3 millones a 12 cuotas con la tarjeta al 2%')` (respaldo local sin IA). Chat flotante: pregunta de ahorro → respuesta con markdown; "Quiero comprar una moto de 8 millones a cuotas" → acción `consejero` que navega al consejero con el texto (`ASR.step`, `ASR.txt`) y guarda historial en `S.chats`. Arrastrar el botón flotante guarda `mirai-chat-pos`. |
| **auth** | Contraseña local y 2FA | Pantalla inicial; registro (nombre, correo, contraseña `Nido#2026segura` + medidor de fuerza, términos); pantalla de correo → configurar 2FA con TOTP (`totp(secret)`) → códigos de respaldo → confirmar guardados → desbloqueado. Logout; contraseña mala → alerta; contraseña buena → paso 2FA; entrar con **código de respaldo**. Recuperar: métodos disponibles; por app TOTP → nueva contraseña `Otra$Clave99` → entra. Recarga: sesión recordada (no bloqueado). Ajustes › Seguridad → `secLock()` bloquea. Captura móvil 400 px. |
| **ay** | Ayuda | Vistas `novedades`, `faq` (buscar "empeño" → cuenta resultados `.faq-i`), `manual` (abre un `details`, pestaña "módulos" → cuenta `.mod`). |
| **bdg** | Insignias ilustradas | Desbloquea todas las insignias salvo `racha30` y `gasto200` → captura de `.g-bdg` en claro y oscuro (2× DPR). Criterio visual: marcos bronce/plata/oro y bloqueadas con candado. |
| **cal** | Selector de fecha | Modal inversión "CDT prueba" $10.000.000 al 9,5 %, plazo rápido "18 meses" → texto `#plazoHint`. Date picker: modo años → 2030 → marzo → 15 → `inicio=2030-03-15`; escribir "20/07/2031" + Enter → se acepta. Guardar → `[nombre, dias, inicio]`. |
| **dian** | DIAN + contador (con servidor real) | Configura `mirai-srv` a `localhost:8099` token `t`. Hijo con `depDe=titular`, nacido 2015-05-10. Bien: "Apartamento Cedritos" `50N-123456`, costo 280M, avalúo 310M, 50 %. Agrega al calendario `FPL(2026)` claves `prima2, ces, int_ces, pred_bog, veh_bog, matri, arriendo, renta`. Verifica el **menú** (grupo DIAN), recorre pestañas ingresos/bienes/dependientes/deducciones/borrador, imprime `calcRenta(RENTAY, titular)` → `[año, brutos, RL, apl, dep10, dep72, RLG, imp, ret, saldo, nD]` (nD debe ser ≥1). Calendario fiscal con estimados. **Contador**: crea acceso "Marcela Rojas" → enlace `http://localhost:8099/?contador=…#k=…`. Abre el enlace en otra pestaña → `CONT` existe, `owner`, menú recortado (solo Impuestos/DIAN + Contador/Notas) y **0 inputs habilitados** en main (salvo los permitidos). El contador envía nota "Hola, me falta el certificado 220." → el titular, al refrescar, la ve descifrada en `ACCNOTES`. **Revocar** → nueva visita al enlace muestra "No se pudo abrir" / "Acceso no encontrado." Sin errores en ninguna de las dos páginas. |
| **emp** | Empeños y suscripciones | Empeño: crea entidad nueva "Compraventa La Económica" tipo "Casa de empeño" desde el selector; monto 800.000, plazo 4, tasa 4 %, prenda "Portátil Lenovo" valor 2.500.000, fecha límite 2026-11-10 → préstamo con `sistema`, `prenda` y notificaciones `pr:` (aviso de prenda). Suscripción Netflix $44.900 compartida entre 2 → `subMensual(s)`. |
| **ent** | Entidad con IA | Fijo "Celya cuota televisor" → aparece `#debtHint` (parece deuda) → "convertir en deuda" abre modal de préstamo; en el selector de entidad busca "celya" → "crear con IA" (mock: Celya S.A.S., NIT 901234567, Fintech) → se guarda en `S.cfg.entidades` y queda seleccionada; concepto prellenado. |
| **fam** | Familia | Perfil › Familia: agregar "Sofía", rol hijo/a (buscando "hij"), con cupo $200.000 → miembro guardado con esos datos. |
| **forms2** | Íconos de ayuda en formularios | Abre modales `gasto, contacto, loan, fijo, ingreso, activo, inversion, meta, sub, tarjeta, grupo` e imprime `campos/íconos de info` (`.f` / `.finfo`) — cada campo debe tener su ícono de información. Usa el `pg.html` creado por `run-all`. |
| **fx** | Gastos fijos variables, quincenales, categoría con IA, deshacer | Fijo "Agua Acueducto" → `tipoValor` se autodetecta (variable); rango 120.000–170.000, **bimestral**, próximo 2026-11-15, ya pagó el 2026-09-20 por 138.000 → `{valor,vmin,vmax,desde,dia}`, vencidos, próximo y gasto generado. Fijo "Empleada doméstica" $600.000 **quincenal**, ya pagó q2 → `pagos.per`, vencidos, próximo período. Gasto "concentrado para el perro" → crear categoría con IA (mock "Mascotas", `paw-print`, tope 120.000) → seleccionada y guardada. Borrar un fijo y **Deshacer** desde el toast → mismo número de fijos. |
| **gam** | Gamificación + integraciones del servidor | Servidor simulado `https://srv.test` (health/integrations). `S.gami.visitas` 27–30 oct 2026 + `gamiVisit()` → franja en Inicio y vista Logros; imprime `[XP total, nombre de nivel, racha, nº insignias]` (racha esperada ≥ 5 si hoy es 31-oct). Insignia nueva: vaciar inversiones, quitar `inversor`, agregar CDT y `commit` → a los 900 ms debe aparecer toast "Insignia: Mi plata trabaja". Ajustes › Alertas: correo vía servidor → elegir SMTP, llenar host `smtp.hostinger.com`, usuario, clave, remitente → **Guardar** (`PUT /api/integrations/email`) y **Probar** (`POST /api/integrations/email/test`); imprime llamadas (sin snapshots). Pestaña IA con servidor. |
| **gc** | Calendario estilo Google + fechas de renta | Vista `recordatorios`: abrir evento, vistas semana y agenda. `rentaFecha(d)` para dígitos 01, 02, 07, 30, 65, 66, 67, 80, 00, 99 (índice `n===0 ? 49 : floor((n−1)/2)` sobre `RENTA26`: 12-ago a 26-oct-2026 en días hábiles, sin 17-ago ni 12-oct). Calendario fiscal: escribir dígitos "37", abrir plantilla `fplant`, marcar `dot1` y `pred_bog` → se agregan al calendario (imprime total). |
| **hist** | Préstamos antiguos y OCR | Préstamo por cobrar "Pedro Prueba" $10M desde 2026-01-15, 24 cuotas, 2 % → historial "saldo hoy" $7M → vista previa `#lhp`; se generan pagos previos, saldo ≈ 7M, vencidas y próxima. "Ana Aldia" $3M desde 2026-03-01, 12 cuotas, "al día" → pagos generados y 0 vencidas. OCR de extracto (mock Banco Falabella, 36 cuotas, 1,9 %, seguro 15.000, 16 pagadas, saldo 7,35M) → pista y preview; guardar → `[id, nombre, nº pagos, saldo, extra, tasa]`. OCR de comprobante de pago → valor 1.100.000 y fecha 2026-10-30 en `#ocrPagoHint`. |
| **imp** | Imprevistos y fondo de emergencia | Guardar $2.000.000 en el fondo (nota "Bolsillo Nequi"). Gasto "Se dañó la nevera, reparación" $350.000 → se autocategoriza como imprevisto y aparece `.imp-box` (usar fondo). Guardar → `[saldo fondo, nº movimientos, categoría, gasto.fondo]` (el fondo baja). |
| **m365** | Diseño Fluent y móvil | Capturas de Inicio, Me deben, modal gasto, Ajustes en oscuro; a 400 px imprime `scrollWidth` (debe ser ≤ 400: **sin scroll horizontal**). |
| **nohdr** | Sin cabecera superior y sidebar | No existe `.inset-h` ni `.sb-apps`; miga de pan en `#crumbs`. Colapsar sidebar (`sb-col`). Tecla **N** abre el menú/modal de crear. Hover del botón flotante del chat. A 400 px: `scrollWidth` ≤ 400 y menú móvil `.mob-nav` abre. |

### 4.3 Criterios de aceptación derivados para la nueva app
1. Cada flujo anterior debe existir y no lanzar errores de consola.
2. `calcRenta`, `topes`, `patrimonio`, `rentaAuto`, `depInfo`, `calEst`, `gamiXP`, `nivel`, `misionesSemana`, `racha/rachaMax`, `rentaFecha` deben portarse como **funciones puras con pruebas unitarias** (Vitest) usando el mismo `sample()`; comparar números contra la app actual antes de borrarla.
3. Portal del contador: enlace con llave en fragmento, servidor nunca ve la llave, solo lectura total, notas cifradas en ambos sentidos, revocación inmediata.
4. Integraciones: secretos nunca vuelven al navegador (solo `••••1234`).
5. Móvil 400 px sin scroll horizontal.

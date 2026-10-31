# Inventario 2 — `d_app.js`, `e_ai.js`, `f_extra.js`

> Fuente: lectura completa de `src/d_app.js` (377 líneas), `src/e_ai.js` (53) y `src/f_extra.js` (305), Mirai 4.0.
> Objetivo: reimplementar en **Next.js + shadcn + Supabase** sin perder comportamiento. Los helpers de `b_core.js` se citan solo cuando hace falta para entender una fórmula.
> Convención: `S` = estado del libro; `d` = objeto con los campos del formulario ya parseados; `f` = elemento `<form>`; `ds` = `dataset` del botón que abrió el modal.
> ⚠️ Varias funciones de estos archivos son **envueltas** por módulos posteriores (`g_auth`, `h_forms`, `j_loans`, `l_ajustes`, `n_servidor`, `o_asesor`, `r_gamif`, `s_dian`). Aquí se documenta el comportamiento **base**; al migrar hay que sumar los envoltorios (ver otros inventarios).

---

## 0. Mapa rápido

| Archivo | Contenido |
|---|---|
| `d_app.js` | Consejero IA (`analizar`, `askAI`, `V.consejero`, `consResult`) · modales base `M.*` · `openModal/renderModal/closeModal` · vistas previas en vivo (`loanParams`, `updatePreviews`, `applyShows`) · popovers (select, calendario, campana, menú crear, buscador) · nube (`commit`, `flushCloud`, `bootCloud`) · descargas/PDF (`downloadFile`, `buildPDF`) · `render`, `toast`, `notifToast`, `maybePopups` · delegación global de eventos (`input`, `change`, `submit`, `click`, `keydown`) · sidebar, menú de usuario, `formatear`, `deleteAccount` |
| `e_ai.js` | Categorización automática local (`norm`, `KW`, `HKW`, `localCat`), detección de gasto hormiga (`localHormiga`, `isHormiga`), IA de clasificación (`aiClassify`), autocategoría en formularios (`onAutoInput`, `updHormigaHint`), cola de revisión hormiga (`queueHormiga`, `flushHormiga`, `reviewMonth`), clasificación de importaciones (`classifyImport`) |
| `f_extra.js` | `EXTRA_ACT/EXTRA_FORM/EXTRA_CHANGE` · tarjetas de crédito · gastos desde Gmail · foto de factura · recordatorios de cobro · acuerdo de pago/pagaré PDF · Google Calendar · asistente de renta (`RDOCS`) · primas y cesantías · gastos compartidos · mesadas · registro en lenguaje natural · ingreso extra · resumen del mes con IA · retos de ahorro · varios libros · `HELP` · tour guiado · buscador modal · cajón de apps |

---

## 1. Formularios (`submit` por `data-form`)

### 1.1 Pipeline común del `submit` (d_app.js)

1. `e.preventDefault()`. Si el form no tiene `data-form`, sale.
2. Construye `d` con `FormData` → luego **sobrescribe**:
   - inputs `[data-money]` → `parseMoney(value)` (número).
   - inputs `[data-num]` → `parseNum(value)`.
   - `input[type=checkbox][name]` → `checked` (booleano).
3. **Validación de requeridos**: todo `[data-req]` vacío que **no** esté dentro de un ancestro `[hidden]` se marca: `.closest('.f').classList.add('err')`. Si hay alguno → `toast('Completa los campos marcados')` y aborta.
4. Rama por tipo (`k = f.dataset.form`). `fail(m)` = `toast(m)` + aborta.
5. Si no hay rama propia → `EXTRA_FORM[k](d, f)`. Si devuelve `false` **o una Promise**, no cierra ni guarda (el handler se encarga).
6. Final por defecto: `if (MODAL) closeModal(); commit(); render();`

> En Next.js: un `useForm` + `zod` por formulario; los requeridos condicionados a campos visibles (`data-show`) deben validarse solo si el bloque está visible.

### 1.2 `gasto` (modal `M.gasto`)

Campos: `desc` (req, `data-autocat`, autofocus), `valor` (money, req), `cat` (select con buscador y "crear", req; default `ds.cat || S.cfg.def.cat`), `hormigaMode` (`auto` | `si` | `no`, default `auto`), `fecha` (default hoy), `quien` (default `S.cfg.def.quien || 'familia'`), `medio` (default `S.cfg.def.medio || S.cfg.medios[0].nombre`), `usarFondo` (checkbox de `imprevBox()`, de j_loans), input de foto `#fotoFact` (OCR de factura, ver §4.5).

Lógica:
- `!d.valor` → "Escribe el valor del gasto".
- `g = {id, fecha: d.fecha||hoy, desc, cat, valor, quien: d.quien||'familia', medio}`.
- Si `hormigaMode !== 'auto'` → `g.hormiga = (mode==='si')`, `g.hormigaSrc='manual'`.
- Si `auto` y el form ya trae veredicto IA (`f.dataset.aiH` = `'1'|'0'`) → `g.hormiga = aiH==='1'`, `hormigaSrc='ia'`, `hormigaRazon = f.dataset.aiR`.
- `S.gastos.push(g)`. Si `auto` y sin veredicto IA → `queueHormiga(g)` (la IA lo clasifica después).
- **Fondo de emergencia**: si `d.usarFondo && S.fondo`: `v = min(valor, S.fondo.saldo)`; `g.fondo = v`; `S.fondo.saldo -= v`; `S.fondo.mov.push({id, tipo:'usar', valor:v, fecha:g.fecha, nota:g.desc, gid:g.id})`; toast éxito "Gasto registrado y pagado con tu fondo de emergencia. Te quedan $X en el fondo." título "Imprevisto registrado".
- Si no: toast `isHormiga(g) ? 'Gasto hormiga registrado' : 'Gasto registrado'`.

### 1.3 `contacto` (modal `M.contacto`, edición si `data-id`)

Campos (`contactFields(c, prefijo)`): `tipo` (`persona`|`empresa`), `nombre` (req), `docTipo` (`CC`,`CE`,`NIT`,`PA`,`TI`; default CC), `doc` (numérico), `telefono`, `email`, campos de dirección `addrFields` (→ `direccion`, `ciudad`, `barrio`, `depto`; de i_geo), `relacion` (de `S.cfg.relaciones`), `notas` (textarea).
Efecto: objeto `c` con `nombre.trim()`; si existe `id` → `Object.assign`, si no `S.contactos.push({id: uid(), ...c})`. Toast "Contacto guardado".

### 1.4 `loan` (modal `M.loan`, `data-kind` = `cobrar` | `pagar`)

Campos:
- `quien`: cobrar → `ex` (contacto guardado) | `new`; pagar → `ent` (banco/entidad) | `ex` | `new`. Default: si `ds.cid` → `ex`; cobrar → `ex` si hay contactos (nota: por precedencia `ds.cid||S.contactos.length?'ex':'new'`); pagar → `ent`.
- `entidadId` (select con crear entidad), `contactoId`, o campos de contacto nuevo con prefijo `c_` (`c_nombre`, `c_docTipo`, `c_doc`, `c_telefono`, `c_email`, `c_direccion`, `c_ciudad`, `c_barrio`, `c_depto`, `c_relacion`).
- `monto` (req; default `ds.monto`), `concepto`, `inicio` (hoy), `frec` (`FRECS`: mensual, quincenal, semanal, diario, diariohab; default `S.cfg.def.frec||'mensual'`), `plazo` (req; default `S.cfg.def.plazo||12`; chips 1,3,6,12,24,36,48 para mensual/quincenal/semanal y 20,30,45,60,90,120 para diario/diariohab).
- Solo pagar: `extra` = seguros y otros cobros por cuota (tip: "Los bancos suelen sumar a la cuota un seguro de vida o de deudor…").
- `modoInt`: `no` | `tasa` | `cuota` (default cobrar `no`, pagar `tasa`). `tasa` (% mensual), `ea` (% E.A.), `cuotaV` (valor cuota).
- `sistema` (visible con `modoInt:tasa`): `frances` (recomendado), `aleman`, `simple`, `americano`; default `S.cfg.def.sistema||'frances'`.
- Empeño: `prenda` (`no`|`si`, default `si` si `ds.empeno`), `prObj`, `prValor`, `prLimite` (hoy + 4 meses si empeño, si no +12), `prRef`.
- Historial previo: `hist` = `nuevo` | `aldia` | `cuotas` | `saldo`; `ncuotasPag`, `saldoHoy`, `fultPago`.
- OCR: `#fotoLoan` (imagen o PDF; lo procesa j_loans).

`loanParams(f)` (fórmula clave):
```
modo = modoInt; sistema = sistema || 'frances'; plazo = max(1, round(plazo||1)); frec = frec||'mensual'
si modo==='no'    → sistema='sin', tasa=0
si modo==='tasa'  → tasa = ea ? ((1+ea/100)^(1/12) - 1)*100 : tasa
                    si sistema==='simple' && ea → tasa = ea/12
si modo==='cuota' → sistema='frances'; tasa = rateFromCuota(monto, cuotaV, plazo, frec)
return {monto, plazo, frec, tasa: +tasa.toFixed(4), sistema, inicio, extra: extra||0}
```
Validaciones: sin monto → "Escribe el valor del préstamo"; `modoInt==='cuota'` sin `cuotaV` → "Escribe el valor de la cuota"; `quien==='new'` sin `c_nombre` → "Escribe el nombre de la persona"; `ex` sin contacto → "Elige un contacto"; `ent` sin entidad → "Elige el banco o entidad".
Efectos:
- `new` → crea contacto `{id, tipo:'persona', nombre, …c_*, notas:''}` en `S.contactos`.
- pagar: `acreedor = quien==='ent' ? {kind:'entidad', id: entidadId} : {kind:'contacto', id: contactoId}`.
- `L = {id, concepto, monto, sistema, tasa, frec, plazo, inicio: inicio||hoy, pagos: [], extra: kind==='pagar' ? extra : 0}`; cobrar → `L.contactoId`; pagar → `L.acreedor`.
- `S[kind].push(L)`; `hx = applyLoanHist(L, f)` (j_loans: marca cuotas pagadas según `hist` y crea el empeño); `SEL[kind] = L.id`.
- Toast éxito "Préstamo registrado." / "Deuda registrada." + `hx`. Cierra modal, `commit()`, navega a `#me-deben` / `#le-debo` (o `render()` si ya está ahí). **Retorna antes** del cierre común.

Vista previa `#lp` (en vivo, `updatePreviews`): sin monto → nota "Escribe el valor y el número de cuotas para ver cuánto te pagarán/pagarás en cada cuota." Con monto → `previewLoan(p)`:
- americano: "`$cuota` por `per`" + "Solo intereses durante `plazo-1` cuotas y una última de `$cuotaFin`."
- cuota variable (`|cuota - cuotaFin| > 1`): "De `$cuota` a `$cuotaFin`" + "La cuota va bajando en cada pago."
- si no: "`$cuota` cada `per`" + "`n` cuotas iguales."
- "En total recibirás/pagarás **$total**, de los cuales **$int** son intereses" (o ", sin intereses"). "Última cuota: **fecha**".
- Si `tasa>0`: "Interés: X% mensual ≈ Y efectivo anual". Si `ea*100 > S.cfg.usura` → pill roja "Supera la tasa de usura configurada (N% E.A.)." + cobrar: "Cobrar más que eso es ilegal en Colombia." / pagar: "Revisa bien este crédito."
- `previewLoan`: `ea = sistema==='simple' ? tasa*12/100 : (1+tasa/100)^12 - 1`.

### 1.5 `pago` (modal `M.pago`, `data-kind`, `data-id`)

Campos: `tipo` = `cuota` | `abono`; `ncuotas` (default 1; chips 1,2,3 ≤ cuotas restantes); `valor` (abono); `fecha` (hoy); `modo` (`plazo` = "Terminar de pagar antes" | `cuota` = "Que la cuota baje"; oculto si sistema americano, que fuerza `cuota`); OCR comprobante `#fotoPago`.
Cabecera: "Te debe / Debes `$saldo` · próxima cuota `$valor` el `fecha`".
Efectos:
- `cuota`: `n = clamp(round(ncuotas||1), 1, e.plan.length)`; por cada una `L.pagos.push({id, fecha, tipo:'cuota', valor: e.plan[j].valor})`. Toast "N cuotas registradas" / "Cuota registrada".
- `abono`: sin valor → "Escribe el valor del abono"; `L.pagos.push({id, fecha, tipo:'abono', valor: min(valor, e.saldo), modo: modo||'plazo'})`. Toast "Abono registrado".
Vista previa `#pp`: clona L, agrega pagos simulados, `e1 = engine(L2)`; `paid = e1.pagado - e0.pagado`; muestra "Quedará así **$saldo**", "Se registran $X." o "Abono de $X." y "¡Queda saldado!" o "Faltarán N cuotas de $Y.".

### 1.6 `fijo` (modal `M.fijo`, alta/edición)

Descripción del modal: "Los pagos que se repiten (arriendo, servicios, colegio, planes de celular). Te recordamos antes de cada fecha y los restamos de tu dinero disponible."
Campos: `nombre` (req, autocat), `cat` (default `Vivienda`), `tipoValor` = `fijo` | `rango` (hint rango: "Los servicios como agua, luz, gas, internet o planes móviles cambian según el consumo."), `valor`, `vmin`, `vmax`, `frec` (`FFREC`: mensual, quincenal, bimestral, trimestral, semestral, anual, unico), `prox` (próximo pago, para mensual…anual; default `fijoProxIso(f)`), `diaQ1` (≤15, default 15), `dia2` (default 30), `fecha` (único; default hoy+7), `medio`, `proveedor`.
Solo alta: `yaPagoQ` (`no`|`q1`|`q2`|`ambas`), `yaPagoM` (`no`|`si`), `fpag`, `fpagQ`, `vpag`, `vpagQ`.
En edición el form lleva `data-cat-manual="1"` (no autocategorizar).
Lógica:
```
rg = tipoValor==='rango'
si rg: si !vmin && !vmax → "Escribe el valor mínimo y máximo que sueles pagar"
       vmin ||= vmax; vmax ||= vmin; si vmin>vmax → swap
si no rg && !valor → "Escribe el valor"
valor = rg ? round((vmin+vmax)/2) : d.valor
o = {nombre, cat: cat||'Otros', valor, vmin: rg?vmin:0, vmax: rg?vmax:0, frec,
     dia: frec==='quincenal' ? clamp(round(diaQ1||15),1,15) : FSTEP[frec] ? día de prox : 1,
     dia2: clamp(round(dia2||30),16,31),
     mes: FSTEP[frec] ? mes(prox)+1 : 1,
     fecha, variable: rg, medio, proveedor}
desde = (FSTEP[frec] && prox) ? mkey(prox) : mkey(hoy)
```
- Edición: `reanc = FSTEP[o.frec] && prox && fijoProxIso(ex) !== prox`; `Object.assign(ex, o)`; si `reanc` o cambió `frec` → `ex.desde = desde; ex.inicio = (FSTEP && prox) ? prox : hoy`. Toast "Cambios guardados en X" título "Gasto fijo actualizado".
- Alta: `nf = {id, ...o, desde, inicio, pagos: []}`. Periodos del mes actual `fijoPeriods(nf, año, mes)`:
  - quincenal: paga los periodos `-Q1`/`-Q2` según `yaPagoQ` (`ambas` = los dos).
  - otros: si `yaPagoM==='si'` → periodo `'prev-' + mkey(fpag)` con fecha `fpag`.
  - Valor pagado `vp = (quincenal ? vpagQ : vpag) || valor`. Por cada periodo: `nf.pagos.push({per, fecha, valor: vp, medio})` y `S.gastos.push({id, fecha, desc: nombre + (' (1ª quincena)'|' (2ª quincena)'), cat, valor: vp, quien:'familia', medio, fijoId: nf.id, per})`.
  - Toast éxito título "`nombre` guardado": "Pago registrado el FECHA (las dos quincenas | (1ª/2ª quincena))." o "Te recordaremos antes de cada fecha." + " Próximo pago: FECHA (quincena)."

Referencia (b_core): `FSTEP={mensual:1,bimestral:2,trimestral:3,semestral:6,anual:12}`; `fijoMensual = quincenal ? valor*2 : FSTEP ? valor/FSTEP : 0`; periodos: mensual `YYYY-MM`, quincenal `YYYY-MM-Q1/Q2`, bi/tri/semestral cada n meses desde `desde`, anual `YYYY` si `mes` coincide, único `'U'`.

### 1.7 `pagarFijo` (modal `M.pagarFijo`)

Título: "Pagar X" (o "Registrar X" si `f.link`). Descripción según quincenal/no. Campos: `per` (choices con vencidos `st.venc` + próximo `st.prox`; etiqueta "1ª quincena · fecha", "Vencido"/"Pendiente"), `valor` (req; vacío si variable con placeholder el promedio; hint "Normalmente pagas entre $vmin y $vmax. Escribe el valor de la factura."), `fecha`, `medio`. Botón secundario "No tocaba pagar · cambiar fecha" → abre `M.fijo` del mismo id.
Efectos: sin valor → "Escribe el valor que pagaste". `fj.pagos.push({per, fecha, valor, medio})`; `S.gastos.push({…, desc: nombre+qq, cat: fj.cat, fijoId, per})`.
**Ajuste de rango automático** si `fj.variable && fj.vmin`: `valor < vmin` → `vmin = valor` ("Ajustamos el mínimo del rango."); `valor > vmax` → `vmax = valor` ("Este pago superó tu máximo habitual; ajustamos el rango."); luego `fj.valor = round((vmin+vmax)/2)`.
`lk = aporteApply(fj, valor, fecha, idGasto)` (j_loans: si el fijo es un aporte a meta/fondo). Toast: `lk` (título "Aporte registrado") o "`nombre` (quincena): $valor. extra" (tipo `warn` si superó, si no `success`; título "Pago registrado").

### 1.8 `ingreso` (modal `M.ingreso`)

Defaults: `frec:'mensual', dia:30, moneda:'COP', quien:'familia', cat:'Salario'`. Campos: `concepto` (req), `cat` (de `S.cfg.catIngreso`), `valor` (req, decimales; hint "Si te pagan por quincena, escribe lo de una quincena."), `moneda`, `frec` (`mensual`, `quincenal` "Cada quincena (15 y 30)", `semanal`, `anual`), `dia` (solo mensual), `quien`.
Efecto: `o = {concepto, cat, valor, frec, dia: round(dia||30), quien, moneda}`; `applyDed(o, d, f)` (m_nomina: descuentos de nómina → puede poner `o.bruto`, `o.dedTotal` y dejar `o.valor` neto). Alta/edición. Toast: con bruto → "Te llegan $neto después de $ded en descuentos. Ese es el valor que usamos en tu presupuesto." (título "Ingreso guardado"); si no "Ingreso guardado".

### 1.9 `activo` (modal `M.activo`)

`side` = `activos` ("Algo que tengo") | `pasivos` ("Algo que debo"); `codA` (de `PUC_A`, default `1110`), `codP` (de `PUC_P`, default `2380`), `nombre` (req), `moneda`, `valor` (req, decimales). Nota: "Los préstamos con cuotas regístralos en Préstamos y deudas para llevar su plan de pagos."
Efecto: `S[side].push({id, cod, nombre, valor, moneda})`. Toast "Guardado". (Liquidez = activos con código que empieza por `11` + inversiones tipo ahorro.)

### 1.10 `inversion` (modal `M.inversion`, ancho)

`tipo` (de `INVT`: `cdt`, `ahorro`, `fondo`, `acciones`, `cripto`, `otro`; isotipos `le-debo, mesadas, presupuesto, flujo, compartidos, inversiones`), `nombre` (req), `entidad`, `capital` (req), `inicio`, `tasa` (% E.A., solo cdt/ahorro), `plazoN` + `plazoU` (`dias|semanas|meses|anos`, chips 3m, 6m, 1a, 18m, 2a; solo cdt), `actual` (fondo/acciones/cripto/otro).
Efecto: `S.inversiones.push({id, tipo, nombre, entidad, capital, tasa: tasa||0, inicio, dias: cdt ? plazoDias(plazoN, plazoU, inicio) : 0, ret: cdt ? 4 : 0, moneda:'COP', actual: actual||0})`. Sin capital → "Escribe cuánto invertiste".
Vista previa `#ivp`:
- CDT: `b = c*((1+r/100)^(d/365) - 1)`; `ret = b*0.04`; "Al final de los d días recibirás **$(c+b-ret)**"; "Ganas $(b-ret) ($b de intereses menos $ret de retención en la fuente). Son unos $((b-ret)/(d/30.4)) por mes."
- Ahorro: `m = c*((1+r/100)^(1/12) - 1)`; "Tu dinero crecerá unos $m al mes"; "En un año serían $(c*r/100) más, y puedes retirarlo cuando quieras."
- Otro: muestra `INVT[t].d`.

### 1.11 `meta` (modal `M.meta`)

`nombre` (req), `icon` (de `ICON_CHOICES`, default `target`), `objetivo` (req), `ahorrado`, `fecha` (hoy+12 meses). Efecto `S.metas.push({id, nombre, icon, objetivo, ahorrado: ahorrado||0, fecha})`. Toast "Meta creada".

### 1.12 `abonometa`
`m = S.metas[data-id]`; si `d.v` → `m.ahorrado += d.v`; toast "¡Bien! Abono registrado".

### 1.13 `sub` (modal `M.sub`)
Descripción: "Streaming, música, apps, nube o gimnasio: todo lo que se cobra solo cada mes o cada año. Te avisamos antes de cada cobro para que decidas si la sigues pagando."
Botones rápidos `SUBQ` (nombre + color; de j_loans) rellenan `nombre`. Campos: `nombre` (req), `valor` (req, dec), `moneda`, `ciclo` (`mensual`|`anual`), `proximo` (hoy+15), `medio` (default primer medio cuyo nombre contenga "crédito"), `logo` (imagen subida, data URL; preview `#subLogoPrev`), `comparte` ('' | 2..5).
Efecto: `S.suscripciones.push({id, nombre, valor, ciclo, proximo, moneda, medio, comparte: +comparte||0, logo})`. Toast éxito "X guardada. Te avisaremos antes del cobro del FECHA." título "Suscripción agregada".
Costo mensual (b_core): `subMensual = conv(valor,moneda) * (anual ? 1/12 : 1) / (comparte>1 ? comparte : 1)`.

### 1.14 `cal` (modal `M.cal`)
`titulo` (req), `fecha` (hoy+30), `tipo` (`egreso` "Pago que hago" | `ingreso` "Dinero que recibo"), `monto`. Efecto `S.calendario.push({id, titulo, fecha, tipo, monto: monto||0, nota:''})`. Toast "Fecha guardada".

### 1.15 `miembro` (modal en o_asesor)
`nombre` (req: "Escribe el nombre"), `rol` (default "Otro familiar"), `tieneCupo` (`si` → `cupo`). `o = {nombre, rol, cupo: tieneCupo==='si' ? (cupo||0) : 0}`. Edición → toast "Se actualizaron los datos de X." (título "Integrante actualizado"); alta → "X ya hace parte de tu familia en Mirai." (título "Integrante agregado"). `window._famNew = id` → tras 120 ms hace scroll suave a `.fam.new` y a los 2,5 s limpia la marca.

### 1.16 Listas de ajustes
- `catNew`: `S.cfg.categorias.push({id, nombre: trim, grupo: grupo||'g', icon: icon||'tag', tope: 0})` → "Categoría agregada".
- `cfgNew` (`data-col`): `S.cfg[col].push({id, nombre, ...(col==='entidades' ? {tipo: tipo||'Banco'} : {icon: icon||'tag'})})` → "Agregado".
- `relNew`: `S.cfg.relaciones.push(nombre.trim())` → "Agregado".
- `regla`: `S.cfg.reglas.push({k: k.trim(), cat})` → "Regla agregada" (reglas de autocategoría: si la descripción contiene `k` → categoría `cat`).

### 1.17 `consejo` (vista `V.consejero`, form `#consForm`)
Ver §4.2. Sin valor → "Escribe cuánto cuesta". Calcula `an = analizar(d)`, guarda `CONS.d = {...d}`, `CONS.loading = true`, render; `askAI(d, an)` → `item = {id, fecha: hoy, d: {tipo, desc, valor, contactoId}, v: res.ai ? ({si:'si', no:'no'}[ai.veredicto] || 'cuidado') : an.v, R: an.R, m: an.m, ai: res.ai||null, aiErr: !res.ai}`; `CONS.last = item`; `S.consejos.unshift(item)` y se recorta a **15**; `commit(); render()`. Retorna antes del cierre común.
(o_asesor.js reemplaza/extiende el consejero; `EXTRA_ACT.consShow` vive allí.)

### 1.18 Formularios de `f_extra.js` (`EXTRA_FORM`)

| Form | Campos | Validación | Efecto |
|---|---|---|---|
| `tarjeta` | `nombre` (req), `entidad`, `cupo` (req), `corte` (25), `pago` (10), `tasa` (2.1) | — | `S.tarjetas.push({id, nombre, entidad, cupo, corte: clamp(round(corte||25),1,31), pago: clamp(round(pago||10),1,31), tasa: tasa||0, compras: []})`; `TSEL` = nueva; "Tarjeta agregada" |
| `compraTC` (`data-id` tarjeta) | `desc` (req, autocat), `valor` (req), `fecha`, `cuotas` (1; chips 1,3,6,12,24,36), `cat`, `comoGasto` (checkbox, marcado) | sin valor → "Escribe el valor" (no cierra) | `t.compras.push({id, fecha, desc, valor, cuotas: max(1,round(cuotas||1))})`; si `comoGasto` → `S.gastos.push({…, cat: cat||'Otros', quien:'familia', medio:'Tarjeta de crédito'})`; "Compra registrada" |
| `grupo` | `nombre` (req), `personas` (req; texto separado por comas; default "PrimerNombre, ") | únicas y no vacías; < 2 → "Agrega al menos dos personas" | `S.grupos.push({id, nombre, personas, gastos: []})`; `GSEL`; "Grupo creado" |
| `gastoGrupo` | `desc`, `valor`, `paga` (persona), `fecha`, checkboxes `e_<persona>` (todas marcadas), `miGasto` | sin valor o sin personas → "Completa el valor y las personas" | `g.gastos.push({id, desc, valor, paga: paga||personas[0], entre, fecha})`; si `miGasto` y el primer nombre del perfil está en `entre` → gasto propio `{desc: 'desc (grupo)', cat: localCat(desc)?.cat||'Otros', valor: round(valor/entre.length), quien:'familia', medio:''}`; "Gasto agregado" |
| `personaGrupo` (form inline) | `nombre` (required HTML) | — | agrega si no existe |
| `kidMov` (form inline por hijo) | `desc`, `valor` | — | `S.kids[id].mov.push({id, fecha: hoy, desc, valor: -abs(valor)})`; "Gasto anotado" |
| `nl` (caja "Registra en palabras" de Inicio) | `texto` | vacío → no hace nada | ver §4.8. Siempre devuelve `false` (abre modal `gasto` o `extra` prellenado) |
| `extra` (modal `M.extra`) | `desc` (req), `valor` (req), `fecha` | — | `S.extras.push({id, desc, valor, fecha})`; "Ingreso registrado". Nota del modal: "Los ingresos extra suman en tu quincena y en el flujo de caja, pero no se repiten como el salario." |
| `libro` (modal `M.libro`) | `nombre` (req), `icon` (`house, store, briefcase, utensils, users, car, plane, heart-pulse`; default `store`) | — | `id = 'l'+uid()`; `LIBROS.push({id, nombre, icon})`; `saveLibros()`; cierra; `cambiarLibro(id)`; devuelve `false` |
| `appNew` (modal `M.appNew`) | `nombre` (req), `url` (req, type url), `desc`, `icon` (isotipo, default `inversiones`) | URL debe empezar por `https://` → "El enlace debe empezar por https://" | alta/edición en `S.cfg.apps`; "App guardada en el cajón" |

---

## 2. Acciones (`data-act`) y otros atributos de delegación

### 2.1 Orden de resolución del `click` global (d_app.js)
1. `[data-sel-btn]` → abre/cierra popover de select (`openSel`).
2. `[data-date-btn]` → abre/cierra calendario (`openDate`).
3. `[data-optv]` con popover select abierto → `pickSel(v)`. Si el input es `cat`, marca `form.dataset.catManual='1'` y borra `#catHint` (el usuario eligió a mano: la IA ya no cambia la categoría).
4. `[data-day]` con calendario abierto → `pickDate`.
5. `[data-calnav]` → mes ±1.
6. `[data-sgo]` → `goSearch(i)` (resultado del buscador).
7. `[data-nid]` → marca la notificación como leída (`store KREAD`), cierra popover, borra el toast y re-renderiza el nav.
8. `[data-pick]` → `setPick`: activa el botón (`.on`), escribe en el `input[type=hidden][name]` del mismo form/card y dispara `change`. Casos especiales: en `#consForm` al cambiar `tipo` ajusta `forma` (`credito|prestar` → `cuotas`, `fijo` → `contado`); `tema` → alterna `html.dk` y guarda `KTHEME`; `abmodo` → `EX.abono.modo`.
9. `[data-chip]` → escribe `data-v` en el input `name=data-chip`, marca el chip y dispara `input`.
10. `[data-go]` → cierra modal/popover/nav móvil; si trae `data-tab` → `ATAB`; navega a `#go` (o `render` si ya está).
11. `[data-modal]` → `openModal(tipo, {...dataset})`.
12. `[data-act]` → `switch`. Por defecto, tras el `switch` se hace `commit()` + `render()` salvo que el caso ponga `ch2=false` (solo render) o haga `return`. Si no hay caso → `EXTRA_ACT[act](btn, e)`.

### 2.2 Acciones de `d_app.js`

| `data-act` | Qué hace exactamente |
|---|---|
| `nav` | Alterna `body.nav-open` (menú móvil). |
| `navg` | Grupo del sidebar. Si sidebar contraído y ancho > 820 → abre/cierra **flyout** (`openFlyout`). Si no, acordeón: cierra todos los grupos y abre/cierra `data-g`; guarda `KNAV`. |
| `sbToggle` | `toggleSidebar()`: ≤ 820 px alterna `nav-open`; si no alterna `body.sb-col` y guarda `KSIDE`. |
| `sbSearch` | Expande el sidebar si está contraído y enfoca `#q`. |
| `userMenu` | Abre/cierra menú de usuario (§3.7). |
| `setupSkip` | `S.setup.skip[k] = true`; toast "Paso omitido"; commit+render. |
| `setupUnskip` | `delete S.setup.skip[k]`. |
| `setupDismiss` | `S.setup.dismissed = true`; toast "Puedes volver a la guía desde el menú de tu perfil"; va a `#inicio`. |
| `setupShow` | `dismissed=false`; va a `#puesta`. |
| `setupFinish` | `dismissed=true`; va a `#inicio`. |
| `formatear` | Toma `[data-fmt]:checked`; si ninguno → "Elige qué datos quieres borrar"; exige escribir `BORRAR` en `#fmtConfirm` ("Escribe BORRAR para confirmar"); `formatear(keys)`; "Datos borrados". |
| `deleteAccount` | Exige `ELIMINAR` en `#delConfirm`; `await deleteAccount()`. |
| `bell` | Abre/cierra panel de notificaciones. |
| `create` | Abre/cierra menú "Agregar" (§3.7). |
| `readall` | Marca todas las `notifs()` como leídas. |
| `privToggle` | Alterna `html.priv` (oculta montos), guarda `KPRIV`; toast "Montos ocultos"/"Montos visibles". |
| `themeToggle` | Alterna `html.dk`, guarda `KTHEME` = `oscuro`/`claro`. |
| `popclose` / `tclose` / `mclose` | Cierra popover / toast / modal. |
| `copy` | Copia `data-v` al portapapeles → "Copiado" (si falla, muestra el valor en toast). |
| `blank` | `S = normalize(defaults())`; `SEL={cobrar:null,pagar:null}`; "Tu libro está listo. ¡Empieza registrando tus ingresos!". |
| `keep` | `S.sample = false`; "El ejemplo ahora es tu libro". |
| `loadsample` | `S = sample()`; "Datos de ejemplo cargados"; si está en `#puesta` va a `#inicio`. |
| `baltab` | `BAL.tab = data-t` (pestaña de Balance). Solo render. |
| `balq` | `BAL.tab = día ≤ S.cfg.corteQ ? 'q1' : 'q2'`, mes/año actuales. |
| `balm` | `BAL` mes ± `data-d`. |
| `selLoan` | `SEL[kind] = id`. |
| `ltab` / `atab` | `LTAB` / `ATAB` (pestañas de préstamos / ajustes). |
| `del` (`data-col`, `data-id`) | `snap = clone(S)`. Si es gasto pagado con fondo → devuelve `it.fondo` a `S.fondo.saldo` y borra el movimiento con `gid`. Si es gasto de aporte → `aporteRevert(it)`. Filtra la colección. Si `col==='fijos'` borra también los gastos con `fijoId`. Toast `delMsg(col,it)` con **Deshacer** (`undo: snap`). |
| `delMiembro` | Quita integrante; toast "La persona se quitó de tu familia." con deshacer. |
| `delcfg` | Quita de `S.cfg[col]`; toast `"Nombre" se eliminó de tu lista.` con deshacer. |
| `delrel` / `delregla` | `splice(data-i)` en relaciones / reglas. |
| `delLoan` | Confirmación: "Se borrará este préstamo con todo su historial de pagos." título "¿Eliminar préstamo?". |
| `delContact` | Si el contacto tiene préstamos (cobrar.contactoId o pagar.acreedor.id) → "Este contacto tiene préstamos. Elimínalos primero."; si no, confirmación "Se borrarán los datos de este contacto." |
| `confirmYes` | `snap`; ejecuta `CONFIRM.fn()`; cierra; toast derivado del título (quita "¿Eliminar " y "?", capitaliza + " eliminado.") o "El elemento se eliminó." con deshacer. |
| `undoPago` | Quita el pago `data-pid` del préstamo. "Pago deshecho". |
| `unpayfijo` | Quita el pago del periodo `data-per` del fijo y el gasto ligado (`fijoId` + `per`). "Pago deshecho". |
| `subdone` | Suscripción pagada: `proximo += 12 meses` (anual) o `1 mes`; agrega gasto `{desc: nombre, cat:'Suscripciones', valor: conv(valor,moneda), quien:'familia', medio:''}`; "Pago registrado". |
| `addsub` | De `detectSubs()[i]` crea suscripción `{nombre: desc, valor, ciclo:'mensual', proximo: hoy+15, moneda:'COP'}`; "Suscripción agregada". |
| `cal2fijo` | Fecha del calendario → gasto fijo anual `{nombre: titulo, cat:'Otros', valor: monto, frec:'anual', dia, mes, variable: true, desde: mes actual, pagos: []}`; "Quedó en tus gastos fijos anuales". |
| `consShow` | Delegado a `EXTRA_ACT.consShow` (o_asesor): muestra una consulta anterior. |
| `impsample` | `IMP = {txt: SAMPLE_CSV}` (ejemplo para importar). |
| `impparse` | Lee `#impTxt`; `IMP = {txt, ...parseCSV(txt)}`; render; `classifyImport()`. |
| `reviewH` | `reviewMonth(GMES)` (IA revisa hormiga del mes visto). |
| `toggleH` | Invierte `hormiga` del gasto, `hormigaSrc='manual'`, borra razón. "Marcado como hormiga"/"Ya no cuenta como hormiga". |
| `impclear` | `IMP = null`. |
| `impgo` | Importa filas `incl`: `{fecha, desc, cat, valor, quien: #impQ||'familia', medio:'', hormiga: !!r.hormiga, hormigaSrc: r.aiH ? 'ia' : 'auto'}`; "N gastos importados". |
| `pdf` | `buildPDF(RPT)` → `downloadFile('reporte-financiero-YYYY-MM.pdf')`. |
| `csv` | CSV del mes `RPT` (ver §3.5). |
| `exportjson` | Respaldo JSON (ver §3.5). |
| `wipe` | Doble toque en 5 s: el primero arma (`wipeArm = now`, re-render a 5,1 s para desarmar), el segundo `S = normalize(defaults())` → "Datos borrados". |

### 2.3 Acciones de `f_extra.js` (`EXTRA_ACT`)

| Acción | Qué hace |
|---|---|
| `selTC` | `TSEL = id`; render. |
| `tcPagarTotal` | Marca todas las compras de la tarjeta `pagada = true`; "¡Tarjeta al día!". |
| `delCompraTC` | Borra la compra `data-cid` (sin confirmación ni deshacer). |
| `delTC` | Confirmación "¿Eliminar tarjeta?" / "Se borrará la tarjeta con sus compras registradas." |
| `mailScan` | Busca compras en Gmail (§4.4). |
| `mailImport` | Registra filas `incl` como gastos `{…, quien:'familia', medio:'Tarjeta', hormiga, hormigaSrc:'ia'}`; agrega `mid` a `S.correoIds` (máx. últimos **800**); "N gastos registrados desde tu correo". |
| `cobroTono` | Reabre `M.cobro` con el tono `data-t`. |
| `cobroCopy` | Copia `#cobroTxt` → "Mensaje copiado" (si falla selecciona: "Selecciona y copia el texto"). |
| `cobroIA` | Reescribe el mensaje con IA (§4.6). |
| `cobroMail` | `mcpCall('Gmail','create_draft',{to:[email], subject:'Recordatorio de pago' + (' · concepto'), body})` → "Borrador creado en tu Gmail. Revísalo y envíalo desde allá."; errores: "Conecta Gmail en claude.ai para crear el borrador" / "No se pudo crear el borrador". |
| `acuerdo` | `buildAcuerdo(L, kind)` → `acuerdo-de-pago-<nombre-en-minúsculas-con-guiones>.pdf`. |
| `gcalGo` | Crea eventos en Google Calendar (§3.6). |
| `priCal` | Escribe en `S.calendario` los montos: título con "prima" → `round(sal/2)`; "intereses…cesant" → `round(sal*0.12)`; "cesant" → `round(sal)`. Toast "Valores puestos en el calendario fiscal" o "No encontré las fechas de primas en tu calendario". |
| `priIA` | Plan de prima con IA (§4.9). |
| `selGrupo` / `delGastoGrupo` / `delGrupo` | Selecciona grupo / borra gasto del grupo / confirma "¿Eliminar grupo?" "Se borrará el grupo con todos sus gastos." |
| `kidMesada` | `k.mov.push({desc:'Mesada', valor: +mesada})` y gasto `{desc: 'Mesada de <nombre>', cat: 'Educación' si existe si no 'Otros', valor, quien:'familia', medio:'Efectivo'}`; "Mesada entregada". |
| `resumenIA` | Botón → "Analizando el mes…"; `S.resumenes[RPT] = {...resumenIA(RPT), fecha: hoy}`; error → "No se pudo generar el resumen". |
| `retoNew` | Crea reto desde plantilla `RETOS_T` → "¡Reto iniciado! Mucha suerte". |
| `retoDel` | Elimina reto (sin confirmación). |
| `retoReset` | `inicio = hoy`. |
| `retoMark` | Alterna marca (semana numérica o fecha ISO) en `r.marcas`. |
| `libroGo` | Cambia de libro (si es el actual solo cierra). |
| `libroMenu` | Abre/cierra popover de libros. |
| `libroDel` | Confirmación "¿Eliminar el libro "X"?" / "Se borrarán todos sus datos. Tus otros libros no se tocan." → borra nube y localStorage del libro, lo quita de `LIBROS`, vuelve a `principal` y recarga. |
| `help` | Abre `M.help` de la vista actual. |
| `helpHide` | Marca la ayuda de la vista como vista (`lmf-ayuda-vista`). |
| `helpReset` | Limpia `lmf-ayuda-vista` → "Las explicaciones volverán a aparecer". |
| `tourStart` / `tourNext` / `tourPrev` / `tourEnd` | Tour guiado (§5.11). |
| `launcher` / `appEdit` / `appClose` / `appDel` | Cajón de apps (§5.13). |

### 2.4 Atributos de cambio (`change`) e `input`
- **`input` global**: inputs `data-money` se reformatean en vivo con separador de miles `NF` (`es-CO`); `data-money="dec"` admite coma y máx. 2 decimales. `#q` → buscador lateral. `#popq` → filtra el select. `[data-autocat]` → `onAutoInput`; cambiar `valor` en el form gasto re-dispara `onAutoInput` sobre `desc`. Siempre `applyShows` + `updatePreviews` del modal o `main`.
- **`change` global**:
  - `data-edit="col|id|campo"` (edición inline genérica). Prefijos: `perfil|campo`, `cfg|campo`, `pct|k` (`S.cfg.pct`), `trm|moneda`, `notif|k`, `ia|k`, `def|k` (si `plazo` → `max(1, round)`), `local|home` (`KHOME`, pantalla de inicio) y `local|priv` (`KPRIV`) → toast "Guardado en este navegador" sin commit; `cat|id|campo` (si se renombra una categoría, **renombra en cascada** `S.gastos[].cat` y `S.fijos[].cat`); `cfgl|lista|id|campo`; `miembros|id|campo`; por defecto `S[col].find(id)[campo]`. Luego `commit()` + toast "Guardado" (h_forms lo convierte en "Cambios guardados · Se guardaron automáticamente."). Hidden/checkbox → render inmediato; texto → `pendingRender`.
  - `data-ex` (simulador de estrategia de deudas: `EX.extra` o `EX.abono[campo]`), `data-isim` (simulador de inversiones `ISIM`), `data-x` → `EXTRA_CHANGE[x](el)`, `data-ui="gmes"` (mes de Gastos), `data-ui="rpt"` (mes de Reportes), `data-imp="i|campo"` (edita fila de importación), `#impFile` (lee CSV UTF-8 → `parseCSV` → `classifyImport`), `#impJson` (restaura respaldo, §3.5).
- `EXTRA_CHANGE` de f_extra: `tsim` (simulador TC `TSIM.v|t`), `mailrow` (fila de correo), `rentaY` (año), `rentaUVT` (`S.cfg.uvt[año]`), `rentaF` (`S.renta[año].consig|consumos`), `rentaDoc` (checklist), `priSal`, `priPct`, `kid` (`S.kids[id].mesada|frec`), `kidMeta` (`S.kids[id].meta.nombre|valor`).

### 2.5 Teclado
- `Ctrl/Cmd+K`: enfoca `#q` si es visible; si no, abre modal `buscar`.
- `Ctrl/Cmd+B` (sin estar escribiendo): `toggleSidebar()`.
- `Escape`: cierra popover → modal → nav móvil.
- En select abierto: flechas ↑↓ mueven la opción activa, `Enter` elige.
- En `#q` con resultados: `Enter` va al primero.
- `Enter`/`Espacio` sobre `.rowi[data-act]` hace click (accesibilidad).
- Cierre de popovers: `mousedown` fuera, `resize`, `scroll` (excepto campana).

---

## 3. Infraestructura: render, commit, toast, deshacer, libros, respaldo, PDF

### 3.1 Render
- `view()` = `location.hash` sin `#` si existe `V[v]`; si no, la pantalla de inicio guardada (`KHOME`, default `inicio`).
- `render()`: `SCOPE='p'; OPTS.p={}; closePop(); main.innerHTML = V[v](); renderNav(v); applyShows(main); updatePreviews(main)`; rellena `[data-icon]` vacíos.
- `hashchange`: cierra nav móvil; abre el grupo del menú que contiene la vista (y cierra los demás, guarda `KNAV`); `render()`; scroll arriba.
- `softRender()`: si el usuario está escribiendo (`typing()` = foco en input/textarea visible dentro de `main` o `#modal`) o hay modal abierto → `pendingRender = true`; un `focusout` posterior (80 ms) ejecuta el render pendiente.
- `applyShows(root)`: cada `[data-show="campo:v1|v2;otro:v3"]` es visible si **todas** las condiciones (`;`) se cumplen y el valor del input `name=campo` del mismo form está en la lista (`|`).
- Modales: `openModal(tipo, ds)` → `MODAL = {type, ds}`; `renderModal()` usa `SCOPE='m'` (opciones de selects en `OPTS.m`), título `r.t`, descripción `r.d || MDESC[tipo]`, cuerpo `r.b`, pie `r.f`, `wide`. Autofocus al primer input si ancho > 700. Si `tipo==='gasto' && ds.foto` → dispara el selector de foto.
- Popovers (un solo `#pop`): `sel`, `date` (calendario 6×7, lunes primero, botones Hoy/Cerrar), `bell`, `menu` (crear), `search`, `fly`, `user`, `libros`, `launcher`.

> Next.js: rutas App Router por sección, `Dialog` de shadcn para modales con registro tipo → componente, `Popover`/`Command` para selects con búsqueda, `Calendar` para fechas. La lógica `data-show` → renderizado condicional con `watch()`.

### 3.2 Commit y nube
- `commit()` = `store.set(LKEY(), S)` + `scheduleCloud()`.
- `LKEY()`: libro `principal` → `libro-mayor-familiar-v3`; otro → `libro-mayor-familiar-v3:<id>`.
- Nube (solo claude.ai, `window.claude.use('db')`, API tipo Firestore):
  - Rutas: estado `libro/estado` (principal) o `libros/<id>`; gastos por mes `gastos/<YYYY-MM>` o `libros/<id>/gastos/<YYYY-MM>` con `{items: [...]}`.
  - `scheduleCloud`: no escribe si no hay db, sin permiso o `S.sample`; debounce **700 ms**.
  - `flushCloud`: serializa `S` sin `gastos` (+`updatedAt`) solo si cambió; gastos agrupados por `fecha.slice(0,7)`, escribe solo meses cambiados y borra meses vacíos. Reentrancia con `writing/again`. Estados de sync (`setSync`): `cloud` "Guardado en la nube" / "Sincronizando…"; `err` "Solo lectura" (error de permiso → `canWrite=false`) o "Sin sincronizar"; `local` "Solo en este navegador".
  - `bootCloud`: suscripción `onSnapshot` al estado y a la colección de gastos; ignora snapshots con escrituras pendientes o mientras hay cambios locales; si el estado remoto es distinto lo aplica con `normalize` conservando gastos; si `data.v !== 3` fuerza re-subida (migración). Si no existe estado remoto y no es ejemplo → sube el local. Timeout 10 s → "Sin conexión".
  - En Supabase: tabla `libros` + `estado` (jsonb) + `gastos` (filas), con Realtime para multi-dispositivo; reemplaza este mecanismo.

### 3.3 Toast y deshacer
- `toast(msg, o)` → `toastX` (h_forms): tipos `success|info|warn|error|del`; título por tipo; duración 7 s con deshacer, 5,2 s warn/error, 3,6 s resto; máx. 4 en pila; pausa al pasar el mouse; deduplica el mismo mensaje en 2,5 s (salvo con deshacer); botón opcional `action: {l, fn}`.
- **Deshacer**: el llamador pasa `undo: snap` (copia profunda de `S` previa). Al tocar "Deshacer": `S = snap; commit(); render()` + toast "Recuperamos lo que habías eliminado." título "Deshecho". Se usa en `del`, `delMiembro`, `delcfg`, `confirmYes`.
- `notifToast(n)`: toast de notificación con enlace a `#n.go`, 9 s. `maybePopups()`: una vez por sesión, si `S.cfg.notif.popup`, muestra hasta 3 notificaciones no leídas de nivel `bad`/`warn` escalonadas (600 ms + 500 ms·i).

### 3.4 Libros múltiples (f_extra §15)
- Lista en `localStorage['lmf-libros']` (default `[{id:'principal', nombre:'Hogar', icon:'house'}]`); libro activo en `lmf-libro` (`BOOK`, leído en el arranque). En la nube: doc `meta/libros` `{libros}` con `onSnapshot` (`bootLibros`).
- `cambiarLibro(id)`: `commit()`, guarda `lmf-libro`, limpia hash y **recarga la página** (150 ms).
- `openLibros`: popover "Mis libros" con el actual marcado, "Nuevo libro (p. ej. tu negocio)" y "Eliminar este libro" (no en principal).
- Cada libro tiene su propio `S` completo (cuentas, gastos, préstamos y ajustes).
- Supabase: tabla `books (id, household_id, nombre, icon)`; todo dato con `book_id`.

### 3.5 Importar / exportar / respaldo
- **Respaldo JSON** (`exportjson`): `libro-mayor-familiar-YYYY-MM-DD.json` = `JSON.stringify({...S, sample:false}, null, 1)`.
- **Restaurar** (`#impJson`): parsea; válido solo si `Array.isArray(o.activos)`; `S = normalize({...o, sample:false})`; "Respaldo importado" / "El archivo no es un respaldo válido."
- **CSV de movimientos** (`csv`): `movimientos-YYYY-MM.csv`, BOM `﻿`, separador `;`, todos los campos entre comillas (comillas dobles escapadas), columnas `Fecha;Descripción;Categoría;Quién;Medio;Valor` de `gastosMesK(RPT)`.
- **Importar extracto CSV**: `#impFile` (FileReader UTF-8) o texto pegado `#impTxt` + `impparse`; `parseCSV` (c_views) produce `rows`; `classifyImport()` (§4.3); edición por fila con `data-imp`; `impgo` importa; `impsample` carga `SAMPLE_CSV`.
- **Descargas** `downloadFile(nombre, data)`: base usa `window.claude.use('downloads').save({filename, data})` → "Archivo listo" / "Descarga cancelada" / "No se pudo descargar el archivo."; s_dian.js lo envuelve con `<a download>` fuera de claude.ai.
- **Formatear** `formatear(keys)`: mapa `gastos→[gastos]`, `ingresos→[ingresos]`, `fijos→[fijos, suscripciones]`, `prestamos→[cobrar, pagar]`, `contactos`, `inversiones`, `balance→[activos, pasivos]`, `metas`, `consejos`; `config` → `S.cfg = defaults().cfg`; `perfil` → `S.perfil = defaults().perfil`; `S.sample = false`.
- **Eliminar cuenta** `deleteAccount()`: borra en la nube el estado y todos los meses de gastos; borra `LKEY, KEY2, KEY1, KREAD, KNAV, KHOME, KPRIV, KSIDE` de localStorage; `S = normalize(defaults())`; resetea `CONS`; quita `priv`; sync "Cuenta eliminada"; toast "Tu cuenta y tus datos fueron eliminados"; va a `#puesta`. Error de nube → "No se pudieron borrar los datos de la nube. Intenta de nuevo."

### 3.6 Google Calendar (MCP en claude.ai)
- `M.gcal`: pagos de `agenda()` con `0 ≤ d ≤ 45` días; checkbox por ítem (deshabilitado y "Ya está" si `S.calIds[calKey]`), `calKey = "${k}:${id}:${iso(fecha)}"`.
- `gcalGo`: por cada seleccionado `mcpCall('Google Calendar','create_event', {summary: "Cobrar|Pagar: titulo ($monto)", description: "sub. Valor: $monto. Registrado desde Mirai.", allDay: true, startTime: 'YYYY-MM-DDT00:00:00', endTime: día+1, overrideReminders: [{method:'popup', minutes: 900}], availability: 'AVAILABILITY_FREE'})`; marca `S.calIds[key]=1`. Sin MCP → "Conecta Google Calendar en claude.ai para usar esta opción". Final "N pagos agregados a tu Google Calendar". (900 min = 15 h antes ≈ "un día antes" a las 9 a. m.)
- Next.js: Google Calendar API con OAuth en el servidor o archivo `.ics`.

### 3.7 Menús emergentes
- **Agregar** (`openCreate`): Gasto ("Algo que acabas de pagar"), Gasto fijo ("Arriendo, servicios, colegio"), Ingreso ("Salario u otro ingreso"), Préstamo que hice ("Alguien te debe"), Deuda o crédito ("Tú debes"), Contacto ("Persona o empresa"), Inversión ("CDT, fondo, ahorro"), Meta de ahorro ("Algo que quieres lograr"), con isotipos `gastos, fijos, ingresos, me-deben, le-debo, contactos, inversiones, metas`.
- **Usuario** (`openUserMenu`): avatar + nombre + estado de sync; Mi perfil; Ajustes; Puesta en marcha (`done/total`); Modo claro/oscuro; Mostrar/Ocultar montos; Expandir/Contraer menú (Ctrl B); Exportar respaldo; Seguridad y contraseña (`ajustes`, pestaña `seguridad`); si hay contraseña (`AUTH.acc`): Bloquear ahora (`secLock`), Cerrar sesión (`secLogout`); Formatear datos y Eliminar cuenta (pestaña `respaldo`).
- **Campana** (`openBell`): "Notificaciones", "Marcar todo como leído", lista de `notifs()` con ícono, título, cuerpo, `relTime` (Hoy/Mañana/Ayer/En N días/Hace N días) y punto de no leído; vacío: "No tienes notificaciones. Te avisaremos cuando se acerque un pago."
- **Buscador** (`openSearch`, `#q`): secciones (`MENUPAGES`), contactos, préstamos (nombre + concepto; selecciona el préstamo con `SEL`), gastos fijos; máx. 10. Modal `M.buscar` (`#q2`): secciones y contactos.

### 3.8 Impresión / PDF (jsPDF, CDN)
Ambos PDF eliminan caracteres fuera de Latin-1 (`/[^\x00-\xFF]/g`) porque la fuente Helvetica de jsPDF no los soporta. Carta, unidades `pt` (612 de ancho).

**Reporte del mes `buildPDF(k)`** (datos `reportData(k)`):
- Cabecera: rectángulo navy `rgb(31,43,75)` de 86 pt + franja lima `rgb(158,219,78)` de 5 pt; "Mirai Finanzas" (bold 20) y "Reporte de MES AÑO · nombre · fecha" (10,5).
- Secciones (título verde bosque `rgb(63,122,30)` 12,5 pt + línea): **Lo que tengo y lo que debo** (cada activo convertido a COP, Inversiones, Lo que me deben, **Total activos**; cada pasivo, Créditos y préstamos, **Total pasivos**, **Patrimonio**); **Resultado del mes** (Ingresos, Necesidades, Gustos, Otros gastos = x+a, Cuotas de créditos, Suscripciones, **Te sobró/Te faltó**); **Salud financiera** (`indicadores()` con `ok`: "valor · Sano/Vigilar/En riesgo"); **Préstamos** (Me debe · nombre / Le debo · nombre con saldo); **Gastos por categoría**.
- Saltos de página en y > 700 (secciones) / 740 (filas).

**Acuerdo de pago y pagaré `buildAcuerdo(L, kind)`**:
- Partes: "yo" = perfil (`nombre` o línea, `docTipo doc` o "C.C. ______________", ciudad); "otro" = contacto (o `loanName`), con dirección y teléfono. En `cobrar` el acreedor soy yo; en `pagar` el deudor soy yo.
- Texto literal: título "ACUERDO DE PAGO Y PAGARÉ"; encabezado "En CIUDAD, a los D días del mes de MES de AÑO, comparecen: …, en adelante EL ACREEDOR; y …, en adelante EL DEUDOR, quienes acuerdan lo siguiente:".
  - PRIMERA. Objeto: recibió "a título de préstamo, la suma de $monto (MONTO EN LETRAS pesos M/CTE), destinada a concepto, el día fecha".
  - SEGUNDA. Forma de pago: "en N cuotas <frecuencia>es, según el plan de pagos anexo, mediante el sistema de "<nombre>" (<técnico>)".
  - TERCERA. Intereses: con tasa → "interés remuneratorio del X% mensual, equivalente a Y efectivo anual, sin superar la tasa máxima legal vigente. En caso de mora se causarán intereses moratorios a la tasa máxima permitida por la ley."; sin tasa → "NO causa intereses remuneratorios…".
  - CUARTA. Pagos anticipados sin penalidad; **cláusula aceleratoria** con el incumplimiento de 2 o más cuotas.
  - QUINTA. Mérito ejecutivo; dos ejemplares.
  - PLAN DE PAGOS: columnas Cuota, Fecha, Valor, Interés, Saldo = cuotas ya pagadas (`e.hist` tipo cuota, fecha programada) + `e.plan`.
  - Firmas: línea, rol, nombre, documento y recuadro "Huella" para cada parte.
  - Pie gris 8 pt: "Modelo de referencia generado por Mirai Finanzas. Para efectos legales se recomienda revisarlo con un abogado y autenticar las firmas en notaría."
- `numLetras(n)`: número en letras en español hasta millones (unidades 0–29 irregulares, decenas "y", "cien"/"ciento", "un millón", "N millones", "mil", apócope "uno"→"un" antes de mil/millones), primera letra mayúscula.

### 3.9 QR
**No hay generación de QR en estos tres archivos.** (qrcodejs se usa en otro módulo, probablemente 2FA en `g_auth.js` o el acceso del contador en `s_dian.js`.)

### 3.10 Enlaces externos
- **WhatsApp**: `https://wa.me/<tel>?text=<mensaje codificado>`; si el teléfono tiene 10 dígitos se antepone `57`. El `href` se actualiza en vivo al editar `#cobroTxt`.

---

## 4. Inteligencia artificial

### 4.1 Contrato del adaptador (`sample`)
Todas las llamadas usan `await window.claude.use('sample')` (directo o vía `useCap('sample')`). Interfaz:
- `sample(prompt, {modelTier})` → `{text}`.
- `sample.json(prompt, {modelTier, images?})` → objeto ya parseado.
- `sample.limits?.()` → `{images: bool}`.
- `modelTier`: `'quick'` (clasificación, correo, NL, cobro) o `'default'` (consejero, OCR, primas, resumen).

Fuera de claude.ai, `l_ajustes.js` envuelve `window.claude.use('sample')` con `aiPick` (n_servidor): devuelve `null` si `S.cfg.ia.on === false`; si no, elige proveedor (`S.cfg.ia.prov`, default `claude`) por **servidor** (`/api/ai`) o clave propia (`extAdapter`): agrega al prompt "Responde únicamente con JSON válido, sin texto adicional.", extrae el primer `{…}`/`[…]` con regex y hace `JSON.parse`; si falla y hay fallback, avisa "No pudimos usar <proveedor>; usamos Claude incluido." `limits()` → `{images:true}`.
Interruptores en `S.cfg.ia`: `on`, `autocat`, `hormiga`, `consejero`, `ocr`, `prov`.
Si no hay IA, cada función tiene **respaldo local** (indicado abajo). `iaMsg()` (j_loans): "La inteligencia artificial está apagada…", "La lectura de fotos está desactivada…", "La lectura con IA solo funciona dentro de claude.ai o con un proveedor configurado en Ajustes."

> Next.js: un único endpoint `/api/ai` (route handler) con `{task, input}` y validación de salida con `zod`; los prompts quedan en el servidor.

### 4.2 Consejero antes de gastar — `askAI(d, an)` (tier `default`)
Entrada `ctx`:
```json
{"pregunta":{"tipo":"comprar algo|prestarle dinero a alguien|sacar un crédito|asumir un nuevo gasto mensual","descripcion","valor","forma_pago":"N cuotas mensuales de X | de contado","intereses_totales","tasa_efectiva_anual_pct"},
 "finanzas":{"ingreso_mensual","gastos_fijos_mes","cuotas_deudas_mes","suscripciones_mes","gasto_variable_promedio_mes","dinero_libre_mes_antes","dinero_libre_mes_despues","deudas_sobre_ingreso_despues_pct","disponible_hoy","disponible_despues","meses_colchon_antes","meses_colchon_despues","metas":[{"nombre","falta","fecha"}],"perfil_riesgo","tasa_usura_pct"},
 "historial_del_deudor":{"n","mora","saldo","nombre"}|null,"veredicto_reglas":"si|cuidado|no","observaciones_reglas":["…"]}
```
Prompt (resumen literal): "Eres un consejero financiero para familias colombianas. Hablas con alguien que NO sabe de finanzas: usa español sencillo de Colombia, frases cortas, sin tecnicismos (si usas uno, explícalo entre paréntesis). Las cifras están en pesos colombianos (COP). La persona quiere saber si debe hacer esto antes de gastar o prestar. Analiza sus datos reales y responde SOLO con un objeto JSON válido… Sé honesto: si no le conviene, dilo con amabilidad. Respeta el veredicto de las reglas salvo que tengas una razón clara, y explícala. No inventes datos que no estén aquí."
Salida:
```json
{"veredicto":"si|con_cuidado|no","titular":"≤12 palabras","explicacion":"2-3 frases","razones":["3-5 con cifras $ 1.234.567"],"alternativas":["2-4"],"plan":["3 pasos"],"pregunta":"una pregunta para reflexionar"}
```
Errores: `S.cfg.ia.consejero===false` o sin IA → `{err:'no'}`; sin `veredicto` → `{err:'formato'}`; excepción → `{err: código}`. Respaldo: análisis de reglas `analizar()` (§6.1).
`consResult(c)`: veredicto `si` ("Te alcanza", titular por defecto "Puedes hacerlo sin poner en riesgo tus finanzas"), `cuidado` ("Puedes, pero con cuidado" / "Es posible, pero te deja con poco margen"), `no` ("Mejor no, por ahora" / "Esto pondría en aprietos tus finanzas"). Métricas: en cuotas → Cuota mensual (n) y Intereses en total; de contado → "Días de trabajo que equivale" y "Te quedaría disponible"; siempre "Libre al mes después" y "Colchón de emergencia (meses)". Secciones "Por qué", "Otras opciones", "Si decides hacerlo", alerta "Piénsalo". Nota: con error IA "No pude consultar la IA en esta vista, así que ves el análisis automático con tus números."; con IA "Análisis con IA basado en tus datos. Es una orientación, no reemplaza a un asesor financiero." Si `prestar` y veredicto ≠ `no` → botón "Registrar este préstamo" (abre `loan` cobrar con contacto y monto).
Vista: 4 tipos (Comprar algo "Un celular, un viaje, muebles…", Prestar dinero "A un familiar, amigo o cliente", Sacar un crédito "Préstamo de banco o libranza", Un nuevo gasto mensual "Arriendo, plan, gimnasio, colegio"); pasos 1 "¿Qué quieres hacer?" y 2 "Cuéntame los detalles"; campos `desc`, `valor` (hint "Para un gasto mensual, escribe cuánto es al mes."), `contactoId` (solo prestar), `forma` (contado/cuotas), `cuotas` (12), `modoInt` (`no`, `tasa` "Sé el porcentaje", `cuota` "Sé el valor de la cuota"), `tasa` (hint "Si te dicen "al 2%", escribe 2. Las tarjetas suelen cobrar entre 1,8% y 2,2% mensual."), `cuotaV`. Esqueleto de carga "Revisando tus finanzas…". "Consultas anteriores": últimas 8.

### 4.3 Clasificación de gastos — `aiClassify(items)` (tier `quick`, e_ai.js)
Entrada por ítem: `{i, descripcion, valor (redondeado), veces_mes}` (`vecesMes` = gastos con la misma descripción normalizada en los últimos 30 días). Categorías listadas como `Nombre (necesidad|gusto|ahorro)`.
Prompt (resumen): "Clasificas gastos de una familia colombiana (valores en pesos COP). Categorías disponibles (usa el nombre EXACTO, sin el paréntesis)… "Gasto hormiga": gasto pequeño (normalmente de hasta unos `umbral*2` pesos), frecuente o impulsivo, no esencial y fácil de evitar: tinto, snacks, gaseosas, domicilios, propinas, taxis cortos, compras por antojo, retiros con comisión, apps. NO son hormiga: arriendo, servicios públicos, mercado grande, salud, educación, cuotas de créditos ni gastos grandes. Si se repite muchas veces en el mes (campo "veces_mes"), es más probable que sea hormiga."
Salida: `{"items":[{"i":0,"categoria":"…","hormiga":true,"razon":"máximo 8 palabras"}]}` → normalizada a `{i, cat (solo si existe la categoría), hormiga (bool o null), razon (≤80 chars)}`. Sin IA o error → `null`.
Usos:
- **`onAutoInput`** (form `gasto`, `fijo`, `compraTC` con `data-autocat`): (1) si `S.cfg.ia.autocat` y la categoría no fue elegida a mano → `localCat` inmediato con pista "Sugerida por tus reglas | tus gastos anteriores | el nombre". (2) Debounce **750 ms**, requiere ≥ 3 caracteres; caché `AICACHE` por `norm(desc)|round(valor/1000)` (o `|f` en fijos). Llama IA si falta categoría (y la local no vino de regla/historial) o si es gasto con `S.cfg.ia.hormiga`, modo `auto` y valor > 0. Pista "La IA está pensando…". Descarta si el form cambió. No reemplaza por "Otros" si la local encontró algo. Pista "Categoría sugerida por IA". Guarda `form.dataset.aiH/aiR` y actualiza `#hHint`.
- **`updHormigaHint`**: modo `si` → "Lo marcaste como hormiga"; `no` → nada; con IA → "La IA lo detecta como gasto hormiga: razón" / "La IA no lo ve como hormiga: razón"; si no, regla local → "Parece un gasto hormiga".
- **`queueHormiga` / `flushHormiga`**: tras guardar un gasto sin veredicto (no manual, no fijo), cola con debounce 400 ms, lotes de **40**; asigna `hormiga`, `hormigaSrc='ia'`, `hormigaRazon`; `commit(); softRender()`; procesa el siguiente lote.
- **`reviewMonth(k)`**: gastos del mes sin fijo y sin fuente manual/ia; si no hay → "Todos los gastos de este mes ya están revisados"; "La IA está revisando N gastos…"; lotes de 40; sin IA → "No pude consultar la IA en esta vista. Abre el libro en claude.ai."; final "Listo: la IA encontró N gastos hormiga".
- **`classifyImport()`**: primero local (categoría si era "Otros", `localHormiga`); si `autocat` o `hormiga` → `IMP.ai='pensando'`, IA sobre las primeras **60** filas; aplica categoría (salvo que haya regla local) y hormiga (`aiH=true`); `IMP.ai = 'ok' | 'no'`.

### 4.4 Gastos desde el correo — `mailScan` (MCP Gmail + IA `quick`)
- Query por defecto `MAILQ`: `(compra OR compraste OR transaccion OR transacción OR pago OR débito OR retiro) (from:bancolombia OR from:davivienda OR from:nequi OR from:daviplata OR from:bancodebogota OR from:nu.com.co OR from:scotiabankcolpatria OR from:bbva OR from:avvillas OR from:lulobank OR from:bancopopular OR from:bancodeoccidente OR from:falabella) newer_than:30d`; editable en "Búsqueda avanzada" (`#mailQ`).
- `mcpCall('Gmail','search_threads',{query, pageSize:40})`; excluye mensajes ya importados (`S.correoIds`).
- Prompt: "Extrae compras, pagos o débitos de estas notificaciones bancarias colombianas. Ignora publicidad, ofertas, extractos y abonos/ingresos. Responde SOLO JSON: {"items":[{"i":0,"es_gasto":true,"fecha":"YYYY-MM-DD","comercio":"nombre corto","valor":12345}]}. Valor en pesos sin puntos. Si no hay fecha clara usa la del correo." + `CORREOS: [{i, asunto, texto (snippet), fecha_correo, remitente}]`.
- Filtra `es_gasto && valor > 0`; fecha inválida → hoy.
- **Respaldo sin IA**: regex `\$\s?([\d\.\,]+)` en asunto+snippet → `pnum`; fecha del correo; comercio por regex `en ([A-Z0-9 \*\.]{3,30})` o el asunto.
- Luego `localCat`, `localHormiga`, `incl=true` y `aiClassify(rows)`.
- Estados: `buscando`, `nomcp` ("No pude conectarme a tu Gmail" / "Abre el libro en claude.ai y asegúrate de tener Gmail conectado en tus conectores."), `vacio` ("No encontré correos nuevos de compras" / "Prueba con la búsqueda avanzada, agregando el remitente exacto de tu banco."), `error` ("Hubo un problema al leer el correo"), `ok` (tabla de revisión).
- Next.js: Gmail API con OAuth en servidor (o reenviar notificaciones a un buzón propio).

### 4.5 Foto de la factura — `leerFactura(file)` (tier `default`, imagen)
- Requiere `S.cfg.ia.ocr !== false`, IA y `limits().images` ("Esta vista no permite enviar imágenes a la IA.").
- Prompt: "Lee esta factura o recibo colombiano. Responde SOLO JSON: {"comercio":"nombre corto","valor":12345,"fecha":"YYYY-MM-DD","categoria":"una de: <categorías>"}. "valor" es el TOTAL pagado en pesos, sin puntos. Si no hay fecha visible usa null."
- Rellena `desc`, `valor` (formateado), `fecha` (si es ISO válida), `cat` (si existe; marca `catManual`). Pistas "Leyendo la factura…" → "Listo. Revisa los datos antes de guardar." / error "No pude leer la factura. Intenta con una foto más clara o escribe los datos.". Luego dispara `onAutoInput` (hormiga).
- (OCR de préstamo y de comprobante de pago están en j_loans.)

### 4.6 Mensaje de cobro — `cobroIA` (tier `quick`, texto libre)
Prompt: "Reescribe este mensaje de cobro para WhatsApp en español colombiano, tono <amable|directo|firme>, respetuoso, breve (máximo 70 palabras), conservando TODAS las cifras y fechas exactas. Devuelve solo el mensaje.\n\n<mensaje>". Salida `r.text.trim()` → reabre el modal con el mensaje. Sin IA: "La IA solo funciona dentro de claude.ai". Error: "No se pudo mejorar el mensaje".

### 4.7 Plantillas de cobro `cobroMsg(L, tono)` (sin IA)
Variables: primer nombre del contacto `n`, primer nombre del usuario `yo`, cuotas `cu` = vencidas o la próxima, `tot` = suma, `fecha` de la primera, `conc` = ` del préstamo "concepto"`.
- **amable**: "Hola {n}, ¿cómo estás? Te escribo para recordarte la cuota{conc}: {tot}{, que tenía fecha del {fecha} | para el {fecha}}. Quedan pendientes {saldo} en total. Cualquier cosa me cuentas. ¡Gracias! {yo}"
- **directo**: "Hola {n}. Te recuerdo el pago{conc} por {tot} ({venció el | vence el} {fecha}). Saldo pendiente: {saldo}. ¿Me confirmas cuándo me lo puedes transferir? Gracias."
- **firme**: "Hola {n}. El pago{conc} por {tot} está atrasado desde el {fecha}{ ({mora} días)}. Necesito que lo pongamos al día lo antes posible. Saldo total pendiente: {saldo}. Por favor respóndeme hoy con la fecha de pago."
Tono por defecto: `firme` si `mora > 0`, si no `amable`.

### 4.8 Registro en lenguaje natural — `EXTRA_FORM.nl` (tier `quick`)
- Primero `parseNL(t)` local (respaldo):
  - Valor: primer número con unidad opcional; `mil|k|lucas` ×1.000; `millon|millones|palos|m` ×1.000.000; número < 1.000 y la frase contiene "mil" → ×1.000.
  - Fecha: "anteayer/antier" −2; "ayer" −1; "el <día de la semana>" → el último día con ese nombre (hoy incluido).
  - Tipo: ingreso si contiene `me pagaron|recibi|me consignaron|me llego|cobre|ingreso|gane|vendi`.
  - Descripción: quita verbos (gasté, pagué, compré, me pagaron, recibí, me consignaron, cobré), el monto, palabras de fecha y preposiciones iniciales (en, de, por, un, una); capitaliza.
- IA, prompt: "Interpreta lo que escribió una persona colombiana para registrar un movimiento de dinero. Hoy es YYYY-MM-DD. Texto: "…". Categorías de gasto: …. Responde SOLO JSON {"tipo":"gasto"|"ingreso","valor":12345,"descripcion":"corta","fecha":"YYYY-MM-DD","categoria":"una de la lista o null"}. "mil"=x1000, "lucas"=x1000, "palos"=millones." Se usa si `valor` > 0.
- Botón "Entendiendo…". Sin valor → "No entendí el valor. Prueba: "gasté 15 mil en almuerzo"". Ingreso → `openModal('extra', …)`; gasto → `openModal('gasto', {desc, valor, fecha, cat: ia || localCat})`. **No guarda directo**: siempre confirma en el modal.

### 4.9 Plan de la prima — `priIA` (tier `default`)
Prompt: "Eres un asesor financiero para una familia colombiana. Sugiere cómo usar la próxima prima (<sal/2> COP). Datos: deudas [{nombre, saldo, interes_mensual}], tarjetas deuda X, metas [{nombre, falta}], disponible hoy X, gastos básicos mes X. Español sencillo. Responde SOLO JSON {"resumen":"2 frases","pasos":["3 a 5 pasos con cifras $"],"porcentajes":{"deudas":0,"ahorro":0,"metas":0,"gusto":0}}". `sal = PRI.sal ?? ingresoMensual()`. Guarda en `PRI.ai` (no persiste en `S`) y mezcla `porcentajes` en `PRI.pct`. Errores: "La IA solo funciona dentro de claude.ai" / "No se pudo obtener la sugerencia".

### 4.10 Resumen del mes — `resumenIA(k)` (tier `default`)
Datos: `{mes, ingreso_mensual, gastos_por_categoria, mes_anterior, total, total_anterior, hormiga, topes_excedidos (categorías con tope y gasto > tope), deudas_saldo (préstamos por pagar + tarjetas), metas [{nombre, avance %}]}`.
Prompt: "Eres un asesor financiero cercano para una familia colombiana. Haz un resumen del mes en español sencillo, con cifras en formato $ 1.234.567. Responde SOLO JSON {"titular":"máx 12 palabras","resumen":"2-3 frases","gastaste_mas":["3 puntos"],"mejoro":["1-3 puntos"],"alertas":["0-3 puntos"],"recomendacion":"una acción concreta para el próximo mes"}."
**Respaldo sin IA**: titular "Gastaste $total en MES", resumen "Comparado con el mes anterior ($X), gastaste más/menos.", top 3 categorías, alertas "Te pasaste del tope en <cat>", recomendación "Abre el libro en claude.ai para recibir un análisis completo con IA.", `local:true`.
Se guarda en `S.resumenes[YYYY-MM]` con `fecha`. Tarjeta `resumenCard()`: "Resumen del mes con IA", botón Generar/Actualizar, columnas "En qué gastaste más", "Lo que mejoró", "Ojo con esto" (vacío: "Nada destacado"), caja "Para el próximo mes".

### 4.11 Integraciones MCP (`mcpCall(server, tool, input)`)
`useCap('mcp').callTool(server, tool, input).payload`; sin MCP lanza `{code:'no_mcp'}`. Usos: `Gmail.search_threads`, `Gmail.create_draft`, `Google Calendar.create_event`. Fuera de claude.ai no existen → en Next.js deben ser integraciones OAuth del servidor.

---

## 5. Módulos y vistas de `f_extra.js`

### 5.1 Tarjetas de crédito (`V.tarjetas`, modales `tarjeta`, `compraTC`)
- Fórmulas en §6.3. Estado UI: `TSEL` (tarjeta elegida), `TSIM = {v: 1.200.000, t: 2.1}`.
- KPIs: "Debes en tarjetas" (n tarjetas), "Pago mínimo de este mes" ("Suma de las cuotas que se cobran"), "Uso del cupo total" ("Lo sano: menos del 30%"; rojo > 30 %).
- Detalle: "Debes en total", "Pago mínimo del mes", "Cupo disponible" (`max(cupo − deuda, 0)`), "Próxima fecha de pago" (`proxDia(pago)`). Barra de uso (rojo > 70 %, ámbar > 30 %, lima). Mensaje: "> 30 %: Lo ideal es no pasar del 30% para cuidar tu historial en las centrales de riesgo." / "¡Bien! Usar menos del 30% cuida tu historial crediticio."
- Botón "Pagué el total de la tarjeta" + "Pagar el total cada mes evita casi todos los intereses."
- Tabla de compras: Compra, Fecha, Valor, Cuotas (k de n), Cuota mensual, Intereses, Te falta. Nota: "Suponemos que pagas al menos el mínimo cada mes. Las compras a una sola cuota no cobran intereses si pagas a tiempo."
- Simulador "¿A cuántas cuotas difiero una compra?" para 1, 3, 6, 12, 24, 36 cuotas: cuota, intereses, total. Tip de tasa: "Aparece en tu extracto como "tasa mes vencido" o "MV". En Colombia suele estar cerca del 2% mensual."
- Tips del modal: cupo ("El máximo que te deja gastar el banco…"), corte ("El día en que el banco cierra la cuenta del mes. Las compras después de esa fecha pasan al mes siguiente."), pago ("Hasta ese día puedes pagar sin intereses de mora."), tasa ("Míralo en tu extracto como "tasa MV".").

### 5.2 Gastos desde el correo (`V.correo`) — §4.4
Pasos visuales: "1. Buscamos" (correos de bancos y billeteras de los últimos 30 días), "2. La IA los lee" (valor, comercio, fecha y categoría), "3. Tú confirmas" ("Nada se guarda sin tu visto bueno."). Nota: "Usa tu conexión de Gmail en claude.ai. La primera vez te pedirá permiso. Solo se leen los correos que coinciden con la búsqueda."

### 5.3 Recordatorio de cobro (`M.cobro`) — §4.6/4.7
Cabecera con avatar, nombre, teléfono y correo; tonos Amable/Directo/Firme; textarea editable; botones "Mejorar con IA", "Copiar"; pie "Abrir WhatsApp" (verde `#25D366`) o "Agrega el celular del contacto para enviar por WhatsApp."; "Crear borrador en Gmail" si hay correo.

### 5.4 Asistente de renta (`V.renta`) y `RDOCS`
- Año por defecto `RENTAY = año actual − (mes < agosto ? 1 : 0)`; selector entre año anterior ("declaras en <año actual>") y año actual. UVT editable en `S.cfg.uvt[año]` (tip: "La UVT es la unidad que usa la DIAN para fijar los topes. Para 2025 es $ 49.799 y para 2026 es $ 52.374. Verifica el valor oficial de cada año.").
- `S.renta[año] = {docs: {}, consig: 0, consumos: 0}`.
- Criterios (tope en UVT; `pasa = uvt && valor ≥ tope`):
  | Criterio | Valor | Tope |
  |---|---|---|
  | Ingresos brutos del año | `ingresoMensual() × 12` | 1.400 UVT |
  | Patrimonio bruto al 31 de diciembre | `totales().A` | 4.500 UVT |
  | Compras con tarjeta de crédito | suma de compras TC del año | 1.400 UVT |
  | Compras y consumos totales | `max(gastos del año, R.consumos)` | 1.400 UVT |
  | Consignaciones y depósitos bancarios | `R.consig` | 1.400 UVT |
- Veredicto: `debe` (alguno pasa) → "Sí, todo indica que debes declarar renta"; `cerca` (alguno ≥ 85 % del tope) → "Estás cerca de los topes: revisa con cuidado"; si no → "Por ahora no superas los topes para declarar". Texto: "Basta con superar uno solo de los topes para estar obligado." + dígitos de cédula del perfil o "Agrega en tu perfil los últimos dígitos de tu cédula para saber tu fecha."
- "Datos que ya tengo en el libro": ingresos estimados, patrimonio bruto hoy, deudas hoy, rendimientos de inversiones (`Σ inv().bruto`), retención en la fuente de CDT (`Σ inv().ret`), posibles dependientes (miembros con rol `/hij/i`). Nota: "Los valores del patrimonio y las deudas deben tomarse al 31 de diciembre del año gravable."
- **`RDOCS`** (checklist, `S.renta[año].docs[clave] = bool`):
  | Clave | Documento | Ayuda |
  |---|---|---|
  | `cir` | Certificado de ingresos y retenciones (formulario 220) | Te lo da tu empleador entre febrero y marzo. |
  | `banc` | Certificados bancarios con saldos al 31 de diciembre | Cada banco lo genera en su app o página. |
  | `cdt` | Certificados de rendimientos financieros y retención (CDT, fondos) | De cada entidad donde tengas inversiones. |
  | `cred` | Certificados de deudas al 31 de diciembre | Créditos, tarjetas e hipoteca. |
  | `hip` | Certificado de intereses pagados por crédito de vivienda | Son deducibles: pueden bajar tu impuesto. |
  | `pens` | Certificados de aportes voluntarios a pensión o cuentas AFC | Pueden ser rentas exentas. |
  | `salud` | Certificado de medicina prepagada o pólizas de salud | Deducción hasta un tope mensual. |
  | `dep` | Datos de tus dependientes económicos | Hijos o personas a cargo: dan derecho a una deducción. |
  | `bienes` | Valor de tus bienes (avalúo catastral, vehículo) | Del impuesto predial y vehicular. |
- (s_dian.js añade el menú DIAN completo; esta vista es la versión base.)

### 5.5 Primas y cesantías (`V.primas`) — fórmulas §6.5
- Salario automático: máximo entre ingresos cuya `cat+concepto` contiene "salari" de `conv(valor) × FREC[frec]`; editable (`PRI.sal`; tip: "Lo tomamos de tus ingresos. Si ganas hasta 2 salarios mínimos, súmale el auxilio de transporte para calcular prima y cesantías.").
- Próximas fechas (ordenadas): Prima de junio (30-jun), Prima de diciembre (20-dic), Intereses de cesantías (31-ene del año siguiente), Cesantías al fondo (14-feb del año siguiente). Nota: "Calculado por un año (o semestre) completo trabajado. Las cesantías van a tu fondo y solo se retiran para vivienda, educación o si te quedas sin empleo."
- Plan para la más próxima: sliders 0–100 paso 5 de Pagar deudas (40), Ahorro / emergencias (30), Mis metas (20), Darme un gusto (10); monto = `valor × pct / Σpct`. "Recomendado: primero las deudas más caras, luego tu fondo de emergencia."
- Estado `PRI` no persiste (solo memoria).

### 5.6 Gastos compartidos (`V.compartidos`) — algoritmo §6.6
Métricas: "Gastado en total", "Le toca a cada uno (si es parejo)", "Personas". Secciones "Para quedar a paz y salvo" (`X le paga a Y`), "Cómo va cada uno" (Le deben / Debe / A paz y salvo), agregar persona, "Gastos" ("Pagó X · entre N · fecha"). Vacío: "Crea un grupo para un viaje, la casa con roomies o un regalo entre amigos. Anotan quién pagó qué y te decimos quién le debe a quién."

### 5.7 Mesada de los hijos (`V.mesadas`)
- Hijos = miembros cuyo rol **no** coincide con `/titular|c[oó]nyuge|esposa|esposo|pareja/i`.
- `S.kids[memberId] = {mesada: 20000, frec: 'semanal', mov: [], meta: {nombre: '', valor: 0}}` (se crea al render).
- Saldo = `Σ mov.valor`; avance meta = `min(saldo/meta.valor, 1)`; "¡Meta cumplida! 🎉" o "Le faltan $X para su <meta>." Últimos 6 movimientos. Frecuencias: semanal, quincenal, mensual (solo informativa; no hay entrega automática).

### 5.8 Ingreso extra (`M.extra`, `S.extras`) — §1.18.

### 5.9 Retos de ahorro (`V.retos`, `RETOS_T`)
| k | tipo | días | base | Nombre | Descripción |
|---|---|---|---|---|---|
| `domis` | `sin_cat` (Domicilios) | 30 | — | 30 días sin domicilios | Cocina en casa o recoge tú mismo. Ahorro típico: $ 150.000 al mes. |
| `hormiga` | `sin_hormiga` | 7 | — | Una semana sin gastos hormiga | Nada de tintos, snacks ni antojos durante 7 días. |
| `rest` | `sin_cat` (Restaurantes) | 30 | — | Un mes sin restaurantes | Lleva almuerzo y prepara comidas especiales en casa. |
| `52` | `semanas` | 364 | 5.000 | Reto de las 52 semanas | Semana 1 ahorras $ 5.000, semana 2 $ 10.000… Al final tendrás $ 6.890.000. |
| `diario` | `diario` | 30 | 10.000 | Ahorra $ 10.000 diarios por un mes | Al final del mes tendrás $ 300.000. |
Estructura en `S.retos`: `{id, k, tipo, cat, dias, base, n, inicio, marcas: []}`. Lógica en §6.7. UI: semanas → 52 chips (tooltip "Semana w: $w·base"), "Toca la semana cuando guardes su valor."; diario → "Hoy ahorré $base" / "Hoy ya ahorraste"; roto → "Volver a empezar desde hoy".

### 5.10 `HELP` — ayudas por sección (textos literales)
Estructura `{t: título, i: intro, p: [pasos], tips?: [consejos]}`. `helpStrip(v)` muestra la intro con "¿Para qué sirve esta sección?" + "Ver cómo se usa" + "Entendido" (oculta guardando `lmf-ayuda-vista[v]=1`). `M.help` = título "Cómo usar: <t>", intro, pasos numerados, consejos (alerta "Consejo"), botones "Hacer el tour de la plataforma" y "Entendido". (Otros módulos agregan más entradas de `HELP`.)

- **puesta — Puesta en marcha.** La guía para configurar tu libro la primera vez. Pasos: 1) Sigue los pasos en orden: cada uno abre el formulario que necesitas. 2) Los pasos opcionales los puedes omitir si no aplican. 3) Cuando termines, la guía se oculta sola. Puedes volver desde el menú de tu perfil.
- **inicio — Inicio.** Tu resumen del día: cuánto tienes, cuánto te queda en la quincena y qué pagos se acercan. Pasos: 1) Escribe en la caja de arriba lo que gastaste, en palabras ("gasté 15 mil en almuerzo") y la IA lo registra. 2) Las tarjetas de números muestran tu patrimonio, lo que te queda en la quincena, tus cuotas y los gastos hormiga. 3) En "Próximos 15 días" puedes pagar o cobrar directamente con los botones de cada fila. Consejo: Registra tus gastos cada día: toma segundos y es lo que hace que todo funcione.
- **consejero — Consejero IA.** Antes de comprar, prestar o endeudarte, pregúntale si te alcanza. Pasos: 1) Elige qué quieres hacer: comprar, prestar, sacar un crédito o asumir un gasto mensual. 2) Escribe el valor y, si es a cuotas, cuántas y el interés (o el valor de la cuota). 3) Toca "Analizar con IA": verás un veredicto (te alcanza, con cuidado o mejor no), las razones y alternativas. Consejos: Mientras más completos estén tus ingresos, gastos fijos y deudas, más preciso es el consejo. / Puedes cambiar qué tan estricto es en Ajustes › General.
- **balance — Balance y quincenas.** La Cuenta T muestra lo que tienes (activos) frente a lo que debes (pasivos). Las pestañas de quincena muestran cuánto entra y sale en cada mitad del mes. Pasos: 1) En "Lo que tengo y lo que debo" agrega tus cuentas bancarias, efectivo, casa o carro, y deudas sin cuotas. 2) Los préstamos, inversiones y tarjetas se suman solos desde sus módulos. 3) En las pestañas de quincena navega entre meses con las flechas. Consejo: El arriendo o el mercado no van aquí: son gastos. Regístralos en Gastos fijos o Gastos.
- **ingresos — Ingresos.** Todo el dinero que recibes con regularidad. Pasos: 1) Toca "Agregar ingreso" y escribe el concepto y el valor. 2) Si te pagan por quincena, escribe lo de una quincena y elige "Cada quincena". 3) Asigna a quién pertenece el ingreso para ver el aporte de cada integrante. Consejo: Para ingresos de una sola vez (una venta, un bono) escribe en Inicio: "me pagaron 200 mil por…".
- **gastos — Gastos y hormiga.** Todo lo que gastas, organizado por día. La IA detecta los gastos hormiga: pequeños, frecuentes y evitables. Pasos: 1) Toca "Registrar gasto", escribe en qué gastaste: la categoría se pone sola. 2) También puedes tomarle foto a la factura y la IA llena los datos. 3) Toca la taza junto a un gasto para marcarlo o desmarcarlo como hormiga. 4) El botón "Revisar hormiga con IA" revisa todo el mes de una vez. Consejo: Un tinto diario de $ 5.000 son $ 1.800.000 al año.
- **fijos — Gastos fijos.** Pagos que se repiten: arriendo, servicios, colegio, administración. Pasos: 1) Agrega cada gasto con su día de pago y frecuencia. 2) Te avisamos unos días antes (lo configuras en Ajustes › Alertas). 3) Al tocar "Pagar" queda registrado también en tus gastos del mes. Consejo: Para servicios que cambian cada mes, activa "El valor cambia" y escribe el valor real al pagar.
- **suscripciones — Suscripciones.** Servicios que se cobran solos cada mes o cada año. Pasos: 1) Agrega tus suscripciones con su valor y fecha de cobro. 2) Revisa las "sugeridas": son cobros que se repiten en tus gastos. 3) Elimina las que ya no usas para ver cuánto te ahorras al año.
- **importar — Importar extractos.** Sube el archivo CSV de tu banca en línea y conviértelo en gastos. Pasos: 1) Descarga los movimientos de tu banco en formato CSV. 2) Súbelo o pega su contenido y toca "Leer movimientos". 3) Revisa la categoría y si es hormiga; luego importa los seleccionados.
- **correo — Correo del banco.** Lee las notificaciones de compra que tu banco te envía al Gmail. Pasos: 1) Toca "Buscar compras en mi correo". 2) La IA saca comercio, valor y fecha de cada correo. 3) Marca los que quieres registrar y confirma. Los correos ya importados no se repiten.
- **tarjetas — Tarjetas de crédito.** Controla cupo, fechas y el costo real de diferir compras. Pasos: 1) Agrega tu tarjeta con su cupo, día de corte, día de pago e interés mensual. 2) Registra cada compra con el número de cuotas. 3) Usa la calculadora antes de comprar para ver cuánto pagas en intereses según las cuotas. Consejo: Diferir a 1 cuota y pagar el total cada mes evita los intereses.
- **me-deben — Me deben.** Personas o clientes a quienes les prestaste dinero. Pasos: 1) Toca "Nuevo préstamo", elige o crea el contacto y escribe el valor y las cuotas. 2) Si no sabes la tasa, escribe cuánto es cada cuota y calculamos el interés. 3) Cuando te paguen, toca "Registrar pago recibido": cuota completa o abono. 4) Usa "Enviar recordatorio" para cobrar por WhatsApp o correo, y "Acuerdo de pago" para generar el documento en PDF.
- **le-debo — Le debo.** Tus créditos con bancos y deudas con personas. Pasos: 1) Registra la deuda con el banco o la persona, el valor, las cuotas y la tasa. 2) Agrega los seguros que te cobran en cada cuota para que el valor coincida con tu extracto. 3) Registra cada pago o abono para saber cuánto te falta. Consejo: Un abono para "terminar antes" casi siempre ahorra más intereses que bajar la cuota.
- **contactos — Contactos.** Las personas y empresas con quienes tienes préstamos. Pasos: 1) Guarda nombre, documento, celular, correo y dirección una sola vez. 2) Al registrar un préstamo, solo eliges el contacto. 3) En cada tarjeta ves cuánto te debe y cuánto le debes.
- **estrategia — Salir de deudas.** Compara dos métodos para pagar tus deudas más rápido con un pago extra. Pasos: 1) Escribe cuánto más puedes pagar cada mes. 2) Mira cuántos meses y cuánto interés ahorras con cada método. 3) Simula un abono a un crédito y elige entre terminar antes o bajar la cuota.
- **presupuesto — Presupuesto 50/30/20.** La regla más usada: 50% necesidades, 30% gustos, 20% ahorro. Pasos: 1) Escribe el tope mensual de cada categoría. 2) El semáforo te muestra si vas bien, cerca del tope o te pasaste. 3) Cambia los porcentajes en Ajustes › Finanzas.
- **flujo — Flujo de caja.** Proyección de los próximos 12 meses: cuánto entra, cuánto sale y con cuánto quedas. Pasos: 1) Revisa los meses en rojo: ahí te faltaría plata. 2) Para que sea preciso, mantén al día ingresos, gastos fijos, deudas y presupuesto. 3) Escribe el valor de primas y cesantías en el calendario para que se sumen en su mes.
- **metas — Metas y emergencia.** Ponle nombre y fecha a lo que quieres lograr. Pasos: 1) Crea una meta con el valor y la fecha. 2) Te decimos cuánto guardar al mes. 3) Registra cada abono para ver tu avance. Consejo: Primero arma tu fondo de emergencia: de 3 a 6 meses de gastos básicos.
- **familia — Por miembro.** Cupo y gastos de cada integrante de la familia. Pasos: 1) Agrega los integrantes en tu perfil. 2) Escribe el cupo mensual de cada uno. 3) Al registrar gastos elige quién gastó para ver el avance.
- **retos — Retos de ahorro.** Desafíos para cambiar hábitos. Pasos: 1) Elige un reto de la lista. 2) Los retos "sin" se revisan solos con tus gastos. 3) En los retos de ahorro, marca cada día o semana cuando guardes el dinero.
- **primas — Primas y cesantías.** Planea en qué usar tus primas y cesantías antes de recibirlas. Pasos: 1) Revisa tu salario (lo tomamos de tus ingresos). 2) Mueve los porcentajes para repartir la prima. 3) Pídele un plan a la IA o pon los valores en el calendario.
- **compartidos — Gastos compartidos.** Divide cuentas de viajes, la casa o regalos entre varias personas. Pasos: 1) Crea un grupo con los nombres de los participantes. 2) Anota cada gasto: quién pagó y entre quiénes se divide. 3) Mira "Para quedar a paz y salvo": quién le paga a quién.
- **mesadas — Mesada de los hijos.** Una cuenta sencilla para enseñarles a manejar el dinero. Pasos: 1) Agrega a tus hijos como integrantes en tu perfil. 2) Define la mesada y entrégala con un toque. 3) Anoten juntos sus gastos y su meta de ahorro.
- **inversiones — Inversiones.** Mira cuánto crece tu dinero, explicado sin palabras raras. Pasos: 1) Toca "Agregar inversión" y elige dónde pusiste el dinero. 2) Para CDT y cuentas que rinden, escribe la tasa E.A.: calculamos lo que ganas. 3) Para fondos o acciones, actualiza el valor cuando revises tu extracto.
- **recordatorios — Próximos pagos.** Todo lo que debes pagar o cobrar, ordenado por fecha. Pasos: 1) Paga o cobra con los botones de cada fila. 2) Agrega los pagos a tu Google Calendar con un toque. 3) Los vencidos aparecen arriba en rojo.
- **calendario — Calendario fiscal.** Fechas anuales: primas, cesantías, renta, predial, impuesto vehicular. Pasos: 1) Ajusta las fechas de impuestos a las de tu ciudad y tu cédula. 2) Escribe el valor estimado para que se sume en el flujo de caja. 3) Toca "Recordar" para crear un gasto fijo anual con aviso.
- **indicadores — Salud financiera.** Seis preguntas para saber si tus finanzas están sanas. Pasos: 1) Cada indicador muestra un semáforo y su meta. 2) Si faltan datos, te dice cuáles y te lleva a completarlos. 3) El puntaje general aparece con al menos 4 indicadores.
- **reportes — Reportes.** Balance y resultado del mes para revisar en familia. Pasos: 1) Elige el mes. 2) Genera el resumen con IA para entender en qué se fue la plata. 3) Descarga el PDF o los movimientos en CSV para Excel.
- **renta — Asistente de renta.** Te dice si debes declarar renta y qué documentos reunir. Pasos: 1) Elige el año gravable y verifica el valor de la UVT. 2) Completa las consignaciones del año. 3) Marca los documentos a medida que los consigas. Consejo: Es una orientación. Para presentar la declaración apóyate en un contador o en el asistente de la DIAN.
- **perfil — Perfil.** Tus datos y los de tu familia. Pasos: 1) Completa tu nombre, ciudad y documento (se usan en los acuerdos de pago). 2) Agrega a los integrantes de la familia y su cupo.
- **ajustes — Ajustes.** Personaliza el libro. Pasos: 1) General: tema, privacidad, IA y pantalla de inicio. 2) Alertas: qué te avisamos y con cuánta anticipación. 3) Finanzas: quincenas, porcentajes, monedas y usura. 4) Listas: categorías, bancos, medios de pago, relaciones y reglas. 5) Datos y cuenta: respaldos, formatear y eliminar.

### 5.11 Tour guiado (`TOUR`, 11 pasos)
| # | Selector | Título | Texto |
|---|---|---|---|
| 1 | `#side` | El menú | Aquí están todas las secciones, agrupadas. Toca un grupo para ver sus opciones. Lo puedes contraer con Ctrl+B. |
| 2 | `.sb-brand` | Tus libros | Cambia entre tus libros (por ejemplo, el hogar y tu negocio) o crea uno nuevo. |
| 3 | `.sb-search` | Buscador | Encuentra secciones, contactos, préstamos o gastos fijos escribiendo su nombre. Atajo: Ctrl+K. |
| 4 | `#crumbs` | Dónde estás | Esta ruta te muestra en qué libro y sección te encuentras. |
| 5 | `.composer` | Registra en palabras | En Inicio escribe lo que gastaste o recibiste, como lo dirías: la IA lo entiende y lo registra. |
| 6 | `.sb-create` | Agregar | Registra rápidamente un gasto, ingreso, préstamo, deuda, contacto, inversión o meta. |
| 7 | `#bell` | Notificaciones | Te avisamos de pagos por vencer, cobros atrasados, gastos hormiga y más. |
| 8 | `.sb-tog` | Contraer el menú | Hazlo más angosto para ganar espacio (Ctrl+B). Ocultar montos y el tema oscuro están en tu menú de usuario, abajo. |
| 9 | `#asFab` | Chat con Mirai | Este globo abre el chat: pregunta lo que quieras sobre tu plata. Lo puedes arrastrar a donde te estorbe menos. |
| 10 | `.sb-user` | Tu menú | Perfil, ajustes, tema oscuro, respaldo y la puesta en marcha. |
| 11 | `.page-h .help-btn` | Cómo funciona | En cada sección encontrarás este botón con el paso a paso para usarla. |
Mecánica: `tourStart` cierra modal/popover, expande el sidebar (`sb-col` fuera), scroll arriba, `TI=0`; `tourShow` **salta** pasos cuyo elemento no existe o no es visible; overlay `#tour` con anillo (`.tour-ring`, padding 6) y tarjeta (ancho `min(320, ancho−24)`, a la derecha del elemento o debajo si no cabe, arriba si se sale por abajo); "Paso N de 11", botones Saltar / Anterior (si N>1) / Siguiente o Terminar. `tourPrev` retrocede saltando pasos inexistentes. Se recoloca en `resize`. `tourEnd` guarda `lmf-tour = 1`.

### 5.12 Buscador modal (`M.buscar`) — §3.7.

### 5.13 Cajón de apps (`launcher`)
- Apps por defecto `defApps()`: Gmail (`https://mail.google.com`, isotipo `correo`, "Correo"), Calendar (`https://calendar.google.com`, `calendario`, "Agenda"), Drive (`https://drive.google.com`, `importar`, "Documentos"), Claude (`https://claude.ai`, `consejero`, "Asistente IA"), DIAN (`https://www.dian.gov.co`, `renta`, "Impuestos"), Mi banco (sin URL, `le-debo`, "Agrega el enlace de tu banca en línea"). Guardadas en `S.cfg.apps`.
- Popover: cabecera "Apps" + Editar/Listo; "Mirai Finanzas · Estás aquí"; "Tus apps" (enlaces `target=_blank`; sin URL → atenuada y abre el modal para agregar el enlace); "Agregar app"; nota "Accesos directos a las apps que usas junto con Mirai. Se abren en una pestaña nueva." En edición: botón ✕ (`appDel`) y "Editar".
- Íconos disponibles: todos los isotipos `ISO` excepto `mirai`.

### 5.14 Otros
- `proxDia(d)`: próxima fecha con día `d` (este mes si no ha pasado, si no el siguiente; ajusta a fin de mes).
- `digits(s)`: deja solo dígitos.

---

## 6. Fórmulas y reglas de negocio literales

### 6.1 Consejero — `analizar(d)`
```
ing = ingresoMensual(); fij = fijosMes(); cuo = cuotasMes('pagar'); subs = subsMes()
varr = gastoVariableReal()            // promedio de gastos no fijos de los últimos 3 meses con datos; si no hay, Σ topes variables
libre = ing - fij - cuo - subs - varr
liq = liquidez()                       // activos cód. 11xx + inversiones tipo ahorro
bas = gastosBasicos() || 1             // fijos + cuotas + subs + Σ topes de categorías 'n' no cubiertas por fijos
valor = +d.valor; n = max(1, +d.cuotas||1)
enCuotas = tipo ∈ {credito, prestar} || (tipo==='comprar' && forma==='cuotas')
si enCuotas:
   modoInt 'tasa'  → tasaM = tasa; cuota = annuity(valor, tasaM/100, n)
   modoInt 'cuota' → cuota = cuotaV; tasaM = rateFromCuota(valor, cuota, n, 'mensual')
   si no           → cuota = valor/n
   total = cuota*n; intereses = max(total-valor, 0); ea = (1+tasaM/100)^12 - 1
libreD = libre; ratioD = ing ? cuo/ing : 0; liqD = liq
   fijo     → libreD = libre - valor
   prestar  → liqD = liq - valor
   enCuotas → libreD = libre - cuota; ratioD = (cuo+cuota)/ing
   contado  → liqD = liq - valor
emergA = liq/bas; emergD = liqD/bas
historial (prestar con contacto): préstamos cobrar del contacto → n, cuántos con mora, saldo total
dias = valor / (ing/30)                // días de trabajo equivalentes
```
Límites por `S.cfg.estricto` → `[ratio sano, ratio máximo, meses colchón, % libre mínimo]`:
- `prudente`: `[0.25, 0.35, 4, 0.15]`
- `equilibrado` (default): `[0.30, 0.40, 3, 0.10]`
- `flexible`: `[0.35, 0.50, 2, 0.05]`

Reglas (el veredicto solo empeora: `si` → `cuidado` → `no`):
1. `libreD < 0` → **no**: "Después de esto te faltarían $X cada mes para cubrir tus gastos." · `libreD < ing×LIM[3]` → **cuidado**: "Te quedarían solo $X libres al mes." · si no: "Te seguirían quedando $X libres al mes."
2. En cuotas y no prestar: `ratioD > LIM[1]` → **no** "Tus deudas se llevarían el X% de tu ingreso (lo sano es menos del Y%)." · `ratioD > LIM[0]` → **cuidado** "Tus deudas pasarían al X% de tu ingreso, por encima del Y% recomendado."
3. Prestar o contado (no fijo): `liqD < 0` → **no** "No tienes $valor disponibles: te faltan $X." · `emergD < 1` → **no** "Te quedarías con menos de un mes de colchón para emergencias." · `emergD < LIM[2]` → **cuidado** "Tu colchón para emergencias bajaría de A a B meses."
4. En cuotas y `ea×100 > S.cfg.usura` → **cuidado** "El interés equivale a X% anual, por encima de la tasa de usura que tienes configurada (N%)."
5. Deudor con préstamos en mora → **cuidado** "<Nombre> tiene N préstamo(s) con pagos atrasados."
6. En cuotas con intereses > 0 (informativo): "Pagarías $X en intereses (en total $Y)."

### 6.2 Préstamos (b_core, usado aquí)
- `annuity(S, i, n) = n ≤ 0 ? S : i = 0 ? S/n : S·i / (1 − (1+i)^−n)`.
- Tasa por periodo: `simple` → `im·k`; resto → `(1+im)^k − 1`; `k` por frecuencia: mensual 1, quincenal 0,5, semanal 12/52, diario 12/365, diariohab 12/313.
- `rateFromCuota`: bisección (80 iteraciones, rango 0–100 % mensual) que iguala `annuity(M, (1+mid)^k−1, n)` a la cuota; 0 si `cuota·n ≤ M`.
- E.A. → mensual: `((1+ea/100)^(1/12) − 1)·100`; en `simple` con E.A.: `ea/12`.
- Sistemas: francés (cuota fija), alemán (capital fijo), simple (interés sobre el monto original), americano (solo intereses + capital al final), sin intereses. `extra` (seguros) se suma a cada cuota.
- Abono `plazo` (francés): `nRem = ceil(−ln(1 − S·i/C) / ln(1+i))` (o `ceil(S/C)` si i=0); alemán/simple/sin: `ceil(S/capF)`. Abono `cuota`: recalcula cuota con el mismo número de cuotas.
- Usura: alerta si E.A. > `S.cfg.usura`.

### 6.3 Tarjetas de crédito
```
cortesDesde(t, fecha, hasta): cuenta cortes (día t.corte, ajustado a fin de mes) estrictamente posteriores a la fecha de compra y ≤ hasta (máx. 600)
compraEstado(t, c, hasta=hoy):
   n = max(1, cuotas); i = n>1 ? tasa/100 : 0          // 1 cuota no causa intereses
   cuota = annuity(valor, i, n)
   k = pagada ? n : min(cortesDesde(...), n)            // cuotas ya facturadas
   saldo = valor; repetir k veces: saldo = max(0, saldo - (cuota - saldo*i))
   si pagada → saldo = 0
   int = cuota*n - valor; pendiente = k<n && !pagada
tarjetaPagoMes(t, offset) = Σ cuota de compras pendientes (a la fecha hoy+offset meses)
tarjetasDeuda() = Σ saldos de todas las compras de todas las tarjetas   // suma a pasivos en totales()
Uso del cupo = deuda / cupo  (sano < 30 %; rojo > 70 % en la barra)
```

### 6.4 Inversiones
- CDT: `bruto = capital·((1+tasa/100)^(días/365) − 1)`; retención `ret = bruto·4 %`; neto = bruto − ret; mensual = neto/(días/30,4).
- Ahorro: crecimiento mensual `capital·((1+tasa/100)^(1/12) − 1)`; anual simple mostrado `capital·tasa/100`.
- Fondo/acciones/cripto/otro: valor = `actual` (o capital).

### 6.5 Primas y cesantías
- `prima = salario/2` (cada semestre), `cesantías = salario` (anual), `intereses de cesantías = cesantías × 12 %`.
- Fechas: prima 30-jun y 20-dic; intereses de cesantías 31-ene; cesantías al fondo 14-feb.
- Reparto: `monto_i = prima × pct_i / Σpct` (default 40/30/20/10).

### 6.6 Gastos compartidos — `balancesGrupo(g)`
```
b[p] = 0 para cada persona
por gasto: ent = entre (o todas); parte = valor/len(ent); b[paga] += valor; b[p] -= parte para p en ent
deudores = b < -1 (ordenados desc por monto); acreedores = b > 1 (desc)
greedy: m = min(deuda_i, crédito_j) → transferencia {de, a, v:m}; avanza el que quede < 1
```
(Minimiza número de transferencias de forma voraz; tolerancia $1.)

### 6.7 Retos
- `sin_cat` / `sin_hormiga`: primer gasto desde `inicio` de la categoría (comparación normalizada) o que sea hormiga → **roto**: progreso `días(inicio→fecha)/dias`, texto "Se rompió el FECHA (desc)". Si no: `dd = min(días(inicio, hoy)+1, dias)`; progreso `dd/dias`; cumplido si `dd ≥ dias` ("¡Reto cumplido!" / "Llevas dd de N días").
- `semanas`: total 52; ahorro `Σ semana × base` (52 semanas × 5.000 → 6.890.000).
- `diario`: total = días; ahorro = marcas × base.
- Texto: "h de total semanas|días · ahorrado $X".

### 6.8 Gasto hormiga y autocategoría (e_ai.js)
- `norm(s)`: minúsculas, sin tildes (NFD + quitar diacríticos), espacios colapsados, trim.
- `localCat(desc)` (orden de prioridad; requiere ≥ 2 caracteres):
  1. **Regla** del usuario (`S.cfg.reglas`, `k` contenido en la descripción) → `src:'regla'`.
  2. **Historial**: último gasto con descripción igual, o (≥ 4 caracteres) que una empiece por la otra → `src:'historial'`.
  3. **Palabras clave `KW`** (regex por categoría, solo si la categoría existe) → `src:'palabras'`.
  4. Nombre de una categoría (> 3 letras) contenido en la descripción → `src:'palabras'`.
- `KW` (regex literal por categoría): Imprevistos `imprevist|emergencia|urgencia|daño|dano|reparacion|arreglo|varado|grua|cerrajer|plomer|fuga|multa|comparendo|accidente|se rompio|se dano`; Vivienda `arriendo|arrendamiento|administracion|hipoteca|inmobiliaria|predial|canon`; Servicios públicos `energia|luz|enel|codensa|epm|agua|acueducto|alcantarillado|gas natural|vanti|internet|claro|movistar|tigo|etb|wom|plan celular|recarga|aseo`; Mercado `mercado|exito|carulla|jumbo|\bd1\b|\bara\b|olimpica|makro|surtimax|alkosto|tienda|fruver|verdura|carniceria|supermercado|plaza`; Transporte `gasolina|tanqueo|terpel|primax|biomax|uber|didi|cabify|indriver|taxi|transmilenio|sitp|\bbus\b|metro|peaje|parqueadero|lavado del carro|taller|llanta|aceite`; Educación `colegio|pension|matricula|universidad|curso|libro|utiles|uniforme|icetex`; Salud `farmacia|drogueria|\beps\b|medic|cita|odontolog|optica|laboratorio|cruz verde|farmatodo|examen|terapia`; Comisiones bancarias `cuota de manejo|comision|retiro|4x1000|gmf|cajero`; Mascotas `veterinari|concentrado|mascota|perro|gato|purina|peluqueria canina`; Restaurantes `restaurante|almuerzo|cena|corrientazo|hamburguesa|pizza|crepes|frisby|kfc|mcdonald|corral|sushi|asadero|comida rapida`; Café `tinto|cafe|juan valdez|tostao|\boma\b|starbucks|pandebono|empanada|bunuelo|arepa`; Domicilios `rappi|domicilio|ifood|didi food|propina domicili`; Snacks `snack|paquete|gaseosa|dulce|chicle|helado|galleta|papas|chocolatina|mecato|golosina|jugo|agua botella|antojo`; Entretenimiento `cine|cinecolombia|procinal|cinemark|concierto|teatro|\bbar\b|cerveza|rumba|discoteca|juego|steam|playstation|xbox|boleta`; Suscripciones `netflix|spotify|disney|prime video|amazon prime|\bhbo\b|\bmax\b|youtube|apple|icloud|google one|gimnasio|smart ?fit|bodytech|chatgpt|suscripcion|membresia`; Ropa `ropa|zapato|tenis|camisa|pantalon|zara|falabella|arturo calle|koaj|studio f|vestido|chaqueta`; Regalos `regalo|cumpleanos|detalle|flores`; Viajes `hotel|vuelo|avianca|latam|airbnb|viaje|tiquete|wingo|hostal`; Ahorro `ahorro|bolsillo`; Inversión `\bcdt\b|inversion|fiducia|acciones`. (El orden importa: gana la primera coincidencia.)
- `HKW` (palabras hormiga): `tinto|cafe|gaseosa|snack|paquete|dulce|chicle|helado|galleta|mecato|empanada|pandebono|bunuelo|domicilio|rappi|propina|cigarr|chocolatina|golosina|loteria|chance|antojo|cerveza|jugo|agua botella|retiro|cuota de manejo|recarga|uber|taxi`.
- `localHormiga(g)` (`umbral = S.cfg.umbral`):
  1. Gasto de un fijo → no.
  2. `valor > 2×umbral` → no.
  3. Categoría del grupo ahorro (`a`) o Vivienda / Servicios públicos / Educación / Salud → no.
  4. Coincide `HKW` → sí.
  5. `valor ≤ umbral` y categoría del grupo gusto (`g`) → sí.
  6. `valor ≤ umbral` y sin categoría → sí; si no → no.
- `isHormiga(g)`: fijo → no; si `g.hormiga` es booleano (manual o IA) manda; si no, `localHormiga`.
- Prioridad de fuentes: `manual` > `ia` > `auto`/local. La IA nunca pisa una marca manual.

### 6.9 Fijos (reglas al pagar)
- Rango variable: el valor de referencia es el **punto medio** `(vmin+vmax)/2`; cada pago fuera del rango lo amplía.
- Borrar un fijo borra sus gastos generados; deshacer un pago borra el gasto del periodo.
- `cal2fijo`: fechas del calendario → fijo anual variable.

### 6.10 Suscripciones
- `subdone`: avanza el próximo cobro 1 mes (o 12 si anual) y registra el gasto en "Suscripciones" convertido a COP con `S.cfg.trm`.
- Conversión de moneda `conv(v, m) = v × (m ≠ COP ? S.cfg.trm[m] : 1)`.

### 6.11 Persistencia y límites
- `S.consejos` máx. 15 (UI muestra 8). `S.correoIds` máx. 800. Lotes de IA: 40 (hormiga), 60 (importación). Caché IA en memoria por descripción + valor en miles.
- Debounces: autocategoría 750 ms; cola hormiga 400 ms; nube 700 ms; timeout de nube 10 s.

---

## 7. Claves de `localStorage` tocadas en estos archivos

| Clave | Uso |
|---|---|
| `libro-mayor-familiar-v3` (`:<libro>`) | Estado `S` por libro |
| `libro-mayor-familiar-v2`, `-v1` | Versiones antiguas (se borran al eliminar cuenta) |
| `lmf-tema` | Tema `claro`/`oscuro` |
| `lmf-leidas` | IDs de notificaciones leídas |
| `lmf-nav` | Grupos abiertos del menú |
| `lmf-inicio` | Pantalla de inicio preferida |
| `lmf-privado` | Ocultar montos |
| `lmf-menu-contraido` | Sidebar contraído |
| `lmf-libros`, `lmf-libro` | Lista de libros y libro activo |
| `lmf-ayuda-vista` | Ayudas de sección ya cerradas |
| `lmf-tour` | Tour completado |

## 8. Colecciones de `S` que tocan estos archivos
`gastos`, `ingresos`, `extras`, `fijos` (con `pagos[{per, fecha, valor, medio}]`), `suscripciones`, `cobrar`, `pagar` (con `pagos[{id, fecha, tipo, valor, modo}]`), `contactos`, `activos`, `pasivos`, `inversiones`, `metas`, `calendario`, `consejos`, `tarjetas` (con `compras`), `grupos`, `kids` (objeto por miembro), `retos`, `renta` (por año), `resumenes` (por mes), `correoIds`, `calIds`, `fondo` (`saldo`, `mov`), `setup` (`skip`, `dismissed`), `perfil` (`nombre`, `doc`, `docTipo`, `ciudad`, `digitos`, `riesgo`, `miembros[{id, nombre, rol, cupo}]`), `cfg` (`categorias[{id, nombre, grupo n|g|a, icon, tope}]`, `catIngreso`, `medios`, `entidades`, `relaciones`, `reglas[{k, cat}]`, `def{cat, quien, medio, frec, plazo, sistema}`, `ia{on, autocat, hormiga, consejero, ocr, prov}`, `notif{popup…}`, `pct`, `trm`, `uvt{año}`, `usura`, `umbral`, `limite`, `estricto`, `corteQ`, `anticipo`, `apps`), `sample`, `v`.

## 9. Riesgos y notas para la migración
1. **Envoltorios**: `commit`, `render`, `downloadFile`, `toast`, `M.*` y vistas son envueltos por módulos posteriores (gamificación, contador, DIAN, j_loans). Verificar los otros inventarios antes de dar por cerrado un flujo.
2. **Dependencia de claude.ai**: nube (`db`), descargas, Gmail y Google Calendar (MCP) solo existen dentro de claude.ai. En Next.js: Supabase (datos + Realtime), descargas nativas del navegador, OAuth de Google en el servidor.
3. **Libros**: hoy cambiar de libro recarga la página; en Next.js debe ser una ruta (`/[libro]/…`) o contexto sin recarga.
4. **Deshacer** por copia completa de `S`: en una base relacional conviene borrado lógico (`deleted_at`) + restauración, o transacción inversa.
5. **Bug potencial**: `loanDefaults` usa `ds.cid||S.contactos.length?'ex':'new'` (precedencia: `(ds.cid||len) ? 'ex' : 'new'`), comportamiento correcto por casualidad; documentado por si se reescribe.
6. **Bug menor**: el listener `input` de `priPct` calcula variables que no usa (no actualiza el monto en vivo; el `change` sí re-renderiza).
7. **PDF**: los generadores eliminan todo carácter > `\xFF`. Las tildes y la ñ se conservan (están en Latin-1), pero se pierden emojis, comillas tipográficas, "—", "≈" y "›". Considerar `@react-pdf/renderer` o jsPDF con fuente embebida.
8. **Textos de la UI** citan "claude.ai" en mensajes de error de IA/MCP: hay que reescribirlos para el nuevo despliegue.
9. **Fechas tributarias y UVT** están en tips de texto (UVT 2025 = $ 49.799; 2026 = $ 52.374): mantener la verificación con fuentes oficiales.

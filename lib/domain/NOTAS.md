# lib/domain — notas de la migración v4 → v5

Lógica de negocio pura portada de Mirai 4.0 (`legacy/src/*.js`) a TypeScript. Cada función se prueba
contra la función equivalente de la v4 ejecutando el bundle real (`legacy/dist/app.check.js`) en un
sandbox de `node:vm` con "hoy" fijo y los datos de ejemplo `sample()` (familia Navarro).

- Cargador del bundle: `__tests__/legacy.ts` (`loadLegacy(hoy)`; si falta el bundle corre `python3 build.py`).
- Adaptador v4 → v5 (solo pruebas): `__tests__/adapt.ts` (`scenario(hoy)`, `bookOf(S)`, `expectClose`).
- Datos extra para las pruebas: `__tests__/fixtures.ts` (tarjetas, extras, empeños, ingresos semanales/anuales/USD…).
- Las pruebas corren con `TZ=America/Bogota` (`vitest.config.ts`).

## Reglas de uso

1. **Nada lee el reloj.** Todas las funciones reciben `today` ('YYYY-MM-DD' o `Date`). En la capa que llama
   (Server Components, rutas, cron) usa `todayBogota()` de `dates.ts`.
2. **Las listas llegan filtradas** por quien llama: sin filas con `deleted_at`, solo ingresos `activo` y
   suscripciones `activa`. Los préstamos traen sus pagos en `payments`, los gastos fijos en `payments`
   (de `fixed_expense_payments`) y las tarjetas sus compras en `purchases`.
3. Los gastos para `localCat` (historial) deben ir en orden de creación (el más reciente al final).
4. Las fechas que devuelven los cálculos son strings 'YYYY-MM-DD' (la v4 devolvía `Date`).

## Diferencias con la v4

### Cambios de forma (sin efecto en los resultados)

| Tema | v4 | v5 |
|---|---|---|
| Categorías de gastos, fijos, reglas y retos | por **nombre** (`g.cat`, `r.cat`), comparando en minúsculas | por **id** (`category_id`). `hormigas().porCat` va indexado por `category_id` (`''` = sin categoría). |
| Préstamos | `S.cobrar` / `S.pagar`, `acreedor:{kind,id}` / `contactoId` | una lista `loans` con `kind`; `contact_id` / `entity_id` (si hay `contact_id` en una deuda, manda el contacto). |
| `classify()` / `parseCSV()` | devuelve el nombre o `'Otros'` | devuelve `category_id` o `null` (= Otros). |
| `sim()` (avalancha / bola de nieve) | identifica cada deuda por su **nombre** | por **id** (`pay`, `ord`) + `names`. Corrige un caso: dos deudas con el mismo nombre y concepto se mezclaban en `pay` y solo la primera recibía el dinero extra. |
| `retoEstado().txt` | texto con HTML escapado (`esc(desc)`) | texto plano (React escapa al pintar). |
| `histPlan()` | lee el formulario (`fv`) y asigna `id` | recibe `{mode, ncuotas, saldoHoy, fultPago}` y no asigna `id` (lo pone la base de datos). |
| Gasto hormiga | `typeof g.hormiga === 'boolean'` decide | en la base `hormiga` siempre es booleano: se toma como decisión solo si `hormiga_src` no es nulo (`manual`, `ia` o `regla`); si es nulo, regla local. Al migrar datos: `hormiga_src = hormigaSrc || 'manual'` cuando `hormiga` era booleano en la v4. |
| `notifs()` | también filtraba por canal (matriz de `l_ajustes.js`) | solo la lista base + empeños (`_rawNotifs` de la v4). El filtro por canal va en el módulo de notificaciones. |

### Casos borde donde la v5 se aparta a propósito

1. **Meta sin fecha** (`goals.fecha` nulo, permitido en el esquema v5): la v4 hacía `parse('')` = hoy y avisaba
   "Tu meta vence pronto". La v5 no avisa. (En la v4 la fecha era obligatoria, así que no cambia nada en datos reales.)
2. **`histPlan` modo saldo con `saldoHoy` nulo**: la v4 leía el campo vacío como 0 y marcaba todas las cuotas
   como pagadas; la v5 no genera pagos (el formulario debe exigir el saldo). Con 0 explícito se comporta igual que la v4.
3. **Reto "sin categoría" con `category_id` nulo** (categoría borrada): la v5 no lo da por roto con gastos sin categoría.

### Errores o limitaciones de la v4 que se MANTIENEN por paridad (propuesta incluida)

1. **Flujo de caja con ingresos anuales en 0** (`flujo()`): `x.frec === 'anual' ? 0 : …`. Un ingreso anual
   (bonificación, prima extralegal) no aparece en ningún mes, aunque `ingresoMensual()` sí lo cuenta como 1/12.
   *Propuesta:* agregar `mes` a `incomes` (o usar el mes de `created_at`) y sumarlo completo en su mes; mientras
   tanto, recomendar registrarlo en el calendario fiscal. Prueba: `cashflow.test.ts › paridad documentada`.
2. **Retención en la fuente sin el límite global del 40 % / 1.340 UVT** (`retEmpleado`): solo resta aportes
   obligatorios y el 25 % exento (tope 790 UVT/año). No considera dependientes (10 %, máx. 32 UVT/mes),
   intereses de vivienda, medicina prepagada, aportes voluntarios ni el límite del art. 336.
   *Propuesta:* `retEmpleado(mensual, aportes, uvt, { dependiente, intVivienda, prepagada, voluntarios })` con
   `rentasExentasYDeducciones = min(Σ, 40 % × (ingreso − aportes), 1.340/12 UVT)`; validar con el agente
   `finanzas-colombia` y fuentes DIAN antes de cambiarlo. Sigue siendo un estimado.
3. **IBC de independientes sin tope de 25 SMMLV** (`dedCalc`, tipo independiente): `max(SMMLV, 40 % × M)`.
   *Propuesta:* `min(max(SMMLV, 40 % × M), 25 × SMMLV)`.
4. **Porcentajes en 0 caen al valor por defecto** (`+D.saludP || 4`): escribir 0 % de salud o pensión vuelve
   al 4 % (o 12,5 % / 16 % / 12 %). Para quitar un descuento hay que apagar su interruptor (`salud:false`).
   *Propuesta:* usar `??` y validar en el formulario.
5. **Simulador de deudas mensual con tasas por periodo** (`sim`): cada paso es un "mes", pero usa la tasa y la
   cuota por periodo del préstamo; una deuda quincenal o semanal se simula como si pagara una sola cuota al mes.
   *Propuesta:* mensualizar `i` y `c` con `FMES` (`(1+i)^FMES − 1`, `c × FMES`).
6. **`liquidez()` no convierte inversiones de ahorro en otra moneda**, mientras `totales()` sí convierte todas.
   *Propuesta:* usar `conv()` también en `liquidez()`.
7. **Gastos fijos ignoran la moneda** (`fijoMensual`, `quincena`, `flujo`): la v4 no tenía moneda en los fijos;
   la v5 tiene `fixed_expenses.currency`. *Propuesta:* convertir con `conv()` cuando se habilite la moneda en la UI.
8. **Calendario siempre anual**: `agenda()`, `quincena()` y `flujo()` repiten cada evento todos los años
   (mes y día). La v5 tiene `calendar_events.anual`. *Propuesta:* respetar `anual = false` (solo el año de `fecha`).
9. **Gasto fijo único sin fecha** usa "hoy" como fecha (como `parse('')` en la v4). *Propuesta:* exigir `fecha_unica`.
10. **Ingresos semanales en la quincena** cuentan los **viernes** del rango sin mirar `dia`.
11. **Plan de la prima** (`V.primas`): el reparto 40/30/20/10 se aplica al **próximo pago**, que puede ser
    las cesantías o sus intereses (no solo la prima). `repartoPrima(monto)` recibe el monto explícito.
12. **Moneda sin TRM** (`conv`): si el libro no tiene tasa para la moneda, el valor cuenta como 0.

### Esquema de base de datos vs. motor de préstamos

- `loans.sistema` acepta `'diario'`, que **no existe** en el motor (la v4 tampoco lo tenía): se calcula como
  francés. Probablemente se quiso decir la frecuencia. *Propuesta:* quitar `'diario'` del `check` de `sistema`.
- `loans.frec` **no acepta `'diariohab'`** (diario de lunes a sábado), que sí existe en la v4 y en el motor.
  *Propuesta:* agregarlo al `check` de `frec` en una migración.

## Lo que NO está aquí (sigue en las vistas/servidor o pendiente)

`analizar()` del consejero, `detectSubs()` (suscripciones sugeridas), presupuesto 50/30/20 por grupo,
presupuesto por miembro, `reportData()`, gamificación, DIAN/renta (`s_dian.js`), OCR y reglas de IA,
`loanParams()` del formulario (E.A. → mensual), y las mutaciones de estado (`aporteApply`, `aporteRevert`,
pagos de fijos), que en la v5 deben ser RPC/transacciones de Postgres.

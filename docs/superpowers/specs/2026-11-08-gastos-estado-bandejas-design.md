# Gastos: estado de pago, bandejas por tipo y tablas con más funciones

> Diseño aprobado el 2026-11-08. Alcance: módulo de Gastos (`/gastos`, `/fijos`, `/suscripciones`,
> `/tarjetas` y la bandeja nueva `/movimientos`), el formulario de gasto, el componente `DataTable`
> y las reglas de cifras de `@mirai/domain`.

## 1. Problema

Hoy el módulo de Gastos tiene tres cosas sin resolver:

1. **No hay estado de pago.** Todo gasto registrado se asume pagado. No se puede anotar "esto lo
   debo pagar el viernes" ni "esto lo pagué el 3 aunque la compra fue el 28". La tabla `expenses`
   no tiene columnas para eso.
2. **Las bandejas se mezclan.** La bandeja "Del día a día" (`/gastos`) muestra *todos* los
   registros de `expenses`: los gastos sueltos, los pagos de gastos fijos (`fixed_expense_id`),
   los cobros de suscripciones (`subscription_id`) y las compras con tarjeta (`origen: "tarjeta"`,
   que crea sola la RPC `add_card_purchase` con `p_como_gasto = true`). No existe una bandeja que
   muestre todo a propósito.
3. **Las listas se quedaron cortas.** `DataTable` ya trae mucho, pero no deja agrupar a gusto,
   no compara contra el mes anterior, no tiene gráfica, no deja editar desde la fila ni guardar
   las combinaciones de filtros que uno usa seguido.

## 2. Decisiones de diseño

### 2.1 Un gasto pendiente se comporta como un gasto fijo sin pagar

`flujoIntegral` ya tiene el vocabulario: `Estado = "hecho" | "programado" | "vencido" | "estimado"`
y el ayudante `conRegistro(fecha, pagado)` que usan los gastos fijos (`flujo-integral.ts:245`).
Un gasto pendiente entra por el mismo camino:

- **Fuera de la plata que ya salió.** No suma en `gastado`, ni en `nGastos`, ni en `gastadoPres`,
  ni en los gastos hormiga (`hormigas()`), ni en el promedio por día, ni en `gastoVariable`, ni en
  los saldos de cuentas (`cuentas.ts`).
- **Dentro del mes proyectado.** Sí sale como `Mov` con `clase: "gasto"` y
  `estado: conRegistro(vence ?? fecha, false)` → `programado` si la fecha aún no llega, `vencido`
  si ya pasó. Así suma en `tot.gasto` y en `tot.sale`, igual que el arriendo que todavía no has
  pagado. El mes no se queda corto.
- **Al marcarlo pagado** pasa a `estado: "hecho"` y entra a la plata que salió, en la fecha de pago.

### 2.2 Dos fechas con roles separados

| Campo | Qué significa | Quién manda con él |
|---|---|---|
| `fecha` | Cuándo se causó el gasto (la compra, el consumo) | Reportes por categoría, presupuesto, hormiga, renta |
| `fecha_pago` | Cuándo salió la plata de verdad | Caja: `gastado`, saldos de cuentas, el `Mov` del flujo |

Si `fecha_pago` viene vacía y el gasto está pagado, se asume `fecha`. Esto conserva el
comportamiento de todo lo que ya está guardado.

### 2.3 Cada bandeja muestra lo suyo

`/gastos` ("Del día a día") deja fuera lo que ya tiene su propia bandeja:

```
fixed_expense_id != null        → es un pago de gasto fijo    → bandeja Fijos
subscription_id  != null        → es un cobro de suscripción  → bandeja Suscripciones
origen == "tarjeta"             → es una compra con tarjeta   → bandeja Tarjetas
origen in ("aporte","prestamo") → no es consumo               → Metas / Le debo
```

Queda lo suelto: `manual`, `correo`, `importar`, `ocr`, `voz`, `compartido`.

`/movimientos` ("Todos los gastos") es la foto completa: gastos sueltos + pagos de fijos + cobros
de suscripción + compras con tarjeta, en una sola tabla, sin contar dos veces y con el origen
visible en cada fila.

## 3. Base de datos

Migración aditiva `db/postgres/0007_gasto_estado.sql` (la última es `0006_abonos_indice.sql`), con
su copia idempotente en `supabase/migrations/`. Todas las columnas con valor por defecto para que
lo publicado no cambie de comportamiento:

| Columna | Tipo | Por defecto | Para qué |
|---|---|---|---|
| `pagado` | `boolean not null` | `true` | Lo de siempre queda pagado |
| `fecha_pago` | `date` | `null` | Cuándo salió la plata |
| `vence` | `date` | `null` | Hasta cuándo hay plazo (si está pendiente) |
| `cuotas_de` | `uuid` → `expenses(id)` | `null` | Gasto padre cuando se divide en cuotas |
| `cuota_n` | `int` | `null` | Número de cuota |
| `cuotas_total` | `int` | `null` | Cuántas cuotas son |
| `reembolso_loan_id` | `uuid` → `loans(id)` | `null` | El "Me deben" que nació del gasto |

Índices nuevos para `cuotas_de` y `reembolso_loan_id` (regla del proyecto: toda llave foránea
nueva necesita índice). Índice parcial `(book_id, vence) where pagado = false and deleted_at is
null` para la consulta de pendientes.

`nota` y `member_ids` ya existen en la tabla y no se usan: se aprovechan para la nota del gasto y
para repartirlo entre personas del hogar.

Después de la migración: `pnpm db:types` y `pnpm typecheck`.

## 4. Dominio (`packages/domain`)

### 4.1 Predicados nuevos en `balance.ts`

```ts
/** ¿La plata de este gasto ya salió? Lo guardado antes de 2026-11 no tiene `pagado`: cuenta como pagado. */
export const gastoPagado = (g: GastoIn) => g.pagado !== false
/** Fecha en la que la plata salió (caja). Si no hay fecha de pago, la del gasto. */
export const gastoFechaCaja = (g: GastoIn) => g.fecha_pago || g.fecha
/** Fecha que manda para avisar: el plazo si lo hay, si no la del gasto. */
export const gastoFechaLimite = (g: GastoIn) => g.vence || g.fecha
```

### 4.2 `flujo-integral.ts`

En el bloque 6 (`flujo-integral.ts:361-371`), separar `contados` (los pagados, que suman en
`gastado`) de `pendientes` (los que solo salen como `Mov` con estado). El `Mov` de un gasto pagado
usa `gastoFechaCaja(g)`; el de un pendiente usa `gastoFechaLimite(g)` y
`estado: conRegistro(gastoFechaLimite(g), false)`.

`conTarjeta` no cambia (las compras con tarjeta siguen fuera del flujo: sale el pago de la tarjeta).

### 4.3 Resto del dominio

`hormiga.ts`, `totals.ts`, `balance.ts`, `dashboard.ts`, `insights.ts`, `cuentas.ts`, `report.ts`,
`proveedores.ts` y `savings.ts` filtran por `gastoPagado` donde hoy suman gastos como plata que ya
salió. Cada archivo tocado gana una prueba que fija la regla.

### 4.4 Selector nuevo: `movimientos.ts`

```ts
export type MovGasto = {
  id: string            // "exp:<id>" | "fijo:<id>:<periodo>" | "sub:<id>:<ym>" | "card:<id>"
  origen: "dia" | "fijo" | "suscripcion" | "tarjeta"
  fecha: string; fechaCaja: string | null
  descripcion: string; valor: number; moneda: string
  categoryId: string | null; memberId: string | null; paymentMethodId: string | null
  providerId: string | null
  estado: "pagado" | "pendiente" | "vencido"
  href: string          // la bandeja de donde salió
  refId: string         // el id en su tabla, para abrirlo
}

export function movimientosGasto(b: BookData, desde: string, hasta: string, hoy: string): MovGasto[]
```

Reusa la lógica de "no contar dos veces" que ya tiene `flujoIntegral` (`gastoYaContado`,
`gastoDeCobro`, `usados`): si el cobro de una suscripción ya quedó como gasto, sale una sola fila.
Con sus pruebas Vitest, incluida la de no duplicar.

## 5. Contratos y API

- `packages/contracts/src/book-table-schemas.ts`: los campos nuevos en el zod de `expenses`
  (`pagado`, `fecha_pago`, `vence`, `cuotas_de`, `cuota_n`, `cuotas_total`, `reembolso_loan_id`).
- `packages/contracts/src/modules/expenses.ts`: contrato del comando nuevo
  `POST /v1/books/:b/expenses/pay` con `{ ids: Uuid[]; fecha_pago: IsoDate }` → marca pagados uno
  o varios gastos de una (sirve para la acción en lote). Devuelve las filas actualizadas.
- `apps/api/src/modules/expenses/`: el servicio del comando, con la revisión de permiso de siempre
  (`registra` solo puede tocar los propios).
- `apps/web/features/expenses/commands.ts`: `markExpensesPaid(ids, fecha)` con `command()`.

## 6. Formulario de gasto (`expense-form.tsx`)

El archivo ya tiene 345 líneas y va a crecer. Se parte en piezas con una responsabilidad cada una:

```
features/expenses/form/
  expense-form.tsx     la ventana, el esquema zod y el submit
  estado-pago.tsx      "¿Ya lo pagaste?" + fecha de pago / fecha límite
  adjunto.tsx          nota + subir y ver la factura
  repetir.tsx          "se repite" (fijo o suscripción) y "en cuotas"
  reembolso.tsx        "me lo deben" / "lo dividimos"
```

### 6.1 Estado de pago

Un `Segmented` con dos opciones: **"Sí, ya lo pagué"** (por defecto) y **"No, queda pendiente"**.

- Pagado → campo **"¿Cuándo lo pagaste?"**, con la fecha del gasto por defecto.
- Pendiente → campo **"¿Hasta cuándo hay que pagarlo?"** (opcional) y la nota
  *"Lo vas a ver en Próximos pagos y te avisamos antes de que se venza."*

Al editar un gasto pendiente aparece el botón **"Marcar como pagado"** que pide la fecha.

### 6.2 Nota y factura

Campo de nota libre (`expenses.nota`) y subida de la factura con el mismo camino que usa Renta:
`uploadFile({ bucket: "attachments", folder: "gastos/<expense_id>" })` y fila en `attachments`
con `ref_table: "expenses"`. Al abrir el gasto se ve la miniatura y se baja con URL firmada
(`fileUrl`). La foto que hoy lee la IA y bota se queda guardada si la persona quiere.

### 6.3 Se repite / en cuotas

- **"Este gasto se repite cada mes"** → al guardar, un toast con acción (el mismo patrón del
  enlace a gasto fijo que ya existe) ofrece crear el gasto fijo o la suscripción con esos datos.
- **"Lo pagué en N cuotas"** → el valor se divide entre N (el resto, a la primera). La cuota 1 es
  el gasto padre y queda con el estado que escogiste arriba; las N-1 siguientes se crean
  pendientes, mes a mes desde la fecha del gasto, enlazadas por `cuotas_de` y con su `vence`. En
  la lista se ven como "Cuota 2 de 6". Esto es para compras a cuotas **sin** tarjeta de crédito:
  las de tarjeta siguen por `add_card_purchase`, que ya las maneja.

### 6.4 Me lo deben / lo dividimos

- Si quien te debe es **alguien de afuera** (un contacto) → crea el préstamo "Me deben" por la
  parte que corresponde y lo guarda en `reembolso_loan_id`.
- Si es **gente del hogar** → guarda `member_ids` y crea el gasto compartido.

### 6.5 Guardar y registrar otro

Botón secundario en el pie: guarda y deja la ventana abierta con la fecha, la persona y el medio
de pago, listo para el siguiente.

## 7. Bandejas

### 7.1 Menú (`lib/nav.ts`)

`PAGE_TABS.gastos` pasa a cinco entradas; `movimientos` se agrega a `EN_PESTANAS` y al `alias` de
la hoja `gastos`:

```ts
{ id: "gastos",       label: "Del día a día",  icon: "receipt",     desc: "Mercado, salidas, transporte y gastos hormiga" },
{ id: "fijos",        label: "Fijos",          icon: "house",       desc: "Arriendo, servicios, cuotas: se repiten cada mes" },
{ id: "suscripciones",label: "Suscripciones",  icon: "repeat",      desc: "Netflix, Spotify, apps: se cobran solas" },
{ id: "tarjetas",     label: "Tarjetas",       icon: "credit-card", desc: "Compras con tarjeta, cuotas y el pago del mes" },
{ id: "movimientos",  label: "Todos los gastos", icon: "list",      desc: "Todo lo que sale, de todas las bandejas juntas" },
```

### 7.2 `/gastos`

Filtro por tipo antes de calcular nada (`expenses-view.tsx`, el `useMemo` de `rows`). Los KPI, el
bloque de hormiga y la tabla pasan a trabajar sobre lo filtrado. Un `Notice` discreto al pie
explica qué no se está mostrando y enlaza a las otras bandejas.

### 7.3 `/movimientos`

`app/(app)/movimientos/page.tsx` + `features/movimientos/movimientos-view.tsx`. Usa
`movimientosGasto()` sobre el snapshot del libro (`useBookData`), con KPI del total del mes por
origen, la tabla con la columna "Origen" y el clic de cada fila llevando a su bandeja.

## 8. Tablas (`components/mirai/data-table.tsx`)

Lo que ya trae y no hay que hacer: selección múltiple (`bulk`), columnas ocultables, vistas
rápidas (`views`), filtros de opciones / rango / fechas, total de lo filtrado, agrupar (`group`),
exportar a CSV, paginación, encabezado fijo y tarjetas en celular.

Lo que se agrega al componente, para toda la app:

| Prop nueva | Qué hace |
|---|---|
| `groups?: { id; label; by; label }[]` | Selector "Agrupar por" en la barra; `group` sigue sirviendo como agrupación fija |
| `chart?: { value; by; label? }` | Mini-gráfica de barras sobre la tabla, con lo filtrado |
| `compare?: { prev: T[]; value }` | Indicador subió/bajó contra el período anterior, arriba y por grupo |
| `cellEdit?: { [colId]: (row, value) => void }` | Cambiar un valor desde la fila sin abrir la ventana |
| `savedViews?: { key: string }` | Guardar y recuperar filtros con nombre |

Las vistas guardadas viven en `user_preferences.extra.tablas[<key>]` (mismo patrón que Academia).

En Gastos, además: vistas rápidas **Todos · Pendientes · Vencidos · Hormiga · De gastos fijos**,
acción por fila **"Repetir este gasto"** y acciones en lote **Marcar pagado**, **Cambiar
categoría**, **Cambiar persona**, **Marcar hormiga** y **Eliminar** (con Deshacer).

## 9. Agenda y avisos

- `features/agenda/events.ts`: los gastos pendientes con plazo salen como evento. `ECAT.pagar` se
  llama "Cuotas de deudas" y lleva a `/le-debo`, así que no sirve: se agrega la clave `gasto`
  ("Gastos por pagar", ícono `receipt`, `go: "gastos"`) al catálogo `ECAT`, para que se pueda
  prender y apagar en el calendario como las demás.
- `packages/services/src/notify/`: el aviso `pagos` ("Pagos por vencer y vencidos") amplía su
  descripción para incluir los gastos pendientes y la tarea del cron los recoge. No se agrega un
  `AvisoKey` nuevo: la persona ya decidió por qué canal quiere los avisos de pagos.

## 10. Pruebas

**Vitest (`packages/domain`)**

- Un gasto pendiente no suma en `gastado` ni en `hormigas()` ni en el promedio por día.
- Un gasto pendiente sí suma en `tot.gasto` con estado `programado`; si el plazo ya pasó, `vencido`.
- Un gasto con `fecha_pago` distinta de `fecha` sale en caja en la fecha de pago y en el reporte
  por categoría en la fecha del gasto.
- Los gastos guardados sin `pagado` (todo lo de antes) siguen contando igual que hoy.
- `movimientosGasto()` no duplica el cobro de una suscripción que ya quedó como gasto.

**E2E (`apps/web/tests/e2e`)**

- `f1-gastos.spec.ts`: registrar un gasto pendiente, verlo en la vista "Pendientes", marcarlo
  pagado y ver cambiar el KPI del mes.
- `f1-bandejas.spec.ts` (nuevo): cada bandeja muestra solo lo suyo; `/movimientos` los muestra
  todos; agrupar, acciones en lote y duplicar.

## 11. Etapas

Cada etapa cierra con `pnpm build` + `pnpm e2e:local` y capturas en `apps/web/tests/.out/`.

1. **Estado de pago** — migración, dominio + pruebas, contratos y comando, formulario (6.1),
   vistas rápidas, agenda y avisos.
2. **Bandejas** — filtro por tipo en `/gastos`, selector `movimientosGasto()`, ruta `/movimientos`
   y menú.
3. **Tablas** — las cinco props nuevas de `DataTable` y su uso en las cinco bandejas.
4. **Extras del formulario** — nota y factura, se repite / en cuotas, me lo deben / lo dividimos,
   guardar y registrar otro.

## 12. Lo que este diseño no hace

- No toca cómo se calculan los gastos fijos, las suscripciones ni las tarjetas: sus bandejas se
  quedan como están y solo heredan las mejoras de tabla.
- No cambia ninguna de las reglas de cifras de la revisión 2026-11-08: las extiende con un estado
  que antes no existía.
- No agrega pagos parciales de un gasto suelto (eso ya existe para fijos y cuotas de préstamo):
  un gasto está pagado o pendiente.

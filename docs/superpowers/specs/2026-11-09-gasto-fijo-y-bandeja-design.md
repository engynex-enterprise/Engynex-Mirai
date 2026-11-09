# Gasto fijo: «¿A quién le pagas?» + 4 campos nuevos, y la bandeja de gastos generales

Fecha: 2026-11-09 · Estado: aprobado, pendiente de implementar

## 1. Qué se pidió

1. En **Agregar gasto fijo**, el campo «Proveedor» obliga a que a quien le pagas sea un negocio. Debe dejar escoger
   entre un negocio o una persona, igual que ya hace el formulario de gasto del día a día.
2. Cuatro funcionalidades útiles más en ese mismo formulario: referencia del pago, hasta cuándo se paga, moneda y
   días de aviso propios.
3. Una **bandeja de gastos generales** que muestre en un solo lugar todo lo que sale: gastos del día a día, fijos,
   suscripciones, tarjetas, cuotas de deudas e impuestos.

## 2. Lo que ya existe (y por eso no se reinventa)

| Pieza | Dónde | Para qué sirve acá |
| --- | --- | --- |
| `PagarA` | `apps/web/features/expenses/pagar-a.tsx` | «¿A quién le pagaste?» con negocio (`provider_id`) / persona (`contact_id`) / nadie. Se reutiliza tal cual. |
| `expense_provider_default()` | `db/postgres/0001_baseline.sql` | Trigger: al pagar un fijo, el gasto hereda su `provider_id`. Se extiende a `contact_id`. |
| `fixed_expenses.currency` | base | Ya existe y `fijoMensual()` ya convierte con la TRM; solo falta exponerla en el formulario. |
| `providers.referencia` | base | Referencia del negocio; sirve para pre-llenar la del fijo. |
| `flujoIntegral()` | `packages/domain/src/flujo-integral.ts` | Lista unificada de movimientos sin doble conteo. Es la fuente de la bandeja. |
| `useIntegralExtras()` | `apps/web/features/balance/use-integral.ts` | Los datos que el flujo integral necesita y no viajan en el libro. |
| `DataTable`, `EstadoPill` | `components/mirai/`, `features/balance/balance-parts.tsx` | Tabla con filtros/exportar y la píldora de estado. |
| Diálogos de pago | `PayFixedDialog`, `ChargeSubDialog`, tarjetas, `PayLoanDialog` | Las acciones de la bandeja. |
| Pestañas del grupo | `lib/nav.ts` (`gastos` con `alias: ["fijos","suscripciones","tarjetas"]`) | Las 4 páginas ya son hermanas; la bandeja es la quinta. |

## 3. Parte A — El formulario de gasto fijo

### 3.1 «¿A quién le pagas?»

Reemplaza el campo «Proveedor» de `apps/web/features/fixed/fixed-form.tsx` por `<PagarA idPrefix="f">`, con las
mismas tres opciones del gasto del día a día: *No hace falta* / *Negocio o empresa* / *Una persona*.

- Se conserva el comportamiento actual al escoger un negocio: completa el nombre si está vacío, la categoría
  sugerida (`categoriaSugerida`) y el medio de pago preferido del proveedor (solo al crear).
- Escoger una persona no auto-completa nada: una persona no tiene categoría ni medio preferido.
- `proveedor` (texto) se sigue llenando desde el negocio, como hoy, para no romper la lista ni el buscador.
- Solo un destino a la vez: elegir persona limpia `provider_id` y al revés (lo hace `PagarA`).

En `fixed-view.tsx`: la columna «Proveedor» pasa a llamarse **«Pagado a»** y muestra el negocio o la persona; el
filtro del mismo nombre ofrece ambos; el texto de búsqueda y el subtítulo de cada fila incluyen el nombre de la
persona.

### 3.2 Referencia del pago

Campo opcional **«Número de cuenta, contrato o referencia»** (`fixed_expenses.referencia`, texto).

- Al escoger un negocio se pre-llena con `providers.referencia` si el campo está vacío; se puede cambiar, porque
  puedes tener dos contratos con la misma inmobiliaria.
- Se muestra en la fila de la lista (debajo del nombre) y en `PayFixedDialog` con un botón **Copiar**, que es el
  momento en que de verdad se necesita.

### 3.3 «Hasta cuándo lo pagas»

`fixed_expenses.hasta` (fecha, opcional; vacío = indefinido).

**El corte va en un solo lugar:** `fijoPeriods()` de `packages/domain/src/fixed.ts` no devuelve periodos con fecha
posterior a `hasta`. Así lo heredan `fijoStatus`, la agenda, los avisos, `flujoIntegral`, el Balance, el Dashboard y
las proyecciones sin tocar cada uno — el mismo patrón que ya usa `inicio`.

Además, para que «Total al mes» no siga contando un plan que ya terminó:

```ts
fijoMensual(f, trm?, today?)   // 0 si f.hasta < today
fijosMes(fixed, trm?, today?)  // pasa today a fijoMensual
```

El parámetro es **opcional y último**, así que ninguna llamada existente cambia de comportamiento y la paridad con
la v4 se mantiene (la v4 no tiene `hasta`; un fijo sin `hasta` se comporta idéntico).

UI: píldora «termina el …» en la lista, y cuando la fecha ya pasó el fijo sale de la vista «Todos» y aparece en una
vista nueva **«Terminados»** del `DataTable` (no se borra ni se esconde).

Validación: `hasta` no puede ser anterior a la fecha del próximo pago que se está guardando.

### 3.4 Moneda

Selector **COP / USD / EUR** sobre la columna `currency` que ya existe. Debajo del valor se muestra el equivalente
«≈ $X al mes» con la TRM del libro (`book_settings.trm`). Si el libro no tiene TRM para esa moneda, el texto dice que
falta configurarla en Ajustes › Finanzas y enlaza allá, en vez de mostrar una cifra inventada.

### 3.5 Aviso propio de este gasto

`fixed_expenses.aviso` (entero, días; vacío = el global de Ajustes › Alertas).

- `AgendaItem` (`packages/domain/src/agenda.ts`) lleva un campo nuevo opcional `aviso`.
- En `notifs()`, el umbral `x.d <= A` pasa a `x.d <= (x.aviso ?? A)`.
- En `fixed-view.tsx`, el estado «por vencer» usa el aviso del fijo si lo tiene.

## 4. Parte B — La bandeja de gastos generales

### 4.1 Ubicación

Barra de pestañas nueva `components/app/gastos-tabs.tsx`:

```
Todos · Día a día · Fijos · Suscripciones · Tarjetas
```

Se monta arriba de `/gastos`, `/fijos`, `/suscripciones` y `/tarjetas`. La bandeja vive en **`/gastos/todos`** y se
registra en `lib/nav.ts` (`EN_PESTANAS`) para que tenga migas, entrada en ⌘K y aparezca en el buscador global.

### 4.2 Datos: nada se recalcula

La bandeja llama `flujoIntegral(book, P, today, X)` y se queda con `dir === "sale"`. Esto garantiza por construcción
las reglas de cifras de `.agents/rules/cifras.md`:

- **No cuenta dos veces:** el pago de un fijo registrado también como gasto suelto aparece una sola vez.
- **Los préstamos que te dan o que haces no son gasto:** quedan fuera (van en `credEntra` / `credSale`).
- **Tarjeta en base caja:** el pago del mes es la factura del corte que se paga ese mes, no las compras.
- **El total de la bandeja cuadra con `tot.sale` del Balance.**

Clases mostradas por defecto: `gasto` + `deuda` (exactamente lo que suma `salidasPorModulo`). Un interruptor
**apagado por defecto** agrega `ahorro` (metas, fondo, inversiones), porque aportar a una meta no es gastar; al
encenderlo, el total cambia y el pie de la tabla lo dice.

Periodo: el mismo selector del Balance (`periodosDelLibro`, `periodo()`), para que las dos pantallas nunca muestren
cifras distintas.

`useIntegralExtras` se mueve de `features/balance/use-integral.ts` a `features/book/use-integral.ts` (lo usan Balance,
Dashboard, Inicio y ahora la bandeja); los tres consumidores actuales pasan a importarlo de ahí.

### 4.3 Qué se ve

`<DataTable>` con:

- **Vistas:** *Por pagar* (estado `vencido` + `programado`), *Pagados* (`hecho`), *Todos*.
- **Columnas:** Fecha · Concepto (con el ícono del módulo) · Módulo · Categoría · Estado (`EstadoPill`) · Valor.
- **Filtros:** módulo, categoría, estado, medio de pago, rango de valor y rango de fechas.
- Búsqueda, exportar CSV y total al pie. En celular, tarjetas (lo hace `DataTable`).
- **Tres KPI arriba:** por pagar en el periodo, vencido, pagado en el periodo.

### 4.4 Acciones sin salir de la bandeja

Cada fila abre el diálogo real de su módulo: `PayFixedDialog`, `ChargeSubDialog`, el pago de tarjeta y
`PayLoanDialog`.

Para eso, `Mov` (en `flujo-integral.ts`) gana un campo **opcional** `ref`:

```ts
ref?: { tabla: "fixed_expenses" | "subscriptions" | "credit_cards" | "loans" | "expenses"; id: string; per?: string }
```

Lo llena cada bloque de `flujoIntegral` al construir su movimiento. Es aditivo: nada que lea `Mov` hoy se entera. La
UI deja de depender de parsear el `id` (`fijo:<uuid>:2026-11`), que es frágil.

### 4.5 Remate útil

La bandeja muestra los hallazgos de `posiblesDobles()`: cuando registraste a mano un gasto que ya era el pago de un
fijo, ofrece enlazarlos ahí mismo (la misma lógica y el mismo comando que ya usan Dashboard y Balance).

### 4.6 Qué NO es

No reemplaza `/recordatorios` (Próximos pagos), que es un **calendario** (mes/semana/agenda, incluye también lo que
te entra, exporta `.ics`). La bandeja es una **tabla operativa** de salidas con filtros y exportación. Desde la
bandeja hay un enlace «Verlos en el calendario».

## 5. Base de datos

Una sola migración: **`db/postgres/0009_fijo_pagado_a_y_extras.sql`** (idempotente y aditiva; `supabase/migrations/`
es historia y no se toca, según `.agents/workflows/migracion.md`).

```sql
alter table public.fixed_expenses add column if not exists contact_id uuid;
alter table public.fixed_expenses add column if not exists referencia text not null default '';
alter table public.fixed_expenses add column if not exists hasta date;
alter table public.fixed_expenses add column if not exists aviso integer;
```

- FK `fixed_expenses_contact_id_fkey` → `contacts(id) on delete set null`, dentro de un `do $$ … pg_constraint … $$`.
- Índice parcial `fixed_expenses_contact_idx` (toda llave foránea con índice).
- `check` de `aviso` entre 0 y 100, igual que el `anticipo` del libro.
- `expense_provider_default()` se reemplaza (`create or replace`) para heredar también `contact_id`, y de paso se le
  fija `set search_path = public`, que hoy le falta.
- `comment on column` en español para las cuatro columnas y `notify pgrst, 'reload schema';` al final.

### Tipos y contratos, en el mismo cambio

1. `packages/db/src/database.types.ts` — `pnpm db:types` (Row, Insert, Update y la relación nueva).
2. `packages/contracts/src/book-table-columns.ts` — `aviso`, `contact_id`, `hasta`, `referencia` en la lista blanca de
   `fixed_expenses`, en orden alfabético.
3. `packages/contracts/src/book-table-schemas.ts` — en el zod de escritura: `contact_id: Uuid.nullable().optional()`,
   `referencia: Txt(500).optional()`, `hasta: IsoDate.nullable().optional()`, `aviso: Int.nullable().optional()`.
4. `packages/domain/src/types.ts` — `FixedExpenseIn` suma `currency`, `hasta`, `aviso`, `contact_id`, `referencia`.

No hace falta endpoint nuevo: `fixed_expenses` ya pasa por el CRUD genérico (`BOOK_TABLE_POLICY`), y la bandeja solo
lee del snapshot del libro.

## 6. Pruebas

**Vitest (`packages/domain`)**

- `fijoPeriods` / `fijoStatus`: un fijo con `hasta` no genera periodos después de esa fecha; sin `hasta` el resultado
  es idéntico al de hoy (paridad con la v4 intacta).
- `fijoMensual` / `fijosMes`: 0 para un fijo terminado cuando se pasa `today`; sin `today`, igual que hoy.
- `fijoMensual` con `currency: "USD"` y TRM.
- `notifs`: un fijo con `aviso: 15` avisa 15 días antes aunque el global sea 5; sin `aviso`, usa el global.
- `flujoIntegral`: todo movimiento de salida trae `ref`, y la suma de la bandeja (clases `gasto` + `deuda`) es igual
  a `tot.sale`.

**E2E (`apps/web/tests/e2e/`)**

- Gasto fijo: crear uno pagado a **una persona** (creándola desde el combo), con referencia, moneda USD, fecha de fin
  y aviso propio; verificar que se guarda, que la lista dice «Pagado a», y que al registrar el pago el gasto generado
  queda con esa persona.
- Bandeja: entrar por `/fijos`, pasar a la pestaña *Todos*, comprobar que aparecen filas de al menos tres módulos
  distintos, que el total coincide con el del Balance para el mismo periodo, y pagar un fijo desde la bandeja.
- Las dos a 1366 px y a 400 px, sin scroll horizontal.

## 7. Orden de entrega

1. **Parte A (gasto fijo)** — migración, tipos, contratos, formulario, vista y pruebas. Es autocontenida y se puede
   desplegar sola.
2. **Parte B (bandeja)** — `ref` en `Mov`, mover `useIntegralExtras`, barra de pestañas, `/gastos/todos` y las
   acciones por módulo.

## 8. Fuera de alcance

- Suscripciones y Préstamos no reciben «Pagar a» (mismo patrón, pero es otro pedido).
- Sin aumento automático por IPC en los fijos.
- La bandeja no edita registros: abre el diálogo del módulo dueño.

# Bandeja de gastos generales — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una bandeja en `/gastos-todos` que muestre en un solo lugar todo lo que sale —gastos del día a día, fijos, suscripciones, tarjetas, cuotas de deudas, impuestos y mesadas— con pestañas *Por pagar / Pagados / Todos*, filtros, exportar y el botón de pago de cada módulo sin salir de ahí.

**Architecture:** La bandeja **no recalcula nada**: lee `flujoIntegral()`, que ya junta todos los módulos sin contar dos veces. Para poder abrir el diálogo del módulo dueño de cada fila, `Mov` gana un campo opcional `ref` con la tabla y el id del registro. Las cuatro páginas del grupo (gastos, fijos, suscripciones, tarjetas) comparten una barra de pestañas nueva.

**Tech Stack:** Next.js 16 (App Router, `cacheComponents`), React, TanStack Query, shadcn/ui, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-09-gasto-fijo-y-bandeja-design.md` (sección 4)

## Global Constraints

- **Idioma:** UI, ayudas y mensajes en **español de Colombia con tuteo**. Solo el código va en inglés.
- `packages/domain` **no puede importar nada** de `apps/web` (ni `@/…`).
- Todo parámetro o campo nuevo del dominio es **opcional** y no cambia el comportamiento existente (paridad con la v4).
- **Reglas de cifras (`.agents/rules/cifras.md`), las que mandan acá:**
  - Los préstamos que te dan o que haces **no** son gasto (van en `credEntra`/`credSale`, fuera de `tot.sale`).
  - La tarjeta va en base caja: el pago del mes es la factura del corte que se paga ese mes, no las compras.
  - **Un desglose siempre suma su total:** el total de la bandeja (clases `gasto` + `deuda`) debe ser igual a `tot.sale`, lo mismo que usa `salidasPorModulo`.
- Todo lo que lea cookies/sesión va dentro de `<Suspense>` con skeleton.
- En la web usa `useQuery` de `@/lib/query`, nunca el de `@tanstack/react-query` (ESLint lo exige).
- Montos marcados con `data-money`; formato COP con `Intl` (`es-CO`).
- Móvil primero: probar a 400 px sin scroll horizontal.
- Antes de cerrar: `pnpm build` + `pnpm e2e:local`, y revisar capturas en `apps/web/tests/.out/`.

---

### Task 1: `ref` en los movimientos del flujo integral

**Files:**
- Modify: `packages/domain/src/flujo-integral.ts:77-99` (interfaz `Mov`), `:353-363` (préstamos), `:388-399` (fijos), `:418-428` (suscripciones), `:436-441` (tarjetas), `:454` (gastos)
- Test: `packages/domain/src/flujo-integral.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:

```ts
export type MovRef = { tabla: "fixed_expenses" | "subscriptions" | "credit_cards" | "loans" | "expenses"; id: string; per?: string }
// en Mov:  ref?: MovRef
```

- [ ] **Step 1: Escribir la prueba que falla**

Al final de `packages/domain/src/flujo-integral.test.ts`, agrega:

```ts
describe("ref: cada salida sabe de qué registro viene", () => {
  it("fijos, suscripciones, tarjetas, gastos y cuotas traen ref", () => {
    const F = flujoIntegral(b, periodo(b, "mes", 2026, 10), "2026-11-15")
    const salidas = F.movs.filter((m) => m.dir === "sale" && (m.clase === "gasto" || m.clase === "deuda"))
    expect(salidas.length).toBeGreaterThan(0)
    for (const m of salidas.filter((x) => ["fijos", "suscripciones", "tarjetas", "gastos", "le-debo"].includes(x.modulo))) {
      expect(m.ref, `${m.modulo} ${m.id} sin ref`).toBeTruthy()
      expect(m.ref!.id).toBeTruthy()
    }
    expect(salidas.find((m) => m.modulo === "fijos")?.ref?.tabla).toBe("fixed_expenses")
    expect(salidas.find((m) => m.modulo === "fijos")?.ref?.per).toBeTruthy()
  })

  it("el total de la bandeja es igual a tot.sale", () => {
    const F = flujoIntegral(b, periodo(b, "mes", 2026, 10), "2026-11-15")
    const bandeja = F.movs.filter((m) => m.dir === "sale" && (m.clase === "gasto" || m.clase === "deuda")).reduce((a, m) => a + m.v, 0)
    expect(bandeja).toBeCloseTo(F.tot.sale, 6)
  })
})
```

`b` es el libro de prueba que ya arma ese archivo (línea 13). Si se llama distinto, usa el nombre real; y si el libro no tiene movimientos de los cinco módulos, agrégale los que falten con los mismos helpers del archivo (`fijo(...)` ya existe en la línea 160).

- [ ] **Step 2: Correr y ver que falla**

```bash
pnpm --filter @mirai/domain test -- flujo-integral
```

Esperado: FAIL — `ref` no existe en `Mov` (error de tipos).

- [ ] **Step 3: Declarar el tipo**

En `packages/domain/src/flujo-integral.ts`, antes de `export interface Mov`:

```ts
/** El registro del que salió un movimiento, para que la UI abra el formulario o el pago de su módulo. */
export type MovRef = { tabla: "fixed_expenses" | "subscriptions" | "credit_cards" | "loans" | "expenses"; id: string; per?: string }
```

y dentro de `export interface Mov`, después de `href: string`:

```ts
  /** De qué registro salió (para abrir su diálogo desde la bandeja). */
  ref?: MovRef
```

- [ ] **Step 4: Llenarlo en los cinco bloques**

**Préstamos** (línea ~353) — en el `base`, agrega `ref` a las dos ramas:

```ts
    const base = cobrar
      ? { dir: "entra" as const, modulo: "me-deben" as const, clase: "cobro" as const, icon: "hand-coins", href: "/me-deben", cat: "Te pagan préstamos", ref: { tabla: "loans" as const, id: L.id ?? "" } }
      : { dir: "sale" as const, modulo: "le-debo" as const, clase: "deuda" as const, icon: td?.icon ?? "landmark", href: "/le-debo", cat: td?.corto ?? "Deudas", ref: { tabla: "loans" as const, id: L.id ?? "" } }
```

**Fijos** (línea ~388) — el objeto `tipo` se arma dentro del bucle de periodos, así que ahí ya tienes `p.per`; agrega `ref` a las dos ramas del ternario:

```ts
        const ref = { tabla: "fixed_expenses" as const, id: f.id, per: p.per }
        const tipo = aporte
          ? { modulo: "metas" as const, clase: "ahorro" as const, n: f.nombre, s: f.link_type === "fondo" ? "Aporte al fondo de emergencia" : "Aporte a una meta", icon: "piggy-bank", cat: "Ahorro programado", href: "/metas", ref }
          : { modulo: "fijos" as const, clase: "gasto" as const, n: f.nombre, s: "Gasto fijo", icon: catIcon(b.categories, f.category_id), cat: f.category_id ? catName(f.category_id) : "Gastos fijos", catId: f.category_id ?? null, href: "/fijos", ref }
```

**Suscripciones** (línea ~418) — en el `base`:

```ts
        const base = { id: `sub:${s.id}:${ym(fecha)}`, dir: "sale" as const, modulo: "suscripciones" as const, clase: "gasto" as const, n: s.nombre, icon: "repeat", cat: sCat ? catName(sCat) : "Suscripciones", catId: sCat ?? null, href: "/suscripciones", ref: { tabla: "subscriptions" as const, id: s.id } }
```

**Tarjetas** (línea ~436) — en el `base`:

```ts
    const base = { dir: "sale" as const, modulo: "tarjetas" as const, clase: "deuda" as const, n: `Tarjeta ${t.nombre}`, icon: "credit-card", cat: "Tarjetas de crédito", href: "/tarjetas", ref: { tabla: "credit_cards" as const, id: t.id } }
```

**Gastos** (línea ~454) — agrega `ref` al final del objeto del `push`:

```ts
    push({ id: `exp:${g.id}`, dir: "sale", modulo: "gastos", clase: "gasto", fecha: g.fecha, n: g.descripcion, s: g.origen === "compartido" ? `Gasto compartido · ${cat}` : `Gasto · ${cat}`, icon: catIcon(b.categories, g.category_id), v: conv(+g.valor, g.currency, trm), cat, catId: g.category_id ?? null, estado: "hecho", href: "/gastos", ref: { tabla: "expenses", id: g.id } })
```

- [ ] **Step 5: Correr las pruebas**

```bash
pnpm --filter @mirai/domain test
```

Esperado: PASS, incluidas las de coherencia y paridad. `ref` es aditivo: nada que lea `Mov` hoy se entera.

- [ ] **Step 6: Commit**

```bash
git add packages/domain/src/flujo-integral.ts packages/domain/src/flujo-integral.test.ts
git commit -m "feat(dominio): cada movimiento sabe de qué registro viene (Mov.ref)"
```

---

### Task 2: `useIntegralExtras` deja de vivir en Balance

**Files:**
- Create: `apps/web/features/book/use-integral.ts` (movido tal cual)
- Delete: `apps/web/features/balance/use-integral.ts`
- Modify: los archivos que lo importan (`features/balance/balance-view.tsx`, `features/dashboard/dashboard-view.tsx`, `features/home/home-view.tsx`)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: `useIntegralExtras(book, today): ExtrasIntegral` importable desde `@/features/book/use-integral`.

- [ ] **Step 1: Mover el archivo**

```bash
git mv apps/web/features/balance/use-integral.ts apps/web/features/book/use-integral.ts
```

- [ ] **Step 2: Arreglar los imports**

```bash
grep -rln "features/balance/use-integral" apps/web --include="*.ts" --include="*.tsx" | grep -v "\.next"
```

En cada archivo que aparezca, cambia `@/features/balance/use-integral` por `@/features/book/use-integral`.

- [ ] **Step 3: Verificar**

```bash
pnpm typecheck && pnpm lint
```

Esperado: 0 errores y ninguna referencia viva a la ruta vieja (`grep -r "balance/use-integral" apps/web | grep -v .next` no devuelve nada).

- [ ] **Step 4: Commit**

```bash
git add -A apps/web/features
git commit -m "refactor: useIntegralExtras vive en features/book (lo usan Balance, Dashboard, Inicio y la bandeja)"
```

---

### Task 3: La ruta de la bandeja y su pestaña

**Files:**
- Create: `apps/web/app/(app)/gastos-todos/page.tsx`
- Create: `apps/web/features/bandeja/bandeja-view.tsx` (mínima; la tabla llega en la Task 4)
- Modify: `apps/web/lib/nav.ts:85-93` (`PAGE_TABS`) y `:60-64` (`EN_PESTANAS`)

**Interfaces:**
- Consumes: el sistema de pestañas que **ya existe** (`PAGE_TABS` en `lib/nav.ts`, lo pinta `PageHeader` con `PageTabs`).
- Produces: la ruta `/gastos-todos` con la pestaña «Todos» visible en las cinco páginas del grupo.

> **Ojo:** NO hay que crear un componente de pestañas. `PageHeader` ya pinta `PAGE_TABS[id]` debajo del banner, y `PageTabs` arma el enlace como `/${t.id}`. Por eso el id de la bandeja es `gastos-todos` (sin barra) y su ruta es `/gastos-todos`. Agregando la entrada al arreglo, la pestaña aparece sola en Gastos, Fijos, Suscripciones y Tarjetas: **esas cuatro vistas no se tocan**.

- [ ] **Step 1: Agregar la pestaña**

En `apps/web/lib/nav.ts:86`, el arreglo `gastos` queda con la bandeja de primera:

```ts
  const gastos = [
    { id: "gastos-todos", label: "Todos", icon: "layers", desc: "Fijos, día a día, suscripciones y tarjetas, juntos" },
    { id: "gastos", label: "Del día a día", icon: "receipt", desc: "Mercado, salidas, transporte y gastos hormiga" },
    { id: "fijos", label: "Fijos", icon: "house", desc: "Arriendo, servicios, cuotas: se repiten cada mes" },
    { id: "suscripciones", label: "Suscripciones", icon: "repeat", desc: "Netflix, Spotify, apps: se cobran solas" },
    { id: "tarjetas", label: "Tarjetas", icon: "credit-card", desc: "Compras con tarjeta, cuotas y el pago del mes" },
  ]
  return { gastos, "gastos-todos": gastos, fijos: gastos, suscripciones: gastos, tarjetas: gastos }
```

- [ ] **Step 2: Registrarla como página**

En `EN_PESTANAS` (línea ~60), antes de `fijos`:

```ts
  { leaf: leaf("gastos-todos", "Todos los gastos", "layers"), g: "dinero" },
```

Así tiene migas, sale en ⌘K y `pageById("gastos-todos")` la encuentra.

- [ ] **Step 3: La vista mínima**

Crea `apps/web/features/bandeja/bandeja-view.tsx`:

```tsx
"use client"

import { PageHeader } from "@/components/mirai/page-header"

export function BandejaView() {
  return (
    <div className="grid gap-6">
      <PageHeader id="gastos-todos" title="Todos los gastos"
        description="Todo lo que sale de tu bolsillo en un solo lugar: los gastos del día a día, los fijos, las suscripciones, las tarjetas y las cuotas de tus deudas." />
    </div>
  )
}
```

`title` es obligatorio acá: `PageHeader` saca el título de `HELP[id]` y todavía no hay una entrada de ayuda para `gastos-todos`.

- [ ] **Step 4: La ruta**

Crea `apps/web/app/(app)/gastos-todos/page.tsx`:

```tsx
import { Suspense } from "react"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { BandejaView } from "@/features/bandeja/bandeja-view"

export const metadata = { title: "Todos los gastos" }

export default function Page() {
  return <Suspense fallback={<PageSkeleton kpis={3} rows={8} />}><BandejaView /></Suspense>
}
```

- [ ] **Step 5: Verificar**

```bash
pnpm typecheck && pnpm lint && pnpm dev
```

Abre `http://localhost:55300/fijos`: la pestaña «Todos» debe aparecer de primera en la barra que ya estaba, y llevar a `/gastos-todos`. Comprueba que en la bandeja la pestaña marcada es «Todos», que las migas dicen Inicio › Finanzas › Mi dinero y que ⌘K encuentra «Todos los gastos».

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/\(app\)/gastos-todos/page.tsx apps/web/features/bandeja/bandeja-view.tsx apps/web/lib/nav.ts
git commit -m "feat(gastos): pestaña y ruta de la bandeja de gastos generales"
```

---

### Task 4: La bandeja: KPI, tabla, vistas y filtros

**Files:**
- Modify: `apps/web/features/bandeja/bandeja-view.tsx` (la vista completa)

**Interfaces:**
- Consumes: `flujoIntegral`, `periodo`, `periodosDelLibro`, `MODULOS`, `Mov` de `@/lib/domain/flujo-integral`; `useBookData` de `@/features/book/use-book-data`; `useIntegralExtras` de `@/features/book/use-integral` (Task 2); `EstadoPill` de `@/features/balance/balance-parts`; `DataTable` de `@/components/mirai/data-table`.
- Produces: la bandeja funcional (sin acciones de pago; esas llegan en la Task 5).

- [ ] **Step 1: Escribir la vista**

Reemplaza `apps/web/features/bandeja/bandeja-view.tsx` por:

```tsx
"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { PageHeader } from "@/components/mirai/page-header"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { EmptyState } from "@/components/mirai/empty-state"
import { ListRow } from "@/components/mirai/list-row"
import { Segmented } from "@/components/mirai/choice-cards"
import { DataTable, type DTColumn } from "@/components/mirai/data-table"
import { useBookData } from "@/features/book/use-book-data"
import { useIntegralExtras } from "@/features/book/use-integral"
import { EstadoPill } from "@/features/balance/balance-parts"
import { MODULOS, flujoIntegral, periodo, periodosDelLibro, type Mov } from "@/lib/domain/flujo-integral"
import { fmtDate, todayISO } from "@/lib/format"

/** Lo que sale y la bandeja muestra: consumo (gasto) y deudas. El ahorro va aparte: guardar no es gastar. */
const CLASES_GASTO: readonly string[] = ["gasto", "deuda"]

export function BandejaView() {
  const today = todayISO()
  const router = useRouter()
  const { data: book, isPending } = useBookData()
  const X = useIntegralExtras(book, today)
  const [tipo, setTipo] = useState("mes")
  const [conAhorro, setConAhorro] = useState(false)

  const [y, m] = today.split("-").map(Number)
  const P = book ? periodo(book, tipo, y, m - 1) : null
  const F = book && P ? flujoIntegral(book, P, today, X) : null
  const movs: Mov[] = (F?.movs ?? []).filter(
    (mv) => mv.dir === "sale" && (CLASES_GASTO.includes(mv.clase) || (conAhorro && mv.clase === "ahorro")),
  )

  const sum = (f: (mv: Mov) => boolean) => movs.filter(f).reduce((a, mv) => a + mv.v, 0)
  const porPagar = sum((mv) => mv.estado !== "hecho")
  const vencido = sum((mv) => mv.estado === "vencido")
  const pagado = sum((mv) => mv.estado === "hecho")

  const columns: DTColumn<Mov>[] = [
    { id: "fecha", header: "Fecha", sort: (mv) => mv.fecha, csv: (mv) => mv.fecha },
    { id: "concepto", header: "Concepto", sort: (mv) => mv.n.toLowerCase(), csv: (mv) => mv.n },
    { id: "modulo", header: "De dónde sale", sort: (mv) => MODULOS[mv.modulo].label, csv: (mv) => MODULOS[mv.modulo].label },
    { id: "categoria", header: "Categoría", sort: (mv) => mv.cat, csv: (mv) => mv.cat },
    { id: "estado", header: "Estado", csv: (mv) => ({ hecho: "Pagado", vencido: "Vencido", programado: "Programado" })[mv.estado] ?? mv.estado },
    { id: "valor", header: "Valor", align: "right", sort: (mv) => mv.v, csv: (mv) => Math.round(mv.v) },
  ]

  const modulosConDatos = [...new Set(movs.map((mv) => mv.modulo))].map((k) => ({ value: k, label: MODULOS[k].label }))
  const catsConDatos = [...new Set(movs.map((mv) => mv.cat))].sort().map((c) => ({ value: c, label: c }))

  return (
    <div className="grid gap-6">
      <PageHeader id="gastos-todos" title="Todos los gastos"
        description="Todo lo que sale de tu bolsillo en un solo lugar: los gastos del día a día, los fijos, las suscripciones, las tarjetas y las cuotas de tus deudas."
        actions={<Button variant="outline" asChild><Link href="/recordatorios">Verlos en el calendario</Link></Button>} />

      <div className="flex flex-wrap items-center gap-3">
        <Segmented value={tipo} onChange={setTipo} items={(book ? periodosDelLibro(book) : [{ tipo: "mes", label: "Mes completo" }]).map((p) => ({ value: p.tipo, label: p.label }))} />
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
          <Switch checked={conAhorro} onCheckedChange={setConAhorro} />
          Incluir lo que ahorras e inviertes
        </label>
      </div>

      <KpiGrid cols={3}>
        <Kpi icon="hourglass" tone="amber" label="Falta por pagar" loading={isPending} value={<Money value={porPagar} />} sub="Vencido y por venir en el periodo"
          info="Lo que todavía no has pagado en este periodo, sumando todos tus módulos. No incluye los préstamos que te dan o que haces: esos no son un gasto." />
        <Kpi icon="circle-alert" tone={vencido ? "red" : "green"} label="Vencido" loading={isPending} value={<Money value={vencido} />} valueClassName={vencido ? "text-danger" : undefined} sub={vencido ? "Págalo cuanto antes" : "Nada vencido"} />
        <Kpi icon="circle-check" tone="green" label="Ya pagado" loading={isPending} value={<Money value={pagado} />} sub="En el periodo que estás viendo" />
      </KpiGrid>

      <DataTable<Mov>
        title="Todo lo que sale" info="Reunimos tus gastos del día a día, los fijos, las suscripciones, las tarjetas y las cuotas de tus deudas. Cada pago aparece una sola vez, aunque lo hayas registrado en dos sitios."
        data={movs} loading={isPending} columns={columns} rowKey={(mv) => mv.id} noun={["movimiento", "movimientos"]} exportName="todos-los-gastos"
        total={{ value: (mv) => mv.v, label: "en total" }} initialSort={{ id: "fecha", dir: "desc" }}
        search={{ placeholder: "Buscar un gasto", text: (mv) => `${mv.n} ${mv.s} ${mv.cat} ${MODULOS[mv.modulo].label}` }}
        views={[
          { id: "pagar", label: "Por pagar", match: (mv) => mv.estado !== "hecho" },
          { id: "pagados", label: "Pagados", match: (mv) => mv.estado === "hecho" },
          { id: "todo", label: "Todo el periodo" },
        ]}
        filters={[
          { id: "modulo", label: "De dónde sale", options: modulosConDatos, match: (mv, v) => mv.modulo === v },
          { id: "cat", label: "Categoría", options: catsConDatos, match: (mv, v) => mv.cat === v },
          { id: "estado", label: "Estado", options: [{ value: "vencido", label: "Vencido" }, { value: "programado", label: "Programado" }, { value: "hecho", label: "Pagado" }], match: (mv, v) => mv.estado === v },
          { id: "fecha", label: "Fecha", kind: "dates", value: (mv) => mv.fecha },
          { id: "valor", label: "Valor", kind: "range", money: true, value: (mv) => mv.v },
        ]}
        emptyState={<EmptyState iso="gastos" title="Todavía no hay nada que mostrar" description="Cuando registres gastos, fijos, suscripciones o tarjetas, aquí los ves todos juntos." />}
        item={(mv) => (
          <ListRow key={mv.id} icon={mv.icon} title={mv.n}
            subtitle={`${fmtDate(mv.fecha)} · ${mv.s}`}
            badges={<EstadoPill m={mv} />}
            value={<Money value={mv.v} className="font-bold" />}
            onClick={() => router.push(mv.href)} />
        )}
      />
    </div>
  )
}
```

`ListRow` **no** acepta `href`: navega con `onClick` (así está escrito arriba).

- [ ] **Step 2: Comprobar que las cifras cuadran**

```bash
pnpm dev
```

Abre `/gastos-todos` y `/balance` con el mismo periodo (Mes completo). El total de la bandeja (pie de la tabla, con el interruptor de ahorro **apagado**) tiene que ser **idéntico** a «Lo que sale» del Balance. Si no cuadra, casi siempre es que estás contando una clase de más (`ahorro`, `credito`) o filtrando mal `dir`.

- [ ] **Step 3: Verificar**

```bash
pnpm typecheck && pnpm lint
```

Esperado: 0 errores.

- [ ] **Step 4: Commit**

```bash
git add apps/web/features/bandeja/bandeja-view.tsx
git commit -m "feat(bandeja): tabla de todo lo que sale con KPI, vistas y filtros"
```

---

### Task 5: Pagar desde la bandeja

**Files:**
- Create: `apps/web/features/subscriptions/cobro.ts` (extraer `cobroDe`)
- Modify: `apps/web/features/subscriptions/subscriptions-view.tsx:57-60` (usar el extraído)
- Modify: `apps/web/features/bandeja/bandeja-view.tsx` (acciones por fila y diálogos)

**Interfaces:**
- Consumes: `Mov.ref` (Task 1) y estas firmas **reales**, ya verificadas:
  - `PayFixedDialog({ fixed: FixedRow | null, onOpenChange, onReschedule })`
  - `ChargeSubDialog({ cobro: CobroSub | null, onOpenChange })` con `CobroSub = { sub, esperado, abonado }`
  - `PayLoanDialog({ loan: (LoanIn & { id: string }) | null, name: string, onOpenChange })`
  - `PayCardForm({ card: CardPagable | null, onOpenChange })` con `CardPagable = Row<"credit_cards"> & { purchases, pagos? }`
- Produces: `cobroDe(sub, expenses, trm): CobroSub` reutilizable.

- [ ] **Step 1: Extraer `cobroDe`**

Crea `apps/web/features/subscriptions/cobro.ts`:

```ts
import { conv } from "@/lib/domain"
import type { Row } from "@/lib/supabase/tables"
import type { CobroSub } from "./charge-sub-dialog"

/** Lo que vale el cobro vigente de una suscripción (en pesos y solo tu parte) y lo que ya abonaste a ese cobro. */
export function cobroDe(
  s: Row<"subscriptions">,
  expenses: (Row<"expenses"> & { subscription_id?: string | null; sub_proximo?: string | null })[],
  trm: Record<string, number> | null | undefined,
): CobroSub {
  const esperado = Math.round(conv(Number(s.valor), s.currency, trm) / Math.max(1, s.comparte))
  const abonado = expenses
    .filter((g) => g.subscription_id === s.id && g.sub_proximo === s.proximo)
    .reduce((a, g) => a + Number(g.valor), 0)
  return { sub: s, esperado, abonado }
}
```

Si `conv` no se exporta desde `@/lib/domain`, mira de dónde lo importa `subscriptions-view.tsx` y usa esa misma ruta.

En `subscriptions-view.tsx`, borra el `cobroDe` local (líneas 57-60) e impórtalo:

```ts
import { cobroDe } from "./cobro"
```

y en los dos sitios donde se llama, pásale los argumentos: `cobroDe(s, expenses, trm)`.

- [ ] **Step 2: Resolver la fila desde el `ref`**

En `bandeja-view.tsx`, después de `const movs = …`:

```tsx
  const [pagando, setPagando] = useState<Mov | null>(null)
  const ref = pagando?.ref ?? null
  const buscar = <T extends { id?: string | null }>(xs: T[] | undefined, id: string) => xs?.find((x) => x.id === id) ?? null
  // Solo se paga lo que falta y tiene de dónde agarrarse (un gasto suelto ya está pagado).
  const sePuedePagar = (mv: Mov) => mv.estado !== "hecho" && !!mv.ref && mv.ref.tabla !== "expenses"
```

- [ ] **Step 3: El botón en cada fila**

En el `item` del `DataTable`, agrega `actions` al `ListRow`:

```tsx
            actions={sePuedePagar(mv) ? [{ label: `Pagar ${mv.n}`, tip: "Registrar el pago", icon: "circle-check", onClick: () => setPagando(mv), className: mv.estado === "vencido" ? "text-danger" : "text-success" }] : []}
```

- [ ] **Step 4: Montar los cuatro diálogos**

Imports:

```tsx
import { PayFixedDialog } from "@/features/fixed/pay-fixed-dialog"
import { ChargeSubDialog } from "@/features/subscriptions/charge-sub-dialog"
import { cobroDe } from "@/features/subscriptions/cobro"
import { PayLoanDialog } from "@/features/loans/pay-loan-dialog"
import { PayCardForm } from "@/features/cards/card-forms"
import { loanName } from "@/lib/domain"
```

Antes del `</div>` que cierra la vista:

```tsx
      <PayFixedDialog
        fixed={ref?.tabla === "fixed_expenses" ? (buscar(book?.fixedExpenses, ref.id) as never) : null}
        onOpenChange={(o) => { if (!o) setPagando(null) }} onReschedule={() => setPagando(null)} />
      <ChargeSubDialog
        cobro={ref?.tabla === "subscriptions" && book ? (() => { const s = buscar(book.subscriptions, ref.id); return s ? cobroDe(s as never, book.expenses as never, book.settings.trm) : null })() : null}
        onOpenChange={(o) => { if (!o) setPagando(null) }} />
      <PayLoanDialog
        loan={ref?.tabla === "loans" ? (buscar(book?.loans, ref.id) as never) : null}
        name={ref?.tabla === "loans" && book ? loanName(buscar(book.loans, ref.id) as never, book.contacts, book.entities) : ""}
        onOpenChange={(o) => { if (!o) setPagando(null) }} />
      <PayCardForm
        card={ref?.tabla === "credit_cards" ? (buscar(book?.creditCards, ref.id) as never) : null}
        onOpenChange={(o) => { if (!o) setPagando(null) }} />
```

`PayFixedDialog` espera la fila con sus `payments` y `PayCardForm` la tarjeta con sus `purchases`: el snapshot del libro (`useBookData`) ya las trae así, igual que las usan `fixed-view.tsx` y `cards-view.tsx`. Si el tipo no calza exactamente, mira cómo arma la fila la vista del módulo y repítelo — no cambies el diálogo.

- [ ] **Step 5: Comprobar que refresca**

Los diálogos ya invalidan con `invalidateBook`, así que la bandeja se actualiza sola. Paga un fijo desde la bandeja y mira que la fila pase de «Por pagar» a «Pagados» sin recargar.

- [ ] **Step 6: Verificar**

```bash
pnpm typecheck && pnpm lint
```

Esperado: 0 errores. Ojo con el gotcha de ventanas cruzadas: dos Radix abiertos a la vez bloquean los clics; por eso hay **un solo** `pagando`, y los cuatro diálogos se excluyen por `ref.tabla`.

- [ ] **Step 7: Commit**

```bash
git add apps/web/features/subscriptions/cobro.ts apps/web/features/subscriptions/subscriptions-view.tsx apps/web/features/bandeja/bandeja-view.tsx
git commit -m "feat(bandeja): pagar un fijo, una suscripción, una tarjeta o una cuota sin salir de la bandeja"
```

---

### Task 6: Plata contada dos veces, en la bandeja

**Files:**
- Modify: `apps/web/features/bandeja/bandeja-view.tsx`

**Interfaces:**
- Consumes: `posiblesDobles` de `@/lib/domain` y el mismo comando de enlazar que usa el Balance.
- Produces: aviso con la opción de enlazar el gasto suelto con su gasto fijo.

- [ ] **Step 1: Ver cómo lo resuelve el Balance**

```bash
grep -n "posiblesDobles" -A 25 apps/web/features/balance/balance-view.tsx | head -60
grep -rn "link_expense_fixed\|linkExpenseFixed" apps/web/features --include="*.ts" | grep -v "\.next"
```

Copia **el mismo** componente de aviso y el mismo comando: no escribas una segunda forma de enlazar.

- [ ] **Step 2: Calcularlo en la bandeja**

Después de `const F = …`:

```tsx
  const dobles = book && P ? posiblesDobles(book, P.a, P.b, today) : []
```

- [ ] **Step 3: Mostrarlo encima de la tabla**

Entre los `Kpi` y el `DataTable`, monta el mismo aviso que usa el Balance (el componente que encontraste en el paso 1), con el texto adaptado:

```tsx
      {dobles.length > 0 && (
        <Notice tone="warn" title={`Puede que ${dobles.length === 1 ? "un gasto esté" : `${dobles.length} gastos estén`} contado${dobles.length === 1 ? "" : "s"} dos veces`}
          action={<Button size="sm" variant="outline" onClick={() => setVerDobles(true)}>Revisarlos</Button>}>
          Registraste un gasto suelto que parece ser el mismo pago de un gasto fijo. Si los enlazas, no se cuenta dos veces.
        </Notice>
      )}
```

con `const [verDobles, setVerDobles] = useState(false)` y el mismo diálogo del Balance.

- [ ] **Step 4: Verificar**

```bash
pnpm typecheck && pnpm lint && pnpm --filter web test
```

Esperado: 0 errores.

- [ ] **Step 5: Commit**

```bash
git add apps/web/features/bandeja/bandeja-view.tsx
git commit -m "feat(bandeja): avisa cuándo un gasto puede estar contado dos veces"
```

---

### Task 7: Prueba E2E de la bandeja

**Files:**
- Create: `apps/web/tests/e2e/f1-bandeja-gastos.spec.ts`

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Escribir la prueba**

Crea `apps/web/tests/e2e/f1-bandeja-gastos.spec.ts`:

```ts
import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

// La bandeja de /gastos-todos junta lo que sale de todos los módulos, se entra por las pestañas y deja pagar sin salir.
test("bandeja de gastos: pestañas, módulos distintos y pagar desde ahí", async ({ page }, info) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  await login(page)

  // Se entra desde /fijos, como lo pidió el dueño del producto.
  await page.goto("/fijos")
  await page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: /Todos/ }).click()
  await expect(page).toHaveURL(/\/gastos\/todos/)
  await expect(page.getByRole("heading", { name: /Todos los gastos/i })).toBeVisible()

  // Hay filas de por lo menos tres módulos distintos.
  await page.getByRole("tab", { name: "Todo el periodo" }).click()
  const textoModulos = await page.locator("#main li").allInnerTexts()
  const hay = (re: RegExp) => textoModulos.some((t) => re.test(t))
  expect([hay(/Gasto ·/), hay(/Gasto fijo/), hay(/Suscripción/), hay(/[Tt]arjeta/), hay(/Cuota/)].filter(Boolean).length).toBeGreaterThanOrEqual(3)

  await shot(page, "bandeja-gastos", info.project.name)

  // Pagar un fijo pendiente desde la bandeja.
  const pendiente = page.locator("#main li").filter({ hasText: "Gasto fijo" }).filter({ has: page.getByRole("button", { name: /^Pagar / }) }).first()
  if (await pendiente.count()) {
    await pendiente.getByRole("button", { name: /^Pagar / }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click()
    await expect(page.getByText(/Pago registrado|pagado/i).first()).toBeVisible()
  }

  expect(errs, errs.join("\n")).toEqual([])
})
```

- [ ] **Step 2: Correrla**

```bash
pnpm e2e:local -- --grep "bandeja de gastos"
```

Esperado: PASS en escritorio y móvil. Si falla porque el libro QA no tiene datos de tres módulos, crea los que falten en la prueba (gasto, fijo y suscripción) con la misma UI, y bórralos en el `finally` como hace `f1-pagar-a.spec.ts`.

- [ ] **Step 3: Revisar las capturas a 400 px**

Mira `apps/web/tests/.out/bandeja-gastos-*.png`: la barra de pestañas se desplaza horizontal (es a propósito), pero la **página** no puede tener scroll horizontal, y las tarjetas de la tabla no pueden cortar los montos.

- [ ] **Step 4: Batería completa**

```bash
pnpm build && pnpm e2e:local
```

Esperado: todo en verde.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/e2e/f1-bandeja-gastos.spec.ts
git commit -m "test(e2e): bandeja de gastos generales con pestañas y pago desde la fila"
```

---

## Cierre

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm e2e:local` en verde.
- [ ] El total de la bandeja (sin ahorro) **es igual** a «Lo que sale» del Balance para el mismo periodo. Esto es la regla de cifras más importante de este plan: si no cuadra, no se cierra.
- [ ] Capturas revisadas a 1366 px y 400 px.
- [ ] Los cuatro diálogos de pago (fijo, suscripción, tarjeta, cuota) abren bien desde la bandeja y la fila cambia de estado sin recargar.

# Gasto fijo: «¿A quién le pagas?» y 4 campos nuevos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un gasto fijo se le pueda pagar a un negocio **o a una persona**, y que el formulario deje guardar la referencia del pago, hasta cuándo se paga, la moneda y sus propios días de aviso.

**Architecture:** La UI reutiliza el componente `PagarA` que ya resolvió esto en Gastos. La base recibe cuatro columnas nuevas en una migración aditiva. El corte por fecha de fin va en **un solo punto** del dominio (`fijoPeriods`), de donde lo heredan estado, agenda, avisos, Balance, Dashboard y proyecciones.

**Tech Stack:** Next.js 16 (App Router, `cacheComponents`), React Hook Form + zod 4, shadcn/ui, TanStack Query, PostgreSQL + PostgREST con RLS, NestJS (API), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-09-gasto-fijo-y-bandeja-design.md`

## Global Constraints

- **Idioma:** toda la UI, los textos de ayuda, los mensajes de error y los comentarios de cara al usuario van en **español de Colombia con tuteo**. Solo el código (variables, funciones, APIs) va en inglés.
- **Migraciones:** van en `db/postgres/NNNN_nombre.sql` (siguiente número libre). `supabase/migrations/` es historia y **no se toca**. Deben ser idempotentes (`add column if not exists`, `create index if not exists`, restricciones dentro de `do $$ … pg_constraint … $$`) y aditivas.
- **Toda llave foránea nueva necesita índice.**
- `packages/domain` **no puede importar nada** de `apps/web` (ni `@/…`).
- La web no habla con la base: todo va por la API. `fixed_expenses` ya pasa por el CRUD genérico, así que no hay endpoint nuevo.
- **No romper la paridad con la v4:** las pruebas de `packages/domain` comparan contra el bundle de Mirai 4.0. Todo parámetro nuevo de una función del dominio va **al final y es opcional**.
- **Reglas de cifras:** `.agents/rules/cifras.md`. Un desglose siempre suma su total.
- En la web usa `useQuery` de `@/lib/query`, nunca el de `@tanstack/react-query` (ESLint lo exige).
- Montos marcados con `data-money`; formato COP con `Intl` (`es-CO`).
- Antes de cerrar: `pnpm build` + `pnpm e2e:local`, y revisar capturas en `apps/web/tests/.out/`.

---

### Task 1: Migración, tipos y contratos

**Files:**
- Create: `db/postgres/0009_fijo_pagado_a_y_extras.sql`
- Modify: `packages/db/src/database.types.ts` (tabla `fixed_expenses`: Row, Insert, Update, Relationships)
- Modify: `packages/contracts/src/book-table-columns.ts:19`
- Modify: `packages/contracts/src/book-table-schemas.ts:126-150`
- Modify: `packages/domain/src/types.ts:93-107`

**Interfaces:**
- Consumes: nada (primera tarea).
- Produces: las columnas `fixed_expenses.contact_id uuid`, `referencia text not null default ''`, `hasta date`, `aviso integer`; y en el tipo `FixedExpenseIn` los campos opcionales `currency?: string | null`, `hasta?: string | null`, `aviso?: number | null`, `contact_id?: string | null`, `referencia?: string | null`.

- [ ] **Step 1: Escribir la migración**

Crea `db/postgres/0009_fijo_pagado_a_y_extras.sql`:

```sql
-- Gasto fijo: "¿A quién le pagas?" separa un negocio o empresa (provider_id, Proveedores) de una persona
-- (contact_id, Contactos), igual que ya hace el gasto del día a día (0004_gasto_pagado_a.sql). Además:
--   referencia: número de cuenta, contrato o póliza con que se paga (la cuenta de Enel, el código del colegio).
--   hasta:      hasta cuándo se paga (contrato a 12 meses, plan de celular). Vacío = indefinido.
--   aviso:      días de anticipo propios de este gasto. Vacío = el del libro (book_settings.anticipo).
-- Aditiva: los gastos fijos de antes quedan igual.
alter table public.fixed_expenses add column if not exists contact_id uuid;
alter table public.fixed_expenses add column if not exists referencia text not null default '';
alter table public.fixed_expenses add column if not exists hasta date;
alter table public.fixed_expenses add column if not exists aviso integer;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'fixed_expenses_contact_id_fkey') then
    alter table public.fixed_expenses add constraint fixed_expenses_contact_id_fkey
      foreign key (contact_id) references public.contacts(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fixed_expenses_aviso_check') then
    alter table public.fixed_expenses add constraint fixed_expenses_aviso_check
      check (aviso is null or (aviso >= 0 and aviso <= 100));
  end if;
end $$;

-- Toda llave foránea con índice (borrar un contacto no revisa la tabla completa).
create index if not exists fixed_expenses_contact_idx
  on public.fixed_expenses using btree (contact_id) where (contact_id is not null);

comment on column public.fixed_expenses.contact_id is 'Persona a la que se le paga (Contactos). Para un negocio o empresa se usa provider_id.';
comment on column public.fixed_expenses.referencia is 'Número de cuenta, contrato o referencia con que se paga.';
comment on column public.fixed_expenses.hasta is 'Hasta cuándo se paga (vacío = indefinido). No se generan periodos después de esta fecha.';
comment on column public.fixed_expenses.aviso is 'Días de anticipo del aviso para este gasto (vacío = el del libro).';

-- Al pagar un fijo, el gasto hereda también la persona (antes solo heredaba el negocio). De paso se le fija el
-- search_path, que le faltaba.
create or replace function public.expense_provider_default() returns trigger
    language plpgsql
    set search_path to 'public'
    as $$
begin
  if new.fixed_expense_id is not null and (new.provider_id is null or new.contact_id is null) then
    select coalesce(new.provider_id, f.provider_id), coalesce(new.contact_id, f.contact_id)
      into new.provider_id, new.contact_id
      from public.fixed_expenses f where f.id = new.fixed_expense_id;
  end if;
  return new;
end $$;

-- PostgREST: que vea las columnas nuevas sin reiniciar.
notify pgrst, 'reload schema';
```

- [ ] **Step 2: Levantar el stack local y aplicarla**

```bash
node infra/local/stack.mjs up
node packages/db/scripts/db-destino.mjs pendientes --url postgres://postgres:mirai-local@localhost:55432/mirai
```

Esperado: dice que aplicó `0009_fijo_pagado_a_y_extras.sql`.

- [ ] **Step 3: Comprobar que es idempotente**

```bash
docker exec -i mirai-local-db-1 psql -U postgres -d mirai -v ON_ERROR_STOP=1 < db/postgres/0009_fijo_pagado_a_y_extras.sql
```

Esperado: termina sin error (se puede correr dos veces).

- [ ] **Step 4: Regenerar los tipos de la base**

```bash
pnpm db:types
```

Esperado: `packages/db/src/database.types.ts` ahora tiene `"aviso": number | null`, `"contact_id": string | null`, `"hasta": string | null`, `"referencia": string` en Row/Insert/Update de `fixed_expenses`, y la relación `fixed_expenses_contact_id_fkey`.

Si `SUPABASE_DB_URL` no apunta a la base local, exporta primero:
`export SUPABASE_DB_URL=postgres://postgres:mirai-local@localhost:55432/mirai`

- [ ] **Step 5: Lista blanca de columnas del CRUD genérico**

En `packages/contracts/src/book-table-columns.ts:19`, la fila de `fixed_expenses` queda (orden alfabético, con las cuatro nuevas):

```ts
  fixed_expenses: ["aviso", "book_id", "category_id", "contact_id", "created_at", "created_by", "currency", "deleted_at", "desde", "dia", "dia2", "fecha_unica", "frec", "hasta", "id", "inicio", "link_id", "link_type", "logo_path", "member_id", "member_ids", "mes", "nombre", "payment_method_id", "proveedor", "provider_id", "referencia", "reparto", "updated_at", "valor", "variable", "vmax", "vmin"],
```

- [ ] **Step 6: Zod de escritura**

En `packages/contracts/src/book-table-schemas.ts`, dentro de `fixed_expenses: z.strictObject({ … })`, agrega estas cuatro claves (manteniendo el orden alfabético del objeto):

```ts
    aviso: Int.nullable().optional(),
    contact_id: Uuid.nullable().optional(),
    hasta: IsoDate.nullable().optional(),
    referencia: Txt(500).optional(),
```

`Int`, `Txt`, `IsoDate` y `Uuid` ya están definidos/importados en ese archivo (líneas 15-19).

- [ ] **Step 7: Tipo del dominio**

En `packages/domain/src/types.ts`, dentro de `FixedExpenseIn` (línea 93), agrega:

```ts
  /** Moneda del valor ('COP', 'USD', 'EUR'); se convierte con la TRM del libro. */
  currency?: string | null
  /** Hasta cuándo se paga ('YYYY-MM-DD'); vacío = indefinido. */
  hasta?: string | null
  /** Días de anticipo del aviso propios de este gasto; vacío = el del libro. */
  aviso?: number | null
  /** Persona a la que se le paga (Contactos). */
  contact_id?: string | null
  /** Número de cuenta, contrato o referencia. */
  referencia?: string | null
```

- [ ] **Step 8: Verificar que compila**

```bash
pnpm typecheck
```

Esperado: 0 errores. La prueba de tipos de `book-table-schemas.ts:448` (`KeysOk`) confirma que toda columna del zod existe en `Insert<"fixed_expenses">`; si falla, los tipos del paso 4 no se regeneraron bien.

- [ ] **Step 9: Commit**

```bash
git add db/postgres/0009_fijo_pagado_a_y_extras.sql packages/db/src/database.types.ts packages/contracts/src/book-table-columns.ts packages/contracts/src/book-table-schemas.ts packages/domain/src/types.ts
git commit -m "feat(fijos): columnas contact_id, referencia, hasta y aviso en gastos fijos"
```

---

### Task 2: El dominio entiende «hasta cuándo»

**Files:**
- Modify: `packages/domain/src/fixed.ts:26-57` (`FijoPeriodInput`, `fijoPeriods`, `fijoMensual`) y `:123` (`fijoStatus`)
- Modify: `packages/domain/src/totals.ts:70` (`fijosMes`)
- Test: `packages/domain/src/fixed.test.ts`

**Interfaces:**
- Consumes: `FixedExpenseIn.hasta` de la Task 1.
- Produces:
  - `fijoPeriods(f, y, m, today?)` — no devuelve periodos con `due > f.hasta`.
  - `fijoMensual(f, trm?, today?): number` — `0` si el fijo ya terminó en `today`.
  - `fijosMes(fixed, trm?, today?): number`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Al final de `packages/domain/src/fixed.test.ts`, agrega:

```ts
describe("hasta: el gasto fijo deja de pedir pagos", () => {
  const base = { id: "f1", nombre: "Plan celular", valor: 60_000, frec: "mensual", dia: 10, desde: "2026-01", payments: [] }

  it("no genera periodos después de la fecha de fin", () => {
    const f = { ...base, hasta: "2026-03-31" }
    expect(fijoPeriods(f, 2026, 2)).toHaveLength(1) // marzo: el día 10 sí entra
    expect(fijoPeriods(f, 2026, 3)).toHaveLength(0) // abril: ya terminó
  })

  it("incluye el periodo que cae justo en la fecha de fin", () => {
    expect(fijoPeriods({ ...base, hasta: "2026-03-10" }, 2026, 2)).toHaveLength(1)
    expect(fijoPeriods({ ...base, hasta: "2026-03-09" }, 2026, 2)).toHaveLength(0)
  })

  it("sin hasta, se comporta igual que siempre", () => {
    expect(fijoPeriods(base, 2026, 3)).toEqual(fijoPeriods({ ...base, hasta: null }, 2026, 3))
  })

  it("fijoMensual da 0 cuando ya terminó y today se pasa", () => {
    const f = { ...base, hasta: "2026-03-31" }
    expect(fijoMensual(f, null, "2026-05-01")).toBe(0)
    expect(fijoMensual(f, null, "2026-03-01")).toBe(60_000)
    expect(fijoMensual(f)).toBe(60_000) // sin today, no cambia nada
  })

  it("fijoStatus de un fijo terminado no deja pendientes ni próximo", () => {
    const st = fijoStatus({ ...base, hasta: "2026-03-31" }, "2026-06-15")
    expect(st.prox).toBeNull()
    expect(st.venc).toHaveLength(0)
    expect(st.mensual).toBe(0)
  })
})
```

- [ ] **Step 2: Correr las pruebas y ver que fallan**

```bash
pnpm --filter @mirai/domain test -- fixed
```

Esperado: FAIL — `fijoPeriods` todavía devuelve el periodo de abril.

- [ ] **Step 3: Implementar el corte en `fijoPeriods`**

En `packages/domain/src/fixed.ts`, cambia el tipo de entrada (línea 26) para que incluya `hasta`:

```ts
type FijoPeriodInput = Pick<FixedExpenseIn, "frec" | "dia" | "dia2" | "mes" | "desde" | "fecha_unica" | "hasta">
```

Renombra la función actual `fijoPeriods` a `periodosDelMes` (quítale el `export` y el bloque de documentación, que pasa a la nueva) y crea encima la pública:

```ts
/**
 * Periodos de un gasto fijo que caen en el mes `m` (base 0) del año `y`.
 * Bimestral/trimestral/semestral toman la fase de `desde`. Un día mayor al último del mes se recorta.
 * `today` solo se usa si un gasto único no tiene fecha (la v4 tomaba hoy).
 * Un fijo con fecha de fin (`hasta`) no tiene periodos después de esa fecha.
 */
export function fijoPeriods(f: FijoPeriodInput, y: number, m: number, today?: DateInput): FixedPeriod[] {
  const out = periodosDelMes(f, y, m, today)
  const h = f.hasta
  return h ? out.filter((p) => p.due <= h) : out
}
```

- [ ] **Step 4: Implementar `fijoMensual` con `today`**

Reemplaza la firma de `fijoMensual` (línea 55) por:

```ts
/**
 * Equivalente mensual de un fijo, en pesos si se pasa la TRM (un fijo en USD o EUR se convierte).
 * Con `today`, un fijo que ya terminó (`hasta`) vale 0: no sigue sumando en "Total al mes".
 */
export function fijoMensual(
  f: Pick<FixedExpenseIn, "frec" | "valor"> & { currency?: string | null; hasta?: string | null },
  trm?: Record<string, number> | null,
  today?: DateInput,
): number {
  if (today && f.hasta && iso(toDay(today)) > f.hasta) return 0
  const v = trm && f.currency && f.currency !== "COP" ? f.valor * (+trm[f.currency] || 1) : f.valor
  return f.frec === "quincenal" ? v * 2 : FSTEP[f.frec] ? v / FSTEP[f.frec] : 0
}
```

`iso` y `toDay` ya están importados en la primera línea del archivo.

- [ ] **Step 5: Que `fijoStatus` use la fecha que ya tiene**

En `packages/domain/src/fixed.ts:123`, el `return` de `fijoStatus` pasa de `mensual: fijoMensual(f)` a:

```ts
  return { periods: out, venc, prox, mensual: fijoMensual(f, null, t) }
```

- [ ] **Step 6: Que `fijosMes` acepte `today`**

En `packages/domain/src/totals.ts:70`:

```ts
export const fijosMes = (fixed: FixedExpenseIn[], trm?: Record<string, number> | null, today?: DateInput): number =>
  fixed.reduce((a, f) => a + fijoMensual(f, trm, today), 0)
```

Si `DateInput` no está importado en `totals.ts`, agrégalo al import de `./types`.

- [ ] **Step 7: Correr las pruebas**

```bash
pnpm --filter @mirai/domain test
```

Esperado: PASS, **incluidas las de paridad con la v4** (`fixed.test.ts:34`, `totals.test.ts:21`). Si alguna de paridad falla, es que pasaste `today` donde no debías: un fijo sin `hasta` tiene que dar exactamente lo de antes.

- [ ] **Step 8: Commit**

```bash
git add packages/domain/src/fixed.ts packages/domain/src/totals.ts packages/domain/src/fixed.test.ts
git commit -m "feat(dominio): un gasto fijo con fecha de fin deja de generar periodos"
```

---

### Task 3: Días de aviso propios del gasto fijo

**Files:**
- Modify: `packages/domain/src/agenda.ts:19-38` (`AgendaItem`), `:46-52` (fijos) y `:178-201` (`notifs`)
- Test: `packages/domain/src/agenda.test.ts`

**Interfaces:**
- Consumes: `FixedExpenseIn.aviso` de la Task 1.
- Produces: `AgendaItem.aviso?: number` — días de anticipo del ítem; `notifs()` lo usa en vez del global cuando viene.

- [ ] **Step 1: Escribir la prueba que falla**

Al final de `packages/domain/src/agenda.test.ts`, agrega (ajusta el helper `libro`/`book` al que ya use ese archivo):

```ts
describe("aviso propio del gasto fijo", () => {
  const fijo = (extra: object) => ({ id: "f1", nombre: "Predial", valor: 400_000, frec: "anual", dia: 20, mes: 6, desde: "2026-01", payments: [], ...extra })

  it("avisa con los días del gasto aunque el libro diga otra cosa", () => {
    // El libro avisa 5 días antes; el predial, 15. Faltan 12 días: solo debe avisar el que tiene aviso propio.
    const conPropio = { ...base, settings: { ...base.settings, anticipo: 5 }, fixedExpenses: [fijo({ aviso: 15 })] }
    const sinPropio = { ...base, settings: { ...base.settings, anticipo: 5 }, fixedExpenses: [fijo({})] }
    const hoy = "2026-07-08"
    expect(notifs(conPropio, hoy).some((n) => n.t.includes("Predial"))).toBe(true)
    expect(notifs(sinPropio, hoy).some((n) => n.t.includes("Predial"))).toBe(false)
  })

  it("agenda marca el aviso del fijo en el ítem", () => {
    const b = { ...base, fixedExpenses: [fijo({ aviso: 15 })] }
    expect(agenda(b, "2026-07-08").find((x) => x.k === "fijo")?.aviso).toBe(15)
  })
})
```

`base` es el libro de prueba que ya arma ese archivo (línea 46: el objeto con `settings: { …, anticipo: 5, … }`). Si se llama distinto, usa el nombre real.

- [ ] **Step 2: Correr y ver que falla**

```bash
pnpm --filter @mirai/domain test -- agenda
```

Esperado: FAIL — `aviso` no existe en `AgendaItem` (error de tipos) y el predial no avisa.

- [ ] **Step 3: Agregar el campo a `AgendaItem`**

En `packages/domain/src/agenda.ts`, dentro de `export interface AgendaItem` (después de `nota?: string`):

```ts
  /** Días de anticipo propios de este ítem (gasto fijo); sin él, el del libro. */
  aviso?: number
```

- [ ] **Step 4: Llenarlo en el bloque de fijos**

En `agenda()`, línea 48, el objeto `base` del bucle de `b.fixedExpenses` pasa a:

```ts
    const base = { k: "fijo" as const, id: f.id, icon: catIcon(b.categories, f.category_id), titulo: f.nombre, sub: "Gasto fijo", monto: +f.valor, dir: "pagar" as const, go: "fijos", ...(f.aviso == null ? {} : { aviso: +f.aviso }) }
```

- [ ] **Step 5: Que `notifs` lo use**

En `notifs()` (línea ~184), renombra el global y resuélvelo por ítem. La línea

```ts
  const A = +b.settings.anticipo || 5
```

pasa a

```ts
  const Ag = +b.settings.anticipo || 5
```

y dentro de `for (const x of agenda(b, t)) {`, como primera línea del cuerpo:

```ts
    // Un gasto fijo puede tener sus propios días de aviso (el predial 15, el arriendo 5).
    const A = x.aviso ?? Ag
```

Las tres comparaciones que ya existen (`x.d > A`, `x.d <= A` en cobros y `x.d <= A` en pagos) quedan igual: ahora leen el `A` del ítem.

- [ ] **Step 6: Correr las pruebas**

```bash
pnpm --filter @mirai/domain test
```

Esperado: PASS, incluidas las de paridad (un fijo sin `aviso` usa el global, como siempre).

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/agenda.ts packages/domain/src/agenda.test.ts
git commit -m "feat(dominio): días de aviso propios por gasto fijo"
```

---

### Task 4: «¿A quién le pagas?» en el formulario

**Files:**
- Modify: `apps/web/features/fixed/fixed-form.tsx:36-60` (schema, Preset), `:95-110` (defaultValues), `:128-140` (onSubmit) y `:238-252` (el campo Proveedor)

**Interfaces:**
- Consumes: `fixed_expenses.contact_id` (Task 1); `PagarA` de `@/features/expenses/pagar-a`.
- Produces: el formulario guarda `provider_id` **o** `contact_id`, nunca los dos.

- [ ] **Step 1: Agregar `contact_id` al schema**

En `apps/web/features/fixed/fixed-form.tsx`, dentro de `const schema = z.object({ … })`, justo después de `provider_id: z.string().nullable(),`:

```ts
  contact_id: z.string().nullable(),
```

Y en el tipo `Preset` (línea ~60), agrega `contact_id?: string | null`:

```ts
type Preset = { nombre?: string; provider_id?: string | null; contact_id?: string | null; proveedor?: string; payment_method_id?: string | null; category_id?: string | null }
```

- [ ] **Step 2: Valor por defecto**

En `defaultValues`, junto a `provider_id: fixed?.provider_id ?? preset?.provider_id ?? null,`:

```ts
      contact_id: fixed?.contact_id ?? preset?.contact_id ?? null,
```

- [ ] **Step 3: Guardarlo**

En `onSubmit`, dentro del objeto `const o = { … }`, junto a `provider_id: v.provider_id,`:

```ts
      contact_id: v.contact_id,
```

- [ ] **Step 4: Cambiar el campo de la UI**

Importa el componente arriba del archivo, junto a los demás imports de features:

```ts
import { PagarA } from "@/features/expenses/pagar-a"
```

Y reemplaza **todo** el `<FormField label="Proveedor" …>` (líneas ~238-252) por:

```tsx
            <FormField label="¿A quién le pagas?" className="sm:col-span-2"
              tip="Si es un negocio o una empresa a la que le pagas seguido (la inmobiliaria, Enel, el colegio) elige Negocio o empresa y queda en Proveedores. Si es alguien en particular (el arrendador, la señora del aseo), elige Una persona y queda en Contactos.">
              <Controller control={form.control} name="provider_id" render={({ field }) => (
                <PagarA idPrefix="f" provider={field.value} contact={w.contact_id}
                  onContact={(id) => form.setValue("contact_id", id)}
                  onProvider={(id, p) => {
                    field.onChange(id)
                    form.setValue("proveedor", p?.nombre ?? "")
                    // Medio de pago preferido del proveedor (solo al crear).
                    if (!fixed && p?.payment_method_id) form.setValue("medio", p.payment_method_id)
                    if (p && !form.getValues("nombre").trim()) form.setValue("nombre", p.nombre, { shouldValidate: true })
                    // Categoría por defecto del proveedor si aún no la escogió a mano.
                    const c = categoriaSugerida(p, cats)
                    if (c && (!catManual || !form.getValues("category_id"))) form.setValue("category_id", c)
                  }} />
              )} />
            </FormField>
```

El `ProviderSelect` deja de usarse directamente en este archivo: quita su import (`import { ProviderSelect } from "@/features/providers/provider-select"`), porque `PagarA` ya lo monta por dentro.

Si `FormField` no acepta `className`, envuelve el campo en `<div className="sm:col-span-2">` en vez de pasar la prop.

- [ ] **Step 5: Verificar que compila y que el lint pasa**

```bash
pnpm typecheck && pnpm lint
```

Esperado: 0 errores. Si el lint se queja del import sin usar de `ProviderSelect`, bórralo.

- [ ] **Step 6: Probarlo a mano**

```bash
pnpm dev
```

Abre `http://localhost:55300/fijos`, toca **Agregar gasto fijo** y comprueba: por defecto está en «No hace falta»; «Una persona» muestra el combo de contactos y deja crear una; «Negocio o empresa» muestra el selector de proveedores y sigue completando nombre, categoría y medio.

- [ ] **Step 7: Commit**

```bash
git add apps/web/features/fixed/fixed-form.tsx
git commit -m "feat(fijos): el gasto fijo se le puede pagar a un negocio o a una persona"
```

---

### Task 5: Referencia del pago

**Files:**
- Modify: `apps/web/features/fixed/fixed-form.tsx` (schema, defaultValues, onSubmit, campo nuevo)
- Modify: `apps/web/features/fixed/pay-fixed-dialog.tsx` (mostrarla con botón Copiar)

**Interfaces:**
- Consumes: `fixed_expenses.referencia` (Task 1); `providers.referencia` (ya existe).
- Produces: `FixedRow.referencia` disponible para la lista y el diálogo de pago.

- [ ] **Step 1: Campo en el schema y en los valores por defecto**

En `fixed-form.tsx`, en `const schema`:

```ts
  referencia: z.string(),
```

En `defaultValues`:

```ts
      referencia: fixed?.referencia ?? "",
```

En `onSubmit`, dentro de `const o = { … }`:

```ts
      referencia: (v.referencia ?? "").trim(),
```

- [ ] **Step 2: Pre-llenarla desde el proveedor**

Dentro del `onProvider` que agregaste en la Task 4, después de `form.setValue("proveedor", p?.nombre ?? "")`:

```tsx
                    // La referencia del negocio solo si todavía no escribió una (puedes tener dos contratos con la misma inmobiliaria).
                    if (p?.referencia && !form.getValues("referencia").trim()) form.setValue("referencia", p.referencia)
```

- [ ] **Step 3: El campo en la UI**

Después del `FormField` de «¿A quién le pagas?», agrega:

```tsx
            <FormField label="Número de cuenta, contrato o referencia (opcional)" htmlFor="f-ref"
              tip="El número con el que pagas: la cuenta de Enel, el contrato del arriendo, el código del colegio. Te lo mostramos al registrar el pago para que no tengas que buscarlo.">
              <Input id="f-ref" className="h-11" placeholder="Ej. 123456789" {...form.register("referencia")} />
            </FormField>
```

- [ ] **Step 4: Mostrarla al pagar, con botón Copiar**

En `apps/web/features/fixed/pay-fixed-dialog.tsx`, dentro de `PayBody`, antes del primer `FormField` del formulario:

```tsx
      {!!fixed.referencia && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 text-sm">
          <span className="min-w-0"><span className="text-muted-foreground">Referencia: </span><span className="font-semibold break-all">{fixed.referencia}</span></span>
          <Button type="button" variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(fixed.referencia); toast.success("Referencia copiada") }}>Copiar</Button>
        </div>
      )}
```

`Button` y `toast` ya están importados en ese archivo.

- [ ] **Step 5: Mostrarla en la lista**

En `apps/web/features/fixed/fixed-view.tsx`, en el `subtitle` del `ListRow` (línea ~143), agrega `f.referencia && \`ref. ${f.referencia}\`` al arreglo antes de `.filter(Boolean)`:

```tsx
              subtitle={[cat?.nombre, FFREC[f.frec], next && `próximo: ${fmtDate(next.due)}${q}`, f.proveedor, f.referencia && `ref. ${f.referencia}`, paraQuien(f, members)].filter(Boolean).join(" · ")}
```

- [ ] **Step 6: Verificar**

```bash
pnpm typecheck && pnpm lint
```

Esperado: 0 errores.

- [ ] **Step 7: Commit**

```bash
git add apps/web/features/fixed/fixed-form.tsx apps/web/features/fixed/pay-fixed-dialog.tsx apps/web/features/fixed/fixed-view.tsx
git commit -m "feat(fijos): referencia del pago, con botón copiar al registrar el pago"
```

---

### Task 6: Moneda del gasto fijo

**Files:**
- Modify: `apps/web/features/fixed/fixed-form.tsx` (schema, defaultValues, onSubmit, campo y nota de conversión)

**Interfaces:**
- Consumes: `fixed_expenses.currency` (ya existía); `CURRENCY_OPTIONS` de `@/features/catalogs/hooks`; `book_settings.trm` vía `useSettings()`.
- Produces: el fijo se guarda con su moneda; `fijoMensual` ya la convierte.

- [ ] **Step 1: Campo en el schema y valores por defecto**

En `const schema`:

```ts
  currency: z.string(),
```

En `defaultValues`:

```ts
      currency: fixed?.currency ?? "COP",
```

En `onSubmit`, dentro de `const o = { … }`:

```ts
      currency: v.currency,
```

- [ ] **Step 2: Importar las opciones**

En el import que ya trae `categoryOptions, methodOptions, …` de `@/features/catalogs/hooks`, agrega `CURRENCY_OPTIONS`.

- [ ] **Step 3: El selector y la nota de conversión**

Justo después del bloque de valor (el `FormField` de «Valor» / «Lo mínimo que pagas»), agrega:

```tsx
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="Moneda" htmlFor="f-moneda" tip="Si pagas en dólares o euros, guárdalo en su moneda: Mirai lo convierte a pesos con la tasa que tengas en Ajustes › Finanzas.">
              <Controller control={form.control} name="currency" render={({ field }) => <Combobox id="f-moneda" value={field.value} onChange={(v) => field.onChange(v || "COP")} options={CURRENCY_OPTIONS} />} />
            </FormField>
            {w.currency !== "COP" && (
              <FormField label="En pesos">
                {trmDe(w.currency)
                  ? <p className="text-sm text-muted-foreground">≈ <span className="font-semibold" data-money>{fmtMoney(Math.round((w.tipoValor === "rango" ? (w.vmin + w.vmax) / 2 : w.valor) * trmDe(w.currency)))}</span> al mes, con la tasa que tienes guardada.</p>
                  : <p className="text-sm text-muted-foreground">Todavía no tienes la tasa de {w.currency}. Guárdala en <Link href="/ajustes?tab=finanzas" className="underline">Ajustes › Finanzas</Link> para ver el equivalente en pesos.</p>}
              </FormField>
            )}
          </div>
```

Agrega el import de `Link`:

```ts
import Link from "next/link"
```

Y, junto a las otras constantes del cuerpo del formulario (después de `const defs = …`), el ayudante:

```ts
  // Tasa guardada para una moneda (Ajustes › Finanzas). 0 = todavía no la tiene.
  const trm = (cfg?.trm ?? {}) as Record<string, number>
  const trmDe = (c: string) => (c && c !== "COP" ? +trm[c] || 0 : 0)
```

- [ ] **Step 4: Que el valor se escriba con la moneda**

En los tres `MoneyInput` de valor (`f-valor`, `f-vmin`, `f-vmax`), agrega `currency={w.currency} decimals` — igual que hace `subscription-form.tsx:83`. Ejemplo para el primero:

```tsx
              <Controller control={form.control} name="valor" render={({ field }) => <MoneyInput id="f-valor" value={field.value} onChange={field.onChange} currency={w.currency} decimals />} />
```

- [ ] **Step 5: Verificar**

```bash
pnpm typecheck && pnpm lint
```

Esperado: 0 errores. Si `useSettings()` no expone `trm`, míralo en `packages/domain/src/book-data.ts:74` y usa el nombre real del campo.

- [ ] **Step 6: Commit**

```bash
git add apps/web/features/fixed/fixed-form.tsx
git commit -m "feat(fijos): escoger la moneda del gasto fijo y ver el equivalente en pesos"
```

---

### Task 7: «Hasta cuándo lo pagas» y aviso propio en el formulario

**Files:**
- Modify: `apps/web/features/fixed/fixed-form.tsx` (schema con validación cruzada, defaultValues, onSubmit, dos campos)

**Interfaces:**
- Consumes: `fixed_expenses.hasta` y `.aviso` (Task 1); el corte del dominio (Task 2) y el aviso (Task 3).
- Produces: el fijo se guarda con `hasta` y `aviso`.

- [ ] **Step 1: Schema con la validación cruzada**

En `const schema = z.object({ … })` agrega:

```ts
  hasta: z.string().nullable(),
  aviso: z.number().int().min(0).max(100).nullable(),
```

y cierra el `z.object({…})` con un `.refine` (va **después** del objeto, antes del `)` final del `const schema`):

```ts
}).refine((v) => !v.hasta || !v.prox || v.hasta >= v.prox, {
  path: ["hasta"],
  message: "La fecha de fin no puede ser antes del próximo pago",
})
```

Ojo: con `.refine`, `type Values = z.infer<typeof schema>` sigue funcionando igual.

- [ ] **Step 2: Valores por defecto y guardado**

En `defaultValues`:

```ts
      hasta: fixed?.hasta ?? null,
      aviso: fixed?.aviso ?? null,
```

En `onSubmit`, dentro de `const o = { … }`:

```ts
      hasta: v.hasta || null,
      aviso: v.aviso == null || Number.isNaN(v.aviso) ? null : Math.max(0, Math.min(100, Math.round(v.aviso))),
```

- [ ] **Step 3: Los dos campos en la UI**

Después del bloque de «¿Cada cuánto?» / «Próximo pago», agrega:

```tsx
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="¿Hasta cuándo lo pagas? (opcional)" htmlFor="f-hasta" error={errors.hasta?.message}
              tip="Si el pago tiene fin (un plan a 12 meses, un contrato que se vence, un crédito), pon la última fecha: después de ese día dejamos de pedírtelo y de contarlo en tus cuentas. Déjalo vacío si no se acaba."
              hint={w.hasta ? "Después de esa fecha no te lo volvemos a cobrar ni lo sumamos al mes." : undefined}>
              <Controller control={form.control} name="hasta" render={({ field }) => (
                <DatePicker id="f-hasta" value={field.value ?? undefined} onChange={(v) => field.onChange(v ?? null)} quick="futuro" />
              )} />
            </FormField>
            <FormField label="Avisarme con (opcional)" htmlFor="f-aviso"
              tip="Con cuántos días de anticipación te recordamos este pago. Si lo dejas vacío usamos el que tienes en Ajustes › Alertas para todos."
              error={errors.aviso?.message}>
              <div className="flex items-center gap-2">
                <Input id="f-aviso" className="h-11 w-24" type="number" min={0} max={100} placeholder={String(cfg?.anticipo ?? 5)}
                  {...form.register("aviso", { setValueAs: (x) => (x === "" || x == null ? null : Number(x)) })} />
                <span className="text-sm text-muted-foreground">días antes</span>
              </div>
            </FormField>
          </div>
```

Si `DatePicker` no acepta `undefined` en `value`, usa `value={field.value ?? ""}`; mira su firma en `apps/web/components/mirai/date-picker.tsx` antes de escribirlo.

- [ ] **Step 4: Verificar**

```bash
pnpm typecheck && pnpm lint
```

Esperado: 0 errores.

- [ ] **Step 5: Probarlo a mano**

Con `pnpm dev`, crea un fijo mensual con fecha de fin el mes pasado y confirma que no pide pagos; otro con aviso 15 y mira que la lista lo marque «por vencer» antes que a los demás.

- [ ] **Step 6: Commit**

```bash
git add apps/web/features/fixed/fixed-form.tsx
git commit -m "feat(fijos): fecha de fin y días de aviso propios en el formulario"
```

---

### Task 8: La lista de gastos fijos muestra lo nuevo

**Files:**
- Modify: `apps/web/features/fixed/fixed-view.tsx:52-62` (filas y KPI), `:76-86` (columnas), `:104-120` (vistas y filtros), `:128-140` (píldoras)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: columna «Pagado a», vista «Terminados», píldora «termina el …», KPI que no cuenta los terminados.

- [ ] **Step 1: Traer los contactos y calcular si terminó**

En `FixedView`, junto a `const { data: providers = [] } = useProviders()`:

```ts
  const { data: contacts = [] } = useContacts()
```

Agrega `useContacts` al import de `@/features/catalogs/hooks`.

En el `rows` (línea ~52), agrega el campo `fin` al objeto que se devuelve:

```ts
  const rows: R[] = fixed.map((f) => {
    const st = fijoStatus(f as unknown as FixedExpenseIn, today)
    const next = st.venc[0] ?? st.prox
    const fin = !!f.hasta && f.hasta < today
    const av = f.aviso ?? anticipo
    const estado = st.venc.length ? "vencido" : fin || !next ? "aldia" : daysBetween(today, next.due) <= av ? "pronto" : "luego"
    return { f, st, next, estado, fin }
  })
```

y en el tipo `R` (línea 28) agrega `fin: boolean`.

- [ ] **Step 2: Que los KPI no cuenten los terminados**

En el cálculo de `k` (línea ~55), cambia el total:

```ts
    return { total: fijosMes(fixed as unknown as FixedExpenseIn[], book?.settings.trm, today), pend, pagado, venc, pronto: rows.filter((r) => r.estado === "pronto").length }
```

y filtra los terminados en `pend` (un fijo que ya terminó no genera periodos, así que `st.periods` ya viene vacío: no hay nada más que hacer).

- [ ] **Step 3: «Pagado a» en vez de «Proveedor»**

Agrega el ayudante al final del archivo, junto a `paraQuien`:

```ts
/** A quién se le paga el fijo: el negocio (Proveedores) o la persona (Contactos). */
function pagadoA(f: FixedRow, providers: { id: string; nombre: string }[], contacts: { id: string; nombre: string }[]): string {
  if (f.provider_id) return providers.find((p) => p.id === f.provider_id)?.nombre ?? f.proveedor ?? ""
  if (f.contact_id) return contacts.find((c) => c.id === f.contact_id)?.nombre ?? ""
  return f.proveedor ?? ""
}
```

Cambia la columna (línea ~82):

```ts
    { id: "pagadoa", header: "Pagado a", csv: (r) => pagadoA(r.f, providers, contacts) },
```

el texto de búsqueda:

```ts
        search={{ placeholder: "Buscar gasto fijo", text: (r) => `${r.f.nombre} ${catOf(r.f)?.nombre ?? ""} ${pagadoA(r.f, providers, contacts)} ${r.f.referencia ?? ""} ${FFREC[r.f.frec]}` }}
```

y el subtítulo del `ListRow`, reemplazando `f.proveedor` por `pagadoA(f, providers, contacts)`.

El filtro «Proveedor» pasa a llamarse «Pagado a» pero sigue filtrando por `provider_id` (los contactos tienen su propia lista); cámbiale solo la etiqueta:

```ts
          { id: "prov", label: "Pagado a", options: catalogOptions(rows, providers, pick.prov, "Sin negocio"), match: catalogMatch(pick.prov) },
```

- [ ] **Step 4: Vista «Terminados» y píldora**

En `views` del `DataTable`, agrega al final:

```ts
          { id: "fin", label: "Terminados", match: (r) => r.fin, hint: "Gastos fijos con fecha de fin que ya pasó: no te los volvemos a cobrar." },
```

y en las vistas que listan los activos, excluye los terminados añadiendo `&& !r.fin` a `pend` y dejando «Todos» como está (para que no se pierdan).

En las `badges` del `ListRow`, antes de `{pill}`:

```tsx
                {f.hasta && <StatusPill tone={f.fin ? "gray" : "info"} hint={f.fin ? "Ya pasó la fecha de fin: no te lo volvemos a cobrar." : "Este gasto tiene fecha de fin."}>{f.fin ? "terminado" : `termina el ${fmtDate(f.hasta)}`}</StatusPill>}
```

Para que `f.fin` esté disponible ahí, el `item={({ f, st, next, estado, fin }) => …}` debe desestructurar también `fin`, y dentro usar `fin` en vez de `f.fin`.

- [ ] **Step 5: Verificar**

```bash
pnpm typecheck && pnpm lint && pnpm --filter web test
```

Esperado: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add apps/web/features/fixed/fixed-view.tsx
git commit -m "feat(fijos): la lista muestra a quién le pagas, la referencia y los terminados"
```

---

### Task 9: Prueba E2E

**Files:**
- Create: `apps/web/tests/e2e/f1-fijo-pagar-a.spec.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: la prueba que cubre el flujo completo.

- [ ] **Step 1: Escribir la prueba**

Crea `apps/web/tests/e2e/f1-fijo-pagar-a.spec.ts` (sigue el patrón de `f1-pagar-a.spec.ts`):

```ts
import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { admin } from "./qa"

// Agregar gasto fijo › "¿A quién le pagas?": una persona nueva queda en Contactos y en el fijo (contact_id).
// Además guarda referencia, moneda, fecha de fin y aviso propio, y al pagarlo el gasto hereda la persona.
test("gasto fijo: a quién le pagas, referencia, fin y aviso propio", async ({ page }, info) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  await login(page)
  const s = Date.now() % 100000
  const nombre = `Arriendo QA ${info.project.name} ${s}`, persona = `Arrendador QA ${s}`
  const sb = admin()
  try {
    await page.goto("/fijos")
    await page.getByRole("button", { name: "Agregar gasto fijo" }).first().click()
    const dlg = page.getByRole("dialog")
    await dlg.getByRole("textbox", { name: "Nombre" }).fill(nombre)
    await dlg.getByRole("textbox", { name: "Valor" }).fill("1500000")

    // A quién le pagas: una persona que todavía no existe.
    await expect(dlg.getByRole("radio", { name: "No hace falta" })).toHaveAttribute("aria-checked", "true")
    await dlg.getByRole("radio", { name: "Una persona" }).click()
    await dlg.getByRole("combobox", { name: "Persona a la que le pagaste" }).click()
    await page.getByPlaceholder("Buscar persona…").fill(persona)
    await page.getByRole("option", { name: new RegExp(`Agregar a.*${persona}`) }).click()
    await expect(page.getByText(`Agregamos a ${persona} a tus contactos`)).toBeVisible()

    await dlg.getByLabel(/Número de cuenta, contrato o referencia/).fill("CTR-9001")
    await dlg.getByLabel("Avisarme con").fill("15")
    await shot(page, "fijo-pagar-a", info.project.name)
    await dlg.getByRole("button", { name: "Guardar" }).click()
    await expect(page.getByText(`${nombre} guardado`)).toBeVisible()

    // Quedó en la lista con la persona y la referencia.
    const fila = page.locator("#main li", { hasText: nombre })
    await expect(fila.getByText(persona)).toBeVisible()
    await expect(fila.getByText("ref. CTR-9001")).toBeVisible()

    const { data } = await sb.from("fixed_expenses").select("id, contact_id, provider_id, referencia, aviso").eq("nombre", nombre).single()
    expect(data?.contact_id).toBeTruthy()
    expect(data?.provider_id).toBeNull()
    expect(data?.referencia).toBe("CTR-9001")
    expect(data?.aviso).toBe(15)

    // Al registrar el pago, el gasto hereda la persona.
    await fila.getByRole("button", { name: `Pagar ${nombre}` }).click()
    await expect(page.getByRole("dialog").getByText("CTR-9001")).toBeVisible()
    await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click()
    await expect(page.getByText(/Pago registrado|pagado/i).first()).toBeVisible()
    const { data: g } = await sb.from("expenses").select("contact_id").eq("fixed_expense_id", data!.id).limit(1).single()
    expect(g?.contact_id).toBe(data?.contact_id)
  } finally {
    const { data: f } = await sb.from("fixed_expenses").select("id").eq("nombre", nombre).limit(1).single()
    if (f?.id) {
      await sb.from("expenses").delete().eq("fixed_expense_id", f.id)
      await sb.from("fixed_expense_payments").delete().eq("fixed_expense_id", f.id)
      await sb.from("fixed_expenses").delete().eq("id", f.id)
    }
    await sb.from("contacts").delete().eq("nombre", persona)
  }
  expect(errs, errs.join("\n")).toEqual([])
})
```

Recuerda el gotcha de `admin()`: sus consultas son perezosas, siempre con `await`.

- [ ] **Step 2: Correrla**

```bash
pnpm e2e:local -- --grep "gasto fijo: a quién le pagas"
```

Esperado: PASS en escritorio (1366 px) y móvil (400 px). Si un selector no encuentra el campo, ajústalo contra el DOM real — no cambies el formulario para que la prueba pase.

- [ ] **Step 3: Revisar las capturas**

Mira `apps/web/tests/.out/fijo-pagar-a-*.png` en los dos tamaños: el formulario no debe tener scroll horizontal a 400 px ni texto cortado.

- [ ] **Step 4: Batería completa**

```bash
pnpm build && pnpm e2e:local
```

Esperado: todo en verde. El error React #418 solo se ve con `next build`, por eso esta corrida va sin `--dev`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/e2e/f1-fijo-pagar-a.spec.ts
git commit -m "test(e2e): gasto fijo pagado a una persona, con referencia y aviso propio"
```

---

## Cierre

Antes de dar la Parte A por terminada:

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm e2e:local` en verde.
- [ ] Capturas de `apps/web/tests/.out/` revisadas en escritorio y móvil.
- [ ] La migración está probada dos veces seguidas (idempotente).
- [ ] **Antes de desplegar:** `pnpm db:migrate:vps -- --pendientes` y luego `pnpm db:migrate:vps`, **antes** del push a `main` (`.agents/workflows/deploy-vps.md`).

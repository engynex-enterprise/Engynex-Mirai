"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { Combobox } from "@/components/mirai/combobox"
import { EntityLogo } from "@/components/mirai/entity-logo"
import { BrandLogo } from "@/components/mirai/brand-logo"
import { brandFor } from "@/lib/brands"
import { MoneyAutosave } from "@/components/mirai/money-autosave"
import { IconButton } from "@/components/mirai/tip"
import { ListToolbar, NoResults, useListControls, type ListFilter, type ListSort } from "@/components/mirai/list-toolbar"
import { useCanEdit } from "@/components/app/app-context"
import { useList, useSave, useSoftDelete } from "@/hooks/use-book-data"
import { ICON_OPTIONS } from "@/features/catalogs/category-dialog"
import { useCategories, useEntities, useSettings } from "@/features/catalogs/hooks"
import { ENTITY_TIPOS, entityIcon, findEntity, norm } from "@/lib/domain"
import type { Row } from "@/lib/supabase/tables"
import { cn } from "@/lib/utils"
import { toast } from "@/components/mirai/toast"
import { SettingSection } from "../ui"
import { useBookSettingsSave } from "../prefs"
import { AddRow, TextBlur } from "./catalog-ui"
import { Reglas } from "./reglas"

type Kind = "cats" | "ings" | "ents" | "medios" | "rels" | "reglas"
const GRUPOS = [{ value: "n", label: "Necesidad", icon: "house" }, { value: "g", label: "Gusto", icon: "coffee" }, { value: "a", label: "Ahorro", icon: "piggy-bank" }]
const TIPOS_ENT = ENTITY_TIPOS.map((t) => ({ value: t, label: t }))
/** La barra de búsqueda aparece cuando la lista ya no cabe de un vistazo. */
const TOOLBAR_FROM = 6

const same = (a: string, b: string) => norm(a) === norm(b)
const byName = <T extends { nombre: string }>(a: T, b: T) => a.nombre.localeCompare(b.nombre, "es")

/** Conteo debajo del título: "12 categorías". */
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

// ——— Categorías de gastos ———
type Cat = Row<"categories">
const CAT_FILTERS: ListFilter<Cat>[] = [
  { value: "todas", label: "Todas" },
  ...GRUPOS.map((g) => ({ value: g.value, label: g.label, icon: g.icon, match: (c: Cat) => c.grupo === g.value })),
]
const CAT_SORTS: ListSort<Cat>[] = [
  { value: "orden", label: "Orden guardado", by: () => 0 },
  { value: "nombre", label: "Nombre (A-Z)", by: byName },
  { value: "tope", label: "Tope más alto", by: (a, b) => Number(b.tope ?? 0) - Number(a.tope ?? 0) },
]
const catText = (c: Cat) => c.nombre

function Categorias() {
  const { data, isPending } = useCategories()
  const save = useSave("categories")
  const del = useSoftDelete("categories", "Categoría eliminada")
  const can = useCanEdit()
  const [grupo, setGrupo] = useState("g")
  const c = useListControls(data, { text: catText, filters: CAT_FILTERS, sorts: CAT_SORTS })
  if (isPending) return <Skeleton className="h-80 rounded-lg" />
  return (
    <SettingSection icon="tag" title="Categorías de gastos" desc={<>El tope mensual alimenta el presupuesto y los avisos. {count(data?.length ?? 0, "categoría", "categorías")}.</>}>
      <AddRow placeholder="Nueva categoría (ej. Mascotas)" disabled={!can} taken={(n) => !!data?.some((x) => same(x.nombre, n))}
        extra={<div className="sm:w-40"><Combobox value={grupo} onChange={setGrupo} options={GRUPOS} /></div>}
        onAdd={(nombre) => save.mutateAsync({ nombre, grupo, icon: "tag", sort: (data?.length ?? 0) + 1 } as never)} />
      {(data?.length ?? 0) >= TOOLBAR_FROM && <ListToolbar c={c} placeholder="Buscar categoría" filters={CAT_FILTERS} sorts={CAT_SORTS} className="pt-4" />}
      {!c.rows.length && c.filtered ? <div className="pt-4"><NoResults c={c} /></div> : (
        <ul className="grid pt-2" aria-label="Categorías">
          <li className="hidden grid-cols-[10rem_1fr_9rem_11rem_2.25rem] gap-2 px-0.5 pt-2 text-xs font-semibold text-muted-foreground sm:grid" aria-hidden>
            <span>Ícono</span><span>Nombre</span><span>Tipo</span><span>Tope al mes</span><span />
          </li>
          {c.rows.map((x) => (
            <li key={x.id} className="grid grid-cols-[3rem_1fr_auto] items-center gap-2 border-b py-2 last:border-0 sm:grid-cols-[10rem_1fr_9rem_11rem_2.25rem]">
              <div className="w-full sm:w-40"><Combobox value={x.icon} onChange={(v) => save.mutate({ id: x.id, icon: v } as never)} options={ICON_OPTIONS} disabled={!can} /></div>
              <TextBlur label={`Nombre de ${x.nombre}`} value={x.nombre} disabled={!can} onSave={(v) => save.mutate({ id: x.id, nombre: v } as never)} />
              <IconButton icon="trash-2" destructive label={`Eliminar ${x.nombre}`} className="sm:order-last" disabled={!can} onClick={() => del.mutate(x)} />
              <div className="col-span-3 sm:col-span-1"><Combobox value={x.grupo} onChange={(v) => save.mutate({ id: x.id, grupo: v } as never)} options={GRUPOS} disabled={!can} /></div>
              <div className="col-span-3 sm:col-span-1"><MoneyAutosave value={Number(x.tope ?? 0)} placeholder="Sin tope" onSave={(v) => save.mutate({ id: x.id, tope: v } as never)} /></div>
            </li>
          ))}
        </ul>
      )}
    </SettingSection>
  )
}

// ——— Tipos de ingreso y medios de pago ———
type Named = { id: string; nombre: string; icon: string; asset_id?: string | null }
const SIMPLE_SORTS: ListSort<Named>[] = [{ value: "orden", label: "Orden guardado", by: () => 0 }, { value: "nombre", label: "Nombre (A-Z)", by: byName }]
const namedText = (x: Named) => x.nombre

/** Cuenta de la que sale la plata de un medio de pago (las cuentas de dinero del Balance). */
function CuentaDeMedio({ x, can, onSave }: { x: Named; can: boolean; onSave: (asset: string | null) => void }) {
  const { data: assets = [] } = useList("assets")
  const opts = [{ value: "", label: "Sin cuenta", icon: "minus" }, ...assets.filter((a) => /^11/.test(a.cod)).map((a) => ({ value: a.id, label: a.nombre, icon: "landmark", hint: a.saldo_base != null ? "Saldo automático" : undefined }))]
  const pick = (v: string) => {
    onSave(v || null)
    const a = assets.find((y) => y.id === v)
    if (a && a.saldo_base == null) toast("Medio ligado a " + a.nombre, { description: "Para que su saldo suba y baje solo, en el Balance toca la cuenta y activa «Que el saldo se actualice solo»." })
  }
  return <Combobox value={x.asset_id ?? ""} onChange={pick} options={opts} disabled={!can} aria-label={`Cuenta de ${x.nombre}`} />
}

function Simple({ table, title, icon, placeholder, defIcon, desc, one, many }: {
  table: "income_categories" | "payment_methods"; title: string; icon: string; placeholder: string; defIcon: string; desc: string; one: string; many: string
}) {
  const cuentas = table === "payment_methods"
  const q = useList(table, { order: { column: "sort" } })
  const save = useSave(table)
  const del = useSoftDelete(table, "Eliminado")
  const can = useCanEdit()
  const rows = q.data as Named[] | undefined
  const c = useListControls(rows, { text: namedText, sorts: SIMPLE_SORTS })
  if (q.isPending) return <Skeleton className="h-64 rounded-lg" />
  return (
    <SettingSection icon={icon} title={title} desc={`${desc} ${count(rows?.length ?? 0, one, many)}.`}>
      <AddRow placeholder={placeholder} disabled={!can} taken={(n) => !!rows?.some((x) => same(x.nombre, n))}
        onAdd={(nombre) => save.mutateAsync({ nombre, icon: defIcon, sort: (rows?.length ?? 0) + 1 } as never)} />
      {(rows?.length ?? 0) >= TOOLBAR_FROM && <ListToolbar c={c} placeholder={`Buscar ${one}`} sorts={SIMPLE_SORTS} className="pt-4" />}
      {!c.rows.length && c.filtered ? <div className="pt-4"><NoResults c={c} /></div> : (
        <ul className="grid pt-2" aria-label={title}>
          {cuentas && <li className="hidden grid-cols-[10rem_1fr_13rem_2.25rem] gap-2 px-0.5 pt-2 text-xs font-semibold text-muted-foreground sm:grid" aria-hidden><span>Ícono</span><span>Nombre</span><span>Sale de la cuenta</span><span /></li>}
          {c.rows.map((x) => (
            <li key={x.id} className={cn("grid grid-cols-[3rem_1fr_auto] items-center gap-2 border-b py-2 last:border-0", cuentas ? "sm:grid-cols-[10rem_1fr_13rem_2.25rem]" : "sm:grid-cols-[10rem_1fr_auto]")}>
              <Combobox value={x.icon} onChange={(v) => save.mutate({ id: x.id, icon: v } as never)} options={ICON_OPTIONS} disabled={!can} />
              <div className="flex min-w-0 items-center gap-2.5">
                {cuentas && brandFor(x.nombre) && <BrandLogo k={brandFor(x.nombre)!} size={32} />}
                <div className="min-w-0 flex-1"><TextBlur label={`Nombre de ${x.nombre}`} value={x.nombre} disabled={!can} onSave={(v) => save.mutate({ id: x.id, nombre: v } as never)} /></div>
              </div>
              <IconButton icon="trash-2" destructive label={`Eliminar ${x.nombre}`} className={cuentas ? "sm:order-last" : undefined} disabled={!can} onClick={() => del.mutate(x as never)} />
              {cuentas && <div className="col-span-3 sm:col-span-1"><CuentaDeMedio x={x} can={can} onSave={(asset) => save.mutate({ id: x.id, asset_id: asset } as never)} /></div>}
            </li>
          ))}
        </ul>
      )}
    </SettingSection>
  )
}

// ——— Bancos y entidades ———
type Ent = Row<"entities">
const ENT_FILTERS: ListFilter<Ent>[] = [{ value: "todas", label: "Todas" }, ...TIPOS_ENT.map((t) => ({ value: t.value, label: t.label, match: (e: Ent) => e.tipo === t.value }))]
const ENT_SORTS: ListSort<Ent>[] = [{ value: "nombre", label: "Nombre (A-Z)", by: byName }, { value: "tipo", label: "Tipo", by: (a, b) => a.tipo.localeCompare(b.tipo, "es") || byName(a, b) }]
const entText = (e: Ent) => `${e.nombre} ${e.nit ?? ""} ${e.tipo}`

function Entidades() {
  const { data, isPending } = useEntities()
  const save = useSave("entities")
  const del = useSoftDelete("entities", "Entidad eliminada")
  const can = useCanEdit()
  const [tipo, setTipo] = useState("Banco")
  const c = useListControls(data, { text: entText, filters: ENT_FILTERS, sorts: ENT_SORTS })
  if (isPending) return <Skeleton className="h-64 rounded-lg" />
  return (
    <SettingSection icon="landmark" title="Bancos y entidades" desc={`Bancos, cooperativas, fintech, billeteras, fondos y casas de empeño donde tienes cuentas o créditos (también en Contactos › Bancos y entidades). ${count(data?.length ?? 0, "entidad", "entidades")}.`}>
      <AddRow placeholder="Nueva entidad (ej. Bancolombia)" disabled={!can} taken={(n) => !!findEntity(data ?? [], { nombre: n })}
        extra={<div className="sm:w-40"><Combobox value={tipo} onChange={setTipo} options={TIPOS_ENT} /></div>}
        onAdd={(nombre) => save.mutateAsync({ nombre, tipo } as never)} />
      {(data?.length ?? 0) >= TOOLBAR_FROM && <ListToolbar c={c} placeholder="Buscar por nombre o NIT" filters={ENT_FILTERS} sorts={ENT_SORTS} className="pt-4" />}
      {!c.rows.length && c.filtered ? <div className="pt-4"><NoResults c={c} /></div> : (
        <ul className="grid pt-2" aria-label="Entidades">
          {c.rows.map((x) => (
            <li key={x.id} className="grid grid-cols-[1fr_auto] items-center gap-2 border-b py-2 last:border-0 sm:grid-cols-[1fr_10rem_10rem_auto]">
              <div className="flex min-w-0 items-center gap-2.5">
                <EntityLogo name={x.nombre} icon={entityIcon(x.tipo)} seed={x.nombre} size={32} />
                <div className="min-w-0 flex-1"><TextBlur label={`Nombre de ${x.nombre}`} value={x.nombre} disabled={!can} onSave={(v) => save.mutate({ id: x.id, nombre: v } as never)} /></div>
              </div>
              <IconButton icon="trash-2" destructive label={`Eliminar ${x.nombre}`} className="sm:order-last" disabled={!can} onClick={() => del.mutate(x)} />
              <div className="col-span-2 sm:col-span-1"><Combobox value={x.tipo} onChange={(v) => save.mutate({ id: x.id, tipo: v } as never)} options={TIPOS_ENT} disabled={!can} /></div>
              <div className="col-span-2 sm:col-span-1"><TextBlur label={`NIT de ${x.nombre}`} placeholder="NIT (opcional)" value={x.nit || ""} disabled={!can} onSave={(v) => save.mutate({ id: x.id, nit: v } as never)} /></div>
            </li>
          ))}
        </ul>
      )}
    </SettingSection>
  )
}

// ——— Relaciones ———
function Relaciones() {
  const { data: cfg } = useSettings()
  const save = useBookSettingsSave()
  const can = useCanEdit()
  if (!cfg) return <Skeleton className="h-40 rounded-lg" />
  const rels = cfg.relaciones ?? []
  return (
    <SettingSection icon="users" title="Relaciones" desc={`Cómo conoces a tus contactos (para préstamos y cobros). ${count(rels.length, "relación", "relaciones")}.`}>
      <AddRow placeholder="Nueva relación (ej. Primo)" disabled={!can} taken={(n) => rels.some((r) => same(r, n))} onAdd={(n) => save.mutateAsync({ relaciones: [...rels, n] })} />
      <ul className="flex flex-wrap gap-2 pt-4" aria-label="Relaciones">
        {rels.map((r) => (
          <li key={r} className="inline-flex h-8 items-center gap-1 rounded-full bg-secondary pr-1 pl-3 text-sm font-medium">{r}
            <button type="button" disabled={!can} aria-label={`Quitar ${r}`} title={`Quitar ${r}`} className="grid size-6 place-items-center rounded-full outline-none hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40" onClick={() => save.mutate({ relaciones: rels.filter((x) => x !== r) })}><X className="size-3.5" /></button>
          </li>
        ))}
      </ul>
    </SettingSection>
  )
}

export function CatalogTab({ kind }: { kind: Kind }) {
  switch (kind) {
    case "cats": return <Categorias />
    case "ings": return <Simple key="ings" table="income_categories" title="Tipos de ingreso" icon="arrow-down-to-line" placeholder="Nuevo tipo (ej. Arriendos)" defIcon="coins" desc="Así agrupas lo que te entra." one="tipo" many="tipos" />
    case "medios": return <Simple key="medios" table="payment_methods" title="Medios de pago" icon="credit-card" placeholder="Nuevo medio (ej. Nequi)" defIcon="banknote" desc="Con qué pagas tus gastos. Si eliges la cuenta de la que sale la plata (del Balance), su saldo sube y baja solo con lo que registras con ese medio." one="medio" many="medios" />
    case "ents": return <Entidades />
    case "rels": return <Relaciones />
    case "reglas": return <Reglas />
  }
}

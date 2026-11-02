"use client"

import { useState } from "react"
import { Plus, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Combobox } from "@/components/mirai/combobox"
import { Icon } from "@/components/mirai/icon"
import { EntityLogo } from "@/components/mirai/entity-logo"
import { MoneyAutosave } from "@/components/mirai/money-autosave"
import { SubmitButton } from "@/components/mirai/submit-button"
import { IconButton } from "@/components/mirai/tip"
import { ListToolbar, NoResults, useListControls, type ListFilter, type ListSort } from "@/components/mirai/list-toolbar"
import { useCanEdit } from "@/components/app/app-context"
import { useList, useSave, useSoftDelete } from "@/hooks/use-book-data"
import { ICON_OPTIONS } from "@/features/catalogs/category-dialog"
import { categoryOptions, useCategories, useEntities, useKeywordRules, useSettings } from "@/features/catalogs/hooks"
import { norm } from "@/lib/domain"
import type { Row } from "@/lib/supabase/tables"
import { SettingSection } from "../ui"
import { useBookSettingsSave } from "../prefs"

type Kind = "cats" | "ings" | "ents" | "medios" | "rels" | "reglas"
const GRUPOS = [{ value: "n", label: "Necesidad", icon: "house" }, { value: "g", label: "Gusto", icon: "coffee" }, { value: "a", label: "Ahorro", icon: "piggy-bank" }]
const TIPOS_ENT = ["Banco", "Cooperativa", "Fintech", "Billetera", "Fondo", "Otro"].map((t) => ({ value: t, label: t }))
/** La barra de búsqueda aparece cuando la lista ya no cabe de un vistazo. */
const TOOLBAR_FROM = 6

const same = (a: string, b: string) => norm(a) === norm(b)
const byName = <T extends { nombre: string }>(a: T, b: T) => a.nombre.localeCompare(b.nombre, "es")

/** Texto que guarda al salir (edición en línea). */
function TextBlur({ value, onSave, label, className, disabled, placeholder }: { value: string; onSave: (v: string) => void; label: string; className?: string; disabled?: boolean; placeholder?: string }) {
  const [v, setV] = useState(value)
  const [prev, setPrev] = useState(value)
  if (prev !== value) { setPrev(value); setV(value) }
  return <Input aria-label={label} className={className ?? "h-10"} value={v} disabled={disabled} placeholder={placeholder} maxLength={60} onChange={(e) => setV(e.target.value)} onBlur={() => { const t = v.trim(); if (t && t !== value) onSave(t); else setV(value) }} />
}

/**
 * Fila para agregar: el botón Agregar queda inactivo hasta escribir un nombre nuevo (si ya existe lo dice ahí mismo)
 * y muestra "Agregando…" mientras guarda. Enter también agrega.
 */
function AddRow({ placeholder, onAdd, extra, disabled, taken, needsExtra }: {
  placeholder: string; onAdd: (nombre: string) => Promise<unknown> | void; extra?: React.ReactNode; disabled?: boolean
  /** Devuelve true si el nombre ya existe. */
  taken?: (nombre: string) => boolean
  /** Falta elegir algo en `extra` (p. ej. la categoría de una regla): texto del motivo. */
  needsExtra?: string | false
}) {
  const [n, setN] = useState("")
  const [busy, setBusy] = useState(false)
  const t = n.trim()
  const dup = !!t && !!taken?.(t)
  const ok = !!t && !dup && !needsExtra && !disabled
  const add = async () => {
    if (!ok || busy) return
    setBusy(true)
    // Si falla, el aviso lo muestra la mutación y el texto queda escrito para intentar de nuevo.
    try { await onAdd(t); setN("") } catch { /* aviso de la mutación */ }
    setBusy(false)
  }
  return (
    <div className="grid gap-1.5 border-b pb-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input className="h-10 flex-1" placeholder={placeholder} value={n} maxLength={60} disabled={disabled} aria-invalid={dup || undefined}
          onChange={(e) => setN(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add() } }} aria-label={placeholder} />
        {extra}
        <SubmitButton className="h-10" onClick={add} disabled={!ok} loading={busy} loadingText="Agregando…"
          hint={disabled ? "Tu rol no permite cambiar esta lista" : dup ? "Ese nombre ya existe" : needsExtra || "Escribe un nombre"}><Plus /> Agregar</SubmitButton>
      </div>
      {dup && <p className="text-xs text-danger" role="alert">“{t}” ya está en la lista.</p>}
    </div>
  )
}

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
type Named = { id: string; nombre: string; icon: string }
const SIMPLE_SORTS: ListSort<Named>[] = [{ value: "orden", label: "Orden guardado", by: () => 0 }, { value: "nombre", label: "Nombre (A-Z)", by: byName }]
const namedText = (x: Named) => x.nombre

function Simple({ table, title, icon, placeholder, defIcon, desc, one, many }: {
  table: "income_categories" | "payment_methods"; title: string; icon: string; placeholder: string; defIcon: string; desc: string; one: string; many: string
}) {
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
          {c.rows.map((x) => (
            <li key={x.id} className="grid grid-cols-[3rem_1fr_auto] items-center gap-2 border-b py-2 last:border-0 sm:grid-cols-[10rem_1fr_auto]">
              <Combobox value={x.icon} onChange={(v) => save.mutate({ id: x.id, icon: v } as never)} options={ICON_OPTIONS} disabled={!can} />
              <TextBlur label={`Nombre de ${x.nombre}`} value={x.nombre} disabled={!can} onSave={(v) => save.mutate({ id: x.id, nombre: v } as never)} />
              <IconButton icon="trash-2" destructive label={`Eliminar ${x.nombre}`} disabled={!can} onClick={() => del.mutate(x as never)} />
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
    <SettingSection icon="landmark" title="Bancos y entidades" desc={`Bancos, cooperativas, fintech, billeteras y fondos donde tienes cuentas o créditos. ${count(data?.length ?? 0, "entidad", "entidades")}.`}>
      <AddRow placeholder="Nueva entidad (ej. Bancolombia)" disabled={!can} taken={(n) => !!data?.some((x) => same(x.nombre, n))}
        extra={<div className="sm:w-40"><Combobox value={tipo} onChange={setTipo} options={TIPOS_ENT} /></div>}
        onAdd={(nombre) => save.mutateAsync({ nombre, tipo } as never)} />
      {(data?.length ?? 0) >= TOOLBAR_FROM && <ListToolbar c={c} placeholder="Buscar por nombre o NIT" filters={ENT_FILTERS} sorts={ENT_SORTS} className="pt-4" />}
      {!c.rows.length && c.filtered ? <div className="pt-4"><NoResults c={c} /></div> : (
        <ul className="grid pt-2" aria-label="Entidades">
          {c.rows.map((x) => (
            <li key={x.id} className="grid grid-cols-[1fr_auto] items-center gap-2 border-b py-2 last:border-0 sm:grid-cols-[1fr_10rem_10rem_auto]">
              <div className="flex min-w-0 items-center gap-2.5">
                <EntityLogo name={x.nombre} icon={x.tipo === "Billetera" ? "smartphone" : "landmark"} seed={x.nombre} size={32} />
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

// ——— Reglas de importación ———
type Rule = Row<"keyword_rules">
const RULE_SORTS: ListSort<Rule>[] = [{ value: "recientes", label: "Más recientes", by: () => 0 }, { value: "palabra", label: "Palabra (A-Z)", by: (a, b) => a.keyword.localeCompare(b.keyword, "es") }]

function Reglas() {
  const { data, isPending } = useKeywordRules()
  const { data: cats } = useCategories()
  const save = useSave("keyword_rules")
  const del = useSoftDelete("keyword_rules", "Regla eliminada")
  const can = useCanEdit()
  const [cat, setCat] = useState("")
  const catName = (id: string | null) => cats?.find((x) => x.id === id)?.nombre ?? ""
  const c = useListControls(data, { text: (r) => `${r.keyword} ${catName(r.category_id)}`, sorts: RULE_SORTS })
  if (isPending) return <Skeleton className="h-64 rounded-lg" />
  const opts = categoryOptions(cats)
  return (
    <SettingSection icon="file-up" title="Reglas de importación" desc="Si la descripción de un movimiento contiene la palabra, se le pone esa categoría (al importar extractos y al escribir gastos).">
      <AddRow placeholder="Si contiene… (ej. EXITO)" disabled={!can} needsExtra={!cat && "Elige la categoría"} taken={(k) => !!data?.some((r) => same(r.keyword, k))}
        extra={<div className="sm:w-56"><Combobox value={cat} onChange={setCat} options={opts} placeholder="Categoría" /></div>}
        onAdd={(keyword) => save.mutateAsync({ keyword: keyword.toLowerCase(), category_id: cat } as never)} />
      {!data?.length ? <p className="pt-4 text-sm text-muted-foreground">Aún no tienes reglas. También se crean solas cuando corriges la categoría de un gasto importado.</p> : (
        <>
          {data.length >= TOOLBAR_FROM && <ListToolbar c={c} placeholder="Buscar palabra o categoría" sorts={RULE_SORTS} className="pt-4" />}
          {!c.rows.length ? <div className="pt-4"><NoResults c={c} /></div> : (
            <ul className="grid pt-2" aria-label="Reglas">
              {c.rows.map((r) => (
                <li key={r.id} className="grid grid-cols-[1fr_auto] items-center gap-2 border-b py-2 last:border-0 sm:grid-cols-[1fr_auto_14rem_auto]">
                  <TextBlur label={`Palabra ${r.keyword}`} value={r.keyword} disabled={!can} onSave={(v) => save.mutate({ id: r.id, keyword: v.toLowerCase() } as never)} />
                  <IconButton icon="trash-2" destructive label={`Eliminar regla ${r.keyword}`} className="sm:order-last" disabled={!can} onClick={() => del.mutate({ id: r.id, nombre: r.keyword })} />
                  <Icon name="arrow-right" className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
                  <div className="col-span-2 sm:col-span-1"><Combobox value={r.category_id ?? ""} onChange={(v) => save.mutate({ id: r.id, category_id: v } as never)} options={opts} disabled={!can} /></div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </SettingSection>
  )
}

export function CatalogTab({ kind }: { kind: Kind }) {
  switch (kind) {
    case "cats": return <Categorias />
    case "ings": return <Simple key="ings" table="income_categories" title="Tipos de ingreso" icon="arrow-down-to-line" placeholder="Nuevo tipo (ej. Arriendos)" defIcon="coins" desc="Así agrupas lo que te entra." one="tipo" many="tipos" />
    case "medios": return <Simple key="medios" table="payment_methods" title="Medios de pago" icon="credit-card" placeholder="Nuevo medio (ej. Nequi)" defIcon="banknote" desc="Con qué pagas tus gastos." one="medio" many="medios" />
    case "ents": return <Entidades />
    case "rels": return <Relaciones />
    case "reglas": return <Reglas />
  }
}

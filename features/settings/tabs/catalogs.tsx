"use client"

import { useState } from "react"
import { Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Combobox } from "@/components/mirai/combobox"
import { Icon } from "@/components/mirai/icon"
import { MoneyAutosave } from "@/components/mirai/money-autosave"
import { useCanEdit } from "@/components/app/app-context"
import { useList, useSave, useSoftDelete } from "@/hooks/use-book-data"
import { ICON_OPTIONS } from "@/features/catalogs/category-dialog"
import { categoryOptions, useCategories, useEntities, useKeywordRules, useSettings } from "@/features/catalogs/hooks"
import { SettingSection } from "../ui"
import { useBookSettingsSave } from "../prefs"

type Kind = "cats" | "ings" | "ents" | "medios" | "rels" | "reglas"
const GRUPOS = [{ value: "n", label: "Necesidad", icon: "house" }, { value: "g", label: "Gusto", icon: "coffee" }, { value: "a", label: "Ahorro", icon: "piggy-bank" }]
const TIPOS_ENT = ["Banco", "Cooperativa", "Fintech", "Billetera", "Fondo", "Otro"].map((t) => ({ value: t, label: t }))

/** Texto que guarda al salir (edición en línea). */
function TextBlur({ value, onSave, label, className, disabled }: { value: string; onSave: (v: string) => void; label: string; className?: string; disabled?: boolean }) {
  const [v, setV] = useState(value)
  const [prev, setPrev] = useState(value)
  if (prev !== value) { setPrev(value); setV(value) }
  return <Input aria-label={label} className={className ?? "h-10"} value={v} disabled={disabled} maxLength={60} onChange={(e) => setV(e.target.value)} onBlur={() => { const t = v.trim(); if (t && t !== value) onSave(t); else setV(value) }} />
}

function AddRow({ placeholder, onAdd, extra, disabled }: { placeholder: string; onAdd: (nombre: string) => Promise<unknown> | void; extra?: React.ReactNode; disabled?: boolean }) {
  const [n, setN] = useState("")
  const add = async () => { const t = n.trim(); if (!t) return toast.error("Escribe un nombre"); await onAdd(t); setN("") }
  return (
    <div className="flex flex-col gap-2 border-b pb-4 sm:flex-row">
      <Input className="h-10 flex-1" placeholder={placeholder} value={n} maxLength={60} disabled={disabled} onChange={(e) => setN(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} aria-label={placeholder} />
      {extra}
      <Button className="h-10" onClick={add} disabled={disabled}><Plus /> Agregar</Button>
    </div>
  )
}

function Categorias() {
  const { data, isPending } = useCategories()
  const save = useSave("categories")
  const del = useSoftDelete("categories", "Categoría eliminada")
  const can = useCanEdit()
  const [grupo, setGrupo] = useState("g")
  if (isPending) return <Skeleton className="h-80" />
  return (
    <SettingSection icon="tag" title="Categorías de gastos" desc="El tope mensual alimenta el presupuesto y los avisos.">
      <AddRow placeholder="Nueva categoría (ej. Mascotas)" disabled={!can} extra={<div className="w-40"><Combobox value={grupo} onChange={setGrupo} options={GRUPOS} /></div>}
        onAdd={(nombre) => { if (data?.some((c) => c.nombre.toLowerCase() === nombre.toLowerCase())) return void toast.error("Ya existe"); return save.mutateAsync({ nombre, grupo, icon: "tag", sort: (data?.length ?? 0) + 1 } as never) }} />
      <ul className="grid">
        {data?.map((c) => (
          <li key={c.id} className="grid grid-cols-[3rem_1fr_auto] items-center gap-2 border-b py-2 last:border-0 sm:grid-cols-[10rem_1fr_9rem_11rem_auto]">
            <div className="w-full sm:w-40"><Combobox value={c.icon} onChange={(v) => save.mutate({ id: c.id, icon: v } as never)} options={ICON_OPTIONS} /></div>
            <TextBlur label={`Nombre de ${c.nombre}`} value={c.nombre} disabled={!can} onSave={(v) => save.mutate({ id: c.id, nombre: v } as never)} />
            <Button size="icon" variant="ghost" className="text-danger sm:order-last" aria-label={`Eliminar ${c.nombre}`} disabled={!can || c.id.startsWith("tmp-")} onClick={() => del.mutate(c)}><Trash2 /></Button>
            <div className="col-span-3 sm:col-span-1"><Combobox value={c.grupo} onChange={(v) => save.mutate({ id: c.id, grupo: v } as never)} options={GRUPOS} /></div>
            <div className="col-span-3 sm:col-span-1"><MoneyAutosave value={Number(c.tope ?? 0)} placeholder="Sin tope" onSave={(v) => save.mutate({ id: c.id, tope: v } as never)} /></div>
          </li>
        ))}
      </ul>
    </SettingSection>
  )
}

function Simple({ table, title, icon, placeholder, defIcon }: { table: "income_categories" | "payment_methods"; title: string; icon: string; placeholder: string; defIcon: string }) {
  const q = useList(table, { order: { column: "sort" } })
  const save = useSave(table)
  const del = useSoftDelete(table, "Eliminado")
  const can = useCanEdit()
  if (q.isPending) return <Skeleton className="h-64" />
  return (
    <SettingSection icon={icon} title={title}>
      <AddRow placeholder={placeholder} disabled={!can} onAdd={(nombre) => save.mutateAsync({ nombre, icon: defIcon, sort: (q.data?.length ?? 0) + 1 } as never)} />
      <ul className="grid">
        {q.data?.map((x) => (
          <li key={x.id} className="grid grid-cols-[3rem_1fr_auto] items-center gap-2 border-b py-2 last:border-0 sm:grid-cols-[10rem_1fr_auto]">
            <Combobox value={x.icon} onChange={(v) => save.mutate({ id: x.id, icon: v } as never)} options={ICON_OPTIONS} />
            <TextBlur label={`Nombre de ${x.nombre}`} value={x.nombre} disabled={!can} onSave={(v) => save.mutate({ id: x.id, nombre: v } as never)} />
            <Button size="icon" variant="ghost" className="text-danger" aria-label={`Eliminar ${x.nombre}`} disabled={!can || x.id.startsWith("tmp-")} onClick={() => del.mutate(x)}><Trash2 /></Button>
          </li>
        ))}
      </ul>
    </SettingSection>
  )
}

function Entidades() {
  const { data, isPending } = useEntities()
  const save = useSave("entities")
  const del = useSoftDelete("entities", "Entidad eliminada")
  const can = useCanEdit()
  const [tipo, setTipo] = useState("Banco")
  if (isPending) return <Skeleton className="h-64" />
  return (
    <SettingSection icon="landmark" title="Bancos y entidades" desc="Bancos, cooperativas, fintech, billeteras y fondos donde tienes cuentas o créditos.">
      <AddRow placeholder="Nueva entidad (ej. Bancolombia)" disabled={!can} extra={<div className="w-40"><Combobox value={tipo} onChange={setTipo} options={TIPOS_ENT} /></div>}
        onAdd={(nombre) => save.mutateAsync({ nombre, tipo } as never)} />
      <ul className="grid">
        {data?.map((x) => (
          <li key={x.id} className="grid grid-cols-[1fr_auto] items-center gap-2 border-b py-2 last:border-0 sm:grid-cols-[1fr_10rem_10rem_auto]">
            <TextBlur label={`Nombre de ${x.nombre}`} value={x.nombre} disabled={!can} onSave={(v) => save.mutate({ id: x.id, nombre: v } as never)} />
            <Button size="icon" variant="ghost" className="text-danger sm:order-last" aria-label={`Eliminar ${x.nombre}`} disabled={!can || x.id.startsWith("tmp-")} onClick={() => del.mutate(x)}><Trash2 /></Button>
            <div className="col-span-2 sm:col-span-1"><Combobox value={x.tipo} onChange={(v) => save.mutate({ id: x.id, tipo: v } as never)} options={TIPOS_ENT} /></div>
            <div className="col-span-2 sm:col-span-1"><TextBlur label={`NIT de ${x.nombre}`} value={x.nit || ""} disabled={!can} onSave={(v) => save.mutate({ id: x.id, nit: v } as never)} /></div>
          </li>
        ))}
      </ul>
    </SettingSection>
  )
}

function Relaciones() {
  const { data: cfg } = useSettings()
  const save = useBookSettingsSave()
  const can = useCanEdit()
  if (!cfg) return <Skeleton className="h-40" />
  const rels = cfg.relaciones ?? []
  return (
    <SettingSection icon="users" title="Relaciones" desc="Cómo conoces a tus contactos (para préstamos y cobros).">
      <AddRow placeholder="Nueva relación (ej. Primo)" disabled={!can} onAdd={(n) => { if (rels.some((r) => r.toLowerCase() === n.toLowerCase())) return void toast.error("Ya existe"); save.mutate({ relaciones: [...rels, n] }) }} />
      <div className="flex flex-wrap gap-2 pt-3">
        {rels.map((r) => (
          <span key={r} className="inline-flex h-8 items-center gap-1 rounded-full bg-muted pr-1 pl-3 text-sm">{r}
            <button type="button" disabled={!can} aria-label={`Quitar ${r}`} className="grid size-6 place-items-center rounded-full hover:bg-hover" onClick={() => save.mutate({ relaciones: rels.filter((x) => x !== r) })}><X className="size-3.5" /></button>
          </span>
        ))}
      </div>
    </SettingSection>
  )
}

function Reglas() {
  const { data, isPending } = useKeywordRules()
  const { data: cats } = useCategories()
  const save = useSave("keyword_rules")
  const del = useSoftDelete("keyword_rules", "Regla eliminada")
  const can = useCanEdit()
  const [cat, setCat] = useState("")
  if (isPending) return <Skeleton className="h-64" />
  const opts = categoryOptions(cats)
  return (
    <SettingSection icon="file-up" title="Reglas de importación" desc="Si la descripción de un movimiento contiene la palabra, se le pone esa categoría (al importar extractos y al escribir gastos).">
      <AddRow placeholder="Si contiene… (ej. EXITO)" disabled={!can} extra={<div className="w-56"><Combobox value={cat} onChange={setCat} options={opts} placeholder="Categoría" /></div>}
        onAdd={(keyword) => { if (!cat) return void toast.error("Elige la categoría"); return save.mutateAsync({ keyword: keyword.toLowerCase(), category_id: cat } as never) }} />
      {!data?.length && <p className="py-4 text-sm text-muted-foreground">Aún no tienes reglas. También se crean solas cuando corriges la categoría de un gasto importado.</p>}
      <ul className="grid">
        {data?.map((r) => (
          <li key={r.id} className="grid grid-cols-[1fr_auto] items-center gap-2 border-b py-2 last:border-0 sm:grid-cols-[1fr_auto_14rem_auto]">
            <TextBlur label={`Palabra ${r.keyword}`} value={r.keyword} disabled={!can} onSave={(v) => save.mutate({ id: r.id, keyword: v.toLowerCase() } as never)} />
            <Button size="icon" variant="ghost" className="text-danger sm:order-last" aria-label={`Eliminar regla ${r.keyword}`} disabled={!can || r.id.startsWith("tmp-")} onClick={() => del.mutate({ id: r.id, nombre: r.keyword })}><Trash2 /></Button>
            <Icon name="arrow-right" className="hidden size-4 text-muted-foreground sm:block" />
            <div className="col-span-2 sm:col-span-1"><Combobox value={r.category_id ?? ""} onChange={(v) => save.mutate({ id: r.id, category_id: v } as never)} options={opts} /></div>
          </li>
        ))}
      </ul>
    </SettingSection>
  )
}

export function CatalogTab({ kind }: { kind: Kind }) {
  switch (kind) {
    case "cats": return <Categorias />
    case "ings": return <Simple key="ings" table="income_categories" title="Tipos de ingreso" icon="arrow-down-to-line" placeholder="Nuevo tipo (ej. Arriendos)" defIcon="coins" />
    case "medios": return <Simple key="medios" table="payment_methods" title="Medios de pago" icon="credit-card" placeholder="Nuevo medio (ej. Nequi)" defIcon="banknote" />
    case "ents": return <Entidades />
    case "rels": return <Relaciones />
    case "reglas": return <Reglas />
  }
}

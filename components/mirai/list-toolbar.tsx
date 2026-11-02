"use client"

import { useMemo, useState } from "react"
import { ArrowDownUp, Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { norm } from "@/lib/domain"
import { cn } from "@/lib/utils"
import { Segmented } from "./choice-cards"

export type ListFilter<T> = { value: string; label: string; icon?: string; match?: (row: T) => boolean }
export type ListSort<T> = { value: string; label: string; by: (a: T, b: T) => number }

/**
 * Buscador + filtro + orden para listas en tarjetas (las que no encajan en <DataTable>). La lógica vive aquí para que
 * todas las listas filtren igual: búsqueda sin tildes ni mayúsculas, un filtro a la vez y un orden.
 */
export function useListControls<T>(rows: T[] | undefined, opts: { text?: (row: T) => string; filters?: ListFilter<T>[]; sorts?: ListSort<T>[] }) {
  const [q, setQ] = useState("")
  const [filter, setFilter] = useState(opts.filters?.[0]?.value ?? "")
  const [sort, setSort] = useState(opts.sorts?.[0]?.value ?? "")
  const { text, filters, sorts } = opts
  const out = useMemo(() => {
    let r = rows ?? []
    const f = filters?.find((x) => x.value === filter)
    if (f?.match) r = r.filter(f.match)
    if (text && q.trim()) { const n = norm(q.trim()); r = r.filter((x) => norm(text(x)).includes(n)) }
    const s = sorts?.find((x) => x.value === sort)
    if (s) r = [...r].sort(s.by)
    return r
  }, [rows, q, filter, sort, text, filters, sorts])
  const counts = useMemo(() => Object.fromEntries((filters ?? []).map((f) => [f.value, f.match ? (rows ?? []).filter(f.match).length : (rows ?? []).length])), [rows, filters])
  const clear = () => { setQ(""); setFilter(filters?.[0]?.value ?? "") }
  return { q, setQ, filter, setFilter, sort, setSort, rows: out, total: rows?.length ?? 0, counts, clear, filtered: !!q.trim() || filter !== (filters?.[0]?.value ?? "") }
}

type Controls<T> = ReturnType<typeof useListControls<T>>

/** Barra de la lista: buscador, chips de filtro (con conteo) y menú de orden. En celular se apila sin desbordar. */
export function ListToolbar<T>({ c, placeholder = "Buscar", filters, sorts, className, showCounts = true }: {
  c: Controls<T>; placeholder?: string; filters?: ListFilter<T>[]; sorts?: ListSort<T>[]; className?: string; showCounts?: boolean
}) {
  return (
    <div className={cn("grid gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input className="h-10 rounded-lg pl-10" placeholder={placeholder} aria-label={placeholder} value={c.q} onChange={(e) => c.setQ(e.target.value)} />
          {c.q && (
            <button type="button" aria-label="Borrar búsqueda" onClick={() => c.setQ("")} className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-full hover:bg-hover">
              <X className="size-4" />
            </button>
          )}
        </div>
        {sorts && sorts.length > 1 && (
          <Select value={c.sort} onValueChange={c.setSort}>
            <SelectTrigger className="h-10 w-auto min-w-44 rounded-lg" aria-label="Ordenar"><ArrowDownUp className="size-4 text-muted-foreground" /><SelectValue /></SelectTrigger>
            <SelectContent align="end">{sorts.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>
      {filters && filters.length > 1 && (
        <Segmented value={c.filter} onChange={c.setFilter}
          items={filters.map((f) => ({ value: f.value, icon: f.icon, label: showCounts ? `${f.label} (${c.counts[f.value] ?? 0})` : f.label }))} />
      )}
    </div>
  )
}

/** Mensaje cuando la búsqueda o el filtro no dejan nada, con botón para limpiar. */
export function NoResults<T>({ c, children = "No hay resultados con esa búsqueda o ese filtro." }: { c: Controls<T>; children?: React.ReactNode }) {
  return (
    <div className="grid justify-items-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center">
      <Search className="size-7 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">{children}</p>
      {c.filtered && <button type="button" onClick={c.clear} className="text-sm font-semibold text-link hover:underline">Limpiar búsqueda y filtro</button>}
    </div>
  )
}

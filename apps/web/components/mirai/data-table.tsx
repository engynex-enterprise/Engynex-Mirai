"use client"

import { Fragment, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowDown, ArrowDownUp, ArrowUp, ArrowUpDown, Check, ChevronLeft, ChevronRight, Columns3, Copy, Download, Info, MoreHorizontal, Plus, Search, SlidersHorizontal, X } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { norm } from "@/lib/domain"
import { fmtDate, fmtMoney } from "@/lib/format"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { DatePicker } from "./date-picker"
import { EmptyState } from "./empty-state"
import { Money } from "./money"
import { MoneyInput } from "./money-input"

export type DTColumn<T> = {
  id: string
  header: string
  /** Ayuda del encabezado (ícono ⓘ). */
  info?: string
  /** Celda de la tabla (en el modo lista con `item` no hace falta: la columna solo ordena o exporta). */
  cell?: (row: T) => React.ReactNode
  /** Si existe, la columna se puede ordenar. */
  sort?: (row: T) => string | number | null | undefined
  /** Valor para exportar (si falta, la columna no se exporta). */
  csv?: (row: T) => string | number | null | undefined
  className?: string
  align?: "left" | "right"
  /** Empieza oculta (se puede mostrar en Columnas). */
  hidden?: boolean
}
/** Filtro de opciones (casillas): categoría, persona, medio de pago, estado… */
export type DTOptionsFilter<T> = { id: string; label: string; kind?: "options"; options: { value: string; label: string }[]; match: (row: T, value: string) => boolean }
/** Rango de valor (desde – hasta). `money` lo escribe en pesos. */
export type DTRangeFilter<T> = { id: string; label: string; kind: "range"; value: (row: T) => number; money?: boolean }
/** Rango de fechas (desde – hasta) sobre una fecha 'YYYY-MM-DD'. */
export type DTDatesFilter<T> = { id: string; label: string; kind: "dates"; value: (row: T) => string | null | undefined }
export type DTFilter<T> = DTOptionsFilter<T> | DTRangeFilter<T> | DTDatesFilter<T>
export type DTAction<T> = { label: string; onSelect: (row: T) => void; destructive?: boolean; hidden?: (row: T) => boolean }
/** Vista rápida (pestaña con conteo sobre la lista): "Todos · Pendientes · Vencidos". */
export type DTView<T> = { id: string; label: string; match?: (row: T) => boolean; hint?: string }

type Range = { min?: number; max?: number }
type Dates = { from?: string | null; to?: string | null }

type Props<T> = {
  title: string
  info?: string
  /** Línea bajo el título. */
  subtitle?: React.ReactNode
  data: T[] | undefined
  loading?: boolean
  columns: DTColumn<T>[]
  rowKey: (row: T) => string
  /** `initial`: texto con el que arranca la búsqueda (p. ej. `?q=` desde otro lado de la app). */
  search?: { placeholder: string; text: (row: T) => string; initial?: string }
  filters?: DTFilter<T>[]
  /** Pestañas rápidas sobre la lista (la de "Todos" va sin `match`). */
  views?: DTView<T>[]
  /** Pestaña con la que abre (la primera si falta). */
  initialView?: string
  create?: { label: string; onClick: () => void; icon?: React.ReactNode }
  exportName?: string
  /** Enlace "Detalles" de cada fila. */
  details?: (row: T) => string | null
  actions?: DTAction<T>[]
  /** "start": el menú de acciones (⋯) va fijo a la izquierda de cada fila, siempre visible al desplazarse de lado. */
  menuAt?: "start" | "end"
  /** Filas más bajas y letra un poco menor (tablas con muchas filas). */
  compact?: boolean
  /** Panel angosto (columna lateral): título con Filtros, Ordenar y Exportar como íconos, y el buscador debajo. */
  narrow?: boolean
  /** Acciones sobre varias filas seleccionadas. */
  bulk?: { label: string; onSelect: (rows: T[]) => void; destructive?: boolean }[]
  initialSort?: { id: string; dir: "asc" | "desc" }
  pageSize?: number
  /** Sin datos: texto o nodo bajo una lupa (compatibilidad). Prefiere `emptyState`. */
  empty?: React.ReactNode
  /** Sin datos: estado vacío completo (p. ej. <EmptyState> con su botón de acción). */
  emptyState?: React.ReactNode
  footer?: React.ReactNode
  /** Cuánto suma lo que se ve (con búsqueda y filtros): "12 gastos · suman $450.000". */
  total?: { value: (row: T) => number; label?: string; currency?: string }
  /** Nombre de lo que se cuenta: ["gasto", "gastos"]. */
  noun?: [string, string]
  /** Modo lista: cada fila la dibuja `item` (debe devolver un <li>, p. ej. <ListRow>) en escritorio y celular. */
  item?: (row: T) => React.ReactNode
  /** Modo lista: agrupa filas seguidas con la misma clave (p. ej. por día) mientras el orden sea uno de `sorts`. */
  group?: { by: (row: T) => string; label: (key: string, rows: T[]) => React.ReactNode; sorts?: string[] }
  /** Modo lista: clases del <ul> (p. ej. una cuadrícula de tarjetas). */
  listClassName?: string
  /** Controles extra en la barra (p. ej. el selector de mes). */
  toolbar?: React.ReactNode
  /** Sin tarjeta propia (dentro de otra tarjeta). */
  bare?: boolean
}

function HeaderInfo({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild><button type="button" aria-label="Más información" className="inline-grid size-5 place-items-center rounded-full text-foreground/80 hover:text-foreground"><Info className="size-4" /></button></TooltipTrigger>
      <TooltipContent className="max-w-64">{text}</TooltipContent>
    </Tooltip>
  )
}

const cmp = (va: unknown, vb: unknown) => (va == null ? 1 : vb == null ? -1 : typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "es"))
const isOptions = <T,>(f: DTFilter<T>): f is DTOptionsFilter<T> => !f.kind || f.kind === "options"
const plural = (n: number, [s, p]: [string, string]) => `${n.toLocaleString("es-CO")} ${n === 1 ? s : p}`

/**
 * Tabla de datos con el diseño de Meta Business Suite (Configuración › Personas): título con ⓘ, buscador, Filtros,
 * Ordenar, Exportar, botón principal, encabezados ordenables, filas altas, "Detalles" y menú ⋯. Además: pestañas
 * rápidas con conteo, filtros de opciones, de rango de valor y de fechas, etiquetas de filtros activos con "Limpiar",
 * conteo y total de lo filtrado, columnas visibles, selección con acciones en grupo, paginación, encabezado fijo,
 * tarjetas en el celular y "sin resultados" con un botón para limpiar. Con `item` dibuja una lista (<ListRow>) con
 * la misma barra, para que todas las listas de Mirai se vean y funcionen igual.
 */
export function DataTable<T>({
  title, info, subtitle, data, loading, columns, rowKey, search, filters = [], views, create, exportName, details, actions, bulk, initialSort, menuAt = "end", compact, narrow,
  pageSize, empty, emptyState, footer, total, noun = ["resultado", "resultados"], item, group, toolbar, bare, initialView, listClassName,
}: Props<T>) {
  const mobile = useIsMobile()
  const list = !!item
  const [q, setQ] = useState(search?.initial ?? "")
  const [active, setActive] = useState<Record<string, string[]>>({})
  const [ranges, setRanges] = useState<Record<string, Range>>({})
  const [dates, setDates] = useState<Record<string, Dates>>({})
  const [view, setView] = useState(initialView ?? views?.[0]?.id ?? "")
  const allView = views?.find((v) => !v.match)
  const [sort, setSort] = useState<{ id: string; dir: "asc" | "desc" } | null>(initialSort ?? null)
  const [hidden, setHidden] = useState<string[]>(() => columns.filter((c) => c.hidden).map((c) => c.id))
  const [sel, setSel] = useState<string[]>([])
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(pageSize ?? (list ? 50 : 25))
  const cols = columns.filter((c) => !hidden.includes(c.id))
  const sortable = columns.filter((c) => c.sort)
  const hasActions = !!(details || actions?.length)
  // Menú a la izquierda: columna angosta y fija; la primera columna de datos ya no lleva el margen del borde.
  const menuStart = hasActions && menuAt === "start"
  const edge = (i: number) => i === 0 && !bulk && !menuStart
  const cellY = compact ? "py-2.5" : "py-4"

  // Búsqueda + filtros (antes de las pestañas, para que cada pestaña muestre su conteo)
  const filtered = useMemo(() => {
    let r = data ?? []
    if (search && q.trim()) { const n = norm(q.trim()); r = r.filter((x) => norm(search.text(x)).includes(n)) }
    for (const f of filters) {
      if (isOptions(f)) { const vs = active[f.id]; if (vs?.length) r = r.filter((x) => vs.some((v) => f.match(x, v))) }
      else if (f.kind === "range") { const g = ranges[f.id]; if (g?.min != null || g?.max != null) r = r.filter((x) => { const v = f.value(x); return (g.min == null || v >= g.min) && (g.max == null || v <= g.max) }) }
      else { const g = dates[f.id]; if (g?.from || g?.to) r = r.filter((x) => { const v = f.value(x); return !!v && (!g.from || v >= g.from) && (!g.to || v <= g.to) }) }
    }
    return r
  }, [data, q, active, ranges, dates, filters, search])
  const counts = useMemo(() => Object.fromEntries((views ?? []).map((v) => [v.id, v.match ? filtered.filter(v.match).length : filtered.length])), [views, filtered])
  const rows = useMemo(() => {
    const vw = views?.find((v) => v.id === view)
    let r = vw?.match ? filtered.filter(vw.match) : filtered
    if (sort) { const c = columns.find((x) => x.id === sort.id); if (c?.sort) r = [...r].sort((a, b) => { const k = cmp(c.sort!(a), c.sort!(b)); return sort.dir === "asc" ? k : -k }) }
    return r
  }, [filtered, views, view, sort, columns])
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const cur = Math.min(page, pages - 1)
  const pageRows = rows.slice(cur * size, cur * size + size)
  const sum = total ? rows.reduce((a, r) => a + (Number(total.value(r)) || 0), 0) : 0

  const fmtR = (f: DTRangeFilter<T>, v?: number) => (v == null ? "" : f.money ? fmtMoney(v) : v.toLocaleString("es-CO"))
  const chips = [
    ...filters.filter(isOptions).flatMap((f) => (active[f.id] ?? []).map((v) => ({ key: `${f.id}-${v}`, label: `${f.label}: ${f.options.find((o) => o.value === v)?.label ?? v}`, clear: () => toggleFilter(f.id, v) }))),
    ...filters.flatMap((f) => {
      if (f.kind === "range") { const g = ranges[f.id]; if (g?.min == null && g?.max == null) return []; return [{ key: f.id, label: `${f.label}: ${g.min != null && g.max != null ? `${fmtR(f, g.min)} – ${fmtR(f, g.max)}` : g.min != null ? `desde ${fmtR(f, g.min)}` : `hasta ${fmtR(f, g.max)}`}`, clear: () => setRanges((x) => ({ ...x, [f.id]: {} })) }] }
      if (f.kind === "dates") { const g = dates[f.id]; if (!g?.from && !g?.to) return []; return [{ key: f.id, label: `${f.label}: ${g.from && g.to ? `${fmtDate(g.from)} – ${fmtDate(g.to)}` : g.from ? `desde ${fmtDate(g.from)}` : `hasta ${fmtDate(g.to)}`}`, clear: () => setDates((x) => ({ ...x, [f.id]: {} })) }] }
      return []
    }),
  ]
  const narrowed = !!q.trim() || chips.length > 0
  const clearAll = () => { setQ(""); setActive({}); setRanges({}); setDates({}); setPage(0) }
  const selected = (data ?? []).filter((r) => sel.includes(rowKey(r)))
  const allOnPage = pageRows.length > 0 && pageRows.every((r) => sel.includes(rowKey(r)))

  const toggleSort = (id: string) => { setPage(0); setSort((s) => (!s || s.id !== id ? { id, dir: "asc" } : s.dir === "asc" ? { id, dir: "desc" } : null)) }
  const toggleFilter = (id: string, v: string) => { setPage(0); setActive((a) => ({ ...a, [id]: a[id]?.includes(v) ? a[id].filter((x) => x !== v) : [...(a[id] ?? []), v] })) }
  const exportRows = (sep: string) => {
    const ex = columns.filter((c) => c.csv)
    return [ex.map((c) => c.header), ...rows.map((r) => ex.map((c) => String(c.csv!(r) ?? "")))].map((l) => l.map((v) => (sep === ";" ? `"${v.replace(/"/g, '""')}"` : v.replace(/\t|\n/g, " "))).join(sep)).join("\n")
  }
  const downloadCsv = () => {
    const blob = new Blob(["﻿" + exportRows(";")], { type: "text/csv;charset=utf-8" })
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${exportName ?? "mirai"}-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); URL.revokeObjectURL(a.href)
    toast.success(`${rows.length} filas exportadas`)
  }
  const copyTsv = async () => { try { await navigator.clipboard.writeText(exportRows("\t")); toast.success("Copiado: pégalo en Excel o Google Sheets") } catch { toast.error("No se pudo copiar") } }

  const rowMenu = (r: T) => {
    const ls = (actions ?? []).filter((a) => !a.hidden?.(r))
    if (!ls.length) return null
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" variant={menuStart ? "ghost" : "outline"} className={menuStart ? "size-8 rounded-full text-muted-foreground hover:text-foreground" : "size-9 rounded-lg"} aria-label="Más acciones"><MoreHorizontal /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={menuStart ? "start" : "end"}>
          {ls.map((a, i) => (
            <span key={a.label}>
              {a.destructive && i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem variant={a.destructive ? "destructive" : "default"} onSelect={() => a.onSelect(r)}>{a.label}</DropdownMenuItem>
            </span>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  // Modo lista: filas seguidas con la misma clave van bajo un mismo título (p. ej. "Hoy · 2 de noviembre").
  const grouped = list && group && (!group.sorts || (sort && group.sorts.includes(sort.id)))
  const listBody = () => {
    if (!grouped) return <ul className={cn("grid-cols-[minmax(0,1fr)]", listClassName ?? "-mx-2 grid")}>{pageRows.map((r) => <Fragment key={rowKey(r)}>{item!(r)}</Fragment>)}</ul>
    const gs: { key: string; rows: T[] }[] = []
    for (const r of pageRows) { const k = group!.by(r); const last = gs.at(-1); if (last?.key === k) last.rows.push(r); else gs.push({ key: k, rows: [r] }) }
    return gs.map((g, i) => (
      <section key={`${g.key}-${i}`} className="grid gap-1">
        <h3 className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground uppercase">{group!.label(g.key, g.rows)}</h3>
        <ul className={cn("grid-cols-[minmax(0,1fr)]", listClassName ?? "-mx-2 grid")}>{g.rows.map((r) => <Fragment key={rowKey(r)}>{item!(r)}</Fragment>)}</ul>
      </section>
    ))
  }

  const pad = narrow ? "px-4" : bare ? "px-0" : "px-5 sm:px-7"
  // Modo angosto: botones de solo ícono (con su nombre para lectores de pantalla y tooltip).
  const tb = narrow ? "size-9 rounded-full p-0" : "h-10 rounded-lg"
  const tl = narrow ? "sr-only" : "max-sm:sr-only"
  const tip = (label: string, el: React.ReactElement) => (narrow ? <Tooltip><TooltipTrigger asChild>{el}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip> : el)
  const Wrap = bare ? "div" : Card
  return (
    // minmax(0,1fr): un texto largo sin saltos (truncate) no ensancha la tabla más allá de su caja.
    <Wrap className={cn(bare ? "grid min-w-0 grid-cols-[minmax(0,1fr)]" : "min-w-0 gap-0 overflow-hidden p-0 shadow-card ring-0")} data-testid="data-table">
      {/* Barra superior: título + buscador + Filtros + Ordenar + Exportar + crear */}
      <div className={cn("flex flex-wrap items-center", narrow ? "gap-2 pt-4 pb-3" : "gap-3 pt-5 pb-4 sm:pt-6", pad)}>
        <div className={cn("mr-auto grid min-w-0", !narrow && "lg:mr-6")}>
          <h2 className={cn("flex items-center gap-2 font-bold tracking-tight", narrow ? "text-[17px]" : "text-[22px]")}>{title}{info && <HeaderInfo text={info} />}</h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {search && (
          <div className={cn("relative order-last w-full", !narrow && "lg:order-none lg:w-auto lg:min-w-56 lg:flex-1")}>
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-foreground/70" />
            <Input className="h-10 rounded-lg pl-11 text-[15px]" placeholder={search.placeholder} value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} aria-label={search.placeholder} />
            {q && <button type="button" aria-label="Borrar búsqueda" className="absolute top-1/2 right-2.5 grid size-6 -translate-y-1/2 place-items-center rounded-full hover:bg-hover" onClick={() => setQ("")}><X className="size-4" /></button>}
          </div>
        )}
        <div className={cn("flex flex-wrap items-center", narrow ? "gap-1" : "gap-2")}>
          {toolbar}
          {filters.length > 0 && (
            <Popover>
              {tip("Filtros", <PopoverTrigger asChild><Button variant={narrow ? "ghost" : "outline"} className={cn(tb, "relative")} aria-label="Filtros"><SlidersHorizontal /><span className={narrow ? "sr-only" : undefined}>Filtros</span>{chips.length ? <span className={cn("grid size-5 place-items-center rounded-full bg-primary text-[11px] text-primary-foreground", narrow ? "absolute -top-1 -right-1 size-4 text-[10px]" : "ml-0.5")}>{chips.length}</span> : null}</Button></PopoverTrigger>)}
              <PopoverContent align="end" className="w-[min(20rem,calc(100vw-2rem))] p-0">
                <div className="max-h-[min(28rem,70dvh)] overflow-y-auto p-3">
                  {filters.map((f) => (
                    <div key={f.id} className="grid gap-1 pb-3 last:pb-0">
                      <p className="px-1 text-xs font-semibold text-muted-foreground uppercase">{f.label}</p>
                      {isOptions(f) ? f.options.map((o) => (
                        <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-hover"><Checkbox checked={active[f.id]?.includes(o.value) ?? false} onCheckedChange={() => toggleFilter(f.id, o.value)} />{o.label}</label>
                      )) : f.kind === "range" ? (
                        <div className="grid grid-cols-2 gap-2 px-1">
                          {(["min", "max"] as const).map((k) => (
                            <label key={k} className="grid gap-1 text-xs text-muted-foreground">{k === "min" ? "Desde" : "Hasta"}
                              {f.money ? <MoneyInput aria-label={`${f.label} ${k === "min" ? "desde" : "hasta"}`} value={ranges[f.id]?.[k] ?? 0} onChange={(v) => { setPage(0); setRanges((x) => ({ ...x, [f.id]: { ...x[f.id], [k]: v || undefined } })) }} />
                                : <Input type="number" className="h-11" aria-label={`${f.label} ${k === "min" ? "desde" : "hasta"}`} value={ranges[f.id]?.[k] ?? ""} onChange={(e) => { setPage(0); setRanges((x) => ({ ...x, [f.id]: { ...x[f.id], [k]: e.target.value === "" ? undefined : +e.target.value } })) }} />}
                            </label>
                          ))}
                        </div>
                      ) : (
                        <div className="grid gap-2 px-1">
                          {(["from", "to"] as const).map((k) => (
                            <label key={k} className="grid gap-1 text-xs text-muted-foreground">{k === "from" ? "Desde" : "Hasta"}
                              <DatePicker value={dates[f.id]?.[k] ?? null} quick="ninguno" clearable onChange={(v) => { setPage(0); setDates((x) => ({ ...x, [f.id]: { ...x[f.id], [k]: v } })) }} placeholder={k === "from" ? "Cualquier fecha" : "Hasta hoy"} />
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {chips.length > 0 && <div className="border-t p-2"><Button variant="ghost" size="sm" className="w-full" onClick={clearAll}>Quitar todos los filtros</Button></div>}
              </PopoverContent>
            </Popover>
          )}
          {(list || mobile) && sortable.length > 0 && (
            <DropdownMenu>
              {tip("Ordenar", <DropdownMenuTrigger asChild><Button variant={narrow ? "ghost" : "outline"} className={tb} aria-label="Ordenar"><ArrowDownUp /><span className={tl}>Ordenar</span></Button></DropdownMenuTrigger>)}
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
                {sortable.map((c) => (
                  <DropdownMenuItem key={c.id} onSelect={() => { setPage(0); setSort((s) => (s?.id === c.id ? { id: c.id, dir: s.dir === "asc" ? "desc" : "asc" } : { id: c.id, dir: "asc" })) }}>
                    <span className="flex-1">{c.header}</span>
                    {sort?.id === c.id ? (sort.dir === "asc" ? <ArrowUp /> : <ArrowDown />) : <Check className="opacity-0" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {!list && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" className="h-10 rounded-lg" aria-label="Columnas visibles"><Columns3 /><span className="max-sm:sr-only">Columnas</span></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Columnas visibles</DropdownMenuLabel>
                {columns.map((c, i) => <DropdownMenuCheckboxItem key={c.id} disabled={i === 0} checked={!hidden.includes(c.id)} onSelect={(e) => e.preventDefault()} onCheckedChange={(v) => setHidden((h) => (v ? h.filter((x) => x !== c.id) : [...h, c.id]))}>{c.header}</DropdownMenuCheckboxItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {columns.some((c) => c.csv) && (
            <DropdownMenu>
              {tip("Exportar", <DropdownMenuTrigger asChild><Button variant={narrow ? "ghost" : "outline"} className={tb} disabled={!rows.length} aria-label="Exportar"><Download /><span className={tl}>Exportar</span>{!narrow && <span aria-hidden className="ml-0.5 border-x-[5px] border-t-[6px] border-x-transparent border-t-current max-sm:hidden" />}</Button></DropdownMenuTrigger>)}
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={downloadCsv}><Download /> Descargar CSV (Excel)</DropdownMenuItem>
                <DropdownMenuItem onSelect={copyTsv}><Copy /> Copiar para pegar en una hoja</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {create && <Button className="h-10 rounded-lg" onClick={create.onClick}>{create.icon ?? <Plus />} {create.label}</Button>}
        </div>
      </div>

      {/* Pestañas rápidas con conteo */}
      {views && views.length > 1 && !!data?.length && (
        <div role="tablist" aria-label="Vistas" className={cn("flex gap-1 overflow-x-auto pb-3 [scrollbar-width:none]", pad)}>
          {views.map((v) => {
            const on = v.id === view
            const btn = (
              <button key={v.id} type="button" role="tab" aria-selected={on} onClick={() => { setView(v.id); setPage(0) }}
                className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold transition-colors", narrow ? "h-8 px-3 text-[13px]" : "h-9 px-3.5 text-sm", on ? "bg-brand-soft text-link" : "text-muted-foreground hover:bg-hover hover:text-foreground")}>
                {v.label}<span className={cn("rounded-full px-1.5 text-xs tabular-nums", on ? "bg-white/70 dark:bg-white/10" : "bg-muted")}>{counts[v.id] ?? 0}</span>
              </button>
            )
            return v.hint ? <Tooltip key={v.id}><TooltipTrigger asChild>{btn}</TooltipTrigger><TooltipContent className="max-w-64">{v.hint}</TooltipContent></Tooltip> : btn
          })}
        </div>
      )}

      {/* Filtros activos, conteo y total de lo filtrado (o la selección) */}
      {!loading && !!data?.length && (chips.length > 0 || sel.length > 0 || total || narrowed) && (
        <div className={cn("flex flex-wrap items-center gap-2 pb-3", pad)}>
          {sel.length > 0 ? (
            <>
              <span className="text-sm font-semibold">{sel.length} seleccionad{sel.length === 1 ? "a" : "as"}</span>
              {bulk?.map((b) => <Button key={b.label} size="sm" variant={b.destructive ? "outline" : "secondary"} className={cn(b.destructive && "text-danger")} onClick={() => { b.onSelect(selected); setSel([]) }}>{b.label}</Button>)}
              <Button size="sm" variant="ghost" onClick={() => setSel([])}>Cancelar selección</Button>
            </>
          ) : (
            <>
              {chips.map((c) => (
                <span key={c.key} className="inline-flex h-8 max-w-full items-center gap-1 rounded-full bg-brand-soft pr-1 pl-3 text-sm font-medium text-link"><span className="truncate">{c.label}</span><button type="button" aria-label={`Quitar ${c.label}`} className="grid size-6 shrink-0 place-items-center rounded-full hover:bg-white/60 dark:hover:bg-white/10" onClick={c.clear}><X className="size-3.5" /></button></span>
              ))}
              {narrowed && <Button size="sm" variant="ghost" className="h-8 text-link" onClick={clearAll}>Limpiar</Button>}
              <span className="ml-auto text-sm text-muted-foreground" aria-live="polite">
                {plural(rows.length, noun)}{total && <> · {total.label ?? "suman"} <Money value={sum} currency={total.currency} className="font-semibold text-foreground" /></>}
              </span>
            </>
          )}
        </div>
      )}

      {/* Modo lista */}
      {list && (loading ? (
        <ul className={cn("grid gap-1 pb-4", pad)} aria-busy>
          {Array.from({ length: 5 }).map((_, i) => <li key={i} className="flex items-center gap-3 py-2"><Skeleton className="size-10 rounded-full" /><div className="grid flex-1 gap-1.5"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/2" /></div><Skeleton className="h-5 w-20" /></li>)}
        </ul>
      ) : rows.length > 0 && <div className={cn("grid gap-4 pb-4", pad)}>{listBody()}</div>)}

      {/* Escritorio: tabla */}
      {!list && !mobile && <div className="max-h-[70vh] overflow-auto">
        <table className="w-full text-[15px]">
          {/* Cabecera fija con fondo sólido (--popover): con --card, que es translúcido, se veían las filas por detrás. */}
          <thead className="sticky top-0 z-10 bg-popover shadow-[0_1px_0_var(--border),0_2px_4px_rgba(0,0,0,.04)]">
            <tr>
              {menuStart && <th className="sticky left-0 z-[1] w-14 bg-popover py-3.5 pr-1 pl-4" aria-label="Acciones" />}
              {bulk && <th className="w-12 py-3.5 pl-7"><Checkbox aria-label="Seleccionar la página" checked={allOnPage} onCheckedChange={(v) => setSel((s) => (v ? [...new Set([...s, ...pageRows.map(rowKey)])] : s.filter((k) => !pageRows.some((r) => rowKey(r) === k))))} /></th>}
              {cols.map((c, i) => (
                <th key={c.id} className={cn("py-3.5 pr-4 text-left font-bold whitespace-nowrap", edge(i) && "pl-7", c.align === "right" && "text-right", c.className)}>
                  <span className={cn("inline-flex items-center gap-1.5", c.align === "right" && "flex-row-reverse")}>
                    {c.sort ? (
                      <button type="button" className="inline-flex items-center gap-1.5 rounded hover:text-link" onClick={() => toggleSort(c.id)} aria-label={`Ordenar por ${c.header}`}>
                        {c.header}{sort?.id === c.id ? (sort.dir === "asc" ? <ArrowUp className="size-4" /> : <ArrowDown className="size-4" />) : <ArrowUpDown className="size-4" />}
                      </button>
                    ) : c.header}
                    {c.info && <HeaderInfo text={c.info} />}
                  </span>
                </th>
              ))}
              {hasActions && !menuStart && <th className="w-40 pr-7" />}
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b last:border-0">{menuStart && <td className="pl-4" />}{(bulk ? [null, ...cols] : cols).map((_, j) => <td key={j} className={cn("py-5 pr-4", j === 0 && !menuStart && "pl-7")}><Skeleton className="h-5 w-3/4" /></td>)}{hasActions && !menuStart && <td />}</tr>
            )) : pageRows.map((r) => {
              const k = rowKey(r)
              const href = details?.(r)
              return (
                <tr key={k} className={cn("group/row border-b transition-colors last:border-0 hover:bg-hover/60", compact && "text-[14px]", sel.includes(k) && "bg-brand-soft/50")}>
                  {menuStart && <td className={cn("sticky left-0 z-[1] bg-popover pr-1 pl-4 align-middle group-hover/row:bg-[color-mix(in_oklab,var(--popover),var(--hover)_60%)]", cellY)}>{rowMenu(r)}</td>}
                  {bulk && <td className={cn("pl-7", cellY)}><Checkbox aria-label="Seleccionar fila" checked={sel.includes(k)} onCheckedChange={(v) => setSel((s) => (v ? [...s, k] : s.filter((x) => x !== k)))} /></td>}
                  {cols.map((c, i) => <td key={c.id} className={cn("pr-4 align-middle", cellY, edge(i) && "pl-7", c.align === "right" && "text-right", c.className)}>{c.cell ? c.cell(r) : c.csv?.(r)}</td>)}
                  {hasActions && !menuStart && (
                    <td className={cn("pr-7", cellY)}>
                      <div className="flex items-center justify-end gap-4">
                        {href && <Link href={href} className="text-[15px] font-medium text-link hover:underline">Detalles</Link>}
                        {rowMenu(r)}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>}

      {/* Celular: tarjetas */}
      {!list && mobile && <ul className="grid gap-px bg-border">
        {loading ? Array.from({ length: 3 }).map((_, i) => <li key={i} className="bg-card p-4"><Skeleton className="h-16" /></li>) : pageRows.map((r) => {
          const k = rowKey(r)
          const href = details?.(r)
          const [first, ...rest] = cols
          return (
            <li key={k} className={cn("grid gap-3 bg-card p-4", sel.includes(k) && "bg-brand-soft/50")}>
              <div className="flex items-start gap-3">
                {bulk && <Checkbox className="mt-1" aria-label="Seleccionar fila" checked={sel.includes(k)} onCheckedChange={(v) => setSel((s) => (v ? [...s, k] : s.filter((x) => x !== k)))} />}
                <div className="min-w-0 flex-1">{first.cell ? first.cell(r) : first.csv?.(r)}</div>
                {rowMenu(r)}
              </div>
              {rest.length > 0 && <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">{rest.map((c) => <div key={c.id} className={cn("min-w-0", c.align === "right" && "text-right")}><dt className="text-xs font-semibold text-muted-foreground">{c.header}</dt><dd className="min-w-0 break-words">{c.cell ? c.cell(r) : c.csv?.(r)}</dd></div>)}</dl>}
              {href && <Link href={href} className="text-sm font-semibold text-link">Ver detalles</Link>}
            </li>
          )
        })}
      </ul>}

      {/* Sin datos o sin resultados */}
      {!loading && !rows.length && (
        !data?.length ? (emptyState ?? (
          <div className="grid justify-items-center gap-2 px-6 py-14 text-center">
            <Search className="size-8 text-muted-foreground" />
            {empty ?? <p className="text-muted-foreground">Aún no hay nada aquí.</p>}
          </div>
        )) : (
          <EmptyState art="sin-resultados" title="No hay resultados" description={narrowed ? "Nada coincide con esa búsqueda o esos filtros. Prueba con otra palabra o quita algunos filtros." : "No hay nada en esta vista."}
            action={narrowed ? <Button variant="outline" onClick={clearAll}>Limpiar búsqueda y filtros</Button> : allView && allView.id !== view ? <Button variant="outline" onClick={() => setView(allView.id)}>Ver {allView.label.toLowerCase()}</Button> : undefined} />
        )
      )}

      {/* Pie: conteo y paginación */}
      {!loading && rows.length > 0 && (!list || rows.length > size) && (
        <div className={cn("flex flex-wrap items-center justify-between gap-3 border-t py-3 text-sm text-muted-foreground", pad)}>
          <span>{cur * size + 1}–{Math.min(rows.length, cur * size + size)} de {rows.length.toLocaleString("es-CO")}{data && rows.length !== data.length ? ` (de ${data.length.toLocaleString("es-CO")} en total)` : ""}</span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5">Filas
              <select className="h-8 rounded-md border bg-background px-1.5 text-foreground" value={size} onChange={(e) => { setSize(+e.target.value); setPage(0) }} aria-label="Filas por página">{[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}</select>
            </label>
            <Button size="icon-sm" variant="outline" aria-label="Página anterior" disabled={cur === 0} onClick={() => setPage(cur - 1)}><ChevronLeft /></Button>
            <span className="tabular-nums">{cur + 1} / {pages}</span>
            <Button size="icon-sm" variant="outline" aria-label="Página siguiente" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}><ChevronRight /></Button>
          </div>
        </div>
      )}
      {footer && <div className={cn("border-t py-3 text-xs text-muted-foreground", pad)}>{footer}</div>}
    </Wrap>
  )
}

/** Celda principal estilo Meta: avatar o ícono, nombre y una línea secundaria. */
export function DTPrimary({ media, title, sub, href }: { media?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; href?: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      {media && <span className="shrink-0">{media}</span>}
      <div className="grid min-w-0">
        {href ? <Link href={href} className="truncate font-medium hover:underline">{title}</Link> : <span className="truncate font-medium">{title}</span>}
        {sub && <span className="truncate text-[14px] text-muted-foreground">{sub}</span>}
      </div>
    </div>
  )
}

/** Celda de dos líneas (valor y detalle en gris), como "Acceso total / Todo" en Meta. */
export function DTTwoLine({ top, bottom }: { top: React.ReactNode; bottom?: React.ReactNode }) {
  return <div className="grid">{<span>{top}</span>}{bottom && <span className="text-[14px] text-muted-foreground">{bottom}</span>}</div>
}

/** Opciones de filtro a partir de un catálogo (categorías, medios de pago, personas…) que aparecen en los datos. */
export function catalogOptions<T, C extends { id: string; nombre: string }>(rows: T[] | undefined, catalog: C[], pick: (row: T) => string | null | undefined, none?: string) {
  const used = new Set((rows ?? []).map(pick))
  const opts = catalog.filter((c) => used.has(c.id)).map((c) => ({ value: c.id, label: c.nombre }))
  return none && [...used].some((v) => !v) ? [...opts, { value: "__none", label: none }] : opts
}
/** match() para un filtro hecho con catalogOptions (incluye "Sin …"). */
export const catalogMatch = <T,>(pick: (row: T) => string | null | undefined) => (row: T, v: string) => (v === "__none" ? !pick(row) : pick(row) === v)

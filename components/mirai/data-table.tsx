"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Columns3, Copy, Download, Info, MoreHorizontal, Plus, Search, SlidersHorizontal, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { norm } from "@/lib/domain"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

export type DTColumn<T> = {
  id: string
  header: string
  /** Ayuda del encabezado (ícono ⓘ). */
  info?: string
  cell: (row: T) => React.ReactNode
  /** Si existe, la columna se puede ordenar. */
  sort?: (row: T) => string | number | null | undefined
  /** Valor para exportar (si falta, la columna no se exporta). */
  csv?: (row: T) => string | number | null | undefined
  className?: string
  align?: "left" | "right"
  /** Empieza oculta (se puede mostrar en Columnas). */
  hidden?: boolean
}
export type DTFilter<T> = { id: string; label: string; options: { value: string; label: string }[]; match: (row: T, value: string) => boolean }
export type DTAction<T> = { label: string; onSelect: (row: T) => void; destructive?: boolean; hidden?: (row: T) => boolean }

type Props<T> = {
  title: string
  info?: string
  data: T[] | undefined
  loading?: boolean
  columns: DTColumn<T>[]
  rowKey: (row: T) => string
  search?: { placeholder: string; text: (row: T) => string }
  filters?: DTFilter<T>[]
  create?: { label: string; onClick: () => void; icon?: React.ReactNode }
  exportName?: string
  /** Enlace "Detalles" de cada fila. */
  details?: (row: T) => string | null
  actions?: DTAction<T>[]
  /** Acciones sobre varias filas seleccionadas. */
  bulk?: { label: string; onSelect: (rows: T[]) => void; destructive?: boolean }[]
  initialSort?: { id: string; dir: "asc" | "desc" }
  pageSize?: number
  empty?: React.ReactNode
  footer?: React.ReactNode
}

function HeaderInfo({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild><button type="button" aria-label="Más información" className="inline-grid size-5 place-items-center rounded-full text-foreground/80 hover:text-foreground"><Info className="size-4" /></button></TooltipTrigger>
      <TooltipContent className="max-w-64">{text}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Tabla de datos con el diseño de Meta Business Suite (Configuración › Personas): título con ⓘ, buscador, Filtros,
 * Exportar, botón principal, encabezados ordenables, filas altas, "Detalles" y menú ⋯. Además: etiquetas de filtros
 * activos, columnas visibles, selección con acciones en grupo, paginación, encabezado fijo y tarjetas en el celular.
 */
export function DataTable<T>({ title, info, data, loading, columns, rowKey, search, filters = [], create, exportName, details, actions, bulk, initialSort, pageSize = 25, empty, footer }: Props<T>) {
  const mobile = useIsMobile()
  const [q, setQ] = useState("")
  const [active, setActive] = useState<Record<string, string[]>>({})
  const [sort, setSort] = useState<{ id: string; dir: "asc" | "desc" } | null>(initialSort ?? null)
  const [hidden, setHidden] = useState<string[]>(() => columns.filter((c) => c.hidden).map((c) => c.id))
  const [sel, setSel] = useState<string[]>([])
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(pageSize)
  const cols = columns.filter((c) => !hidden.includes(c.id))
  const hasActions = !!(details || actions?.length)

  const rows = useMemo(() => {
    let r = data ?? []
    if (search && q.trim()) { const n = norm(q.trim()); r = r.filter((x) => norm(search.text(x)).includes(n)) }
    for (const f of filters) { const vs = active[f.id]; if (vs?.length) r = r.filter((x) => vs.some((v) => f.match(x, v))) }
    if (sort) {
      const c = columns.find((x) => x.id === sort.id)
      if (c?.sort) r = [...r].sort((a, b) => { const va = c.sort!(a), vb = c.sort!(b); const k = va == null ? 1 : vb == null ? -1 : typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "es"); return sort.dir === "asc" ? k : -k })
    }
    return r
  }, [data, q, active, sort, columns, filters, search])
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const cur = Math.min(page, pages - 1)
  const view = rows.slice(cur * size, cur * size + size)
  const chips = filters.flatMap((f) => (active[f.id] ?? []).map((v) => ({ f, v, label: `${f.label}: ${f.options.find((o) => o.value === v)?.label ?? v}` })))
  const selected = (data ?? []).filter((r) => sel.includes(rowKey(r)))
  const allOnPage = view.length > 0 && view.every((r) => sel.includes(rowKey(r)))

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
    const list = (actions ?? []).filter((a) => !a.hidden?.(r))
    if (!list.length) return null
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="icon-sm" variant="outline" className="size-9 rounded-lg" aria-label="Más acciones"><MoreHorizontal /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {list.map((a, i) => (
            <span key={a.label}>
              {a.destructive && i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem variant={a.destructive ? "destructive" : "default"} onSelect={() => a.onSelect(r)}>{a.label}</DropdownMenuItem>
            </span>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <Card className="gap-0 overflow-hidden p-0 shadow-card ring-0" data-testid="data-table">
      {/* Barra superior: título + buscador + Filtros + Exportar + crear */}
      <div className="flex flex-wrap items-center gap-3 px-5 pt-5 pb-4 sm:px-7 sm:pt-6">
        <h2 className="mr-auto flex items-center gap-2 text-[22px] font-bold tracking-tight lg:mr-6">{title}{info && <HeaderInfo text={info} />}</h2>
        {search && (
          <div className="relative order-last w-full lg:order-none lg:w-auto lg:flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-foreground/70" />
            <Input className="h-10 rounded-lg pl-11 text-[15px]" placeholder={search.placeholder} value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} aria-label={search.placeholder} />
            {q && <button type="button" aria-label="Borrar búsqueda" className="absolute top-1/2 right-2.5 grid size-6 -translate-y-1/2 place-items-center rounded-full hover:bg-hover" onClick={() => setQ("")}><X className="size-4" /></button>}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          {filters.length > 0 && (
            <Popover>
              <PopoverTrigger asChild><Button variant="outline" className="h-10 rounded-lg"><SlidersHorizontal /> Filtros{chips.length ? <span className="ml-0.5 grid size-5 place-items-center rounded-full bg-primary text-[11px] text-primary-foreground">{chips.length}</span> : null}</Button></PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-0">
                <div className="max-h-96 overflow-y-auto p-3">
                  {filters.map((f) => (
                    <div key={f.id} className="grid gap-1 pb-3 last:pb-0">
                      <p className="px-1 text-xs font-semibold text-muted-foreground uppercase">{f.label}</p>
                      {f.options.map((o) => <label key={o.value} className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1.5 text-sm hover:bg-hover"><Checkbox checked={active[f.id]?.includes(o.value) ?? false} onCheckedChange={() => toggleFilter(f.id, o.value)} />{o.label}</label>)}
                    </div>
                  ))}
                </div>
                {chips.length > 0 && <div className="border-t p-2"><Button variant="ghost" size="sm" className="w-full" onClick={() => setActive({})}>Quitar todos los filtros</Button></div>}
              </PopoverContent>
            </Popover>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline" className="h-10 rounded-lg" aria-label="Columnas visibles"><Columns3 /><span className="max-sm:sr-only">Columnas</span></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Columnas visibles</DropdownMenuLabel>
              {columns.map((c, i) => <DropdownMenuCheckboxItem key={c.id} disabled={i === 0} checked={!hidden.includes(c.id)} onSelect={(e) => e.preventDefault()} onCheckedChange={(v) => setHidden((h) => (v ? h.filter((x) => x !== c.id) : [...h, c.id]))}>{c.header}</DropdownMenuCheckboxItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
          {columns.some((c) => c.csv) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="outline" className="h-10 rounded-lg" disabled={!rows.length}><Download /> Exportar <span aria-hidden className="ml-0.5 border-x-[5px] border-t-[6px] border-x-transparent border-t-current" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={downloadCsv}><Download /> Descargar CSV (Excel)</DropdownMenuItem>
                <DropdownMenuItem onSelect={copyTsv}><Copy /> Copiar para pegar en una hoja</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {create && <Button className="h-10 rounded-lg" onClick={create.onClick}>{create.icon ?? <Plus />} {create.label}</Button>}
        </div>
      </div>

      {(chips.length > 0 || sel.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 px-5 pb-3 sm:px-7">
          {sel.length > 0 ? (
            <>
              <span className="text-sm font-semibold">{sel.length} seleccionad{sel.length === 1 ? "a" : "as"}</span>
              {bulk?.map((b) => <Button key={b.label} size="sm" variant={b.destructive ? "outline" : "secondary"} className={cn(b.destructive && "text-danger")} onClick={() => { b.onSelect(selected); setSel([]) }}>{b.label}</Button>)}
              <Button size="sm" variant="ghost" onClick={() => setSel([])}>Cancelar selección</Button>
            </>
          ) : chips.map((c) => (
            <span key={`${c.f.id}-${c.v}`} className="inline-flex h-8 items-center gap-1 rounded-full bg-brand-soft pr-1 pl-3 text-sm font-medium text-link">{c.label}<button type="button" aria-label={`Quitar ${c.label}`} className="grid size-6 place-items-center rounded-full hover:bg-white/60" onClick={() => toggleFilter(c.f.id, c.v)}><X className="size-3.5" /></button></span>
          ))}
        </div>
      )}

      {/* Escritorio: tabla */}
      {!mobile && <div className="max-h-[70vh] overflow-auto">
        <table className="w-full text-[15px]">
          <thead className="sticky top-0 z-10 bg-card shadow-[0_1px_0_var(--border),0_2px_4px_rgba(0,0,0,.04)]">
            <tr>
              {bulk && <th className="w-12 py-3.5 pl-7"><Checkbox aria-label="Seleccionar la página" checked={allOnPage} onCheckedChange={(v) => setSel((s) => (v ? [...new Set([...s, ...view.map(rowKey)])] : s.filter((k) => !view.some((r) => rowKey(r) === k))))} /></th>}
              {cols.map((c, i) => (
                <th key={c.id} className={cn("py-3.5 pr-4 text-left font-bold whitespace-nowrap", i === 0 && !bulk && "pl-7", c.align === "right" && "text-right", c.className)}>
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
              {hasActions && <th className="w-40 pr-7" />}
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b last:border-0">{(bulk ? [null, ...cols] : cols).map((_, j) => <td key={j} className={cn("py-5 pr-4", j === 0 && "pl-7")}><Skeleton className="h-5 w-3/4" /></td>)}{hasActions && <td />}</tr>
            )) : view.map((r) => {
              const k = rowKey(r)
              const href = details?.(r)
              return (
                <tr key={k} className={cn("border-b transition-colors last:border-0 hover:bg-hover/60", sel.includes(k) && "bg-brand-soft/50")}>
                  {bulk && <td className="py-4 pl-7"><Checkbox aria-label="Seleccionar fila" checked={sel.includes(k)} onCheckedChange={(v) => setSel((s) => (v ? [...s, k] : s.filter((x) => x !== k)))} /></td>}
                  {cols.map((c, i) => <td key={c.id} className={cn("py-4 pr-4 align-middle", i === 0 && !bulk && "pl-7", c.align === "right" && "text-right", c.className)}>{c.cell(r)}</td>)}
                  {hasActions && (
                    <td className="py-4 pr-7">
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
      {mobile && <ul className="grid gap-px bg-border">
        {loading ? Array.from({ length: 3 }).map((_, i) => <li key={i} className="bg-card p-4"><Skeleton className="h-16" /></li>) : view.map((r) => {
          const k = rowKey(r)
          const href = details?.(r)
          const [first, ...rest] = cols
          return (
            <li key={k} className={cn("grid gap-3 bg-card p-4", sel.includes(k) && "bg-brand-soft/50")}>
              <div className="flex items-start gap-3">
                {bulk && <Checkbox className="mt-1" aria-label="Seleccionar fila" checked={sel.includes(k)} onCheckedChange={(v) => setSel((s) => (v ? [...s, k] : s.filter((x) => x !== k)))} />}
                <div className="min-w-0 flex-1">{first.cell(r)}</div>
                {rowMenu(r)}
              </div>
              {rest.length > 0 && <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">{rest.map((c) => <div key={c.id} className="min-w-0"><dt className="text-xs font-semibold text-muted-foreground">{c.header}</dt><dd className="min-w-0 break-words">{c.cell(r)}</dd></div>)}</dl>}
              {href && <Link href={href} className="text-sm font-semibold text-link">Ver detalles</Link>}
            </li>
          )
        })}
      </ul>}

      {!loading && !rows.length && (
        <div className="grid justify-items-center gap-2 px-6 py-14 text-center">
          <Search className="size-8 text-muted-foreground" />
          {empty ?? <p className="text-muted-foreground">{q || chips.length ? "No hay resultados con esa búsqueda o esos filtros." : "Aún no hay nada aquí."}</p>}
          {(q || chips.length > 0) && <Button variant="outline" size="sm" onClick={() => { setQ(""); setActive({}) }}>Limpiar búsqueda y filtros</Button>}
        </div>
      )}

      {/* Pie: conteo y paginación */}
      {!loading && rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-sm text-muted-foreground sm:px-7">
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
      {footer && <div className="border-t px-5 py-3 text-xs text-muted-foreground sm:px-7">{footer}</div>}
    </Card>
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

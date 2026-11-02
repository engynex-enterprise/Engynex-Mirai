"use client"

import { useCallback, useRef, useState } from "react"
import Link from "next/link"
import { formatDistanceToNowStrict } from "date-fns"
import { es } from "date-fns/locale"
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { fmtDate } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * Piezas comunes de la consola de administración: formatos, ventanas de confirmación, filas de ajustes, barras,
 * gráficas por día y esqueletos. Así todas las vistas de la consola se ven y se comportan igual.
 */

// ── Formatos ────────────────────────────────────────────────────────────────────────────────────────────────────

/** "hace 3 días" (o `none` si no hay fecha). */
export const rel = (d?: string | null, none = "Nunca") => (d ? formatDistanceToNowStrict(new Date(d), { locale: es, addSuffix: true }) : none)
/** Número con separador de miles colombiano. */
export const nf = (x: number, decimals = 0) => x.toLocaleString("es-CO", { maximumFractionDigits: decimals })
/** Decimal con coma (porcentajes, CTR). */
export const dec = (x: number | string) => String(x).replace(".", ",")
/** Fecha corta con año de un timestamp ISO. */
export const fday = (iso: string, year = true) => fmtDate(iso.slice(0, 10), { year })
/** Plural sencillo: plural(3, "hogar", "hogares") → "3 hogares". */
export const plural = (n: number, one: string, many = `${one}s`) => `${nf(n)} ${n === 1 ? one : many}`

// ── Ventana que conserva su contenido al cerrar ─────────────────────────────────────────────────────────────────

/**
 * Para ventanas de edición: guarda el registro abierto y no lo borra al cerrar (la animación de salida sigue mostrando
 * lo mismo, sin "abrir otra vez" vacía). `key` cambia en cada apertura para que el formulario arranque limpio.
 */
export function useDialogTarget<T>() {
  const [s, setS] = useState<{ value: T | null; open: boolean; key: number }>({ value: null, open: false, key: 0 })
  const show = useCallback((value: T) => setS((x) => ({ value, open: true, key: x.key + 1 })), [])
  const close = useCallback(() => setS((x) => ({ ...x, open: false })), [])
  return { value: s.value, open: s.open, key: s.key, show, close, onOpenChange: (o: boolean) => { if (!o) close() } }
}

// ── Confirmar y pedir un dato (reemplaza confirm() y prompt() del navegador) ────────────────────────────────────

type AskOpts = { title: string; description?: React.ReactNode; confirmLabel?: string; destructive?: boolean; input?: { label: string; placeholder?: string; required?: boolean } }

/**
 * `const ask = useAsk()` → `if (await ask.confirm({ title, destructive: true })) …` o `const v = await ask.prompt({ title, input })`.
 * Pinta `ask.node` una vez en la vista. Ventana accesible (foco atrapado, Escape cancela) en vez del cuadro del navegador.
 */
export function useAsk() {
  const [opts, setOpts] = useState<AskOpts | null>(null)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const resolver = useRef<((v: string | null) => void) | null>(null)
  const ask = useCallback((o: AskOpts) => new Promise<string | null>((r) => { resolver.current = r; setText(""); setOpts(o); setOpen(true) }), [])
  const done = (v: string | null) => { resolver.current?.(v); resolver.current = null; setOpen(false) }
  const confirm = useCallback((o: Omit<AskOpts, "input">) => ask(o).then((v) => v !== null), [ask])
  const prompt = useCallback((o: AskOpts & { input: NonNullable<AskOpts["input"]> }) => ask(o), [ask])
  const missing = !!opts?.input?.required && !text.trim()
  const node = (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) done(null) }}>
      <AlertDialogContent>
        <form onSubmit={(e) => { e.preventDefault(); if (!missing) done(opts?.input ? text.trim() : "") }}>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts?.title}</AlertDialogTitle>
            {opts?.description && <AlertDialogDescription>{opts.description}</AlertDialogDescription>}
          </AlertDialogHeader>
          {opts?.input && (
            <div className="grid gap-2 px-6 pb-5">
              <Label htmlFor="ask-input">{opts.input.label}</Label>
              <Input id="ask-input" autoFocus className="h-11" placeholder={opts.input.placeholder} value={text} onChange={(e) => setText(e.target.value)} />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancelar</AlertDialogCancel>
            <Button type="submit" disabled={missing} className={cn(opts?.destructive && "bg-danger text-white hover:bg-danger/90")}>{opts?.confirmLabel ?? "Aceptar"}</Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
  return { confirm, prompt, node }
}

// ── Filas y controles ───────────────────────────────────────────────────────────────────────────────────────────

/** Ajuste con interruptor: título, explicación y el switch a la derecha (toda la fila es clicable). */
export function ToggleRow({ title, desc, checked, onChange, label, disabled }: { title: string; desc?: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <label className={cn("flex items-start justify-between gap-4 rounded-lg py-1 text-sm", disabled ? "opacity-60" : "cursor-pointer")}>
      <span className="grid gap-0.5"><b className="font-semibold">{title}</b>{desc && <span className="text-muted-foreground">{desc}</span>}</span>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={label ?? title} className="mt-0.5 shrink-0" />
    </label>
  )
}

/** Varias casillas (planes, periodos, dispositivos…). */
export function CheckGroup({ options, value, onChange, className }: { options: { value: string; label: string }[]; value: string[]; onChange: (v: string[]) => void; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-x-4 gap-y-2", className)}>
      {options.map((o) => (
        <label key={o.value} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-full bg-secondary/60 px-3 text-sm has-[[data-state=checked]]:bg-brand-soft">
          <Checkbox checked={value.includes(o.value)} onCheckedChange={(x) => onChange(x ? [...value, o.value] : value.filter((y) => y !== o.value))} />{o.label}
        </label>
      ))}
    </div>
  )
}

/** Fila "dato: valor" de una ficha. */
export function InfoRow({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex justify-between gap-3 border-b py-2 text-sm last:border-0"><span className="text-muted-foreground">{k}</span><span className="min-w-0 text-right font-medium break-words">{v || "—"}</span></div>
}

/** Enlace "Ver todos" de las tarjetas. */
export function SeeAll({ href, children = "Ver todos" }: { href: string; children?: React.ReactNode }) {
  return <Link href={href} className="text-sm font-semibold text-link hover:underline">{children}</Link>
}

/** Texto cuando una tarjeta no tiene datos. */
export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>
}

// ── Gráficas sencillas ──────────────────────────────────────────────────────────────────────────────────────────

/** Barras horizontales: etiqueta, valor y barra proporcional (lo más usado, por ubicación, por función…). */
export function BarList({ rows, limit = 8, empty = "Sin datos en el periodo." }: { rows: { k: string; label: string; v: number; right?: React.ReactNode; sub?: React.ReactNode }[]; limit?: number; empty?: string }) {
  if (!rows.length) return <Empty>{empty}</Empty>
  const max = Math.max(1, ...rows.map((r) => r.v))
  return (
    <ul className="grid gap-3">
      {rows.slice(0, limit).map((r) => (
        <li key={r.k} className="grid gap-1">
          <div className="flex justify-between gap-2 text-sm"><span className="min-w-0 truncate">{r.label}</span><span className="shrink-0 font-semibold tabular-nums">{r.right ?? nf(r.v)}</span></div>
          <span className="h-1.5 rounded-full bg-secondary" aria-hidden><span className="block h-full rounded-full bg-brand" style={{ width: `${(r.v / max) * 100}%` }} /></span>
          {r.sub && <span className="text-xs text-muted-foreground">{r.sub}</span>}
        </li>
      ))}
    </ul>
  )
}

/** Columnas por día (actividad, impresiones). `b` se dibuja encima de `a` (p. ej. clics sobre impresiones). */
export function DayBars({ data, label, loading, className = "h-44" }: { data: { d: string; a: number; b?: number; title: string }[] | undefined; label: string; loading?: boolean; className?: string }) {
  if (loading || !data) return <Skeleton className={className} />
  const max = Math.max(1, ...data.map((x) => x.a))
  return (
    <div className="grid gap-1.5">
      <div className={cn("flex items-end gap-[3px]", className)} role="img" aria-label={label}>
        {data.map((x) => (
          <div key={x.d} className="group relative flex h-full flex-1 items-end" title={x.title}>
            <span className="w-full rounded-t bg-brand/70 transition group-hover:bg-brand" style={{ height: `${Math.max(2, (x.a / max) * 100)}%` }} />
            {!!x.b && <span className="absolute bottom-0 w-full rounded-t bg-forest" style={{ height: `${Math.max(2, (x.b / max) * 100)}%` }} />}
          </div>
        ))}
      </div>
      {data.length > 0 && <div className="flex justify-between text-xs text-muted-foreground"><span>{fmtDate(data[0].d)}</span><span>Hoy</span></div>}
    </div>
  )
}

// ── Esqueletos ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Esqueleto de una vista de la consola: KPIs opcionales y una tabla o tarjetas. */
export function AdminSkeleton({ kpis = 0, kind = "table" }: { kpis?: number; kind?: "table" | "cards" | "split" }) {
  return (
    <div className="grid gap-6" aria-busy="true" aria-label="Cargando">
      {kpis > 0 && (
        <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: kpis }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-lg bg-card p-5 shadow-card"><Skeleton className="size-12 rounded-full" /><div className="grid flex-1 gap-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-6 w-28" /></div></div>
          ))}
        </div>
      )}
      {kind === "table" && (
        <div className="grid gap-3 rounded-lg bg-card p-5 shadow-card sm:p-7">
          <div className="flex flex-wrap items-center gap-3"><Skeleton className="h-7 w-40" /><Skeleton className="h-10 flex-1 basis-56" /><Skeleton className="h-10 w-28" /></div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 border-t pt-3"><Skeleton className="size-10 rounded-full" /><div className="grid flex-1 gap-1.5"><Skeleton className="h-4 w-1/3" /><Skeleton className="h-3 w-1/4" /></div><Skeleton className="h-5 w-20" /></div>
          ))}
        </div>
      )}
      {kind !== "table" && (
        <div className={cn("grid gap-6", kind === "cards" ? "md:grid-cols-2 xl:grid-cols-3" : "xl:grid-cols-2")}>
          {Array.from({ length: kind === "cards" ? 6 : 4 }).map((_, i) => <div key={i} className="grid gap-3 rounded-lg bg-card p-5 shadow-card"><Skeleton className="h-5 w-40" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-24" /></div>)}
        </div>
      )}
    </div>
  )
}

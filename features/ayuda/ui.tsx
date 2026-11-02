"use client"

import { createContext, useContext } from "react"
import Link from "next/link"
import { ChevronRight, Lightbulb, Search, ThumbsDown, ThumbsUp, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Icon } from "@/components/mirai/icon"
import { useShell } from "@/components/app/shell-store"
import { helpKey, type HelpRoute } from "@/lib/content/centro-ayuda"
import { cn } from "@/lib/utils"

// ───────────────────────────── Navegación ─────────────────────────────

type HelpNav = {
  inPanel: boolean; go: (r: HelpRoute) => void; close: () => void
  /** Texto del buscador de la portada: vive en el panel para que se conserve al volver con Atrás. */
  query?: string; setQuery?: (q: string) => void
}
const NavCtx = createContext<HelpNav | null>(null)
export const HelpNavProvider = NavCtx.Provider

/**
 * Dentro del panel, `go` abre una vista interna (con Atrás). En una página completa abre el Centro de ayuda en esa vista.
 * `close` cierra el panel antes de ir a otra pantalla.
 */
export function useHelpNav(): HelpNav {
  const ctx = useContext(NavCtx)
  const setHelp = useShell((s) => s.setHelp)
  return ctx ?? { inPanel: false, go: (r) => setHelp(helpKey(r)), close: () => {} }
}

/** Enlace a una pantalla de Mirai: cierra el panel al tocarlo. */
export function AppLink({ href, className, children, ...rest }: { href: string; className?: string; children: React.ReactNode } & Omit<React.ComponentProps<typeof Link>, "href">) {
  const { close } = useHelpNav()
  return <Link href={href} className={className} onClick={close} {...rest}>{children}</Link>
}

// ───────────────────────────── Piezas ─────────────────────────────

/** Texto con <b> de los contenidos de la v4 (fuente propia, no del usuario). */
export const Html = ({ html, className }: { html: string; className?: string }) => <span className={className} dangerouslySetInnerHTML={{ __html: html }} />

export function SearchBox({ value, onChange, placeholder, label, className, autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; className?: string; autoFocus?: boolean }) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input type="text" enterKeyHint="search" autoComplete="off" className="h-11 rounded-full pr-10 pl-9" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} autoFocus={autoFocus} />
      {value && <Button type="button" size="icon-xs" variant="ghost" className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full" aria-label="Borrar la búsqueda" onClick={() => onChange("")}><X /></Button>}
    </div>
  )
}

/** Chips de filtro con conteo (role radio para lectores de pantalla). */
export function Chips<T extends string>({ value, onChange, items, label }: { value: T; onChange: (v: T) => void; items: { value: T; label: string; n?: number }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {items.map((c) => (
        <button key={c.value} type="button" role="radio" aria-checked={value === c.value} onClick={() => onChange(c.value)}
          className={cn("rounded-full px-3 py-1.5 text-[13px] font-semibold transition", value === c.value ? "bg-brand-soft text-link ring-2 ring-brand/40" : "bg-secondary hover:bg-secondary-hover")}>
          {c.label}{c.n !== undefined && <span className="ml-1 font-normal text-muted-foreground">{c.n}</span>}
        </button>
      ))}
    </div>
  )
}

/** Fila tocable estilo Meta: ícono, título, detalle y flecha. */
export function RowButton({ icon, title, sub, onClick, href, badge, tone = "brand", className }: {
  icon: string; title: React.ReactNode; sub?: React.ReactNode; onClick?: () => void; href?: string; badge?: React.ReactNode; tone?: "brand" | "muted"; className?: string
}) {
  const inner = (
    <>
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", tone === "brand" ? "bg-brand-soft text-brand" : "bg-secondary text-muted-foreground")}><Icon name={icon} className="size-[18px]" /></span>
      <span className="min-w-0 flex-1 text-left"><span className="block text-[14.5px] leading-snug font-semibold break-words">{title}</span>{sub && <span className="block text-xs break-words text-muted-foreground">{sub}</span>}</span>
      {badge}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </>
  )
  const cls = cn("press flex w-full items-center gap-3 rounded-lg px-2 py-2 hover:bg-hover", className)
  return href ? <AppLink href={href} className={cls}>{inner}</AppLink> : <button type="button" onClick={onClick} className={cls}>{inner}</button>
}

export function Steps({ steps, className }: { steps: string[]; className?: string }) {
  return (
    <ol className={cn("grid gap-3", className)}>
      {steps.map((p, i) => (
        <li key={i} className="flex gap-3">
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-navy text-xs font-semibold text-white dark:bg-lime dark:text-navy">{i + 1}</span>
          <Html html={p} className="min-w-0 pt-1 leading-relaxed break-words" />
        </li>
      ))}
    </ol>
  )
}

export function Tips({ tips }: { tips: string[] }) {
  if (!tips.length) return null
  return (
    <div className="grid gap-2 rounded-xl border-l-4 border-lime bg-brand-soft p-4">
      {tips.map((t, i) => <p key={i} className="flex gap-2 text-sm"><Lightbulb className="mt-0.5 size-4 shrink-0 text-brand" /><Html html={t} className="min-w-0 break-words" /></p>)}
    </div>
  )
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-2 px-1"><h3 className="text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">{children}</h3>{action}</div>
}

/** "¿Te sirvió?" con sí/no. */
export function Vote({ value, onVote, onNo }: { value?: 1 | -1; onVote: (v: 1 | -1) => void; onNo?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-3 text-sm">
      <span className="text-muted-foreground">¿Te sirvió?</span>
      <Button size="xs" variant={value === 1 ? "soft" : "outline"} aria-pressed={value === 1} onClick={() => onVote(1)}><ThumbsUp /> Sí</Button>
      <Button size="xs" variant={value === -1 ? "soft" : "outline"} aria-pressed={value === -1} onClick={() => onVote(-1)}><ThumbsDown /> No</Button>
      {value === 1 && <span className="text-xs text-success">¡Gracias por contarnos!</span>}
      {value === -1 && onNo && <Button size="xs" variant="link" className="px-0" onClick={onNo}>Escríbenos tu duda</Button>}
    </div>
  )
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="grid gap-3" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3"><Skeleton className="size-9 rounded-full" /><div className="grid flex-1 gap-1.5"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div></div>
      ))}
    </div>
  )
}

export function Empty({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return <div className="grid justify-items-center gap-3 rounded-xl bg-secondary/50 p-6 text-center text-sm text-muted-foreground">{children}{action}</div>
}

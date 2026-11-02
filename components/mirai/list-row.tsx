"use client"

import { MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { Icon } from "./icon"

export type RowAction = {
  label: string; icon: string; onClick: () => void; destructive?: boolean; className?: string
  /** No sale en el celular (ni como botón ni en el menú). */
  hideOnMobile?: boolean
  /** Botón visible también en el celular (fuera del menú "⋯"), p. ej. la taza de hormiga y la papelera de un gasto. */
  inline?: boolean
  /** Texto del tooltip si debe decir algo más que `label`. */
  tip?: string
}

/** Botón de solo ícono con tooltip (la etiqueta accesible es `label`). */
export function IconAction({ a, className }: { a: RowAction; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={a.label} onClick={a.onClick} className={cn(a.destructive && "hover:text-danger", a.className, className)}><Icon name={a.icon} /></Button>
      </TooltipTrigger>
      <TooltipContent>{a.tip ?? a.label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Fila de lista (rowi de la v4): logo o ícono, título + pills, subtítulos, valor a la derecha y acciones con tooltip.
 * En celular el valor baja bajo el título y las acciones pasan a un menú "⋯" (salvo las `inline`).
 */
export function ListRow({ icon, media, iconClassName, title, badges, subtitle, extra, value, actions = [], onClick, className }: {
  icon: string; media?: React.ReactNode; iconClassName?: string; title: React.ReactNode; badges?: React.ReactNode; subtitle?: React.ReactNode; extra?: React.ReactNode
  value?: React.ReactNode; actions?: RowAction[]; onClick?: () => void; className?: string
}) {
  const menu = actions.filter((a) => !a.inline && !a.hideOnMobile)
  return (
    <li className={cn("flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-hover sm:items-center", className)}>
      {media ?? <span className={cn("grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-foreground", iconClassName)}><Icon name={icon} className="size-5" /></span>}
      <button type="button" disabled={!onClick} onClick={onClick} className="grid min-w-0 flex-1 gap-0.5 text-left disabled:cursor-default">
        <span className="flex flex-wrap items-center gap-1.5 font-semibold"><span className="min-w-0 break-words">{title}</span>{badges}</span>
        {subtitle && <span className="text-[13.5px] text-muted-foreground">{subtitle}</span>}
        {extra && <span className="text-xs text-muted-foreground">{extra}</span>}
        {value && <span className="mt-1 sm:hidden">{value}</span>}
      </button>
      {value && <span className="hidden shrink-0 text-right sm:block">{value}</span>}
      {actions.length > 0 && (
        <div className="flex shrink-0 items-center">
          {/* Escritorio: todos los botones; celular: solo los `inline` + menú con el resto */}
          {actions.map((a) => <IconAction key={a.label} a={a} className={cn(!a.inline && "max-sm:hidden")} />)}
          {menu.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Más acciones"><MoreHorizontal /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {menu.map((a, i) => (
                  <span key={a.label}>
                    {a.destructive && i > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuItem onSelect={a.onClick} variant={a.destructive ? "destructive" : "default"}><Icon name={a.icon} /> {a.label}</DropdownMenuItem>
                  </span>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </li>
  )
}

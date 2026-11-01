"use client"

import { MoreHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { Icon } from "./icon"

export type RowAction = { label: string; icon: string; onClick: () => void; destructive?: boolean; className?: string; hideOnMobile?: boolean }

/**
 * Fila de lista (rowi de la v4): ícono, título + subtítulos, valor y acciones.
 * En celular el valor baja bajo el título y las acciones pasan a un menú "⋯".
 */
export function ListRow({ icon, media, iconClassName, title, badges, subtitle, extra, value, actions = [], onClick, className }: {
  icon: string; media?: React.ReactNode; iconClassName?: string; title: React.ReactNode; badges?: React.ReactNode; subtitle?: React.ReactNode; extra?: React.ReactNode
  value?: React.ReactNode; actions?: RowAction[]; onClick?: () => void; className?: string
}) {
  return (
    <li className={cn("flex items-start gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-hover sm:items-center", className)}>
      {media ?? <span className={cn("grid size-11 shrink-0 place-items-center rounded-full bg-secondary text-foreground", iconClassName)}><Icon name={icon} className="size-5" /></span>}
      <button type="button" disabled={!onClick} onClick={onClick} className="grid min-w-0 flex-1 gap-0.5 text-left disabled:cursor-default">
        <span className="flex flex-wrap items-center gap-1.5 font-semibold"><span className="min-w-0 break-words">{title}</span>{badges}</span>
        {subtitle && <span className="text-[13.5px] text-muted-foreground">{subtitle}</span>}
        {extra && <span className="text-xs text-muted-foreground">{extra}</span>}
        {value && <span className="mt-1 sm:hidden">{value}</span>}
      </button>
      {value && <span className="hidden shrink-0 sm:block">{value}</span>}
      {actions.length > 0 && (
        <>
          <div className="hidden shrink-0 sm:flex">
            {actions.map((a) => (
              <Button key={a.label} variant="ghost" size="icon" aria-label={a.label} title={a.label} onClick={a.onClick} className={a.className}><Icon name={a.icon} /></Button>
            ))}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0 sm:hidden" aria-label="Más acciones"><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {actions.map((a) => (
                <DropdownMenuItem key={a.label} onSelect={a.onClick} variant={a.destructive ? "destructive" : "default"}><Icon name={a.icon} /> {a.label}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </li>
  )
}

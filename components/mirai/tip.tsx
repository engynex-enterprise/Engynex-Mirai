"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { Icon } from "./icon"

/** Tooltip sobre cualquier elemento (estado, pill, ícono). El hijo debe aceptar ref (botón, span, enlace). */
export function Tip({ label, children, side = "top" }: { label: React.ReactNode; children: React.ReactElement; side?: "top" | "bottom" | "left" | "right" }) {
  if (!label) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className="max-w-72">{label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Botón de solo ícono con nombre accesible y tooltip (el mismo texto). Con `href` es un enlace.
 * `destructive` lo pinta en rojo al pasar el mouse.
 */
export function IconButton({ label, icon, onClick, href, variant = "ghost", size = "icon", className, disabled, destructive, side, ...rest }: {
  label: string; icon: string | React.ReactNode; onClick?: () => void; href?: string
  variant?: "ghost" | "outline" | "secondary" | "soft"; size?: "icon" | "icon-sm" | "icon-lg"; className?: string; disabled?: boolean
  destructive?: boolean; side?: "top" | "bottom" | "left" | "right"
} & Omit<React.ComponentProps<"button">, "children" | "onClick">) {
  const glyph = typeof icon === "string" ? <Icon name={icon} /> : icon
  const cls = cn(destructive && "text-muted-foreground hover:bg-danger-soft hover:text-danger", className)
  return (
    <Tip label={label} side={side}>
      {href ? (
        <Button asChild variant={variant} size={size} className={cls} aria-label={label}><Link href={href}>{glyph}</Link></Button>
      ) : (
        <Button type="button" variant={variant} size={size} className={cls} aria-label={label} onClick={onClick} disabled={disabled} {...rest}>{glyph}</Button>
      )}
    </Tip>
  )
}

import { Check } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const STYLES = {
  pagado: "bg-success-soft text-success",
  ok: "bg-success-soft text-success",
  porVencer: "bg-warning-soft text-warning",
  warn: "bg-warning-soft text-warning",
  vencido: "bg-danger-soft text-danger",
  bad: "bg-danger-soft text-danger",
  estimado: "bg-brand-soft text-link",
  info: "bg-info-soft text-info",
  gray: "bg-muted text-muted-foreground",
  violet: "bg-info-soft text-info",
} as const
export type PillTone = keyof typeof STYLES

/**
 * Pills de estado del sistema de diseño (Pagado, Por vencer, Vencido, Estimado, Sin dato). Con `hint` muestra un
 * tooltip que explica el estado en palabras simples (abre con el mouse, con el teclado o con un toque en el celular).
 */
export function StatusPill({ tone = "gray", children, check, className, title, hint }: { tone?: PillTone; children: React.ReactNode; check?: boolean; className?: string; title?: string; hint?: React.ReactNode }) {
  const pill = (
    <span title={hint ? undefined : title} tabIndex={hint ? 0 : undefined}
      className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap [&_svg]:size-3.5", STYLES[tone], hint && "cursor-help outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}>
      {check && <Check />}{children}
    </span>
  )
  if (!hint) return pill
  return (
    <Tooltip>
      <TooltipTrigger asChild>{pill}</TooltipTrigger>
      <TooltipContent className="max-w-64">{hint}</TooltipContent>
    </Tooltip>
  )
}

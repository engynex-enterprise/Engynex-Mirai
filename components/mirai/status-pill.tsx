import { Check } from "lucide-react"
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

/** Pills de estado del sistema de diseño (Pagado, Por vencer, Vencido, Estimado, Sin dato). */
export function StatusPill({ tone = "gray", children, check, className, title }: { tone?: PillTone; children: React.ReactNode; check?: boolean; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap", STYLES[tone], className)}>
      {check && <Check className="size-3.5" />}{children}
    </span>
  )
}

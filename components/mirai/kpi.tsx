import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { Icon } from "./icon"

const TONES = {
  blue: "bg-info-soft text-info", green: "bg-success-soft text-success", red: "bg-danger-soft text-danger",
  income: "bg-success-soft text-success", expense: "bg-danger-soft text-danger",
  amber: "bg-warning-soft text-warning", violet: "bg-info-soft text-info", gray: "bg-muted text-muted-foreground", brand: "bg-brand-soft text-brand",
} as const
export type Tone = keyof typeof TONES

/** Tarjeta KPI: ícono en círculo, etiqueta, valor grande y subtítulo (kpi() de la v4). */
export function Kpi({ icon, tone = "brand", label, value, sub, valueClassName, loading }: {
  icon: string; tone?: Tone; label: string; value: React.ReactNode; sub?: React.ReactNode; valueClassName?: string; loading?: boolean
}) {
  return (
    <Card className="flex-row items-center gap-3 p-5 shadow-card ring-0">
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", TONES[tone])}><Icon name={icon} className="size-5" /></span>
      <div className="grid min-w-0 gap-0.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        {loading ? <Skeleton className="h-7 w-28" /> : <span className={cn("truncate text-[22px] leading-[30px] font-semibold", valueClassName)}>{value}</span>}
        {sub && !loading && <span className="truncate text-[12.5px] text-muted-foreground">{sub}</span>}
      </div>
    </Card>
  )
}

export function KpiGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>
}

import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { Icon } from "./icon"

// Círculos con degradado vivo e ícono blanco (estilo Meta).
const TONES = {
  blue: "bg-[linear-gradient(135deg,#5AA9FF,#1B5FA8)]", green: "bg-[linear-gradient(135deg,#9EDB4E,#2A7F14)]", red: "bg-[linear-gradient(135deg,#FF8A9B,#D0243F)]",
  income: "bg-[linear-gradient(135deg,#9EDB4E,#2A7F14)]", expense: "bg-[linear-gradient(135deg,#FF8A9B,#D0243F)]",
  amber: "bg-[linear-gradient(135deg,#FFD36B,#E08A00)]", violet: "bg-[linear-gradient(135deg,#C4A6FF,#7A4BE0)]", gray: "bg-[linear-gradient(135deg,#B0B3B8,#65676B)]", brand: "bg-brand-gradient",
} as const
export type Tone = keyof typeof TONES

/** Tarjeta KPI: ícono en círculo, etiqueta, valor grande y subtítulo (kpi() de la v4). */
export function Kpi({ icon, tone = "brand", label, value, sub, valueClassName, loading }: {
  icon: string; tone?: Tone; label: string; value: React.ReactNode; sub?: React.ReactNode; valueClassName?: string; loading?: boolean
}) {
  return (
    <Card className="lift appear flex-row items-center gap-4 rounded-lg p-5 shadow-card ring-0">
      <span className={cn("grid size-12 shrink-0 place-items-center rounded-full text-white shadow-[0_4px_12px_rgba(0,0,0,.15)]", TONES[tone])}><Icon name={icon} className="size-6" /></span>
      <div className="grid min-w-0 gap-0.5">
        <span className="text-[13px] font-medium text-muted-foreground">{label}</span>
        {loading ? <Skeleton className="h-7 w-28" /> : <span className={cn("truncate text-[24px] leading-[30px] font-bold tracking-tight", valueClassName)}>{value}</span>}
        {sub && !loading && <span className="truncate text-[13px] text-muted-foreground">{sub}</span>}
      </div>
    </Card>
  )
}

export function KpiGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 xl:grid-cols-4", className)}>{children}</div>
}

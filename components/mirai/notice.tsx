import { CircleAlert, CircleCheck, Lightbulb, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"

const V = {
  info: { bar: "bg-lime", dot: "bg-brand-soft text-[#3F7A1E] dark:text-lime", Icon: Lightbulb },
  ok: { bar: "bg-success", dot: "bg-success-soft text-success", Icon: CircleCheck },
  warn: { bar: "bg-[#E08A00]", dot: "bg-warning-soft text-[#B86E00] dark:text-[#FFB547]", Icon: TriangleAlert },
  bad: { bar: "bg-danger", dot: "bg-danger-soft text-danger", Icon: CircleAlert },
} as const

/**
 * Alerta dentro de una página al estilo de Facebook: tarjeta blanca con franja de color a la izquierda, ícono en un
 * círculo suave, título y texto (alertBox de la v4 / sistema de diseño). Misma API de siempre.
 */
export function Notice({ tone = "info", title, children, action, className }: { tone?: keyof typeof V; title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  const { bar, dot, Icon } = V[tone]
  return (
    <div role={tone === "bad" || tone === "warn" ? "alert" : "status"}
      className={cn("relative flex flex-wrap items-start gap-3 overflow-hidden rounded-lg bg-white p-3.5 pl-5 shadow-[0_1px_2px_rgba(0,0,0,.1)] ring-1 ring-black/5 sm:flex-nowrap dark:bg-[#242526] dark:ring-white/10", className)}>
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", bar)} />
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", dot)}><Icon className="size-[18px]" aria-hidden /></span>
      <div className="grid min-w-0 flex-1 basis-48 gap-0.5 self-center">
        <p className="text-[15px] leading-5 font-semibold">{title}</p>
        {children && <div className="text-sm leading-5 text-muted-foreground">{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  )
}

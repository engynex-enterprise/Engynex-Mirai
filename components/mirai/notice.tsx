import { CircleAlert, CircleCheck, Lightbulb, TriangleAlert } from "lucide-react"
import { cn } from "@/lib/utils"

const V = {
  info: { box: "bg-brand-soft", dot: "bg-lime text-navy", Icon: Lightbulb },
  ok: { box: "bg-success-soft", dot: "bg-success text-white dark:text-navy", Icon: CircleCheck },
  warn: { box: "bg-warning-soft", dot: "bg-[#E08A00] text-white", Icon: TriangleAlert },
  bad: { box: "bg-danger-soft", dot: "bg-danger text-white", Icon: CircleAlert },
} as const

/** Alerta con círculo de ícono (alertBox de la v4 / sistema de diseño). */
export function Notice({ tone = "info", title, children, action, className }: { tone?: keyof typeof V; title: string; children?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  const { box, dot, Icon } = V[tone]
  return (
    <div role={tone === "bad" || tone === "warn" ? "alert" : "status"} className={cn("flex items-start gap-3 rounded-lg p-4", box, className)}>
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", dot)}><Icon className="size-4" /></span>
      <div className="grid flex-1 gap-0.5">
        <p className="font-semibold">{title}</p>
        {children && <div className="text-sm text-foreground/90">{children}</div>}
      </div>
      {action}
    </div>
  )
}

"use client"

import { useMemo } from "react"
import Link from "next/link"
import { CalendarDays, Lightbulb, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react"
import { Card } from "@/components/ui/card"
import { useList } from "@/hooks/use-book-data"
import { useCategories } from "@/features/catalogs/hooks"
import { insights, type Insight } from "@/lib/domain/insights"
import { cn } from "@/lib/utils"

const ICON: Record<Insight["tipo"], { Icon: typeof TrendingUp; cls: string }> = {
  sube: { Icon: TrendingUp, cls: "bg-danger-soft text-danger" }, baja: { Icon: TrendingDown, cls: "bg-success-soft text-success" },
  inusual: { Icon: TriangleAlert, cls: "bg-warning-soft text-warning" }, dia: { Icon: CalendarDays, cls: "bg-info-soft text-info" }, racha: { Icon: Lightbulb, cls: "bg-brand-soft text-brand" },
}
const hoyCo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())

/** Hallazgos automáticos de tus gastos (qué subió, qué bajó, gastos fuera de lo normal y tu día de más gasto). */
export function HallazgosCard() {
  const { data: expenses } = useList("expenses")
  const { data: cats = [] } = useCategories()
  const list = useMemo(() => {
    if (!expenses) return []
    const name = (id: string | null | undefined) => cats.find((c) => c.id === id)?.nombre ?? "Sin categoría"
    return insights(expenses, name, hoyCo())
  }, [expenses, cats])
  if (!list.length) return null
  return (
    <Card className="appear gap-3 rounded-lg p-4 ring-0 sm:p-5" aria-label="Hallazgos">
      <h2 className="flex items-center gap-2 text-[17px] font-bold"><Lightbulb className="size-5 text-brand" /> Hallazgos de tus gastos</h2>
      <ul className="grid gap-2 sm:grid-cols-2">
        {list.map((h) => {
          const { Icon, cls } = ICON[h.tipo]
          const body = (
            <span className="flex items-start gap-3">
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", cls)}><Icon className="size-4.5" /></span>
              <span className="grid gap-0.5"><span className="font-semibold">{h.titulo}</span><span className="text-sm text-muted-foreground" data-money>{h.detalle}</span></span>
            </span>
          )
          return <li key={h.id}>{h.href ? <Link href={h.href} className="block rounded-lg bg-secondary/50 p-3 hover:bg-hover">{body}</Link> : <div className="rounded-lg bg-secondary/50 p-3">{body}</div>}</li>
        })}
      </ul>
    </Card>
  )
}

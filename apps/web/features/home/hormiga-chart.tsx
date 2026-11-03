"use client"

import { Bar, BarChart, Cell, XAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { fmtShort } from "@/lib/format"

const chartCfg = { v: { label: "Gasto hormiga", color: "#F7B928" } }

/** Barras del gasto hormiga por mes (Inicio). Va aparte para cargar recharts después de pintar la página. */
export default function HormigaChart({ meses, totalMes }: { meses: { l: string; v: number }[]; totalMes: number }) {
  return (
    <ChartContainer config={chartCfg} className="h-24 w-full" role="img" aria-label={`Gasto hormiga por mes; este mes ${fmtShort(totalMes)}`}>
      <BarChart data={meses} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <XAxis dataKey="l" tickLine={false} axisLine={false} fontSize={11} />
        <ChartTooltip content={<ChartTooltipContent formatter={(v) => fmtShort(Number(v))} hideIndicator />} />
        <Bar dataKey="v" radius={6}>{meses.map((_, i) => <Cell key={i} fill={i === meses.length - 1 ? "#F7B928" : "var(--secondary)"} />)}</Bar>
      </BarChart>
    </ChartContainer>
  )
}

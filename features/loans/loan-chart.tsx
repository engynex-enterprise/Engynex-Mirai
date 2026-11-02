"use client"

import { Bar, BarChart, Cell, XAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { fmtMoney } from "@/lib/format"

export type LoanChartRow = { l: string; cap: number; int: number; extra: number; paid: boolean }
type Colors = { cap: string; int: string; extra: string }

/** Barras de abono, interés y seguros por cuota. Va aparte para cargar recharts solo cuando se muestra. */
export default function LoanChart({ data, colors }: { data: LoanChartRow[]; colors: Colors }) {
  return (
    <ChartContainer config={{ cap: { label: "Abono", color: colors.cap }, int: { label: "Interés", color: colors.int }, extra: { label: "Seguros", color: colors.extra } }} className="h-36 w-full">
      <BarChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <XAxis dataKey="l" tickLine={false} axisLine={false} fontSize={10} interval="preserveStartEnd" />
        <ChartTooltip content={<ChartTooltipContent formatter={(v, n) => `${n === "cap" ? "Abono" : n === "int" ? "Interés" : "Seguros"}: ${fmtMoney(Number(v))}`} />} />
        {(["cap", "int", "extra"] as const).map((k) => (
          <Bar key={k} dataKey={k} stackId="a" fill={colors[k]}>{data.map((c, i) => <Cell key={i} fillOpacity={c.paid ? 0.45 : 1} />)}</Bar>
        ))}
      </BarChart>
    </ChartContainer>
  )
}

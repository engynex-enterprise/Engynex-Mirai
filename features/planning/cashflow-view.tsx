"use client"

import { useMemo } from "react"
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"
import { Card, CardContent } from "@/components/ui/card"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PageHeader } from "@/components/mirai/page-header"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { flujo, liquidez } from "@/lib/domain"
import { fmtMoney, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useBookData } from "@/features/book/use-book-data"

const cfg = { I: { label: "Entra", color: "#9EDB4E" }, E: { label: "Sale", color: "#E41E3F" }, saldo: { label: "Acumulado", color: "var(--navy-tone)" } }

export function CashflowView() {
  const today = todayISO()
  const { data: book, isPending } = useBookData()
  const d = useMemo(() => (book ? { F: flujo(book, today), liq: liquidez(book.assets, book.investments, book.settings.trm, today) } : null), [book, today])
  if (isPending || !d) return <PageSkeleton kpis={4} />
  const prom = d.F.reduce((a, m) => a + m.neto, 0) / (d.F.length || 1)
  const rojos = d.F.filter((m) => m.saldo < 0)
  return (
    <div className="grid gap-6">
      <PageHeader id="flujo" description="Cuánto te entra y cuánto te sale en los próximos 12 meses, y con cuánta plata quedarías al final de cada mes." />
      <KpiGrid>
        <Kpi icon="wallet" tone="blue" label="Hoy tienes disponible" value={<Money value={d.liq} />} sub="Efectivo, bancos y ahorros" />
        <Kpi icon="trending-up" tone={prom >= 0 ? "green" : "red"} label="Te sobra en promedio" value={<Money value={prom} />} valueClassName={prom >= 0 ? "text-success" : "text-danger"} sub="Por mes" />
        <Kpi icon="calendar-range" tone="brand" label="En 12 meses tendrías" value={<Money value={d.F.at(-1)?.saldo ?? 0} />} />
        <Kpi icon="circle-alert" tone={rojos.length ? "red" : "green"} label="Meses en rojo" value={rojos.length} valueClassName={rojos.length ? "text-danger" : "text-success"} sub={rojos.length ? rojos.map((m) => m.l).join(", ") : "Ninguno"} />
      </KpiGrid>
      <Card className="shadow-card ring-0">
        <CardContent className="grid gap-4">
          <ChartContainer config={cfg} className="h-64 w-full">
            <ComposedChart data={d.F} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="l" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} width={44} tickFormatter={(v) => `${Math.round(v / 1e6)}M`} />
              <ChartTooltip content={<ChartTooltipContent formatter={(v, n) => `${cfg[n as keyof typeof cfg]?.label ?? n}: ${fmtMoney(Number(v))}`} />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Bar dataKey="I" fill="var(--color-I)" radius={3} fillOpacity={0.85} />
              <Bar dataKey="E" fill="var(--color-E)" radius={3} fillOpacity={0.85} />
              <Line dataKey="saldo" stroke="var(--color-saldo)" strokeWidth={2.5} dot={{ r: 3 }} type="monotone" />
            </ComposedChart>
          </ChartContainer>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Mes</TableHead><TableHead className="text-right">Ingresos</TableHead><TableHead className="text-right">Te pagan</TableHead><TableHead className="text-right">Cuotas</TableHead><TableHead className="text-right">Gastos fijos</TableHead><TableHead className="text-right">Suscripciones</TableHead><TableHead className="text-right">Variables</TableHead><TableHead className="text-right">Resultado</TableHead><TableHead className="text-right">Acumulado</TableHead></TableRow></TableHeader>
              <TableBody>
                {d.F.map((m) => (
                  <TableRow key={m.mes}>
                    <TableCell className="capitalize">{m.l}</TableCell>
                    {[m.det.ing, m.det.cob, m.det.cuo, m.det.fij, m.det.sub, m.det.var].map((v, i) => <TableCell key={i} className="text-right"><Money value={v} /></TableCell>)}
                    <TableCell className={cn("text-right font-bold", m.neto >= 0 ? "text-success" : "text-danger")}><Money value={m.neto} /></TableCell>
                    <TableCell className={cn("text-right", m.saldo < 0 && "text-danger")}><Money value={m.saldo} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-sm text-muted-foreground">Las primas y otros ingresos extra se suman en su mes si escribes el valor en el Calendario fiscal.</p>
        </CardContent>
      </Card>
    </div>
  )
}

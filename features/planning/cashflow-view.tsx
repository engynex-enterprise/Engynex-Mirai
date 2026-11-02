"use client"

import { useMemo } from "react"
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { DataTable, type DTColumn } from "@/components/mirai/data-table"
import { Panel } from "@/components/mirai/panel"
import { PageHeader } from "@/components/mirai/page-header"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { proyeccionMeses, type MesProyeccion as Mes } from "@/lib/domain/dashboard"
import { estadoIntegral } from "@/lib/domain/flujo-integral"
import { useIntegralExtras } from "@/features/balance/use-integral"
import { fmtMoney, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useBookData } from "@/features/book/use-book-data"

const cfg = { I: { label: "Entra", color: "#9EDB4E" }, E: { label: "Sale", color: "#E41E3F" }, saldo: { label: "Acumulado", color: "var(--navy-tone)" } }

export function CashflowView() {
  const today = todayISO()
  const { data: book, isPending } = useBookData()
  const X = useIntegralExtras(book, today)
  // Mismas reglas del Balance y el Dashboard (flujo integral): cada peso cuenta una vez y el saldo arranca en tu dinero de hoy.
  const d = useMemo(() => {
    if (!book) return null
    const liq = estadoIntegral(book, today, X).liquidez
    return { F: proyeccionMeses(book, today, X, 12, liq), liq }
  }, [book, today, X])
  if (isPending || !d) return <PageSkeleton kpis={4} />
  const prom = d.F.reduce((a, m) => a + m.neto, 0) / (d.F.length || 1)
  const rojos = d.F.filter((m) => m.saldo < 0)
  const det = (id: keyof Mes["det"], header: string, info?: string): DTColumn<Mes> => ({ id, header, info, align: "right", sort: (m) => m.det[id], csv: (m) => Math.round(m.det[id]), cell: (m) => <Money value={m.det[id]} /> })
  const columns: DTColumn<Mes>[] = [
    { id: "mes", header: "Mes", csv: (m) => m.l, cell: (m) => <span className="font-medium capitalize">{m.l}{m.parcial && <span className="block text-xs font-normal text-muted-foreground normal-case">lo que falta</span>}</span> },
    det("ing", "Ingresos"), det("cob", "Te pagan", "Cuotas de préstamos que te deben"), det("cuo", "Cuotas", "Lo que pagas de deudas y tarjetas"),
    det("fij", "Gastos fijos", "Fijos, impuestos, fechas del calendario y mesadas"), det("sub", "Suscripciones"), det("var", "Variables", "Lo que te falta gastar según tu presupuesto y los gastos con fecha futura"),
    det("aho", "Ahorro", "Aportes a metas, fondo de emergencia e inversiones nuevas"),
    { id: "neto", header: "Resultado", align: "right", info: "Lo que entra menos lo que sale ese mes", sort: (m) => m.neto, csv: (m) => Math.round(m.neto), cell: (m) => <Money value={m.neto} className={cn("font-bold", m.neto >= 0 ? "text-success" : "text-danger")} /> },
    { id: "saldo", header: "Acumulado", align: "right", sort: (m) => m.saldo, csv: (m) => Math.round(m.saldo), cell: (m) => <Money value={m.saldo} className={cn(m.saldo < 0 && "text-danger")} /> },
  ]
  return (
    <div className="grid gap-6">
      <PageHeader id="flujo" description="Cuánto te entra y cuánto te sale en los próximos 12 meses, y con cuánta plata quedarías al final de cada mes." />
      <KpiGrid>
        <Kpi icon="wallet" tone="blue" label="Hoy tienes disponible" value={<Money value={d.liq} />} sub="Efectivo, bancos y ahorros" />
        <Kpi icon="trending-up" tone={prom >= 0 ? "green" : "red"} label="Te sobra en promedio" value={<Money value={prom} />} valueClassName={prom >= 0 ? "text-success" : "text-danger"} sub="Por mes" />
        <Kpi icon="calendar-range" tone="brand" label="En 12 meses tendrías" value={<Money value={d.F.at(-1)?.saldo ?? 0} />} />
        <Kpi icon="circle-alert" tone={rojos.length ? "red" : "green"} label="Meses en rojo" value={rojos.length} valueClassName={rojos.length ? "text-danger" : "text-success"} sub={rojos.length ? rojos.map((m) => m.l).join(", ") : "Ninguno"} />
      </KpiGrid>
      <Panel title="Entra, sale y con cuánto quedas" icon="chart-column" description="Barras: lo que entra y lo que sale cada mes. Línea: la plata que tendrías acumulada.">
        <ChartContainer config={cfg} className="h-64 w-full" role="img" aria-label="Gráfica de lo que entra, lo que sale y el acumulado de los próximos 12 meses">
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
      </Panel>
      <DataTable title="Mes a mes" info="El detalle de cada mes: lo que entra, lo que sale por tipo y con cuánto quedarías."
        data={d.F} columns={columns} rowKey={(m) => m.mes} exportName="flujo-de-caja" pageSize={12}
        footer="El mes en curso solo cuenta lo que falta (lo que ya pasó ya está en tu saldo de hoy). Las primas y otros ingresos se suman en su mes si escribes el valor en el Calendario fiscal." />
    </div>
  )
}

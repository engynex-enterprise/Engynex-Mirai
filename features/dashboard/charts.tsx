"use client"

// Gráficas del Dashboard (recharts). Van en un archivo aparte para cargarlas con next/dynamic después de pintar.
// Colores: paleta categórica validada (daltonismo, contraste y modo oscuro con su propio tono) en el orden fijo de
// ./palette.ts; cada serie conserva su color aunque cambie el periodo.
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { MesSerie } from "@/lib/domain/dashboard"
import { fmtMoney } from "@/lib/format"
import { VIZ } from "./palette"

/** Eje en pesos abreviado: "1,5 M", "800 mil". */
const tick = (v: number) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toLocaleString("es-CO", { maximumFractionDigits: 1 })} M` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3)} mil` : String(Math.round(v)))
const money = (cfg: ChartConfig) => (v: unknown, n: unknown) => `${cfg[String(n)]?.label ?? n}: ${fmtMoney(Number(v))}`

const mesesCfg = {
  entra: { label: "Entra", theme: VIZ[0] },
  sale: { label: "Sale (gastos y deudas)", theme: VIZ[1] },
  ahorro: { label: "Ahorras", theme: VIZ[2] },
  queda: { label: "Te queda", theme: { light: "#1C2B33", dark: "#E4E6EB" } },
} satisfies ChartConfig

/** Entra, sale y ahorro de cada mes (barras) y lo que queda (línea). Un solo eje: todo en pesos. */
export function MesesChart({ data }: { data: MesSerie[] }) {
  return (
    <ChartContainer config={mesesCfg} className="h-64 w-full sm:h-72" role="img" aria-label="Gráfica de lo que entra, lo que sale, lo que ahorras y lo que te queda en los últimos 12 meses">
      <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barGap={2}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="l" tickLine={false} axisLine={false} fontSize={11} interval="preserveStartEnd" />
        <YAxis tickLine={false} axisLine={false} fontSize={11} width={48} tickFormatter={tick} />
        <ChartTooltip content={<ChartTooltipContent formatter={money(mesesCfg)} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="entra" fill="var(--color-entra)" radius={[4, 4, 0, 0]} maxBarSize={18} />
        <Bar dataKey="sale" fill="var(--color-sale)" radius={[4, 4, 0, 0]} maxBarSize={18} />
        <Bar dataKey="ahorro" fill="var(--color-ahorro)" radius={[4, 4, 0, 0]} maxBarSize={18} />
        <Line dataKey="queda" stroke="var(--color-queda)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "var(--card)" }} type="monotone" />
      </ComposedChart>
    </ChartContainer>
  )
}

const catCfg = { v: { label: "Gastaste", theme: VIZ[0] } } satisfies ChartConfig

/** Gastos por categoría, de mayor a menor (barras horizontales, una sola serie). */
export function CategoriasChart({ data }: { data: { cat: string; v: number }[] }) {
  return (
    <ChartContainer config={catCfg} className="w-full" style={{ height: Math.max(120, data.length * 34 + 16) }} role="img" aria-label={`Gastos por categoría: ${data.map((d) => `${d.cat} ${fmtMoney(d.v)}`).join(", ")}`}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barCategoryGap={6}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="cat" tickLine={false} axisLine={false} fontSize={12} width={104} tickFormatter={(v: string) => (v.length > 15 ? v.slice(0, 14) + "…" : v)} />
        <ChartTooltip content={<ChartTooltipContent formatter={money(catCfg)} hideIndicator />} />
        <Bar dataKey="v" fill="var(--color-v)" radius={[0, 4, 4, 0]} maxBarSize={22} />
      </BarChart>
    </ChartContainer>
  )
}

/** Una serie en el tiempo (patrimonio, saldo de deudas) como área suave. */
export function SerieChart({ data, label, color, aria }: { data: { l: string; v: number }[]; label: string; color: { light: string; dark: string }; aria: string }) {
  const cfg = { v: { label, theme: color } } satisfies ChartConfig
  return (
    <ChartContainer config={cfg} className="h-48 w-full" role="img" aria-label={aria}>
      <AreaChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="l" tickLine={false} axisLine={false} fontSize={11} interval="preserveStartEnd" minTickGap={16} />
        <YAxis tickLine={false} axisLine={false} fontSize={11} width={48} tickFormatter={tick} />
        <ChartTooltip content={<ChartTooltipContent formatter={money(cfg)} hideIndicator />} />
        <Area dataKey="v" stroke="var(--color-v)" strokeWidth={2} fill="var(--color-v)" fillOpacity={0.15} type="monotone" dot={data.length <= 12 ? { r: 3, strokeWidth: 2, fill: "var(--card)" } : false} />
      </AreaChart>
    </ChartContainer>
  )
}

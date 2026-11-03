"use client"

import { useQuery } from "@tanstack/react-query"
import { Bar, BarChart, XAxis } from "recharts"
import { Panel, SectionTitle } from "@/components/mirai/panel"
import { ToneIcon } from "@/components/mirai/tone-icon"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Notice } from "@/components/mirai/notice"
import { StatusPill } from "@/components/mirai/status-pill"
import { DataTable, DTTwoLine } from "@/components/mirai/data-table"
import { AI_FEATURES, FUENTE_LABEL, featureLabel } from "@/lib/ai/features"
import { fmtDate } from "@/lib/format"
import { myAiUsage, type MyAiUsage } from "./actions"

const n = (x: number, d = 0) => x.toLocaleString("es-CO", { maximumFractionDigits: d })
const usd = (x: number) => `US$ ${x.toLocaleString("es-CO", { minimumFractionDigits: x && x < 0.01 ? 4 : 2, maximumFractionDigits: x && x < 0.01 ? 4 : 2 })}`
const cop = (x: number) => `$ ${Math.round(x).toLocaleString("es-CO")}`
const chartCfg = { ia: { label: "Con IA", color: "#7A4BE0" }, sinIa: { label: "Sin gastar IA", color: "var(--brand)" } }

/** Hook compartido (pestaña de uso y aviso del 80 % en la pestaña de IA). */
export const useAiUsage = () => useQuery({ queryKey: ["ai-usage"], queryFn: () => myAiUsage(), staleTime: 60_000 })

/** Aviso corto del cupo (80 % y 100 %) para mostrar en otras pantallas. */
export function AiQuotaNotice() {
  const { data } = useAiUsage()
  if (!data || !data.incluyeIa) return null
  const q = data.quota
  if (q.nivel === "agotado") return <Notice tone="bad" title="Usaste todos los créditos de IA de este mes">Se renuevan el primer día del próximo mes. Mientras tanto Mirai sigue funcionando con tus reglas y cálculos. Mira el detalle en Ajustes › Uso de IA.</Notice>
  if (q.nivel === "aviso") return <Notice tone="warn" title={`Llevas el ${n(q.pct)} % de tus créditos de IA del mes`}>Te quedan {n(q.quedan ?? 0)} créditos. Mira en qué se usaron en Ajustes › Uso de IA.</Notice>
  return null
}

export function AiUsageView() {
  const { data, isPending } = useAiUsage()
  if (isPending) return <div className="grid gap-6" aria-busy="true" aria-label="Cargando"><Skeleton className="h-32 rounded-lg" /><KpiGrid>{[0, 1, 2, 3].map((i) => <Kpi key={i} icon="sparkles" label="" value="" loading />)}</KpiGrid><Skeleton className="h-64 rounded-lg" /><Skeleton className="h-72 rounded-lg" /></div>
  if (!data) return <Notice tone="bad" title="No pudimos cargar el uso de la IA">Intenta de nuevo en un momento.</Notice>
  return <Body d={data} />
}

function Body({ d }: { d: MyAiUsage }) {
  const q = d.quota
  const limitado = q.cupo !== null
  const maxFn = Math.max(1, ...d.porFuncion.map((f) => f.llamadas))
  return (
    <div className="grid gap-6">
      {!d.incluyeIa && <Notice tone="info" title="Tu plan no incluye inteligencia artificial">Con Premium tienes consejero, chat, lectura de facturas y más. Conoce los planes en Ajustes › Mi plan.</Notice>}
      <AiQuotaNotice />

      <Panel className="h-auto">
        <SectionTitle as="h3" icon="gauge" description={`Plan ${d.plan}. Cada consulta a la IA gasta créditos según su tamaño; se renuevan el primer día de cada mes. 1 crédito ≈ ${usd(d.creditUsd)}.`}
          action={<p className="text-2xl font-bold tabular-nums">{n(q.usados, 1)}<span className="text-base font-medium text-muted-foreground"> / {limitado ? n(q.cupo!) : "sin límite"}</span></p>}>Créditos de IA de este mes</SectionTitle>
        {limitado && <Progress value={q.pct} aria-label="Créditos usados" className={q.nivel === "agotado" ? "[&>div]:bg-danger" : q.nivel === "aviso" ? "[&>div]:bg-[#E08A00]" : "[&>div]:bg-brand-gradient"} />}
        <p className="text-xs text-muted-foreground">Las respuestas que Mirai calcula sola (sin IA) y las que repite de una consulta igual reciente no gastan créditos. Si usas tu propia clave de IA, tampoco: ese costo lo cobra tu proveedor.</p>
      </Panel>

      <KpiGrid>
        <Kpi icon="gauge" tone={q.nivel === "agotado" ? "red" : q.nivel === "aviso" ? "amber" : "brand"} label="Te quedan" value={limitado ? `${n(q.quedan ?? 0, 1)} créditos` : "Sin límite"} sub={limitado ? `${n(q.pct)} % usado` : undefined} />
        <Kpi icon="sparkles" tone="violet" label="Consultas este mes" value={n(d.mes.llamadas)} sub={`${n(d.mes.ia)} con IA · ${n(d.mes.cache + d.mes.algoritmo)} sin gastar IA`} />
        <Kpi icon="coins" tone="blue" label="Costo estimado del mes" value={<span data-money>{usd(d.mes.usd)}</span>} sub={d.mes.cop ? <span data-money>≈ {cop(d.mes.cop)} con la TRM</span> : `${n(d.mes.tokensIn + d.mes.tokensOut)} tokens`} />
        <Kpi icon="leaf" tone="green" label="Ahorro con cálculos de Mirai" value={`${n(d.ahorro.pct)} %`} sub={`${n(d.ahorro.llamadas)} consultas · ~${n(d.ahorro.tokens)} tokens evitados`} />
      </KpiGrid>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Panel as="h3" icon="chart-column" title="Consultas por día" description="Últimos 30 días: con IA y resueltas sin gastar IA.">
          <ChartContainer config={chartCfg} className="h-48 w-full">
            <BarChart data={d.porDia.map((x) => ({ ...x, l: x.k.slice(8) }))} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="l" tickLine={false} axisLine={false} fontSize={11} interval={4} />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => fmtDate(String(p?.[0]?.payload?.k ?? ""))} />} />
              <Bar dataKey="ia" stackId="a" fill="var(--color-ia)" radius={[0, 0, 0, 0]} />
              <Bar dataKey="sinIa" stackId="a" fill="var(--color-sinIa)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </Panel>
        <Panel as="h3" icon="list" title="Por función (este mes)">
          {!d.porFuncion.length ? <p className="text-sm text-muted-foreground">Aún no hay consultas este mes.</p> : (
            <ul className="grid gap-2.5">
              {d.porFuncion.map((f) => (
                <li key={f.k} className="grid gap-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2"><ToneIcon icon={(AI_FEATURES as Record<string, { icon: string }>)[f.k]?.icon ?? "sparkles"} tone="violet" size="sm" /><span className="truncate">{featureLabel(f.k)}</span></span>
                    <span className="shrink-0 font-semibold tabular-nums">{n(f.creditos, 1)} cr.</span>
                  </div>
                  <span className="h-1.5 rounded-full bg-secondary"><span className="block h-full rounded-full bg-brand" style={{ width: `${(f.llamadas / maxFn) * 100}%` }} /></span>
                  <span className="text-xs text-muted-foreground">{n(f.llamadas)} consultas · {n(f.ia)} con IA</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {d.propia.llamadas > 0 && <Notice tone="info" title="Consultas con tu propia clave">Este mes hiciste {n(d.propia.llamadas)} consultas con tu clave de IA: costo estimado {usd(d.propia.usd)}, que cobra tu proveedor (no gastan créditos de Mirai).</Notice>}

      <DataTable<MyAiUsage["recientes"][number]>
        title="Últimas consultas" info="Lo que se le pidió a la IA, sin el contenido (Mirai no guarda tus preguntas aquí)." data={d.recientes} rowKey={(r) => r.id} pageSize={10}
        initialSort={{ id: "fecha", dir: "desc" }} exportName="uso-ia"
        filters={[{ id: "fuente", label: "Origen", options: Object.entries(FUENTE_LABEL).map(([value, label]) => ({ value, label })), match: (r, v) => r.fuente === v }]}
        columns={[
          { id: "fecha", header: "Fecha", sort: (r) => r.created_at, csv: (r) => r.created_at, cell: (r) => <DTTwoLine top={fmtDate(r.created_at.slice(0, 10))} bottom={new Date(r.created_at).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" })} /> },
          { id: "funcion", header: "Función", sort: (r) => featureLabel(r.feature), csv: (r) => featureLabel(r.feature), cell: (r) => <DTTwoLine top={featureLabel(r.feature)} bottom={r.model ?? FUENTE_LABEL[r.fuente]} /> },
          { id: "origen", header: "Origen", csv: (r) => FUENTE_LABEL[r.fuente], cell: (r) => !r.ok ? <StatusPill tone="bad">Falló</StatusPill> : r.fuente === "ia" ? <StatusPill tone={r.de_plataforma ? "estimado" : "gray"}>{r.de_plataforma ? "IA de Mirai" : "Tu clave"}</StatusPill> : <StatusPill tone="ok">{FUENTE_LABEL[r.fuente]}</StatusPill> },
          { id: "tokens", header: "Tokens", align: "right", sort: (r) => r.input_tokens + r.output_tokens, csv: (r) => r.input_tokens + r.output_tokens, cell: (r) => <span className="tabular-nums">{n(r.input_tokens + r.output_tokens)}</span> },
          { id: "creditos", header: "Créditos", align: "right", sort: (r) => r.creditos, csv: (r) => r.creditos, cell: (r) => <span className="tabular-nums">{n(r.creditos, 2)}</span> },
        ]}
        empty={<p className="p-6 text-center text-sm text-muted-foreground">Aún no has usado la IA.</p>}
      />
    </div>
  )
}

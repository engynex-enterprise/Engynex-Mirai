"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Bar, BarChart, XAxis } from "recharts"
import { toast } from "@/components/mirai/toast"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Segmented } from "@/components/mirai/choice-cards"
import { StatusPill } from "@/components/mirai/status-pill"
import { DataTable, DTTwoLine } from "@/components/mirai/data-table"
import { featureLabel } from "@/lib/ai/features"
import { fmtDate } from "@/lib/format"
import { adminAiUsage, adminClearAiCache, adminSaveAiSettings, adminSetModelPrice, adminSetPlanAiCupo, type AdminAiUsage } from "./ia-server"

const n = (x: number, d = 0) => x.toLocaleString("es-CO", { maximumFractionDigits: d })
const usd = (x: number) => `US$ ${x.toLocaleString("es-CO", { minimumFractionDigits: x && x < 1 ? 4 : 2, maximumFractionDigits: x && x < 1 ? 4 : 2 })}`
const chartCfg = { usd: { label: "Costo (US$)", color: "#7A4BE0" } }
const KIND: Record<string, string> = { ai_gateway: "Vercel AI Gateway", ai_gemini: "Google Gemini", ai_groq: "Groq", ai_openrouter: "OpenRouter", ai_anthropic: "Claude", ai_openai: "OpenAI" }

/** Consola › Uso de IA: llamadas, tokens, costo por día, modelo, función y plan; top hogares (sin datos financieros) y cupos/precios. */
export function AiAdminPanel() {
  const [dias, setDias] = useState("30")
  const { data, isPending } = useQuery({ queryKey: ["admin", "ai-usage", dias], queryFn: () => adminAiUsage(+dias) })
  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Costos estimados con la tabla de precios, salvo cuando el proveedor informa el costo real (AI Gateway, OpenRouter). Nunca se guardan las preguntas ni los datos de los hogares.</p>
        <Segmented value={dias} onChange={setDias} items={[{ value: "7", label: "7 días" }, { value: "30", label: "30 días" }, { value: "90", label: "90 días" }]} />
      </div>
      {isPending || !data ? <><KpiGrid>{[0, 1, 2, 3].map((i) => <Kpi key={i} icon="sparkles" label="" value="" loading />)}</KpiGrid><Skeleton className="h-64" /><Skeleton className="h-72" /></> : <Body d={data} />}
    </div>
  )
}

function Body({ d }: { d: AdminAiUsage }) {
  const t = d.totales
  return (
    <>
      <KpiGrid>
        <Kpi icon="sparkles" tone="violet" label="Consultas" value={n(t.llamadas)} sub={`${n(t.ia)} con IA · ${n(t.errores)} fallidas`} />
        <Kpi icon="cpu" tone="blue" label="Tokens" value={n(t.tokensIn + t.tokensOut)} sub={`${n(t.tokensIn)} entrada · ${n(t.tokensOut)} salida · ${n(t.tokensCache)} en caché`} />
        <Kpi icon="coins" tone="amber" label="Costo" value={usd(t.usd)} sub={d.trm ? `≈ $ ${n(t.usd * d.trm)} · ${n(t.creditos, 1)} créditos` : `${n(t.creditos, 1)} créditos`} />
        <Kpi icon="leaf" tone="green" label="Ahorro (caché + algoritmos)" value={`${n(d.ahorro.pct)} %`} sub={`${n(d.ahorro.llamadas)} consultas · ~${usd(d.ahorro.usd)} · ${n(d.cache.vigentes)} respuestas guardadas`} />
      </KpiGrid>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="gap-3 p-5 shadow-card ring-0">
          <div><h2 className="font-semibold">Costo por día</h2><p className="text-sm text-muted-foreground">Promedio de respuesta con IA: {n(t.msProm / 1000, 1)} s. Lo paga Mirai: {usd(d.plataformaVsPropia.plataforma.usd)} · con claves de los hogares: {usd(d.plataformaVsPropia.propia.usd)}.</p></div>
          <ChartContainer config={chartCfg} className="h-56 w-full">
            <BarChart data={d.porDia.map((x) => ({ k: x.k, l: x.k.slice(5), usd: x.usd, llamadas: x.llamadas }))} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="l" tickLine={false} axisLine={false} fontSize={11} interval="preserveStartEnd" />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => `${fmtDate(String(p?.[0]?.payload?.k ?? ""))} · ${n(Number(p?.[0]?.payload?.llamadas ?? 0))} consultas`} formatter={(v) => usd(Number(v))} />} />
              <Bar dataKey="usd" fill="var(--color-usd)" radius={4} />
            </BarChart>
          </ChartContainer>
        </Card>
        <Card className="gap-3 p-5 shadow-card ring-0">
          <h2 className="font-semibold">Por función</h2>
          <Bars rows={d.porFuncion.map((f) => ({ k: f.k, label: featureLabel(f.k), v: f.llamadas, sub: `${usd(f.usd)} · ${n(f.cache + f.algoritmo)} sin IA` }))} />
          <h2 className="pt-2 font-semibold">Por plan</h2>
          <Bars rows={d.porPlan.map((p) => ({ k: p.k, label: d.planes.find((x) => x.id === p.k)?.nombre ?? p.k, v: p.llamadas, sub: `${usd(p.usd)} · ${n(p.creditos, 1)} créditos` }))} />
          <h2 className="pt-2 font-semibold">Por proveedor</h2>
          <Bars rows={d.porProveedor.map((p) => ({ k: p.k, label: KIND[p.k] ?? p.k, v: p.llamadas, sub: `${usd(p.usd)} · ${n(p.errores)} fallidas` }))} />
        </Card>
      </div>

      <ModelsTable d={d} />

      <DataTable<AdminAiUsage["topHogares"][number]>
        title="Hogares que más usan la IA este mes" info="Solo consumo de IA (consultas, tokens, costo y cupo). Por privacidad no se muestran montos ni movimientos." data={d.topHogares} rowKey={(h) => h.id}
        initialSort={{ id: "usd", dir: "desc" }} exportName="ia-hogares" pageSize={10}
        columns={[
          { id: "hogar", header: "Hogar", sort: (h) => h.nombre, csv: (h) => h.nombre, cell: (h) => <DTTwoLine top={h.nombre} bottom={d.planes.find((p) => p.id === h.plan)?.nombre ?? h.plan ?? "—"} /> },
          { id: "llamadas", header: "Consultas", align: "right", sort: (h) => h.llamadas, csv: (h) => h.llamadas, cell: (h) => <span className="tabular-nums">{n(h.llamadas)}</span> },
          { id: "tokens", header: "Tokens", align: "right", sort: (h) => h.tokens, csv: (h) => h.tokens, cell: (h) => <span className="tabular-nums">{n(h.tokens)}</span> },
          { id: "usd", header: "Costo", align: "right", sort: (h) => h.usd, csv: (h) => h.usd, cell: (h) => <span className="tabular-nums">{usd(h.usd)}</span> },
          { id: "cupo", header: "Cupo usado", align: "right", sort: (h) => h.pct, csv: (h) => h.pct, cell: (h) => h.nivel === "sin_limite" ? <StatusPill tone="gray">Sin límite</StatusPill> : <StatusPill tone={h.nivel === "agotado" ? "bad" : h.nivel === "aviso" ? "warn" : "ok"}>{n(h.pct)} %</StatusPill> },
        ]}
        empty={<p className="p-6 text-center text-sm text-muted-foreground">Aún no hay consumo este mes.</p>}
      />

      <Settings d={d} />
    </>
  )
}

function Bars({ rows }: { rows: { k: string; label: string; v: number; sub: string }[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">Sin datos en el periodo.</p>
  const max = Math.max(1, ...rows.map((r) => r.v))
  return (
    <ul className="grid gap-2">
      {rows.slice(0, 8).map((r) => (
        <li key={r.k} className="grid gap-1">
          <div className="flex justify-between gap-2 text-sm"><span className="truncate">{r.label}</span><span className="shrink-0 font-semibold tabular-nums">{n(r.v)}</span></div>
          <span className="h-1.5 rounded-full bg-secondary"><span className="block h-full rounded-full bg-brand" style={{ width: `${(r.v / max) * 100}%` }} /></span>
          <span className="text-xs text-muted-foreground">{r.sub}</span>
        </li>
      ))}
    </ul>
  )
}

type ModelRow = AdminAiUsage["porModelo"][number]

function ModelsTable({ d }: { d: AdminAiUsage }) {
  const qc = useQueryClient()
  const [edit, setEdit] = useState<{ model: string; in: string; out: string; cached: string } | null>(null)
  const save = async () => {
    if (!edit) return
    const p = { in: +edit.in.replace(",", "."), out: +edit.out.replace(",", "."), cached: edit.cached ? +edit.cached.replace(",", ".") : undefined }
    if (!edit.model.trim() || !(p.in >= 0) || !(p.out >= 0)) return toast.error("Escribe el modelo y los precios (US$ por millón de tokens)")
    try { await adminSetModelPrice(edit.model.trim(), p); toast.success("Precio guardado"); setEdit(null); qc.invalidateQueries({ queryKey: ["admin", "ai-usage"] }) } catch (e) { toast.error((e as Error).message) }
  }
  const quitar = async (m: string) => { try { await adminSetModelPrice(m, null); toast.success("Vuelve al precio de la tabla"); qc.invalidateQueries({ queryKey: ["admin", "ai-usage"] }) } catch (e) { toast.error((e as Error).message) } }
  const propios = Object.keys(d.precios.propios).filter((m) => !d.porModelo.some((x) => x.k === m))
  return (
    <div className="grid gap-3">
      <DataTable<ModelRow>
        title="Por modelo" info="Precios en US$ por millón de tokens (estimados). Si el proveedor informa el costo real, se usa ese. Edita un precio para corregir la tabla sin desplegar."
        data={d.porModelo} rowKey={(m) => m.k} initialSort={{ id: "usd", dir: "desc" }} exportName="ia-modelos" pageSize={10}
        create={{ label: "Precio de un modelo", onClick: () => setEdit({ model: "", in: "", out: "", cached: "" }) }}
        actions={[
          { label: "Editar precio", onSelect: (m) => setEdit({ model: m.k, in: String(m.precio.in), out: String(m.precio.out), cached: m.precio.cached != null ? String(m.precio.cached) : "" }) },
          { label: "Volver al precio de la tabla", onSelect: (m) => quitar(m.k), hidden: (m) => !m.propio },
        ]}
        columns={[
          { id: "modelo", header: "Modelo", sort: (m) => m.k, csv: (m) => m.k, cell: (m) => <DTTwoLine top={<span className="font-mono text-[13px]">{m.k}</span>} bottom={m.propio ? "Precio propio" : m.precio.known ? "Precio de la tabla" : "Sin precio: se usa uno genérico"} /> },
          { id: "llamadas", header: "Consultas", align: "right", sort: (m) => m.llamadas, csv: (m) => m.llamadas, cell: (m) => <span className="tabular-nums">{n(m.llamadas)}</span> },
          { id: "tokens", header: "Tokens (ent./sal.)", align: "right", sort: (m) => m.tokensIn + m.tokensOut, csv: (m) => m.tokensIn + m.tokensOut, cell: (m) => <span className="tabular-nums">{n(m.tokensIn)} / {n(m.tokensOut)}</span> },
          { id: "precio", header: "Precio ent./sal.", align: "right", csv: (m) => `${m.precio.in}/${m.precio.out}`, cell: (m) => <span className="tabular-nums">{m.precio.in} / {m.precio.out}</span> },
          { id: "usd", header: "Costo", align: "right", sort: (m) => m.usd, csv: (m) => m.usd, cell: (m) => <span className="tabular-nums">{usd(m.usd)}</span> },
        ]}
        footer={propios.length ? <p className="px-4 py-2 text-xs text-muted-foreground">Precios propios de modelos sin uso en el periodo: {propios.map((m) => <button key={m} type="button" className="mr-2 underline" onClick={() => quitar(m)}>{m} ✕</button>)}</p> : undefined}
      />
      {edit && (
        <Card className="gap-3 p-5 shadow-card ring-0">
          <h3 className="font-semibold">Precio de un modelo (US$ por millón de tokens)</h3>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="grid gap-1 text-sm sm:col-span-4">Modelo<Input className="h-11 font-mono" value={edit.model} onChange={(e) => setEdit({ ...edit, model: e.target.value })} placeholder="google/gemini-2.5-flash" /></label>
            <label className="grid gap-1 text-sm">Entrada<Input className="h-11" inputMode="decimal" value={edit.in} onChange={(e) => setEdit({ ...edit, in: e.target.value })} /></label>
            <label className="grid gap-1 text-sm">Salida<Input className="h-11" inputMode="decimal" value={edit.out} onChange={(e) => setEdit({ ...edit, out: e.target.value })} /></label>
            <label className="grid gap-1 text-sm">Entrada en caché<Input className="h-11" inputMode="decimal" value={edit.cached} onChange={(e) => setEdit({ ...edit, cached: e.target.value })} placeholder="Opcional" /></label>
          </div>
          <div className="flex gap-2"><Button onClick={save}>Guardar precio</Button><Button variant="ghost" onClick={() => setEdit(null)}>Cancelar</Button></div>
        </Card>
      )}
    </div>
  )
}

function Settings({ d }: { d: AdminAiUsage }) {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "ai-usage"] })
  const save = async (p: Parameters<typeof adminSaveAiSettings>[0], ok: string) => { try { await adminSaveAiSettings(p); toast.success(ok); refresh() } catch (e) { toast.error((e as Error).message) } }
  const num = (v: string) => { const x = +v.replace(",", "."); return Number.isFinite(x) ? x : NaN }
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card className="gap-4 p-5 shadow-card ring-0">
        <div><h2 className="font-semibold">Cupo mensual de créditos por plan</h2><p className="text-sm text-muted-foreground">Solo gastan créditos las consultas que paga Mirai (proveedor de la plataforma). Vacío = sin límite. Por defecto: Premium 1.000 (≈ US$ 1 al mes).</p></div>
        <ul className="grid gap-3">
          {d.planes.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm"><b>{p.nombre}</b>{!p.incluyeIa && <span className="ml-2 text-muted-foreground">(no incluye IA)</span>}</span>
              <Input aria-label={`Cupo de ${p.nombre}`} className="h-10 w-36 text-right" inputMode="numeric" defaultValue={p.cupo ?? ""} placeholder="Sin límite"
                onBlur={async (e) => {
                  const v = e.target.value.trim(); const c = v === "" ? null : Math.round(num(v))
                  if (c !== null && !(c >= 0)) return toast.error("Escribe un número de créditos")
                  if (c === p.cupo) return
                  try { await adminSetPlanAiCupo(p.id, c); toast.success(`Cupo de ${p.nombre} guardado`); refresh() } catch (err) { toast.error((err as Error).message) }
                }} />
            </li>
          ))}
        </ul>
      </Card>
      <Card className="gap-4 p-5 shadow-card ring-0">
        <h2 className="font-semibold">Créditos, avisos y caché</h2>
        <label className="flex items-start justify-between gap-4 text-sm"><span><b>Bloquear al llegar al 100 %</b><span className="block text-muted-foreground">Si lo apagas, el cupo solo se muestra; nadie queda sin IA.</span></span><Switch checked={d.settings.cuposActivo} onCheckedChange={(x) => save({ cuposActivo: x }, x ? "Cupos activos" : "Cupos solo informativos")} aria-label="Bloquear al llegar al cupo" /></label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm">Valor de 1 crédito (US$)<Input className="h-11" inputMode="decimal" defaultValue={d.settings.creditUsd} onBlur={(e) => { const v = num(e.target.value); if (v > 0 && v !== d.settings.creditUsd) save({ creditUsd: v }, "Valor del crédito guardado") }} /></label>
          <label className="grid gap-1 text-sm">Aviso al (%)<Input className="h-11" inputMode="numeric" defaultValue={d.settings.avisoPct} onBlur={(e) => { const v = Math.round(num(e.target.value)); if (v >= 1 && v <= 100 && v !== d.settings.avisoPct) save({ avisoPct: v }, "Aviso guardado") }} /></label>
          <label className="grid gap-1 text-sm">Caché máxima (horas)<Input className="h-11" inputMode="numeric" defaultValue={d.settings.cacheHoras} onBlur={(e) => { const v = Math.round(num(e.target.value)); if (v >= 0 && v <= 720 && v !== d.settings.cacheHoras) save({ cacheHoras: v }, v ? "Caché guardada" : "Caché apagada") }} /></label>
        </div>
        <p className="text-xs text-muted-foreground">La caché reutiliza la respuesta de una consulta idéntica del mismo hogar (0 = apagada). {n(d.cache.vigentes)} respuestas guardadas · {n(d.cache.aciertos)} veces reutilizadas.</p>
        <Button variant="outline" className="w-fit" onClick={async () => { if (!confirm("¿Vaciar todas las respuestas guardadas de la IA?")) return; try { const c = await adminClearAiCache(); toast.success(`${n(c)} respuestas borradas`); refresh() } catch (e) { toast.error((e as Error).message) } }}><Trash2 /> Vaciar caché</Button>
      </Card>
    </div>
  )
}

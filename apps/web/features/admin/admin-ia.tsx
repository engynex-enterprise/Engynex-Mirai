"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Bar, BarChart, XAxis } from "recharts"
import { toast } from "@/components/mirai/toast"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Segmented } from "@/components/mirai/choice-cards"
import { StatusPill } from "@/components/mirai/status-pill"
import { DataTable, DTPrimary } from "@/components/mirai/data-table"
import { FormField } from "@/components/mirai/field"
import { Panel, SectionTitle } from "@/components/mirai/panel"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { SubmitButton } from "@/components/mirai/submit-button"
import { ToneIcon, toneFor } from "@/components/mirai/tone-icon"
import { featureLabel } from "@/lib/ai/features"
import { fmtDate } from "@/lib/format"
import { BarList, ToggleRow, useAsk, useDialogTarget } from "./ui"
import { adminAiUsage, adminClearAiCache, adminSaveAiSettings, adminSetModelPrice, adminSetPlanAiCupo, type AdminAiUsage } from "./ia-api"

const n = (x: number, d = 0) => x.toLocaleString("es-CO", { maximumFractionDigits: d })
const usd = (x: number) => `US$ ${x.toLocaleString("es-CO", { minimumFractionDigits: x && x < 1 ? 4 : 2, maximumFractionDigits: x && x < 1 ? 4 : 2 })}`
const chartCfg = { usd: { label: "Costo (US$)", color: "#7A4BE0" } }
const KIND: Record<string, string> = { ai_gateway: "Vercel AI Gateway", ai_gemini: "Google Gemini", ai_groq: "Groq", ai_openrouter: "OpenRouter", ai_anthropic: "Claude", ai_openai: "OpenAI" }

/** Consola › Uso de IA: llamadas, tokens, costo por día, modelo, función y plan; top hogares (sin datos financieros) y cupos/precios. */
export function AiAdminPanel() {
  const [dias, setDias] = useState("30")
  const { data, isPending } = useQuery({ queryKey: ["admin", "ai-usage", dias], queryFn: () => adminAiUsage(+dias) })
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[80ch] text-sm text-muted-foreground">Costos estimados con la tabla de precios, salvo cuando el proveedor informa el costo real (AI Gateway, OpenRouter). Nunca se guardan las preguntas ni los datos de los hogares.</p>
        <Segmented value={dias} onChange={setDias} items={[{ value: "7", label: "7 días" }, { value: "30", label: "30 días" }, { value: "90", label: "90 días" }]} />
      </div>
      {isPending || !data ? <><KpiGrid>{[0, 1, 2, 3].map((i) => <Kpi key={i} icon="sparkles" label="Cargando…" value="" loading />)}</KpiGrid><div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]"><Skeleton className="h-72 rounded-lg" /><Skeleton className="h-72 rounded-lg" /></div><Skeleton className="h-72 rounded-lg" /></> : <Body d={data} />}
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel title="Costo por día" icon="chart-column" description={`Promedio de respuesta con IA: ${n(t.msProm / 1000, 1)} s. Lo paga Mirai: ${usd(d.plataformaVsPropia.plataforma.usd)} · con claves de los hogares: ${usd(d.plataformaVsPropia.propia.usd)}.`}>
          <ChartContainer config={chartCfg} className="h-56 w-full">
            <BarChart data={d.porDia.map((x) => ({ k: x.k, l: x.k.slice(5), usd: x.usd, llamadas: x.llamadas }))} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="l" tickLine={false} axisLine={false} fontSize={11} interval="preserveStartEnd" />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => `${fmtDate(String(p?.[0]?.payload?.k ?? ""))} · ${n(Number(p?.[0]?.payload?.llamadas ?? 0))} consultas`} formatter={(v) => usd(Number(v))} />} />
              <Bar dataKey="usd" fill="var(--color-usd)" radius={4} />
            </BarChart>
          </ChartContainer>
        </Panel>
        <Panel title="Por función" icon="sparkles">
          <BarList rows={d.porFuncion.map((f) => ({ k: f.k, label: featureLabel(f.k), v: f.llamadas, sub: `${usd(f.usd)} · ${n(f.cache + f.algoritmo)} sin IA` }))} />
          <SectionTitle as="h3" icon="crown" className="pt-2">Por plan</SectionTitle>
          <BarList rows={d.porPlan.map((p) => ({ k: p.k, label: d.planes.find((x) => x.id === p.k)?.nombre ?? p.k, v: p.llamadas, sub: `${usd(p.usd)} · ${n(p.creditos, 1)} créditos` }))} />
          <SectionTitle as="h3" icon="plug" className="pt-2">Por proveedor</SectionTitle>
          <BarList rows={d.porProveedor.map((p) => ({ k: p.k, label: KIND[p.k] ?? p.k, v: p.llamadas, sub: `${usd(p.usd)} · ${n(p.errores)} fallidas` }))} />
        </Panel>
      </div>

      <ModelsTable d={d} />

      <DataTable<AdminAiUsage["topHogares"][number]>
        title="Hogares que más usan la IA este mes" info="Solo consumo de IA (consultas, tokens, costo y cupo). Por privacidad no se muestran montos ni movimientos." data={d.topHogares} rowKey={(h) => h.id}
        initialSort={{ id: "usd", dir: "desc" }} exportName="ia-hogares" pageSize={10}
        columns={[
          { id: "hogar", header: "Hogar", sort: (h) => h.nombre, csv: (h) => h.nombre, cell: (h) => <DTPrimary media={<ToneIcon icon="house" tone={toneFor(h.nombre)} />} title={h.nombre} sub={d.planes.find((p) => p.id === h.plan)?.nombre ?? h.plan ?? "—"} /> },
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

type ModelRow = AdminAiUsage["porModelo"][number]

type PriceEdit = { model: string; in: string; out: string; cached: string; isNew: boolean }
const dnum = (v: string) => +v.replace(",", ".")

function PriceDialog({ init, open, onOpenChange }: { init: PriceEdit; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const [e, setE] = useState(init)
  const [busy, setBusy] = useState(false)
  const ok = (v: string) => v.trim() !== "" && dnum(v) >= 0
  const valid = !!e.model.trim() && ok(e.in) && ok(e.out) && (!e.cached.trim() || ok(e.cached))
  const save = async () => {
    setBusy(true)
    try { await adminSetModelPrice(e.model.trim(), { in: dnum(e.in), out: dnum(e.out), cached: e.cached.trim() ? dnum(e.cached) : undefined }); toast.success("Precio guardado"); onOpenChange(false); qc.invalidateQueries({ queryKey: ["admin", "ai-usage"] }) }
    catch (err) { toast.error((err as Error).message) }
    finally { setBusy(false) }
  }
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={e.isNew ? "Precio de un modelo" : `Precio de ${init.model}`} description="En US$ por millón de tokens. Corrige la tabla sin desplegar; si el proveedor informa el costo real, se usa ese."
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><SubmitButton disabled={!valid} loading={busy} hint="Escribe el modelo y los precios de entrada y salida" onClick={save}>Guardar precio</SubmitButton></>}>
      <FieldGroup>
        <FormField label="Modelo" htmlFor="mp-model" required tip={false}><Input id="mp-model" className="h-11 font-mono" disabled={!e.isNew} value={e.model} onChange={(x) => setE({ ...e, model: x.target.value })} placeholder="google/gemini-2.5-flash" /></FormField>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Entrada" htmlFor="mp-in" required tip={false}><Input id="mp-in" className="h-11" inputMode="decimal" value={e.in} onChange={(x) => setE({ ...e, in: x.target.value })} placeholder="0,30" /></FormField>
          <FormField label="Salida" htmlFor="mp-out" required tip={false}><Input id="mp-out" className="h-11" inputMode="decimal" value={e.out} onChange={(x) => setE({ ...e, out: x.target.value })} placeholder="2,50" /></FormField>
          <FormField label="Entrada en caché" htmlFor="mp-c" tip={false}><Input id="mp-c" className="h-11" inputMode="decimal" value={e.cached} onChange={(x) => setE({ ...e, cached: x.target.value })} placeholder="Opcional" /></FormField>
        </div>
      </FieldGroup>
    </ResponsiveDialog>
  )
}

function ModelsTable({ d }: { d: AdminAiUsage }) {
  const qc = useQueryClient()
  const edit = useDialogTarget<PriceEdit>()
  const quitar = async (m: string) => { try { await adminSetModelPrice(m, null); toast.success("Vuelve al precio de la tabla"); qc.invalidateQueries({ queryKey: ["admin", "ai-usage"] }) } catch (e) { toast.error((e as Error).message) } }
  const propios = Object.keys(d.precios.propios).filter((m) => !d.porModelo.some((x) => x.k === m))
  return (
    <>
      <DataTable<ModelRow>
        title="Por modelo" info="Precios en US$ por millón de tokens (estimados). Si el proveedor informa el costo real, se usa ese. Edita un precio para corregir la tabla sin desplegar."
        data={d.porModelo} rowKey={(m) => m.k} initialSort={{ id: "usd", dir: "desc" }} exportName="ia-modelos" pageSize={10}
        search={{ placeholder: "Buscar modelo", text: (m) => m.k }}
        filters={[{ id: "precio", label: "Precio", options: [{ value: "propio", label: "Precio propio" }, { value: "tabla", label: "Precio de la tabla" }, { value: "sin", label: "Sin precio" }], match: (m, v) => (v === "propio" ? m.propio : v === "tabla" ? !m.propio && m.precio.known : !m.propio && !m.precio.known) }]}
        create={{ label: "Precio de un modelo", onClick: () => edit.show({ model: "", in: "", out: "", cached: "", isNew: true }) }}
        actions={[
          { label: "Editar precio", onSelect: (m) => edit.show({ model: m.k, in: String(m.precio.in), out: String(m.precio.out), cached: m.precio.cached != null ? String(m.precio.cached) : "", isNew: false }) },
          { label: "Volver al precio de la tabla", onSelect: (m) => quitar(m.k), hidden: (m) => !m.propio },
        ]}
        columns={[
          { id: "modelo", header: "Modelo", sort: (m) => m.k, csv: (m) => m.k, cell: (m) => <DTPrimary media={<ToneIcon icon="cpu" tone={m.propio ? "violet" : m.precio.known ? "blue" : "amber"} />} title={<span className="font-mono text-[13px] break-all">{m.k}</span>} sub={m.propio ? "Precio propio" : m.precio.known ? "Precio de la tabla" : "Sin precio: se usa uno genérico"} /> },
          { id: "llamadas", header: "Consultas", align: "right", sort: (m) => m.llamadas, csv: (m) => m.llamadas, cell: (m) => <span className="tabular-nums">{n(m.llamadas)}</span> },
          { id: "tokens", header: "Tokens (ent./sal.)", align: "right", sort: (m) => m.tokensIn + m.tokensOut, csv: (m) => m.tokensIn + m.tokensOut, cell: (m) => <span className="tabular-nums">{n(m.tokensIn)} / {n(m.tokensOut)}</span> },
          { id: "precio", header: "Precio ent./sal.", info: "US$ por millón de tokens.", align: "right", csv: (m) => `${m.precio.in}/${m.precio.out}`, cell: (m) => <span className="tabular-nums">{m.precio.in} / {m.precio.out}</span> },
          { id: "usd", header: "Costo", align: "right", sort: (m) => m.usd, csv: (m) => m.usd, cell: (m) => <span className="tabular-nums">{usd(m.usd)}</span> },
        ]}
        footer={propios.length ? <p>Precios propios de modelos sin uso en el periodo: {propios.map((m) => <button key={m} type="button" aria-label={`Quitar el precio propio de ${m}`} className="mr-2 rounded font-mono underline hover:text-danger" onClick={() => quitar(m)}>{m} ✕</button>)}</p> : undefined}
      />
      {edit.value && <PriceDialog key={edit.key} init={edit.value} open={edit.open} onOpenChange={edit.onOpenChange} />}
    </>
  )
}

function Settings({ d }: { d: AdminAiUsage }) {
  const qc = useQueryClient()
  const ask = useAsk()
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "ai-usage"] })
  const save = async (p: Parameters<typeof adminSaveAiSettings>[0], ok: string) => { try { await adminSaveAiSettings(p); toast.success(ok); refresh() } catch (e) { toast.error((e as Error).message) } }
  const num = (v: string) => { const x = dnum(v); return Number.isFinite(x) ? x : NaN }
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title="Cupo mensual de créditos por plan" icon="gauge" description="Solo gastan créditos las consultas que paga Mirai (proveedor de la plataforma). Vacío = sin límite. Por defecto: Premium 1.000 (≈ US$ 1 al mes). Se guarda al salir del campo.">
        <ul className="grid divide-y">
          {d.planes.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
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
      </Panel>
      <Panel title="Créditos, avisos y caché" icon="settings">
        <ToggleRow title="Bloquear al llegar al 100 %" label="Bloquear al llegar al cupo" desc="Si lo apagas, el cupo solo se muestra; nadie queda sin IA." checked={d.settings.cuposActivo} onChange={(x) => save({ cuposActivo: x }, x ? "Cupos activos" : "Cupos solo informativos")} />
        <div className="grid gap-3 sm:grid-cols-3">
          <FormField label="Valor de 1 crédito (US$)" htmlFor="ia-cr" tip={false}><Input id="ia-cr" className="h-11" inputMode="decimal" defaultValue={d.settings.creditUsd} onBlur={(e) => { const v = num(e.target.value); if (v > 0 && v !== d.settings.creditUsd) save({ creditUsd: v }, "Valor del crédito guardado") }} /></FormField>
          <FormField label="Aviso al (%)" htmlFor="ia-av" tip={false}><Input id="ia-av" className="h-11" inputMode="numeric" defaultValue={d.settings.avisoPct} onBlur={(e) => { const v = Math.round(num(e.target.value)); if (v >= 1 && v <= 100 && v !== d.settings.avisoPct) save({ avisoPct: v }, "Aviso guardado") }} /></FormField>
          <FormField label="Caché máxima (horas)" htmlFor="ia-ca" tip={false}><Input id="ia-ca" className="h-11" inputMode="numeric" defaultValue={d.settings.cacheHoras} onBlur={(e) => { const v = Math.round(num(e.target.value)); if (v >= 0 && v <= 720 && v !== d.settings.cacheHoras) save({ cacheHoras: v }, v ? "Caché guardada" : "Caché apagada") }} /></FormField>
        </div>
        <p className="text-xs text-muted-foreground">La caché reutiliza la respuesta de una consulta idéntica del mismo hogar (0 = apagada). {n(d.cache.vigentes)} respuestas guardadas · {n(d.cache.aciertos)} veces reutilizadas.</p>
        <Button variant="outline" className="w-fit text-danger hover:bg-danger-soft hover:text-danger" onClick={async () => { if (!(await ask.confirm({ title: "¿Vaciar todas las respuestas guardadas de la IA?", description: "Las próximas consultas se vuelven a calcular con la IA (y cuestan).", confirmLabel: "Vaciar caché", destructive: true }))) return; try { const c = await adminClearAiCache(); toast.success(`${n(c)} respuestas borradas`); refresh() } catch (e) { toast.error((e as Error).message) } }}><Trash2 /> Vaciar caché</Button>
      </Panel>
      {ask.node}
    </div>
  )
}

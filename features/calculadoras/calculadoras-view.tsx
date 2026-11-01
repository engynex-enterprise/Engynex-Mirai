"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { PageHeader } from "@/components/mirai/page-header"
import { Segmented } from "@/components/mirai/choice-cards"
import { createClient } from "@/utils/supabase/client"
import { ahorro, aporteParaMeta, cdt, credito, gmf, inflacion } from "@/lib/domain/calculadoras"

const $ = (n: number) => `$${Math.round(n).toLocaleString("es-CO")}`
const TABS = [
  { value: "cdt", label: "CDT", icon: "landmark" }, { value: "credito", label: "Crédito", icon: "credit-card" }, { value: "ahorro", label: "Ahorro y metas", icon: "piggy-bank" },
  { value: "gmf", label: "4×1000", icon: "percent" }, { value: "inflacion", label: "Inflación", icon: "trending-up" },
]

function Num({ id, label, value, onChange, suffix, min = 0, max, step = 1, hint }: { id: string; label: string; value: number; onChange: (n: number) => void; suffix?: string; min?: number; max?: number; step?: number; hint?: string }) {
  return (
    <FormField label={label} htmlFor={id} tip={false} hint={hint}>
      <div className="relative"><Input id={id} type="number" inputMode="decimal" min={min} max={max} step={step} className="h-11 pr-14" value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(+e.target.value)} />{suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-muted-foreground">{suffix}</span>}</div>
    </FormField>
  )
}

function Result({ items, nota }: { items: { k: string; v: string; strong?: boolean }[]; nota?: string }) {
  return (
    <Card className="gap-3 bg-brand-soft/60 p-5 shadow-none ring-0">
      {items.map((x) => <div key={x.k} className="flex items-baseline justify-between gap-3"><span className="text-sm text-muted-foreground">{x.k}</span><span className={x.strong ? "text-2xl font-bold tabular-nums" : "font-semibold tabular-nums"} data-money>{x.v}</span></div>)}
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </Card>
  )
}

function Cdt() {
  const [v, setV] = useState({ monto: 5_000_000, ea: 10, dias: 180, ret: 4 })
  const r = cdt({ monto: v.monto, ea: v.ea, dias: v.dias, retencion: v.ret })
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="grid gap-4">
        <FormField label="¿Cuánto vas a invertir?" htmlFor="c-m" tip={false}><MoneyInput id="c-m" value={v.monto} onChange={(n) => setV({ ...v, monto: n ?? 0 })} /></FormField>
        <div className="grid gap-4 sm:grid-cols-2"><Num id="c-ea" label="Tasa (E.A.)" value={v.ea} onChange={(n) => setV({ ...v, ea: n })} suffix="%" step={0.1} /><Num id="c-d" label="Plazo" value={v.dias} onChange={(n) => setV({ ...v, dias: n })} suffix="días" hint="Ej. 90, 180 o 360" /></div>
        <Num id="c-r" label="Retención en la fuente" value={v.ret} onChange={(n) => setV({ ...v, ret: n })} suffix="%" step={0.1} hint="Para personas naturales suele ser 4 % de los intereses." />
      </div>
      <Result items={[{ k: "Intereses antes de retención", v: $(r.interes) }, { k: "Retención en la fuente", v: `−${$(r.retencion)}` }, { k: "Ganancia neta", v: $(r.neto) }, { k: "Recibes al vencimiento", v: $(r.total), strong: true }]} nota="Estimado. La tasa la fija cada banco; compárala con la de otros y revisa si cobran comisiones. El CDT está cubierto por el seguro de depósitos de Fogafín hasta el tope vigente." />
    </div>
  )
}

function Credito() {
  const [v, setV] = useState({ monto: 10_000_000, ea: 24, meses: 24, seguro: 0 })
  const r = credito({ monto: v.monto, ea: v.ea, meses: Math.max(1, Math.round(v.meses)), seguroMes: v.seguro })
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="grid gap-4">
        <FormField label="Valor del préstamo" htmlFor="k-m" tip={false}><MoneyInput id="k-m" value={v.monto} onChange={(n) => setV({ ...v, monto: n ?? 0 })} /></FormField>
        <div className="grid gap-4 sm:grid-cols-2"><Num id="k-ea" label="Tasa (E.A.)" value={v.ea} onChange={(n) => setV({ ...v, ea: n })} suffix="%" step={0.1} hint="Compárala con la tasa de usura vigente." /><Num id="k-n" label="Plazo" value={v.meses} onChange={(n) => setV({ ...v, meses: n })} suffix="meses" min={1} /></div>
        <FormField label="Seguro u otros cobros al mes" htmlFor="k-s" tip={false}><MoneyInput id="k-s" value={v.seguro} onChange={(n) => setV({ ...v, seguro: n ?? 0 })} /></FormField>
      </div>
      <div className="grid gap-4">
        <Result items={[{ k: "Cuota mensual", v: $(r.cuota), strong: true }, { k: "Pagas en total", v: $(r.totalPagado) }, { k: "De eso, intereses", v: $(r.intereses) }]} nota={`Por cada $1.000 que te prestan, devuelves ${$((r.totalPagado / Math.max(1, v.monto)) * 1000)}. Estimado con cuota fija (sistema francés).`} />
        <details className="rounded-lg bg-secondary/60 p-3 text-sm"><summary className="cursor-pointer font-semibold">Ver la tabla de pagos</summary>
          <div className="mt-2 max-h-72 overflow-auto"><table className="w-full text-xs tabular-nums"><thead><tr className="text-left text-muted-foreground"><th className="py-1">Mes</th><th>Cuota</th><th>Intereses</th><th>Capital</th><th>Saldo</th></tr></thead><tbody>{r.tabla.map((t) => <tr key={t.mes} className="border-t"><td className="py-1">{t.mes}</td><td>{$(t.cuota)}</td><td>{$(t.interes)}</td><td>{$(t.capital)}</td><td>{$(t.saldo)}</td></tr>)}</tbody></table></div>
        </details>
      </div>
    </div>
  )
}

function Ahorro() {
  const [modo, setModo] = useState("cuanto")
  const [v, setV] = useState({ inicial: 0, mensual: 300_000, ea: 9, meses: 24, meta: 10_000_000 })
  const r = ahorro({ inicial: v.inicial, mensual: v.mensual, ea: v.ea, meses: Math.max(1, Math.round(v.meses)) })
  const aporte = aporteParaMeta({ meta: v.meta, inicial: v.inicial, ea: v.ea, meses: Math.max(1, Math.round(v.meses)) })
  return (
    <div className="grid gap-5">
      <Segmented value={modo} onChange={setModo} items={[{ value: "cuanto", label: "¿Cuánto tendré?" }, { value: "meta", label: "¿Cuánto ahorrar para una meta?" }]} />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="grid gap-4">
          {modo === "meta" ? <FormField label="Tu meta" htmlFor="a-meta" tip={false}><MoneyInput id="a-meta" value={v.meta} onChange={(n) => setV({ ...v, meta: n ?? 0 })} /></FormField>
            : <FormField label="Ahorro cada mes" htmlFor="a-m" tip={false}><MoneyInput id="a-m" value={v.mensual} onChange={(n) => setV({ ...v, mensual: n ?? 0 })} /></FormField>}
          <FormField label="Lo que ya tienes ahorrado" htmlFor="a-i" tip={false}><MoneyInput id="a-i" value={v.inicial} onChange={(n) => setV({ ...v, inicial: n ?? 0 })} /></FormField>
          <div className="grid gap-4 sm:grid-cols-2"><Num id="a-ea" label="Rentabilidad (E.A.)" value={v.ea} onChange={(n) => setV({ ...v, ea: n })} suffix="%" step={0.1} hint="Cuenta de ahorros de alto rendimiento, CDT o fondo." /><Num id="a-n" label="Durante" value={v.meses} onChange={(n) => setV({ ...v, meses: n })} suffix="meses" min={1} /></div>
        </div>
        {modo === "meta"
          ? <Result items={[{ k: "Necesitas ahorrar al mes", v: $(aporte), strong: true }, { k: "Aportarás en total", v: $(aporte * v.meses + v.inicial) }, { k: "Los intereses ponen", v: $(Math.max(0, v.meta - aporte * v.meses - v.inicial)) }]} nota="Consejo: programa ese ahorro el día que te pagan, así no se te va en otras cosas." />
          : <Result items={[{ k: "Tendrás", v: $(r.final), strong: true }, { k: "Tú aportas", v: $(r.aportado) }, { k: "Ganas en intereses", v: $(r.intereses) }]} nota="Estimado con interés compuesto mensual. La rentabilidad real puede variar." />}
      </div>
    </div>
  )
}

function Gmf() {
  const { data: uvt } = useQuery({ queryKey: ["uvt", new Date().getFullYear()], queryFn: async () => (await createClient().from("ref_uvt").select("valor,fuente").eq("year", new Date().getFullYear()).maybeSingle()).data, staleTime: Infinity })
  const [v, setV] = useState({ monto: 2_000_000, exento: true })
  const r = gmf({ monto: v.monto, exento: v.exento, uvt: Number(uvt?.valor ?? 0) })
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="grid gap-4">
        <FormField label="Lo que sacas o transfieres en el mes" htmlFor="g-m" tip={false}><MoneyInput id="g-m" value={v.monto} onChange={(n) => setV({ ...v, monto: n ?? 0 })} /></FormField>
        <label className="flex items-start gap-3 text-sm"><Switch checked={v.exento} onCheckedChange={(x) => setV({ ...v, exento: x })} aria-label="Cuenta marcada como exenta" /><span><b>Mi cuenta está marcada como exenta</b><span className="block text-muted-foreground">Cada persona puede marcar una cuenta de ahorros: no paga 4×1000 hasta 350 UVT al mes{uvt ? ` (${$(350 * Number(uvt.valor))} en ${new Date().getFullYear()})` : ""}.</span></span></label>
      </div>
      <Result items={[{ k: "Pagas de 4×1000", v: $(r.impuesto), strong: true }, { k: "Monto exento", v: $(r.tope) }, { k: "Monto gravado", v: $(r.gravado) }]} nota={`Estimado. ${uvt?.fuente ? `UVT ${new Date().getFullYear()}: ${$(Number(uvt.valor))} (${uvt.fuente}).` : ""} Pide en tu banco marcar la cuenta donde recibes el sueldo.`} />
    </div>
  )
}

function Inflacion() {
  const [v, setV] = useState({ valor: 1_000_000, anual: 5.5, anios: 5 })
  const r = inflacion(v)
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="grid gap-4">
        <FormField label="Valor de hoy" htmlFor="i-v" tip={false}><MoneyInput id="i-v" value={v.valor} onChange={(n) => setV({ ...v, valor: n ?? 0 })} /></FormField>
        <div className="grid gap-4 sm:grid-cols-2"><Num id="i-a" label="Inflación anual" value={v.anual} onChange={(n) => setV({ ...v, anual: n })} suffix="%" step={0.1} hint="Consulta la del DANE." /><Num id="i-n" label="Años" value={v.anios} onChange={(n) => setV({ ...v, anios: n })} suffix="años" min={1} /></div>
      </div>
      <Result items={[{ k: `Lo que hoy cuesta ${$(v.valor)} costará`, v: $(r.costoFuturo), strong: true }, { k: "Si guardas ese dinero quieto, comprará lo que hoy vale", v: $(r.poderDeCompra) }, { k: "Pérdida de poder de compra", v: `${String(r.perdidaPct).replace(".", ",")} %` }]} nota="Por eso conviene que tu ahorro rinda al menos lo que sube la inflación." />
    </div>
  )
}

/** Calculadoras financieras para Colombia: CDT, crédito, ahorro y metas, 4×1000 e inflación. */
export function CalculadorasView() {
  const [tab, setTab] = useState("cdt")
  return (
    <div className="grid gap-6">
      <PageHeader id="calculadoras" title="Calculadoras" description="Haz cuentas antes de decidir: cuánto rinde un CDT, cuánto pagas de verdad por un crédito, cuánto ahorrar para una meta, el 4×1000 y la inflación." />
      <Segmented value={tab} onChange={setTab} items={TABS} />
      <Card className="p-5 shadow-card ring-0 sm:p-6">{tab === "cdt" ? <Cdt /> : tab === "credito" ? <Credito /> : tab === "ahorro" ? <Ahorro /> : tab === "gmf" ? <Gmf /> : <Inflacion />}</Card>
    </div>
  )
}

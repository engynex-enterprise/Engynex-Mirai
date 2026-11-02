"use client"

import Link from "next/link"
import { ChevronDown, CircleHelp, Info, ListChecks, Sparkles, ThumbsDown, ThumbsUp, TriangleAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Icon } from "@/components/mirai/icon"
import { StatusPill } from "@/components/mirai/status-pill"
import { ATIPOS } from "@/lib/domain"
import { fmtMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import { decisionView, num, type Cifra } from "@/lib/chat/decision-view"
import type { Consulta } from "@/lib/chat/types"

// Tarjeta del consejero dentro del chat. La respuesta en texto natural va arriba, en la burbuja del mensaje; aquí van
// el veredicto con un medidor, 2 o 3 cifras en frases (con "¿Qué significa?"), por qué, qué te recomiendo y, plegada,
// la vista financiera. Todo sale de lib/chat/decision-view.ts (cambia según el tipo de decisión).

export const VERD = {
  si: { I: ThumbsUp, box: "bg-success-soft", ic: "bg-success text-white dark:text-navy", bar: "bg-success", text: "text-success" },
  cuidado: { I: TriangleAlert, box: "bg-warning-soft", ic: "bg-[#E08A00] text-white", bar: "bg-[#E08A00]", text: "text-[#B86E00] dark:text-[#FFB547]" },
  no: { I: ThumbsDown, box: "bg-danger-soft", ic: "bg-danger text-white", bar: "bg-danger", text: "text-danger" },
} as const
const TONE = { ok: "bg-success", warn: "bg-[#E08A00]", bad: "bg-danger" } as const
const $ = (v: number) => fmtMoney(Math.round(v))
const LECT = { sano: "pagado", alerta: "porVencer", riesgo: "vencido" } as const

function Explica({ text, label }: { text: string; label: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`¿Qué significa? ${label}`} className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11.5px] font-semibold text-link hover:bg-brand-soft focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
          <CircleHelp className="size-3.5" /> ¿Qué significa?
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 bg-navy text-[13px] leading-snug text-white" side="top">{text}</PopoverContent>
    </Popover>
  )
}

function CifraRow({ c }: { c: Cifra }) {
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-xl bg-background/70 p-2.5 ring-1 ring-black/5 dark:ring-white/10">
      <span aria-hidden className={cn("mt-1.5 size-2 shrink-0 rounded-full", c.tone ? TONE[c.tone] : "bg-brand/60")} />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="text-[13px] leading-snug text-muted-foreground">{c.frase}</p>
        <p className={cn("text-[16px] leading-tight font-bold tabular-nums", c.tone === "bad" && "text-danger")} {...(c.valor.includes("$") ? { "data-money": "" } : {})}>{c.valor}</p>
      </div>
      <Explica text={c.ayuda} label={c.frase} />
    </div>
  )
}

/** Términos de la vista financiera explicados en palabras sencillas. */
const TERMINOS: [string, string][] = [
  ["Flujo libre", "Lo que te sobra al mes después de tus gastos y cuotas."],
  ["Deudas / ingreso (DTI)", "Qué parte de lo que ganas se va en cuotas de deudas. Lo sano es menos del 30 %."],
  ["Liquidez", "La plata que puedes usar rápido: cuentas, efectivo e inversiones a la vista."],
  ["Tasa efectiva anual", "Lo que te cobran de interés en un año, contando el interés sobre el interés."],
]

export function DecisionCard({ c }: { c: Consulta }) {
  const view = decisionView(c)
  const a = c.ai, m = c.m, X = c.X ?? {}, t = c.d.tipo
  const V = VERD[view.v] ?? VERD.cuidado
  const usura = c.usura ?? 26
  const cuentas = c.datos?.cuentas ?? m.liq > 0
  const sem = (bad: boolean, warn: boolean) => (bad ? "riesgo" : warn ? "alerta" : "sano") as keyof typeof LECT
  const rows: [string, string, keyof typeof LECT | null][] = [
    ["Ingreso mensual", $(m.ing), null], ["Gastos fijos + suscripciones", $(m.fij + m.subs), null], ["Cuotas actuales", $(m.cuo), null], ["Gasto variable promedio", $(m.varr), null],
    ["Flujo libre (antes → después)", `${$(m.libre)} → ${$(m.libreD)}`, sem(m.libreD < 0, m.libreD < m.ing * 0.1)],
    ["Deudas / ingreso (DTI)", `${num(m.ing ? (m.cuo / m.ing) * 100 : 0)} % → ${num(m.ratioD * 100)} %`, sem(m.ratioD > 0.4, m.ratioD > 0.3)],
    ...(cuentas ? [["Liquidez (antes → después)", `${$(m.liq)} → ${$(m.liqD)}`, sem(m.liqD < 0, false)], ["Cobertura de emergencias", `${num(m.emergA)} → ${num(m.emergD)} meses`, sem(m.emergD < 1, m.emergD < 3)]] as [string, string, keyof typeof LECT | null][] : []),
    ...(m.enCuotas ? [["Tasa efectiva anual", `${num(m.ea * 100)} %`, sem(m.ea * 100 > usura, false)], ["Costo financiero total", $(m.intereses), null], ["Total a pagar", $(m.total), null]] as [string, string, keyof typeof LECT | null][] : []),
    ...(X.costoAnual !== undefined ? [["Costo anual de la tarjeta", $(X.costoAnual), null]] as [string, string, null][] : []),
    ...(X.gan !== undefined ? [["Rendimiento bruto / neto", `${$(X.gan)} / ${$(X.net)}`, null]] as [string, string, null][] : []),
    ...(X.ahorro !== undefined ? [["Intereses evitados", $(X.ahorro), null]] as [string, string, null][] : []),
  ]
  const go = view.v !== "no" && ({
    prestar: { href: `/me-deben?nuevo=1${c.d.contactoId ? `&cid=${c.d.contactoId}` : ""}`, icon: "hand-coins", l: "Registrar este préstamo" }, credito: { href: "/le-debo?nuevo=1", icon: "landmark", l: "Registrar esta deuda" },
    invertir: { href: "/inversiones?nuevo=1", icon: "trending-up", l: "Registrar inversión" }, tarjeta: { href: "/tarjetas", icon: "credit-card", l: "Ir a Tarjetas" }, fijo: { href: "/fijos?nuevo=1", icon: "repeat", l: "Agregar como gasto fijo" },
  } as Record<string, { href: string; icon: string; l: string }>)[t]

  return (
    <div data-testid="decision-card" className="relative grid w-full min-w-0 grid-cols-[minmax(0,1fr)] gap-3 overflow-hidden rounded-2xl bg-card p-3.5 shadow-card ring-1 ring-black/5 dark:ring-white/10">
      <span aria-hidden className={cn("absolute inset-x-0 top-0 h-1", V.bar)} />
      {/* Veredicto + medidor */}
      <div className={cn("grid grid-cols-[minmax(0,1fr)] gap-2.5 rounded-xl p-3", V.box)}>
        <div className="flex items-start gap-3">
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", V.ic)}><V.I className="size-4.5" /></span>
          <div className="min-w-0 flex-1">
            <p className={cn("text-[16px] leading-tight font-bold", V.text)}>{view.veredicto}</p>
            <p className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{ATIPOS[t]?.l ?? "Decisión"} · <span data-money>{$(+(c.d.valor ?? 0) || 0)}</span>{view.grupo === "mensual" ? " al mes" : ""}</p>
          </div>
        </div>
        {view.peso && (
          <div className="grid gap-1" data-testid="decision-peso">
            <p className="text-[13px] font-medium">{view.peso.label}</p>
            <div className="h-2.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/15" role="meter" aria-label={view.peso.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(view.peso.pct)}>
              <div className={cn("h-full rounded-full transition-[width] duration-700", TONE[view.peso.tone])} style={{ width: `${Math.max(3, view.peso.pct)}%` }} />
            </div>
          </div>
        )}
      </div>
      {!!view.avisos.length && (
        <div className="grid gap-1.5 rounded-xl bg-warning-soft/70 p-2.5 text-[13px]" role="note">
          {view.avisos.map((x) => <p key={x} className="flex items-start gap-2"><Info className="mt-0.5 size-3.5 shrink-0 text-[#B86E00] dark:text-[#FFB547]" />{x}</p>)}
          <div className="flex flex-wrap gap-1.5 pl-5">
            {view.avisos.some((x) => x.includes("ingresos")) && <Button size="xs" variant="outline" asChild><Link href="/ingresos?nuevo=1">Agregar ingresos</Link></Button>}
            {view.avisos.some((x) => x.includes("cuentas")) && <Button size="xs" variant="outline" asChild><Link href="/balance">Registrar mis cuentas</Link></Button>}
          </div>
        </div>
      )}
      {/* Cifras que importan para este tipo de decisión */}
      {!!view.cifras.length && <div className="grid gap-2">{view.cifras.map((x) => <CifraRow key={x.id} c={x} />)}</div>}
      {!!view.razones.length && (
        <div className="grid gap-1"><p className="text-[13.5px] font-semibold">¿Por qué?</p>
          <ul className="grid gap-1 text-[13.5px]">{view.razones.map((x) => <li key={x} className="flex items-start gap-2"><Icon name="circle-dot" className="mt-1 size-3 shrink-0 text-muted-foreground" />{x}</li>)}</ul>
        </div>
      )}
      {!!view.pasos.length && (
        <div className="grid gap-1.5 rounded-xl bg-brand-soft/50 p-2.5"><p className="flex items-center gap-1.5 text-[13.5px] font-semibold"><ListChecks className="size-4 text-brand" /> Qué te recomiendo</p>
          <ol className="grid gap-1 text-[13.5px]">{view.pasos.map((x, i) => <li key={x} className="flex items-start gap-2"><span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand text-[11px] font-bold text-white">{i + 1}</span>{x}</li>)}</ol>
          {a?.pregunta && <p className="pt-1 text-[13px] text-muted-foreground"><b>Piénsalo:</b> {a.pregunta}</p>}
        </div>
      )}
      {/* Vista financiera (para quien la quiera) */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="group/fin w-fit"><ChevronDown className="transition-transform group-data-[state=open]/fin:rotate-180" /> Ver detalle financiero</Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 pt-1">
          {a?.tecnico && <p className="text-[13px]">{a.tecnico.resumen} <b>{a.tecnico.recomendacion}</b></p>}
          <div className="overflow-x-auto"><table className="w-full text-[12.5px]"><tbody>
            {rows.map(([k, v, l]) => <tr key={k} className="border-b border-border/60 last:border-0"><td className="py-1.5 pr-2 text-muted-foreground">{k}</td><td data-money className="py-1.5 text-right font-medium tabular-nums sm:whitespace-nowrap">{v}</td><td className="w-16 py-1.5 pl-2 text-right">{l && <StatusPill tone={LECT[l]} className="h-5 px-2 text-[11px]">{l === "sano" ? "Sano" : l === "alerta" ? "Alerta" : "Riesgo"}</StatusPill>}</td></tr>)}
          </tbody></table></div>
          <dl className="grid gap-1 rounded-xl bg-secondary/60 p-2.5 text-[12px]">{TERMINOS.map(([k, v]) => <div key={k}><dt className="inline font-semibold">{k}: </dt><dd className="inline text-muted-foreground">{v}</dd></div>)}</dl>
        </CollapsibleContent>
      </Collapsible>
      <div className="flex flex-wrap items-center gap-2">
        {go && <Button size="sm" variant="soft" asChild><Link href={go.href}><Icon name={go.icon} /> {go.l}</Link></Button>}
        <p className="flex min-w-0 flex-1 items-start gap-1.5 text-[11.5px] text-muted-foreground"><Sparkles className="mt-0.5 size-3 shrink-0" />{c.ai ? `Cálculos de Mirai con tus datos y concepto de la IA${c.provider ? ` (${c.provider})` : ""}.` : "Calculado con tus datos (reglas de Mirai)."} Es orientación: no reemplaza a un asesor certificado.</p>
      </div>
    </div>
  )
}

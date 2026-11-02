"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ArrowLeft, CircleHelp, MessageCircle, Smile, Sparkles, ThumbsDown, ThumbsUp, TriangleAlert, WandSparkles } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { Combobox } from "@/components/mirai/combobox"
import { Segmented } from "@/components/mirai/choice-cards"
import { FormField } from "@/components/mirai/field"
import { Icon } from "@/components/mirai/icon"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { MoneyInput } from "@/components/mirai/money-input"
import { Notice } from "@/components/mirai/notice"
import { PageHeader } from "@/components/mirai/page-header"
import { StatusPill } from "@/components/mirai/status-pill"
import { useApp } from "@/components/app/app-context"
import { useShell } from "@/components/app/shell-store"
import { useList } from "@/hooks/use-book-data"
import { createClient } from "@/utils/supabase/client"
import { AEJ, ATIPOS, loanName, type AdvisorInput, type Atipo } from "@/lib/domain"
import { fmtDate, fmtMoney } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useContacts, useEntities, useSettings } from "@/features/catalogs/hooks"
import { analyzeDecision, interpretDecision, type Consulta } from "./actions"

const VERD = {
  si: { l: "Te alcanza", t: "Puedes hacerlo sin poner en riesgo tus finanzas", I: ThumbsUp, box: "bg-success-soft", ic: "bg-success text-white dark:text-navy" },
  cuidado: { l: "Puedes, pero con cuidado", t: "Es posible, pero te deja con poco margen", I: TriangleAlert, box: "bg-warning-soft", ic: "bg-[#E08A00] text-white" },
  no: { l: "Mejor no, por ahora", t: "Esto pondría en aprietos tus finanzas", I: ThumbsDown, box: "bg-danger-soft", ic: "bg-danger text-white" },
} as const
const $ = (v: number) => fmtMoney(Math.round(v))
const num = (v: unknown) => +(v as number) || 0

/** Paso 2: formulario dinámico por tipo (asForm de la v4). */
function DecisionForm({ d, setD, src, txt, onBack, onSubmit, busy }: { d: AdvisorInput; setD: (d: AdvisorInput) => void; src: string; txt: string; onBack: () => void; onSubmit: () => void; busy: boolean }) {
  const { data: contacts = [] } = useContacts()
  const { data: entities = [] } = useEntities()
  const { data: deudas = [] } = useList("loans", { eq: { kind: "pagar" } })
  const set = (p: Partial<AdvisorInput>) => setD({ ...d, ...p })
  const ai = (k: keyof AdvisorInput) => (src === "ia" && d[k] !== undefined && d[k] !== "" ? <StatusPill tone="violet" className="ml-1 h-5">IA</StatusPill> : null)
  const money = (k: keyof AdvisorInput, label: string, hint?: string, req?: boolean) => (
    <FormField label={label} htmlFor={`as-${k}`} hint={hint} required={req} tip={false}><div className="flex items-center gap-1"><div className="flex-1"><MoneyInput id={`as-${k}`} value={num(d[k])} onChange={(v) => set({ [k]: v })} /></div>{ai(k)}</div></FormField>
  )
  const numF = (k: keyof AdvisorInput, label: string, hint?: string, ph?: string) => (
    <FormField label={label} htmlFor={`as-${k}`} hint={hint} tip={false}><div className="flex items-center gap-1"><Input id={`as-${k}`} className="h-11" inputMode="decimal" placeholder={ph} value={String(d[k] ?? "")} onChange={(e) => set({ [k]: e.target.value.replace(",", ".") })} />{ai(k)}</div></FormField>
  )
  const cuotasBlock = (label = "¿En cuántas cuotas?") => (
    <div className="grid gap-4 rounded-lg bg-muted/50 p-4">
      {numF("cuotas", label, "Una cuota por mes", "Ej. 12")}
      <FormField label="¿Tiene intereses?" tip={false}><Segmented value={d.modoInt || "no"} onChange={(v) => set({ modoInt: v as AdvisorInput["modoInt"] })} items={[{ value: "no", label: "Sin intereses" }, { value: "tasa", label: "Sé el porcentaje" }, { value: "cuota", label: "Sé la cuota" }]} /></FormField>
      {d.modoInt === "tasa" && numF("tasa", "Interés mensual (%)", "Si te dicen “al 2%”, escribe 2. Las tarjetas suelen cobrar entre 1,8% y 2,2% mensual.", "Ej. 2")}
      {d.modoInt === "cuota" && money("cuotaV", "Valor de cada cuota")}
    </div>
  )
  const t = d.tipo
  return (
    <Card className="gap-5 p-5 shadow-card ring-0">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft /> Cambiar descripción</Button>
        {txt && <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground italic">“{txt}”</p>}
      </div>
      {src === "ia" && <Notice tone="info" title="Llenamos el formulario con lo que nos contaste">Revisa los datos marcados con IA y completa lo que falte.</Notice>}
      {src === "local" && txt && <Notice tone="info" title="Llenamos lo que pudimos entender">Revisa y completa los datos.</Notice>}
      {!!d.dudas?.length && <div className="rounded-lg bg-muted p-3 text-sm"><p className="font-medium">Para un mejor consejo, ten en cuenta:</p><ul className="mt-1 list-disc pl-5">{d.dudas.map((x) => <li key={x}>{x}</li>)}</ul></div>}
      <div className="grid gap-2">
        <p className="flex items-center gap-2 font-semibold"><span className="grid size-6 place-items-center rounded-full bg-brand text-xs text-white">1</span>¿Qué quieres hacer?</p>
        <Combobox value={t} onChange={(v) => set({ tipo: v as Atipo, ...(v === "tarjeta" && !d.tasa ? { tasa: 1.9 } : {}) })} options={Object.entries(ATIPOS).map(([value, o]) => ({ value, label: o.l, icon: o.icon, hint: o.d }))} />
      </div>
      <FieldGroup>
        <p className="flex items-center gap-2 font-semibold"><span className="grid size-6 place-items-center rounded-full bg-brand text-xs text-white">2</span>{ATIPOS[t].l}: los detalles</p>
        <FormField label="¿Qué es?" htmlFor="as-desc" required tip={false}><Input id="as-desc" className="h-11" placeholder="Ej. Nevera nueva" value={d.desc ?? ""} onChange={(e) => set({ desc: e.target.value })} /></FormField>
        {t === "comprar" && <>
          {money("valor", "¿Cuánto cuesta en total?", undefined, true)}
          <FormField label="¿Cómo lo pagarías?" tip={false}><Segmented value={d.forma || "contado"} onChange={(v) => set({ forma: v as "contado" })} items={[{ value: "contado", label: "De contado", icon: "banknote" }, { value: "cuotas", label: "A cuotas", icon: "credit-card" }]} /></FormField>
          {d.forma === "cuotas" && cuotasBlock()}
        </>}
        {t === "tarjeta" && <>
          {money("valor", "Cupo que te aprueban", "No es dinero tuyo: es lo máximo que el banco te presta.", true)}
          {money("manejo", "Cuota de manejo mensual")}
          {numF("tasa", "Interés mensual (%)", "Si no lo sabes, deja 1,9 %.", "1.9")}
          {money("uso", "¿Cuánto gastarías al mes con ella?")}
          <FormField label="¿Cómo pagarías lo que gastes?" tip={false}><Segmented value={d.pagoModo || "total"} onChange={(v) => set({ pagoModo: v as "total" })} items={[{ value: "total", label: "El total cada mes" }, { value: "cuotas", label: "A cuotas" }]} /></FormField>
          {d.pagoModo === "cuotas" && numF("cuotas", "¿A cuántas cuotas difieres?", undefined, "6")}
        </>}
        {t === "credito" && <>{money("valor", "¿Cuánto te prestan?", undefined, true)}{cuotasBlock("¿En cuántos meses lo pagas?")}{money("seguros", "Seguros y otros cobros al mes")}</>}
        {t === "prestar" && <>
          {money("valor", "¿Cuánto vas a prestar?", undefined, true)}
          <FormField label="¿A quién?" tip={false} hint={contacts.length ? "Revisamos si te ha pagado a tiempo antes." : "Agrega contactos para revisar si te han pagado a tiempo."}>
            <Combobox value={d.contactoId ?? ""} onChange={(v) => set({ contactoId: v })} placeholder={d.persona ? `Elige a ${d.persona} (opcional)` : "Elige un contacto (opcional)"} options={contacts.map((c) => ({ value: c.id, label: c.nombre, icon: "user" }))} />
          </FormField>
          {cuotasBlock("¿En cuántas cuotas te pagará?")}
        </>}
        {t === "fijo" && <>{money("valor", "¿Cuánto es al mes?", undefined, true)}{money("reemplaza", "¿Dejarías de pagar otro gasto? ¿Cuánto?", "Por ejemplo, el arriendo actual si te mudas.")}</>}
        {t === "invertir" && <>{money("valor", "¿Cuánto vas a invertir?", undefined, true)}{numF("dias", "Plazo en días", "6 meses ≈ 180 días", "180")}{numF("ea", "Tasa efectiva anual (% E.A.)", "La que te ofrece el banco, por ejemplo 10,5.", "Ej. 10.5")}</>}
        {t === "abonar" && <>
          <FormField label="¿A qué deuda?" tip={false} hint={deudas.length ? undefined : "Aún no tienes deudas registradas en Le debo."}>
            <Combobox value={d.loanId ?? ""} onChange={(v) => set({ loanId: v })} options={deudas.map((L) => ({ value: L.id, label: L.concepto || loanName({ kind: "pagar", contact_id: L.contact_id, entity_id: L.entity_id }, contacts, entities), icon: "landmark" }))} />
          </FormField>
          {money("valor", "¿Cuánto abonarías?", undefined, true)}
        </>}
        {t === "empeno" && <>{money("valor", "¿Cuánto te prestan?", undefined, true)}{numF("tasa", "Interés mensual (%)", undefined, "Ej. 4")}{numF("cuotas", "¿En cuántos meses lo recuperas?", undefined, "3")}</>}
        <Button size="lg" className="h-11" disabled={busy} onClick={onSubmit}>{busy ? <Spinner /> : <WandSparkles />}{busy ? "Analizando…" : "Analizar si me conviene"}</Button>
      </FieldGroup>
    </Card>
  )
}

function Metric({ v, l, neg }: { v: string; l: string; neg?: boolean }) {
  return <div className="rounded-lg bg-muted/60 p-3"><p data-money className={cn("text-lg font-semibold tabular-nums", neg && "text-danger")}>{v}</p><p className="text-xs text-muted-foreground">{l}</p></div>
}
const LECT = { sano: "pagado", alerta: "porVencer", riesgo: "vencido" } as const

/** Resultado con dos pestañas (asResult de la v4). */
function Result({ c, usura }: { c: Consulta; usura: number }) {
  const [tab, setTab] = useState("simple")
  const openChat = useShell((s) => s.openChat)
  const a = c.ai, m = c.m, X = c.X ?? {}, t = c.d.tipo
  const V = VERD[c.v]
  const sem = (bad: boolean, warn: boolean) => (bad ? "riesgo" : warn ? "alerta" : "sano") as keyof typeof LECT
  const metrics = m.enCuotas ? [[$(m.cuota), `Cuota mensual (${m.n})`], [$(m.intereses), "Intereses en total"], [$(m.libreD), "Libre al mes después", m.libreD < 0], [`${m.emergD.toFixed(1)} meses`, "Colchón de emergencia"]]
    : t === "tarjeta" ? [[$(X.manejo ?? 0), "Cuota de manejo"], [$(X.intMes ?? 0), "Intereses al mes"], [$(X.costoAnual ?? 0), "Costo al año"], [$(m.libreD), "Libre al mes después", m.libreD < 0]]
    : t === "invertir" ? [[$(X.net ?? 0), "Ganancia neta"], [$(m.liqD), "Te quedaría disponible", m.liqD < 0], [`${m.emergD.toFixed(1)} meses`, "Colchón de emergencia"], [$(m.libreD), "Libre al mes"]]
    : t === "abonar" ? [[$(X.ahorro ?? 0), "Ahorro en intereses"], [`${X.menos ?? 0}`, "Cuotas que terminas antes"], [$(m.liqD), "Te quedaría disponible", m.liqD < 0], [`${m.emergD.toFixed(1)} meses`, "Colchón de emergencia"]]
    : [[`${Math.round(m.dias)} días`, "De trabajo que equivale"], [$(m.liqD), "Te quedaría disponible", m.liqD < 0], [$(m.libreD), "Libre al mes después", m.libreD < 0], [`${m.emergD.toFixed(1)} meses`, "Colchón de emergencia"]]
  const rows: [string, string, keyof typeof LECT | null][] = [
    ["Ingreso mensual", $(m.ing), null], ["Gastos fijos + suscripciones", $(m.fij + m.subs), null], ["Cuotas actuales", $(m.cuo), null], ["Gasto variable promedio", $(m.varr), null],
    ["Flujo libre (antes → después)", `${$(m.libre)} → ${$(m.libreD)}`, sem(m.libreD < 0, m.libreD < m.ing * 0.1)],
    ["Deudas / ingreso (DTI)", `${(m.ing ? (m.cuo / m.ing) * 100 : 0).toFixed(0)} % → ${(m.ratioD * 100).toFixed(0)} %`, sem(m.ratioD > 0.4, m.ratioD > 0.3)],
    ["Liquidez (antes → después)", `${$(m.liq)} → ${$(m.liqD)}`, sem(m.liqD < 0, false)],
    ["Cobertura de emergencias", `${m.emergA.toFixed(1)} → ${m.emergD.toFixed(1)} meses`, sem(m.emergD < 1, m.emergD < 3)],
    ...(m.enCuotas ? [["Cuota", $(m.cuota), null], ["Tasa efectiva anual", `${(m.ea * 100).toFixed(1).replace(".", ",")} %`, sem(m.ea * 100 > usura, false)], ["Costo financiero total", $(m.intereses), null], ["Total a pagar", $(m.total), null]] as [string, string, keyof typeof LECT | null][] : []),
    ...(X.costoAnual !== undefined ? [["Costo anual de la tarjeta", $(X.costoAnual), null]] as [string, string, null][] : []),
    ...(X.gan !== undefined ? [["Rendimiento bruto / neto", `${$(X.gan)} / ${$(X.net)}`, null]] as [string, string, null][] : []),
    ...(X.ahorro !== undefined ? [["Intereses evitados", $(X.ahorro), null]] as [string, string, null][] : []),
  ]
  const list = (title: string, xs?: string[]) => (xs?.length ? <div className="grid gap-1"><h3 className="font-semibold">{title}</h3><ul className="list-disc space-y-1 pl-5 text-sm">{xs.map((x) => <li key={x}>{x}</li>)}</ul></div> : null)

  return (
    <Card className="gap-4 p-5 shadow-card ring-0" id="as-res">
      <div className={cn("flex items-start gap-3 rounded-lg p-4", V.box)}>
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", V.ic)}><V.I className="size-5" /></span>
        <div><p className="text-sm font-medium">{V.l}</p><h2 className="text-lg font-semibold">{a?.titular || V.t}</h2><p className="text-sm text-muted-foreground">{c.d.desc} · <span data-money>{$(num(c.d.valor))}</span></p></div>
      </div>
      <Segmented value={tab} onChange={setTab} items={[{ value: "simple", label: "Explicación sencilla", icon: "smile" }, { value: "fin", label: "Vista financiera", icon: "chart-no-axes-combined" }]} />
      {tab === "simple" ? (
        <div className="grid gap-4">
          {a?.explicacion && <div><h3 className="font-semibold">En pocas palabras</h3><p className="text-[15px] leading-relaxed">{a.explicacion}</p></div>}
          <div><h3 className="mb-2 font-semibold">Los números que importan</h3><div className="grid grid-cols-2 gap-2">{metrics.map(([v, l, neg]) => <Metric key={String(l)} v={String(v)} l={String(l)} neg={!!neg} />)}</div></div>
          {list("¿Por qué?", a?.razones?.length ? a.razones : c.R)}
          {list("Otras opciones", a?.alternativas)}
          {list("Si decides hacerlo", a?.plan)}
          {a?.pregunta && <Notice tone="info" title="Piénsalo">{a.pregunta}</Notice>}
        </div>
      ) : (
        <div className="grid gap-4">
          {a?.tecnico && <div><h3 className="font-semibold">Lectura técnica</h3><p className="text-sm">{a.tecnico.resumen}</p><p className="mt-1 text-sm font-medium">{a.tecnico.recomendacion}</p></div>}
          <div className="overflow-x-auto"><table className="w-full text-sm"><tbody>
            {rows.map(([k, v, l]) => <tr key={k} className="border-b last:border-0"><td className="py-2 pr-2 text-muted-foreground">{k}</td><td data-money className="py-2 text-right font-medium tabular-nums">{v}</td><td className="w-20 py-2 pl-2 text-right">{l && <StatusPill tone={LECT[l]}>{l === "sano" ? "Sano" : l === "alerta" ? "Alerta" : "Riesgo"}</StatusPill>}</td></tr>)}
          </tbody></table></div>
          {!!a?.tecnico?.indicadores?.length && <div><h3 className="mb-1 font-semibold">Indicadores del asesor IA</h3><ul className="grid gap-1 text-sm">{a.tecnico.indicadores.map((x) => <li key={x.nombre} className="flex items-center gap-2"><span className="flex-1">{x.nombre}</span><b>{x.valor}</b><StatusPill tone={LECT[x.lectura]}>{x.lectura}</StatusPill></li>)}</ul></div>}
          {list("Observaciones", c.R)}
        </div>
      )}
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground"><Sparkles className="mt-0.5 size-3.5 shrink-0" />{c.ai ? `Orientación basada en tus datos${c.provider ? ` (con ${c.provider})` : ""}. No reemplaza a un asesor financiero certificado.` : c.aiErr || "Sin IA disponible: ves el análisis automático con tus números."}</p>
      <div className="flex flex-wrap gap-2">
        {c.v !== "no" && t === "prestar" && <Button variant="soft" asChild><Link href={`/me-deben?nuevo=1${c.d.contactoId ? `&cid=${c.d.contactoId}` : ""}`}><Icon name="hand-coins" /> Registrar este préstamo</Link></Button>}
        {c.v !== "no" && t === "credito" && <Button variant="soft" asChild><Link href="/le-debo?nuevo=1"><Icon name="landmark" /> Registrar esta deuda</Link></Button>}
        {c.v !== "no" && t === "invertir" && <Button variant="soft" asChild><Link href="/inversiones?nuevo=1"><Icon name="trending-up" /> Registrar inversión</Link></Button>}
        {c.v !== "no" && t === "tarjeta" && <Button variant="soft" asChild><Link href="/tarjetas"><Icon name="credit-card" /> Ir a Tarjetas</Link></Button>}
        <Button variant="outline" onClick={() => openChat(`Tengo dudas sobre este análisis: ${c.d.desc}`)}><MessageCircle /> Preguntar al asesor</Button>
      </div>
    </Card>
  )
}

export function AdvisorView() {
  const { book } = useApp()
  const qc = useQueryClient()
  const openChat = useShell((s) => s.openChat)
  const { data: cfg } = useSettings()
  const [step, setStep] = useState<1 | 2>(1)
  const [txt, setTxt] = useState("")
  const [d, setD] = useState<AdvisorInput>({ tipo: "comprar", forma: "contado", modoInt: "no" })
  const [src, setSrc] = useState("manual")
  const [interp, setInterp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<Consulta | null>(null)
  const { data: hist, isPending } = useQuery({
    queryKey: ["b", book.id, "advisor_consultations"],
    queryFn: async () => (await createClient().from("advisor_consultations").select("id,fecha,tipo,descripcion,valor,veredicto,payload").eq("book_id", book.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(8)).data ?? [],
  })

  const interpret = async (t = txt) => {
    if (t.trim().length < 4) return toast("Cuéntame un poco más: qué quieres hacer y por cuánto.")
    setInterp(true)
    try { const r = await interpretDecision(t); setD(r.d); setSrc(r.src); setStep(2) } catch (e) { toast.error((e as Error).message) }
    setInterp(false)
  }
  // Desde el chat: llega la frase y se interpreta de una vez (chatGoCons de la v4).
  useEffect(() => {
    const pre = sessionStorage.getItem("mirai-cons-q")
    if (!pre) return
    sessionStorage.removeItem("mirai-cons-q")
    queueMicrotask(() => { setTxt(pre); interpret(pre) })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const pickTipo = (tipo: Atipo) => { setD({ tipo, forma: "contado", modoInt: tipo === "credito" ? "tasa" : "no", ...(tipo === "tarjeta" ? { tasa: 1.9 } : tipo === "empeno" ? { tasa: 4 } : {}) }); setSrc("manual"); setTxt(""); setStep(2) }
  const analyze = async () => {
    if (!num(d.valor)) return toast.warning("Escribe el valor")
    if (!d.desc?.trim()) return toast.warning("Escribe qué es")
    setBusy(true); setRes(null)
    try {
      const r = await analyzeDecision(d, txt); setRes(r)
      qc.invalidateQueries({ queryKey: ["b", book.id, "advisor_consultations"] })
      setTimeout(() => document.getElementById("as-res")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60)
    } catch (e) { toast.error("No se pudo analizar", { description: (e as Error).message }) }
    setBusy(false)
  }

  return (
    <div className="grid gap-6">
      <PageHeader id="consejero" title="Consejero antes de gastar" description="Cuéntame qué piensas hacer. Reviso tus ingresos, gastos, deudas y ahorros, y te digo con palabras sencillas si te alcanza."
        actions={<Button variant="outline" onClick={() => openChat()}><MessageCircle /> Abrir chat del asesor</Button>} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {step === 1 ? (
          <Card className="gap-4 p-5 shadow-card ring-0">
            <p className="flex items-center gap-2 font-semibold"><CircleHelp className="size-5 text-brand" /> ¿Qué estás pensando hacer?</p>
            <Textarea rows={4} value={txt} onChange={(e) => setTxt(e.target.value)} aria-label="Describe lo que piensas hacer" placeholder="Ej. Me ofrecieron una tarjeta de crédito con cupo de 5 millones y cuota de manejo de 30 mil. ¿Me conviene?"
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) interpret() }} />
            <div className="flex flex-wrap gap-2">{AEJ.map((e) => <button key={e} type="button" className="rounded-full border px-3 py-1.5 text-left text-xs hover:bg-hover" onClick={() => setTxt(e)}>{e}</button>)}</div>
            <Button size="lg" className="h-11" disabled={interp} onClick={() => interpret()}>{interp ? <Spinner /> : <Sparkles />}{interp ? "Entendiendo…" : "Continuar"}</Button>
            <p className="pt-2 text-sm text-muted-foreground">O elige directamente:</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(Object.entries(ATIPOS) as [Atipo, (typeof ATIPOS)[Atipo]][]).map(([k, o]) => (
                <button key={k} type="button" onClick={() => pickTipo(k)} className="grid justify-items-center gap-1 rounded-lg border p-3 text-center text-xs font-medium hover:bg-hover"><IsoIcon k={o.iso} size={32} />{o.l}</button>
              ))}
            </div>
          </Card>
        ) : <DecisionForm d={d} setD={setD} src={src} txt={txt} busy={busy} onBack={() => setStep(1)} onSubmit={analyze} />}

        <div className="grid gap-4">
          {busy ? (
            <Card className="gap-3 p-5 shadow-card ring-0"><p className="flex items-center gap-2 font-semibold text-success"><Sparkles className="size-4" /> Revisando tus finanzas…</p><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-24" /></Card>
          ) : res ? <Result c={res} usura={+(cfg?.usura ?? 26)} /> : (
            <Card className="items-center gap-3 p-8 text-center shadow-card ring-0"><IsoIcon k="consejero" size={64} /><p className="max-w-sm text-muted-foreground">Aquí verás mi recomendación. Para darte un mejor consejo, mantén al día tus ingresos, gastos fijos y deudas.</p></Card>
          )}
          <Card className="gap-2 p-5 shadow-card ring-0">
            <h2 className="font-semibold">Consultas anteriores</h2>
            {isPending ? <Skeleton className="h-24" /> : !hist?.length ? <p className="text-sm text-muted-foreground">Aún no has consultado nada.</p> : (
              <ul className="grid min-w-0 grid-cols-1">
                {hist.map((h) => {
                  const V = VERD[h.veredicto as keyof typeof VERD]
                  return (
                    <li key={h.id} className="min-w-0"><button type="button" className="flex w-full min-w-0 items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-hover" onClick={() => {
                      const p = h.payload as unknown as Omit<Consulta, "id" | "fecha" | "v">
                      setRes({ ...p, id: h.id, fecha: h.fecha, v: h.veredicto as Consulta["v"] }); if (p.d) { setD(p.d); setTxt(p.txt ?? ""); setSrc("manual"); setStep(2) }
                    }}>
                      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", V.ic)}><V.I className="size-4" /></span>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{h.descripcion}</p><p className="truncate text-xs text-muted-foreground">{ATIPOS[h.tipo as Atipo]?.l} · {fmtDate(h.fecha)} · <span data-money>{$(+h.valor)}</span></p></div>
                    </button></li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Smile className="size-3.5" /> Puedes cambiar qué tan estricto es el consejero en <Link className="underline" href="/ajustes?tab=ia">Ajustes › Inteligencia artificial</Link>.</p>
    </div>
  )
}

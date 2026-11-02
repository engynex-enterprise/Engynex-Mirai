"use client"

import { useMemo, useState } from "react"
import { Sparkles, WandSparkles } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { primaPlan } from "@/features/ai/actions"
import { Slider } from "@/components/ui/slider"
import { PageHeader } from "@/components/mirai/page-header"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { Money } from "@/components/mirai/money"
import { Icon } from "@/components/mirai/icon"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Panel } from "@/components/mirai/panel"
import { ToneIcon } from "@/components/mirai/tone-icon"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { REPARTO_DEF, gastosBasicos, liquidez, loanEngine, loanName, primas, repartoPrima, salarioDesdeIngresos, tarjetasDeuda, type RepartoPct } from "@/lib/domain"
import { fmtDate, fmtMoney, todayISO } from "@/lib/format"
import { useBookData } from "@/features/book/use-book-data"
import { useIncomeCategories } from "@/features/catalogs/hooks"

const PARTES: [keyof RepartoPct, string, string][] = [["deudas", "Pagar deudas", "landmark"], ["ahorro", "Ahorro / emergencias", "umbrella"], ["metas", "Mis metas", "target"], ["gusto", "Darme un gusto", "party-popper"]]

export function PrimasView() {
  const today = todayISO()
  const { data: book, isPending } = useBookData()
  const { data: incCats = [] } = useIncomeCategories()
  const auto = useMemo(() => (book ? salarioDesdeIngresos(book.incomes, incCats as never, book.settings.trm) : 0), [book, incCats])
  const [sal, setSal] = useState<number | null>(null)
  const [pct, setPct] = useState<RepartoPct>(REPARTO_DEF)
  const [ai, setAi] = useState<{ busy: boolean; plan: { resumen: string; pasos: string[] } | null }>({ busy: false, plan: null })
  if (isPending || !book) return <PageSkeleton kpis={3} />
  const salario = sal ?? auto
  const P = primas(salario, today)
  const prox = P.prox[0]
  const rep = prox ? repartoPrima(prox.v, pct) : null
  const askAI = async () => {
    if (!prox) return
    setAi({ busy: true, plan: null })
    const deudas = book.loans.filter((L) => L.kind === "pagar").map((L) => ({ nombre: L.concepto || loanName(L, book.contacts, book.entities), saldo: Math.round(loanEngine(L, today).saldo), interes_mensual: L.tasa })).filter((d) => d.saldo > 0)
    const r = await primaPlan({ prima: prox.v, deudas, tarjetas: tarjetasDeuda(book.creditCards, today), metas: book.goals.map((m) => ({ nombre: m.nombre, falta: Math.max(0, m.objetivo - m.ahorrado) })), disponible: liquidez(book.assets, book.investments, book.settings.trm, today), basicos: gastosBasicos(book, today) })
    if (!r.ok || !r.plan) { setAi({ busy: false, plan: null }); return toast.error(r.msg ?? "No se pudo obtener la sugerencia") }
    const p = r.plan.porcentajes, tot = p.deudas + p.ahorro + p.metas + p.gusto || 100
    setPct({ deudas: Math.round((p.deudas / tot) * 20) * 5, ahorro: Math.round((p.ahorro / tot) * 20) * 5, metas: Math.round((p.metas / tot) * 20) * 5, gusto: Math.round((p.gusto / tot) * 20) * 5 })
    setAi({ busy: false, plan: r.plan })
  }
  const suma = pct.deudas + pct.ahorro + pct.metas + pct.gusto
  return (
    <div className="grid gap-6">
      <PageHeader id="primas" />
      <Panel title="Tu salario" icon="wallet" description="Con él calculamos tu prima, tus cesantías y sus intereses.">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_1fr] lg:items-end">
          <FormField label="Tu salario mensual" htmlFor="pr-sal" tip="Lo tomamos de tus ingresos. Si ganas hasta 2 salarios mínimos, súmale el auxilio de transporte para calcular prima y cesantías.">
            <MoneyInput id="pr-sal" value={salario} onChange={setSal} />
          </FormField>
          {sal != null && sal !== auto && auto > 0 && (
            <Button variant="link" className="h-auto w-fit p-0" onClick={() => setSal(null)}>Usar el de mis ingresos ({fmtMoney(auto)})</Button>
          )}
        </div>
      </Panel>
      <KpiGrid className="xl:grid-cols-3">
        <Kpi icon="gift" tone="green" label="Prima (cada semestre)" value={<Money value={P.prima} />} sub="En junio y en diciembre" />
        <Kpi icon="landmark" tone="blue" label="Cesantías (al año)" value={<Money value={P.cesantias} />} sub="Van a tu fondo de cesantías" />
        <Kpi icon="percent" tone="violet" label="Intereses de cesantías" value={<Money value={P.interesesCesantias} />} sub="12 % al año, te los pagan a ti" />
      </KpiGrid>
      <Panel title="Próximas fechas" icon="calendar-days" description="Calculado por un año (o semestre) completo trabajado. Las cesantías van a tu fondo y solo se retiran para vivienda, educación o si te quedas sin empleo.">
        <ul className="grid gap-2">
          {P.prox.map((p) => (
            <li key={p.n} className="flex items-center gap-3 rounded-lg border p-3">
              <ToneIcon icon="gift" tone="green" size="sm" />
              <span className="grid min-w-0 flex-1"><b className="truncate">{p.n}</b><span className="text-xs text-muted-foreground">{fmtDate(p.fecha, { long: true })}</span></span>
              <Money value={p.v} className="font-bold text-success" />
            </li>
          ))}
        </ul>
      </Panel>
      {prox && rep && (
        <Panel title={`Plan para tu ${prox.n.toLowerCase()} (${fmtMoney(prox.v)})`} icon="route" description="Recomendado: primero las deudas más caras, luego tu fondo de emergencia.">
          <div className="grid gap-5">
            <div className="grid gap-2 rounded-lg bg-brand-soft p-3">
              <div className="flex flex-wrap items-center gap-2"><p className="flex flex-1 items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-brand" /> Sugerencia con IA según tus deudas y metas</p>
                <Button size="sm" variant="soft" disabled={ai.busy} aria-busy={ai.busy || undefined} onClick={askAI}>{ai.busy ? <Spinner /> : <WandSparkles />}{ai.busy ? "Pensando…" : ai.plan ? "Sugerir otra vez" : "Sugerir un plan"}</Button></div>
              {ai.plan && <><p className="text-sm">{ai.plan.resumen}</p><ul className="list-disc space-y-1 pl-5 text-sm">{ai.plan.pasos.map((x) => <li key={x}>{x}</li>)}</ul></>}
            </div>
            {PARTES.map(([k, l, icon]) => (
              <div key={k} className="grid gap-2">
                <div className="flex items-center justify-between gap-2 text-sm"><span className="flex items-center gap-2"><Icon name={icon} className="size-4 text-brand" />{l} · {suma ? Math.round((pct[k] / suma) * 100) : 0} %</span><Money value={rep[k]} className="font-semibold" /></div>
                <Slider value={[pct[k]]} min={0} max={100} step={5} onValueChange={([v]) => setPct((p) => ({ ...p, [k]: v }))} aria-label={l} />
              </div>
            ))}
            {suma !== 100 && (
              <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                Mueve las barras como quieras: repartimos toda la prima en esa proporción.
                <Button variant="link" className="h-auto p-0" onClick={() => setPct(REPARTO_DEF)}>Volver al reparto recomendado</Button>
              </p>
            )}
          </div>
        </Panel>
      )}
    </div>
  )
}

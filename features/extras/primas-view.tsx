"use client"

import { useMemo, useState } from "react"
import { Sparkles, WandSparkles } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { primaPlan } from "@/features/ai/actions"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { PageHeader } from "@/components/mirai/page-header"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { Money } from "@/components/mirai/money"
import { Icon } from "@/components/mirai/icon"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { REPARTO_DEF, gastosBasicos, liquidez, loanEngine, loanName, primas, repartoPrima, salarioDesdeIngresos, tarjetasDeuda, type RepartoPct } from "@/lib/domain"
import { fmtDate, todayISO } from "@/lib/format"
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
  if (isPending || !book) return <PageSkeleton kpis={0} />
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
  return (
    <div className="grid gap-6">
      <PageHeader id="primas" />
      <Card className="shadow-card ring-0">
        <CardContent className="grid gap-5 md:grid-cols-[minmax(0,22rem)_1fr]">
          <FormField label="Tu salario mensual" htmlFor="pr-sal" tip="Lo tomamos de tus ingresos. Si ganas hasta 2 salarios mínimos, súmale el auxilio de transporte para calcular prima y cesantías.">
            <MoneyInput id="pr-sal" value={salario} onChange={setSal} />
          </FormField>
          <div className="grid grid-cols-3 gap-3">
            {[["Prima (cada semestre)", P.prima], ["Cesantías (al año)", P.cesantias], ["Intereses de cesantías", P.interesesCesantias]].map(([l, v]) => (
              <div key={l as string} className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">{l}</p><Money value={v as number} className="font-semibold" /></div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card className="shadow-card ring-0">
        <CardHeader><CardTitle className="text-base">Próximas fechas</CardTitle><CardDescription>Calculado por un año (o semestre) completo trabajado. Las cesantías van a tu fondo y solo se retiran para vivienda, educación o si te quedas sin empleo.</CardDescription></CardHeader>
        <CardContent className="grid gap-2">
          {P.prox.map((p) => (
            <div key={p.n} className="flex items-center gap-3 rounded-md border p-3">
              <span className="grid size-9 place-items-center rounded-full bg-success-soft text-success"><Icon name="gift" className="size-4" /></span>
              <span className="grid flex-1"><b>{p.n}</b><span className="text-xs text-muted-foreground">{fmtDate(p.fecha, { long: true })}</span></span>
              <Money value={p.v} className="font-bold text-success" />
            </div>
          ))}
        </CardContent>
      </Card>
      {prox && rep && (
        <Card className="shadow-card ring-0">
          <CardHeader><CardTitle className="text-base">Plan para tu {prox.n.toLowerCase()} ({new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(prox.v)})</CardTitle><CardDescription>Recomendado: primero las deudas más caras, luego tu fondo de emergencia.</CardDescription></CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-2 rounded-lg bg-brand-soft p-3">
              <div className="flex flex-wrap items-center gap-2"><p className="flex flex-1 items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-brand" /> Sugerencia con IA según tus deudas y metas</p>
                <Button size="sm" variant="soft" disabled={ai.busy} onClick={askAI}>{ai.busy ? <Spinner /> : <WandSparkles />}{ai.busy ? "Pensando…" : ai.plan ? "Sugerir otra vez" : "Sugerir un plan"}</Button></div>
              {ai.plan && <><p className="text-sm">{ai.plan.resumen}</p><ul className="list-disc space-y-1 pl-5 text-sm">{ai.plan.pasos.map((x) => <li key={x}>{x}</li>)}</ul></>}
            </div>
            {PARTES.map(([k, l, icon]) => (
              <div key={k} className="grid gap-2">
                <div className="flex items-center justify-between text-sm"><span className="flex items-center gap-2"><Icon name={icon} className="size-4 text-brand" />{l} · {pct[k]} %</span><Money value={rep[k]} className="font-semibold" /></div>
                <Slider value={[pct[k]]} min={0} max={100} step={5} onValueChange={([v]) => setPct((p) => ({ ...p, [k]: v }))} aria-label={l} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

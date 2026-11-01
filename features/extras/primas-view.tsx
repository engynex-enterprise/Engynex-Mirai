"use client"

import { useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Slider } from "@/components/ui/slider"
import { PageHeader } from "@/components/mirai/page-header"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { Money } from "@/components/mirai/money"
import { Icon } from "@/components/mirai/icon"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { REPARTO_DEF, primas, repartoPrima, salarioDesdeIngresos, type RepartoPct } from "@/lib/domain"
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
  if (isPending || !book) return <PageSkeleton kpis={0} />
  const salario = sal ?? auto
  const P = primas(salario, today)
  const prox = P.prox[0]
  const rep = prox ? repartoPrima(prox.v, pct) : null
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

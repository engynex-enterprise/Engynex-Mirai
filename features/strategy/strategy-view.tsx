"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { ArrowRight, Sprout, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/mirai/page-header"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { Combobox } from "@/components/mirai/combobox"
import { Segmented } from "@/components/mirai/choice-cards"
import { Money } from "@/components/mirai/money"
import { StatusPill } from "@/components/mirai/status-pill"
import { EntityLogo } from "@/components/mirai/entity-logo"
import { EmptyState } from "@/components/mirai/empty-state"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { CARD_PREFIX, conv, cuotasMes, debtStrategy, loanEngine, loanName, simAbono, tarjetaPagoMes, type DebtSimResult } from "@/lib/domain"
import { todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useBookData } from "@/features/book/use-book-data"

function Method({ title, icon, desc, r, base, best }: { title: string; icon: React.ReactNode; desc: string; r: DebtSimResult; base: DebtSimResult; best: boolean }) {
  return (
    <Card className={cn("gap-3 p-5 shadow-card ring-0", best && "ring-2 ring-brand")}>
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-lg font-semibold">{icon}{title}</p>
        <StatusPill tone={best ? "pagado" : "gray"} hint={best ? "Con este método terminas de pagar más rápido o pagas menos intereses." : "Meses que tardarías en pagar todo con este método."}>{r.m} meses</StatusPill>
      </div>
      <p className="text-sm text-muted-foreground">{desc}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">Pagarías en intereses</p><Money value={r.ti} className="font-semibold" /></div>
        <div className="rounded-md bg-success-soft p-3"><p className="text-xs text-muted-foreground">Te ahorras</p><Money value={Math.max(0, base.ti - r.ti)} className="font-semibold text-success" /></div>
      </div>
      <ol className="grid gap-1 text-sm">
        {r.ord.map((id, i) => <li key={id} className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-2"><span className="w-4 text-right text-muted-foreground tabular-nums">{i + 1}.</span><EntityLogo name={r.names[id]} icon={id.startsWith(CARD_PREFIX) ? "credit-card" : "landmark"} seed={r.names[id]} size={24} /><span className="truncate">{r.names[id]}</span></span><span className="shrink-0 text-muted-foreground">terminas en el mes {r.pay[id]}</span></li>)}
      </ol>
    </Card>
  )
}

export function StrategyView() {
  const today = todayISO()
  const { data: book, isPending } = useBookData()
  const [extra, setExtra] = useState(500000)
  const [abonoId, setAbonoId] = useState<string | null>(null)
  const [abonoV, setAbonoV] = useState(2000000)
  const [modo, setModo] = useState<"plazo" | "cuota">("plazo")

  const data = useMemo(() => {
    if (!book) return null
    const pagar = book.loans.filter((L) => L.kind === "pagar" && loanEngine(L, today).saldo > 1)
    // Las tarjetas entran a la simulación con su saldo, su pago del mes y su tasa (lib/domain/debt-strategy.ts).
    const cards = book.creditCards
    const tarjetas = cards.reduce((a, t) => a + tarjetaPagoMes(t, today), 0)
    // Los pasivos de Balance no tienen tasa ni cuota: se muestran aparte para que no se olviden.
    const pasivos = book.liabilities.map((p) => ({ ...(p as typeof p & { nombre?: string }), v: conv(p.valor, p.currency, book.settings.trm) })).filter((p) => p.v > 0)
    return { pagar, pasivos, S: debtStrategy(pagar, book.contacts, book.entities, extra, today, cards), cuotas: cuotasMes(book.loans, "pagar", today) + tarjetas }
  }, [book, extra, today])
  if (isPending || !book || !data) return <PageSkeleton kpis={3} />
  const { pagar, S, pasivos } = data
  const sel = pagar.find((L) => L.id === abonoId) ?? pagar[0]
  const ab = sel ? simAbono(sel, abonoV, modo, today) : null

  return (
    <div className="grid gap-6">
      <PageHeader id="estrategia" description="Si cada mes pones un poco más de plata a tus deudas, terminas antes y pagas menos intereses. Aquí comparas dos métodos." />
      {!S ? (
        <Card className="shadow-card ring-0"><EmptyState iso="estrategia" title="No tienes deudas por pagar" description="Registra tus créditos en Le debo o tus compras en Tarjetas para usar el simulador." action={<Button asChild><Link href="/le-debo">Ir a Le debo <ArrowRight /></Link></Button>} /></Card>
      ) : (
        <>
          <Card className="shadow-card ring-0">
            <CardContent className="grid gap-5 sm:grid-cols-[minmax(0,22rem)_1fr] sm:items-end">
              <FormField label="¿Cuánto más puedes pagar al mes?" htmlFor="ex-extra" hint={<>Hoy pagas <Money value={data.cuotas} /> en cuotas y tarjetas.</>}>
                <MoneyInput id="ex-extra" value={extra} onChange={setExtra} />
              </FormField>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md bg-muted p-3"><p className="text-xl font-semibold">{S.base.m} meses</p><p className="text-xs text-muted-foreground">Sin pagar extra</p></div>
                <div className="rounded-md bg-muted p-3"><Money value={S.base.ti} className="text-xl font-semibold" /><p className="text-xs text-muted-foreground">Intereses sin pagar extra</p></div>
                <div className="rounded-md bg-brand-soft p-3"><p className="text-xl font-semibold">{S.recomendado === "avalancha" ? "Avalancha" : "Bola de nieve"}</p><p className="text-xs text-muted-foreground">Método que más te conviene</p></div>
              </div>
            </CardContent>
          </Card>
          <div className="grid gap-6 lg:grid-cols-2">
            <Method title="Avalancha" icon={<Zap className="size-5 text-warning" />} desc="Pones el dinero extra a la deuda con el interés más alto. Es la que menos plata te cuesta." r={S.avalancha} base={S.base} best={S.recomendado === "avalancha"} />
            <Method title="Bola de nieve" icon={<Sprout className="size-5 text-success" />} desc="Pones el dinero extra a la deuda más pequeña. Ves resultados rápido y te motiva a seguir." r={S.bola} base={S.base} best={S.recomendado === "bola"} />
          </div>
          {ab && sel && (
            <Card className="shadow-card ring-0">
              <CardHeader><CardTitle className="text-base">¿Y si hago un abono extra a un crédito?</CardTitle><CardDescription>Mira cómo cambia tu deuda antes de hacerlo.</CardDescription></CardHeader>
              <CardContent className="grid gap-5">
                <div className="grid gap-5 md:grid-cols-3">
                  <FormField label="Crédito" htmlFor="ab-id"><Combobox id="ab-id" value={sel.id ?? null} onChange={setAbonoId} options={pagar.map((L) => ({ value: L.id!, label: loanName(L, book.contacts, book.entities), hint: L.concepto }))} /></FormField>
                  <FormField label="Valor del abono" htmlFor="ab-v"><MoneyInput id="ab-v" value={abonoV} onChange={setAbonoV} /></FormField>
                  <FormField label="¿Qué prefieres?"><Segmented value={modo} onChange={(v) => setModo(v as typeof modo)} items={[{ value: "plazo", label: "Terminar antes" }, { value: "cuota", label: "Pagar menos cada mes" }]} /></FormField>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[["Lo que debes", ab.antes.saldo, ab.despues.saldo, true], ["Cuotas que faltan", ab.antes.plan.length, ab.despues.plan.length, false], ["Valor de la cuota", ab.antes.next?.valor ?? 0, ab.despues.next?.valor ?? 0, true]].map(([l, a, d, money]) => (
                    <div key={l as string} className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">{l}</p><p className="font-semibold">{money ? <><Money value={a as number} /> → <Money value={d as number} /></> : `${a} → ${d}`}</p></div>
                  ))}
                  <div className="rounded-md bg-success-soft p-3"><p className="text-xs text-muted-foreground">Ahorro en intereses</p><Money value={ab.ahorroIntereses} className="font-semibold text-success" /></div>
                </div>
                <p className="text-sm text-muted-foreground">Terminar antes casi siempre ahorra más intereses. Pagar menos cada mes te deja más plata libre. Cuando hagas el abono de verdad, regístralo en Le debo › Registrar pago › Un abono.</p>
              </CardContent>
            </Card>
          )}
        </>
      )}
      {pasivos.length > 0 && (
        <Card className="shadow-card ring-0" data-testid="estrategia-pasivos">
          <CardHeader><CardTitle className="text-base">Otras deudas que no entran a la simulación</CardTitle><CardDescription>Las anotaste en Balance sin tasa ni cuota. Si quieres compararlas, regístralas en Le debo con sus condiciones.</CardDescription></CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {pasivos.map((p, i) => <div key={p.id ?? i} className="flex items-center justify-between gap-2 border-b py-1.5 last:border-0"><span className="truncate">{p.nombre || "Deuda"}</span><Money value={p.v} className="shrink-0 font-medium" /></div>)}
            <Button asChild variant="outline" className="mt-2 justify-self-start"><Link href="/le-debo?nuevo=1">Registrar en Le debo <ArrowRight /></Link></Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

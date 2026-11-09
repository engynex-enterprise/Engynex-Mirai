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
import { Notice } from "@/components/mirai/notice"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { StatusPill } from "@/components/mirai/status-pill"
import { EntityLogo } from "@/components/mirai/entity-logo"
import { EmptyState } from "@/components/mirai/empty-state"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { CARD_PREFIX, conv, debtStrategy, loanEngine, loanName, simAbono, type DebtSim, type DebtSimResult } from "@/lib/domain"
import { monthName, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useBookData } from "@/features/book/use-book-data"

/** "marzo de 2029": el mes al que caen `n` meses contados desde hoy. */
function enMes(today: string, n: number): string {
  const [y, m] = today.slice(0, 7).split("-").map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${monthName(d.getMonth() + 1)} de ${d.getFullYear()}`
}

/** "8 meses" · "2 años y 3 meses": un plazo dicho como lo diría una persona. */
function dura(m: number): string {
  if (m < 12) return `${m} ${m === 1 ? "mes" : "meses"}`
  const a = Math.floor(m / 12)
  const r = m % 12
  const anios = `${a} ${a === 1 ? "año" : "años"}`
  return r ? `${anios} y ${r} ${r === 1 ? "mes" : "meses"}` : anios
}

/** Redondea una sugerencia de plata a la decena de miles más cercana (mínimo $10.000). */
const redondo = (v: number) => Math.max(10_000, Math.round(v / 10_000) * 10_000)

/** Por debajo de esta diferencia los dos caminos son lo mismo en la práctica: no se señala un ganador. */
const DA_IGUAL = 50_000

const iconoDe = (id: string) => (id.startsWith(CARD_PREFIX) ? "credit-card" : "landmark")

/** Un préstamo sin contraparte llega como "— · Nevera" (o como "—" pelado): se muestra solo lo que sí dice algo. */
function nom(n: string): string {
  const t = n.replace(/^—\s*·\s*/, "").trim()
  return !t || t === "—" ? "Deuda" : t
}

/**
 * Uno de los dos caminos: qué es, en cuánto terminas y en qué orden vas pagando. El orden es lo importante de la
 * tarjeta: ahí está la única decisión que tiene que tomar la persona (a cuál deuda le pone la plata extra).
 */
function Metodo({ titulo, icon, quienLoUsa, r, base, extra, mejor, ventaja, today }: {
  titulo: string; icon: React.ReactNode; quienLoUsa: string; r: DebtSimResult; base: DebtSimResult
  extra: number; mejor: boolean; ventaja: number; today: string
}) {
  const ahorro = base.fin && r.fin ? Math.max(0, base.ti - r.ti) : null
  const primera = r.ord.find((id) => r.pay[id]) ?? r.ord[0]
  return (
    <Card className={cn("gap-4 p-5 shadow-card ring-0", mejor && "ring-2 ring-brand")}>
      <div className="grid gap-1">
        <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          {icon}{titulo}
          {mejor && ventaja > 0 && (
            <span className="rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-semibold text-success">
              Te ahorras <Money value={ventaja} /> más por aquí
            </span>
          )}
        </p>
        <p className="text-sm text-muted-foreground">{quienLoUsa}</p>
      </div>

      {r.fin ? (
        <p className="text-[15px] leading-relaxed">
          Quedas libre de deudas en <strong>{enMes(today, r.m)}</strong>
          {ahorro !== null && ahorro > 0 && <> y te ahorras <Money value={ahorro} className="font-semibold text-success" /> de intereses</>}.
        </p>
      ) : (
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Por este camino todavía no se acaban. Sube un poco la cifra de arriba y mira desde cuánto sí.
        </p>
      )}

      <div className="grid gap-2">
        <p className="text-[13px] text-muted-foreground">
          {extra > 0 && primera
            ? <>El orden que te propongo. Empieza por <strong className="text-foreground">{nom(r.names[primera])}</strong>: ponle los <Money value={extra} /> extra cada mes hasta que quede en cero.</>
            : <>El orden que te propongo: la cuota de la que vayas terminando pasa completa a la siguiente.</>}
        </p>
        <ol className="grid gap-1.5 text-sm">
          {r.ord.map((id, i) => (
            <li key={id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
              <span className="flex min-w-0 items-center gap-2">
                <span className="w-4 text-right text-muted-foreground tabular-nums">{i + 1}.</span>
                <EntityLogo name={nom(r.names[id])} icon={iconoDe(id)} seed={r.names[id]} size={24} />
                <span className="truncate">{nom(r.names[id])}</span>
              </span>
              <span className="ml-auto text-muted-foreground">
                {r.pay[id] ? <>la terminas en {enMes(today, r.pay[id])}</> : "con este plan no alcanza"}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  )
}

/**
 * El plan dicho en pesos y con nombre propio. El paso 3 es el que hace entender la "bola de nieve": muestra que la
 * cuota de la deuda que terminas se suma a la plata extra para la siguiente.
 */
function Plan({ mejor, extra, cuotas, deudaDe }: { mejor: DebtSimResult; extra: number; cuotas: number; deudaDe: (id: string) => DebtSim | undefined }) {
  const ids = mejor.ord.filter((id) => mejor.pay[id])
  const primera = ids[0] ? deudaDe(ids[0]) : undefined
  const segunda = ids[1] ? deudaDe(ids[1]) : undefined
  if (!primera) return null
  return (
    <ol className="grid gap-3 text-[15px] leading-relaxed">
      <li className="flex gap-3">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[13px] font-semibold text-link">1</span>
        <span>Sigue pagando todas tus cuotas como siempre: <Money value={cuotas} className="font-semibold" /> al mes.</span>
      </li>
      <li className="flex gap-3">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[13px] font-semibold text-link">2</span>
        <span>Cada mes ponle <Money value={extra} className="font-semibold" /> extra a <strong>{nom(primera.n)}</strong>, hasta que quede en cero.</span>
      </li>
      <li className="flex gap-3">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[13px] font-semibold text-link">3</span>
        <span>
          Cuando quede en cero, esos <Money value={primera.c + extra} className="font-semibold" /> (su cuota más tu plata extra) pasan completos a la siguiente
          {segunda ? <>: <strong>{nom(segunda.n)}</strong></> : <> deuda</>}. Por eso cada vez vas más rápido.
        </span>
      </li>
    </ol>
  )
}

export function StrategyView() {
  const today = todayISO()
  const { data: book, isPending } = useBookData()
  // Arranca en cero: la pantalla primero te dice cómo vas hoy de verdad, y tú decides cuánto más puedes poner.
  const [extra, setExtra] = useState(0)
  const [abonoId, setAbonoId] = useState<string | null>(null)
  const [abonoV, setAbonoV] = useState(1_000_000)
  const [modo, setModo] = useState<"plazo" | "cuota">("plazo")

  const data = useMemo(() => {
    if (!book) return null
    const pagar = book.loans.filter((L) => L.kind === "pagar" && loanEngine(L, today).saldo > 1)
    // Las tarjetas entran a la simulación con lo que debes, su cuota del mes y su tasa (packages/domain/src/debt-strategy.ts).
    const cards = book.creditCards
    // Los pasivos de Balance no tienen tasa ni cuota: se muestran aparte para que no se olviden.
    const pasivos = book.liabilities.map((p) => ({ ...(p as typeof p & { nombre?: string }), v: conv(p.valor, p.currency, book.settings.trm) })).filter((p) => p.v > 0)
    const S = debtStrategy(pagar, book.contacts, book.entities, extra, today, cards)
    // El mismo plan pero sin poner un peso más: solo pasarle a la siguiente deuda la cuota de la que se va acabando.
    const S0 = extra > 0 ? debtStrategy(pagar, book.contacts, book.entities, 0, today, cards) : S
    return { pagar, pasivos, S, S0 }
  }, [book, extra, today])
  if (isPending || !book || !data) return <PageSkeleton kpis={3} />
  const { pagar, S, S0, pasivos } = data

  const total = S ? S.deudas.reduce((a, d) => a + d.s, 0) : 0
  const mejor = S ? S[S.recomendado] : null
  const peor = S ? S[S.recomendado === "avalancha" ? "bola" : "avalancha"] : null
  const ahorro = S && mejor && S.base.fin && mejor.fin ? Math.max(0, S.base.ti - mejor.ti) : 0
  const antes = S && mejor && S.base.fin && mejor.fin ? S.base.m - mejor.m : 0
  // Diferencia real entre los dos caminos: si es chiquita, da lo mismo cuál escojas.
  const ventaja = mejor && peor && mejor.fin && peor.fin ? Math.max(0, peor.ti - mejor.ti) : 0
  const daIgual = !!S && (S.empate || ventaja < DA_IGUAL)
  // Lo que te ahorras sin poner un peso más, solo por no quedarte con la cuota de la deuda que termines.
  const reciclar = S0 ? S0[S0.recomendado] : null
  const ahorroReciclar = S && reciclar && S.base.fin && reciclar.fin ? Math.max(0, S.base.ti - reciclar.ti) : 0
  const antesReciclar = S && reciclar && S.base.fin && reciclar.fin ? S.base.m - reciclar.m : 0
  const sugerencias = S && S.cuotas > 0
    ? [...new Set([0.1, 0.25, 0.5].map((p) => redondo(S.cuotas * p)))]
    : [50_000, 100_000, 200_000]

  const deudaDe = (id: string): DebtSim | undefined => S?.deudas.find((d) => d.id === id)
  const hayTarjetas = !!S?.deudas.some((d) => d.id.startsWith(CARD_PREFIX))
  const hayCreditos = !!S?.deudas.some((d) => !d.id.startsWith(CARD_PREFIX))
  // El abono se simula sobre un crédito de Le debo; por defecto, el primero del camino recomendado.
  const primeraDelPlan = mejor?.ord.find((id) => !id.startsWith(CARD_PREFIX) && pagar.some((L) => L.id === id))
  const sel = pagar.find((L) => L.id === abonoId) ?? pagar.find((L) => L.id === primeraDelPlan) ?? pagar[0]
  const ab = sel ? simAbono(sel, abonoV, modo, today) : null
  const hayPlan = !!(mejor?.fin && mejor.ord.some((id) => mejor.pay[id] && deudaDe(id)))

  return (
    <div className="grid gap-6">
      <PageHeader id="estrategia" description="Mira en qué fecha quedas libre de deudas y qué puedes hacer para que sea antes. Lo primero no te cuesta un peso más." />

      {!S ? (
        <Card className="shadow-card ring-0">
          {pasivos.length > 0 ? (
            <EmptyState iso="estrategia" title="Por ahora no puedo armarte el plan"
              description="Tienes deudas anotadas en Balance, pero sin saber de cuánto es la cuota y cuánto cobran de interés no puedo calcular en cuánto tiempo las pagas. Regístralas en Le debo con esos dos datos y te armo el plan completo."
              action={<Button asChild><Link href="/le-debo?nuevo=1">Registrar en Le debo <ArrowRight /></Link></Button>} />
          ) : (
            <EmptyState iso="estrategia" title="No tienes deudas por pagar"
              description="Esa es una muy buena noticia: lo que antes se te iba en cuotas ahora puede ir a una meta. Si algún día pides un crédito o compras a cuotas, aquí te muestro en cuánto tiempo sales de él."
              action={<><Button asChild><Link href="/metas">Ver mis metas <ArrowRight /></Link></Button><Button asChild variant="outline"><Link href="/le-debo">Ir a Le debo</Link></Button></>} />
          )}
        </Card>
      ) : (
        <>
          {/* 1. Cómo vas hoy: las tres cifras separadas y, debajo, de dónde salen. */}
          <Card className="shadow-card ring-0">
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                1 · Así vas hoy
                <StatusPill tone="estimado" hint="Calculado con lo que tienes registrado en Le debo y en Tarjetas. Las fechas se pueden mover unos días.">Estimado</StatusPill>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <KpiGrid cols={3}>
                <Kpi icon="landmark" tone="red" label="Debes hoy" value={<Money value={total} />}
                  sub={S.deudas.length === 1 ? "En una deuda" : `En ${S.deudas.length} deudas`}
                  info="Sumo tus créditos de Le debo y lo que debes en tus tarjetas. Las deudas que anotaste en Balance sin cuota ni interés no entran: están al final de esta página." />
                <Kpi icon="calendar-clock" tone="amber" label="Pagas al mes" value={<Money value={S.cuotas} />} sub="La suma de todas tus cuotas"
                  info="Es lo que se te va cada mes solo en cuotas. No cuento seguros ni cuota de manejo, porque esos no bajan lo que debes." />
                <Kpi icon="flag" tone="brand" label="Quedarías libre en" value={S.base.fin ? enMes(today, S.base.m) : "No se acaba"}
                  valueClassName="whitespace-normal text-[20px] leading-tight"
                  sub={S.base.fin ? `En ${dura(S.base.m)}` : "La cuota no baja la deuda"}
                  info="Supone que pagas cada cuota completa y a tiempo, y que cuando termines una deuda esa plata te la quedas para otras cosas." />
              </KpiGrid>

              <p className="text-sm text-muted-foreground">
                {S.base.fin && <>De aquí a {enMes(today, S.base.m)} vas a pagar <Money value={S.base.ti} className="font-semibold text-foreground" /> en intereses. </>}
                Los <strong>intereses</strong> son lo que te cobran por prestarte la plata: salen de tu bolsillo, pero no bajan lo que debes. Entre más rápido pagues, menos te cobran.
              </p>

              {!S.base.fin && (
                <Notice tone="info" title="Hay una deuda en la que la cuota solo alcanza para los intereses"
                  action={<Button asChild size="sm" variant="outline"><Link href="/le-debo">Ver esa deuda</Link></Button>}>
                  No es culpa tuya: hay créditos armados así, donde cada mes pagas solo los intereses y la plata prestada se devuelve toda junta al final. Mientras tanto, lo que debes se queda igual. Tienes dos salidas: abonarle de más (abajo te muestro cuánto cambia) o llamar a quien te prestó y pedirle menos interés o más plazo.
                </Notice>
              )}

              <details className="rounded-lg bg-muted/60 p-4 text-sm">
                <summary className="cursor-pointer font-semibold">Ver las {S.deudas.length === 1 ? "deuda" : `${S.deudas.length} deudas`} que estoy contando</summary>
                <ul className="mt-2 grid gap-1.5">
                  {S.deudas.map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 border-b py-1.5 last:border-0">
                      <span className="flex min-w-0 items-center gap-2">
                        <EntityLogo name={nom(d.n)} icon={iconoDe(d.id)} seed={d.n} size={24} />
                        <span className="truncate">{nom(d.n)}</span>
                      </span>
                      <span className="shrink-0 text-muted-foreground">debes <Money value={d.s} className="text-foreground" /> · cuota <Money value={d.c} className="text-foreground" /></span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-muted-foreground">
                  {/* Solo se nombra de dónde salen las que de verdad hay: si no tienes tarjetas, mencionarlas confunde. */}
                  {hayTarjetas && hayCreditos ? <>Vienen de <Link href="/le-debo" className="underline">Le debo</Link> y de <Link href="/tarjetas" className="underline">Tarjetas</Link>.</>
                    : hayTarjetas ? <>Vienen de <Link href="/tarjetas" className="underline">Tarjetas</Link>.</>
                    : <>Vienen de <Link href="/le-debo" className="underline">Le debo</Link>.</>}
                </p>
              </details>

              <details className="rounded-lg bg-muted/60 p-4 text-sm">
                <summary className="cursor-pointer font-semibold">¿Qué tan exacta es esta cuenta?</summary>
                <p className="mt-2 text-muted-foreground">Es un estimado, no una promesa del banco. Para sacarla doy por hecho que:</p>
                <ul className="mt-1.5 grid list-disc gap-1 pl-5 text-muted-foreground">
                  <li>Pagas tus cuotas completas y a tiempo.</li>
                  <li>Los intereses se quedan como están hoy.</li>
                  <li><b className="text-foreground">No vuelves a comprar con la tarjeta</b> de crédito ni pides otro crédito.</li>
                  <li>La plata extra, si pones, la pones todos los meses.</li>
                </ul>
                <p className="mt-2 text-muted-foreground">No cuento seguros ni cuota de manejo, porque esos no bajan lo que debes. Si algo cambia, vuelve y mira otra vez.</p>
              </details>
            </CardContent>
          </Card>

          {/* 2. Las dos palancas: reciclar la cuota que se libera (gratis) y poner plata extra. */}
          {!S.base.fin && reciclar?.fin && (
            <Notice tone="ok" title="Hay una salida que no te cuesta un peso más">
              Pagando cada cuota por aparte, esa deuda se queda igual. Pero cuando termines alguna de tus otras deudas,
              échale esa cuota completa encima: así sí se acaba, y quedarías libre en <strong>{enMes(today, reciclar.m)}</strong>.
              Es lo que hacen los dos caminos de más abajo.
            </Notice>
          )}
          {ahorroReciclar > 0 && reciclar && (
            <Notice tone="ok" title="Lo que no te cuesta un peso más: no te quedes con la cuota que se libera">
              Cuando termines una de tus deudas, en vez de quedarte con esa plata, échasela completa a la siguiente. Sigues
              pagando lo mismo todos los meses (<Money value={S.cuotas} />), pero quedas libre en <strong>{enMes(today, reciclar.m)}</strong>
              {antesReciclar > 0 && <>, {dura(antesReciclar)} antes</>}, y te ahorras <Money value={ahorroReciclar} className="font-semibold text-success" /> en intereses.
              Así funcionan los dos caminos de más abajo.
            </Notice>
          )}

          <Card className="shadow-card ring-0">
            <CardHeader>
              <CardTitle className="text-base">2 · ¿Y cuánto más puedes poner cada mes?</CardTitle>
              <CardDescription>
                Además de las cuotas que ya pagas, que siguen igual. Puede ser poquito —$20.000 ya cambian la cuenta— y lo que manda es que sea todos los meses. Esa plata extra se le pone a UNA sola deuda.
                {" "}Nada de lo que escribas aquí cambia tus deudas ni se guarda: es para que veas qué pasaría.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-[minmax(0,20rem)_1fr] sm:items-start">
              <div className="grid gap-3">
                <FormField label="Plata extra al mes" htmlFor="ex-extra"
                  tip="Plata que le puedes meter a tus deudas además de las cuotas: lo que te sobra de la quincena, un turno extra, un gasto que cortaste. Si este mes no te sobra nada, déjalo en cero."
                  hint={S.cuotas > 0 ? "Te propongo la décima parte, la cuarta parte y la mitad de lo que ya pagas en cuotas. O escribe la tuya." : "Son cifras de ejemplo para que veas cómo funciona."}>
                  <MoneyInput id="ex-extra" value={extra} onChange={setExtra} />
                </FormField>
                <div className="flex flex-wrap gap-2">
                  {sugerencias.map((v) => (
                    <Button key={v} type="button" variant={extra === v ? "default" : "outline"} size="sm" onClick={() => setExtra(v)}>
                      <Money value={v} />
                    </Button>
                  ))}
                  {extra > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => setExtra(0)}>Volver a cero</Button>}
                </div>
                <p className="text-[12.5px] text-muted-foreground">
                  ¿No sabes de dónde sacarla? Mira tus <Link href="/gastos" className="underline">gastos hormiga</Link>: ahí casi siempre aparecen $50.000 o $100.000 al mes.
                </p>
              </div>
              <div className="rounded-lg bg-brand-soft p-4 text-[15px] leading-relaxed">
                {extra <= 0 ? (
                  <>Escribe una cifra o toca una de las de al lado y te digo en qué fecha quedarías libre y cuánta plata te ahorras.</>
                ) : !mejor?.fin ? (
                  <>Con <Money value={extra} className="font-semibold" /> más al mes todavía no alcanza para salir de estas deudas. Prueba con una cifra más alta.</>
                ) : (
                  <>
                    Poniendo <Money value={extra} className="font-semibold" /> más cada mes, quedas libre de deudas en <strong>{enMes(today, mejor.m)}</strong>
                    {antes > 0 && <>: <strong>{dura(antes)} antes</strong></>}
                    {ahorro > 0 && <> y te ahorras <Money value={ahorro} className="font-semibold text-success" /> que ibas a pagar en intereses</>}.
                    {ahorroReciclar > 0 && <> Esta cuenta ya incluye lo de arriba: reciclar la cuota que se libera.</>}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* 3. La decisión: a cuál deuda le cae la plata extra. */}
          <div className="grid gap-3">
            <div className="grid gap-1">
              <h2 className="text-lg font-semibold">3 · ¿Por cuál deuda empiezas?</h2>
              <p className="max-w-[75ch] text-sm text-muted-foreground">
                Hay dos formas de escoger y las dos funcionan: mira las dos y quédate con la que te sirva. Cuando la deuda que elegiste queda en cero, todo lo que le estabas pagando pasa a la siguiente, y la siguiente cae más rápido. Por eso cada vez vas acelerando.
              </p>
            </div>
            {daIgual && (
              <Notice tone="info" title="Con tus deudas da lo mismo cuál escojas">
                Los dos caminos terminan prácticamente igual{ventaja > 0 && <> (la diferencia es de <Money value={ventaja} />)</>}. Pasa cuando tienes una sola deuda, o cuando la más cara es también la más pequeña. Escoge el que más te anime y sigue el orden de la lista.
              </Notice>
            )}
            <div className="grid gap-6 lg:grid-cols-2">
              <Metodo
                titulo="Empieza por la más cara"
                icon={<Zap className="size-5 text-warning" />}
                quienLoUsa="Le pones la plata extra a la deuda más cara: la que más intereses te cobra por cada peso que debes. Es la que te deja pagando menos intereses al final. En otros lados la llaman «avalancha»."
                r={S.avalancha} base={S.base} extra={extra} mejor={!daIgual && S.recomendado === "avalancha"} ventaja={ventaja} today={today}
              />
              <Metodo
                titulo="Empieza por la más pequeña"
                icon={<Sprout className="size-5 text-success" />}
                quienLoUsa="Le pones la plata extra a la deuda más chiquita, para tacharla rápido. Pagas un poquito más de intereses al final (tu cuota no cambia), pero ver una deuda menos anima a seguir. La llaman «bola de nieve»."
                r={S.bola} base={S.base} extra={extra} mejor={!daIgual && S.recomendado === "bola"} ventaja={ventaja} today={today}
              />
            </div>
          </div>

          {/* 4. La otra pregunta típica: me cayó una plata de una, ¿qué hago con ella? */}
          <Card className="shadow-card ring-0">
            <CardHeader>
              <CardTitle className="text-base">4 · ¿Y si te cae una plata y abonas de una?</CardTitle>
              <CardDescription>Una prima, unas cesantías, un negocio que te pagaron. Mira cómo te quedaría la deuda antes de hacerlo. Aquí tampoco se guarda nada.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              {ab && sel ? (
                <>
                  <div className="grid gap-5 md:grid-cols-3">
                    <FormField label="¿A cuál deuda?" htmlFor="ab-id" tip="Aquí solo aparecen los créditos de Le debo. Para abonarle a una tarjeta, hazlo desde Tarjetas.">
                      <Combobox id="ab-id" value={sel.id ?? null} onChange={setAbonoId} options={pagar.map((L) => ({ value: L.id!, label: nom(loanName(L, book.contacts, book.entities) + (L.concepto ? ` · ${L.concepto}` : "")), hint: L.concepto }))} />
                    </FormField>
                    <FormField label="¿Cuánto vas a abonar?" htmlFor="ab-v"
                      tip="La plata que le meterías de una, además de la cuota del mes."
                      hint="Te puse $1.000.000 de ejemplo. Cámbialo por lo que te vaya a caer.">
                      <MoneyInput id="ab-v" value={abonoV} onChange={setAbonoV} />
                    </FormField>
                    <FormField label="¿Qué prefieres?"
                      tip="Al abonar, el banco te deja escoger entre las dos."
                      hint="Terminar antes: sigues pagando la misma cuota, pero te faltan menos. Pagar menos cada mes: te queda más plata libre desde ya.">
                      <Segmented value={modo} onChange={(v) => setModo(v as typeof modo)} items={[{ value: "plazo", label: "Terminar antes" }, { value: "cuota", label: "Pagar menos cada mes" }]} />
                    </FormField>
                  </div>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <div className="rounded-md bg-muted p-3">
                      <p className="text-xs text-muted-foreground">Lo que debes</p>
                      <p className="font-semibold"><Money value={ab.antes.saldo} /> → <Money value={ab.despues.saldo} /></p>
                    </div>
                    <div className="rounded-md bg-muted p-3">
                      <p className="text-xs text-muted-foreground">Cuotas que te faltan</p>
                      <p className="font-semibold">{ab.antes.plan.length} → {ab.despues.plan.length} {ab.despues.plan.length === 1 ? "cuota" : "cuotas"}</p>
                    </div>
                    <div className="rounded-md bg-muted p-3">
                      <p className="text-xs text-muted-foreground">Lo que pagas cada cuota</p>
                      <p className="font-semibold">
                        {!ab.antes.next ? "—"
                          : !ab.despues.next ? <><Money value={ab.antes.next.valor} /> → queda en cero</>
                          : Math.round(ab.antes.next.valor) === Math.round(ab.despues.next.valor)
                          ? <><Money value={ab.antes.next.valor} /> <span className="text-xs font-normal text-muted-foreground">(no cambia)</span></>
                          : <><Money value={ab.antes.next.valor} /> → <Money value={ab.despues.next.valor} /></>}
                      </p>
                    </div>
                    <div className="rounded-md bg-success-soft p-3">
                      <p className="text-xs text-muted-foreground">Intereses que te ahorras</p>
                      <Money value={ab.ahorroIntereses} className="font-semibold text-success" />
                      <p className="text-xs text-muted-foreground">Comparado con no abonar</p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Cuando hagas el abono de verdad, anótalo en <Link href="/le-debo" className="underline">Le debo › Registrar pago › Un abono</Link> para que las cuentas te queden al día.
                  </p>
                </>
              ) : (
                <Notice tone="info" title="Tus deudas de hoy son tarjetas de crédito"
                  action={<Button asChild size="sm" variant="outline"><Link href="/tarjetas">Ir a Tarjetas</Link></Button>}>
                  Si te cae una prima o unas cesantías, lo que más te ahorra es abonarle a la tarjeta: lo haces desde Tarjetas › Pagar. Esta simulación es para los créditos que tengas en Le debo.
                </Notice>
              )}
            </CardContent>
          </Card>

          {/* 5. Qué hacer el lunes: el plan en pesos, con nombre propio. */}
          {extra > 0 && mejor && hayPlan && (
            <Card className="shadow-card ring-0">
              <CardHeader>
                <CardTitle className="text-base">Tu plan, en 3 pasos</CardTitle>
                <CardDescription>Esto es todo lo que tienes que hacer.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Plan mejor={mejor} extra={extra} cuotas={S.cuotas} deudaDe={deudaDe} />
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button asChild variant="outline"><Link href="/recordatorios">Ponerme un recordatorio</Link></Button>
                  <Button asChild variant="outline"><Link href="/le-debo">Ver mis deudas</Link></Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {pasivos.length > 0 && S && (
        <Card className="shadow-card ring-0" data-testid="estrategia-pasivos">
          <CardHeader>
            <CardTitle className="text-base">Me faltan datos de estas deudas</CardTitle>
            <CardDescription>Están en Balance, pero no sé de cuánto es la cuota ni cuánto cobran de interés, así que no puedo calcular en cuánto tiempo se pagan. Si las registras en Le debo con esos dos datos, entran al plan de arriba.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {pasivos.map((p, i) => (
              <div key={p.id ?? i} className="flex items-center justify-between gap-2 border-b py-1.5 last:border-0">
                <span className="truncate">{p.nombre || "Deuda"}</span>
                <Money value={p.v} className="shrink-0 font-medium" />
              </div>
            ))}
            <Button asChild variant="outline" className="mt-2 justify-self-start"><Link href="/le-debo?nuevo=1">Completar en Le debo <ArrowRight /></Link></Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

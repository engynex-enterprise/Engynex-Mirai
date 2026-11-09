"use client"

import dynamic from "next/dynamic"
import Link from "next/link"
import { useMemo } from "react"
import { parseAsString, useQueryState } from "nuqs"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/mirai/page-header"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { Segmented } from "@/components/mirai/choice-cards"
import { Panel } from "@/components/mirai/panel"
import { Icon } from "@/components/mirai/icon"
import { StatusPill } from "@/components/mirai/status-pill"
import { EmptyState } from "@/components/mirai/empty-state"
import { DashboardSkeleton } from "@/components/skeletons/dashboard-skeleton"
import { useList } from "@/hooks/use-book-data"
import { addDays, addMonths, iso, lastDay, toDay } from "@/lib/domain"
import { capacidad, compromisos, decisiones, deudas, metasAvance, serieMeses, type Decision } from "@/lib/domain/dashboard"
import { metaEstado, parseMetaCfg } from "@mirai/domain/meta"
import { MODULOS, estadoIntegral, flujoIntegral, salidasPorModulo, type Mov, type Periodo } from "@/lib/domain/flujo-integral"
import { fmtDate, fmtMonth, monthName, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useBookData } from "@/features/book/use-book-data"
import { useIntegralExtras } from "@/features/balance/use-integral"
import { EstadoPill } from "@/features/balance/balance-parts"
import { VIZ, VIZ_BG } from "./palette"

// recharts sale del JS inicial: las gráficas llegan después de pintar la página.
const ChartLoading = ({ h = "h-64" }: { h?: string }) => <Skeleton className={cn("w-full rounded-lg", h)} aria-hidden />
const MesesChart = dynamic(() => import("./charts").then((m) => m.MesesChart), { ssr: false, loading: () => <ChartLoading h="h-64 sm:h-72" /> })
const CategoriasChart = dynamic(() => import("./charts").then((m) => m.CategoriasChart), { ssr: false, loading: () => <ChartLoading h="h-48" /> })
const SerieChart = dynamic(() => import("./charts").then((m) => m.SerieChart), { ssr: false, loading: () => <ChartLoading h="h-48" /> })

type Per = "mes" | "mes-pasado" | "3m" | "12m" | "anio"
const PERIODOS: { value: Per; label: string }[] = [
  { value: "mes", label: "Este mes" }, { value: "mes-pasado", label: "Mes pasado" }, { value: "3m", label: "Últimos 3 meses" },
  { value: "12m", label: "Últimos 12 meses" }, { value: "anio", label: "Este año" },
]

function rango(per: Per, today: string): Periodo & { label: string } {
  const t = toDay(today)
  const fin = (d: Date) => iso(new Date(d.getFullYear(), d.getMonth(), lastDay(d.getFullYear(), d.getMonth())))
  const ini = (k: number) => addMonths(new Date(t.getFullYear(), t.getMonth(), 1), k)
  if (per === "mes-pasado") { const d = ini(-1); return { a: iso(d), b: fin(d), tipo: "mes", label: fmtMonth(iso(d).slice(0, 7)) } }
  if (per === "3m") return { a: iso(ini(-2)), b: fin(t), tipo: "rango", label: "los últimos 3 meses" }
  if (per === "12m") return { a: iso(ini(-11)), b: fin(t), tipo: "rango", label: "los últimos 12 meses" }
  if (per === "anio") return { a: `${t.getFullYear()}-01-01`, b: `${t.getFullYear()}-12-31`, tipo: "anio", label: `el año ${t.getFullYear()}` }
  return { a: iso(ini(0)), b: fin(t), tipo: "mes", label: fmtMonth(today.slice(0, 7)) }
}

const TONO: Record<Decision["tono"], string> = {
  ok: "bg-success-soft text-success", warn: "bg-warning-soft text-[#B86E00] dark:text-[#FFB547]", bad: "bg-danger-soft text-danger", info: "bg-info-soft text-info",
}
const TONO_TXT: Record<Decision["tono"], string> = { ok: "Va bien", warn: "Ojo", bad: "Urgente", info: "Idea" }

/** Decisiones: qué te conviene hacer, con su impacto en pesos y a dónde ir. */
function Decisiones({ list }: { list: Decision[] }) {
  return (
    <Panel title="Decisiones: lo que te conviene hacer" icon="lightbulb" info="Mirai mira tus números (deudas, compromisos, ahorro, impuestos, suscripciones) y te dice qué hacer primero y cuánto te ahorra o te libera en pesos." data-testid="decisiones">
      {!list.length ? <p className="text-sm text-muted-foreground">Registra tus ingresos, gastos y deudas para recibir recomendaciones.</p> : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {list.map((d) => (
            <li key={d.id} className="flex items-start gap-3 rounded-lg bg-secondary/50 p-3">
              <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", TONO[d.tono])}><Icon name={d.icon} className="size-4.5" /></span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="flex flex-wrap items-center gap-1.5"><StatusPill tone={d.tono === "bad" ? "bad" : d.tono === "warn" ? "warn" : d.tono === "ok" ? "ok" : "info"} className="h-5">{TONO_TXT[d.tono]}</StatusPill><span className="font-semibold" data-money>{d.titulo}</span></span>
                <span className="text-sm text-muted-foreground" data-money>{d.detalle}</span>
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={d.href} className="text-sm font-semibold text-link hover:underline">{d.accion} ›</Link>
                  {d.impacto ? <span className="text-sm"><Money value={d.impacto} className="font-bold" /> <span className="text-muted-foreground">{d.impactoLabel}</span></span> : null}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** Barra apilada en HTML (compromisos, módulos) con leyenda y valores: el color nunca va solo. */
function Apilada({ items, total, aria }: { items: { k: string; label: string; v: number; cls: string; href?: string }[]; total: number; aria: string }) {
  const vis = items.filter((x) => x.v > 0)
  return (
    <div className="grid gap-2">
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded-full" role="img" aria-label={aria}>
        {vis.map((x) => <span key={x.k} className={cn("h-full first:rounded-l-full last:rounded-r-full", x.cls)} style={{ width: `${(x.v / (total || 1)) * 100}%` }} />)}
      </div>
      <ul className="grid gap-1.5">
        {vis.map((x) => (
          <li key={x.k} className="grid grid-cols-[0.75rem_minmax(0,1fr)_auto_3rem] items-center gap-2 text-sm">
            <span className={cn("size-3 rounded-full", x.cls)} />
            <span className="truncate">{x.href ? <Link href={x.href} className="hover:text-link">{x.label}</Link> : x.label}</span>
            <Money value={x.v} short className="font-semibold" />
            <span className="text-right text-xs text-muted-foreground">{Math.round((x.v / (total || 1)) * 100)} %</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function MovLista({ list, empty }: { list: Mov[]; empty: string }) {
  if (!list.length) return <p className="text-sm text-muted-foreground">{empty}</p>
  return (
    <ul className="grid">
      {list.map((x) => {
        const [, m, d] = x.fecha.split("-").map(Number)
        return (
          <li key={x.id} className="flex items-center gap-3 border-b border-dotted py-2 last:border-0">
            <span className="grid w-11 shrink-0 overflow-hidden rounded-xl bg-card text-center shadow-card">
              <span className={cn("py-0.5 text-[10px] font-bold text-white uppercase", x.estado === "vencido" ? "bg-danger" : "bg-brand-gradient")}>{monthName(m, false)}</span>
              <span className="py-0.5 text-lg leading-6 font-bold">{d}</span>
            </span>
            <span className="grid min-w-0 flex-1">
              <Link href={x.href} className="truncate text-[14px] font-semibold hover:text-link">{x.n}</Link>
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground"><EstadoPill m={x} /><span className="truncate">{MODULOS[x.modulo].label}</span></span>
            </span>
            <Money value={x.v} sign={x.dir === "entra"} className={cn("shrink-0 font-bold", x.dir === "entra" && "text-success")} />
          </li>
        )
      })}
    </ul>
  )
}

export function DashboardView() {
  const today = todayISO()
  const [perRaw, setPer] = useQueryState("periodo", parseAsString.withDefault("mes"))
  const per = (PERIODOS.some((p) => p.value === perRaw) ? perRaw : "mes") as Per
  const { data: book, isPending } = useBookData()
  const X = useIntegralExtras(book, today)
  const { data: snaps = [] } = useList("net_worth_snapshots")

  const d = useMemo(() => {
    if (!book) return null
    const P = rango(per, today)
    const F = flujoIntegral(book, P, today, X)
    const E = estadoIntegral(book, today, X)
    const S = serieMeses(book, today, X)
    const comp = compromisos(book, today)
    const cap = capacidad(book, today, comp, E.liquidez)
    const deu = deudas(book, today)
    const t = toDay(today)
    const R = flujoIntegral(book, { a: iso(addDays(t, -90)), b: iso(addDays(t, 365)), tipo: "rango" }, today, X)
    const en30 = iso(addDays(t, 30))
    const vencidos = R.movs.filter((x) => x.estado === "vencido")
    const proximos = R.movs.filter((x) => x.fecha >= today && x.fecha <= en30 && x.estado !== "hecho" && x.modulo !== "presupuesto")
    const impuestos = R.movs.filter((x) => x.modulo === "impuestos" && x.fecha >= today)
    const sinValor = R.sinValor.filter((x) => x.fecha >= today)
    const dec = decisiones(book, today, { comp, cap, deu, vencidos, proximos: R.movs, meta: metaEstado(parseMetaCfg(book.settings.meta_cfg), String(book.settings.meta ?? ""), book, today) })
    const mes = today.slice(0, 7)
    const pat = [...snaps.filter((s) => s.mes !== mes).map((s) => ({ mes: s.mes, v: +s.patrimonio })), { mes, v: E.pat }].sort((a, b) => a.mes.localeCompare(b.mes)).slice(-12)
      .map((s) => ({ l: `${monthName(+s.mes.slice(5, 7), false)}${s.mes.slice(5, 7) === "01" ? " " + s.mes.slice(2, 4) : ""}`, v: s.v }))
    const cats = F.porCategoria.slice(0, 8).map((c) => ({ cat: c.cat, v: Math.round(c.v) }))
    const otras = F.porCategoria.slice(8).reduce((a, c) => a + c.v, 0)
    if (otras > 0) cats.push({ cat: "Otras", v: Math.round(otras) })
    return { P, F, E, S, comp, cap, deu, vencidos, proximos, impuestos, sinValor, dec, pat, cats, metas: metasAvance(book, today) }
  }, [book, per, today, X, snaps])

  if (isPending || !d) return <DashboardSkeleton />
  const { F, E, comp, cap, deu } = d
  // F.tot ya viene sin préstamos que te dieron o hiciste (plata prestada, no ingreso ni gasto): la misma cifra de Balance e Inicio.
  const t = F.tot
  const prevPat = d.pat.at(-2)?.v
  const vacio = !book!.incomes.length && !book!.expenses.length && !book!.fixedExpenses.length && !book!.loans.length && !book!.assets.length
  // El desglose cuadra con el KPI "Sale": solo consumo y deudas (el ahorro y lo que prestaste no están en "Sale").
  const salidasMod = salidasPorModulo(F)
  const totSal = salidasMod.reduce((a, g) => a + g.v, 0)
  const proximos = [...d.vencidos.filter((x) => x.fecha < today), ...d.proximos].slice(0, 10)

  return (
    <div className="grid gap-6">
      <PageHeader id="dashboard" description="Tus números en gráficas para decidir mejor: cuánto entra y sale, en qué se va la plata, tus deudas, tu ahorro y qué te conviene hacer." />
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={per} onChange={(v) => setPer(v === "mes" ? null : v)} items={PERIODOS} />
        <p className="text-sm text-muted-foreground">Del {fmtDate(F.a)} al {fmtDate(F.b)}</p>
      </div>

      {vacio && <Panel><EmptyState iso="dashboard" title="Aún no hay datos para graficar" description="Agrega tus ingresos, gastos fijos y deudas en la Puesta en marcha: en cuanto los tengas, aquí ves tus gráficas y lo que te conviene hacer." action={<Link href="/puesta" className="font-semibold text-link hover:underline">Ir a la Puesta en marcha ›</Link>} /></Panel>}

      <KpiGrid>
        <Kpi icon="arrow-down-to-line" tone="income" label="Entra" value={<Money value={t.entra} />} valueClassName="text-success" sub={`En ${d.P.label}`}
          info="Ingresos, ingresos extra, primas y cuotas que te pagan en el periodo (lo que falta por llegar también cuenta). Los préstamos que te dieron no cuentan: son plata prestada; los ves en el Balance." />
        <Kpi icon="arrow-up-from-line" tone="expense" label="Sale" value={<Money value={t.sale} />} valueClassName="text-danger" sub={<>Deudas: <Money value={t.deuda} short /></>}
          info="Gastos, fijos, suscripciones, impuestos, mesadas, cuotas y pagos de tarjeta. Cada peso cuenta una sola vez. Lo que prestaste no cuenta como gasto (está en el Balance)." />
        <Kpi icon="piggy-bank" tone="blue" label="Ahorras" value={<Money value={t.ahorro} />} sub={t.entra > 0 ? `El ${Math.round((Math.max(0, t.ahorro) / t.entra) * 100)} % de lo que entra` : "Metas, fondo e inversiones"}
          info="Lo que apartas para metas, tu fondo de emergencia e inversiones. Lo ideal es guardar el 20 % o más de lo que entra." />
        <Kpi icon="wallet" tone={t.queda >= 0 ? "green" : "red"} label={t.queda >= 0 ? "Te queda" : "Te falta"} value={<Money value={Math.abs(t.queda)} />} valueClassName={t.queda >= 0 ? "text-success" : "text-danger"} sub="Entra − sale − ahorras" />
      </KpiGrid>
      <KpiGrid>
        <Kpi icon="scale" tone={E.pat >= 0 ? "brand" : "red"} label="Patrimonio" value={<Money value={E.pat} />} valueClassName={E.pat >= 0 ? undefined : "text-danger"}
          sub={prevPat != null ? <><Money value={E.pat - prevPat} sign /> frente al mes pasado</> : "Lo que tienes − lo que debes"} info="Si hoy vendieras todo y pagaras todas tus deudas, esto te quedaría." />
        <Kpi icon="landmark" tone="red" label="Lo que debes" value={<Money value={E.P} />} sub={deu.libre ? `Créditos y tarjetas: libre en ${fmtMonth(deu.libre.slice(0, 7))}` : E.P ? (deu.total ? "Créditos y tarjetas sin fecha final" : "Otras deudas e impuestos") : "No tienes deudas"}
          info="Todo lo que debes, igual que en el Balance: créditos, préstamos, tarjetas, otras deudas e impuestos causados. La fecha es cuando pagas la última cuota de tus créditos y tarjetas si sigues al día." />
        <Kpi icon="lock" tone={comp.pct >= 0.5 ? "red" : comp.pct >= 0.4 ? "amber" : "green"} label="Compromisos fijos" value={comp.ingreso ? `${Math.round(comp.pct * 100)} %` : "—"} sub={comp.ingreso ? <>de tu ingreso (<Money value={comp.total} short /> al mes)</> : "Registra tus ingresos"}
          info="Lo que pagas sí o sí cada mes (fijos, cuotas, tarjetas y suscripciones) frente a lo que te llega. Lo sano es menos del 50 %." />
        <Kpi icon="umbrella" tone={cap.meses >= cap.metaMeses ? "green" : cap.meses >= 3 ? "amber" : "red"} label="Meses de colchón" value={cap.basicos ? cap.meses.toFixed(1).replace(".", ",") : "—"} sub={`La meta es ${cap.metaMeses} meses`}
          info="Cuántos meses aguantarías sin ingresos pagando tus gastos básicos: con el saldo de tu fondo de emergencia o, si aún no lo activas, con tu dinero disponible (cuentas, efectivo y ahorros). Es la misma cuenta de Metas." />
      </KpiGrid>

      <Decisiones list={d.dec} />

      <Panel title="Entra y sale mes a mes" icon="chart-column" info="Los últimos 12 meses con lo que registraste y lo programado. El mes en curso incluye lo que falta por llegar o pagar."
        description={<>Barras: lo que entra, lo que sale y lo que ahorras. Línea: lo que te queda. <Link href="/flujo" className="text-link hover:underline">Ver los próximos 12 meses ›</Link></>}>
        <MesesChart data={d.S} />
        <p className="text-sm text-muted-foreground" data-money>
          {(() => { const reales = d.S.filter((m) => !m.parcial && (m.entra || m.sale)); const rojos = reales.filter((m) => m.queda < 0); const prom = reales.length ? reales.reduce((a, m) => a + m.queda, 0) / reales.length : 0
            return reales.length ? <>En promedio te quedan <Money value={prom} className="font-semibold text-foreground" /> al mes{rojos.length ? <>; en {rojos.length} {rojos.length === 1 ? "mes" : "meses"} saliste en rojo ({rojos.map((m) => m.l).join(", ")}).</> : ". Ningún mes en rojo: ¡bien!"}</> : "Cuando registres tus movimientos verás aquí cómo te va cada mes." })()}
        </p>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="¿En qué se va la plata?" icon="chart-pie" info="Tus gastos por categoría en el periodo, con las compras con tarjeta incluidas (sin cuotas de deudas ni ahorro)." action={<Link href="/gastos" className="text-sm font-semibold text-link hover:underline">Ver gastos ›</Link>}>
          {d.cats.length ? (
            <>
              <CategoriasChart data={d.cats} />
              <p className="text-sm text-muted-foreground" data-money>Lo que más pesa: <b className="text-foreground">{d.cats[0].cat}</b>, el {Math.round((F.porCategoria[0]?.pct ?? 0) * 100)} % de tus gastos.</p>
            </>
          ) : <p className="text-sm text-muted-foreground">Sin gastos en este periodo.</p>}
        </Panel>
        <Panel title="Lo que sale, por módulo" icon="layers"
          info="De dónde sale cada peso de «Sale»: gastos del día a día, fijos, suscripciones, tarjetas, deudas, impuestos, mesadas y lo que falta por gastar según tu presupuesto. Suma exactamente lo mismo que el KPI «Sale»: el ahorro y los préstamos que hiciste no están ahí (no son gastos)."
          description={<>Suma <Money value={totSal} />, lo mismo que «Sale».{t.ahorro > 0 ? <> Aparte apartaste <Money value={t.ahorro} /> para tu ahorro.</> : null}</>}>
          {salidasMod.length ? <Apilada total={totSal} aria={`Salidas por módulo: ${salidasMod.map((g) => `${g.label} ${Math.round(g.pct * 100)} %`).join(", ")}`}
            items={salidasMod.map((g, i) => ({ k: g.modulo, label: g.label, v: g.v, cls: VIZ_BG[Math.min(i, VIZ_BG.length - 1)], href: g.href }))} />
            : <p className="text-sm text-muted-foreground">Nada sale en este periodo.</p>}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Tu patrimonio en el tiempo" icon="trending-up" info="Lo que tienes menos lo que debes al cierre de cada mes (se guarda cada vez que abres el Balance)." action={<Link href="/balance" className="text-sm font-semibold text-link hover:underline">Ver Balance ›</Link>}>
          <SerieChart data={d.pat} label="Patrimonio" color={VIZ[5]} aria={`Patrimonio de los últimos ${d.pat.length} meses`} />
          {d.pat.length < 2 && <p className="text-xs text-muted-foreground">Desde hoy guardamos tu patrimonio cada mes. En unos meses verás aquí cómo crece.</p>}
        </Panel>
        <Panel title="Tus deudas y cuándo terminan" icon="trending-down" info="Cómo baja lo que debes si pagas tus cuotas al día, cuándo terminas cada deuda y cuánto te falta pagar de intereses." action={<Link href="/estrategia" className="text-sm font-semibold text-link hover:underline">Salir de deudas ›</Link>}>
          {deu.items.length ? (
            <>
              <SerieChart data={deu.serie.map((s) => ({ l: s.l, v: Math.round(s.saldo) }))} label="Lo que debes" color={VIZ[1]} aria={`Saldo de tus deudas mes a mes hasta ${deu.libre ?? "pagarlas"}`} />
              <p className="text-sm text-muted-foreground" data-money>Te faltan <Money value={deu.interesFalta} className="font-semibold text-foreground" /> de intereses por pagar.</p>
              <ul className="grid">
                {deu.items.slice(0, 5).map((x) => (
                  <li key={x.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-dotted py-2 last:border-0">
                    <span className="grid min-w-0">
                      <Link href={x.href} className="truncate font-medium hover:text-link">{x.n}</Link>
                      <span className="truncate text-xs text-muted-foreground" data-money>{x.tipo}{x.fin ? ` · termina en ${fmtMonth(x.fin.slice(0, 7))}` : ""}{x.interesFalta > 0 ? ` · intereses ${Math.round(x.interesFalta).toLocaleString("es-CO")}` : ""}{x.vencidas ? ` · ${x.vencidas} atrasada${x.vencidas === 1 ? "" : "s"}` : ""}</span>
                    </span>
                    <Money value={x.saldo} className="font-semibold" />
                  </li>
                ))}
              </ul>
            </>
          ) : <p className="text-sm text-muted-foreground">No tienes deudas registradas. ¡Bien!</p>}
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Tus compromisos fijos" icon="lock" info="Qué parte de tu ingreso del mes ya está comprometida antes de empezar: gastos fijos, cuotas, tarjetas y suscripciones. Lo que sobra es lo que puedes gastar o ahorrar.">
          {comp.ingreso > 0 ? (
            <>
              <p className="text-sm" data-money>De <Money value={comp.ingreso} className="font-semibold" /> que te llegan al mes, <b>{Math.round(comp.pct * 100)} %</b> ya está comprometido.</p>
              <Apilada total={Math.max(comp.ingreso, comp.total)} aria={`Compromisos: ${Math.round(comp.pct * 100)} % del ingreso`} items={[
                { k: "fijos", label: "Gastos fijos", v: comp.fijos, cls: VIZ_BG[0], href: "/fijos" },
                { k: "cuotas", label: "Cuotas de deudas", v: comp.cuotas, cls: VIZ_BG[1], href: "/le-debo" },
                { k: "tarjetas", label: "Tarjetas", v: comp.tarjetas, cls: VIZ_BG[2], href: "/tarjetas" },
                { k: "subs", label: "Suscripciones", v: comp.subs, cls: VIZ_BG[3], href: "/suscripciones" },
                { k: "libre", label: "Te queda libre", v: Math.max(0, comp.ingreso - comp.total), cls: "bg-secondary-hover" },
              ]} />
            </>
          ) : <p className="text-sm text-muted-foreground">Registra tus ingresos para ver qué parte ya está comprometida.</p>}
        </Panel>
        <Panel title="Capacidad de ahorro y colchón" icon="piggy-bank" info="Lo que te queda al mes después de tus compromisos y de lo que sueles gastar en el día a día, y cuántos meses aguantas sin ingresos.">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-0.5 rounded-lg bg-secondary/50 p-3"><span className="text-xs text-muted-foreground">Puedes ahorrar al mes</span>{cap.variableBase === "sin-datos" ? <span className="text-lg font-bold text-muted-foreground">—</span> : <Money value={cap.libre} className={cn("text-lg font-bold", cap.libre >= 0 ? "text-success" : "text-danger")} />}</div>
            <div className="grid gap-0.5 rounded-lg bg-secondary/50 p-3"><span className="text-xs text-muted-foreground">Gastas en el día a día</span>{cap.variableBase === "sin-datos" ? <span className="text-lg font-bold text-muted-foreground">—</span> : <Money value={cap.variable} className="text-lg font-bold" />}<span className="text-[11px] leading-tight text-muted-foreground">{cap.variableBase === "historial" ? "Promedio de tus meses completos" : cap.variableBase === "presupuesto" ? "Según los topes de tu presupuesto" : "Aún no: registra un mes completo de gastos"}</span></div>
          </div>
          <div className="grid gap-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm"><span><b>Fondo de emergencia:</b> {cap.basicos ? `${cap.meses.toFixed(1).replace(".", ",")} de ${cap.metaMeses} meses` : "registra tus gastos básicos"}</span><Money value={cap.fondo} short className="text-muted-foreground" /></div>
            <Progress value={Math.min(100, (cap.meses / (cap.metaMeses || 1)) * 100)} aria-label={`Fondo de emergencia: ${cap.meses.toFixed(1)} de ${cap.metaMeses} meses`} className="h-2 [&_[data-slot=progress-indicator]]:bg-brand" />
            <p className="text-xs text-muted-foreground" data-money>{cap.enFondo ? "Con el saldo de tu fondo de emergencia. " : cap.basicos ? "Con tu dinero disponible (aún no activas el fondo). " : ""}{cap.faltaFondo > 0 ? <>Te faltan <Money value={cap.faltaFondo} /> para la meta{cap.libre > 0 ? <>: ahorrando lo que te queda, lo completas en {Math.ceil(cap.faltaFondo / cap.libre)} meses</> : ""}.</> : cap.basicos ? "¡Tu colchón está completo!" : ""}</p>
          </div>
          <Link href="/metas" className="text-sm font-semibold text-link hover:underline">Ir a Metas y emergencia ›</Link>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Panel title="Próximos 30 días" icon="calendar-days" info="Lo que tienes que pagar o te deben pagar en los próximos 30 días, con lo vencido primero." action={<Link href="/recordatorios" className="text-sm font-semibold text-link hover:underline">Ver todos ›</Link>}>
          {d.vencidos.length > 0 && <p className="text-sm text-danger" data-money>Tienes {d.vencidos.length} pago{d.vencidos.length === 1 ? "" : "s"} vencido{d.vencidos.length === 1 ? "" : "s"} por <Money value={d.vencidos.reduce((a, x) => a + (x.dir === "sale" ? x.v : 0), 0)} className="font-semibold" />.</p>}
          <MovLista list={proximos} empty="No tienes pagos en los próximos 30 días." />
        </Panel>
        <div className="grid content-start gap-6">
          <Panel title="Impuestos que vienen" icon="file-check" info="Renta, predial, vehicular y otras fechas de impuestos de los próximos 12 meses, con el valor que escribiste o el que estima Mirai con tus datos." action={<Link href="/calendario" className="text-sm font-semibold text-link hover:underline">Calendario ›</Link>}>
            {d.impuestos.length || d.sinValor.length ? (
              <ul className="grid">
                {d.impuestos.slice(0, 5).map((x) => (
                  <li key={x.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-dotted py-2 last:border-0">
                    <span className="grid min-w-0"><Link href={x.href} className="truncate font-medium hover:text-link">{x.n}</Link><span className="flex items-center gap-1.5 text-xs text-muted-foreground"><EstadoPill m={x} />{fmtDate(x.fecha)}</span></span>
                    <Money value={x.v} className="font-semibold" />
                  </li>
                ))}
                {d.sinValor.slice(0, 3).map((x) => (
                  <li key={x.id + x.fecha} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-dotted py-2 last:border-0">
                    <span className="grid min-w-0"><Link href="/calendario" className="truncate font-medium hover:text-link">{x.titulo}</Link><span className="text-xs text-muted-foreground">{fmtDate(x.fecha)}</span></span>
                    <StatusPill tone="gray" hint="Escribe el valor en el Calendario fiscal o registra tus bienes en la Declaración de renta para estimarlo.">Sin valor</StatusPill>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No tienes impuestos en tu calendario. Agrega las fechas de Colombia (renta, predial, vehicular) en el Calendario fiscal.</p>}
          </Panel>
          <Panel title="Tus metas" icon="target" info="Cuánto llevas de cada meta y cuánto te falta guardar al mes para llegar a tiempo." action={<Link href="/metas" className="text-sm font-semibold text-link hover:underline">Ver metas ›</Link>}>
            {d.metas.length ? (
              <ul className="grid gap-3">
                {d.metas.slice(0, 4).map((g) => (
                  <li key={g.id} className="grid gap-1">
                    <div className="flex items-baseline justify-between gap-2 text-sm"><span className="truncate font-medium">{g.nombre}</span><span className="shrink-0 text-muted-foreground">{Math.round(g.progreso * 100)} %</span></div>
                    <Progress value={g.progreso * 100} aria-label={`${g.nombre}: ${Math.round(g.progreso * 100)} %`} className="h-2 [&_[data-slot=progress-indicator]]:bg-brand" />
                    <p className="text-xs text-muted-foreground" data-money><Money value={g.ahorrado} /> de <Money value={g.objetivo} />{g.falta > 0 && g.fecha ? <> · guarda <Money value={g.mensual} /> al mes</> : g.falta <= 0 ? " · ¡lograda!" : ""}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">Aún no tienes metas. Crea una (un viaje, la cuota inicial, tu fondo de emergencia) y mira aquí su avance.</p>}
          </Panel>
        </div>
      </div>
    </div>
  )
}

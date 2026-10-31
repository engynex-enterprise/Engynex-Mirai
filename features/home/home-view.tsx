"use client"

import Link from "next/link"
import { useMemo } from "react"
import { ArrowRight, CircleCheck } from "lucide-react"
import { Bar, BarChart, Cell, XAxis } from "recharts"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Progress } from "@/components/ui/progress"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { StatusPill } from "@/components/mirai/status-pill"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { Icon } from "@/components/mirai/icon"
import { PageHeader } from "@/components/mirai/page-header"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useShell } from "@/components/app/shell-store"
import { agenda, cuotasMes, hormigas, loanEngine, loanName, notifs, quincena, totales, type AgendaItem } from "@/lib/domain"
import { fmtDate, fmtShort, monthName, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useBookData } from "@/features/book/use-book-data"
import { useSetupProgress } from "@/features/setup/use-setup"
import { QuickEntry } from "./quick-entry"

const QUICK = [
  { iso: "gastos", label: "Gasto", href: "/gastos?nuevo=1" },
  { iso: "me-deben", label: "Presté dinero", href: "/me-deben?nuevo=1" },
  { iso: "fijos", label: "Gasto fijo", href: "/fijos?nuevo=1" },
  { iso: "consejero", label: "¿Me alcanza?", href: "/consejero" },
]

const DOT = { bad: "vencido", warn: "porVencer", ok: "gray" } as const

function AgendaRow({ x }: { x: AgendaItem }) {
  const [, m, d] = x.fecha.split("-").map(Number)
  const action = x.k === "fijo" ? "Pagar" : x.k === "pagar" ? "Pagar" : x.k === "cobrar" ? "Cobrar" : x.k === "sub" ? "Pagada" : "Ver"
  return (
    <li className="flex items-center gap-3 py-2">
      <span className="grid w-11 shrink-0 overflow-hidden rounded-md border text-center">
        <span className="bg-navy py-0.5 text-[10px] font-semibold text-white uppercase dark:bg-navy-tone dark:text-navy">{monthName(m, false)}</span>
        <span className="py-0.5 text-lg leading-6 font-semibold">{d}</span>
      </span>
      <span className="grid min-w-0 flex-1">
        <span className="truncate font-semibold">{x.titulo}</span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">{x.sub}<StatusPill tone={DOT[x.st]}>{x.lbl}</StatusPill></span>
      </span>
      <span className="grid shrink-0 justify-items-end gap-1">
        <span className={cn("font-bold", x.dir === "cobrar" && "text-success")}>{x.dir === "cobrar" ? "+" : ""}<Money value={x.monto} /></span>
        <Button size="xs" variant={x.st === "bad" ? "default" : "outline"} asChild><Link href={`/${x.go}`}>{action}</Link></Button>
      </span>
    </li>
  )
}

export function HomeView() {
  const today = todayISO()
  const { data: book, isPending } = useBookData()
  const { data: setup } = useSetupProgress()
  const setBell = useShell((s) => s.setBell)

  const d = useMemo(() => {
    if (!book) return null
    const [y, m, day] = today.split("-").map(Number)
    const which = day <= book.settings.corte_q ? "q1" : "q2"
    const T = totales(book, today)
    const q = quincena(book, y, m - 1, which, today)
    const H = hormigas(book, today)
    const ag = agenda(book, today).filter((x) => x.d <= 15).slice(0, 6)
    const N = notifs(book, today).slice(0, 4)
    const loans = book.loans.map((L) => { const e = loanEngine(L, today); return { L, e, prog: e.pagado / Math.max(1, e.pagado + e.saldo) } }).filter((x) => x.e.saldo > 1)
    return { T, q, which, H, ag, N, loans, cuotas: cuotasMes(book.loans, "pagar", today), mesName: monthName(m) }
  }, [book, today])

  if (isPending || !d || !book) return <PageSkeleton kpis={4} />
  const chartCfg = { v: { label: "Gasto hormiga", color: "#F7B928" } }

  return (
    <div className="grid gap-6">
      <PageHeader id="inicio" />
      {setup && !setup.finished && (
        <Card className="flex-col items-start gap-4 border-0 bg-[linear-gradient(120deg,#1F2B4B,#2C4A3A_60%,#3F7A1E)] p-5 text-white ring-0 sm:flex-row sm:items-center">
          <IsoIcon k="puesta" size={44} />
          <div className="grid flex-1 gap-1.5">
            <p className="font-semibold">Completa la puesta en marcha ({setup.done} de {setup.total})</p>
            {setup.next && <p className="text-sm text-white/80">Siguiente: {setup.next.t}</p>}
            <Progress value={(setup.done / setup.total) * 100} className="h-1.5 max-w-sm bg-white/20 [&>div]:bg-lime" />
          </div>
          <Button asChild className="bg-lime text-navy hover:bg-lime/90"><Link href="/puesta">Continuar <ArrowRight /></Link></Button>
        </Card>
      )}

      <Card className="gap-4 p-5 shadow-card ring-0">
        <QuickEntry />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {QUICK.map((q) => (
            <Link key={q.href} href={q.href} className="flex h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium hover:bg-hover">
              <IsoIcon k={q.iso} size={26} />{q.label}
            </Link>
          ))}
        </div>
      </Card>

      <KpiGrid>
        <Kpi icon="scale" tone={d.T.pat >= 0 ? "green" : "red"} label="Lo que tienes menos lo que debes" value={<Money value={d.T.pat} />} valueClassName={d.T.pat < 0 ? "text-danger" : undefined} sub="Patrimonio neto" />
        <Kpi icon="wallet" tone={d.q.disp >= 0 ? "income" : "expense"} label="Te queda esta quincena" value={<Money value={d.q.disp} />} valueClassName={d.q.disp >= 0 ? "text-success" : "text-danger"} sub={`Entra ${fmtShort(d.q.E)} · sale ${fmtShort(d.q.Sa)}`} />
        <Kpi icon="landmark" tone="amber" label="Cuotas de deudas al mes" value={<Money value={d.cuotas} />} sub={`Te deben ${fmtShort(d.T.xc)} en total`} />
        <Kpi icon="coffee" tone={d.H.over ? "amber" : "green"} label="Gastos hormiga este mes" value={<Money value={d.H.totalMes} />} sub={d.H.over ? "Por encima de tu límite" : "Dentro de tu límite"} />
      </KpiGrid>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card className="shadow-card ring-0">
          <CardHeader>
            <CardTitle className="text-base">{d.which === "q1" ? "Primera" : "Segunda"} quincena de {d.mesName}</CardTitle>
            <CardAction><Button variant="link" asChild><Link href={`/balance?tab=${d.which}`}>Ver detalle</Link></Button></CardAction>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
              {([["Entra", d.q.ent, "text-success"], ["Sale", d.q.sal, "text-danger"]] as const).map(([t, list, c]) => (
                <div key={t} className="grid content-start gap-1">
                  <p className="border-b-[3px] border-foreground pb-1 font-semibold">{t}</p>
                  {!list.length ? <p className="py-2 text-sm text-muted-foreground">{t === "Entra" ? "Sin entradas." : "Sin salidas."}</p> : list.slice(0, 5).map((x, i) => (
                    <div key={i} className="flex items-center gap-2 border-b border-dotted py-1.5 text-sm">
                      {x.paid ? <CircleCheck className="size-4 text-success" /> : <Icon name={x.icon} className="size-4 text-muted-foreground" />}
                      <span className="flex-1 truncate">{x.n}</span><Money value={x.v} className={c} />
                    </div>
                  ))}
                  {list.length > 5 && <p className="text-xs text-muted-foreground">y {list.length - 5} más…</p>}
                </div>
              ))}
            </div>
            <div className={cn("flex items-center justify-between rounded-lg p-3", d.q.disp >= 0 ? "bg-success-soft" : "bg-danger-soft")}>
              <b>{d.q.disp >= 0 ? "Te sobra" : "Te falta"}</b>
              <Money value={Math.abs(d.q.disp)} className={cn("text-lg font-extrabold", d.q.disp >= 0 ? "text-success" : "text-danger")} />
            </div>
          </CardContent>
        </Card>
        <div className="grid content-start gap-6">
          <div className="rounded-xl bg-[linear-gradient(135deg,#1F2B4B,#9EDB4E)] p-[1.5px] shadow-card">
            <Card className="gap-3 rounded-[calc(var(--radius-xl)-1px)] p-5 ring-0">
              <div className="flex items-center gap-3"><IsoIcon k="consejero" size={40} /><p className="font-semibold">Consejero antes de gastar</p></div>
              <p className="text-sm text-muted-foreground">¿Vas a comprar algo, prestar plata o sacar un crédito? Cuéntame el valor y te digo si te alcanza, con base en tus ingresos y gastos.</p>
              <Button asChild className="bg-ai-gradient text-white"><Link href="/consejero">Preguntar al consejero</Link></Button>
            </Card>
          </div>
          <Card className="shadow-card ring-0">
            <CardHeader><CardTitle className="text-base">Avisos</CardTitle><CardAction><Button variant="link" onClick={() => setBell(true)}>Ver todos</Button></CardAction></CardHeader>
            <CardContent className="grid gap-2">
              {!d.N.length ? <p className="text-sm text-muted-foreground">Todo al día. No tienes avisos.</p> : d.N.map((n) => (
                <Link key={n.id} href={`/${n.go}`} className="flex items-start gap-3 rounded-md p-2 hover:bg-hover">
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", n.lvl === "bad" ? "bg-danger-soft text-danger" : n.lvl === "warn" ? "bg-warning-soft text-warning" : "bg-info-soft text-info")}><Icon name={n.icon} className="size-4" /></span>
                  <span className="grid text-sm"><b>{n.t}</b><span className="text-muted-foreground">{n.b}</span></span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="shadow-card ring-0">
          <CardHeader><CardTitle className="text-base">Próximos 15 días</CardTitle></CardHeader>
          <CardContent>{!d.ag.length ? <p className="text-sm text-muted-foreground">Nada pendiente en los próximos 15 días.</p> : <ul className="grid divide-y">{d.ag.map((x) => <AgendaRow key={`${x.k}-${x.id}-${x.fecha}`} x={x} />)}</ul>}</CardContent>
        </Card>
        <Card className="shadow-card ring-0">
          <CardHeader><CardTitle className="text-base">Metas</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            {!book.goals.length ? <p className="text-sm text-muted-foreground">Aún no tienes metas.</p> : book.goals.slice(0, 4).map((g) => {
              const p = Math.min(100, (Number(g.ahorrado) / Math.max(1, Number(g.objetivo))) * 100)
              return (
                <div key={g.id} className="grid gap-1.5">
                  <div className="flex justify-between text-sm"><span className="font-medium">{g.nombre}</span><span>{Math.round(p)} %</span></div>
                  <Progress value={p} className="h-2 [&>div]:bg-navy dark:[&>div]:bg-lime" />
                </div>
              )
            })}
            <div className="grid gap-2 pt-2">
              <p className="text-sm font-semibold">Gasto hormiga</p>
              <ChartContainer config={chartCfg} className="h-24 w-full">
                <BarChart data={d.H.meses} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <XAxis dataKey="l" tickLine={false} axisLine={false} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => fmtShort(Number(v))} hideIndicator />} />
                  <Bar dataKey="v" radius={4}>{d.H.meses.map((_, i) => <Cell key={i} fill={i === d.H.meses.length - 1 ? "#F7B928" : "var(--border)"} />)}</Bar>
                </BarChart>
              </ChartContainer>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-card ring-0">
          <CardHeader><CardTitle className="text-base">Préstamos</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            {!d.loans.length ? <p className="text-sm text-muted-foreground">Sin préstamos registrados.</p> : d.loans.slice(0, 5).map(({ L, e, prog }) => (
              <Link key={L.id} href={`/${L.kind === "cobrar" ? "me-deben" : "le-debo"}?id=${L.id}`} className="grid gap-1.5 rounded-md hover:bg-hover">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium">{loanName(L, book.contacts, book.entities)}</span>
                  <StatusPill tone={L.kind === "cobrar" ? "pagado" : "vencido"}>{L.kind === "cobrar" ? "me debe" : "le debo"}</StatusPill>
                </div>
                <Progress value={prog * 100} className={cn("h-2", L.kind === "cobrar" ? "[&>div]:bg-forest" : "[&>div]:bg-expense")} />
                <p className="text-xs text-muted-foreground">Faltan <Money value={e.saldo} /> · {fmtDate(e.next?.fecha ?? null)}</p>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

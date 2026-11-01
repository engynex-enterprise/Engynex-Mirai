"use client"

import Link from "next/link"
import { useMemo } from "react"
import { ArrowRight, Camera, CircleCheck, Flame, HandCoins, MessageCircleQuestion, Receipt } from "lucide-react"
import { Bar, BarChart, Cell, XAxis } from "recharts"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Progress } from "@/components/ui/progress"
import { Money } from "@/components/mirai/money"
import { StatusPill } from "@/components/mirai/status-pill"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { Icon } from "@/components/mirai/icon"
import { PageHeader } from "@/components/mirai/page-header"
import { RatingPrompt } from "@/features/opiniones/rating-prompt"
import { AdSlot } from "@/features/ads/ad-slot"
import { HallazgosCard } from "@/features/hallazgos/hallazgos-card"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useApp } from "@/components/app/app-context"
import { useShell } from "@/components/app/shell-store"
import { UserAvatar } from "@/components/mirai/user-avatar"
import { agenda, cuotasMes, days, hormigas, loanEngine, loanName, notifs, parseDate, quincena, totales, type AgendaItem } from "@/lib/domain"
import { edad, fmtDate, fmtShort, monthName, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useBookData } from "@/features/book/use-book-data"
import { useMembers } from "@/features/catalogs/hooks"
import { useSetupProgress } from "@/features/setup/use-setup"
import { useGami } from "@/features/gami/use-gami"
import { QuickEntry } from "./quick-entry"
import { Illustration } from "@/components/mirai/illustration"

const DOT = { bad: "vencido", warn: "porVencer", ok: "gray" } as const

/** Acciones rápidas del "composer" (como Foto/Video y Sentimiento en Facebook). */
const COMPOSER = [
  { label: "Gasto", href: "/gastos?nuevo=1", Icon: Receipt, color: "text-[#E41E3F]" },
  { label: "Foto de factura", href: "/gastos?nuevo=1", Icon: Camera, color: "text-[#2A9D3A]" },
  { label: "Presté dinero", href: "/me-deben?nuevo=1", Icon: HandCoins, color: "text-[#E08A00]" },
  { label: "¿Me alcanza?", href: "/consejero", Icon: MessageCircleQuestion, color: "text-[#7A4BE0]" },
]

/** Tarjeta alta tipo "historia" con degradado. */
function Story({ href, bg, iso, label, value, sub }: { href: string; bg: string; iso: string; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Link href={href} className={cn("press lift relative flex h-48 w-36 shrink-0 snap-start flex-col justify-between overflow-hidden rounded-xl p-3 text-white shadow-card sm:h-52 sm:w-40", bg)}>
      <span className="pointer-events-none absolute -right-6 -bottom-6 size-24 rounded-full bg-white/15" aria-hidden />
      <span className="grid size-11 place-items-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,.2)] ring-[3px] ring-white/40"><IsoIcon k={iso} size={28} /></span>
      <span className="relative grid gap-0.5">
        <span className="text-[12.5px] leading-tight font-semibold text-white/90">{label}</span>
        <span className="text-[19px] leading-6 font-extrabold tracking-tight drop-shadow-sm">{value}</span>
        {sub && <span className="truncate text-[11.5px] text-white/80">{sub}</span>}
      </span>
    </Link>
  )
}

function AgendaRow({ x }: { x: AgendaItem }) {
  const [, m, d] = x.fecha.split("-").map(Number)
  const action = x.k === "fijo" ? "Pagar" : x.k === "pagar" ? "Pagar" : x.k === "cobrar" ? "Cobrar" : x.k === "sub" ? "Pagada" : "Ver"
  return (
    <li className="flex items-center gap-3 rounded-xl p-2 hover:bg-hover">
      <span className="grid w-11 shrink-0 overflow-hidden rounded-xl bg-card text-center shadow-card">
        <span className="bg-brand-gradient py-0.5 text-[10px] font-bold text-white uppercase">{monthName(m, false)}</span>
        <span className="py-0.5 text-lg leading-6 font-bold">{d}</span>
      </span>
      <span className="grid min-w-0 flex-1">
        <span className="truncate text-[14px] font-semibold">{x.titulo}</span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><StatusPill tone={DOT[x.st]} className="h-5">{x.lbl}</StatusPill></span>
      </span>
      <span className="grid shrink-0 justify-items-end gap-1">
        <span className={cn("text-[14px] font-bold", x.dir === "cobrar" && "text-success")}>{x.dir === "cobrar" ? "+" : ""}<Money value={x.monto} /></span>
        <Button size="xs" variant={x.st === "bad" ? "default" : "outline"} asChild><Link href={`/${x.go}`}>{action}</Link></Button>
      </span>
    </li>
  )
}

function RailCard({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cn("appear gap-2 rounded-lg p-4 ring-0", className)}>
      <div className="flex items-center justify-between"><h2 className="text-[17px] font-bold">{title}</h2>{action}</div>
      {children}
    </Card>
  )
}

const relDay = (fecha: string, today: string) => {
  const d = days(parseDate(fecha), parseDate(today))
  return d <= 0 ? "Hoy" : d === 1 ? "Ayer" : d < 7 ? `Hace ${d} días` : fmtDate(fecha)
}

export function HomeView() {
  const today = todayISO()
  const { user } = useApp()
  const { data: book, isPending } = useBookData()
  const { data: setup } = useSetupProgress()
  const { data: members = [] } = useMembers()
  const setBell = useShell((s) => s.setBell)
  const online = useShell((s) => s.online)
  const gami = useGami()
  const first = user.apodo || user.nombre.split(" ")[0]
  const cumple = edad(user.nacimiento)?.cumple

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
    const cats = new Map(book.categories.map((c) => [c.id, c]))
    const feed = [
      ...book.expenses.map((g) => ({ k: "g" as const, id: g.id, fecha: g.fecha, t: g.descripcion, v: +g.valor, who: g.member_id ?? null, cat: cats.get(g.category_id ?? "") })),
      ...book.extraIncomes.map((x) => ({ k: "i" as const, id: x.id ?? x.descripcion, fecha: x.fecha, t: x.descripcion, v: +x.valor, who: null, cat: undefined })),
    ].filter((x) => x.fecha <= today).sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 6)
    const next = agenda(book, today).find((x) => x.d >= 0 && x.dir === "pagar")
    const goal = book.goals.filter((g) => +g.objetivo > 0).sort((a, b) => +b.ahorrado / +b.objetivo - +a.ahorrado / +a.objetivo)[0]
    return { T, q, which, H, ag, N, loans, feed, next, goal, cuotas: cuotasMes(book.loans, "pagar", today), mesName: monthName(m) }
  }, [book, today])

  if (isPending || !d || !book) return <PageSkeleton kpis={4} />
  const chartCfg = { v: { label: "Gasto hormiga", color: "#F7B928" } }
  const memberName = (id: string | null) => (id ? members.find((m) => m.id === id)?.nombre : null) ?? "La familia"
  const memberAvatar = (id: string | null) => { const m = id ? members.find((x) => x.id === id) : null; return m ? m.avatar || (m.es_titular ? user.avatar : null) : null }
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Bogota", hour: "numeric", hourCycle: "h23" }).format(new Date()))
  const saludo = hour < 12 ? "Buenos días" : hour < 19 ? "Buenas tardes" : "Buenas noches"

  const rail = (
    <>
      {gami?.st.on && (
        <Link href="/logros" className="press lift appear relative overflow-hidden rounded-lg bg-hero-gradient p-4 text-white shadow-card">
          <span className="pointer-events-none absolute -top-8 -right-8 size-28 rounded-full bg-lime/30 blur-xl" aria-hidden />
          <div className="relative flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-full bg-white/15 ring-2 ring-lime/60"><Icon name={gami.L.icon} className="size-6 text-lime" /></span>
            <div className="min-w-0 flex-1"><p className="text-[13px] text-white/75">Tu nivel</p><p className="text-[17px] font-bold">Nivel {gami.L.n} · {gami.L.name}</p></div>
            <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-sm font-semibold"><Flame className="size-4 text-[#FFB547]" />{gami.racha}</span>
          </div>
          <Progress value={gami.L.prog * 100} className="relative mt-3 h-2 bg-white/20 [&>div]:bg-lime" />
          <p className="relative mt-1.5 text-xs text-white/75">{Math.round(gami.X.total).toLocaleString("es-CO")} puntos{gami.L.next ? ` · faltan ${Math.round(gami.L.next - gami.X.total).toLocaleString("es-CO")} para ${gami.L.nextName}` : ""}</p>
        </Link>
      )}
      <RailCard title="Próximos 15 días" action={<Button variant="link" size="sm" asChild><Link href="/recordatorios">Ver todo <ArrowRight /></Link></Button>}>
        {!d.ag.length ? <p className="text-sm text-muted-foreground">Nada pendiente en los próximos 15 días.</p> : <ul className="-mx-2 grid">{d.ag.map((x) => <AgendaRow key={`${x.k}-${x.id}-${x.fecha}`} x={x} />)}</ul>}
      </RailCard>
      <RailCard title="Tu familia" action={<Button variant="link" size="sm" asChild><Link href="/perfil">Ver <ArrowRight /></Link></Button>}>
        <ul className="-mx-2 grid">
          {[{ id: user.id, nombre: user.nombre, avatar: user.avatar, rol: "Tú", on: true }, ...online.filter((o) => o.id !== user.id).map((o) => ({ id: o.id, nombre: o.nombre, avatar: o.avatar, rol: "En línea", on: true })), ...members.filter((m) => !m.user_id && !m.es_titular).slice(0, 5).map((m) => ({ id: m.id, nombre: m.nombre, avatar: m.avatar || null, rol: m.rol, on: false }))].map((p) => (
            <li key={p.id} className="flex items-center gap-3 rounded-xl p-2 hover:bg-hover">
              <span className="relative"><UserAvatar src={p.avatar} name={p.nombre} className="size-9" fallbackClassName="text-xs" />{p.on && <span className="absolute right-0 bottom-0 size-3 rounded-full bg-[#31A24C] ring-2 ring-card" aria-label="En línea" />}</span>
              <span className="grid min-w-0"><span className="truncate text-[14px] font-semibold">{p.nombre}</span><span className="text-xs text-muted-foreground">{p.rol}</span></span>
            </li>
          ))}
        </ul>
      </RailCard>
      <div className="rounded-lg bg-ai-gradient p-[2px] shadow-card">
        <div className="grid gap-3 rounded-[calc(.5rem-2px)] bg-popover p-4">
          <div className="flex items-center gap-3"><IsoIcon k="consejero" size={40} /><p className="text-[15px] font-bold">Consejero antes de gastar</p></div>
          <p className="text-sm text-muted-foreground">¿Vas a comprar algo, prestar plata o sacar un crédito? Te digo si te alcanza con tus números.</p>
          <Button variant="gradient" asChild><Link href="/consejero">Preguntar al consejero</Link></Button>
        </div>
      </div>
    </>
  )

  return (
    <div className="grid gap-5">
      <PageHeader id="inicio" title={cumple ? `¡Feliz cumpleaños, ${first}!` : `${saludo}, ${first}`} description={cumple ? "Hoy es tu día. Date un gusto que quepa en tu presupuesto: así se celebra sin culpa." : "Así van las finanzas de tu hogar hoy."}>
        {setup && !setup.finished && (
          <div className="mt-1 flex w-full max-w-xl items-center gap-3 rounded-2xl bg-white/75 px-3 py-2.5 text-[14px] text-meta-text backdrop-blur dark:bg-white/10">
            <IsoIcon k="puesta" size={32} />
            <div className="grid min-w-0 flex-1 gap-1.5">
              <span className="truncate">Puesta en marcha: <b>{setup.done} de {setup.total}</b>{setup.next ? <> · siguiente: {setup.next.t}</> : null}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/15"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.round((setup.done / setup.total) * 100)}%` }} /></span>
            </div>
            <Button variant="link" className="h-auto shrink-0 p-0" asChild><Link href="/puesta">Continuar <ArrowRight /></Link></Button>
          </div>
        )}
      </PageHeader>

      <RatingPrompt />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 gap-5">
          {/* Composer: "¿Qué gastaste hoy?" */}
          <Card className="appear gap-3 rounded-lg p-4 ring-0">
            <QuickEntry />
            <div className="h-px bg-border" />
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
              {COMPOSER.map((c) => (
                <Link key={c.label} href={c.href} className="press flex h-10 items-center justify-center gap-2 rounded-lg text-[14px] font-semibold text-muted-foreground hover:bg-hover">
                  <c.Icon className={cn("size-5", c.color)} />{c.label}
                </Link>
              ))}
            </div>
          </Card>

          {/* Historias */}
          <div className="no-scrollbar -mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            <Story href={`/balance?tab=${d.which}`} bg={d.q.disp >= 0 ? "bg-[linear-gradient(160deg,#9EDB4E,#2A7F14_60%,#13778F)]" : "bg-[linear-gradient(160deg,#FF8A9B,#D0243F)]"} iso="balance" label="Te queda esta quincena" value={<Money value={d.q.disp} />} sub={`Entra ${fmtShort(d.q.E)} · sale ${fmtShort(d.q.Sa)}`} />
            <Story href="/balance" bg="bg-[linear-gradient(160deg,#5AA9FF,#1B5FA8_60%,#1F2B4B)]" iso="inicio" label="Lo que tienes menos lo que debes" value={<Money value={d.T.pat} />} sub="Patrimonio neto" />
            {d.next && <Story href={`/${d.next.go}`} bg="bg-[linear-gradient(160deg,#FFD36B,#E08A00_60%,#B4500A)]" iso="recordatorios" label={`Próximo pago · ${d.next.lbl.toLowerCase()}`} value={<Money value={d.next.monto} />} sub={d.next.titulo} />}
            <Story href="/gastos" bg={d.H.over ? "bg-[linear-gradient(160deg,#FF8A9B,#D0243F_70%)]" : "bg-[linear-gradient(160deg,#C4A6FF,#7A4BE0_60%,#3B2A8F)]"} iso="gastos" label="Gastos hormiga este mes" value={<Money value={d.H.totalMes} />} sub={d.H.over ? "Por encima de tu límite" : "Dentro de tu límite"} />
            <Story href="/le-debo" bg="bg-[linear-gradient(160deg,#4FC3D6,#13778F_60%,#1F2B4B)]" iso="le-debo" label="Cuotas de deudas al mes" value={<Money value={d.cuotas} />} sub={`Te deben ${fmtShort(d.T.xc)} en total`} />
            {d.goal && <Story href="/metas" bg="bg-[linear-gradient(160deg,#FFB3C1,#F0506E_60%,#A51E43)]" iso="metas" label={d.goal.nombre} value={`${Math.min(100, Math.round((+d.goal.ahorrado / +d.goal.objetivo) * 100))} %`} sub="de tu meta" />}
          </div>

          <AdSlot slot="inicio" />

          <HallazgosCard />

          {/* Quincena */}
          <Card className="appear gap-4 rounded-lg p-4 ring-0 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[17px] font-bold">{d.which === "q1" ? "Primera" : "Segunda"} quincena de {d.mesName}</h2>
              <Button variant="link" size="sm" asChild><Link href={`/balance?tab=${d.which}`}>Ver detalle <ArrowRight /></Link></Button>
            </div>
            <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {([["Entra", d.q.ent, "text-success"], ["Sale", d.q.sal, "text-danger"]] as const).map(([t, list, c]) => (
                <div key={t} className="grid content-start gap-0.5">
                  <p className="pb-1 text-[13px] font-bold tracking-wide text-muted-foreground uppercase">{t}</p>
                  {!list.length ? <p className="py-2 text-sm text-muted-foreground">{t === "Entra" ? "Sin entradas." : "Sin salidas."}</p> : list.slice(0, 5).map((x, i) => (
                    <div key={i} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 text-[14px] hover:bg-hover">
                      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", x.paid ? "bg-success-soft text-success" : "bg-secondary text-muted-foreground")}>{x.paid ? <CircleCheck className="size-4" /> : <Icon name={x.icon} className="size-4" />}</span>
                      <span className="flex-1 truncate">{x.n}</span><Money value={x.v} className={cn("font-semibold", c)} />
                    </div>
                  ))}
                  {list.length > 5 && <p className="px-1 text-xs text-muted-foreground">y {list.length - 5} más…</p>}
                </div>
              ))}
            </div>
            <div className={cn("flex items-center justify-between rounded-xl p-3", d.q.disp >= 0 ? "bg-success-soft" : "bg-danger-soft")}>
              <b>{d.q.disp >= 0 ? "Te sobra" : "Te falta"}</b>
              <Money value={Math.abs(d.q.disp)} className={cn("text-xl font-extrabold", d.q.disp >= 0 ? "text-success" : "text-danger")} />
            </div>
          </Card>

          {/* Avisos */}
          {d.N.length > 0 && (
            <Card className="appear gap-2 rounded-lg p-4 ring-0">
              <div className="flex items-center justify-between"><h2 className="text-[17px] font-bold">Avisos</h2><Button variant="link" size="sm" onClick={() => setBell(true)}>Ver todos</Button></div>
              {d.N.map((n) => (
                <Link key={n.id} href={`/${n.go}`} className="flex items-start gap-3 rounded-xl p-2 hover:bg-hover">
                  <span className={cn("grid size-10 shrink-0 place-items-center rounded-full text-white", n.lvl === "bad" ? "bg-[linear-gradient(135deg,#FF8A9B,#D0243F)]" : n.lvl === "warn" ? "bg-[linear-gradient(135deg,#FFD36B,#E08A00)]" : "bg-[linear-gradient(135deg,#5AA9FF,#1B5FA8)]")}><Icon name={n.icon} className="size-5" /></span>
                  <span className="grid text-[14px]"><b>{n.t}</b><span className="text-muted-foreground">{n.b}</span></span>
                </Link>
              ))}
            </Card>
          )}

          {/* Actividad reciente (feed) */}
          <section className="grid gap-3">
            <h2 className="px-1 text-[17px] font-bold">Actividad reciente</h2>
            {!d.feed.length && <Card className="items-center gap-2 rounded-lg p-6 text-center text-sm text-muted-foreground ring-0"><Illustration k="vacio" width={180} /><p className="text-[15px] font-semibold text-foreground">Aún no hay movimientos</p><p>Escribe arriba tu primer gasto y aparecerá aquí.</p></Card>}
            {d.feed.map((x) => (
              <Card key={`${x.k}-${x.id}`} className="appear gap-3 rounded-lg p-4 ring-0">
                <div className="flex items-center gap-3">
                  <UserAvatar src={memberAvatar(x.who)} name={memberName(x.who)} className="size-10" fallbackClassName="text-xs" />
                  <div className="grid min-w-0 flex-1">
                    <p className="truncate text-[15px]"><b>{memberName(x.who)}</b> <span className="text-muted-foreground">{x.k === "g" ? "registró un gasto" : "recibió un ingreso extra"}</span></p>
                    <p className="text-[13px] text-muted-foreground">{relDay(x.fecha, today)}</p>
                  </div>
                </div>
                <Link href={x.k === "g" ? "/gastos" : "/ingresos"} className="flex items-center gap-3 rounded-xl bg-muted/70 p-3 hover:bg-hover">
                  <span className={cn("grid size-11 shrink-0 place-items-center rounded-full text-white", x.k === "g" ? "bg-[linear-gradient(135deg,#FF8A9B,#D0243F)]" : "bg-[linear-gradient(135deg,#9EDB4E,#2A7F14)]")}><Icon name={x.cat?.icon ?? (x.k === "g" ? "receipt" : "arrow-down-to-line")} className="size-5" /></span>
                  <span className="grid min-w-0 flex-1"><span className="truncate font-semibold">{x.t}</span>{x.cat && <span className="text-[13px] text-muted-foreground">{x.cat.nombre}</span>}</span>
                  <Money value={x.v} className={cn("text-[17px] font-extrabold", x.k === "g" ? "text-danger" : "text-success")} />
                </Link>
              </Card>
            ))}
            {d.feed.length > 0 && <Button variant="outline" asChild className="w-full"><Link href="/gastos">Ver todos los movimientos</Link></Button>}
          </section>

          {/* Metas, hormiga y préstamos */}
          <div className="grid gap-5 md:grid-cols-2">
            <RailCard title="Metas y gasto hormiga">
              {!book.goals.length ? <p className="text-sm text-muted-foreground">Aún no tienes metas.</p> : book.goals.slice(0, 4).map((g) => {
                const p = Math.min(100, (Number(g.ahorrado) / Math.max(1, Number(g.objetivo))) * 100)
                return (
                  <div key={g.id} className="grid gap-1.5">
                    <div className="flex justify-between text-[14px]"><span className="font-semibold">{g.nombre}</span><span className="font-semibold text-brand">{Math.round(p)} %</span></div>
                    <Progress value={p} className="h-2.5 [&>div]:bg-brand-gradient" />
                  </div>
                )
              })}
              <ChartContainer config={chartCfg} className="mt-2 h-24 w-full">
                <BarChart data={d.H.meses} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <XAxis dataKey="l" tickLine={false} axisLine={false} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => fmtShort(Number(v))} hideIndicator />} />
                  <Bar dataKey="v" radius={6}>{d.H.meses.map((_, i) => <Cell key={i} fill={i === d.H.meses.length - 1 ? "#F7B928" : "var(--secondary)"} />)}</Bar>
                </BarChart>
              </ChartContainer>
            </RailCard>
            <RailCard title="Préstamos">
              {!d.loans.length ? <p className="text-sm text-muted-foreground">Sin préstamos registrados.</p> : d.loans.slice(0, 5).map(({ L, e, prog }) => (
                <Link key={L.id} href={`/${L.kind === "cobrar" ? "me-deben" : "le-debo"}?id=${L.id}`} className="grid gap-1.5 rounded-xl p-2 hover:bg-hover">
                  <div className="flex items-center justify-between gap-2 text-[14px]">
                    <span className="truncate font-semibold">{loanName(L, book.contacts, book.entities)}</span>
                    <StatusPill tone={L.kind === "cobrar" ? "pagado" : "vencido"}>{L.kind === "cobrar" ? "me debe" : "le debo"}</StatusPill>
                  </div>
                  <Progress value={prog * 100} className={cn("h-2", L.kind === "cobrar" ? "[&>div]:bg-brand-gradient" : "[&>div]:bg-expense")} />
                  <p className="text-xs text-muted-foreground">Faltan <Money value={e.saldo} /> · {fmtDate(e.next?.fecha ?? null)}</p>
                </Link>
              ))}
            </RailCard>
          </div>
        </div>

        {/* Columna derecha (en celular va debajo) */}
        <aside className="grid gap-5 xl:sticky xl:top-4">{rail}</aside>
      </div>
    </div>
  )
}

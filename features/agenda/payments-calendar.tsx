"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Download, Plus } from "lucide-react"
import { toast } from "sonner"
import { es } from "react-day-picker/locale"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Card } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BrandLogo } from "@/components/mirai/brand-logo"
import { Spinner } from "@/components/ui/spinner"
import { PageHeader } from "@/components/mirai/page-header"
import { Money } from "@/components/mirai/money"
import { Notice } from "@/components/mirai/notice"
import { StatusPill } from "@/components/mirai/status-pill"
import { Segmented } from "@/components/mirai/choice-cards"
import { Icon } from "@/components/mirai/icon"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { fmtDate, fmtShort, monthName, todayISO } from "@/lib/format"
import { iso } from "@/lib/domain"
import { cn } from "@/lib/utils"
import { useBookData } from "@/features/book/use-book-data"
import { syncCalendar } from "@/features/correo/actions"
import { ECAT, calEvents, calIcs, type CalEvent, type ECatKey } from "./events"

type View = "agenda" | "semana" | "mes"
const KEY = "mirai-calp"
const load = (): { v: View; off: ECatKey[] } => { try { return { v: "mes", off: [], ...JSON.parse(localStorage.getItem(KEY) ?? "{}") } } catch { return { v: "mes", off: [] } } }
const add = (s: string, n: number) => { const d = new Date(s + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d) }
const DIAS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
const rel = (d: string, t: string) => { const n = Math.round((new Date(d + "T12:00:00").getTime() - new Date(t + "T12:00:00").getTime()) / 864e5); return n === 0 ? "Hoy" : n === 1 ? "Mañana" : n === -1 ? "Ayer" : n > 0 ? `En ${n} días` : `Hace ${-n} días` }

function range(v: View, d: string): [string, string] {
  const x = new Date(d + "T12:00:00")
  if (v === "mes") { const first = new Date(x.getFullYear(), x.getMonth(), 1); const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7)); return [iso(start), add(iso(start), 41)] }
  if (v === "semana") { const start = new Date(x); start.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return [iso(start), add(iso(start), 6)] }
  return [d, add(d, 44)]
}

function EventChip({ e, today, compact }: { e: CalEvent; today: string; compact?: boolean }) {
  const c = ECAT[e.k]
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn("flex w-full min-w-0 items-center gap-1 rounded px-1 text-left text-[11px] leading-5 hover:opacity-85", e.st === "ok" && "line-through opacity-60")} style={{ background: `${c.color}22`, color: c.color }}>
          {!compact && <span className="size-1.5 shrink-0 rounded-full" style={{ background: c.color }} />}<span className="truncate">{e.titulo}</span>
        </button>
      </PopoverTrigger>
      <EventPopover e={e} today={today} />
    </Popover>
  )
}

function EventPopover({ e, today }: { e: CalEvent; today: string }) {
  const c = ECAT[e.k]
  const act = e.st !== "ok" && ["fijo", "aporte", "pagar", "cobrar", "sub"].includes(e.k)
  return (
    <PopoverContent className="w-80" align="start">
      <div className="grid gap-2">
        <p className="flex items-center gap-2 font-semibold"><span className="grid size-7 place-items-center rounded-full text-white" style={{ background: c.color }}><Icon name={c.icon} className="size-4" /></span>{e.titulo}</p>
        <p className="text-sm text-muted-foreground">{fmtDate(e.fecha, { long: true })} · {rel(e.fecha, today)}</p>
        <p className="text-sm">{c.n}{e.sub ? ` · ${e.sub}` : ""}</p>
        <p className={cn("text-xl font-bold", e.dir === "cobrar" && "text-success")}>{e.dir === "cobrar" ? "+" : ""}<Money value={e.monto} /></p>
        {e.rng && <p className="text-xs text-muted-foreground">Normalmente {e.rng}</p>}
        <StatusPill tone={e.st === "ok" ? "pagado" : e.st === "bad" ? "vencido" : "gray"} className="w-fit">{e.st === "ok" ? "Hecho" : e.st === "bad" ? "Vencido" : "Pendiente"}</StatusPill>
        <div className="flex gap-2 pt-1">
          {act && <Button size="sm" asChild><Link href={`/${e.go}${e.refId ? `?id=${e.refId}` : ""}`}>{e.dir === "cobrar" ? "Registrar cobro" : "Pagar"}</Link></Button>}
          <Button size="sm" variant="outline" asChild><Link href={`/${e.go}${e.refId ? `?id=${e.refId}` : ""}`}>Ver detalle</Link></Button>
        </div>
      </div>
    </PopoverContent>
  )
}

export function PaymentsCalendar() {
  const today = todayISO()
  const { data: book, isPending } = useBookData()
  const [prefs, setPrefs] = useState(load)
  const [d, setD] = useState(today)
  const save = (p: typeof prefs) => { setPrefs(p); try { localStorage.setItem(KEY, JSON.stringify(p)) } catch {} }
  const [a, z] = range(prefs.v, d)
  const ev = useMemo(() => (book ? calEvents(book, a, z, today, prefs.off) : []), [book, a, z, today, prefs.off])
  const monthEv = useMemo(() => (book ? calEvents(book, d.slice(0, 7) + "-01", add(d.slice(0, 7) + "-01", 41), today, prefs.off).filter((e) => e.fecha.startsWith(d.slice(0, 7))) : []), [book, d, today, prefs.off])
  if (isPending || !book) return <PageSkeleton kpis={0} />
  const venc = ev.filter((e) => e.st === "bad" && e.dir === "pagar")
  const byDay = (x: string) => ev.filter((e) => e.fecha === x)
  const move = (n: number) => { if (prefs.v === "mes") { const x = new Date(d + "T12:00:00"); x.setMonth(x.getMonth() + n, 1); setD(iso(x)) } else setD(add(d, prefs.v === "semana" ? 7 * n : 30 * n)) }
  const title = prefs.v === "mes" ? `${monthName(+d.slice(5, 7))} ${d.slice(0, 4)}` : prefs.v === "semana" ? `${fmtDate(a, { year: false })} – ${fmtDate(z)}` : `Desde ${fmtDate(a)}`
  const sum = (dir: "pagar" | "cobrar") => (prefs.v === "mes" ? monthEv : ev).filter((e) => e.dir === dir && e.st !== "ok").reduce((s, e) => s + e.monto, 0)
  const ics = () => {
    const all = calEvents(book, add(today, -30), add(today, 365), today, prefs.off)
    const blob = new Blob([calIcs(all)], { type: "text/calendar" }), url = URL.createObjectURL(blob), el = document.createElement("a")
    el.href = url; el.download = "mirai-pagos.ics"; el.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div className="grid gap-6">
      <PageHeader id="recordatorios" actions={<>
        <Button variant="outline" onClick={ics}><Download /> Exportar .ics</Button>
        <GoogleCalendarButton />
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button><Plus /> Agregar</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {[["Gasto fijo", "/fijos?nuevo=1", "house"], ["Suscripción", "/suscripciones?nuevo=1", "repeat"], ["Fecha importante", "/calendario?nuevo=1", "calendar"], ["Deuda o crédito", "/le-debo?nuevo=1", "landmark"], ["Ingreso", "/ingresos?nuevo=1", "arrow-down-to-line"]].map(([l, h, i]) => (
              <DropdownMenuItem key={h} asChild><Link href={h}><Icon name={i} /> {l}</Link></DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </>} />
      {venc.length > 0 && <Notice tone="bad" title={`Tienes ${venc.length} pago${venc.length > 1 ? "s" : ""} vencido${venc.length > 1 ? "s" : ""} por ${fmtShort(venc.reduce((s, e) => s + e.monto, 0))}`} action={<Button size="sm" variant="outline" onClick={() => save({ ...prefs, v: "agenda" })}>Verlos</Button>} />}
      <div className="grid gap-6 xl:grid-cols-[18rem_1fr]">
        <div className="grid content-start gap-4 max-xl:order-2 md:grid-cols-2 xl:grid-cols-1">
          <Card className="items-center p-2 shadow-card ring-0">
            <Calendar mode="single" locale={es} selected={new Date(d + "T12:00:00")} month={new Date(d + "T12:00:00")} onMonthChange={(m) => setD(iso(m))}
              onSelect={(x) => x && setD(iso(x))} modifiers={{ ev: monthEv.map((e) => new Date(e.fecha + "T12:00:00")) }} modifiersClassNames={{ ev: "font-bold underline decoration-brand decoration-2 underline-offset-4" }} />
          </Card>
          <Card className="gap-3 p-4 shadow-card ring-0">
            <div className="flex justify-between text-sm"><span>Por pagar {prefs.v === "mes" ? "este mes" : "en el periodo"}</span><Money value={sum("pagar")} className="font-bold text-danger" /></div>
            <div className="flex justify-between text-sm"><span>Entradas y cobros</span><Money value={sum("cobrar")} className="font-bold text-success" /></div>
            <p className="pt-2 text-sm font-semibold">Mis calendarios</p>
            {(Object.keys(ECAT) as ECatKey[]).map((k) => (
              <label key={k} className="flex items-center gap-2 text-sm">
                <Checkbox checked={!prefs.off.includes(k)} onCheckedChange={(c) => save({ ...prefs, off: c === true ? prefs.off.filter((x) => x !== k) : [...prefs.off, k] })} style={{ ["--color-primary" as string]: ECAT[k].color }} />
                <span className="size-2.5 rounded-full" style={{ background: ECAT[k].color }} />{ECAT[k].n}
              </label>
            ))}
          </Card>
        </div>
        <Card className="min-w-0 gap-3 p-3 shadow-card ring-0 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setD(today)}>Hoy</Button>
            <Button variant="ghost" size="icon" aria-label="Anterior" onClick={() => move(-1)}><ChevronLeft /></Button>
            <Button variant="ghost" size="icon" aria-label="Siguiente" onClick={() => move(1)}><ChevronRight /></Button>
            <h2 className="text-lg font-semibold capitalize">{title}</h2>
            <Segmented className="ml-auto" value={prefs.v} onChange={(v) => save({ ...prefs, v: v as View })} items={[{ value: "agenda", label: "Agenda" }, { value: "semana", label: "Semana" }, { value: "mes", label: "Mes" }]} />
          </div>
          {prefs.v === "mes" && (
            <div className="grid grid-cols-7 overflow-hidden rounded-lg border text-sm">
              {DIAS.map((x) => <div key={x} className="border-b bg-muted p-1 text-center text-xs font-semibold text-muted-foreground uppercase">{x}</div>)}
              {Array.from({ length: 42 }, (_, i) => add(a, i)).map((x) => {
                const list = byDay(x), net = list.filter((e) => e.st !== "ok").reduce((s, e) => s + (e.dir === "cobrar" ? e.monto : -e.monto), 0)
                const other = x.slice(0, 7) !== d.slice(0, 7)
                return (
                  <div key={x} className={cn("min-h-20 border-r border-b p-1 sm:min-h-24 [&:nth-child(7n)]:border-r-0", other && "bg-muted/40 text-muted-foreground")}>
                    <button type="button" onClick={() => { setD(x); save({ ...prefs, v: "agenda" }) }} className="flex w-full items-center justify-between">
                      <span className={cn("grid size-6 place-items-center rounded-full text-xs", x === today && "bg-primary text-primary-foreground font-bold")}>{+x.slice(8)}</span>
                      {net !== 0 && <span className={cn("text-[10px] font-semibold max-sm:hidden", net > 0 ? "text-success" : "text-danger")}>{net > 0 ? "+" : "−"}{fmtShort(Math.abs(net))}</span>}
                    </button>
                    <div className="mt-0.5 grid gap-0.5">
                      {list.slice(0, 3).map((e) => <EventChip key={e.id} e={e} today={today} compact />)}
                      {list.length > 3 && <button type="button" className="text-left text-[10px] text-muted-foreground" onClick={() => { setD(x); save({ ...prefs, v: "agenda" }) }}>+{list.length - 3} más</button>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {prefs.v === "semana" && (
            <div className="grid gap-2 sm:grid-cols-7">
              {Array.from({ length: 7 }, (_, i) => add(a, i)).map((x, i) => {
                const list = byDay(x)
                return (
                  <div key={x} className={cn("grid content-start gap-1 rounded-lg border p-2", x === today && "border-brand")}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase">{DIAS[i]} {+x.slice(8)}</p>
                    {!list.length ? <p className="text-xs text-muted-foreground">Libre</p> : list.map((e) => <EventChip key={e.id} e={e} today={today} />)}
                    {list.length > 0 && <p className="mt-1 text-[11px]"><span className="text-danger">−{fmtShort(list.filter((e) => e.dir === "pagar").reduce((s, e) => s + e.monto, 0))}</span> · <span className="text-success">+{fmtShort(list.filter((e) => e.dir === "cobrar").reduce((s, e) => s + e.monto, 0))}</span></p>}
                  </div>
                )
              })}
            </div>
          )}
          {prefs.v === "agenda" && (
            <ul className="grid divide-y">
              {[...new Set(ev.map((e) => e.fecha))].map((x) => (
                <li key={x} className="flex gap-4 py-3">
                  <div className="w-16 shrink-0 text-center"><p className={cn("text-2xl font-semibold", x === today && "text-brand")}>{+x.slice(8)}</p><p className="text-xs text-muted-foreground capitalize">{DIAS[(new Date(x + "T12:00:00").getDay() + 6) % 7]} · {monthName(+x.slice(5, 7), false)}</p><p className="text-[10px] text-muted-foreground">{rel(x, today)}</p></div>
                  <div className="grid flex-1 gap-1.5">
                    {byDay(x).map((e) => (
                      <Popover key={e.id}>
                        <PopoverTrigger asChild>
                          <button type="button" className="flex items-center gap-2 rounded-md p-1.5 text-left hover:bg-hover">
                            <span className="size-2.5 shrink-0 rounded-full" style={{ background: ECAT[e.k].color }} />
                            <span className="grid min-w-0 flex-1"><span className="truncate text-sm font-medium">{e.titulo}</span><span className="truncate text-xs text-muted-foreground">{[ECAT[e.k].n, e.sub, e.rng].filter(Boolean).join(" · ")}</span></span>
                            <span className={cn("text-sm font-semibold", e.dir === "cobrar" && "text-success")}>{e.dir === "cobrar" ? "+" : ""}<Money value={e.monto} /></span>
                            <StatusPill tone={e.st === "ok" ? "pagado" : e.st === "bad" ? "vencido" : "gray"}>{e.st === "ok" ? "Hecho" : e.st === "bad" ? "Vencido" : "Pendiente"}</StatusPill>
                          </button>
                        </PopoverTrigger>
                        <EventPopover e={e} today={today} />
                      </Popover>
                    ))}
                  </div>
                </li>
              ))}
              {!ev.length && <p className="py-8 text-center text-sm text-muted-foreground">Nada en este periodo.</p>}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}

/** Lleva los próximos pagos a Google Calendar (o pide conectar la cuenta). */
function GoogleCalendarButton() {
  const [busy, setBusy] = useState(false)
  return (
    <Button variant="outline" disabled={busy} onClick={async () => {
      setBusy(true)
      const r = await syncCalendar()
      setBusy(false)
      if (r.ok) return toast.success(r.msg)
      if (/Conecta tu cuenta de Google|venció/.test(r.msg)) { toast(r.msg, { action: { label: "Conectar", onClick: () => { location.href = "/api/google/connect?s=calendar&back=/recordatorios" } } }); return }
      toast.error("No se pudo sincronizar", { description: r.msg })
    }}>{busy ? <Spinner /> : <BrandLogo k="google-calendar" size={18} bare />} Google Calendar</Button>
  )
}

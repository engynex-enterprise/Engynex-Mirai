"use client"

import Link from "next/link"
import dynamic from "next/dynamic"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { BellRing, ChevronDown, Download, Ellipsis, ExternalLink, FileText, Gem, MessageCircle, Pencil, Phone, Plus, Trash2, TrendingDown, Undo2 } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Money } from "@/components/mirai/money"
import { StatusPill } from "@/components/mirai/status-pill"
import { Icon } from "@/components/mirai/icon"
import { Notice } from "@/components/mirai/notice"
import { Tip } from "@/components/mirai/tip"
import { initials } from "@/components/app/app-sidebar"
import { useApp, useBookId, useCanEdit } from "@/components/app/app-context"
import { invalidateBook } from "@/hooks/use-book-data"
import { createClient } from "@/utils/supabase/client"
import { FRECS, SISTEMAS, fechaCuota, loanEngine, loanName, loanStatus, loanTipo, loanTitulo, normProv, tipoDef, type LoanIn, type Prenda, type Sistema } from "@/lib/domain"
import { suggestLoanProvider } from "@/lib/domain/proveedor-pagos"
import { EntityLogo } from "@/components/mirai/entity-logo"
import { useProviders, useSettings } from "@/features/catalogs/hooks"
import { fmtDate, fmtMoney, fmtPct, fmtShort, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Row } from "@/lib/supabase/tables"
import { avatarTone } from "@/features/contacts/contacts-view"
import { toAddress } from "@/features/contacts/contact-form"
import { descargarAcuerdo } from "./acuerdo"
import { LoanEditDialog } from "./loan-edit-dialog"
import { PayLoanDialog } from "./pay-loan-dialog"
import { ReminderDialog } from "./reminder-dialog"

// recharts sale del JS inicial de Le debo / Me deben: el gráfico de cuotas llega justo después.
const LoanChart = dynamic(() => import("./loan-chart"), { ssr: false, loading: () => <div className="h-36 w-full" aria-hidden /> })

export type LoanRow = LoanIn & { id: string; payments: (Row<"loan_payments">)[] } & Row<"loans">
const daysBetween = (a: string, b: string) => Math.round((new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 864e5)
const PILL = { ok: "pagado", bad: "vencido", warn: "porVencer", info: "info" } as const
const COL = { cap: (c: boolean) => (c ? "#3F7A1E" : "#1F2B4B"), int: "#F2B233", extra: "#9AA4B8" }

export function LoanDetail({ loan, contacts, entities, anticipo, onDeleted }: { loan: LoanRow; contacts: Row<"contacts">[]; entities: Row<"entities">[]; anticipo: number; onDeleted: () => void }) {
  const today = todayISO()
  const bookId = useBookId()
  const canEdit = useCanEdit()
  const { user } = useApp()
  const qc = useQueryClient()
  const isC = loan.kind === "cobrar"
  const e = loanEngine(loan, today)
  const nm = loanName(loan, contacts, entities)
  const contact = contacts.find((c) => c.id === loan.contact_id) ?? null
  const [st, stTxt, stIcon] = loanStatus(e, today, anticipo)
  const [paying, setPaying] = useState(false)
  const [remind, setRemind] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [all, setAll] = useState(false)
  const [how, setHow] = useState(() => { try { return localStorage.getItem("mirai-how-plan") !== "0" } catch { return true } })
  const pr = loan.prenda as Prenda | null
  const tp = loanTipo(loan)
  const td = tipoDef(tp)
  const titulo = loanTitulo(tp, nm, { concepto: loan.concepto, prenda: pr })
  const { data: providers = [] } = useProviders()
  const prov = providers.find((p) => p.id === (loan as { provider_id?: string | null }).provider_id)
  const sugerido = !prov ? suggestLoanProvider(nm, providers, normProv) : undefined
  const cur = e.vencidas[0] ?? e.next
  const refresh = () => { invalidateBook(qc, bookId, "loans"); invalidateBook(qc, bookId, "loan_payments") }

  const undoLast = async () => {
    const last = [...loan.payments].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0]
    if (!last) return
    await createClient().from("loan_payments").update({ deleted_at: new Date().toISOString() }).eq("id", last.id)
    toast("Pago deshecho"); refresh()
  }
  const del = async () => {
    const now = new Date().toISOString()
    await createClient().from("loans").update({ deleted_at: now }).eq("id", loan.id)
    toast(isC ? "Préstamo eliminado" : "Deuda eliminada", { action: { label: "Deshacer", onClick: () => createClient().from("loans").update({ deleted_at: null }).eq("id", loan.id).then(refresh) } })
    refresh(); onDeleted()
  }
  const acuerdo = async () => {
    await descargarAcuerdo({
      kind: isC ? "cobrar" : "pagar", hoy: today, user, contact, nombre: nm,
      monto: Number(loan.monto), concepto: loan.concepto, inicio: loan.inicio, plazo: loan.plazo, frec: loan.frec, sistema: loan.sistema, tasa: Number(loan.tasa), e,
    })
    toast.success("Acuerdo de pago listo", { description: "Revísalo con la otra persona antes de firmarlo." })
  }

  // Barras del plan (pagadas + pendientes), agrupadas si hay más de 60
  const bars = [
    ...e.hist.filter((h) => h.tipo === "cuota").map((h) => ({ n: (h as { n: number }).n, fecha: (h as { prog: string }).prog, cap: h.cap, int: h.int, extra: h.extra, paid: true, venc: false })),
    ...e.plan.map((p, i) => ({ n: p.n, fecha: p.fecha, cap: p.cap, int: p.int, extra: p.extra, paid: false, venc: p.fecha < today, next: i === e.vencidas.length })),
  ]
  const g = Math.ceil(bars.length / 60)
  const chart = g > 1 ? Array.from({ length: Math.ceil(bars.length / g) }, (_, i) => { const sl = bars.slice(i * g, i * g + g); return { l: `${sl[0].n}–${sl.at(-1)!.n}`, cap: sl.reduce((a, b) => a + b.cap, 0), int: sl.reduce((a, b) => a + b.int, 0), extra: sl.reduce((a, b) => a + b.extra, 0), paid: sl.every((b) => b.paid) } }) : bars.map((b) => ({ ...b, l: String(b.n) }))
  const openIdx = e.plan.findIndex((p) => p.fecha >= today)
  const showRows = all || e.plan.length <= 14 ? e.plan : e.plan.slice(Math.max(0, openIdx - 2), Math.max(0, openIdx - 2) + 12)

  const { data: cfg } = useSettings()
  const usura = Number(cfg?.usura ?? 26)
  const tasaM = Number(loan.tasa) || 0
  const ea = tasaM ? (Math.pow(1 + tasaM / 100, 12) - 1) * 100 : 0
  const totalCuotas = e.k + e.plan.length
  const tel = contact?.telefono?.replace(/\D/g, "") ?? ""
  const wa = tel ? `https://wa.me/${tel.length === 10 ? `57${tel}` : tel}` : ""
  const quienHref = prov ? `/proveedores?id=${prov.id}` : contact ? `/contactos?id=${contact.id}` : loan.entity_id ? "/contactos?tab=entidades" : null
  const quienTxt = prov ? "Ver el proveedor" : contact ? "Ver el contacto" : loan.entity_id ? "Ver en Bancos y entidades" : ""
  const [editing, setEditing] = useState(false)

  // Plan de pagos completo (pagadas + pendientes) en CSV para Excel.
  const descargarPlan = () => {
    const rows = [["#", "Fecha", "Valor de la cuota", "Abono a la deuda", "Interés", "Seguros", "Queda debiendo", "Estado"],
      ...e.hist.filter((h) => h.tipo === "cuota").map((h) => [(h as { n: number }).n, (h as { prog: string }).prog, h.valor, h.cap, h.int, h.extra, h.saldo, "Pagada"]),
      ...e.plan.map((p) => [p.n, p.fecha, p.valor, p.cap, p.int, p.extra, p.saldo, p.fecha < today ? "Vencida" : "Pendiente"])]
    const csv = rows.map((r) => r.map((v) => (typeof v === "number" ? String(Math.round(v)) : `"${String(v ?? "").replace(/"/g, '""')}"`)).join(";")).join("\n")
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }))
    a.download = `plan-${nm.toLowerCase().replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}-${today}.csv`
    a.click(); URL.revokeObjectURL(a.href)
    toast.success("Plan de pagos descargado", { description: "Ábrelo con Excel o Google Sheets." })
  }

  return (
    // @container: el detalle se acomoda al ancho de su columna (no al de la pantalla).
    <Card className="@container min-w-0 gap-5 p-4 shadow-card ring-0 sm:p-5">
      <div className="flex items-start gap-3">
        {contact && !prov ? <Avatar className="size-12 shrink-0"><AvatarFallback className={cn("bg-gradient-to-br text-white", avatarTone(nm))}>{initials(nm)}</AvatarFallback></Avatar>
          : <EntityLogo name={nm} provider={prov} icon={td?.icon ?? "landmark"} seed={nm} size={48} />}
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h2 className="text-lg leading-snug font-semibold break-words @lg:text-xl">{nm}</h2>
          {titulo !== nm && <p className="line-clamp-2 text-sm text-muted-foreground" data-testid="loan-titulo">{titulo}</p>}
          {prov ? (
            <Link href={`/proveedores?id=${prov.id}`} className="flex w-fit max-w-full items-center gap-1.5 text-sm font-medium text-link hover:underline"><EntityLogo provider={prov} size={18} /><span className="truncate">Proveedor: {prov.nombre}</span></Link>
          ) : sugerido && canEdit && (
            <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <EntityLogo provider={sugerido} size={18} /> ¿Es tu proveedor “{sugerido.nombre}”?
              <button type="button" className="font-semibold text-link hover:underline" onClick={async () => {
                const { error } = await createClient().from("loans").update({ provider_id: sugerido.id }).eq("id", loan.id)
                if (error) return toast.error("No se pudo enlazar", { description: error.message })
                toast.success("Quedó enlazado", { description: `Lo ves también en Proveedores › ${sugerido.nombre}.` }); refresh()
              }}>Enlazar</button>
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {tel && <Tip label={`Llamar a ${nm.split(" ")[0]}`}><Button variant="ghost" size="icon" className="rounded-full" asChild><a href={`tel:${tel}`} aria-label="Llamar"><Phone /></a></Button></Tip>}
          {wa && <Tip label="Escribir por WhatsApp"><Button variant="ghost" size="icon" className="rounded-full" asChild><a href={wa} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"><MessageCircle /></a></Button></Tip>}
          <DropdownMenu>
            <Tip label="Más opciones"><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="rounded-full" aria-label={`Más opciones de ${nm}`}><Ellipsis /></Button></DropdownMenuTrigger></Tip>
            <DropdownMenuContent align="end" className="w-60">
              {canEdit && <DropdownMenuItem onSelect={() => setEditing(true)}><Pencil /> Editar datos</DropdownMenuItem>}
              {canEdit && !e.done && <DropdownMenuItem onSelect={() => setPaying(true)}><Plus /> Registrar pago</DropdownMenuItem>}
              {canEdit && isC && !e.done && <DropdownMenuItem onSelect={() => setRemind(true)}><BellRing /> Enviar recordatorio</DropdownMenuItem>}
              {!isC && !e.done && <DropdownMenuItem asChild><Link href="/estrategia"><TrendingDown /> Simular un abono</Link></DropdownMenuItem>}
              <DropdownMenuItem onSelect={descargarPlan}><Download /> Descargar plan de pagos</DropdownMenuItem>
              {contact && <DropdownMenuItem onSelect={() => void acuerdo()}><FileText /> Acuerdo de pago (PDF)</DropdownMenuItem>}
              {quienHref && <DropdownMenuItem asChild><Link href={quienHref}><ExternalLink /> {quienTxt}</Link></DropdownMenuItem>}
              {canEdit && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}><Trash2 /> Eliminar</DropdownMenuItem></>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="-mt-2 flex flex-wrap gap-1.5">
        {td && <StatusPill tone={tp === "gota" ? "vencido" : tp === "empeno" ? "violet" : "info"}><Icon name={td.icon} className="size-3" /> {td.corto}</StatusPill>}
        {loan.concepto && loan.concepto !== td?.corto && <StatusPill tone="gray" className="max-w-full truncate">{loan.concepto}</StatusPill>}
        <StatusPill tone="gray">{loan.frec === "unico" ? (loan.vence ? `Pago único · ${fmtDate(loan.vence)}` : FRECS.unico.n) : FRECS[loan.frec]?.n}</StatusPill>
        <StatusPill tone="gray">{tasaM ? `${fmtPct(tasaM, 2)} mensual` : "Sin intereses"}</StatusPill>
        {pr && tp !== "empeno" && <StatusPill tone="violet"><Gem className="size-3" /> Con garantía</StatusPill>}
        <StatusPill tone={PILL[st]}><Icon name={stIcon} className="size-3" /> {stTxt}</StatusPill>
      </div>

      {pr && (() => {
        const d = pr.limite ? daysBetween(today, pr.limite) : null
        const lvl = e.done ? "ok" : d == null ? "info" : d < 0 ? "bad" : d <= 15 ? "warn" : "info"
        return (
          <div className={cn("grid gap-1 rounded-lg p-4 text-sm", lvl === "bad" ? "bg-danger-soft" : lvl === "warn" ? "bg-warning-soft" : lvl === "ok" ? "bg-success-soft" : "bg-info-soft")}>
            <p className="font-semibold break-words"><Gem className="mr-1 inline size-4" />{isC ? "Garantía que te dejaron" : "Objeto empeñado"}: {pr.obj}</p>
            <p>{pr.valor ? `Vale aprox. ${fmtMoney(pr.valor)} · ` : ""}{pr.ref ? `Boleta ${pr.ref} · ` : ""}
              {e.done ? (isC ? "El préstamo está pagado: ya debes devolver el objeto." : "Ya pagaste todo: puedes recoger tu objeto.")
                : d == null ? "Sin fecha límite registrada."
                : d < 0 ? <>La fecha límite pasó hace {-d} días.{!isC && " Comunícate ya con la casa de empeño: podrías perder el objeto."}</>
                : <>Quedan <b>{d} días</b> (hasta el {fmtDate(pr.limite!)}).{!isC && <> Para recuperarlo debes pagar {fmtMoney(e.saldo)}{loan.sistema === "americano" && e.plan.length > 1 ? " o al menos los intereses para refrendar (extender el plazo)" : ""}. Si no pagas a tiempo puedes perder el objeto.</>}</>}</p>
          </div>
        )
      })()}

      {tp === "gota" && !e.done && <Notice tone="bad" title="Préstamo gota a gota">{td?.riesgo}</Notice>}
      {loan.nota?.trim() && <p className="rounded-lg bg-secondary/60 p-3 text-sm break-words"><b>Nota del acuerdo:</b> {loan.nota}</p>}

      <div className={cn("grid items-center gap-3 rounded-xl p-4 @md:grid-cols-[minmax(0,1fr)_auto]", e.done ? "bg-success-soft" : e.vencidas.length ? "bg-danger-soft" : cur && daysBetween(today, cur.fecha) <= anticipo ? "bg-warning-soft" : "bg-info-soft")}>
        <div className="grid min-w-0 gap-0.5">
          {e.done ? (<><p className="font-semibold">{isC ? "¡Te pagó todo!" : "¡Deuda pagada!"}</p><p className="text-sm">Se {isC ? "recibieron" : "pagaron"} {fmtMoney(e.pagado)} en total.</p></>)
            : e.vencidas.length ? (<>
              <p className="text-sm">{isC ? `Para ponerse al día ${nm.split(" ")[0]} debe pagarte` : "Para ponerte al día debes pagar"}</p>
              <Money value={e.vencidas.reduce((a, c) => a + c.valor, 0)} className="text-2xl font-extrabold text-danger" />
              <p className="text-sm">{e.vencidas.length} cuota{e.vencidas.length > 1 ? "s" : ""} vencida{e.vencidas.length > 1 ? "s" : ""} · la primera venció el {fmtDate(e.vencidas[0].fecha)} (hace {e.mora} días)</p>
            </>) : cur && (<>
              <p className="text-sm">{isC ? `Próximo pago que ${nm.split(" ")[0]} te debe hacer` : "Tu próximo pago"}</p>
              <Money value={cur.valor} className="text-2xl font-extrabold" />
              <p className="text-sm">Cuota {cur.n} de {totalCuotas} · {fmtDate(cur.fecha)} · {(() => { const d = daysBetween(today, cur.fecha); return d === 0 ? "es hoy" : d === 1 ? "mañana" : `en ${d} días` })()}</p>
            </>)}
        </div>
        {!e.done && canEdit && (
          <div className="flex flex-wrap gap-2 @md:justify-end">
            {isC && e.vencidas.length > 0 && contact && <Button variant="outline" onClick={() => setRemind(true)}><BellRing /> Recordar</Button>}
            <Button onClick={() => setPaying(true)} className="flex-1 @md:flex-none"><Plus /> Registrar pago</Button>
          </div>
        )}
      </div>

      {cur && !e.done && (
        <div className="grid gap-2">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span style={{ width: `${(cur.cap / cur.valor) * 100}%`, background: COL.cap(isC) }} />
            <span style={{ width: `${(cur.int / cur.valor) * 100}%`, background: COL.int }} />
            <span style={{ width: `${(cur.extra / cur.valor) * 100}%`, background: COL.extra }} />
          </div>
          <p className="text-sm text-muted-foreground">{cur.cap > 0.5 ? <><b className="text-foreground">{fmtMoney(cur.cap)}</b> bajan la deuda</> : "Nada baja la deuda todavía (solo intereses)"}{cur.int > 0.5 && <> y <b className="text-foreground">{fmtMoney(cur.int)}</b> son intereses ({isC ? "lo que ganas por prestar" : "el costo del crédito"})</>}{cur.extra > 0.5 && <> y <b className="text-foreground">{fmtMoney(cur.extra)}</b> son seguros u otros cobros</>}. Después de pagarla {isC ? `${nm.split(" ")[0]} quedará debiendo` : "quedarás debiendo"} <b className="text-foreground">{fmtMoney(cur.saldo)}</b>.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2.5 @3xl:grid-cols-4">
        {([[isC ? "Prestaste" : "Te prestaron", Number(loan.monto), fmtDate(loan.inicio)], [isC ? "Te debe hoy" : "Debes hoy", e.saldo, "de capital, sin intereses futuros"],
          [isC ? "Te ha pagado" : "Has pagado", e.pagado, `${e.k} de ${totalCuotas} cuotas`], [isC ? "Ganarás en intereses" : "Pagarás en intereses", e.intTotal, `en total ${isC ? "recibirás" : "pagarás"} ${fmtShort(e.totalPagar)}`]] as const).map(([l, v, sub]) => (
          <div key={l} className="grid min-w-0 content-start gap-0.5 rounded-lg bg-muted p-3">
            <p className="truncate text-xs text-muted-foreground">{l}</p>
            <Money value={v} className="truncate text-base font-semibold tabular-nums" />
            <p className="text-xs leading-snug text-muted-foreground">{sub}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-1.5">
        <Progress value={e.progreso * 100} className={cn("h-2", isC ? "[&>div]:bg-forest" : "[&>div]:bg-expense")} aria-label={`${Math.round(e.progreso * 100)} % pagado`} />
        <p className="flex flex-wrap justify-between gap-x-3 text-xs text-muted-foreground"><span>{Math.round(e.progreso * 100)} % de la deuda pagada</span><span>{e.done ? "Terminado" : `Termina el ${fmtDate(e.plan.at(-1)?.fecha ?? null)}`}</span></p>
      </div>
      {!isC && tasaM > 0 && ea > usura && (
        <Notice tone="warn" title="Esta tasa supera la de usura">{fmtPct(tasaM, 2)} mensual equivale a {fmtPct(ea, 1)} efectivo anual y el máximo legal es {fmtPct(usura, 2)}. Pregunta si puedes pagarla antes o pasarla a un crédito más barato.</Notice>
      )}

      <Tabs defaultValue="plan" className="min-w-0">
        <TabsList className="w-full @lg:w-fit">
          <TabsTrigger value="plan">Plan de pagos</TabsTrigger>
          <TabsTrigger value="hist">{isC ? "Pagos recibidos" : "Pagos hechos"}{e.hist.length > 0 && <span className="ml-1 text-xs text-muted-foreground">{e.hist.length}</span>}</TabsTrigger>
          <TabsTrigger value="datos">Datos</TabsTrigger>
        </TabsList>
        <TabsContent value="plan" className="grid min-w-0 gap-4 pt-3">
          <Collapsible open={how} onOpenChange={(o) => { setHow(o); try { localStorage.setItem("mirai-how-plan", o ? "1" : "0") } catch {} }}>
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 rounded-lg bg-brand-soft px-4 py-2 text-left text-sm font-semibold">¿Cómo leer este plan de pagos?<ChevronDown className={cn("size-4 shrink-0 transition", how && "rotate-180")} /></CollapsibleTrigger>
            <CollapsibleContent className="grid gap-1 px-4 py-3 text-sm">
              <p className="font-semibold">Valor de la cuota = Abono a la deuda + Interés{Number(loan.extra) > 0 && " + Seguros"}</p>
              <ul className="ml-4 list-disc text-muted-foreground">
                <li><b>Abono a la deuda:</b> lo que baja lo que se debe.</li>
                <li><b>Interés:</b> el costo del préstamo. Al principio es más alto porque se calcula sobre lo que falta.</li>
                <li><b>Queda debiendo:</b> el saldo después de pagar esa cuota.</li>
                <li>Las filas <b>vencidas</b> son cuotas cuya fecha ya pasó sin pago registrado.</li>
              </ul>
            </CollapsibleContent>
          </Collapsible>
          {bars.length > 1 && <LoanChart data={chart} colors={{ cap: COL.cap(isC), int: COL.int, extra: COL.extra }} />}
          {/* La tabla se desplaza dentro de su caja; en columnas angostas se ocultan el estado (lo dice el color), seguros, abono e interés. */}
          <div className="min-w-0 overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/50"><TableRow><TableHead className="w-10">#</TableHead><TableHead>Fecha</TableHead><TableHead className="text-right">Cuota</TableHead><TableHead className="text-right @max-xl:hidden">Abono a la deuda</TableHead><TableHead className="text-right @max-xl:hidden">Interés</TableHead>{Number(loan.extra) > 0 && <TableHead className="text-right @max-2xl:hidden">Seguros</TableHead>}<TableHead className="text-right">Queda debiendo</TableHead><TableHead className="@max-2xl:hidden">Estado</TableHead></TableRow></TableHeader>
              <TableBody>
                {showRows.map((p) => {
                  const venc = p.fecha < today
                  const next = !venc && (e.plan.indexOf(p) === e.vencidas.length || e.plan.indexOf(p) === 0)
                  return (
                    <TableRow key={p.n} className={cn(next && "bg-brand-soft", venc && "bg-danger-soft/50")}>
                      <TableCell className="text-muted-foreground">{p.n}</TableCell>
                      <TableCell>{fmtDate(p.fecha)}{venc && <span className="block text-xs text-danger">hace {daysBetween(p.fecha, today)} días</span>}</TableCell>
                      <TableCell className="text-right font-semibold"><Money value={p.valor} /></TableCell>
                      <TableCell className="text-right @max-xl:hidden"><Money value={p.cap} /></TableCell>
                      <TableCell className="text-right text-warning @max-xl:hidden"><Money value={p.int} /></TableCell>
                      {Number(loan.extra) > 0 && <TableCell className="text-right @max-2xl:hidden"><Money value={p.extra} /></TableCell>}
                      <TableCell className="text-right"><Money value={p.saldo} /></TableCell>
                      <TableCell className="@max-2xl:hidden"><StatusPill tone={venc ? "vencido" : next ? "porVencer" : "gray"}>{venc ? "Vencida" : next ? "Siguiente" : "Pendiente"}</StatusPill></TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {e.plan.length > 14 && <Button variant="ghost" onClick={() => setAll((a) => !a)}>{all ? "Ver menos" : `Ver las ${e.plan.length} cuotas`}</Button>}
            <Button variant="ghost" onClick={descargarPlan}><Download /> Descargar (Excel)</Button>
          </div>
        </TabsContent>
        <TabsContent value="hist" className="min-w-0 pt-3">
          {!e.hist.length ? <p className="text-sm text-muted-foreground">Aún no hay pagos registrados.</p> : (
            <ul className="grid divide-y">
              {[...e.hist].reverse().map((h, i) => (
                <li key={i} className="flex items-center gap-3 py-3">
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", h.tipo === "abono" ? "bg-info-soft text-info" : "bg-success-soft text-success")}><Icon name={h.tipo === "abono" ? "piggy-bank" : "circle-check"} className="size-4" /></span>
                  <div className="grid min-w-0 flex-1 text-sm">
                    <b className="break-words">{h.tipo === "abono" ? `Abono a la deuda · ${h.modo === "cuota" ? "para bajar la cuota" : "para terminar antes"}` : `Cuota ${(h as { n: number }).n} completa`}</b>
                    <span className="text-muted-foreground">{fmtDate(h.fecha)}{h.tipo === "cuota" && ` · interés ${fmtMoney(h.int)} + abono ${fmtMoney(h.cap)}`} · quedó en {fmtMoney(h.saldo)}</span>
                  </div>
                  <div className="grid shrink-0 justify-items-end gap-1">
                    <Money value={h.valor} className="font-bold" />
                    {i === 0 && canEdit && <Button variant="ghost" size="sm" onClick={undoLast}><Undo2 /> Deshacer</Button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="datos" className="grid min-w-0 gap-4 pt-3 text-sm">
          <dl className="grid gap-x-6 @xl:grid-cols-2">
            {([
              ["Tipo", td?.label ?? "—"],
              [isC ? "Le prestaste a" : "Te prestó", quienHref ? <Link key="q" href={quienHref} className="font-medium text-link hover:underline">{nm}</Link> : nm],
              ["Fecha del préstamo", fmtDate(loan.inicio)],
              ...(loan.frec !== "unico" ? [["Primera cuota", fmtDate(fechaCuota(loan, 1).toISOString().slice(0, 10))] as const] : []),
              [isC ? "Valor prestado" : "Valor recibido", fmtMoney(Number(loan.monto))],
              ["Forma de pago", loan.frec === "unico" ? `Un solo pago${loan.vence ? ` el ${fmtDate(loan.vence)}` : ""}` : `${totalCuotas} cuotas · ${FRECS[loan.frec]?.n?.toLowerCase() ?? ""}`],
              ["Cómo se calcula", SISTEMAS[loan.sistema as Sistema]?.n ?? "Cuota fija"],
              ["Interés", tasaM ? `${fmtPct(tasaM, 2)} mensual ≈ ${fmtPct(ea, 1)} E.A.` : "Sin intereses"],
              ...(tasaM ? [["Frente a la usura", <span key="u" className={ea > usura ? "font-semibold text-danger" : "font-semibold text-success"}>{ea > usura ? `La supera (máx. ${fmtPct(usura, 2)} E.A.)` : `Por debajo (máx. ${fmtPct(usura, 2)} E.A.)`}</span>] as const] : []),
              ...(Number(loan.extra) > 0 ? [["Seguros por cuota", fmtMoney(Number(loan.extra))] as const] : []),
              ["Total a pagar", fmtMoney(e.totalPagar)],
              ["Termina", e.done ? "Ya terminó" : fmtDate(e.plan.at(-1)?.fecha ?? null)],
            ] as const).map(([l, v]) => (
              <div key={l} className="flex justify-between gap-4 border-b border-dotted py-2"><dt className="text-muted-foreground">{l}</dt><dd className="min-w-0 text-right break-words">{v}</dd></div>
            ))}
          </dl>
          {contact && (
            <div className="grid gap-1">
              <p className="font-semibold">Datos del contacto</p>
              <dl className="grid gap-x-6 @xl:grid-cols-2">
                {[["Teléfono", contact.telefono], ["Correo", contact.email], ["Documento", contact.doc && `${contact.doc_tipo} ${contact.doc}`], ["Dirección", [toAddress(contact).dir, contact.ciudad].filter(Boolean).join(", ")], ["Relación", contact.relacion], ["Notas", contact.notas]].map(([l, v]) => (
                  <div key={l as string} className="flex justify-between gap-4 border-b border-dotted py-2"><dt className="text-muted-foreground">{l}</dt><dd className="min-w-0 text-right break-words">{v || "Sin registrar"}</dd></div>
                ))}
              </dl>
            </div>
          )}
          {canEdit && <Button variant="outline" className="w-fit" onClick={() => setEditing(true)}><Pencil /> Editar datos</Button>}
        </TabsContent>
      </Tabs>

      <PayLoanDialog loan={paying ? loan : null} name={nm} onOpenChange={(o) => !o && setPaying(false)} />
      {remind && <ReminderDialog open={remind} onOpenChange={setRemind} engine={e} concepto={loan.concepto} contact={contact} loanId={loan.kind === "cobrar" ? loan.id : undefined} />}
      {editing && <LoanEditDialog loan={loan} open={editing} onOpenChange={setEditing} contacts={contacts} entities={entities} />}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Eliminar {isC ? "préstamo" : "deuda"}?</AlertDialogTitle><AlertDialogDescription>Se borrará con todo su historial de pagos. Podrás deshacerlo durante unos segundos.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-danger text-white hover:bg-danger/90" onClick={del}>Eliminar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

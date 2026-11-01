"use client"

import Link from "next/link"
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Bar, BarChart, Cell, XAxis } from "recharts"
import { BellRing, ChevronDown, FileText, Gem, Phone, Plus, Trash2, TrendingDown, Undo2 } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Progress } from "@/components/ui/progress"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Money } from "@/components/mirai/money"
import { StatusPill } from "@/components/mirai/status-pill"
import { Icon } from "@/components/mirai/icon"
import { initials } from "@/components/app/app-sidebar"
import { useApp, useBookId, useCanEdit } from "@/components/app/app-context"
import { invalidateBook } from "@/hooks/use-book-data"
import { createClient } from "@/utils/supabase/client"
import { FRECS, SISTEMAS, loanEngine, loanName, loanStatus, type LoanIn, type Prenda, type Sistema } from "@/lib/domain"
import { fmtDate, fmtMoney, fmtPct, fmtShort, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Row } from "@/lib/supabase/tables"
import { avatarTone } from "@/features/contacts/contacts-view"
import { DOC_TIPOS, toAddress } from "@/features/contacts/contact-form"
import { PayLoanDialog } from "./pay-loan-dialog"
import { ReminderDialog } from "./reminder-dialog"

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
    const { data: me } = await createClient().from("profiles").select("nombre,doc_tipo,doc,ciudad").eq("id", user.id).single()
    const { downloadAgreement } = await import("./agreement-pdf")
    const docOf = (t?: string | null, d?: string | null) => (d ? `${DOC_TIPOS.find((x) => x.value === t)?.value ?? "C.C."} ${d}` : "")
    const ad = toAddress(contact)
    await downloadAgreement({
      kind: isC ? "cobrar" : "pagar", hoy: today, ciudad: me?.ciudad ?? "",
      yo: { nombre: me?.nombre || user.nombre, doc: docOf(me?.doc_tipo, me?.doc) },
      otro: { nombre: nm, doc: docOf(contact?.doc_tipo, contact?.doc), direccion: [ad.dir, ad.ciudad].filter(Boolean).join(", "), telefono: contact?.telefono },
      monto: Number(loan.monto), concepto: loan.concepto, inicio: loan.inicio, plazo: loan.plazo, frec: loan.frec, sistema: loan.sistema, tasa: Number(loan.tasa),
      ea: loan.sistema === "simple" ? (Number(loan.tasa) * 12) / 100 : Math.pow(1 + Number(loan.tasa) / 100, 12) - 1, e,
    }, `acuerdo-de-pago-${nm.toLowerCase().replace(/\s+/g, "-")}.pdf`)
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

  return (
    <Card className="gap-5 p-5 shadow-card ring-0">
      <div className="flex flex-wrap items-center gap-3">
        <Avatar className="size-12">{contact ? <AvatarFallback className={cn("bg-gradient-to-br text-white", avatarTone(nm))}>{initials(nm)}</AvatarFallback> : <AvatarFallback className="bg-muted"><Icon name="landmark" /></AvatarFallback>}</Avatar>
        <div className="grid min-w-0 flex-1 gap-1">
          <h2 className="truncate text-xl font-semibold">{nm}</h2>
          <div className="flex flex-wrap gap-1.5">
            {loan.concepto && <StatusPill tone="gray">{loan.concepto}</StatusPill>}
            <StatusPill tone="gray">{SISTEMAS[loan.sistema as Sistema]?.n ?? "Cuota fija"}</StatusPill>
            <StatusPill tone="gray">{FRECS[loan.frec]?.n}</StatusPill>
            <StatusPill tone="gray">{Number(loan.tasa) ? `${fmtPct(Number(loan.tasa), 2)} mensual` : "sin intereses"}</StatusPill>
            {pr && <StatusPill tone="violet"><Gem className="size-3" /> Empeño</StatusPill>}
            <StatusPill tone={PILL[st]}><Icon name={stIcon} className="size-3" /> {stTxt}</StatusPill>
          </div>
        </div>
      </div>

      {pr && (() => {
        const d = pr.limite ? daysBetween(today, pr.limite) : null
        const lvl = e.done ? "ok" : d == null ? "info" : d < 0 ? "bad" : d <= 15 ? "warn" : "info"
        return (
          <div className={cn("grid gap-1 rounded-lg p-4 text-sm", lvl === "bad" ? "bg-danger-soft" : lvl === "warn" ? "bg-warning-soft" : lvl === "ok" ? "bg-success-soft" : "bg-info-soft")}>
            <p className="font-semibold"><Gem className="mr-1 inline size-4" />{isC ? "Garantía que te dejaron" : "Objeto empeñado"}: {pr.obj}</p>
            <p>{pr.valor ? `Vale aprox. ${fmtMoney(pr.valor)} · ` : ""}{pr.ref ? `Boleta ${pr.ref} · ` : ""}
              {e.done ? (isC ? "El préstamo está pagado: ya debes devolver el objeto." : "Ya pagaste todo: puedes recoger tu objeto.")
                : d == null ? "Sin fecha límite registrada."
                : d < 0 ? <>La fecha límite pasó hace {-d} días.{!isC && " Comunícate ya con la casa de empeño: podrías perder el objeto."}</>
                : <>Quedan <b>{d} días</b> (hasta el {fmtDate(pr.limite!)}).{!isC && <> Para recuperarlo debes pagar {fmtMoney(e.saldo)}{loan.sistema === "americano" && e.plan.length > 1 ? " o al menos los intereses para refrendar (extender el plazo)" : ""}.</>}</>}</p>
          </div>
        )
      })()}

      <div className={cn("flex flex-wrap items-center gap-4 rounded-lg p-4", e.done ? "bg-success-soft" : e.vencidas.length ? "bg-danger-soft" : cur && daysBetween(today, cur.fecha) <= anticipo ? "bg-warning-soft" : "bg-info-soft")}>
        <div className="grid flex-1 gap-0.5">
          {e.done ? (<><p className="font-semibold">{isC ? "¡Te pagó todo!" : "¡Deuda pagada!"}</p><p className="text-sm">Se {isC ? "recibieron" : "pagaron"} {fmtMoney(e.pagado)} en total.</p></>)
            : e.vencidas.length ? (<>
              <p className="text-sm">{isC ? `Para ponerse al día ${nm.split(" ")[0]} debe pagarte` : "Para ponerte al día debes pagar"}</p>
              <Money value={e.vencidas.reduce((a, c) => a + c.valor, 0)} className="text-2xl font-extrabold text-danger" />
              <p className="text-sm">{e.vencidas.length} cuota{e.vencidas.length > 1 ? "s" : ""} vencida{e.vencidas.length > 1 ? "s" : ""} · la primera venció el {fmtDate(e.vencidas[0].fecha)} (hace {e.mora} días)</p>
            </>) : cur && (<>
              <p className="text-sm">{isC ? `Próximo pago que ${nm.split(" ")[0]} te debe hacer` : "Tu próximo pago"}</p>
              <Money value={cur.valor} className="text-2xl font-extrabold" />
              <p className="text-sm">Cuota {cur.n} de {e.k + e.plan.length} · {fmtDate(cur.fecha)} · {(() => { const d = daysBetween(today, cur.fecha); return d === 0 ? "es hoy" : d === 1 ? "mañana" : `en ${d} días` })()}</p>
            </>)}
        </div>
        {!e.done && canEdit && (
          <div className="flex gap-2">
            {isC && e.vencidas.length > 0 && contact?.telefono && <Button variant="outline" asChild><a href={`tel:${contact.telefono}`}><Phone /> Llamar</a></Button>}
            <Button onClick={() => setPaying(true)}><Plus /> Registrar pago</Button>
          </div>
        )}
      </div>

      {cur && !e.done && (
        <div className="grid gap-2">
          <div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span style={{ width: `${(cur.cap / cur.valor) * 100}%`, background: COL.cap(isC) }} />
            <span style={{ width: `${(cur.int / cur.valor) * 100}%`, background: COL.int }} />
            <span style={{ width: `${(cur.extra / cur.valor) * 100}%`, background: COL.extra }} />
          </div>
          <p className="text-sm">{cur.cap > 0.5 ? <><b>{fmtMoney(cur.cap)}</b> bajan la deuda</> : "Nada baja la deuda todavía (solo intereses)"}{cur.int > 0.5 && <> y <b>{fmtMoney(cur.int)}</b> son intereses ({isC ? "lo que ganas por prestar" : "el costo del crédito"})</>}{cur.extra > 0.5 && <> y <b>{fmtMoney(cur.extra)}</b> son seguros u otros cobros</>}. Después de pagarla {isC ? `${nm.split(" ")[0]} quedará debiendo` : "quedarás debiendo"} <b>{fmtMoney(cur.saldo)}</b>.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[[isC ? "Prestaste" : "Te prestaron", Number(loan.monto), fmtDate(loan.inicio)], [isC ? "Te debe hoy" : "Debes hoy", e.saldo, "de capital, sin intereses futuros"],
          [isC ? "Te ha pagado" : "Has pagado", e.pagado, `${e.k} de ${e.k + e.plan.length} cuotas`], [isC ? "Ganarás en intereses" : "Pagarás en intereses", e.intTotal, `en total ${isC ? "recibirás" : "pagarás"} ${fmtShort(e.totalPagar)}`]].map(([l, v, sub]) => (
          <div key={l as string} className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">{l}</p><Money value={v as number} className="text-base font-semibold" /><p className="text-xs text-muted-foreground">{sub}</p></div>
        ))}
      </div>
      <div className="grid gap-1.5">
        <Progress value={e.progreso * 100} className={cn("h-2", isC ? "[&>div]:bg-forest" : "[&>div]:bg-expense")} />
        <p className="flex justify-between text-xs text-muted-foreground"><span>{Math.round(e.progreso * 100)} % de la deuda pagada</span><span>{e.done ? "Terminado" : `Termina el ${fmtDate(e.plan.at(-1)?.fecha ?? null)}`}</span></p>
      </div>

      {canEdit && (
        <div className="flex flex-wrap gap-2">
          {isC && !e.done && <Button variant="soft" onClick={() => setRemind(true)}><BellRing /> Enviar recordatorio</Button>}
          {!isC && !e.done && <Button variant="outline" asChild><Link href="/estrategia"><TrendingDown /> Simular abono</Link></Button>}
          {contact && <Button variant="outline" onClick={acuerdo}><FileText /> Acuerdo de pago (PDF)</Button>}
          <Button variant="ghost" className="text-danger" onClick={() => setConfirm(true)}><Trash2 /> Eliminar</Button>
        </div>
      )}

      <Tabs defaultValue="plan">
        <TabsList className="w-full sm:w-fit"><TabsTrigger value="plan">Plan de pagos</TabsTrigger><TabsTrigger value="hist">{isC ? "Pagos recibidos" : "Pagos hechos"}</TabsTrigger>{contact && <TabsTrigger value="ct">Datos del contacto</TabsTrigger>}</TabsList>
        <TabsContent value="plan" className="grid gap-4 pt-3">
          <Collapsible open={how} onOpenChange={(o) => { setHow(o); try { localStorage.setItem("mirai-how-plan", o ? "1" : "0") } catch {} }}>
            <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg bg-brand-soft px-4 py-2 text-sm font-semibold">¿Cómo leer este plan de pagos?<ChevronDown className={cn("size-4 transition", how && "rotate-180")} /></CollapsibleTrigger>
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
          <ChartContainer config={{ cap: { label: "Abono", color: COL.cap(isC) }, int: { label: "Interés", color: COL.int }, extra: { label: "Seguros", color: COL.extra } }} className="h-36 w-full">
            <BarChart data={chart} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <XAxis dataKey="l" tickLine={false} axisLine={false} fontSize={10} interval="preserveStartEnd" />
              <ChartTooltip content={<ChartTooltipContent formatter={(v, n) => `${n === "cap" ? "Abono" : n === "int" ? "Interés" : "Seguros"}: ${fmtMoney(Number(v))}`} />} />
              {(["cap", "int", "extra"] as const).map((k) => (
                <Bar key={k} dataKey={k} stackId="a" fill={k === "cap" ? COL.cap(isC) : COL[k]}>{chart.map((c, i) => <Cell key={i} fillOpacity={c.paid ? 0.45 : 1} />)}</Bar>
              ))}
            </BarChart>
          </ChartContainer>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>#</TableHead><TableHead>Fecha de pago</TableHead><TableHead className="text-right">Valor de la cuota</TableHead><TableHead className="text-right max-sm:hidden">Abono a la deuda</TableHead><TableHead className="text-right max-sm:hidden">Interés</TableHead>{Number(loan.extra) > 0 && <TableHead className="text-right max-sm:hidden">Seguros</TableHead>}<TableHead className="text-right">Queda debiendo</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader>
              <TableBody>
                {showRows.map((p) => {
                  const venc = p.fecha < today
                  const next = !venc && (e.plan.indexOf(p) === e.vencidas.length || e.plan.indexOf(p) === 0)
                  return (
                    <TableRow key={p.n} className={cn(next && "bg-brand-soft", venc && "bg-danger-soft/50")}>
                      <TableCell>{p.n}</TableCell>
                      <TableCell>{fmtDate(p.fecha)}{venc && <span className="block text-xs text-danger">hace {daysBetween(p.fecha, today)} días</span>}</TableCell>
                      <TableCell className="text-right font-semibold"><Money value={p.valor} /></TableCell>
                      <TableCell className="text-right max-sm:hidden"><Money value={p.cap} /></TableCell>
                      <TableCell className="text-right text-warning max-sm:hidden"><Money value={p.int} /></TableCell>
                      {Number(loan.extra) > 0 && <TableCell className="text-right max-sm:hidden"><Money value={p.extra} /></TableCell>}
                      <TableCell className="text-right"><Money value={p.saldo} /></TableCell>
                      <TableCell><StatusPill tone={venc ? "vencido" : next ? "porVencer" : "gray"}>{venc ? "Vencida" : next ? "Siguiente" : "Pendiente"}</StatusPill></TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          {e.plan.length > 14 && <Button variant="ghost" className="w-fit" onClick={() => setAll((a) => !a)}>{all ? "Ver menos" : `Ver las ${e.plan.length} cuotas`}</Button>}
        </TabsContent>
        <TabsContent value="hist" className="pt-3">
          {!e.hist.length ? <p className="text-sm text-muted-foreground">Aún no hay pagos registrados.</p> : (
            <ul className="grid divide-y">
              {[...e.hist].reverse().map((h, i) => (
                <li key={i} className="flex items-center gap-3 py-3">
                  <span className={cn("grid size-9 place-items-center rounded-full", h.tipo === "abono" ? "bg-info-soft text-info" : "bg-success-soft text-success")}><Icon name={h.tipo === "abono" ? "piggy-bank" : "circle-check"} className="size-4" /></span>
                  <div className="grid flex-1 text-sm">
                    <b>{h.tipo === "abono" ? `Abono a la deuda · ${h.modo === "cuota" ? "para bajar la cuota" : "para terminar antes"}` : `Cuota ${(h as { n: number }).n} completa`}</b>
                    <span className="text-muted-foreground">{fmtDate(h.fecha)}{h.tipo === "cuota" && ` · interés ${fmtMoney(h.int)} + abono ${fmtMoney(h.cap)}`} · quedó en {fmtMoney(h.saldo)}</span>
                  </div>
                  <Money value={h.valor} className="font-bold" />
                  {i === 0 && canEdit && <Button variant="ghost" size="sm" onClick={undoLast}><Undo2 /> Deshacer</Button>}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
        {contact && (
          <TabsContent value="ct" className="grid gap-2 pt-3 text-sm">
            {[["Teléfono", contact.telefono], ["Correo", contact.email], ["Documento", contact.doc && `${contact.doc_tipo} ${contact.doc}`], ["Dirección", [toAddress(contact).dir, contact.ciudad].filter(Boolean).join(", ")], ["Relación", contact.relacion], ["Notas", contact.notas]].map(([l, v]) => (
              <div key={l as string} className="flex justify-between gap-4 border-b border-dotted py-1.5"><span className="text-muted-foreground">{l}</span><span className="text-right">{v || "Sin registrar"}</span></div>
            ))}
          </TabsContent>
        )}
      </Tabs>

      <PayLoanDialog loan={paying ? loan : null} name={nm} onOpenChange={(o) => !o && setPaying(false)} />
      {remind && <ReminderDialog open={remind} onOpenChange={setRemind} engine={e} concepto={loan.concepto} contact={contact} />}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>¿Eliminar {isC ? "préstamo" : "deuda"}?</AlertDialogTitle><AlertDialogDescription>Se borrará con todo su historial de pagos. Podrás deshacerlo durante unos segundos.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-danger text-white hover:bg-danger/90" onClick={del}>Eliminar</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

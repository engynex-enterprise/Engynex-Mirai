"use client"

import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CalendarClock, PiggyBank, Plus, Siren, Umbrella } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { PageHeader } from "@/components/mirai/page-header"
import { Money } from "@/components/mirai/money"
import { MoneyInput } from "@/components/mirai/money-input"
import { StatusPill } from "@/components/mirai/status-pill"
import { EmptyState } from "@/components/mirai/empty-state"
import { EntityLogo } from "@/components/mirai/entity-logo"
import { IconAction } from "@/components/mirai/list-row"
import { DataTable } from "@/components/mirai/data-table"
import { SubmitButton } from "@/components/mirai/submit-button"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useBookId, useCanEdit } from "@/components/app/app-context"
import { invalidateBook, useList, useSoftDelete } from "@/hooks/use-book-data"
import { useNewParam } from "@/hooks/use-new-param"
import { createClient } from "@/utils/supabase/client"
import { aporteFondoSugerido, fijoStatus, gastosBasicos, imprevistos, liquidez, metaFondo, metaPlan, payDays, type FixedExpenseIn } from "@/lib/domain"
import { fmtDate, fmtMoney, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Row } from "@/lib/supabase/tables"
import { useBookData } from "@/features/book/use-book-data"
import { useCategories, useIncomeCategories } from "@/features/catalogs/hooks"
import { PayFixedDialog } from "@/features/fixed/pay-fixed-dialog"
import { FixedForm, type FixedRow } from "@/features/fixed/fixed-form"
import { AporteDialog, FundDialog, GoalDialog, type AporteTarget } from "./goal-dialogs"

type G = Row<"goals">

function AporteRow({ fixed, today, onPay, onEdit, onNew, sugerido, label }: { fixed: FixedRow | undefined; today: string; onPay: (f: FixedRow) => void; onEdit: () => void; onNew: () => void; sugerido: string; label: string }) {
  if (!fixed) return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3 text-sm">
      <CalendarClock className="size-5 text-brand" />
      <span className="flex-1">Te lo recordamos {sugerido} y queda en tus gastos fijos para que no se te olvide.</span>
      <Button variant="soft" size="sm" onClick={onNew}>Programar un aporte fijo</Button>
    </div>
  )
  const st = fijoStatus(fixed as unknown as FixedExpenseIn, today)
  const pend = st.venc[0]
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-brand-soft p-3 text-sm">
      <CalendarClock className="size-5 text-brand" />
      <span className="grid flex-1">
        <b>Aporte programado: {fmtMoney(Number(fixed.valor))} {fixed.frec === "quincenal" ? "cada quincena" : "cada mes"}</b>
        <span className="text-muted-foreground">{pend ? <span className="text-danger">Pendiente desde {fmtDate(pend.due)}</span> : st.prox ? `Próximo: ${fmtDate(st.prox.due)}` : ""} · llevas {fixed.payments.length} aporte{fixed.payments.length === 1 ? "" : "s"} {label}</span>
      </span>
      {(pend || st.prox) && <Button size="sm" onClick={() => onPay(fixed)}>Ya aporté</Button>}
      <IconAction a={{ label: "Editar aporte", tip: "Cambiar el aporte programado", icon: "pencil", onClick: onEdit }} />
    </div>
  )
}

export function GoalsView() {
  const bookId = useBookId()
  const canEdit = useCanEdit()
  const qc = useQueryClient()
  const today = todayISO()
  const [nuevo, setNuevo] = useNewParam()
  const [editing, setEditing] = useState<Row<"goals"> | null>(null)
  const [fund, setFund] = useState<"guardar" | "usar" | null>(null)
  const [aporte, setAporte] = useState<AporteTarget | null>(null)
  const [paying, setPaying] = useState<FixedRow | null>(null)
  const [resched, setResched] = useState<FixedRow | null>(null)
  const [abono, setAbono] = useState<Record<string, number>>({})
  const [abonando, setAbonando] = useState<string | null>(null)
  const { data: book, isPending } = useBookData()
  const { data: cats = [] } = useCategories()
  const { data: incCats = [] } = useIncomeCategories()
  const { data: movs = [] } = useList("fund_movements", { order: { column: "fecha", ascending: false } })
  const { data: ef } = useQuery({ queryKey: ["b", bookId, "emergency_funds"], queryFn: async () => (await createClient().from("emergency_funds").select("*").eq("book_id", bookId).maybeSingle()).data })
  const del = useSoftDelete("goals", "Meta eliminada")

  const d = useMemo(() => {
    if (!book) return null
    const bas = gastosBasicos(book, today)
    const meta = metaFondo(bas, book.settings.emerg_meta)
    const liq = liquidez(book.assets, book.investments, book.settings.trm, today)
    const pd0 = payDays(book.incomes, incCats as never)
    const pd = { ...pd0, txt: pd0.txt || "cada mes el día 30" }
    const imp = imprevistos(book.expenses, cats.find((c) => c.nombre === "Imprevistos")?.id, today)
    const fixed = book.fixedExpenses as unknown as FixedRow[]
    return { bas, meta, liq, pd, imp, fondoFijo: fixed.find((f) => f.link_type === "fondo"), metaFijo: (id: string) => fixed.find((f) => f.link_type === "meta" && f.link_id === id) }
  }, [book, today, incCats, cats])
  if (isPending || !book || !d) return <PageSkeleton kpis={0} />
  const saldo = Number(ef?.saldo ?? 0)
  const tiene = ef?.activo ? saldo : d.liq
  const falta = Math.max(0, d.meta - tiene)
  const meses = d.bas ? tiene / d.bas : 0
  const goals = book.goals as unknown as Row<"goals">[]

  const planOf = (g: G) => metaPlan({ objetivo: Number(g.objetivo), ahorrado: Number(g.ahorrado), fecha: g.fecha }, today)
  const abonar = async (g: Row<"goals">) => {
    const v = abono[g.id]
    if (!v) return toast.error("Escribe cuánto guardaste")
    setAbonando(g.id)
    const { error } = await createClient().from("goals").update({ ahorrado: Number(g.ahorrado) + v }).eq("id", g.id)
    setAbonando(null)
    if (error) return toast.error("No se pudo abonar", { description: error.message })
    toast.success("¡Bien! Abono registrado", { description: `Llevas ${fmtMoney(Number(g.ahorrado) + v)} de ${fmtMoney(Number(g.objetivo))}.` })
    setAbono((a) => ({ ...a, [g.id]: 0 }))
    invalidateBook(qc, bookId, "goals")
  }

  return (
    <div className="grid gap-6">
      <PageHeader id="metas" description="Ponle nombre y fecha a lo que quieres lograr y te decimos cuánto guardar cada mes." actions={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Nueva meta</Button>} />

      <Card className="shadow-card ring-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Umbrella className="size-5 text-brand" /> Fondo de emergencia</CardTitle>
          <CardAction><StatusPill tone={!d.bas ? "gray" : meses >= book.settings.emerg_meta ? "pagado" : meses >= 1 ? "porVencer" : "vencido"}>{d.bas ? `${meses.toFixed(1).replace(".", ",")} meses cubiertos` : "Faltan datos"}</StatusPill></CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-sm text-muted-foreground">Es un colchón para imprevistos (perder el trabajo, una enfermedad, un daño en la casa). Lo recomendado es tener guardados {book.settings.emerg_meta} meses de tus gastos básicos.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">{ef?.activo ? "Tienes guardado en el fondo" : "Tienes disponible (todas tus cuentas)"}</p><Money value={tiene} className="text-lg font-semibold" /></div>
            <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">Meta ({book.settings.emerg_meta} meses)</p><Money value={d.meta} className="text-lg font-semibold" /></div>
            <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">Te falta</p><Money value={falta} className={cn("text-lg font-semibold", falta > 0 ? "text-warning" : "text-success")} /></div>
          </div>
          <Progress value={d.meta ? Math.min(100, (tiene / d.meta) * 100) : 0} className="h-2.5 [&>div]:bg-lime" />
          <div className="grid gap-3 rounded-lg border p-4">
            <p className="font-semibold">{ef?.activo ? "Tu bolsillo de emergencias" : "Separa un bolsillo para imprevistos"}</p>
            <p className="text-sm text-muted-foreground">Ten el dinero de emergencias aparte (un bolsillo de Nequi, una cuenta de ahorros) para no gastarlo sin darte cuenta. Cuando ocurra un imprevisto, regístralo aquí y sale del fondo.</p>
            {canEdit && <div className="flex flex-wrap gap-2"><Button onClick={() => setFund("guardar")}><PiggyBank /> Guardar dinero</Button>{saldo > 0 && <Button variant="outline" onClick={() => setFund("usar")}><Siren /> Usar para un imprevisto</Button>}</div>}
            <AporteRow fixed={d.fondoFijo} today={today} onPay={setPaying} onEdit={() => setAporte({ t: "fondo" })} onNew={() => setAporte({ t: "fondo" })} sugerido={d.pd.txt} label="al fondo" />
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">Imprevistos este mes</p><Money value={d.imp.mes} className="font-semibold" /></div>
              <div className="rounded-md bg-muted p-3"><p className="text-xs text-muted-foreground">Imprevistos en {today.slice(0, 4)}</p><Money value={d.imp.ano} className="font-semibold" /></div>
            </div>
            {movs.length > 0 && (
              <ul className="grid divide-y text-sm">
                {movs.slice(0, 6).map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2 py-2">
                    <span className="grid"><span>{m.nota || (m.tipo === "guardar" ? "Guardaste" : "Imprevisto")}</span><span className="text-xs text-muted-foreground">{fmtDate(m.fecha)}</span></span>
                    <span className={cn("font-semibold", m.tipo === "guardar" ? "text-success" : "text-danger")}>{m.tipo === "guardar" ? "+" : "−"}<Money value={Number(m.valor)} /></span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardContent>
      </Card>

      <DataTable<G>
        bare title="Tus metas" info="Lo que quieres lograr. Te decimos cuánto guardar cada mes para llegar a tiempo."
        data={goals} rowKey={(g) => g.id} noun={["meta", "metas"]} exportName="metas" listClassName="grid gap-6 lg:grid-cols-2"
        total={{ value: (g) => Math.max(0, Number(g.objetivo) - Number(g.ahorrado)), label: "te falta" }}
        columns={[
          { id: "nombre", header: "Meta", sort: (g) => g.nombre.toLowerCase(), csv: (g) => g.nombre },
          { id: "avance", header: "Avance", sort: (g) => planOf(g).progreso, csv: (g) => `${Math.round(planOf(g).progreso * 100)} %` },
          { id: "fecha", header: "Fecha", sort: (g) => g.fecha ?? "9999", csv: (g) => g.fecha },
          { id: "objetivo", header: "Necesitas", sort: (g) => Number(g.objetivo), csv: (g) => Number(g.objetivo) },
          { id: "ahorrado", header: "Llevas", csv: (g) => Number(g.ahorrado) },
          { id: "mensual", header: "Guarda al mes", sort: (g) => planOf(g).sugerido, csv: (g) => Math.round(planOf(g).sugerido) },
        ]}
        search={{ placeholder: "Buscar meta", text: (g) => g.nombre }}
        views={[{ id: "todas", label: "Todas" }, { id: "curso", label: "En curso", match: (g) => planOf(g).falta > 0 }, { id: "logradas", label: "Logradas", match: (g) => planOf(g).falta <= 0, hint: "Ya llegaste a lo que necesitabas." }]}
        filters={[{ id: "fecha", label: "Fecha de la meta", kind: "dates", value: (g) => g.fecha }, { id: "objetivo", label: "Valor de la meta", kind: "range", money: true, value: (g) => Number(g.objetivo) }]}
        emptyState={<Card className="shadow-card ring-0"><EmptyState iso="metas" title="Aún no tienes metas" description="Un viaje, la cuota inicial de la casa o el estudio de tus hijos." action={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Crear meta</Button>} /></Card>}
        item={(g) => {
          const p = planOf(g)
          const lograda = p.falta <= 0
          return (
            <li key={g.id} className="grid">
              <Card className="h-full gap-4 p-5 shadow-card ring-0">
                <div className="flex items-center gap-3">
                  <EntityLogo icon={g.icon} seed={g.id} tone={lograda ? "success" : undefined} size={44} />
                  <div className="grid min-w-0 flex-1"><b className="truncate text-lg">{g.nombre}</b><span className="text-sm text-muted-foreground"><Money value={Number(g.ahorrado)} /> de <Money value={Number(g.objetivo)} /></span></div>
                  {lograda && <StatusPill tone="pagado" check hint="Ya juntaste lo que necesitabas.">Lograda</StatusPill>}
                  {canEdit && <><IconAction a={{ label: `Editar ${g.nombre}`, tip: "Editar", icon: "pencil", onClick: () => setEditing(g) }} /><IconAction a={{ label: `Eliminar ${g.nombre}`, tip: "Eliminar", icon: "trash-2", destructive: true, onClick: () => del.mutate(g) }} /></>}
                </div>
                <Progress value={Math.min(100, p.progreso * 100)} className="h-2.5 [&>div]:bg-navy dark:[&>div]:bg-lime" aria-label={`${Math.round(p.progreso * 100)} % de la meta`} />
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">Avance</p><b>{Math.round(p.progreso * 100)} %</b></div>
                  <div className="rounded-md bg-muted p-2"><p className="text-xs text-muted-foreground">Fecha</p><b>{fmtDate(g.fecha)}</b></div>
                  <div className={cn("rounded-md p-2", lograda ? "bg-success-soft" : "bg-muted")}><p className="text-xs text-muted-foreground">{lograda ? "Estado" : "Guarda al mes"}</p><b>{lograda ? "¡Lograda!" : fmtMoney(p.sugerido)}</b></div>
                </div>
                {!lograda && <AporteRow fixed={d.metaFijo(g.id)} today={today} onPay={setPaying} onEdit={() => setAporte({ t: "meta", id: g.id, nombre: g.nombre, mensual: p.mensual })} onNew={() => setAporte({ t: "meta", id: g.id, nombre: g.nombre, mensual: p.mensual })} sugerido={d.pd.txt} label="a esta meta" />}
                {canEdit && !lograda && (
                  <div className="flex items-end gap-2">
                    <div className="flex-1"><MoneyInput value={abono[g.id] ?? 0} onChange={(v) => setAbono((a) => ({ ...a, [g.id]: v }))} placeholder="¿Cuánto guardaste?" aria-label={`Abono a ${g.nombre}`} /></div>
                    <SubmitButton className="h-11" disabled={!(abono[g.id] > 0)} loading={abonando === g.id} loadingText="Abonando…" onClick={() => abonar(g)}>Abonar</SubmitButton>
                  </div>
                )}
              </Card>
            </li>
          )
        }}
      />

      <GoalDialog open={nuevo || !!editing} onOpenChange={(o) => { if (!o) { setNuevo(false); setEditing(null) } }} goal={editing} />
      <FundDialog tipo={fund} onOpenChange={(o) => !o && setFund(null)} saldo={saldo} metaTxt={`Meta recomendada: ${book.settings.emerg_meta} meses de tus gastos básicos (${fmtMoney(d.meta)}).`} />
      <AporteDialog target={aporte} existing={aporte?.t === "fondo" ? d.fondoFijo ?? null : aporte?.t === "meta" ? d.metaFijo(aporte.id) ?? null : null} payDays={d.pd}
        sugerencia={aporte?.t === "meta" ? aporte.mensual : aporteFondoSugerido(d.bas)} onOpenChange={(o) => !o && setAporte(null)} />
      <PayFixedDialog fixed={paying} onOpenChange={(o) => !o && setPaying(null)} onReschedule={setResched} />
      <FixedForm open={!!resched} onOpenChange={(o) => !o && setResched(null)} fixed={resched} />
    </div>
  )
}

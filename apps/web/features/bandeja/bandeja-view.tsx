"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/mirai/page-header"
import { Money } from "@/components/mirai/money"
import { EmptyState } from "@/components/mirai/empty-state"
import { ListRow } from "@/components/mirai/list-row"
import { Segmented } from "@/components/mirai/choice-cards"
import { StatusPill } from "@/components/mirai/status-pill"
import { Tip } from "@/components/mirai/tip"
import { toast } from "@/components/mirai/toast"
import { DataTable, type DTColumn } from "@/components/mirai/data-table"
import { useBookId, useCanEdit } from "@/components/app/app-context"
import { invalidateBook, useSoftDelete } from "@/hooks/use-book-data"
import { useNewParam } from "@/hooks/use-new-param"
import { useBookData } from "@/features/book/use-book-data"
import { useIntegralExtras } from "@/features/balance/use-integral"
import { EstadoPill, MonthNav } from "@/features/balance/balance-parts"
import { MODULOS, periodosDelLibro, type Mov } from "@/lib/domain/flujo-integral"
import { moverRef, sePuedePagar, type PagoLote, type TipoBandeja } from "@/lib/domain/bandeja"
import type { PosibleDoble } from "@/lib/domain/dobles"
import { loanName } from "@/lib/domain"
import { fmtDate, todayISO } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"
import { useMembers, useProviders } from "@/features/catalogs/hooks"
import { PayFixedDialog } from "@/features/fixed/pay-fixed-dialog"
import { FixedForm, type FixedRow } from "@/features/fixed/fixed-form"
import { ChargeSubDialog } from "@/features/subscriptions/charge-sub-dialog"
import { SubscriptionForm } from "@/features/subscriptions/subscription-form"
import { cobroDe } from "@/features/subscriptions/cobro"
import { PayLoanDialog } from "@/features/loans/pay-loan-dialog"
import { PayCardForm } from "@/features/cards/card-forms"
import { ExpenseForm } from "@/features/expenses/expense-form"
import { linkExpenseFixed } from "@/features/expenses/commands"
import { useBandeja } from "./use-bandeja"
import { BandejaKpis, DesgloseCard, DoblesNotice, PresupuestoCard, TeAlcanzaCard } from "./bandeja-resumen"
import { MovDetalle, type Nombres } from "./mov-detalle"
import { AvisoDialog } from "./aviso-dialog"
import { PagoLoteDialog } from "./pago-lote"

/** Avisar tiene sentido en un pago con fecha (no en el presupuesto ni en lo que falta de una mesada). */
const sePuedeAvisar = (m: Mov) => m.estado !== "hecho" && (!!m.ref || m.modulo === "impuestos" || m.modulo === "calendario")
const ESTADO_TXT: Record<string, string> = { hecho: "Pagado", vencido: "Vencido", programado: "Programado", estimado: "Estimado" }
/** "" = sin agrupar; si no, el id de una opción de `groupings` de la tabla. */
type Agrupar = "" | "dia" | "modulo" | "cat" | "estado" | "medio" | "para" | "quien"

/**
 * Bandeja de gastos generales: todo lo que sale en un solo lugar (día a día, fijos, suscripciones, tarjetas, cuotas,
 * impuestos y mesadas). Sale de `flujoIntegral`, así que nada se cuenta dos veces y el total cuadra con el Balance.
 * Las cifras salen de @mirai/domain/bandeja (use-bandeja.ts); aquí solo se muestran y se conectan las acciones.
 */
export function BandejaView() {
  const today = todayISO()
  const bookId = useBookId()
  const qc = useQueryClient()
  const canEdit = useCanEdit()
  const { data: book, isPending } = useBookData()
  const { data: providers = [] } = useProviders()
  const { data: members = [] } = useMembers()
  const X = useIntegralExtras(book, today)
  const [tipo, setTipoRaw] = useState<TipoBandeja>("mes")
  const [ref, setRef] = useState(today)
  const [conAhorro, setConAhorro] = useState(false)
  const [agrupar, setAgrupar] = useState<Agrupar>("")
  const [detalle, setDetalle] = useState<Mov | null>(null)
  const [pagando, setPagando] = useState<Mov | null>(null)
  const [fechaDe, setFechaDe] = useState<Mov | null>(null)
  const [avisando, setAvisando] = useState<Mov | null>(null)
  const [editando, setEditando] = useState<Row<"expenses"> | null>(null)
  const [lote, setLote] = useState<Mov[] | null>(null)
  const [nuevo, setNuevo] = useNewParam()
  const [busyDoble, setBusyDoble] = useState<string | null>(null)
  const borrarGasto = useSoftDelete("expenses", "Gasto borrado")

  const d = useBandeja(book, X, today, tipo, ref, conAhorro)
  const movs = d?.movs ?? []
  // "Próximos 7 días" se lee mejor día por día.
  const setTipo = (t: TipoBandeja) => { setTipoRaw(t); setRef(today); if (t === "proximos") setAgrupar("dia") }

  // Nombres de a quién se le paga, con qué y quién (catálogos del libro y del hogar).
  const nombres: Nombres = useMemo(() => {
    const byId = <T extends { id?: string | null; nombre?: string | null }>(l: T[] | undefined) => new Map((l ?? []).map((x) => [x.id ?? "", x.nombre ?? ""]))
    const prov = byId(providers), cont = byId(book?.contacts), ent = byId(book?.entities), mem = byId(members)
    const met = new Map((book?.paymentMethods ?? []).map((x) => [x.id, x]))
    const act = byId(book?.assets as { id?: string; nombre?: string }[] | undefined)
    return {
      para: (m) => (m.providerId && prov.get(m.providerId)) || (m.contactId && cont.get(m.contactId)) || (m.entityId && ent.get(m.entityId)) || m.paraTxt || null,
      medio: (m) => (m.medioId && met.get(m.medioId)?.nombre) || null,
      cuenta: (m) => { const a = m.medioId ? met.get(m.medioId)?.asset_id : null; return (a && act.get(a)) || null },
      quien: (m) => (m.memberId && mem.get(m.memberId)) || null,
    }
  }, [providers, members, book])

  // Para pagar desde acá hace falta la fila original del módulo: es lo que esperan sus diálogos.
  const fila = <T extends { id?: string | null }>(xs: T[] | undefined, id: string | undefined) => (id ? (xs?.find((x) => x.id === id) ?? null) : null)
  const refP = pagando?.ref
  const prestamo = refP?.tabla === "loans" && book ? fila(book.loans, refP.id) : null
  const cerrar = (o: boolean) => { if (!o) setPagando(null) }
  const fijoDeFecha = fechaDe?.ref?.tabla === "fixed_expenses" && book ? (fila(book.fixedExpenses, fechaDe.ref.id) as unknown as FixedRow) : null
  const subDeFecha = fechaDe?.ref?.tabla === "subscriptions" && book ? (fila(book.subscriptions, fechaDe.ref.id) as unknown as Row<"subscriptions">) : null
  const avisoFijo = avisando?.ref?.tabla === "fixed_expenses" && book ? (fila(book.fixedExpenses, avisando.ref.id) as { aviso?: number | null } | null) : null
  const medioDe = (p: PagoLote) => {
    if (!book) return null
    const r = p.tipo === "fijo" ? fila(book.fixedExpenses, p.id) : p.tipo === "suscripcion" ? fila(book.subscriptions, p.id) : null
    return (r as { payment_method_id?: string | null } | null)?.payment_method_id ?? null
  }
  const abrir = (fn: (m: Mov) => void) => (m: Mov) => { setDetalle(null); fn(m) }
  const editarGasto = (m: Mov) => setEditando((book && m.ref?.tabla === "expenses" ? fila(book.expenses, m.ref.id) : null) as Row<"expenses"> | null)

  const enlazar = async (x: PosibleDoble) => {
    setBusyDoble(x.id)
    const { error } = await linkExpenseFixed({ p_expense: x.id, p_fixed: x.fixed.id, p_periodo: x.per })
    setBusyDoble(null)
    if (error) return toast.error("No se pudo enlazar", { description: error.message })
    toast.success("Gastos enlazados", { description: `«${x.descripcion}» quedó como el pago de «${x.fixed.nombre}»: ahora sale una sola vez.` })
    invalidateBook(qc, bookId, "fixed_expenses"); invalidateBook(qc, bookId, "expenses")
  }
  const borrarDoble = (x: PosibleDoble) => { const g = book && fila(book.expenses, x.id); if (g) borrarGasto.mutate(g as never) }

  const columns: DTColumn<Mov>[] = [
    { id: "fecha", header: "Fecha", sort: (mv) => mv.fecha, csv: (mv) => mv.fecha },
    { id: "concepto", header: "Concepto", sort: (mv) => mv.n.toLowerCase(), csv: (mv) => mv.n },
    { id: "modulo", header: "Tipo de gasto", sort: (mv) => MODULOS[mv.modulo].label, csv: (mv) => MODULOS[mv.modulo].label },
    { id: "categoria", header: "Categoría", sort: (mv) => mv.cat, csv: (mv) => mv.cat },
    { id: "para", header: "A quién", sort: (mv) => nombres.para(mv) ?? "", csv: (mv) => nombres.para(mv) ?? "" },
    { id: "medio", header: "Medio de pago", sort: (mv) => nombres.medio(mv) ?? "", csv: (mv) => nombres.medio(mv) ?? "" },
    { id: "quien", header: "¿Quién gastó?", csv: (mv) => nombres.quien(mv) ?? "Toda la familia" },
    { id: "estado", header: "Estado", csv: (mv) => (mv.supuesto ? "Por confirmar" : (ESTADO_TXT[mv.estado] ?? mv.estado)) },
    { id: "intereses", header: "Intereses", sort: (mv) => mv.interes ?? 0, csv: (mv) => Math.round(mv.interes ?? 0) },
    { id: "valor", header: "Valor", align: "right", sort: (mv) => mv.v, csv: (mv) => Math.round(mv.v) },
  ]
  // Opciones de un filtro con lo que aparece en la lista (y "Sin decir" si hay filas sin dato).
  const opciones = (f: (m: Mov) => string | null, sin: string) => {
    const vs = [...new Set(movs.map((m) => f(m) ?? ""))]
    return vs.sort((a, b) => (a ? (b ? a.localeCompare(b, "es") : -1) : 1)).map((v) => ({ value: v || "__none", label: v || sin }))
  }
  const igual = (f: (m: Mov) => string | null) => (m: Mov, v: string) => (v === "__none" ? !f(m) : f(m) === v)


  const periodos = [...(book ? periodosDelLibro(book) : [{ tipo: "mes" as const, label: "Mes completo" }]), { tipo: "proximos" as const, label: "Próximos 7 días" }]
  const enHoy = !d || (today >= d.P.a && today <= d.P.b)

  return (
    <div className="grid gap-6">
      <PageHeader id="gastos-todos" title="Todos los gastos"
        description="Todo lo que sale de tu bolsillo en un solo lugar: gastos del día a día, fijos, suscripciones, tarjetas, cuotas de deudas, impuestos y mesadas. Cada pago aparece una sola vez, aunque lo hayas registrado en dos sitios."
        actions={<Button variant="outline" asChild><Link href="/recordatorios">Ver en el calendario</Link></Button>} />

      {/* Periodo: los del Balance (según cómo te pagan) y "Próximos 7 días"; con las flechas vas a otro. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented value={tipo} onChange={(v) => setTipo(v as TipoBandeja)} items={periodos.map((p) => ({ value: p.tipo, label: p.label }))} />
        {tipo !== "proximos" && (
          <MonthNav ym={ref.slice(0, 7)} label={d?.titulo} onMove={(k) => setRef(moverRef(tipo, ref, k))}>
            {!enHoy && <Button variant="ghost" size="sm" onClick={() => setRef(today)}>Volver a hoy</Button>}
          </MonthNav>
        )}
      </div>

      <BandejaKpis d={d} loading={isPending} />

      {d && <DoblesNotice list={d.dobles} onEnlazar={enlazar} onBorrar={borrarDoble} busy={busyDoble} />}

      {d && (
        <div className="grid gap-6 lg:grid-cols-2">
          <TeAlcanzaCard t={d.alcanza} nombre={tipo === "mes" ? "este mes" : tipo === "proximos" ? "los próximos 7 días" : "este periodo"} />
          <DesgloseCard d={d} />
          <PresupuestoCard d={d} />
        </div>
      )}

      <DataTable<Mov>
        title="Movimientos"
        info="Gastos del día a día, fijos, suscripciones, tarjetas, cuotas de deudas, impuestos y mesadas, más un estimado de lo que te queda por gastar según tu presupuesto. El total es el mismo «Sale» del Balance."
        data={movs} loading={isPending} columns={columns} rowKey={(mv) => mv.id} noun={["movimiento", "movimientos"]} exportName="todos-los-gastos"
        total={{ value: (mv) => mv.v, label: "en total" }} initialSort={{ id: "fecha", dir: tipo === "proximos" ? "asc" : "desc" }}
        create={canEdit ? { label: "Agregar gasto", onClick: () => setNuevo(true) } : undefined}
        search={{ placeholder: "Buscar un gasto", text: (mv) => `${mv.n} ${mv.s} ${mv.cat} ${MODULOS[mv.modulo].label} ${nombres.para(mv) ?? ""} ${nombres.medio(mv) ?? ""}` }}
        bulk={canEdit ? [{ label: "Pagar seleccionados", onSelect: (rows) => setLote(rows) }] : undefined}
        grouping={agrupar} onGrouping={(v) => setAgrupar(v as Agrupar)}
        groupings={[
          { id: "dia", label: "Por día", by: (m) => m.fecha, title: (k) => (k === today ? `Hoy · ${fmtDate(k)}` : fmtDate(k, { long: true })) },
          { id: "modulo", label: "Por tipo de gasto", by: (m) => m.modulo, title: (k) => MODULOS[k as Mov["modulo"]].label },
          { id: "cat", label: "Por categoría", by: (m) => m.cat },
          { id: "estado", label: "Por estado", by: (m) => (m.supuesto ? "Por confirmar" : (ESTADO_TXT[m.estado] ?? m.estado)) },
          { id: "medio", label: "Por medio de pago", by: (m) => nombres.medio(m) ?? "Sin medio de pago" },
          { id: "para", label: "Por a quién le pagas", by: (m) => nombres.para(m) ?? "Sin decir" },
          { id: "quien", label: "Por quién gastó", by: (m) => nombres.quien(m) ?? "Toda la familia" },
        ]}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Tip label="Lo que guardas para tus metas o tu fondo de emergencia no es un gasto. Por eso no se suma, salvo que lo pidas.">
              <Button variant={conAhorro ? "default" : "outline"} className="h-10 rounded-lg" aria-pressed={conAhorro} onClick={() => setConAhorro(!conAhorro)}>
                {conAhorro ? "Incluye ahorro ✓" : "Incluir ahorro"}
              </Button>
            </Tip>
          </div>
        }
        views={[
          { id: "pagar", label: "Por pagar", match: (mv) => mv.estado !== "hecho" },
          { id: "pagados", label: "Pagados", match: (mv) => mv.estado === "hecho" },
          { id: "confirmar", label: "Por confirmar", match: (mv) => !!mv.supuesto, hint: "Su fecha ya pasó y no tienes registrado el pago. Mirai los cuenta como pagados; confírmalos para que las cifras queden exactas." },
          { id: "todo", label: "Todo el periodo" },
        ]}
        filters={[
          { id: "modulo", label: "Tipo de gasto", options: [...new Set(movs.map((mv) => mv.modulo))].map((k) => ({ value: k, label: MODULOS[k].label })), match: (mv, v) => mv.modulo === v },
          { id: "cat", label: "Categoría", options: [...new Set(movs.map((mv) => mv.cat))].sort().map((c) => ({ value: c, label: c })), match: (mv, v) => mv.cat === v },
          { id: "estado", label: "Estado", options: [{ value: "vencido", label: "Vencido" }, { value: "programado", label: "Programado" }, { value: "estimado", label: "Estimado" }, { value: "hecho", label: "Pagado" }], match: (mv, v) => mv.estado === v },
          { id: "para", label: "¿A quién le pagas?", options: opciones(nombres.para, "Sin decir"), match: igual(nombres.para) },
          { id: "medio", label: "Medio de pago", options: opciones(nombres.medio, "Sin decir"), match: igual(nombres.medio) },
          { id: "quien", label: "¿Quién gastó?", options: opciones(nombres.quien, "Toda la familia"), match: igual(nombres.quien) },
          { id: "marca", label: "Destacar", options: [{ value: "hormiga", label: "Gastos hormiga" }, { value: "intereses", label: "Con intereses" }, { value: "confirmar", label: "Por confirmar" }],
            match: (mv, v) => (v === "hormiga" ? !!d?.hormiga.has(mv.ref?.id ?? "") && mv.ref?.tabla === "expenses" : v === "intereses" ? (mv.interes ?? 0) > 0 : !!mv.supuesto) },
          { id: "fecha", label: "Fecha", kind: "dates", value: (mv) => mv.fecha },
          { id: "valor", label: "Valor", kind: "range", money: true, value: (mv) => mv.v },
        ]}
        emptyState={<EmptyState iso="gastos" title="Todavía no hay nada que mostrar" description="Cuando registres gastos, fijos, suscripciones o tarjetas, acá los ves todos juntos."
          action={canEdit ? <Button onClick={() => setNuevo(true)}>Agregar gasto</Button> : undefined} />}
        item={(mv, select) => {
          const para = nombres.para(mv)
          const hormiga = mv.ref?.tabla === "expenses" && !!d?.hormiga.has(mv.ref.id)
          return (
            <ListRow key={mv.id} icon={mv.icon} title={mv.n} select={select && { ...select, label: `Elegir ${mv.n}` }}
              subtitle={`${fmtDate(mv.fecha)} · ${mv.s}${para && !mv.n.includes(para) ? ` · ${para}` : ""}`}
              extra={mv.interes ? <span data-money>Intereses: <Money value={mv.interes} /></span> : undefined}
              badges={<><EstadoPill m={mv} />{hormiga && <StatusPill tone="warn" hint="Un gasto pequeño que se repite. Sumados, pesan.">Hormiga</StatusPill>}</>}
              value={<Money value={mv.v} className="font-bold" />}
              onClick={() => setDetalle(mv)}
              actions={[
                ...(canEdit && sePuedePagar(mv) ? [{ label: `${mv.supuesto ? "Confirmar el pago de" : "Pagar"} ${mv.n}`, tip: mv.supuesto ? "Confirmar el pago" : "Pagar", icon: "circle-check", inline: true, onClick: () => setPagando(mv), className: mv.estado === "vencido" ? "text-danger" : "text-success" }] : []),
                ...(canEdit && sePuedeAvisar(mv) ? [{ label: `Avisarme de ${mv.n}`, tip: "Avisarme antes", icon: "bell", onClick: () => setAvisando(mv) }] : []),
              ]} />
          )
        }}
      />

      <MovDetalle mov={detalle} onOpenChange={(o) => { if (!o) setDetalle(null) }} nombres={nombres} canEdit={canEdit}
        hormiga={!!detalle && detalle.ref?.tabla === "expenses" && !!d?.hormiga.has(detalle.ref.id)}
        onPagar={abrir(setPagando)} onFecha={abrir(setFechaDe)} onAvisar={abrir(setAvisando)} onEditar={abrir(editarGasto)} />

      {/* Cada fila abre el pago de su propio módulo: una sola ventana a la vez. */}
      <PayFixedDialog fixed={refP?.tabla === "fixed_expenses" && book ? (fila(book.fixedExpenses, refP.id) as never) : null} onOpenChange={cerrar}
        onReschedule={() => { const m = pagando; setPagando(null); setFechaDe(m) }} />
      <ChargeSubDialog cobro={refP?.tabla === "subscriptions" && book ? (() => { const s = fila(book.subscriptions, refP.id); return s ? cobroDe(s as never, book.expenses as never, book.settings.trm) : null })() : null} onOpenChange={cerrar} />
      <PayLoanDialog loan={prestamo as never} name={prestamo && book ? loanName(prestamo as never, book.contacts, book.entities) : ""} onOpenChange={cerrar} />
      <PayCardForm card={refP?.tabla === "credit_cards" && book ? (fila(book.creditCards, refP.id) as never) : null} onOpenChange={cerrar} />

      {/* Cambiar la fecha: el formulario del gasto fijo o de la suscripción (como «No tocaba pagar» en Fijos). */}
      <FixedForm open={!!fijoDeFecha} onOpenChange={(o) => { if (!o) setFechaDe(null) }} fixed={fijoDeFecha} />
      <SubscriptionForm open={!!subDeFecha} onOpenChange={(o) => { if (!o) setFechaDe(null) }} sub={subDeFecha} />

      <AvisoDialog mov={avisando} avisoActual={avisoFijo?.aviso ?? null} anticipo={+(book?.settings.anticipo ?? 2)} onOpenChange={(o) => { if (!o) setAvisando(null) }} />
      <PagoLoteDialog movs={lote} onOpenChange={(o) => { if (!o) setLote(null) }} medioDe={medioDe} />
      <ExpenseForm open={nuevo || !!editando} onOpenChange={(o) => { if (!o) { setNuevo(false); setEditando(null) } }} expense={editando} />
    </div>
  )
}

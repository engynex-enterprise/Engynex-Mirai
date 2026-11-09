"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Plus } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/mirai/page-header"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { StatusPill } from "@/components/mirai/status-pill"
import { EmptyState } from "@/components/mirai/empty-state"
import { EntityLogo } from "@/components/mirai/entity-logo"
import { ListRow } from "@/components/mirai/list-row"
import { DataTable, catalogMatch, catalogOptions, type DTColumn } from "@/components/mirai/data-table"
import { useBookId, useCanEdit } from "@/components/app/app-context"
import { invalidateBook, useSoftDelete } from "@/hooks/use-book-data"
import { useIdParam, useNewParam } from "@/hooks/use-new-param"
import { unpayFixedExpense } from "./commands"
import { FFREC, conv, estadoFijo, faltaEntre, finQuincena, fijoValor, fijosMes, fixedReparto, relTime, toDay, type EstadoDeFijo, type EstadoFijo, type FixedExpenseIn, type FixedStatus } from "@/lib/domain"
import { fmtDate, fmtMoney, todayISO } from "@/lib/format"
import { DUE_HINT, daysBetween } from "@/lib/list-helpers"
import { useBookData } from "@/features/book/use-book-data"
import { memberName, useCategories, useContacts, useMembers, usePaymentMethods, useProviders } from "@/features/catalogs/hooks"
import { FixedForm, type FixedRow } from "./fixed-form"
import { ExpenseForm } from "@/features/expenses/expense-form"
import type { Row } from "@/lib/supabase/tables"
import { PayFixedDialog } from "./pay-fixed-dialog"

type R = { f: FixedRow; st: FixedStatus; next: FixedStatus["prox"]; estado: EstadoFijo; fin: boolean; E: EstadoDeFijo }
const ESTADO_CSV: Record<EstadoFijo, string> = { vencido: "Vencido", pronto: "Por vencer", pendiente: "Pendiente", pagado: "Pagado este mes", luego: "Más adelante", aldia: "Al día", terminado: "Terminado" }
type Pago = { f: FixedRow; p: FixedRow["payments"][number] }

export function FixedView() {
  const bookId = useBookId()
  const canEdit = useCanEdit()
  const qc = useQueryClient()
  const today = todayISO()
  const [nuevo, setNuevo] = useNewParam()
  const [, setId] = useIdParam()
  const [editing, setEditing] = useState<FixedRow | null>(null)
  const [paying, setPaying] = useState<FixedRow | null>(null)
  // El gasto que salió de un pago (expense_id): se edita aquí, porque ya no sale en "Del día a día" (es de Fijos).
  const [editPago, setEditPago] = useState<Row<"expenses"> | null>(null)
  const { data: book, isPending } = useBookData()
  const { data: cats = [] } = useCategories()
  const { data: methods = [] } = usePaymentMethods()
  const { data: members = [] } = useMembers()
  const { data: providers = [] } = useProviders()
  const { data: contacts = [] } = useContacts()
  const del = useSoftDelete("fixed_expenses", "Gasto fijo eliminado")
  const fixed = (book?.fixedExpenses ?? []) as unknown as FixedRow[]
  const trm = book?.settings.trm ?? {}
  const anticipo = book?.settings.anticipo ?? 5
  const mes = today.slice(0, 7)

  // Sin useMemo: el React Compiler memoiza solo (con useMemo no podía conservar la memoización).
  // La etiqueta y el botón de pagar salen de una sola regla (estadoFijo): solo se ofrece pagar lo que toca.
  const rows: R[] = fixed.map((f) => {
    const E = estadoFijo(f as unknown as FixedExpenseIn, today, { anticipo, trm: book?.settings.trm })
    return { f, st: E.st, next: E.porPagar ?? E.proximo, estado: E.estado, fin: !!f.hasta && f.hasta < today, E }
  })
  const k = (() => {
    // Lo que falta del mes: periodos sin pagar completos (con abonos, solo lo que falta).
    const pend = rows.reduce((a, { st }) => a + faltaEntre(st.periods, `${mes}-01`, `${mes}-31`), 0)
    // Lo de esta quincena (incluye lo vencido del mes): la moto con $40.000 abonados de $75.000 → faltan $35.000.
    const quincena = rows.reduce((a, { st }) => a + faltaEntre(st.periods, `${mes}-01`, finQuincena(today, book?.settings.corte_q)), 0)
    const hayQuincenales = fixed.some((f) => f.frec === "quincenal")
    const pagado = rows.flatMap(({ f }) => f.payments.filter((p) => p.fecha.startsWith(mes))).reduce((a, p) => a + Number(p.valor), 0)
    const venc = rows.reduce((a, { st }) => a + st.venc.length, 0)
    return { total: fijosMes(fixed as unknown as FixedExpenseIn[], book?.settings.trm, today), pend, quincena, hayQuincenales, pagado, venc, pronto: rows.filter((r) => r.estado === "pronto").length }
  })()
  const gastoDe = (p: Pago["p"]) => ((p as { expense_id?: string | null }).expense_id ? ((book?.expenses ?? []).find((g) => g.id === (p as { expense_id?: string | null }).expense_id) as unknown as Row<"expenses"> | undefined) ?? null : null)
  const paidThisMonth: Pago[] = fixed.flatMap((f) => f.payments.filter((p) => p.fecha.startsWith(mes)).map((p) => ({ f, p }))).sort((a, b) => b.p.fecha.localeCompare(a.p.fecha))

  const unpay = async (paymentId: string) => {
    const { error } = await unpayFixedExpense({ p_payment: paymentId })
    if (error) return toast.error("No se pudo deshacer", { description: error.message })
    toast("Pago deshecho")
    invalidateBook(qc, bookId, "fixed_expenses"); invalidateBook(qc, bookId, "expenses")
  }

  const catOf = (f: FixedRow) => cats.find((c) => c.id === f.category_id)
  const provOf = (f: FixedRow) => providers.find((p) => p.id === f.provider_id)
  const pick = { cat: (r: R) => r.f.category_id, method: (r: R) => r.f.payment_method_id, prov: (r: R) => r.f.provider_id, contact: (r: R) => r.f.contact_id }
  const columns: DTColumn<R>[] = [
    { id: "nombre", header: "Nombre", sort: (r) => r.f.nombre.toLowerCase(), csv: (r) => r.f.nombre },
    { id: "proximo", header: "Próximo pago", sort: (r) => r.next?.due ?? "9999", csv: (r) => r.next?.due ?? "" },
    // Ordena en pesos (un fijo en USD convertido con la TRM): la columna no puede mezclar unidades.
    { id: "valor", header: "Valor", sort: (r) => conv(Number(r.f.valor), r.f.currency, trm), csv: (r) => Number(r.f.valor) },
    { id: "moneda", header: "Moneda", csv: (r) => r.f.currency },
    { id: "mensual", header: "Al mes", sort: (r) => r.st.mensual, csv: (r) => Math.round(r.st.mensual) },
    { id: "categoria", header: "Categoría", sort: (r) => catOf(r.f)?.nombre ?? "~", csv: (r) => catOf(r.f)?.nombre ?? "" },
    { id: "frec", header: "Frecuencia", csv: (r) => FFREC[r.f.frec] },
    { id: "pagadoa", header: "Pagado a", csv: (r) => pagadoA(r.f, providers, contacts) },
    { id: "medio", header: "Medio de pago", csv: (r) => methods.find((m) => m.id === r.f.payment_method_id)?.nombre ?? "" },
    { id: "estado", header: "Estado", csv: (r) => ESTADO_CSV[r.estado] },
  ]

  return (
    <div className="grid gap-6">
      <PageHeader id="fijos" description="Arriendo, servicios, administración, colegio… lo que pagas cada mes. Te avisamos antes de cada fecha y, al pagar, queda registrado en tus gastos."
        actions={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Agregar gasto fijo</Button>} />
      <KpiGrid cols={3}>
        <Kpi icon="house" tone="blue" label="Total al mes" loading={isPending} value={<Money value={k.total} />} sub={`${fixed.length} gasto${fixed.length === 1 ? "" : "s"} fijo${fixed.length === 1 ? "" : "s"}`}
          info="Lo que suman tus gastos fijos en un mes. Los bimestrales, trimestrales o anuales se reparten por mes." />
        <Kpi icon="hourglass" tone="amber" label="Falta pagar este mes" loading={isPending} value={<Money value={k.pend} />} sub={k.hayQuincenales ? <>De esta quincena: <Money value={k.quincena} /> · ya pagaste <Money value={k.pagado} /></> : <>Ya pagaste <Money value={k.pagado} /></>}
          info="Lo que te falta pagar de los gastos fijos de este mes. Si abonaste a un pago, solo cuenta lo que falta. «De esta quincena» es lo que vence hasta el corte de quincena (incluye lo vencido)." />
        <Kpi icon="circle-alert" tone={k.venc ? "red" : "green"} label="Vencidos" loading={isPending} value={k.venc} valueClassName={k.venc ? "text-danger" : "text-success"} sub={k.venc ? "Págalos cuanto antes" : k.pronto ? `${k.pronto} por vencer pronto` : "Todo al día"} />
      </KpiGrid>

      <DataTable<R>
        title="Tus gastos fijos" info="Lo que pagas cada mes o cada cierto tiempo. Toca uno para editarlo o usa el botón verde para registrar el pago."
        data={rows} loading={isPending} columns={columns} rowKey={(r) => r.f.id} noun={["gasto fijo", "gastos fijos"]} exportName="gastos-fijos"
        total={{ value: (r) => r.st.mensual, label: "suman al mes" }} initialSort={{ id: "proximo", dir: "asc" }}
        selectable
        groupings={[
          { id: "estado", label: "Por estado", by: (r) => ESTADO_CSV[r.estado] },
          { id: "cat", label: "Por categoría", by: (r) => catOf(r.f)?.nombre ?? "Sin categoría" },
          { id: "frec", label: "Por cada cuánto", by: (r) => FFREC[r.f.frec] ?? r.f.frec },
          { id: "medio", label: "Por medio de pago", by: (r) => methods.find((m) => m.id === r.f.payment_method_id)?.nombre ?? "Sin medio de pago" },
          { id: "para", label: "Por a quién le pagas", by: (r) => pagadoA(r.f, providers, contacts) || "Sin decir" },
        ]}
        search={{ placeholder: "Buscar gasto fijo", text: (r) => `${r.f.nombre} ${catOf(r.f)?.nombre ?? ""} ${pagadoA(r.f, providers, contacts)} ${r.f.referencia ?? ""} ${FFREC[r.f.frec]}` }}
        views={[
          { id: "todos", label: "Todos" },
          { id: "pend", label: "Pendientes este mes", match: (r) => (r.st.periods.some((p) => !p.completo && p.due.startsWith(mes)) || r.st.venc.length > 0) && !r.fin },
          { id: "venc", label: "Vencidos", match: (r) => r.estado === "vencido", hint: DUE_HINT.vencido },
          { id: "aldia", label: "Pagados este mes", match: (r) => r.E.pagadoMes, hint: "Lo que te tocaba pagar este mes ya está pagado completo." },
          { id: "fin", label: "Terminados", match: (r) => r.fin, hint: "Gastos fijos con fecha de fin que ya pasó: no te los volvemos a cobrar." },
        ]}
        filters={[
          { id: "cat", label: "Categoría", options: catalogOptions(rows, cats, pick.cat, "Sin categoría"), match: catalogMatch(pick.cat) },
          { id: "frec", label: "Frecuencia", options: Object.entries(FFREC).filter(([v]) => rows.some((r) => r.f.frec === v)).map(([value, label]) => ({ value, label })), match: (r, v) => r.f.frec === v },
          { id: "tipo", label: "Valor", options: [{ value: "fijo", label: "Siempre igual" }, { value: "var", label: "Varía según consumo" }], match: (r, v) => (v === "var") === !!r.f.variable },
          { id: "medio", label: "Medio de pago", options: catalogOptions(rows, methods, pick.method, "Sin medio de pago"), match: catalogMatch(pick.method) },
          { id: "prov", label: "Negocio", options: catalogOptions(rows, providers, pick.prov), match: catalogMatch(pick.prov) },
          { id: "contacto", label: "Persona", options: catalogOptions(rows, contacts, pick.contact), match: catalogMatch(pick.contact) },
          { id: "proximo", label: "Próximo pago", kind: "dates", value: (r) => r.next?.due },
          { id: "valor", label: "Valor", kind: "range", money: true, value: (r) => conv(Number(r.f.valor), r.f.currency, trm) },
        ]}
        emptyState={<EmptyState iso="fijos" title="Aún no tienes gastos fijos" description="Empieza por el arriendo y los servicios." action={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> Agregar gasto fijo</Button>} />}
        item={({ f, st, next, estado, fin, E }, select) => {
          const cat = catOf(f)
          const q = next?.per.endsWith("Q1") ? " (1ª quinc.)" : next?.per.endsWith("Q2") ? " (2ª quinc.)" : ""
          const pill = estado === "vencido" ? <StatusPill tone="vencido" hint={`${DUE_HINT.vencido} Venció el ${fmtDate(st.venc[0].due)}${st.venc.length > 1 ? ` y hay ${st.venc.length} periodos sin pagar` : ""}.`}>Vencido hace {daysBetween(st.venc[0].due, today)} días</StatusPill>
            : estado === "pagado" ? <StatusPill tone="pagado" check hint={`Ya pagaste lo de este mes.${E.proximo ? ` Próximo pago: ${fmtDate(E.proximo.due)}.` : ""}`}>Pagado</StatusPill>
            : estado === "terminado" ? null
            : !next ? <StatusPill tone="pagado" check hint="No tiene pagos pendientes.">Al día</StatusPill>
            : <StatusPill tone={estado === "pronto" ? "porVencer" : "gray"} hint={`${DUE_HINT[estado === "pronto" ? "pronto" : "luego"]} Fecha: ${fmtDate(next.due)}.`}>{relTime(toDay(next.due), today)}</StatusPill>
          return (
            <ListRow key={f.id} icon={cat?.icon ?? "house"} select={select && { ...select, label: `Elegir ${f.nombre}` }}
              media={<EntityLogo name={f.nombre} provider={provOf(f)} icon={cat?.icon ?? "house"} seed={cat?.id} tone={estado === "vencido" ? "danger" : undefined} />}
              title={f.nombre}
              badges={<>
                {f.variable && <StatusPill tone="info" hint="El valor cambia cada mes (agua, luz, gas…). Mirai usa el promedio entre lo mínimo y lo máximo.">varía según consumo</StatusPill>}
                {f.link_type && <StatusPill tone="estimado" hint="Aporte programado a una meta o al fondo de emergencia.">aporte</StatusPill>}
                {next?.parcial && <StatusPill tone="warn" hint={`Abonaste ${fmtMoney(next.pagado)} de ${fmtMoney(next.pagado + next.falta)} a ${next.per.endsWith("Q1") ? "la 1ª quincena" : next.per.endsWith("Q2") ? "la 2ª quincena" : "este periodo"}. Toca "Registrar pago" para pagar lo que falta.`}>faltan {fmtMoney(next.falta)}{next.per.endsWith("Q1") ? " de la 1ª quincena" : next.per.endsWith("Q2") ? " de la 2ª quincena" : ""}</StatusPill>}
                {f.hasta && <StatusPill tone={fin ? "gray" : "info"} hint={fin ? "Ya pasó la fecha de fin: no te lo volvemos a cobrar." : "Este gasto tiene fecha de fin."}>{fin ? "terminado" : `termina el ${fmtDate(f.hasta)}`}</StatusPill>}
                {pill}
              </>}
              subtitle={[cat?.nombre, FFREC[f.frec], next && `próximo: ${fmtDate(next.due)}${q}`, pagadoA(f, providers, contacts), f.referencia && `ref. ${f.referencia}`, paraQuien(f, members)].filter(Boolean).join(" · ")}
              value={f.variable && f.vmin ? <span className="grid text-right"><span className="font-bold"><Money value={Number(f.vmin)} currency={f.currency} short /> – <Money value={Number(f.vmax)} currency={f.currency} short /></span><span className="text-xs text-muted-foreground">promedio <Money value={Number(f.valor)} currency={f.currency} /></span></span> : fixedReparto(f).modo === "distinto" && f.frec === "quincenal"
                ? <span className="grid text-right"><Money value={next ? fijoValor(f, next.per) : Number(f.valor)} currency={f.currency} className="font-bold" /><span className="text-xs text-muted-foreground"><Money value={fijoValor(f, "Q1")} currency={f.currency} short /> + <Money value={fijoValor(f, "Q2")} currency={f.currency} short /> al mes</span></span>
                : <Money value={Number(f.valor)} currency={f.currency} className="font-bold" />}
              onClick={canEdit ? () => setEditing(f) : undefined}
              actions={canEdit ? [
                ...(E.porPagar ? [{ label: `Pagar ${f.nombre}`, tip: "Registrar el pago", icon: "circle-check", onClick: () => setPaying(f), className: estado === "vencido" ? "text-danger" : "text-success" }] : []),
                { label: `Editar ${f.nombre}`, tip: "Editar", icon: "pencil", onClick: () => setEditing(f) },
                { label: `Eliminar ${f.nombre}`, tip: "Eliminar", icon: "trash-2", onClick: () => del.mutate(f), destructive: true },
              ] : []} />
          )
        }}
      />

      <DataTable<Pago>
        title="Pagos registrados este mes" data={paidThisMonth} loading={isPending} rowKey={(x) => x.p.id} noun={["pago", "pagos"]} exportName={`pagos-fijos-${mes}`}
        total={{ value: (x) => Number(x.p.valor) }}
        columns={[
          { id: "fecha", header: "Fecha", sort: (x) => x.p.fecha, csv: (x) => x.p.fecha },
          { id: "nombre", header: "Gasto fijo", sort: (x) => x.f.nombre.toLowerCase(), csv: (x) => x.f.nombre },
          { id: "valor", header: "Valor", sort: (x) => Number(x.p.valor), csv: (x) => Number(x.p.valor) },
        ]}
        initialSort={{ id: "fecha", dir: "desc" }}
        emptyState={<p className="px-5 pb-6 text-sm text-muted-foreground sm:px-7">Aún no registras pagos este mes.</p>}
        item={({ f, p }) => {
          const m = methods.find((x) => x.id === p.payment_method_id)
          return (
            <ListRow key={p.id} icon="circle-check" media={<EntityLogo name={f.nombre} provider={provOf(f)} icon="circle-check" tone="success" />} title={f.nombre}
              subtitle={`${(p as { cierra?: boolean | null }).cierra === false ? "Abono el" : "Pagado el"} ${fmtDate(p.fecha)}${m ? ` · ${m.nombre}` : ""}`}
              value={<Money value={Number(p.valor)} className="font-bold" />}
              actions={canEdit ? [
                ...(gastoDe(p) ? [{ label: `Editar pago de ${f.nombre}`, tip: "Editar el pago (valor, fecha, medio…)", icon: "pencil", onClick: () => setEditPago(gastoDe(p)) }] : []),
                { label: "Deshacer pago", icon: "undo-2", onClick: () => unpay(p.id) },
              ] : []} />
          )
        }}
      />
      <FixedForm open={nuevo || !!editing} onOpenChange={(o) => { if (!o) { setNuevo(false); setEditing(null); setId(null) } }} fixed={editing} />
      <ExpenseForm open={!!editPago} onOpenChange={(o) => { if (!o) setEditPago(null) }} expense={editPago} />
      <PayFixedDialog fixed={paying} onOpenChange={(o) => !o && setPaying(null)} onReschedule={(f) => setEditing(f)} />
    </div>
  )
}

/** "para Ana" o "para Ana y Luis" (una o varias personas del gasto fijo); nada si es de toda la familia. */
function paraQuien(f: FixedRow, members: Parameters<typeof memberName>[1]) {
  const x = f as { member_ids?: string[] | null; member_id?: string | null }
  const ids = x.member_ids?.length ? x.member_ids : x.member_id ? [x.member_id] : []
  if (!ids.length) return null
  const n = ids.map((id) => memberName(id, members))
  return `para ${n.length > 1 ? `${n.slice(0, -1).join(", ")} y ${n[n.length - 1]}` : n[0]}`
}

/** A quién se le paga el fijo: el negocio (Proveedores) o la persona (Contactos). */
function pagadoA(f: FixedRow, providers: { id: string; nombre: string }[], contacts: { id: string; nombre: string }[]): string {
  if (f.provider_id) return providers.find((p) => p.id === f.provider_id)?.nombre ?? f.proveedor ?? ""
  if (f.contact_id) return contacts.find((c) => c.id === f.contact_id)?.nombre ?? "Persona eliminada"
  return f.proveedor ?? ""
}

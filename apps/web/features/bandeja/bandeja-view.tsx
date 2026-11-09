"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/mirai/page-header"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { EmptyState } from "@/components/mirai/empty-state"
import { ListRow } from "@/components/mirai/list-row"
import { Segmented } from "@/components/mirai/choice-cards"
import { DataTable, type DTColumn } from "@/components/mirai/data-table"
import { useBookData } from "@/features/book/use-book-data"
import { useIntegralExtras } from "@/features/balance/use-integral"
import { EstadoPill } from "@/features/balance/balance-parts"
import { MODULOS, flujoIntegral, periodo, periodosDelLibro, type Mov, type PeriodoOpcion } from "@/lib/domain/flujo-integral"
import { loanName } from "@/lib/domain"
import { fmtDate, todayISO } from "@/lib/format"
import { PayFixedDialog } from "@/features/fixed/pay-fixed-dialog"
import { ChargeSubDialog } from "@/features/subscriptions/charge-sub-dialog"
import { cobroDe } from "@/features/subscriptions/cobro"
import { PayLoanDialog } from "@/features/loans/pay-loan-dialog"
import { PayCardForm } from "@/features/cards/card-forms"

/** Lo que la bandeja cuenta como "sale": consumo y deudas. Ahorrar no es gastar, por eso va aparte. */
const GASTO = ["gasto", "deuda"]
const ESTADO_TXT: Record<string, string> = { hecho: "Pagado", vencido: "Vencido", programado: "Programado" }

/**
 * Bandeja de gastos generales: todo lo que sale en un solo lugar (día a día, fijos, suscripciones, tarjetas, cuotas,
 * impuestos y mesadas). Sale de `flujoIntegral`, así que nada se cuenta dos veces y el total cuadra con el Balance.
 */
export function BandejaView() {
  const today = todayISO()
  const router = useRouter()
  const { data: book, isPending } = useBookData()
  const X = useIntegralExtras(book, today)
  const [tipo, setTipo] = useState<PeriodoOpcion["tipo"]>("mes")
  const [conAhorro, setConAhorro] = useState(false)
  const [pagando, setPagando] = useState<Mov | null>(null)

  const [y, m] = today.split("-").map(Number)
  const P = book ? periodo(book, tipo, y, m - 1) : null
  const F = book && P ? flujoIntegral(book, P, today, X) : null
  const movs: Mov[] = (F?.movs ?? []).filter((mv) => mv.dir === "sale" && (GASTO.includes(mv.clase) || (conAhorro && mv.clase === "ahorro")))

  const suma = (f: (mv: Mov) => boolean) => movs.filter(f).reduce((a, mv) => a + mv.v, 0)
  const porPagar = suma((mv) => mv.estado !== "hecho")
  const vencido = suma((mv) => mv.estado === "vencido")
  const pagado = suma((mv) => mv.estado === "hecho")

  // Para pagar desde acá hace falta la fila original del módulo: es lo que esperan sus diálogos.
  const ref = pagando?.ref ?? null
  const fila = <T extends { id?: string | null }>(xs: T[] | undefined, id: string) => xs?.find((x) => x.id === id) ?? null
  const sePuedePagar = (mv: Mov) => mv.estado !== "hecho" && !!mv.ref && mv.ref.tabla !== "expenses"
  const cerrar = (o: boolean) => { if (!o) setPagando(null) }
  const prestamo = ref?.tabla === "loans" && book ? fila(book.loans, ref.id) : null

  const columns: DTColumn<Mov>[] = [
    { id: "fecha", header: "Fecha", sort: (mv) => mv.fecha, csv: (mv) => mv.fecha },
    { id: "concepto", header: "Concepto", sort: (mv) => mv.n.toLowerCase(), csv: (mv) => mv.n },
    { id: "modulo", header: "De dónde sale", sort: (mv) => MODULOS[mv.modulo].label, csv: (mv) => MODULOS[mv.modulo].label },
    { id: "categoria", header: "Categoría", sort: (mv) => mv.cat, csv: (mv) => mv.cat },
    { id: "estado", header: "Estado", csv: (mv) => ESTADO_TXT[mv.estado] ?? mv.estado },
    { id: "valor", header: "Valor", align: "right", sort: (mv) => mv.v, csv: (mv) => Math.round(mv.v) },
  ]

  return (
    <div className="grid gap-6">
      <PageHeader id="gastos-todos" title="Todos los gastos"
        description="Todo lo que sale de tu bolsillo en un solo lugar: los gastos del día a día, los fijos, las suscripciones, las tarjetas y las cuotas de tus deudas. Cada pago aparece una sola vez, aunque lo hayas registrado en dos sitios."
        actions={<Button variant="outline" asChild><Link href="/recordatorios">Verlos en el calendario</Link></Button>} />

      <KpiGrid cols={3}>
        <Kpi icon="hourglass" tone="amber" label="Falta por pagar" loading={isPending} value={<Money value={porPagar} />} sub="Lo vencido y lo que viene"
          info="Lo que todavía no has pagado en este periodo, sumando todos tus módulos. La plata que te prestan o que prestas no entra acá: eso no es un gasto." />
        <Kpi icon="circle-alert" tone={vencido ? "red" : "green"} label="Vencido" loading={isPending} value={<Money value={vencido} />}
          valueClassName={vencido ? "text-danger" : undefined} sub={vencido ? "Págalo cuanto antes" : "No tienes nada vencido"} />
        <Kpi icon="circle-check" tone="green" label="Ya pagaste" loading={isPending} value={<Money value={pagado} />} sub="En el periodo que estás viendo" />
      </KpiGrid>

      <DataTable<Mov>
        title="Todo lo que sale"
        info="Reunimos tus gastos del día a día, los fijos, las suscripciones, las tarjetas y las cuotas de tus deudas. El total es el mismo que ves en el Balance."
        data={movs} loading={isPending} columns={columns} rowKey={(mv) => mv.id} noun={["movimiento", "movimientos"]} exportName="todos-los-gastos"
        total={{ value: (mv) => mv.v, label: "en total" }} initialSort={{ id: "fecha", dir: "desc" }}
        search={{ placeholder: "Buscar un gasto", text: (mv) => `${mv.n} ${mv.s} ${mv.cat} ${MODULOS[mv.modulo].label}` }}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={tipo} onChange={(v) => setTipo(v as PeriodoOpcion["tipo"])} items={(book ? periodosDelLibro(book) : [{ tipo: "mes", label: "Mes completo" }]).map((p) => ({ value: p.tipo, label: p.label }))} />
            <Button variant={conAhorro ? "default" : "outline"} size="sm" onClick={() => setConAhorro(!conAhorro)}
              title="Los aportes a tus metas y al fondo de emergencia no son un gasto, por eso no se cuentan por defecto.">
              {conAhorro ? "Contando el ahorro" : "Sumar lo que ahorras"}
            </Button>
          </div>
        }
        views={[
          { id: "pagar", label: "Por pagar", match: (mv) => mv.estado !== "hecho" },
          { id: "pagados", label: "Pagados", match: (mv) => mv.estado === "hecho" },
          { id: "todo", label: "Todo el periodo" },
        ]}
        filters={[
          { id: "modulo", label: "De dónde sale", options: [...new Set(movs.map((mv) => mv.modulo))].map((k) => ({ value: k, label: MODULOS[k].label })), match: (mv, v) => mv.modulo === v },
          { id: "cat", label: "Categoría", options: [...new Set(movs.map((mv) => mv.cat))].sort().map((c) => ({ value: c, label: c })), match: (mv, v) => mv.cat === v },
          { id: "estado", label: "Estado", options: [{ value: "vencido", label: "Vencido" }, { value: "programado", label: "Programado" }, { value: "hecho", label: "Pagado" }], match: (mv, v) => mv.estado === v },
          { id: "fecha", label: "Fecha", kind: "dates", value: (mv) => mv.fecha },
          { id: "valor", label: "Valor", kind: "range", money: true, value: (mv) => mv.v },
        ]}
        emptyState={<EmptyState iso="gastos" title="Todavía no hay nada que mostrar" description="Cuando registres gastos, fijos, suscripciones o tarjetas, acá los ves todos juntos." />}
        item={(mv) => (
          <ListRow key={mv.id} icon={mv.icon} title={mv.n} subtitle={`${fmtDate(mv.fecha)} · ${mv.s}`}
            badges={<EstadoPill m={mv} />} value={<Money value={mv.v} className="font-bold" />}
            onClick={() => router.push(mv.href)}
            actions={sePuedePagar(mv)
              ? [{ label: `Pagar ${mv.n}`, tip: "Registrar el pago", icon: "circle-check", onClick: () => setPagando(mv), className: mv.estado === "vencido" ? "text-danger" : "text-success" }]
              : []} />
        )}
      />

      {/* Cada fila abre el pago de su propio módulo: una sola ventana a la vez. */}
      <PayFixedDialog fixed={ref?.tabla === "fixed_expenses" && book ? (fila(book.fixedExpenses, ref.id) as never) : null} onOpenChange={cerrar} onReschedule={() => setPagando(null)} />
      <ChargeSubDialog cobro={ref?.tabla === "subscriptions" && book ? (() => { const s = fila(book.subscriptions, ref.id); return s ? cobroDe(s as never, book.expenses as never, book.settings.trm) : null })() : null} onOpenChange={cerrar} />
      <PayLoanDialog loan={prestamo as never} name={prestamo && book ? loanName(prestamo as never, book.contacts, book.entities) : ""} onOpenChange={cerrar} />
      <PayCardForm card={ref?.tabla === "credit_cards" && book ? (fila(book.creditCards, ref.id) as never) : null} onOpenChange={cerrar} />
    </div>
  )
}

"use client"

// Pagar varios a la vez desde la bandeja: cada fila se registra con el comando de su módulo (el mismo que usan sus
// ventanas de pago), con lo que falta del pago, la fecha y el medio elegidos. Lo que no se paga desde aquí se explica.
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { SubmitButton } from "@/components/mirai/submit-button"
import { FormField } from "@/components/mirai/field"
import { DatePicker } from "@/components/mirai/date-picker"
import { Combobox } from "@/components/mirai/combobox"
import { Money } from "@/components/mirai/money"
import { toast } from "@/components/mirai/toast"
import { useBookId } from "@/components/app/app-context"
import { invalidateBook } from "@/hooks/use-book-data"
import { planPagoLote, type PagoLote, type PlanLote } from "@/lib/domain/bandeja"
import type { Mov } from "@/lib/domain/flujo-integral"
import { fmtMoney, todayISO } from "@/lib/format"
import { methodOptions, usePaymentMethods } from "@/features/catalogs/hooks"
import { payFixedExpense, paySubscription } from "@/features/fixed/commands"
import { payCreditCard } from "@/features/cards/commands"
import { payLoanApi } from "@/features/loans/commands"

const TIPO_TXT: Record<PagoLote["tipo"], string> = { fijo: "Gasto fijo", suscripcion: "Suscripción", tarjeta: "Tarjeta", prestamo: "Deuda" }
const qLabel = (per?: string) => (per?.endsWith("Q1") ? " (1ª quincena)" : per?.endsWith("Q2") ? " (2ª quincena)" : "")

/** Registra un pago con el comando de su módulo. `medio`: el elegido o, si es null, el de cada registro. */
async function registrar(p: PagoLote, fecha: string, medio: string | null, medioDe: (p: PagoLote) => string | null) {
  const m = medio ?? medioDe(p)
  if (p.tipo === "fijo") return payFixedExpense({ p_fixed: p.id, p_periodo: p.per!, p_fecha: fecha, p_valor: p.valor, p_medio: m ?? undefined, p_desc_suffix: qLabel(p.per) })
  if (p.tipo === "suscripcion") return paySubscription({ p_sub: p.id, p_fecha: fecha, p_valor: p.valor, p_medio: m ?? undefined })
  if (p.tipo === "tarjeta") return payCreditCard({ p_card: p.id, p_valor: p.valor, p_fecha: fecha, p_tipo: "otro", p_medio: m ?? undefined })
  return payLoanApi(p.id, { cuotas: p.cuotas ?? 1, fecha, payment_method_id: m })
}

export function PagoLoteDialog({ movs, onOpenChange, medioDe }: { movs: Mov[] | null; onOpenChange: (o: boolean) => void; medioDe: (p: PagoLote) => string | null }) {
  const plan = movs ? planPagoLote(movs) : null
  return (
    <ResponsiveDialog open={!!movs} onOpenChange={onOpenChange} title="Pagar varios a la vez"
      description="Registramos cada pago en su sección (fijos, suscripciones, tarjetas o deudas) por lo que te falta pagar de cada uno (si ya abonaste una parte, solo el resto).">
      {plan && <Body plan={plan} onOpenChange={onOpenChange} medioDe={medioDe} />}
    </ResponsiveDialog>
  )
}

function Body({ plan, onOpenChange, medioDe }: { plan: PlanLote; onOpenChange: (o: boolean) => void; medioDe: (p: PagoLote) => string | null }) {
  const bookId = useBookId()
  const qc = useQueryClient()
  const today = todayISO()
  const { data: methods = [] } = usePaymentMethods()
  const [fecha, setFecha] = useState(today)
  const [medio, setMedio] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const pagar = async () => {
    setBusy(true)
    const fallas: string[] = []
    // Uno detrás de otro: dos pagos de la misma cuenta a la vez pueden pisarse el saldo.
    for (const p of plan.pagar) {
      const { error } = await registrar(p, fecha, medio, medioDe)
      if (error) fallas.push(`${p.movs[0].n}: ${error.message}`)
    }
    setBusy(false)
    for (const t of ["fixed_expenses", "fixed_expense_payments", "subscriptions", "credit_cards", "card_payments", "loans", "loan_payments", "expenses"]) invalidateBook(qc, bookId, t)
    const ok = plan.pagar.length - fallas.length
    if (fallas.length) toast.error(ok ? `Registramos ${ok} de ${plan.pagar.length} pagos` : "No se pudo registrar ningún pago", { description: fallas.join(" · ") })
    else toast.success(ok === 1 ? "Pago registrado" : `${ok} pagos registrados`, { description: `Suman ${fmtMoney(plan.total)}.` })
    if (ok) onOpenChange(false)
  }

  return (
    <FieldGroup className="pb-2">
      {plan.pagar.length > 0 ? (
        <ul className="grid gap-1 rounded-lg border p-2 text-sm" data-money data-testid="lote-pagar">
          {plan.pagar.map((p) => (
            <li key={`${p.tipo}:${p.id}:${p.per ?? ""}`} className="flex items-center justify-between gap-3 px-1 py-1">
              <span className="min-w-0"><span className="block truncate font-medium">{p.tipo === "prestamo" && (p.cuotas ?? 1) > 1 ? `${p.cuotas} cuotas · ${p.movs[0].n.replace(/^Cuota \d+ · /, "")}` : p.movs[0].n}</span><span className="text-xs text-muted-foreground">{TIPO_TXT[p.tipo]}</span></span>
              <Money value={p.valor} className="shrink-0 font-semibold" />
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 border-t px-1 pt-2 font-bold"><span>Total</span><Money value={plan.total} /></li>
        </ul>
      ) : <p className="text-sm text-muted-foreground">Nada de lo que elegiste se puede pagar desde aquí.</p>}
      {plan.omitidos.length > 0 && (
        <div className="grid gap-1 text-sm">
          <p className="font-semibold">No los vamos a registrar:</p>
          <ul className="grid gap-0.5 text-muted-foreground" data-testid="lote-omitidos">
            {[...new Set(plan.omitidos.map((o) => o.razon))].map((r) => {
              const ns = [...new Set(plan.omitidos.filter((o) => o.razon === r).map((o) => o.mov.n))]
              return <li key={r}><b className="font-medium text-foreground">{r}:</b> {ns.slice(0, 4).join(", ")}{ns.length > 4 ? ` y ${ns.length - 4} más` : ""}</li>
            })}
          </ul>
        </div>
      )}
      {plan.pagar.length > 0 && (
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Fecha de los pagos" htmlFor="pl-fecha" hint="La misma para todos. Si pagaste en días distintos, regístralos uno por uno."><DatePicker id="pl-fecha" value={fecha} onChange={(v) => setFecha(v ?? today)} /></FormField>
          <FormField label="Medio de pago" htmlFor="pl-medio" hint="Si lo dejas vacío, cada pago usa el medio que ya tiene.">
            <Combobox id="pl-medio" value={medio} onChange={setMedio} options={methodOptions(methods)} placeholder="El de cada pago" />
          </FormField>
        </div>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
        {plan.pagar.length > 0 && <SubmitButton loading={busy} onClick={pagar}>Registrar {plan.pagar.length === 1 ? "el pago" : `${plan.pagar.length} pagos`}</SubmitButton>}
      </div>
    </FieldGroup>
  )
}

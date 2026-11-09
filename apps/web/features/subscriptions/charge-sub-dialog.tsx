"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { FieldGroup } from "@/components/ui/field"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { SubmitButton } from "@/components/mirai/submit-button"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { DatePicker } from "@/components/mirai/date-picker"
import { Combobox } from "@/components/mirai/combobox"
import { ChoiceCards } from "@/components/mirai/choice-cards"
import { toast } from "@/components/mirai/toast"
import { useBookId } from "@/components/app/app-context"
import { invalidateBook } from "@/hooks/use-book-data"
import { paySubscription } from "@/features/fixed/commands"
import { methodOptions, usePaymentMethods } from "@/features/catalogs/hooks"
import { kickAutomations } from "@/features/automations/runner"
import { fmtDate, fmtMoney, todayISO } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"

/** Lo que vale el cobro (en pesos y solo tu parte) y lo que ya abonaste a ese cobro. */
export type CobroSub = { sub: Row<"subscriptions">; esperado: number; abonado: number }

/**
 * Registrar el cobro de una suscripción, completo o en abonos. Si pagas menos de lo que falta, el cobro queda
 * pendiente con el resto y la suscripción NO pasa al siguiente (igual que un gasto fijo con abonos).
 */
export function ChargeSubDialog({ cobro, onOpenChange }: { cobro: CobroSub | null; onOpenChange: (o: boolean) => void }) {
  return (
    <ResponsiveDialog open={!!cobro} onOpenChange={onOpenChange} title={cobro ? `Registrar el cobro de ${cobro.sub.nombre}` : ""}
      description="Queda en tus gastos con su fecha. Si pagaste solo una parte, el cobro sigue pendiente con lo que falta.">
      {cobro && <Body cobro={cobro} onOpenChange={onOpenChange} />}
    </ResponsiveDialog>
  )
}

function Body({ cobro, onOpenChange }: { cobro: CobroSub; onOpenChange: (o: boolean) => void }) {
  const { sub: s, esperado, abonado } = cobro
  const bookId = useBookId()
  const qc = useQueryClient()
  const today = todayISO()
  const { data: methods = [] } = usePaymentMethods()
  const falta = Math.max(0, esperado - abonado)
  const [valor, setValor] = useState(falta || esperado)
  const [fecha, setFecha] = useState(s.proximo && s.proximo <= today ? s.proximo : today)
  const [medio, setMedio] = useState<string | null>(s.payment_method_id ?? methods[0]?.id ?? null)
  // Pagar menos de lo que falta: ¿abono (queda pendiente el resto) o "esta vez costó menos" (cobro cerrado)?
  const menos = valor > 0 && valor < falta - 1
  const [modo, setModo] = useState<"abono" | "completo">("abono")
  const [busy, setBusy] = useState(false)

  const registrar = async () => {
    if (!(valor > 0)) return toast.error("Escribe cuánto te cobraron")
    setBusy(true)
    const { data, error } = await paySubscription({ p_sub: s.id, p_fecha: fecha, p_valor: valor, p_medio: medio ?? undefined, p_parcial: menos && modo === "abono" })
    setBusy(false)
    if (error) return toast.error("No se pudo registrar", { description: error.message })
    kickAutomations()
    const r = (data ?? {}) as { proximo?: string; parcial?: boolean; falta?: number }
    invalidateBook(qc, bookId, "subscriptions")
    invalidateBook(qc, bookId, "expenses")
    if (r.parcial) toast.success("Abono registrado", { description: `${s.nombre}: abonaste ${fmtMoney(valor)}. Faltan ${fmtMoney(r.falta ?? 0)} de este cobro.` })
    else toast.success("Cobro registrado", { description: `Quedó en tus gastos. Próximo cobro: ${r.proximo ? fmtDate(r.proximo) : "—"}.` })
    onOpenChange(false)
  }

  return (
    <FieldGroup className="pb-2">
      {abonado > 0 && (
        <p className="rounded-lg bg-info-soft p-3 text-sm" data-money>
          De este cobro ya abonaste <b>{fmtMoney(abonado)}</b> de {fmtMoney(esperado)}: faltan <b>{fmtMoney(falta)}</b>.
        </p>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="¿Cuánto pagaste?" htmlFor="cs-valor" required hint={`El cobro es de ${fmtMoney(esperado)}${s.comparte > 1 ? " (tu parte)" : ""}.`}>
          <MoneyInput id="cs-valor" value={valor} onChange={setValor} />
        </FormField>
        <FormField label="Fecha del pago" htmlFor="cs-fecha"><DatePicker id="cs-fecha" value={fecha} onChange={(v) => setFecha(v ?? today)} /></FormField>
        <FormField label="Medio de pago" htmlFor="cs-medio"><Combobox id="cs-medio" value={medio} onChange={setMedio} options={methodOptions(methods)} /></FormField>
      </div>
      {menos && (
        <FormField label={`Pagas ${fmtMoney(valor)} de ${fmtMoney(falta)}. ¿Qué pasa con el resto?`} tip={false}>
          <ChoiceCards value={modo} onChange={(v) => setModo(v as typeof modo)} cols={2} items={[
            { value: "abono", label: "Es un abono", desc: `Faltan ${fmtMoney(falta - valor)}: el cobro sigue pendiente`, icon: "split", recommended: true },
            { value: "completo", label: "Pagué todo", desc: "Esta vez costó menos: pasa al siguiente cobro", icon: "circle-check" },
          ]} />
        </FormField>
      )}
      <SubmitButton disabled={!(valor > 0)} loading={busy} onClick={registrar}>{menos && modo === "abono" ? "Registrar abono" : "Registrar cobro"}</SubmitButton>
    </FieldGroup>
  )
}

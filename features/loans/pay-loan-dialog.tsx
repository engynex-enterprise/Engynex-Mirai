"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { DatePicker } from "@/components/mirai/date-picker"
import { ChoiceCards, Segmented } from "@/components/mirai/choice-cards"
import { Money } from "@/components/mirai/money"
import { useBookId } from "@/components/app/app-context"
import { invalidateBook } from "@/hooks/use-book-data"
import { createClient } from "@/utils/supabase/client"
import { loanEngine, type LoanIn } from "@/lib/domain"
import { fmtDate, fmtMoney, todayISO } from "@/lib/format"

export function PayLoanDialog({ loan, name, onOpenChange }: { loan: (LoanIn & { id: string }) | null; name: string; onOpenChange: (o: boolean) => void }) {
  return (
    <ResponsiveDialog open={!!loan} onOpenChange={onOpenChange} mdesc="pago" title={loan?.kind === "cobrar" ? `Registrar pago de ${name}` : `Registrar pago a ${name}`}>
      {loan && <Body loan={loan} onOpenChange={onOpenChange} />}
    </ResponsiveDialog>
  )
}

function Body({ loan, onOpenChange }: { loan: LoanIn & { id: string }; onOpenChange: (o: boolean) => void }) {
  const bookId = useBookId()
  const qc = useQueryClient()
  const today = todayISO()
  const isC = loan.kind === "cobrar"
  const e0 = loanEngine(loan, today)
  const [tipo, setTipo] = useState<"cuota" | "abono">("cuota")
  const [ncuotas, setN] = useState("1")
  const [valor, setValor] = useState(0)
  const [fecha, setFecha] = useState(today)
  const [modo, setModo] = useState<"plazo" | "cuota">(loan.sistema === "americano" ? "cuota" : "plazo")
  const [busy, setBusy] = useState(false)
  const maxN = Math.min(3, e0.plan.length)
  const n = Math.max(1, Math.min(+ncuotas || 1, e0.plan.length))

  const sim = tipo === "cuota"
    ? e0.plan.slice(0, n).map(() => ({ fecha, tipo: "cuota" as const, valor: 0 }))
    : valor > 0 ? [{ fecha, tipo: "abono" as const, valor: Math.min(valor, e0.saldo), modo }] : []
  const e1 = loanEngine({ ...loan, payments: [...loan.payments, ...sim] }, today)
  const paid = e1.pagado - e0.pagado

  const submit = async () => {
    if (tipo === "abono" && !valor) return toast.error("Escribe el valor del abono")
    setBusy(true)
    const rows: { book_id: string; loan_id: string; fecha: string; tipo: "cuota" | "abono"; valor: number; modo?: "plazo" | "cuota" }[] = tipo === "cuota"
      ? e0.plan.slice(0, n).map((p) => ({ book_id: bookId, loan_id: loan.id, fecha, tipo: "cuota" as const, valor: p.valor }))
      : [{ book_id: bookId, loan_id: loan.id, fecha, tipo: "abono" as const, valor: Math.min(valor, e0.saldo), modo }]
    const { error } = await createClient().from("loan_payments").insert(rows)
    setBusy(false)
    if (error) return toast.error("No se pudo registrar", { description: error.message })
    toast.success(tipo === "cuota" ? (n > 1 ? `${n} cuotas registradas` : "Cuota registrada") : "Abono registrado", { description: e1.done ? "¡Queda saldado!" : `${isC ? "Te debe" : "Debes"} ${fmtMoney(e1.saldo)}.` })
    invalidateBook(qc, bookId, "loans"); invalidateBook(qc, bookId, "loan_payments")
    onOpenChange(false)
  }

  if (e0.done) return <p className="py-4 text-muted-foreground">Este préstamo ya está saldado.</p>
  return (
    <FieldGroup className="pb-2">
      <p className="rounded-lg bg-muted p-3 text-sm">{isC ? "Te debe" : "Debes"} <b><Money value={e0.saldo} /></b>{e0.next && <> · próxima cuota <b><Money value={e0.next.valor} /></b> el {fmtDate(e0.next.fecha)}</>}</p>
      <ChoiceCards value={tipo} onChange={(v) => setTipo(v as typeof tipo)} items={[
        { value: "cuota", label: "Cuota completa", desc: "El valor de la cuota del plan", icon: "calendar-check" },
        { value: "abono", label: "Un abono", desc: "Un valor diferente a la cuota", icon: "piggy-bank" },
      ]} />
      {tipo === "cuota" ? (
        maxN > 1 && <FormField label="¿Cuántas cuotas?"><Segmented value={ncuotas} onChange={setN} items={Array.from({ length: maxN }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))} /></FormField>
      ) : (
        <>
          <FormField label="Valor del abono" htmlFor="pl-v" required><MoneyInput id="pl-v" value={valor} onChange={setValor} /></FormField>
          {loan.sistema !== "americano" && (
            <FormField label="¿Qué hacemos con el abono?">
              <ChoiceCards value={modo} onChange={(v) => setModo(v as typeof modo)} items={[
                { value: "plazo", label: "Terminar de pagar antes", desc: "La cuota sigue igual y quedan menos cuotas", recommended: true },
                { value: "cuota", label: "Que la cuota baje", desc: "Mismas fechas, cuota más pequeña" },
              ]} />
            </FormField>
          )}
        </>
      )}
      <FormField label="Fecha del pago" htmlFor="pl-f"><DatePicker id="pl-f" value={fecha} onChange={(v) => setFecha(v ?? today)} /></FormField>
      {sim.length > 0 && (
        <div className="rounded-lg border-l-4 border-lime bg-brand-soft p-3 text-sm" aria-live="polite">
          <p>Quedará así: <b><Money value={e1.saldo} /></b></p>
          <p className="text-muted-foreground">{tipo === "cuota" ? `Se registran ${fmtMoney(paid)}.` : `Abono de ${fmtMoney(Math.min(valor, e0.saldo))}.`} {e1.done ? "¡Queda saldado!" : `Faltarán ${e1.plan.length} cuotas de ${fmtMoney(e1.plan[0]?.valor ?? 0)}.`}</p>
        </div>
      )}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={submit} disabled={busy}>{busy && <Spinner />} Registrar pago</Button></div>
    </FieldGroup>
  )
}

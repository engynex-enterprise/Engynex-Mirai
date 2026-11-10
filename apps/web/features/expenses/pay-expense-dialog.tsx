"use client"

// Pagar un gasto que quedó por pagar o abonado (expenses.pagado, migración 0012): todo lo que falta o un abono. Lo usan
// Del día a día y Todos los gastos. Con un abono que no completa, lo demás sigue por pagar en la misma fecha.
import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/mirai/toast"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { Segmented } from "@/components/mirai/choice-cards"
import { Money } from "@/components/mirai/money"
import { useBookId } from "@/components/app/app-context"
import { invalidateBook } from "@/hooks/use-book-data"
import { apiUpdateRow } from "@/lib/api/book-rows"
import { abonarGasto, pagoDeGasto } from "@/lib/domain/gasto-pago"
import { fmtDate, fmtMoney } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"

export function PayExpenseDialog({ expense, onOpenChange }: { expense: Row<"expenses"> | null; onOpenChange: (o: boolean) => void }) {
  return (
    <ResponsiveDialog open={!!expense} onOpenChange={onOpenChange} title="Pagar este gasto" description="Márcalo como pagado o registra un abono: lo que falte queda por pagar.">
      {expense && <Cuerpo key={expense.id} g={expense} onDone={() => onOpenChange(false)} />}
    </ResponsiveDialog>
  )
}

function Cuerpo({ g, onDone }: { g: Row<"expenses">; onDone: () => void }) {
  const qc = useQueryClient()
  const bookId = useBookId()
  const e = pagoDeGasto(g)
  const [modo, setModo] = useState<"todo" | "abono">("todo")
  const [abono, setAbono] = useState(0)
  const [busy, setBusy] = useState(false)
  const nuevo = modo === "todo" ? null : abonarGasto(g, abono)
  const ok = modo === "todo" || (abono > 0 && abono <= e.falta + 0.5)
  const guardar = async () => {
    setBusy(true)
    const { error } = await apiUpdateRow(bookId, "expenses", g.id, { pagado: nuevo, ...(nuevo === null ? { pagar_el: null } : {}) })
    setBusy(false)
    if (error) return toast.error("No se pudo guardar el pago", { description: error.message })
    invalidateBook(qc, bookId, "expenses")
    toast.success(nuevo === null ? `«${g.descripcion}» quedó pagado` : `Abono registrado: faltan ${fmtMoney(+g.valor - nuevo)}`)
    onDone()
  }
  return (
    <div className="grid gap-5">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-secondary/60 p-4 text-sm" data-money>
        <dt className="text-muted-foreground">Gasto</dt><dd className="truncate text-right font-medium">{g.descripcion}</dd>
        <dt className="text-muted-foreground">Valor</dt><dd className="text-right"><Money value={+g.valor} /></dd>
        {e.pagado > 0 && <><dt className="text-muted-foreground">Ya pagaste</dt><dd className="text-right"><Money value={e.pagado} /></dd></>}
        <dt className="font-semibold">Falta</dt><dd className="text-right font-bold"><Money value={e.falta} /></dd>
        <dt className="text-muted-foreground">Para el</dt><dd className="text-right">{fmtDate(e.vence, { long: true })}</dd>
      </dl>
      <FormField label="¿Cuánto pagaste?" tip={false}>
        <Segmented value={modo} onChange={(v) => setModo(v as typeof modo)} items={[{ value: "todo", label: "Todo lo que falta" }, { value: "abono", label: "Un abono" }]} />
      </FormField>
      {modo === "abono" && (
        <FormField label="Valor del abono" htmlFor="pg-abono" required tip={false} error={abono > e.falta + 0.5 ? `Es más de lo que falta (${fmtMoney(e.falta)})` : undefined}
          hint={abono > 0 && abono <= e.falta ? `Quedarían faltando ${fmtMoney(e.falta - abono)}.` : undefined}>
          <MoneyInput id="pg-abono" value={abono} onChange={setAbono} />
        </FormField>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>Cancelar</Button>
        <Button disabled={!ok || busy} onClick={guardar}>{busy && <Spinner />} {modo === "todo" ? "Marcar como pagado" : "Registrar abono"}</Button>
      </div>
    </div>
  )
}

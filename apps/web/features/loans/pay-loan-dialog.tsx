"use client"

import { Camera } from "lucide-react"
import { readReceipt } from "@/features/ai/api"
import { useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { DatePicker } from "@/components/mirai/date-picker"
import { ChoiceCards, Segmented } from "@/components/mirai/choice-cards"
import { Money } from "@/components/mirai/money"
import { SubmitButton } from "@/components/mirai/submit-button"
import { useBookId } from "@/components/app/app-context"
import { invalidateBook } from "@/hooks/use-book-data"
import { payLoanApi } from "./commands"
import { loanEngine, type LoanIn } from "@/lib/domain"
import { fmtDate, fmtMoney, todayISO } from "@/lib/format"
import { Combobox } from "@/components/mirai/combobox"
import { methodOptions, usePaymentMethods, useSettings } from "@/features/catalogs/hooks"
import { kickAutomations } from "@/features/automations/runner"

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
  const { data: methods = [] } = usePaymentMethods()
  const { data: cfg } = useSettings()
  const defMedio = ((cfg?.defaults ?? {}) as { medio?: string }).medio
  // De qué medio salió la plata (o a cuál llegó, si te pagan): así la cuenta ligada a ese medio se mueve sola.
  const [medio, setMedio] = useState<string | null>(methods.find((m) => m.id === defMedio)?.id ?? null)
  const [ocr, setOcr] = useState<{ busy: boolean; msg: string | null }>({ busy: false, msg: null })
  const fotoRef = useRef<HTMLInputElement>(null)
  /** Lee el comprobante (ocrPago de la v4): si coincide con cuotas completas, las marca; si no, abono. */
  const onFoto = async (f?: File) => {
    if (!f) return
    setOcr({ busy: true, msg: "Leyendo el comprobante…" })
    const fd = new FormData(); fd.append("file", f)
    const r = await readReceipt(fd).catch((e) => ({ ok: false as const, msg: (e as Error).message }))
    if (!r.ok) return setOcr({ busy: false, msg: r.msg })
    if (!r.valor) return setOcr({ busy: false, msg: "No encontramos el valor en el comprobante." })
    if (r.fecha) setFecha(r.fecha)
    const cuota = e0.next?.valor ?? 0
    const k = cuota ? Math.round(r.valor / cuota) : 0
    if (k >= 1 && Math.abs(r.valor - k * cuota) <= Math.max(1000, cuota * 0.01)) {
      setTipo("cuota"); setN(String(Math.min(k, e0.plan.length)))
      setOcr({ busy: false, msg: `Pago de ${fmtMoney(r.valor)}${r.fecha ? ` del ${fmtDate(r.fecha)}` : ""}: coincide con ${k} cuota${k === 1 ? "" : "s"} completa${k === 1 ? "" : "s"}.` })
    } else {
      setTipo("abono"); setValor(r.valor)
      setOcr({ busy: false, msg: `Pago de ${fmtMoney(r.valor)}${r.fecha ? ` del ${fmtDate(r.fecha)}` : ""}. No coincide con la cuota (${fmtMoney(cuota)}), así que lo registramos como abono. Puedes cambiarlo.` })
    }
  }
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
    const { error } = await payLoanApi(loan.id, tipo === "cuota" ? { cuotas: n, fecha, payment_method_id: medio } : { abono: Math.min(valor, e0.saldo), modo, fecha, payment_method_id: medio })
    setBusy(false)
    if (error) return toast.error("No se pudo registrar", { description: error.message })
    kickAutomations()
    toast.success(tipo === "cuota" ? (n > 1 ? `${n} cuotas registradas` : "Cuota registrada") : "Abono registrado", { description: e1.done ? "¡Queda saldado!" : `${isC ? "Te debe" : "Debes"} ${fmtMoney(e1.saldo)}.` })
    invalidateBook(qc, bookId, "loans"); invalidateBook(qc, bookId, "loan_payments")
    onOpenChange(false)
  }

  if (e0.done) return <p className="py-4 text-muted-foreground">Este préstamo ya está saldado.</p>
  return (
    <FieldGroup className="pb-2">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3">
        <p className="flex-1 text-sm">¿Tienes el comprobante? La IA lee el valor y la fecha.</p>
        <Button type="button" size="sm" variant="soft" disabled={ocr.busy} onClick={() => fotoRef.current?.click()}>{ocr.busy ? <Spinner /> : <Camera />} Leer comprobante</Button>
        <input ref={fotoRef} type="file" hidden accept="image/*,application/pdf" capture="environment" onChange={(e) => { onFoto(e.target.files?.[0]); e.target.value = "" }} />
        {ocr.msg && <p className="w-full text-sm">{ocr.msg}</p>}
      </div>
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
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Fecha del pago" htmlFor="pl-f"><DatePicker id="pl-f" value={fecha} onChange={(v) => setFecha(v ?? today)} /></FormField>
        <FormField label={isC ? "¿A dónde te llegó la plata?" : "¿Con qué pagaste?"} htmlFor="pl-medio" tip={isC ? "La cuenta o el medio en que recibiste el pago (opcional)." : "La cuenta o el medio del que salió la plata (opcional)."}>
          <Combobox id="pl-medio" value={medio} onChange={setMedio} options={methodOptions(methods)} placeholder="Elige el medio" />
        </FormField>
      </div>
      {sim.length > 0 && (
        <div className="rounded-lg border-l-4 border-lime bg-brand-soft p-3 text-sm" aria-live="polite">
          <p>Quedará así: <b><Money value={e1.saldo} /></b></p>
          <p className="text-muted-foreground">{tipo === "cuota" ? `Se registran ${fmtMoney(paid)}.` : `Abono de ${fmtMoney(Math.min(valor, e0.saldo))}.`} {e1.done ? "¡Queda saldado!" : `Faltarán ${e1.plan.length} cuotas de ${fmtMoney(e1.plan[0]?.valor ?? 0)}.`}</p>
        </div>
      )}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><SubmitButton disabled={tipo === "abono" && !(valor > 0)} loading={busy} onClick={submit}>Registrar pago</SubmitButton></div>
    </FieldGroup>
  )
}

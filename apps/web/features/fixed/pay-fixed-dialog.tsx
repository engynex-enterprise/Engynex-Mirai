"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { SubmitButton } from "@/components/mirai/submit-button"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { DatePicker } from "@/components/mirai/date-picker"
import { Combobox } from "@/components/mirai/combobox"
import { ChoiceCards } from "@/components/mirai/choice-cards"
import { useBookId } from "@/components/app/app-context"
import { invalidateBook } from "@/hooks/use-book-data"
import { payFixedExpense } from "./commands"
import { fijoStatus, fijoValor, type FixedExpenseIn } from "@/lib/domain"
import { fmtDate, fmtMoney, todayISO } from "@/lib/format"
import { methodOptions, usePaymentMethods } from "@/features/catalogs/hooks"
import type { FixedRow } from "./fixed-form"

const qLabel = (per: string) => (per.endsWith("Q1") ? "1ª quincena" : per.endsWith("Q2") ? "2ª quincena" : "")

export function PayFixedDialog({ fixed, onOpenChange, onReschedule }: { fixed: FixedRow | null; onOpenChange: (o: boolean) => void; onReschedule: (f: FixedRow) => void }) {
  return (
    <ResponsiveDialog open={!!fixed} onOpenChange={onOpenChange} title={fixed ? `${fixed.link_type ? "Registrar" : "Pagar"} ${fixed.nombre}` : ""}
      description={fixed?.frec === "quincenal" ? "Elige la quincena que pagaste. Queda en tus gastos con su fecha." : "Registra el pago: queda en tus gastos y no te lo volvemos a recordar este periodo."}>
      {fixed && <PayBody fixed={fixed} onOpenChange={onOpenChange} onReschedule={onReschedule} />}
    </ResponsiveDialog>
  )
}

function PayBody({ fixed, onOpenChange, onReschedule }: { fixed: FixedRow; onOpenChange: (o: boolean) => void; onReschedule: (f: FixedRow) => void }) {
  const bookId = useBookId()
  const qc = useQueryClient()
  const today = todayISO()
  const { data: methods = [] } = usePaymentMethods()
  const st = fijoStatus({ ...fixed, valor: Number(fixed.valor), payments: fixed.payments.map((p) => ({ ...p, valor: Number(p.valor) })) } as FixedExpenseIn, today)
  const opts = [...st.venc, ...(st.prox ? [st.prox] : [])]
  // Lo que falta de un periodo: con abonos, el resto; si no, su valor (con reparto por quincena).
  const faltaDe = (p: string) => { const o = opts.find((x) => x.per === p); return o?.parcial ? o.falta : fijoValor(fixed, p) }
  const [per, setPer] = useState(opts[0]?.per ?? "")
  const [valor, setValor] = useState(fixed.variable && !opts[0]?.parcial ? 0 : faltaDe(opts[0]?.per ?? ""))
  // Con un valor distinto por quincena, el valor sugerido cambia con el periodo.
  const pickPer = (p: string) => { setPer(p); if (!fixed.variable || opts.find((x) => x.per === p)?.parcial) setValor(faltaDe(p)) }
  const sel = opts.find((x) => x.per === per)
  const falta = per ? faltaDe(per) : 0
  // Pagar menos de lo que falta: ¿abono (falta el resto) o "esta vez costó menos" (queda pagado)? En un fijo variable,
  // sin abonos antes, lo normal es que el valor cambie: por defecto queda pagado.
  const menos = !fixed.variable || sel?.parcial ? valor > 0 && valor < falta - 1 : false
  const [modoMenos, setModoMenos] = useState<"abono" | "completo">("abono")
  const [fecha, setFecha] = useState(today)
  const [medio, setMedio] = useState<string | null>(fixed.payment_method_id ?? methods[0]?.id ?? null)
  const [busy, setBusy] = useState(false)

  const pay = async () => {
    if (!valor) return toast.error("Escribe el valor que pagaste")
    setBusy(true)
    const q = qLabel(per)
    const { data, error } = await payFixedExpense({ p_fixed: fixed.id, p_periodo: per, p_fecha: fecha, p_valor: valor, p_medio: medio ?? undefined, p_desc_suffix: q ? ` (${q})` : "", ...(menos ? { p_cierra: modoMenos === "completo" } : {}) })
    setBusy(false)
    if (error) return toast.error("No se pudo registrar el pago", { description: error.message })
    const r = data as { ajuste: string | null; completo?: boolean; falta?: number; aporte: { t: string; v: number; saldo?: number; nombre?: string; ahorrado?: number; objetivo?: number } | null }
    if (r.aporte?.t === "fondo") toast.success("Aporte registrado", { description: `¡Bien! Guardaste ${fmtMoney(r.aporte.v)}. Tu fondo de emergencia tiene ${fmtMoney(r.aporte.saldo)}.` })
    else if (r.aporte?.t === "meta") toast.success("Aporte registrado", { description: `¡Bien! Sumaste ${fmtMoney(r.aporte.v)} a “${r.aporte.nombre}”. Llevas ${fmtMoney(r.aporte.ahorrado)} de ${fmtMoney(r.aporte.objetivo)} (${Math.round(((r.aporte.ahorrado ?? 0) / (r.aporte.objetivo || 1)) * 100)} %).` })
    else if (r.completo === false) toast.success("Abono registrado", { description: `${fixed.nombre}${q ? ` (${q})` : ""}: abonaste ${fmtMoney(valor)}. Faltan ${fmtMoney(r.falta ?? 0)} para este periodo.` })
    else {
      const extra = r.ajuste === "max" ? "Este pago superó tu máximo habitual; ajustamos el rango." : r.ajuste === "min" ? "Ajustamos el mínimo del rango." : ""
      toast[r.ajuste === "max" ? "warning" : "success"]("Pago registrado", { description: `${fixed.nombre}${q ? ` (${q})` : ""}: ${fmtMoney(valor)}. ${extra}` })
    }
    invalidateBook(qc, bookId, "fixed_expenses")
    invalidateBook(qc, bookId, "expenses")
    onOpenChange(false)
  }

  if (!opts.length) return <p className="py-4 text-muted-foreground">Este gasto fijo está al día. No hay periodos pendientes.</p>
  return (
    <FieldGroup className="pb-2">
      {!!fixed.referencia && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 text-sm">
          <span className="min-w-0"><span className="text-muted-foreground">Referencia: </span><span className="font-semibold break-all">{fixed.referencia}</span></span>
          <Button type="button" variant="outline" size="sm" onClick={() => { void navigator.clipboard.writeText(fixed.referencia); toast.success("Referencia copiada") }}>Copiar</Button>
        </div>
      )}
      <FormField label="¿Qué periodo pagas?" tip={false}>
        <ChoiceCards value={per} onChange={pickPer} cols={2} items={opts.map((p) => ({
          value: p.per, label: `${qLabel(p.per) ? qLabel(p.per) + " · " : ""}${fmtDate(p.due)}`, desc: p.parcial ? `Abonaste ${fmtMoney(p.pagado)} · faltan ${fmtMoney(p.falta)}` : p.due < today ? "Vencido" : "Pendiente", icon: p.parcial ? "split" : p.due < today ? "circle-alert" : "calendar-clock",
        }))} />
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Valor pagado" htmlFor="pf-valor" required hint={fixed.variable && fixed.vmin ? `Normalmente pagas entre ${fmtMoney(Number(fixed.vmin))} y ${fmtMoney(Number(fixed.vmax))}. Escribe el valor de la factura.` : undefined}>
          <MoneyInput id="pf-valor" value={valor} onChange={setValor} placeholder={fixed.variable ? new Intl.NumberFormat("es-CO").format(Number(fixed.valor)) : "0"} />
        </FormField>
        <FormField label="Fecha del pago" htmlFor="pf-fecha"><DatePicker id="pf-fecha" value={fecha} onChange={(v) => setFecha(v ?? today)} /></FormField>
        <FormField label="Medio de pago" htmlFor="pf-medio"><Combobox id="pf-medio" value={medio} onChange={setMedio} options={methodOptions(methods)} /></FormField>
      </div>
      {menos && (
        <FormField label={`Pagas ${fmtMoney(valor)} de ${fmtMoney(falta)}. ¿Qué pasa con el resto?`} tip={false}>
          <ChoiceCards value={modoMenos} onChange={(v) => setModoMenos(v as typeof modoMenos)} cols={2} items={[
            { value: "abono", label: "Es un abono", desc: `Faltan ${fmtMoney(falta - valor)}: queda pendiente en este periodo`, icon: "split", recommended: true },
            { value: "completo", label: "Pagué todo", desc: "Esta vez costó menos: no falta nada", icon: "circle-check" },
          ]} />
        </FormField>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button variant="ghost" onClick={() => { onOpenChange(false); onReschedule(fixed) }}>No tocaba pagar · cambiar fecha</Button>
        <SubmitButton disabled={!(valor > 0) || !per} loading={busy} onClick={pay}>{menos && modoMenos === "abono" ? "Registrar abono" : "Registrar pago"}</SubmitButton>
      </div>
    </FieldGroup>
  )
}

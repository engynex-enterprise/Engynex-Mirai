"use client"

import { useState } from "react"
import { toast } from "@/components/mirai/toast"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { DatePicker } from "@/components/mirai/date-picker"
import { Combobox } from "@/components/mirai/combobox"
import { ChoiceCards, Segmented } from "@/components/mirai/choice-cards"
import { Money } from "@/components/mirai/money"
import { FormSkeleton } from "@/components/skeletons/form-skeleton"
import { SubmitButton } from "@/components/mirai/submit-button"
import { useBookId } from "@/components/app/app-context"
import { invalidateBook, useList, useSave } from "@/hooks/use-book-data"
import { createClient } from "@/utils/supabase/client"
import { apiDeleteRow, apiUpdateRow, rowsViaApi } from "@/lib/api/book-rows"
import { addCardPurchase, payCreditCard } from "./commands"
import { annuity, deudaTarjeta, localCat, tarjetaPagoMes, type CardConPagos } from "@/lib/domain"
import { fmtMoney, todayISO } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"
import { categoryOptions, entityOptions, methodOptions, useCatalogsReady, useCategories, useEntities, useKeywordRules, usePaymentMethods, useSettings } from "@/features/catalogs/hooks"
import { useAICategory } from "@/features/expenses/use-ai-category"
import { kickAutomations } from "@/features/automations/runner"

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, Math.round(v)))

export function CardForm({ open, onOpenChange, card, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; card?: Row<"credit_cards"> | null; onSaved?: (id: string) => void }) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} mdesc="tarjeta" title={card ? "Editar tarjeta" : "Agregar tarjeta"}>
      {open && <CardBody card={card} onOpenChange={onOpenChange} onSaved={onSaved} />}
    </ResponsiveDialog>
  )
}

function CardBody({ card, onOpenChange, onSaved }: { card?: Row<"credit_cards"> | null; onOpenChange: (o: boolean) => void; onSaved?: (id: string) => void }) {
  const save = useSave("credit_cards")
  const { data: entities = [] } = useEntities()
  const [nombre, setNombre] = useState(card?.nombre ?? "")
  const [entity, setEntity] = useState<string | null>(card?.entity_id ?? null)
  const [cupo, setCupo] = useState(Number(card?.cupo ?? 0))
  const [corte, setCorte] = useState(String(card?.corte ?? 25))
  const [pago, setPago] = useState(String(card?.pago ?? 10))
  const [tasa, setTasa] = useState(String(card?.tasa ?? 2.1).replace(".", ","))
  const valido = !!nombre.trim() && cupo > 0
  const submit = async () => {
    if (!valido) return
    const row = await save.mutateAsync({
      ...(card ? { id: card.id } : {}), nombre: nombre.trim(), entity_id: entity, cupo,
      corte: clamp(+corte || 25, 1, 31), pago: clamp(+pago || 10, 1, 31), tasa: +tasa.replace(",", ".") || 0,
    } as never)
    toast.success(card ? "Tarjeta actualizada" : "Tarjeta agregada")
    onSaved?.(row.id)
    onOpenChange(false)
  }
  return (
    <FieldGroup className="pb-2">
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Nombre de la tarjeta" htmlFor="t-nombre" required><Input id="t-nombre" className="h-11" autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Visa Bancolombia" /></FormField>
        <FormField label="Banco" htmlFor="t-banco"><Combobox id="t-banco" value={entity} onChange={setEntity} options={entityOptions(entities)} /></FormField>
        <FormField label="Cupo" htmlFor="t-cupo" required tip="El máximo que te deja gastar el banco con esta tarjeta."><MoneyInput id="t-cupo" value={cupo} onChange={setCupo} /></FormField>
        <FormField label="Interés mensual (%)" htmlFor="t-tasa" tip="Míralo en tu extracto como “tasa MV”. En Colombia suele estar cerca del 2 % mensual."><Input id="t-tasa" className="h-11" inputMode="decimal" value={tasa} onChange={(e) => setTasa(e.target.value)} /></FormField>
        <FormField label="Día de corte" htmlFor="t-corte" tip="El día en que el banco cierra la cuenta del mes. Las compras después de esa fecha pasan al mes siguiente."><Input id="t-corte" className="h-11" type="number" min={1} max={31} value={corte} onChange={(e) => setCorte(e.target.value)} /></FormField>
        <FormField label="Día límite de pago" htmlFor="t-pago" tip="Hasta ese día puedes pagar sin intereses de mora."><Input id="t-pago" className="h-11" type="number" min={1} max={31} value={pago} onChange={(e) => setPago(e.target.value)} /></FormField>
      </div>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><SubmitButton disabled={!valido} loading={save.isPending} onClick={submit} /></div>
    </FieldGroup>
  )
}

/** Registrar una compra con la tarjeta o, con `purchase`, editar una compra ya registrada (su gasto se ajusta solo). */
export function PurchaseForm({ card, purchase, onOpenChange }: { card: Row<"credit_cards"> | null; purchase?: Row<"card_purchases"> | null; onOpenChange: (o: boolean) => void }) {
  const ready = useCatalogsReady()
  return (
    <ResponsiveDialog open={!!card} onOpenChange={onOpenChange} mdesc="compraTC" title={card ? (purchase ? `Editar compra con ${card.nombre}` : `Compra con ${card.nombre}`) : ""}>
      {card && (ready ? <PurchaseBody key={purchase?.id ?? "nueva"} card={card} purchase={purchase ?? null} onOpenChange={onOpenChange} /> : <FormSkeleton />)}
    </ResponsiveDialog>
  )
}

function PurchaseBody({ card, purchase, onOpenChange }: { card: Row<"credit_cards">; purchase: Row<"card_purchases"> | null; onOpenChange: (o: boolean) => void }) {
  const bookId = useBookId()
  const qc = useQueryClient()
  const today = todayISO()
  const { data: cats = [] } = useCategories()
  const { data: rules = [] } = useKeywordRules()
  const { data: history = [] } = useList("expenses", { order: { column: "created_at" } })
  const [desc, setDesc] = useState(purchase?.descripcion ?? "")
  const [valor, setValor] = useState(Number(purchase?.valor ?? 0))
  const [fecha, setFecha] = useState(purchase?.fecha ?? today)
  const [cuotas, setCuotas] = useState(String(purchase?.cuotas ?? 1))
  const [cat, setCat] = useState<string | null>(purchase?.category_id ?? null)
  const [catManual, setCatManual] = useState(!!purchase)
  const [comoGasto, setComoGasto] = useState(true)
  const [busy, setBusy] = useState(false)
  const ai = useAICategory({ manual: catManual, onCategory: setCat })
  const n = Math.max(1, +cuotas || 1)
  const cuota = annuity(valor, n > 1 ? Number(card.tasa) / 100 : 0, n)
  const valido = !!desc.trim() && valor > 0
  const OPC = [1, 3, 6, 12, 24, 36]

  const submit = async () => {
    if (!valido) return
    setBusy(true)
    const category = cat ?? cats.find((c) => c.nombre === "Otros")?.id ?? null
    if (purchase) {
      // La base lleva el cambio al gasto enlazado (valor, fecha, categoría y descripción).
      const patch = { descripcion: desc.trim(), valor, fecha, cuotas: n, category_id: category }
      const { error } = rowsViaApi("card_purchases") ? await apiUpdateRow(bookId, "card_purchases", purchase.id, patch) : await createClient().from("card_purchases").update(patch).eq("id", purchase.id)
      setBusy(false)
      if (error) return toast.error("No se pudo guardar la compra", { description: error.message })
      toast.success("Compra actualizada", { description: purchase.expense_id ? "También quedó así en tus gastos." : undefined })
    } else {
      // Una sola transacción: la compra y (si se pide) su gasto enlazado, o nada.
      const { error } = await addCardPurchase({ p_card: card.id, p_fecha: fecha, p_descripcion: desc.trim(), p_valor: valor, p_cuotas: n, p_category: category ?? undefined, p_como_gasto: comoGasto })
      setBusy(false)
      if (error) return toast.error("No se pudo guardar la compra", { description: error.message })
      kickAutomations()
      toast.success("Compra registrada", { description: n > 1 ? `${n} cuotas de ${fmtMoney(cuota)}: pagarás ${fmtMoney(cuota * n - valor)} en intereses.` : "A una cuota no pagas intereses si pagas el total a tiempo." })
    }
    invalidateBook(qc, bookId, "credit_cards"); invalidateBook(qc, bookId, "card_purchases"); invalidateBook(qc, bookId, "expenses")
    onOpenChange(false)
  }

  return (
    <FieldGroup className="pb-2">
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="¿Qué compraste?" htmlFor="cp-desc" required>
          <Input id="cp-desc" className="h-11" autoFocus value={desc} placeholder="Ej. Nevera" onChange={(e) => {
            setDesc(e.target.value)
            // Categoría local al instante y luego la de la IA (si no la eligió a mano).
            if (!catManual) { const h = localCat(e.target.value, { rules, expenses: history, categories: cats }); if (h) setCat(h.category_id); ai.ask(e.target.value, valor) }
          }} />
        </FormField>
        <FormField label="Valor" htmlFor="cp-valor" required><MoneyInput id="cp-valor" value={valor} onChange={setValor} /></FormField>
        <FormField label="Fecha" htmlFor="cp-fecha"><DatePicker id="cp-fecha" value={fecha} onChange={(v) => setFecha(v ?? today)} /></FormField>
        <FormField label="Categoría" htmlFor="cp-cat" hint={ai.hint}><Combobox id="cp-cat" value={cat} onChange={(v) => { setCatManual(true); setCat(v) }} options={categoryOptions(cats)} /></FormField>
      </div>
      <FormField label="¿A cuántas cuotas?" hint={valor > 0 ? (n > 1 ? `Cuota de ${fmtMoney(cuota)} · intereses ${fmtMoney(cuota * n - valor)}` : "A una cuota no pagas intereses si pagas a tiempo.") : undefined}>
        <Segmented value={cuotas} onChange={setCuotas} items={[...new Set([...OPC, n])].sort((a, b) => a - b).map((x) => ({ value: String(x), label: String(x) }))} />
      </FormField>
      {!purchase && (
        <label className="flex items-start gap-3 text-sm">
          <Checkbox checked={comoGasto} onCheckedChange={(c) => setComoGasto(c === true)} className="mt-0.5" />
          <span><b>Registrarla también en mis gastos</b><br /><span className="text-muted-foreground">Así aparece en tu presupuesto de este mes. Si la borras de Gastos, también sale de la tarjeta.</span></span>
        </label>
      )}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><SubmitButton disabled={!valido} loading={busy} onClick={submit}>{purchase ? "Guardar cambios" : "Guardar compra"}</SubmitButton></div>
    </FieldGroup>
  )
}

type CardPagable = Row<"credit_cards"> & { purchases: Row<"card_purchases">[]; pagos?: Row<"card_payments">[] }

/** "Pagar la tarjeta": el pago del mes, todo lo que debes u otro valor, con la fecha y de qué medio salió la plata. */
export function PayCardForm({ card, onOpenChange }: { card: CardPagable | null; onOpenChange: (o: boolean) => void }) {
  const ready = useCatalogsReady()
  return (
    <ResponsiveDialog open={!!card} onOpenChange={onOpenChange} title={card ? `Pagar la tarjeta ${card.nombre}` : ""}
      description="Registra lo que le pagaste al banco. Lo que debes baja, el pago queda en tu flujo de caja y, si eliges el medio, sale de esa cuenta.">
      {card && (ready ? <PayCardBody card={card} onOpenChange={onOpenChange} /> : <FormSkeleton />)}
    </ResponsiveDialog>
  )
}

function PayCardBody({ card, onOpenChange }: { card: CardPagable; onOpenChange: (o: boolean) => void }) {
  const bookId = useBookId()
  const qc = useQueryClient()
  const today = todayISO()
  const { data: methods = [] } = usePaymentMethods()
  const { data: cfg } = useSettings()
  const ci = card as unknown as CardConPagos
  const delMes = Math.round(tarjetaPagoMes(ci, today))
  const total = Math.round(deudaTarjeta(ci, today))
  const [modo, setModo] = useState<"mes" | "total" | "otro">(delMes > 0 ? "mes" : total > 0 ? "total" : "otro")
  const [otro, setOtro] = useState(0)
  const [fecha, setFecha] = useState(today)
  const defMedio = ((cfg?.defaults ?? {}) as { medio?: string }).medio
  const [medio, setMedio] = useState<string | null>(methods.find((m) => m.id === defMedio && !/cr[eé]dito/i.test(m.nombre))?.id ?? methods.find((m) => !/cr[eé]dito/i.test(m.nombre))?.id ?? null)
  const [busy, setBusy] = useState(false)
  const valor = modo === "mes" ? delMes : modo === "total" ? total : otro
  const tipo = modo === "mes" ? "minimo" : modo === "total" || (total > 0 && otro >= total) ? "total" : "otro"
  const valido = valor > 0

  const submit = async () => {
    if (!valido) return
    setBusy(true)
    const { data, error } = await payCreditCard({ p_card: card.id, p_valor: valor, p_fecha: fecha, p_tipo: tipo, p_medio: medio ?? undefined })
    setBusy(false)
    if (error) return toast.error("No se pudo registrar el pago", { description: error.message })
    const id = (data as { payment_id?: string } | null)?.payment_id
    const refresh = () => { invalidateBook(qc, bookId, "credit_cards"); invalidateBook(qc, bookId, "card_purchases"); invalidateBook(qc, bookId, "card_payments") }
    toast.success(tipo === "total" ? "¡Tarjeta al día!" : "Pago registrado", {
      description: `${fmtMoney(valor)} a ${card.nombre}.`,
      action: id ? { label: "Deshacer", onClick: async () => {
        if (rowsViaApi("card_payments")) await apiDeleteRow(bookId, "card_payments", id)
        else await createClient().from("card_payments").update({ deleted_at: new Date().toISOString() }).eq("id", id)
        refresh(); toast("Pago deshecho")
      } } : undefined,
    })
    refresh()
    onOpenChange(false)
  }

  return (
    <FieldGroup className="pb-2">
      <ChoiceCards value={modo} onChange={(v) => setModo(v as typeof modo)} items={[
        ...(delMes > 0 ? [{ value: "mes", label: "El pago del mes", desc: `${fmtMoney(delMes)}: las cuotas que se cobran este mes`, icon: "calendar-check" }] : []),
        ...(total > 0 ? [{ value: "total", label: "Todo lo que debes", desc: `${fmtMoney(total)}: la tarjeta queda en cero`, icon: "circle-check", recommended: true }] : []),
        { value: "otro", label: "Otro valor", desc: "Lo que pagaste de más baja lo que debes", icon: "pencil" },
      ]} />
      {modo === "otro" && <FormField label="¿Cuánto pagaste?" htmlFor="pt-valor" required><MoneyInput id="pt-valor" value={otro} onChange={setOtro} /></FormField>}
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Fecha del pago" htmlFor="pt-fecha"><DatePicker id="pt-fecha" value={fecha} onChange={(v) => setFecha(v ?? today)} /></FormField>
        <FormField label="¿Con qué pagaste?" htmlFor="pt-medio" tip="La cuenta o el medio del que salió la plata para pagarle al banco."><Combobox id="pt-medio" value={medio} onChange={setMedio} options={methodOptions(methods.filter((m) => !/cr[eé]dito/i.test(m.nombre)))} placeholder="Elige el medio" /></FormField>
      </div>
      {valor > 0 && (
        <p className="rounded-lg bg-muted p-3 text-sm" aria-live="polite">
          Pagas <b><Money value={valor} /></b>. {tipo === "total" ? "La tarjeta queda al día." : `Quedarás debiendo cerca de ${fmtMoney(Math.max(0, total - (valor - delMes)))}.`}
        </p>
      )}
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><SubmitButton disabled={!valido} loading={busy} onClick={submit}>Registrar pago</SubmitButton></div>
    </FieldGroup>
  )
}

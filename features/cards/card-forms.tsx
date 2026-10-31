"use client"

import { useState } from "react"
import { toast } from "sonner"
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
import { Segmented } from "@/components/mirai/choice-cards"
import { FormSkeleton } from "@/components/skeletons/form-skeleton"
import { useBookId } from "@/components/app/app-context"
import { invalidateBook, useList, useSave } from "@/hooks/use-book-data"
import { createClient } from "@/utils/supabase/client"
import { annuity, localCat } from "@/lib/domain"
import { fmtMoney, todayISO } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"
import { categoryOptions, entityOptions, useCatalogsReady, useCategories, useEntities, useKeywordRules, usePaymentMethods } from "@/features/catalogs/hooks"

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
  const submit = async () => {
    if (!nombre.trim()) return toast.error("Escribe el nombre de la tarjeta")
    if (!cupo) return toast.error("Escribe el cupo")
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
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={submit} disabled={save.isPending}>Guardar</Button></div>
    </FieldGroup>
  )
}

export function PurchaseForm({ card, onOpenChange }: { card: Row<"credit_cards"> | null; onOpenChange: (o: boolean) => void }) {
  const ready = useCatalogsReady()
  return (
    <ResponsiveDialog open={!!card} onOpenChange={onOpenChange} mdesc="compraTC" title={card ? `Compra con ${card.nombre}` : ""}>
      {card && (ready ? <PurchaseBody card={card} onOpenChange={onOpenChange} /> : <FormSkeleton />)}
    </ResponsiveDialog>
  )
}

function PurchaseBody({ card, onOpenChange }: { card: Row<"credit_cards">; onOpenChange: (o: boolean) => void }) {
  const bookId = useBookId()
  const qc = useQueryClient()
  const today = todayISO()
  const { data: cats = [] } = useCategories()
  const { data: rules = [] } = useKeywordRules()
  const { data: methods = [] } = usePaymentMethods()
  const { data: history = [] } = useList("expenses", { order: { column: "created_at" } })
  const [desc, setDesc] = useState("")
  const [valor, setValor] = useState(0)
  const [fecha, setFecha] = useState(today)
  const [cuotas, setCuotas] = useState("1")
  const [cat, setCat] = useState<string | null>(null)
  const [catManual, setCatManual] = useState(false)
  const [comoGasto, setComoGasto] = useState(true)
  const [busy, setBusy] = useState(false)
  const n = Math.max(1, +cuotas || 1)
  const cuota = annuity(valor, n > 1 ? Number(card.tasa) / 100 : 0, n)

  const submit = async () => {
    if (!desc.trim()) return toast.error("Escribe qué compraste")
    if (!valor) return toast.error("Escribe el valor")
    setBusy(true)
    const sb = createClient()
    const category = cat ?? cats.find((c) => c.nombre === "Otros")?.id ?? null
    let expenseId: string | null = null
    if (comoGasto) {
      const { data } = await sb.from("expenses").insert({
        book_id: bookId, fecha, descripcion: desc.trim(), valor, category_id: category, origen: "tarjeta", hormiga: false,
        payment_method_id: methods.find((m) => /cr[eé]dito/i.test(m.nombre))?.id ?? null,
      }).select("id").single()
      expenseId = data?.id ?? null
    }
    const { error } = await sb.from("card_purchases").insert({ book_id: bookId, card_id: card.id, fecha, descripcion: desc.trim(), valor, cuotas: n, category_id: category, expense_id: expenseId })
    setBusy(false)
    if (error) return toast.error("No se pudo guardar la compra", { description: error.message })
    toast.success("Compra registrada", { description: n > 1 ? `${n} cuotas de ${fmtMoney(cuota)}: pagarás ${fmtMoney(cuota * n - valor)} en intereses.` : "A una cuota no pagas intereses si pagas el total a tiempo." })
    invalidateBook(qc, bookId, "credit_cards"); invalidateBook(qc, bookId, "card_purchases"); invalidateBook(qc, bookId, "expenses")
    onOpenChange(false)
  }

  return (
    <FieldGroup className="pb-2">
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="¿Qué compraste?" htmlFor="cp-desc" required>
          <Input id="cp-desc" className="h-11" autoFocus value={desc} onChange={(e) => { setDesc(e.target.value); if (!catManual) { const h = localCat(e.target.value, { rules, expenses: history, categories: cats }); if (h) setCat(h.category_id) } }} placeholder="Ej. Nevera" />
        </FormField>
        <FormField label="Valor" htmlFor="cp-valor" required><MoneyInput id="cp-valor" value={valor} onChange={setValor} /></FormField>
        <FormField label="Fecha" htmlFor="cp-fecha"><DatePicker id="cp-fecha" value={fecha} onChange={(v) => setFecha(v ?? today)} /></FormField>
        <FormField label="Categoría" htmlFor="cp-cat"><Combobox id="cp-cat" value={cat} onChange={(v) => { setCatManual(true); setCat(v) }} options={categoryOptions(cats)} /></FormField>
      </div>
      <FormField label="¿A cuántas cuotas?" hint={valor > 0 ? (n > 1 ? `Cuota de ${fmtMoney(cuota)} · intereses ${fmtMoney(cuota * n - valor)}` : "A una cuota no pagas intereses si pagas a tiempo.") : undefined}>
        <Segmented value={cuotas} onChange={setCuotas} items={[1, 3, 6, 12, 24, 36].map((x) => ({ value: String(x), label: String(x) }))} />
      </FormField>
      <label className="flex items-start gap-3 text-sm">
        <Checkbox checked={comoGasto} onCheckedChange={(c) => setComoGasto(c === true)} className="mt-0.5" />
        <span><b>Registrarla también en mis gastos</b><br /><span className="text-muted-foreground">Así aparece en tu presupuesto de este mes.</span></span>
      </label>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={submit} disabled={busy}>Guardar compra</Button></div>
    </FieldGroup>
  )
}

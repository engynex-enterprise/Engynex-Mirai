"use client"

import { useState } from "react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { SubmitButton } from "@/components/mirai/submit-button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { Combobox } from "@/components/mirai/combobox"
import { ChoiceCards } from "@/components/mirai/choice-cards"
import { useSave } from "@/hooks/use-book-data"
import PUC_A from "@/lib/data/legacy-puc_a.json"
import PUC_P from "@/lib/data/legacy-puc_p.json"
import { CURRENCY_OPTIONS } from "@/features/catalogs/hooks"

export const PUC: Record<string, [string, string]> = Object.fromEntries([...PUC_A, ...PUC_P].map(([c, l, i]) => [c, [l, i]]))

export function AssetForm({ open, onOpenChange, side: initialSide = "activos" }: { open: boolean; onOpenChange: (o: boolean) => void; side?: "activos" | "pasivos" }) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} mdesc="activo" title="Agregar cuenta, bien o deuda">
      {open && <Body onOpenChange={onOpenChange} initialSide={initialSide} />}
    </ResponsiveDialog>
  )
}

function Body({ onOpenChange, initialSide }: { onOpenChange: (o: boolean) => void; initialSide: "activos" | "pasivos" }) {
  const [side, setSide] = useState(initialSide)
  const [cod, setCod] = useState(initialSide === "activos" ? "1110" : "2380")
  const [nombre, setNombre] = useState("")
  const [currency, setCurrency] = useState("COP")
  const [valor, setValor] = useState(0)
  const saveA = useSave("assets"), saveP = useSave("liabilities")
  const list = side === "activos" ? PUC_A : PUC_P
  const submit = async () => {
    if (!nombre.trim()) return toast.error("Escribe el nombre")
    if (!valor) return toast.error("Escribe el valor")
    await (side === "activos" ? saveA : saveP).mutateAsync({ cod, nombre: nombre.trim(), valor, currency } as never)
    toast.success("Guardado")
    onOpenChange(false)
  }
  return (
    <FieldGroup className="pb-2">
      <ChoiceCards value={side} onChange={(v) => { setSide(v as typeof side); setCod(v === "activos" ? "1110" : "2380") }} items={[
        { value: "activos", label: "Algo que tengo", desc: "Cuentas, efectivo, casa, carro", icon: "wallet" },
        { value: "pasivos", label: "Algo que debo", desc: "Tarjeta, deuda informal, impuestos", icon: "hand-coins" },
      ]} />
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="¿Qué es?" htmlFor="a-cod"><Combobox id="a-cod" value={cod} onChange={setCod} options={list.map(([c, l, i]) => ({ value: c, label: l, icon: i, hint: `PUC ${c}` }))} /></FormField>
        <FormField label="Nombre" htmlFor="a-nombre" required><Input id="a-nombre" className="h-11" autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={side === "activos" ? "Ej. Cuenta de ahorros Bancolombia" : "Ej. Tarjeta Visa"} /></FormField>
        <FormField label="Moneda" htmlFor="a-moneda"><Combobox id="a-moneda" value={currency} onChange={setCurrency} options={CURRENCY_OPTIONS} /></FormField>
        <FormField label="Valor hoy" htmlFor="a-valor" required><MoneyInput id="a-valor" value={valor} onChange={setValor} currency={currency} decimals /></FormField>
      </div>
      <p className="text-sm text-muted-foreground">Los préstamos con cuotas regístralos en Préstamos y deudas para llevar su plan de pagos.</p>
      <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><SubmitButton disabled={!nombre.trim() || !(valor > 0)} loading={saveA.isPending || saveP.isPending} onClick={submit} /></div>
    </FieldGroup>
  )
}

"use client"

import { useState } from "react"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { SubmitButton } from "@/components/mirai/submit-button"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { DatePicker } from "@/components/mirai/date-picker"
import { Combobox } from "@/components/mirai/combobox"
import { toast } from "@/components/mirai/toast"
import { useSave } from "@/hooks/use-book-data"
import { todayISO } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"
import { memberName, methodOptions, useIncomeCategories, useMembers, usePaymentMethods } from "@/features/catalogs/hooks"

export type ExtraIncomeRow = Row<"extra_incomes">

/**
 * Un ingreso extra: plata que te llegó una sola vez (una venta, un regalo, un trabajo aparte). Es distinto de un
 * ingreso, que se repite cada mes. Aparece en el Balance el día que lo recibiste.
 */
export function ExtraIncomeForm({ open, onOpenChange, extra }: { open: boolean; onOpenChange: (o: boolean) => void; extra?: ExtraIncomeRow | null }) {
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={extra ? `Editar ${extra.descripcion}` : "Agregar ingreso extra"}
      description="Plata que te llegó una sola vez: una venta, un regalo, un trabajo aparte. Si te llega todos los meses, agrégala como ingreso.">
      {open && <Body key={extra?.id ?? "nuevo"} onOpenChange={onOpenChange} extra={extra} />}
    </ResponsiveDialog>
  )
}

function Body({ onOpenChange, extra }: { onOpenChange: (o: boolean) => void; extra?: ExtraIncomeRow | null }) {
  const today = todayISO()
  const { data: cats = [] } = useIncomeCategories()
  const { data: members = [] } = useMembers()
  const { data: methods = [] } = usePaymentMethods()
  const save = useSave("extra_incomes", { created: "Ingreso extra agregado", updated: "Ingreso extra actualizado" })
  const [descripcion, setDescripcion] = useState(extra?.descripcion ?? "")
  const [valor, setValor] = useState(extra ? Number(extra.valor) : 0)
  const [fecha, setFecha] = useState(extra?.fecha ?? today)
  const [categoria, setCategoria] = useState<string | null>(extra?.category_id ?? null)
  const [medio, setMedio] = useState<string | null>(extra?.payment_method_id ?? null)
  const [quien, setQuien] = useState<string | null>(extra?.member_id ?? null)

  const submit = () => {
    if (!descripcion.trim()) return toast.error("Escribe de qué fue el ingreso")
    if (!(valor > 0)) return toast.error("Escribe cuánto recibiste")
    save.mutate({
      ...(extra ?? {}), descripcion: descripcion.trim(), valor, fecha,
      category_id: categoria, payment_method_id: medio, member_id: quien,
    } as never)
    onOpenChange(false)
  }

  return (
    <FieldGroup className="pb-2">
      <FormField label="¿De qué fue?" htmlFor="xi-desc" required>
        <Input id="xi-desc" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Venta de la bicicleta" autoFocus />
      </FormField>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="¿Cuánto recibiste?" htmlFor="xi-valor" required><MoneyInput id="xi-valor" value={valor} onChange={setValor} /></FormField>
        <FormField label="¿Qué día?" htmlFor="xi-fecha"><DatePicker id="xi-fecha" value={fecha} onChange={(v) => setFecha(v ?? today)} /></FormField>
        <FormField label="Categoría" htmlFor="xi-cat"><Combobox id="xi-cat" value={categoria} onChange={setCategoria} options={cats.map((c) => ({ value: c.id, label: c.nombre, icon: c.icon }))} placeholder="Sin categoría" /></FormField>
        <FormField label="¿A qué cuenta entró?" htmlFor="xi-medio" hint="Si la cuenta lleva su saldo sola, le suma este ingreso."><Combobox id="xi-medio" value={medio} onChange={setMedio} options={methodOptions(methods)} placeholder="Sin medio" /></FormField>
        {members.length > 1 && (
          <FormField label="¿De quién es?" htmlFor="xi-quien">
            <Combobox id="xi-quien" value={quien} onChange={setQuien} options={members.map((m) => ({ value: m.id, label: memberName(m.id, members) }))} placeholder="De la familia" />
          </FormField>
        )}
      </div>
      <SubmitButton disabled={!descripcion.trim() || !(valor > 0)} onClick={submit}>{extra ? "Guardar cambios" : "Agregar ingreso extra"}</SubmitButton>
    </FieldGroup>
  )
}

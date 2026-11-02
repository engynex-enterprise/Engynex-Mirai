"use client"

import { useState } from "react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { ChoiceCards } from "@/components/mirai/choice-cards"
import { Combobox } from "@/components/mirai/combobox"
import { DatePicker } from "@/components/mirai/date-picker"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { BTIP, type RentaMember, type TaxAssetIn } from "@/lib/domain"

const CON_SALDO = ["cuenta", "inversion", "cripto", "exterior", "cobrar", "otro"]

/** Agregar o editar un bien (modal "bien" de la v4). */
export function BienForm({ value, members, onClose, onSave }: { value: TaxAssetIn & { id?: string }; members: RentaMember[]; onClose: () => void; onSave: (b: TaxAssetIn & { id?: string }) => Promise<void> }) {
  const [b, setB] = useState(value)
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<TaxAssetIn>) => setB({ ...b, ...p })
  const submit = async () => {
    if (!b.nombre.trim()) return toast.error("Escribe el nombre del bien")
    setBusy(true)
    try { await onSave({ ...b, nombre: b.nombre.trim(), pct: Math.min(100, Math.max(1, +b.pct || 100)) }); toast.success(`${b.nombre.trim()} quedó en tus bienes.`) } catch (e) { toast.error("No se pudo guardar", { description: (e as Error).message }) }
    setBusy(false)
  }
  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} wide title={b.id ? "Editar bien" : "Agregar un bien"}
      description="Lo que tienes a tu nombre al 31 de diciembre. Sirve para la declaración de renta y para calcular el predial y el impuesto vehicular."
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} disabled={busy}>{busy && <Spinner />} Guardar</Button></>}>
      <FieldGroup>
        <ChoiceCards cols={4} value={b.tipo} onChange={(v) => set({ tipo: v })} items={BTIP.map(([v, l, i]) => ({ value: v, label: l, icon: i }))} />
        <FormField label="Nombre" htmlFor="b-nombre" required tip={false}><Input id="b-nombre" className="h-11" placeholder="Ej. Apartamento Cedritos" value={b.nombre} onChange={(e) => set({ nombre: e.target.value })} /></FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Identificación" htmlFor="b-ident" tip="Matrícula inmobiliaria o chip del predio, placa del vehículo, o número y banco de la cuenta."><Input id="b-ident" className="h-11" placeholder="Matrícula inmobiliaria, placa o número de cuenta" value={b.ident ?? ""} onChange={(e) => set({ ident: e.target.value })} /></FormField>
          <FormField label="Entidad, ciudad o lugar" htmlFor="b-ent" tip={false}><Input id="b-ent" className="h-11" placeholder="Bogotá · Banco · Notaría" value={b.entidad ?? ""} onChange={(e) => set({ entidad: e.target.value })} /></FormField>
          <FormField label="Costo de compra (costo fiscal)" htmlFor="b-costo" tip="Lo que pagaste más mejoras y escrituración, o el valor que declaraste el año anterior."><MoneyInput id="b-costo" value={b.costo} onChange={(v) => set({ costo: v })} /></FormField>
          <FormField label="Avalúo catastral o comercial" htmlFor="b-aval" tip="Inmuebles: el avalúo catastral del recibo del predial. Vehículos: el avalúo comercial del recibo del impuesto vehicular."><MoneyInput id="b-aval" value={b.avaluo} onChange={(v) => set({ avaluo: v })} /></FormField>
          {CON_SALDO.includes(b.tipo) && <FormField label="Saldo o valor al 31 de diciembre" htmlFor="b-v31" tip={false}><MoneyInput id="b-v31" value={b.valor31} onChange={(v) => set({ valor31: v })} /></FormField>}
          <FormField label="Fecha de compra" htmlFor="b-fecha" tip={false}><DatePicker id="b-fecha" value={b.fecha_adq ?? null} onChange={(v) => set({ fecha_adq: v ?? null })} /></FormField>
          <FormField label="¿De quién es?" htmlFor="b-quien" tip={false}><Combobox id="b-quien" value={b.member_id ?? ""} onChange={(v) => set({ member_id: v })} options={members.map((m) => ({ value: m.id, label: m.nombre, icon: "user" }))} /></FormField>
          <FormField label="Porcentaje tuyo (%)" htmlFor="b-pct" tip="Si lo compartes (por ejemplo, con tu pareja), escribe tu parte."><Input id="b-pct" className="h-11" inputMode="numeric" value={String(b.pct)} onChange={(e) => set({ pct: +e.target.value.replace(/\D/g, "") || 0 })} /></FormField>
          {b.tipo === "inmueble" && <FormField label="Predial del año" htmlFor="b-pred" hint="Si lo dejas vacío lo estimamos." tip={false}><MoneyInput id="b-pred" value={b.predial ?? 0} onChange={(v) => set({ predial: v || null })} /></FormField>}
          {b.tipo === "vehiculo" && <>
            <FormField label="Impuesto vehicular" htmlFor="b-veh" tip={false}><MoneyInput id="b-veh" value={b.imp_veh ?? 0} onChange={(v) => set({ imp_veh: v || null })} /></FormField>
            <FormField label="SOAT" htmlFor="b-soat" tip={false}><MoneyInput id="b-soat" value={b.soat ?? 0} onChange={(v) => set({ soat: v || null })} /></FormField>
          </>}
        </div>
      </FieldGroup>
    </ResponsiveDialog>
  )
}

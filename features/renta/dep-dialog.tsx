"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Segmented } from "@/components/mirai/choice-cards"
import { Combobox } from "@/components/mirai/combobox"
import { DatePicker } from "@/components/mirai/date-picker"
import { FormField } from "@/components/mirai/field"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { DEPR, depInfo, type RentaMember } from "@/lib/domain"
import { todayISO } from "@/lib/format"

/** Datos de un integrante como dependiente (modal "depend" de la v4). */
export function DepDialog({ member, members, onClose, onSave }: { member: RentaMember; members: RentaMember[]; onClose: () => void; onSave: (p: Record<string, unknown>) => Promise<void> }) {
  const [m, setM] = useState(member)
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<RentaMember>) => setM({ ...m, ...p })
  const submit = async () => {
    setBusy(true)
    try {
      await onSave({ dep_de: m.dep_de || null, dep_rel: m.dep_rel || null, nacimiento: m.nacimiento || null, doc: m.doc ?? "", estudia: !!m.estudia, sin_ingresos: !!m.sin_ingresos, discapacidad: !!m.discapacidad })
      const d = depInfo(m, todayISO())
      if (!m.dep_de) toast("Guardado")
      else if (d.ok) toast.success(`${m.nombre} cuenta como dependiente`, { description: d.why })
      else toast.warning(`${m.nombre} no cuenta como dependiente`, { description: d.why })
    } catch (e) { toast.error("No se pudo guardar", { description: (e as Error).message }) }
    setBusy(false)
  }
  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} title={`Datos de ${m.nombre}`} description="Para saber si cuenta como tu dependiente en la declaración de renta."
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit} disabled={busy}>{busy && <Spinner />} Guardar</Button></>}>
      <FieldGroup>
        <FormField label={`¿Es dependiente económico de…?`} tip="Solo una persona puede tomarlo como dependiente.">
          <Combobox value={m.dep_de ?? ""} onChange={(v) => set({ dep_de: v === "none" ? null : v })} options={[{ value: "none", label: "De nadie (no lo uso en renta)" }, ...members.filter((x) => x.id !== m.id).map((x) => ({ value: x.id, label: x.nombre, icon: "user" }))]} />
        </FormField>
        <FormField label="Parentesco para la DIAN" tip={false}><Combobox value={m.dep_rel ?? depInfo(m, todayISO()).rel} onChange={(v) => set({ dep_rel: v })} options={DEPR.map(([v, l]) => ({ value: v, label: l }))} /></FormField>
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField label="Fecha de nacimiento" htmlFor="d-nac" tip={false}><DatePicker id="d-nac" value={m.nacimiento ?? null} onChange={(v) => set({ nacimiento: v ?? null })} /></FormField>
          <FormField label="Documento" htmlFor="d-doc" tip={false}><Input id="d-doc" className="h-11" placeholder="TI / RC / CC y número" value={m.doc ?? ""} onChange={(e) => set({ doc: e.target.value })} /></FormField>
        </div>
        <FormField label="¿Estudia?" tip={false}><Segmented value={m.estudia ? "si" : "no"} onChange={(v) => set({ estudia: v === "si" })} items={[{ value: "no", label: "No" }, { value: "si", label: "Sí, educación superior, técnica o tecnológica" }]} /></FormField>
        <FormField label="¿Tuvo ingresos en el año?" tip={false}><Segmented value={m.sin_ingresos === false ? "si" : "no"} onChange={(v) => set({ sin_ingresos: v === "no" })} items={[{ value: "no", label: "No, o menos de 260 UVT" }, { value: "si", label: "Sí, más de 260 UVT" }]} /></FormField>
        <label className="flex items-center justify-between gap-3 text-sm font-medium">¿Tiene discapacidad que genere dependencia?<Switch checked={!!m.discapacidad} onCheckedChange={(v) => set({ discapacidad: v })} /></label>
      </FieldGroup>
    </ResponsiveDialog>
  )
}

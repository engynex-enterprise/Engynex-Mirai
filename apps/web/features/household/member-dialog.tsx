"use client"

import { useState } from "react"
import { Pencil } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { AvatarPicker } from "@/components/mirai/avatar-picker"
import { ChoiceCards } from "@/components/mirai/choice-cards"
import { Combobox } from "@/components/mirai/combobox"
import { DatePicker } from "@/components/mirai/date-picker"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { Notice } from "@/components/mirai/notice"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { SubmitButton } from "@/components/mirai/submit-button"
import { UserAvatar } from "@/components/mirai/user-avatar"
import PARENT_IC from "@/lib/data/legacy-parent_ic.json"
import type { Row } from "@/lib/supabase/tables"
import { saveFamilyMember } from "./actions"

const PARENTESCOS = Object.entries(PARENT_IC as Record<string, string>).filter(([k]) => k !== "Cónyuge" && k !== "Hijo/a")

/** Opciones de parentesco (23 de la v4) más el valor actual si es uno viejo. */
export const parentescoOptions = (rol?: string | null) =>
  [...PARENTESCOS, ...(rol && !PARENTESCOS.some(([k]) => k === rol) ? [[rol, (PARENT_IC as Record<string, string>)[rol] ?? "user"]] : [])].map(([k, i]) => ({ value: k, label: k, icon: i }))

export const parentescoIcon = (rol?: string | null) => (PARENT_IC as Record<string, string>)[rol ?? ""] ?? "user"

/**
 * Integrante sin cuenta (o datos del integrante de alguien con cuenta): avatar, nombre, parentesco, cumpleaños y
 * presupuesto. No deja repetir un nombre del hogar sin confirmar.
 */
export function MemberDialog({ m, onClose, onSaved, titular }: { m: Partial<Row<"family_members">> | null; onClose: () => void; onSaved?: (id: string) => void; titular?: { avatar: string | null } }) {
  const [nombre, setNombre] = useState(m?.nombre ?? "")
  const [rol, setRol] = useState(m?.rol ?? "")
  const [avatar, setAvatar] = useState<string | null>(m?.avatar || null)
  const [nac, setNac] = useState<string | null>(m?.nacimiento ?? null)
  const [pick, setPick] = useState(false)
  const [tiene, setTiene] = useState(+(m?.cupo ?? 0) > 0 ? "si" : "no")
  const [cupo, setCupo] = useState(+(m?.cupo ?? 0))
  const [busy, setBusy] = useState(false)
  const [dup, setDup] = useState<string | null>(null)
  const valid = !!nombre.trim() && (tiene === "no" || cupo > 0)
  const save = async (force = false) => {
    if (!nombre.trim()) return toast.error("Escribe el nombre")
    setBusy(true)
    const r = await saveFamilyMember({ id: m?.id ?? null, nombre: nombre.trim(), rol: rol || null, avatar, nacimiento: nac, cupo: tiene === "si" ? cupo : 0, force })
    setBusy(false)
    if (r.code === "mismo_nombre") return setDup(r.msg)
    if (!r.ok) return toast.error("No se pudo guardar", { description: r.msg })
    toast.success(r.msg)
    onSaved?.(r.id!)
    onClose()
  }
  return (
    <ResponsiveDialog open onOpenChange={(o) => !o && onClose()} title={m?.id ? "Editar integrante" : "Agregar al hogar"} mdesc="miembro"
      description="Para registrar a quién corresponde cada gasto o ingreso y, si quieres, darle un presupuesto al mes. No necesita cuenta en Mirai."
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button>
        <SubmitButton onClick={() => save(!!dup)} disabled={!valid} loading={busy} hint={!nombre.trim() ? "Escribe el nombre" : "Escribe el presupuesto al mes o elige que no tiene límite"}>{dup ? "Sí, guardar" : m?.id ? "Guardar cambios" : "Agregar"}</SubmitButton></>}>
      <form className="contents" onSubmit={(e) => { e.preventDefault(); if (valid && !busy) save(!!dup) }}>
      <FieldGroup>
        {dup && <Notice tone="warn" title="¿Es otra persona?">{dup} Toca <b>Sí, guardar</b> para agregarla igual, o cambia el nombre (por ejemplo, con su apellido).</Notice>}
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => setPick(true)} aria-label="Elegir avatar del integrante" className="group relative rounded-[22%] outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <UserAvatar src={avatar || titular?.avatar} name={nombre || "?"} square className="size-20" fallbackClassName="text-xl" />
            <span className="absolute -right-1 -bottom-1 grid size-7 place-items-center rounded-full bg-secondary ring-2 ring-popover"><Pencil className="size-3.5" /></span>
          </button>
          <p className="text-sm text-muted-foreground">Escoge un avatar para reconocer a esta persona de un vistazo.</p>
        </div>
        <FormField label="Nombre" htmlFor="mm-n" required tip={false}><Input id="mm-n" className="h-11" placeholder="Ej. Sofía" value={nombre} onChange={(e) => { setNombre(e.target.value); setDup(null) }} autoFocus maxLength={60} /></FormField>
        {!m?.es_titular && <FormField label="¿Qué es para ti?" htmlFor="mm-rol" tip="El parentesco o la relación de esta persona contigo."><Combobox id="mm-rol" value={rol} onChange={setRol} options={parentescoOptions(rol)} placeholder="Elige el parentesco" /></FormField>}
        <FormField label="Fecha de nacimiento (opcional)" htmlFor="mm-nac" tip="Te recordamos su cumpleaños con tiempo para planear el regalo."><DatePicker id="mm-nac" quick="ninguno" clearable years={[1920, new Date().getFullYear()]} startAt="2010-01-01" placeholder="Elige la fecha" value={nac} onChange={setNac} /></FormField>
        <FormField label="¿Quieres darle un presupuesto mensual?" tip={false} hint="Si tiene un límite, Mirai te avisa cuando se acerque o se pase.">
          <ChoiceCards name="mm-cupo" value={tiene} onChange={setTiene} items={[{ value: "no", label: "No, gasta del dinero de la casa", icon: "house" }, { value: "si", label: "Sí, tiene un límite al mes", icon: "wallet" }]} />
        </FormField>
        {tiene === "si" && <FormField label="Presupuesto al mes" htmlFor="mm-c" tip="Lo máximo que esta persona puede gastar al mes en sus cosas. Mirai te avisa si se pasa."><MoneyInput id="mm-c" value={cupo} onChange={setCupo} /></FormField>}
      </FieldGroup>
      </form>
      <AvatarPicker open={pick} onOpenChange={setPick} value={avatar} name={nombre || "?"} onPick={setAvatar} title={`Avatar de ${nombre || "este integrante"}`} />
    </ResponsiveDialog>
  )
}

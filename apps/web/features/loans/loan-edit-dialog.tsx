"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { Segmented } from "@/components/mirai/choice-cards"
import { Combobox } from "@/components/mirai/combobox"
import { DatePicker } from "@/components/mirai/date-picker"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { SubmitButton } from "@/components/mirai/submit-button"
import { useBookId } from "@/components/app/app-context"
import { invalidateBook } from "@/hooks/use-book-data"
import { contactOptions, entityOptions } from "@/features/catalogs/hooks"
import { EntityDialog } from "@/features/catalogs/entity-dialog"
import { ProviderSelect } from "@/features/providers/provider-select"
import { addPeriod, type Prenda } from "@/lib/domain"
import type { Row } from "@/lib/supabase/tables"
import { createClient } from "@/utils/supabase/client"
import { apiUpdateRow, rowsViaApi } from "@/lib/api/book-rows"
import type { LoanRow } from "./loan-detail"

type Quien = "ct" | "ent" | "prov"
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`

/**
 * Editar los datos de una deuda ya guardada sin tocar sus cuentas: a quién es (contacto, entidad o proveedor), para qué
 * fue, la nota y, según el caso, el objeto empeñado o la fecha del pago único. Montos, tasa y cuotas no se editan aquí
 * (cambiarían los pagos ya registrados): para eso se registra un abono o se crea la deuda de nuevo.
 */
export function LoanEditDialog({ loan, open, onOpenChange, contacts, entities }: {
  loan: LoanRow; open: boolean; onOpenChange: (o: boolean) => void; contacts: Row<"contacts">[]; entities: Row<"entities">[]
}) {
  const qc = useQueryClient()
  const bookId = useBookId()
  const isC = loan.kind === "cobrar"
  const pr0 = (loan.prenda as Prenda | null) ?? null
  const ini: Quien = loan.contact_id ? "ct" : loan.entity_id ? "ent" : loan.provider_id ? "prov" : isC ? "ct" : "ent"
  const [quien, setQuien] = useState<Quien>(ini)
  const [contact, setContact] = useState<string | null>(loan.contact_id)
  const [entity, setEntity] = useState<string | null>(loan.entity_id)
  const [prov, setProv] = useState<string | null>(loan.provider_id ?? null)
  const [concepto, setConcepto] = useState(loan.concepto ?? "")
  const [nota, setNota] = useState(loan.nota ?? "")
  const [vence, setVence] = useState<string | null>(loan.vence ?? null)
  // Desde cuándo se paga: vacío = un periodo después del préstamo.
  const auto = isoLocal(addPeriod(loan.inicio, loan.frec, 1))
  const [primera, setPrimera] = useState<string>(loan.primera ?? auto)
  const [pr, setPr] = useState<Prenda>({ obj: pr0?.obj ?? "", valor: pr0?.valor ?? 0, limite: pr0?.limite ?? null, ref: pr0?.ref ?? "" })
  const [busy, setBusy] = useState(false)
  const [newEnt, setNewEnt] = useState<string | null>(null)

  const quienId = quien === "ct" ? contact : quien === "ent" ? entity : prov
  const valid = !!quienId && (!pr0 || !!pr.obj?.trim()) && (loan.frec !== "unico" || !!vence) && (loan.frec === "unico" || primera >= loan.inicio)

  const save = async (ev?: React.FormEvent) => {
    ev?.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    const patch = {
      contact_id: quien === "ct" ? contact : null,
      entity_id: quien === "ent" ? entity : null,
      // El proveedor puede quedar enlazado aunque la deuda sea con una persona o una entidad.
      provider_id: quien === "prov" ? prov : prov && prov !== loan.provider_id ? prov : loan.provider_id ?? null,
      concepto: concepto.trim(),
      nota: nota.trim(), // loans.nota es "not null default ''": vacía es "", no null
      ...(loan.frec === "unico" ? { vence } : { primera: primera !== auto ? primera : null }),
      ...(pr0 ? { prenda: { ...pr0, obj: pr.obj?.trim(), valor: pr.valor || 0, limite: pr.limite || null, ref: pr.ref?.trim() || "" } } : {}),
    }
    const { error } = rowsViaApi("loans") ? await apiUpdateRow(bookId, "loans", loan.id, patch) : await createClient().from("loans").update(patch as never).eq("id", loan.id)
    setBusy(false)
    if (error) return toast.error("No se pudo guardar", { description: error.message })
    invalidateBook(qc, bookId, "loans")
    toast.success("Datos actualizados")
    onOpenChange(false)
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title={isC ? "Editar el préstamo" : "Editar la deuda"}
      description="Cambia a quién es, para qué fue o la nota. Los montos y las cuotas no cambian."
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><SubmitButton onClick={() => void save()} disabled={!valid} loading={busy} hint="Escoge a quién es la deuda">Guardar cambios</SubmitButton></>}>
      <form id="loan-edit" onSubmit={save} className="grid gap-4 pb-2">
        <FormField label={isC ? "¿Quién te debe?" : "¿A quién le debes?"} tip={false}>
          <Segmented value={quien} onChange={(v) => setQuien(v as Quien)} items={[
            { value: "ct", label: "Una persona", icon: "user-round" },
            { value: "ent", label: "Banco o entidad", icon: "landmark" },
            { value: "prov", label: "Tienda o proveedor", icon: "store" },
          ]} />
        </FormField>
        {quien === "ct" && (
          <FormField label="Contacto" htmlFor="le-ct" required hint="Se guarda en Contactos.">
            <Combobox id="le-ct" value={contact} onChange={setContact} options={contactOptions(contacts)} emptyText="No tienes contactos. Agrégalo en Contactos." />
          </FormField>
        )}
        {quien === "ent" && (
          <FormField label="Banco, casa de empeño o entidad" htmlFor="le-ent" required hint="Se guarda en Contactos › Bancos y entidades.">
            <Combobox id="le-ent" value={entity} onChange={setEntity} options={entityOptions(entities)} createLabel="Crear banco o entidad" onCreate={(t) => setNewEnt(t || " ")} />
          </FormField>
        )}
        {quien === "prov" && (
          <FormField label="Tienda o proveedor" htmlFor="le-prov" required hint="Se guarda en Proveedores.">
            <ProviderSelect id="le-prov" value={prov} onChange={(id) => setProv(id)} />
          </FormField>
        )}
        <FormField label={isC ? "¿Para qué fue?" : "¿Para qué fue o qué compraste?"} htmlFor="le-con">
          <Input id="le-con" className="h-11" value={concepto} onChange={(e) => setConcepto(e.target.value)} maxLength={80} />
        </FormField>
        {pr0 && (
          <div className="grid gap-4 rounded-lg border p-3 sm:grid-cols-2">
            <FormField label={isC ? "Garantía que te dejaron" : "Objeto empeñado"} htmlFor="le-obj" required className="sm:col-span-2">
              <Input id="le-obj" className="h-11" value={pr.obj ?? ""} onChange={(e) => setPr({ ...pr, obj: e.target.value })} />
            </FormField>
            <FormField label="Avalúo" htmlFor="le-val"><MoneyInput id="le-val" value={pr.valor ?? 0} onChange={(v) => setPr({ ...pr, valor: v })} /></FormField>
            <FormField label="Número de boleta" htmlFor="le-ref"><Input id="le-ref" className="h-11" value={pr.ref ?? ""} onChange={(e) => setPr({ ...pr, ref: e.target.value })} /></FormField>
            <FormField label="Fecha límite" htmlFor="le-lim" className="sm:col-span-2" hint="Si refrendaste, pon la nueva fecha límite.">
              <DatePicker id="le-lim" value={pr.limite ?? null} onChange={(v) => setPr({ ...pr, limite: v })} quick="futuro" clearable />
            </FormField>
          </div>
        )}
        {loan.frec === "unico" && (
          <FormField label="¿Cuándo se paga?" htmlFor="le-vence" required hint="Si acordaron otra fecha, cámbiala aquí.">
            <DatePicker id="le-vence" value={vence} onChange={setVence} quick="futuro" />
          </FormField>
        )}
        {loan.frec !== "unico" && (
          <FormField label={isC ? "¿Desde cuándo te empieza a pagar?" : "¿Desde cuándo empiezas a pagar?"} htmlFor="le-desde"
            error={primera < loan.inicio ? "Debe ser después de la fecha del préstamo." : undefined}
            hint="La fecha de la primera cuota. Las demás se acomodan cada periodo desde ahí.">
            <DatePicker id="le-desde" value={primera} onChange={(v) => setPrimera(v ?? auto)} quick="futuro" />
          </FormField>
        )}
        <FormField label="Nota" htmlFor="le-nota">
          <Textarea id="le-nota" rows={3} value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Lo que acordaron, a qué cuenta se paga…" />
        </FormField>
      </form>
      <EntityDialog open={newEnt !== null} onOpenChange={(o) => !o && setNewEnt(null)} initial={newEnt?.trim() ?? ""} onCreated={(id) => { setEntity(id); setNewEnt(null) }} />
    </ResponsiveDialog>
  )
}

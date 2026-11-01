"use client"

import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Gift } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { DatePicker } from "@/components/mirai/date-picker"
import { FormField } from "@/components/mirai/field"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { fmtDate } from "@/lib/format"
import { adminGrantPremium, adminRevokeCourtesy } from "./actions"


const in30 = () => new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)

/** Botón y ventana "Regalar Premium" (cortesía) para el hogar de una persona. */
export function GiftPremium({ householdId, nombre, premiumHasta }: { householdId: string; nombre: string; premiumHasta: string | null }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [hasta, setHasta] = useState(in30())
  const [nota, setNota] = useState("")
  const [busy, setBusy] = useState(false)
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true)
    try { await fn(); toast.success(msg); setOpen(false); qc.invalidateQueries({ queryKey: ["admin"] }) }
    catch (e) { toast.error("No se pudo", { description: (e as Error).message }) }
    finally { setBusy(false) }
  }
  return (
    <>
      <Button size="icon-sm" variant="ghost" aria-label={`Regalar Premium a ${nombre}`} onClick={() => setOpen(true)}><Gift /></Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title={`Regalar Premium a ${nombre}`} description="Todo su hogar tendrá Premium sin pagar hasta la fecha que elijas. Le llega un aviso.">
        <FieldGroup className="pb-2">
          {premiumHasta && <p className="rounded-lg bg-secondary/60 p-3 text-sm">Ya tiene Premium hasta el {fmtDate(premiumHasta.slice(0, 10), { year: true })}.</p>}
          <FormField label="Hasta" htmlFor="gift-hasta" tip={false}><DatePicker id="gift-hasta" quick="futuro" value={hasta} onChange={(v) => setHasta(v ?? in30())} /></FormField>
          <FormField label="Nota (solo para ti)" htmlFor="gift-nota" tip={false}><Input id="gift-nota" className="h-11" placeholder="Ej. Aliado, soporte, prueba" value={nota} onChange={(e) => setNota(e.target.value)} /></FormField>
          <div className="flex flex-wrap justify-end gap-2">
            {premiumHasta && <Button variant="ghost" className="mr-auto text-danger" disabled={busy} onClick={() => run(() => adminRevokeCourtesy(householdId), "Cortesía retirada")}>Quitar cortesía</Button>}
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button disabled={busy} onClick={() => run(() => adminGrantPremium(householdId, hasta, nota), "Premium regalado")}>{busy ? <Spinner /> : <Gift />} Regalar</Button>
          </div>
        </FieldGroup>
      </ResponsiveDialog>
    </>
  )
}

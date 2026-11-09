"use client"

// "Avisarme" desde la bandeja. En un gasto fijo guarda con cuántos días de anticipo te avisamos (fixed_expenses.aviso:
// lo leen los avisos por correo, WhatsApp, Telegram o la campana, según Ajustes › Alertas). En cualquier pago se puede
// además poner en el calendario del celular o de Google con un archivo .ics, con su alarma.
import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { FormField } from "@/components/mirai/field"
import { ChoiceCards } from "@/components/mirai/choice-cards"
import { SubmitButton } from "@/components/mirai/submit-button"
import { toast } from "@/components/mirai/toast"
import { useSave } from "@/hooks/use-book-data"
import { icsDeMov } from "@/lib/domain/bandeja"
import type { Mov } from "@/lib/domain/flujo-integral"
import { fmtDate } from "@/lib/format"
import { saveFile } from "@/lib/pwa/save-file"

const DIAS = [0, 1, 2, 3, 5, 7]
const esFijo = (m: Mov) => m.ref?.tabla === "fixed_expenses"
const diasTxt = (d: number) => (d === 0 ? "El mismo día" : d === 1 ? "1 día antes" : `${d} días antes`)

export function AvisoDialog({ mov, avisoActual, anticipo, onOpenChange }: { mov: Mov | null; avisoActual: number | null; anticipo: number; onOpenChange: (o: boolean) => void }) {
  return (
    <ResponsiveDialog open={!!mov} onOpenChange={onOpenChange} title={mov ? (esFijo(mov) ? `Avisarme de ${mov.n}` : `Recordatorio de ${mov.n}`) : ""}
      description={mov ? (esFijo(mov) ? `Vence el ${fmtDate(mov.fecha, { long: true })}. Elige con cuánto tiempo quieres que te recordemos.` : `Vence el ${fmtDate(mov.fecha, { long: true })}. Lo agregamos a tu calendario con una alarma.`) : undefined}>
      {mov && <Body mov={mov} avisoActual={avisoActual} anticipo={anticipo} onOpenChange={onOpenChange} />}
    </ResponsiveDialog>
  )
}

function Body({ mov, avisoActual, anticipo, onOpenChange }: { mov: Mov; avisoActual: number | null; anticipo: number; onOpenChange: (o: boolean) => void }) {
  const fijo = mov.ref?.tabla === "fixed_expenses" ? mov.ref.id : null
  const inicial = avisoActual ?? (DIAS.includes(anticipo) ? anticipo : 2)
  const [dias, setDias] = useState(String(DIAS.includes(inicial) ? inicial : 2))
  const save = useSave("fixed_expenses")

  const guardar = () => {
    if (!fijo) return
    save.mutate({ id: fijo, aviso: +dias } as never, {
      onSuccess: () => { toast.success("Aviso guardado", { description: `Te avisamos ${diasTxt(+dias).toLowerCase()} de cada pago de ${mov.n}.` }); onOpenChange(false) },
    })
  }
  const calendario = () => {
    const blob = new Blob([icsDeMov(mov, +dias)], { type: "text/calendar;charset=utf-8" })
    void saveFile(blob, `pagar-${mov.n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.ics`, `Pagar ${mov.n}`)
      .then((r) => { if (r === "descargado") toast.success("Recordatorio descargado", { description: "Ábrelo y se agrega a tu calendario con su alarma." }) })
  }

  return (
    <FieldGroup className="pb-2">
      <FormField label={fijo ? "¿Cuándo te avisamos?" : "¿Cuándo suena la alarma?"} tip={false}>
        <ChoiceCards value={dias} onChange={setDias} cols={3} items={DIAS.map((d) => ({ value: String(d), label: diasTxt(d) }))} />
      </FormField>
      {fijo
        ? <p className="text-sm text-muted-foreground">Te llega por los canales que elegiste en <Link href="/ajustes?tab=alertas" className="text-link hover:underline">Ajustes › Alertas</Link> (correo, WhatsApp, Telegram o la campana), en cada pago de este gasto fijo.</p>
        : <p className="text-sm text-muted-foreground">Te descargamos un recordatorio para tu calendario (Google, Outlook o el del celular) con una alarma.</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={calendario}>Agregar a mi calendario</Button>
        {fijo && <SubmitButton loading={save.isPending} onClick={guardar}>Guardar aviso</SubmitButton>}
      </div>
    </FieldGroup>
  )
}

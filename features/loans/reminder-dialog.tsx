"use client"

import { Sparkles } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { improveCobro } from "@/features/ai/actions"
import { useState } from "react"
import { Copy, Mail, MessageCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { Segmented } from "@/components/mirai/choice-cards"
import { useApp } from "@/components/app/app-context"
import type { LoanEngine } from "@/lib/domain"
import { fmtDate, fmtMoney } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"

type Tono = "amable" | "directo" | "firme"

/** cobroMsg de la v4 (plantillas sin IA). */
export function cobroMsg(e: LoanEngine, concepto: string, contacto: string, yo: string, tono: Tono) {
  const n = contacto.split(" ")[0]
  const cu = e.vencidas.length ? e.vencidas : e.next ? [e.next] : []
  const tot = fmtMoney(cu.reduce((a, c) => a + c.valor, 0))
  const fecha = cu[0] ? fmtDate(cu[0].fecha, { long: true }) : ""
  const venc = e.vencidas.length > 0
  const conc = concepto ? ` del préstamo "${concepto}"` : ""
  const saldo = fmtMoney(e.saldo)
  if (tono === "amable") return `Hola ${n}, ¿cómo estás? Te escribo para recordarte la cuota${conc}: ${tot}${venc ? `, que tenía fecha del ${fecha}` : `, para el ${fecha}`}. Quedan pendientes ${saldo} en total. Cualquier cosa me cuentas. ¡Gracias! ${yo.split(" ")[0]}`
  if (tono === "directo") return `Hola ${n}. Te recuerdo el pago${conc} por ${tot} (${venc ? "venció el" : "vence el"} ${fecha}). Saldo pendiente: ${saldo}. ¿Me confirmas cuándo me lo puedes transferir? Gracias.`
  return `Hola ${n}. El pago${conc} por ${tot} está atrasado desde el ${fecha}${e.mora ? ` (${e.mora} días)` : ""}. Necesito que lo pongamos al día lo antes posible. Saldo total pendiente: ${saldo}. Por favor respóndeme hoy con la fecha de pago.`
}

export function ReminderDialog({ open, onOpenChange, engine, concepto, contact }: { open: boolean; onOpenChange: (o: boolean) => void; engine: LoanEngine; concepto: string; contact: Row<"contacts"> | null }) {
  const { user } = useApp()
  const [tono, setTono] = useState<Tono>(engine.mora > 0 ? "firme" : "amable")
  const [msg, setMsg] = useState(() => cobroMsg(engine, concepto, contact?.nombre ?? "", user.nombre, engine.mora > 0 ? "firme" : "amable"))
  const [improving, setImproving] = useState(false)
  const tel = (contact?.telefono ?? "").replace(/\D/g, "")
  const wa = tel ? `https://wa.me/${tel.length === 10 ? "57" + tel : tel}?text=${encodeURIComponent(msg)}` : null
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} mdesc="cobro" title={`Recordarle a ${contact?.nombre ?? "tu contacto"}`}>
      <div className="grid gap-4 pb-2">
        <p className="text-sm text-muted-foreground">{[contact?.telefono, contact?.email].filter(Boolean).join(" · ") || "Este contacto no tiene celular ni correo."}</p>
        <Segmented value={tono} onChange={(v) => { setTono(v as Tono); setMsg(cobroMsg(engine, concepto, contact?.nombre ?? "", user.nombre, v as Tono)) }}
          items={[{ value: "amable", label: "Amable" }, { value: "directo", label: "Directo" }, { value: "firme", label: "Firme" }]} />
        <Textarea rows={6} value={msg} onChange={(e) => setMsg(e.target.value)} aria-label="Mensaje" />
        <div className="flex flex-wrap gap-2">
          <Button variant="soft" disabled={improving} onClick={async () => { setImproving(true); const r = await improveCobro(msg, tono); setImproving(false); if (r.ok) setMsg(r.text); else toast.error(r.text) }}>{improving ? <Spinner /> : <Sparkles />} Mejorar con IA</Button>
          <Button variant="outline" onClick={() => navigator.clipboard.writeText(msg).then(() => toast("Copiado"))}><Copy /> Copiar</Button>
          {contact?.email && <Button variant="outline" asChild><a href={`mailto:${contact.email}?subject=${encodeURIComponent("Recordatorio de pago")}&body=${encodeURIComponent(msg)}`}><Mail /> Enviar por correo</a></Button>}
          {wa ? <Button asChild className="bg-[#25D366] text-white hover:bg-[#1ebe5a]"><a href={wa} target="_blank" rel="noreferrer"><MessageCircle /> Abrir WhatsApp</a></Button>
            : <p className="text-sm text-muted-foreground">Agrega el celular del contacto para enviar por WhatsApp.</p>}
        </div>
      </div>
    </ResponsiveDialog>
  )
}

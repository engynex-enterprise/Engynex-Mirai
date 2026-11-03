"use client"

import { Sparkles } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { improveCobro } from "@/features/ai/actions"
import { useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Copy, KeyRound, Mail, MessageCircle } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { Segmented } from "@/components/mirai/choice-cards"
import { useApp } from "@/components/app/app-context"
import type { LoanEngine } from "@/lib/domain"
import { fmtDate, fmtMoney } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"
import { cobroTexto, normalizarCobros } from "@/lib/domain/cobros"
import { createClient } from "@/utils/supabase/client"
import { Checkbox } from "@/components/ui/checkbox"
import { cobroWaStatus, sendCobroWhatsApp } from "@/features/notify/actions"

type Tono = "amable" | "directo" | "firme"
type Pago = "no" | "principal" | "todas"

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

/**
 * Enviar el recordatorio desde el número oficial de Mirai (plantilla aprobada por Meta). Opcional: solo aparece si la
 * plantilla existe, y pide confirmar que la persona aceptó recibirlo.
 */
function MiraiWhatsApp({ loanId, contacto, open }: { loanId?: string; contacto: string; open: boolean }) {
  const { data: st } = useQuery({ queryKey: ["cobro-wa-status"], enabled: open && !!loanId, staleTime: 5 * 60_000, queryFn: () => cobroWaStatus() })
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!loanId || !st?.disponible) return null
  return (
    <div className="grid gap-2 rounded-xl border p-3">
      <p className="flex items-center gap-2 text-sm font-semibold"><MessageCircle className="size-4 text-muted-foreground" aria-hidden /> Enviar desde el WhatsApp de Mirai</p>
      <p className="text-xs text-muted-foreground">Le llega a {contacto} un mensaje oficial de Mirai con la cuota, a tu nombre. Uno por día.</p>
      {!st.verificado ? <p className="text-sm text-muted-foreground">{st.motivo ?? "Primero verifica tu WhatsApp en Ajustes › Alertas (envíate una prueba)."} <Link href="/ajustes?tab=alertas" className="font-semibold text-link hover:underline">Ir a Alertas</Link></p> : <>
        <label className="flex items-start gap-2 text-sm"><Checkbox checked={ok} onCheckedChange={(v) => setOk(v === true)} className="mt-0.5" aria-label="Confirmo que aceptó recibir recordatorios" />{contacto} aceptó que le recuerde sus pagos por WhatsApp.</label>
        <Button variant="outline" className="w-fit" disabled={!ok || busy} onClick={async () => {
          setBusy(true); const r = await sendCobroWhatsApp({ loanId, consentimiento: true }); setBusy(false)
          toast[r.ok ? "success" : "error"](r.ok ? "Recordatorio enviado" : "No se pudo enviar", { description: r.msg })
        }}>{busy ? <Spinner /> : <MessageCircle />} Enviar desde Mirai</Button>
      </>}
    </div>
  )
}

export function ReminderDialog({ open, onOpenChange, engine, concepto, contact, loanId }: { open: boolean; onOpenChange: (o: boolean) => void; engine: LoanEngine; concepto: string; contact: Row<"contacts"> | null; loanId?: string }) {
  const { user } = useApp()
  const [tono, setTono] = useState<Tono>(engine.mora > 0 ? "firme" : "amable")
  const [msg, setMsg] = useState(() => cobroMsg(engine, concepto, contact?.nombre ?? "", user.nombre, engine.mora > 0 ? "firme" : "amable"))
  const [improving, setImproving] = useState(false)
  // Tus llaves y cuentas de Perfil › Recibe pagos (la principal por defecto) van al final del mensaje
  const { data: cobros = [] } = useQuery({
    queryKey: ["profile", user.id, "cobro"], enabled: open,
    queryFn: async () => normalizarCobros((await createClient().from("profiles").select("cobro").eq("id", user.id).single()).data?.cobro),
  })
  const [pago, setPago] = useState<Pago>("principal")
  const bloque = cobros.length && pago !== "no" ? cobroTexto(user.nombre, cobros, cobros.length > 1 ? pago : "todas", "Me puedes pagar aquí:") : ""
  const full = bloque ? `${msg.trimEnd()}\n\n${bloque}` : msg
  const tel = (contact?.telefono ?? "").replace(/\D/g, "")
  const wa = tel ? `https://wa.me/${tel.length === 10 ? "57" + tel : tel}?text=${encodeURIComponent(full)}` : null
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} mdesc="cobro" title={`Recordarle a ${contact?.nombre ?? "tu contacto"}`}>
      <div className="grid gap-4 pb-2">
        <p className="text-sm text-muted-foreground">{[contact?.telefono, contact?.email].filter(Boolean).join(" · ") || "Este contacto no tiene celular ni correo."}</p>
        <Segmented value={tono} onChange={(v) => { setTono(v as Tono); setMsg(cobroMsg(engine, concepto, contact?.nombre ?? "", user.nombre, v as Tono)) }}
          items={[{ value: "amable", label: "Amable" }, { value: "directo", label: "Directo" }, { value: "firme", label: "Firme" }]} />
        <Textarea rows={6} value={msg} onChange={(e) => setMsg(e.target.value)} aria-label="Mensaje" />
        {cobros.length > 0 ? (
          <div className="grid gap-2 rounded-xl bg-secondary/60 p-3">
            <p className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="size-4 text-muted-foreground" aria-hidden /> Cómo pagarte</p>
            <Segmented value={pago} onChange={(v) => setPago(v as Pago)}
              items={[{ value: "principal", label: cobros.length > 1 ? "La principal" : "Incluir" }, ...(cobros.length > 1 ? [{ value: "todas", label: "Todas" }] : []), { value: "no", label: "No incluir" }]} />
            {bloque && <pre className="text-[13px] whitespace-pre-wrap break-words text-muted-foreground" data-money aria-label="Datos de pago que se agregan">{bloque}</pre>}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">¿Quieres que vea dónde pagarte? <Link href="/perfil#cobro" className="font-semibold text-link hover:underline">Agrega tus llaves o cuentas en tu perfil</Link>.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button variant="soft" disabled={improving} onClick={async () => { setImproving(true); const r = await improveCobro(msg, tono); setImproving(false); if (r.ok) setMsg(r.text); else toast.error(r.text) }}>{improving ? <Spinner /> : <Sparkles />} Mejorar con IA</Button>
          <Button variant="outline" onClick={() => navigator.clipboard.writeText(full).then(() => toast("Copiado"))}><Copy /> Copiar</Button>
          {contact?.email && <Button variant="outline" asChild><a href={`mailto:${contact.email}?subject=${encodeURIComponent("Recordatorio de pago")}&body=${encodeURIComponent(full)}`}><Mail /> Enviar por correo</a></Button>}
          {wa ? <Button asChild className="bg-[#25D366] text-white hover:bg-[#1ebe5a]"><a href={wa} target="_blank" rel="noreferrer"><MessageCircle /> Abrir WhatsApp</a></Button>
            : <p className="text-sm text-muted-foreground">Agrega el celular del contacto para enviar por WhatsApp.</p>}
        </div>
        {tel && <MiraiWhatsApp loanId={loanId} contacto={contact?.nombre.split(" ")[0] || "tu contacto"} open={open} />}
      </div>
    </ResponsiveDialog>
  )
}

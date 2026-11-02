"use client"

import { useState } from "react"
import { MailCheck, RotateCw, X } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Notice } from "@/components/mirai/notice"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { StatusPill } from "@/components/mirai/status-pill"
import { SubmitButton } from "@/components/mirai/submit-button"
import { Spinner } from "@/components/ui/spinner"
import { checkNewEmail, emailChangeState, type AccountState } from "@/lib/account/account"
import { haceCuanto } from "@/lib/household/invites"
import { cancelEmailChange, requestEmailChange, resendEmailChange } from "./actions"

/** Ventana "Cambiar el correo de tu cuenta". */
export function EmailChangeDialog({ open, onOpenChange, current, initial = "", onDone }: { open: boolean; onOpenChange: (o: boolean) => void; current: string; initial?: string; onDone: () => void }) {
  const [email, setEmail] = useState(initial)
  const [busy, setBusy] = useState(false)
  const v = checkNewEmail(current, email)
  const send = async () => {
    if (!v.ok || busy) return
    setBusy(true)
    const r = await requestEmailChange(email).catch(() => ({ ok: false, msg: "No pudimos pedir el cambio. Intenta de nuevo." }))
    setBusy(false)
    if (!r.ok) return toast.error(r.msg)
    toast.success(r.msg)
    setEmail("")
    onOpenChange(false)
    onDone()
  }
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} title="Cambiar el correo de tu cuenta"
      description="Tus hogares, libros y movimientos siguen en tu cuenta: solo cambia el correo con el que entras y al que te llegan los avisos."
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><SubmitButton disabled={!v.ok} loading={busy} loadingText="Enviando…" onClick={send} hint={email ? (v.ok ? "" : v.msg) : "Escribe tu correo nuevo"}>Enviar enlace de confirmación</SubmitButton></>}>
      <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); send() }}>
        <p className="text-sm">Correo actual: <b className="break-all">{current}</b></p>
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="cuenta-correo-nuevo">Correo nuevo
          <Input id="cuenta-correo-nuevo" type="email" inputMode="email" autoComplete="email" className="h-11" placeholder="tu.nuevo@correo.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {email && !v.ok && <p className="text-sm text-danger" role="alert">{v.msg}</p>}
        <Notice tone="info" title="Así funciona">
          Te enviamos un enlace a tu correo nuevo para confirmar que es tuyo. Por seguridad también te llega uno a tu correo actual:
          ábrelos los dos. Hasta que confirmes, sigues entrando con el correo de siempre. Los enlaces vencen en 1 hora.
        </Notice>
      </form>
    </ResponsiveDialog>
  )
}

/** Tarjeta del cambio pendiente: a qué correo, desde cuándo, reenviar y cancelar. */
export function PendingEmail({ account, onDone }: { account: AccountState; onDone: () => void }) {
  const st = emailChangeState(account)
  const [busy, setBusy] = useState<"re" | "cx" | null>(null)
  if (st.estado !== "pendiente") return null
  const run = async (k: "re" | "cx", f: () => Promise<{ ok: boolean; msg: string }>) => {
    setBusy(k)
    const r = await f().catch(() => ({ ok: false, msg: "Intenta de nuevo en un momento." }))
    setBusy(null)
    if (!r.ok) return toast.error(r.msg)
    toast.success(r.msg)
    onDone()
  }
  return (
    <div className="grid gap-2 rounded-lg border border-warning/40 bg-warning-soft/40 p-3" data-testid="correo-pendiente">
      <div className="flex flex-wrap items-center gap-2">
        <MailCheck className="size-4 text-warning" />
        <p className="min-w-0 flex-1 text-sm">Cambio a <b className="break-all">{st.to}</b></p>
        <StatusPill tone="porVencer">Pendiente de confirmar</StatusPill>
      </div>
      <p className="text-xs text-muted-foreground">
        {st.falta === "uno" ? "Ya confirmaste uno de los enlaces. Falta abrir el que llegó al otro correo." : "Abre el enlace que te llegó a tu correo nuevo y el que llegó a tu correo actual."}
        {st.sentAt ? ` Lo enviamos ${haceCuanto(st.sentAt)}.` : ""} ¿No te llegó? Revisa la carpeta de spam o reenvíalo.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("re", resendEmailChange)}>{busy === "re" ? <Spinner /> : <RotateCw />} Reenviar enlace</Button>
        <Button size="sm" variant="ghost" className="text-danger" disabled={!!busy} onClick={() => run("cx", cancelEmailChange)}>{busy === "cx" ? <Spinner /> : <X />} Cancelar el cambio</Button>
      </div>
    </div>
  )
}

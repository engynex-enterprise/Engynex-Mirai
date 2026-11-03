"use client"

import { useState } from "react"
import { CircleCheck, CircleDashed } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Combobox } from "@/components/mirai/combobox"
import { Notice } from "@/components/mirai/notice"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { checkNewEmail, googleIdentities, moveSteps, type AccountState } from "@/lib/account/account"
import { cn } from "@/lib/utils"
import { requestEmailChange } from "./api"

/**
 * "Mi correo de Google ya no lo uso": pasos guiados para seguir en la MISMA cuenta (los datos no se pierden).
 * A) el correo nuevo también es de Google: se conecta esa cuenta y se quita la vieja; B) no es de Google: se crea una
 * contraseña. En los dos casos se cambia el correo de la cuenta para que los avisos lleguen al nuevo.
 */
export function MoveAccountDialog({ open, onOpenChange, account, onCreatePassword, onLinkGoogle, onRemoveGoogle, onDone }: {
  open: boolean; onOpenChange: (o: boolean) => void; account: AccountState
  onCreatePassword: () => void; onLinkGoogle: (oldIdentityId?: string) => void; onRemoveGoogle: (identityId: string) => void; onDone: () => void
}) {
  const gs = googleIdentities(account)
  const [nuevo, setNuevo] = useState(account.new_email ?? "")
  const [old, setOld] = useState(gs[0]?.id ?? "")
  const [busy, setBusy] = useState(false)
  const oldG = gs.find((g) => g.id === old)
  const steps = moveSteps(account, nuevo, oldG?.email)
  const v = checkNewEmail(account.email, nuevo)
  const esGoogle = /@(gmail|googlemail)\.com$/i.test(nuevo.trim())

  const cambiar = async () => {
    if (!v.ok) return toast.error(v.msg)
    setBusy(true)
    const r = await requestEmailChange(nuevo).catch(() => ({ ok: false, msg: "Intenta de nuevo en un momento." }))
    setBusy(false)
    if (!r.ok) return toast.error(r.msg)
    toast.success(r.msg)
    onDone()
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} wide title="Pasarte a tu correo nuevo"
      description="Sigues en tu misma cuenta: tus hogares, libros y movimientos no se pierden. No crees una cuenta nueva, porque quedaría vacía."
      footer={<Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>}>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium" htmlFor="mv-nuevo">Tu correo nuevo
            <Input id="mv-nuevo" type="email" inputMode="email" className="h-11" placeholder="tu.nuevo@correo.com" value={nuevo} onChange={(e) => setNuevo(e.target.value)} />
          </label>
          {gs.length > 0 && (
            <div className="grid gap-1.5 text-sm font-medium"><label htmlFor="mv-viejo">La cuenta de Google que ya no usas</label>
              <Combobox id="mv-viejo" value={old} onChange={setOld} options={gs.map((g) => ({ value: g.id, label: g.email ?? "Cuenta de Google", icon: "mail" }))} />
            </div>
          )}
        </div>
        {nuevo && !v.ok && !steps[0].done && <p className="text-sm text-danger" role="alert">{v.msg}</p>}
        <ol className="grid gap-2" aria-label="Pasos para cambiarte de cuenta">
          {steps.map((s, i) => (
            <li key={s.key} className={cn("grid gap-2 rounded-lg border p-3", s.done && "border-success/40 bg-success-soft/30")} data-step={s.key} data-done={s.done || undefined}>
              <div className="flex items-start gap-2">
                {s.done ? <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-label="Listo" /> : <CircleDashed className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-label="Pendiente" />}
                <div className="grid min-w-0 gap-0.5"><p className="font-semibold">{i + 1}. {s.title}</p><p className="text-sm text-muted-foreground">{s.blocked && !s.done ? s.blocked : s.desc}</p></div>
              </div>
              {!s.done && s.key === "correo" && (
                <Button size="sm" className="w-fit" disabled={!v.ok || busy || account.new_email?.toLowerCase() === nuevo.trim().toLowerCase()} onClick={cambiar}>{busy && <Spinner />} Cambiar mi correo a {nuevo.trim() || "…"}</Button>
              )}
              {!s.done && s.key === "entrar" && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant={esGoogle ? "outline" : "default"} onClick={onCreatePassword}>Crear una contraseña</Button>
                  <Button size="sm" variant={esGoogle ? "default" : "outline"} onClick={() => onLinkGoogle(old || undefined)}>Conectar mi cuenta de Google nueva</Button>
                </div>
              )}
              {!s.done && s.key === "quitar" && oldG && (
                <Button size="sm" variant="outline" className="w-fit text-danger" disabled={!!s.blocked} onClick={() => onRemoveGoogle(oldG.id)}>Quitar {oldG.email}</Button>
              )}
            </li>
          ))}
        </ol>
        <Notice tone="info" title="¿Tu correo nuevo es de Google (Gmail)?">
          Conéctalo con <b>Conectar mi cuenta de Google nueva</b> y luego quita la vieja. Si no es de Google, crea una contraseña: entrarás con tu correo nuevo y esa contraseña.
        </Notice>
      </div>
    </ResponsiveDialog>
  )
}

"use client"

// Verificación en dos pasos con AUTH_PROVIDER=mirai (v7, V7-B): el código de la app de autenticación, un código de
// respaldo, y el re-enrolamiento cuando el TOTP de Supabase no se pudo migrar (`?reactivar=1`).
import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { QRCodeSVG } from "qrcode.react"
import { toast } from "@/components/mirai/toast"
import { Notice } from "@/components/mirai/notice"
import { SubmitButton } from "@/components/mirai/submit-button"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { AuthHeader, PasswordInput } from "@/components/auth/auth-ui"
import { safeNext } from "@/lib/security/safe-next"

const auth = () => import("@/lib/auth/mirai")

function Otp({ value, onChange, onDone, busy }: { value: string; onChange: (v: string) => void; onDone: (v: string) => void; busy: boolean }) {
  return (
    <InputOTP maxLength={6} value={value} onChange={(v) => { const d = v.replace(/\D/g, ""); onChange(d); if (d.length === 6) onDone(d) }} autoFocus inputMode="numeric" autoComplete="one-time-code" disabled={busy} aria-label="Código de verificación">
      <InputOTPGroup className="w-full justify-between">
        {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} className="h-14 w-12 text-lg" />)}
      </InputOTPGroup>
    </InputOTP>
  )
}

export function MiraiVerification() {
  const router = useRouter()
  const params = useSearchParams()
  const next = safeNext(params.get("next"))
  const reactivar = params.get("reactivar") === "1"
  const [mode, setMode] = useState<"codigo" | "respaldo">("codigo")
  const [code, setCode] = useState("")
  const [backup, setBackup] = useState("")
  const [busy, setBusy] = useState(false)
  const go = () => { router.replace(next); router.refresh() }
  const salir = async () => { await (await auth()).signOut(); router.replace("/login") }

  if (reactivar) return <Reenroll onDone={go} onExit={salir} />

  async function verify(c: string) {
    if (c.length !== 6 || busy) return
    setBusy(true)
    const r = await (await auth()).verifyTotp(c)
    if (!r.ok) {
      setBusy(false)
      setCode("")
      if (r.code === "INVALID_TWO_FACTOR_COOKIE" || r.code === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE") { toast.error(r.msg); router.replace(`/login?next=${encodeURIComponent(next)}`); return }
      return toast.error("El código no es válido", { description: r.msg })
    }
    go()
  }

  async function verifyBackup() {
    const c = backup.trim()
    if (c.length < 8 || busy) return
    setBusy(true)
    const r = await (await auth()).verifyBackupCode(c)
    setBusy(false)
    if (!r.ok) return toast.error("Ese código no sirvió", { description: r.msg })
    toast.success("Entraste con un código de respaldo", { description: "Ese código ya no sirve. Genera otros en Ajustes › Seguridad." })
    go()
  }

  return (
    <div className="grid gap-6">
      <AuthHeader icon="shield-check" title="Verificación en dos pasos" description={mode === "codigo" ? "Escribe el código de 6 dígitos de tu app de autenticación (Google Authenticator, Microsoft Authenticator…)." : "Escribe uno de los códigos de respaldo que guardaste al activar la verificación."} />
      {mode === "codigo" ? (
        <>
          <Otp value={code} onChange={setCode} onDone={verify} busy={busy} />
          <SubmitButton className="h-11 w-full" disabled={code.length !== 6} loading={busy} loadingText="Verificando…" onClick={() => verify(code)} hint="Escribe los 6 dígitos del código">Verificar</SubmitButton>
          <Button variant="link" className="h-auto p-0" onClick={() => setMode("respaldo")}>¿No tienes el celular? Usa un código de respaldo</Button>
        </>
      ) : (
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); verifyBackup() }}>
          <Field>
            <FieldLabel htmlFor="backup">Código de respaldo</FieldLabel>
            <Input id="backup" className="h-11 font-mono tracking-wider" autoComplete="one-time-code" value={backup} onChange={(e) => setBackup(e.target.value)} autoFocus />
            <FieldDescription>Cada código sirve una sola vez.</FieldDescription>
          </Field>
          <SubmitButton type="submit" className="h-11 w-full" disabled={backup.trim().length < 8} loading={busy} loadingText="Verificando…" hint="Escribe el código completo">Entrar</SubmitButton>
          <Button type="button" variant="link" className="h-auto p-0" onClick={() => setMode("codigo")}>Usar la app de autenticación</Button>
        </form>
      )}
      <Button variant="ghost" onClick={salir}>Salir</Button>
    </div>
  )
}

/** El TOTP de antes no se pudo traer al Mirai nuevo: hay que activarlo otra vez (QR nuevo) antes de seguir. */
function Reenroll({ onDone, onExit }: { onDone: () => void; onExit: () => void }) {
  const [pw, setPw] = useState("")
  const [step, setStep] = useState<{ uri: string; secret: string; codes: string[] } | null>(null)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)

  async function start() {
    setBusy(true)
    const r = await (await auth()).mfaEnable(pw || undefined)
    setBusy(false)
    if (!r.ok) return toast.error("No pudimos empezar", { description: r.msg })
    setStep({ uri: r.uri ?? "", secret: r.secret ?? "", codes: r.backupCodes ?? [] })
  }
  async function confirm(c: string) {
    if (c.length !== 6 || busy) return
    setBusy(true)
    const r = await (await auth()).verifyTotp(c)
    setBusy(false)
    if (!r.ok) { setCode(""); return toast.error("El código no es válido", { description: "Revisa que la hora de tu celular esté bien." }) }
    toast.success("Verificación en dos pasos activada")
    onDone()
  }

  return (
    <div className="grid gap-6">
      <AuthHeader icon="shield-check" title="Activa otra vez la verificación en dos pasos" description="Actualizamos Mirai y tu app de autenticación necesita un código nuevo. Toma un minuto." />
      {!step ? (
        <form className="grid gap-4" onSubmit={(e) => { e.preventDefault(); start() }}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="pw">Tu contraseña</FieldLabel>
              <PasswordInput id="pw" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
              <FieldDescription>Si entras solo con Google, déjala vacía.</FieldDescription>
            </Field>
            <SubmitButton type="submit" className="h-11 w-full" loading={busy} loadingText="Preparando…" hint="Escribe tu contraseña">Empezar</SubmitButton>
          </FieldGroup>
        </form>
      ) : (
        <div className="grid gap-4">
          <div className="mx-auto w-fit rounded-lg bg-white p-3"><QRCodeSVG value={step.uri} size={168} title="Código QR para tu app de autenticación" /></div>
          <ol className="ml-5 list-decimal text-sm">
            <li>Abre tu app de autenticación y borra la cuenta vieja de Mirai.</li>
            <li>Escanea este código (o escribe la clave <code className="break-all">{step.secret}</code>).</li>
            <li>Escribe el código de 6 dígitos que aparece.</li>
          </ol>
          <Otp value={code} onChange={setCode} onDone={confirm} busy={busy} />
          {step.codes.length > 0 && (
            <Notice tone="info" title="Guarda tus códigos de respaldo">
              Sirven para entrar si pierdes el celular (cada uno una sola vez): <span className="font-mono break-all">{step.codes.join(" · ")}</span>
            </Notice>
          )}
        </div>
      )}
      <Button variant="ghost" onClick={onExit}>Salir</Button>
    </div>
  )
}

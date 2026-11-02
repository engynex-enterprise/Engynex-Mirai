"use client"

import { useEffect, useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { LogOut, ShieldCheck, ShieldOff } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusPill } from "@/components/mirai/status-pill"
import { Combobox } from "@/components/mirai/combobox"
import { Notice } from "@/components/mirai/notice"
import { SubmitButton } from "@/components/mirai/submit-button"
import { Tip } from "@/components/mirai/tip"
import { PasswordMeter, passwordScore } from "@/components/auth/password-meter"
import { createClient } from "@/utils/supabase/client"
import { SettingRow, SettingSection, SettingStack } from "../ui"
import { usePrefs } from "../prefs"

type Factor = { id: string; friendly_name?: string; status: string }

export function SeguridadTab() {
  const sb = createClient()
  const { prefs, save } = usePrefs()
  const [factors, setFactors] = useState<Factor[] | null>(null)
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null)
  const [code, setCode] = useState("")
  const [pw, setPw] = useState("")
  const [busy, setBusy] = useState(false)
  const [pwBusy, setPwBusy] = useState(false)
  const pwOk = pw.length >= 10 && passwordScore(pw) >= 3
  const load = () => sb.auth.mfa.listFactors().then(({ data }) => setFactors((data?.totp ?? []) as Factor[]))
  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const verified = factors?.filter((f) => f.status === "verified") ?? []

  const start = async () => {
    for (const f of factors?.filter((x) => x.status !== "verified") ?? []) await sb.auth.mfa.unenroll({ factorId: f.id })
    const { data, error } = await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: `Mirai ${new Date().toISOString().slice(0, 10)}` })
    if (error) return toast.error("No se pudo iniciar", { description: error.message })
    setEnroll({ id: data.id, qr: data.totp.uri, secret: data.totp.secret })
  }
  const confirm = async () => {
    if (!enroll || code.length !== 6) return
    setBusy(true)
    const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: enroll.id, code })
    setBusy(false)
    if (error) { setCode(""); return toast.error("El código no es válido", { description: "Revisa que la hora de tu celular esté bien." }) }
    toast.success("Verificación en dos pasos activada"); setEnroll(null); setCode(""); load()
  }
  const off = async (id: string) => { const { error } = await sb.auth.mfa.unenroll({ factorId: id }); if (error) return toast.error("No se pudo desactivar", { description: error.message }); toast("Verificación en dos pasos desactivada"); load() }
  const changePw = async () => {
    if (!pwOk) return toast.error("La contraseña es muy débil")
    setPwBusy(true)
    const { error } = await sb.auth.updateUser({ password: pw })
    setPwBusy(false)
    if (error) return toast.error("No se pudo cambiar", { description: error.message })
    toast.success("Contraseña actualizada"); setPw("")
  }

  return (
    <SettingStack>
      <SettingSection icon="key-round" title="Contraseña" desc="Si entras con Google o enlace mágico, aquí puedes crear una contraseña también.">
        <form className="grid max-w-md gap-3" onSubmit={(e) => { e.preventDefault(); if (pwOk && !pwBusy) changePw() }}>
          <Input type="password" autoComplete="new-password" className="h-11" placeholder="Contraseña nueva" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="Contraseña nueva" />
          {pw ? <PasswordMeter value={pw} /> : <p className="text-xs text-muted-foreground">Mínimo 10 caracteres. Mezcla letras, números y algún símbolo.</p>}
          <SubmitButton className="w-fit" disabled={!pwOk} loading={pwBusy} loadingText="Cambiando…" onClick={changePw}
            hint={pw ? "Hazla más segura: al menos 10 caracteres con letras, números y algún símbolo" : "Escribe la contraseña nueva"}>Cambiar contraseña</SubmitButton>
        </form>
      </SettingSection>
      <SettingSection icon="shield-check" title="Verificación en dos pasos" desc="Además de tu contraseña te pedimos un código de tu celular. Así nadie entra aunque sepa tu contraseña.">
        {factors === null ? <Skeleton className="h-12 w-full max-w-md" /> : verified.length ? (
          <div className="grid gap-2">
            <Tip label="Al entrar te pediremos el código de tu app de autenticación"><span className="w-fit"><StatusPill tone="pagado" check>Activada</StatusPill></span></Tip>
            {verified.map((f) => <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"><span className="min-w-0 break-words">{f.friendly_name ?? "App de autenticación"}</span><Button variant="ghost" className="text-danger" onClick={() => off(f.id)}><ShieldOff /> Desactivar</Button></div>)}
            <p className="text-sm text-muted-foreground">Si pierdes el celular, recupera el acceso con “¿La olvidaste?” en el inicio de sesión y escríbenos al correo de soporte de tu hogar.</p>
          </div>
        ) : enroll ? (
          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <div className="w-fit rounded-lg bg-white p-3"><QRCodeSVG value={enroll.qr} size={168} title="Código QR para tu app de autenticación" /></div>
            <div className="grid content-start gap-3">
              <ol className="ml-5 list-decimal text-sm"><li>Abre Google Authenticator, Microsoft Authenticator o similar.</li><li>Escanea el código (o escribe la clave <code className="break-all">{enroll.secret}</code>).</li><li>Escribe el código de 6 dígitos que aparece.</li></ol>
              <InputOTP maxLength={6} value={code} onChange={setCode} inputMode="numeric" aria-label="Código"><InputOTPGroup>{[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}</InputOTPGroup></InputOTP>
              <div className="flex gap-2"><SubmitButton onClick={confirm} disabled={code.length !== 6} loading={busy} loadingText="Activando…" hint="Escribe los 6 dígitos de tu app">Activar</SubmitButton><Button variant="ghost" onClick={() => { setEnroll(null); setCode("") }}>Cancelar</Button></div>
            </div>
          </div>
        ) : <Button className="w-fit" onClick={start}><ShieldCheck /> Activar verificación en dos pasos</Button>}
      </SettingSection>
      <SettingSection icon="lock" title="Bloqueo y sesiones">
        <SettingRow title="Bloquear por inactividad" desc="Pide entrar de nuevo si no usas Mirai por un tiempo.">
          <div className="w-48"><Combobox value={String(prefs?.lock_minutes ?? 0)} onChange={(v) => save({ lock_minutes: +v })} options={[["0", "Nunca"], ["5", "5 minutos"], ["15", "15 minutos"], ["30", "30 minutos"], ["60", "1 hora"]].map(([value, label]) => ({ value, label }))} /></div>
        </SettingRow>
        <SettingRow title="Cerrar sesión en otros dispositivos" desc="Útil si entraste desde un computador que no es tuyo.">
          <Button variant="outline" onClick={async () => { await sb.auth.signOut({ scope: "others" }); toast.success("Cerramos tu sesión en los demás dispositivos") }}><LogOut /> Cerrar en otros</Button>
        </SettingRow>
      </SettingSection>
      <Notice tone="info" title="Tus datos están protegidos en el servidor">Cada hogar solo puede ver su información (reglas de seguridad en la base de datos) y las claves de tus servicios se guardan cifradas.</Notice>
    </SettingStack>
  )
}

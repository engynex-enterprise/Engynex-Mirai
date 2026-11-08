"use client"

// Ajustes › Seguridad: verificación en dos pasos de Better Auth (QR, códigos de respaldo, desactivar con la
// contraseña) y cerrar sesión en los otros dispositivos.
import { useState } from "react"
import { useQuery } from "@/lib/query"
import { QRCodeSVG } from "qrcode.react"
import Link from "next/link"
import { KeyRound, LogOut, RefreshCw, ShieldCheck, ShieldOff } from "lucide-react"
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
import { SettingRow, SettingSection, SettingStack } from "../ui"
import { usePrefs } from "../prefs"

const auth = () => import("@/lib/auth/mirai")

export function SeguridadTab() {
  const { prefs, save } = usePrefs()
  const { data: enabled = null, refetch } = useQuery({ queryKey: ["mirai-2fa"], queryFn: async () => !!(await (await auth()).currentUser())?.twoFactorEnabled })
  const [pw, setPw] = useState("")
  const [enroll, setEnroll] = useState<{ uri: string; secret: string; codes: string[] } | null>(null)
  const [codes, setCodes] = useState<string[] | null>(null)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const load = () => void refetch()

  const start = async () => {
    setBusy(true)
    const r = await (await auth()).mfaEnable(pw || undefined)
    setBusy(false)
    if (!r.ok) return toast.error("No se pudo iniciar", { description: r.msg })
    setEnroll({ uri: r.uri ?? "", secret: r.secret ?? "", codes: r.backupCodes ?? [] })
  }
  const confirm = async () => {
    if (!enroll || code.length !== 6) return
    setBusy(true)
    const r = await (await auth()).verifyTotp(code)
    setBusy(false)
    if (!r.ok) { setCode(""); return toast.error("El código no es válido", { description: "Revisa que la hora de tu celular esté bien." }) }
    toast.success("Verificación en dos pasos activada")
    setCodes(enroll.codes); setEnroll(null); setCode(""); setPw(""); load()
  }
  const off = async () => {
    setBusy(true)
    const r = await (await auth()).mfaDisable(pw || undefined)
    setBusy(false)
    if (!r.ok) return toast.error("No se pudo desactivar", { description: r.msg })
    toast("Verificación en dos pasos desactivada"); setPw(""); setCodes(null); load()
  }
  const regen = async () => {
    setBusy(true)
    const r = await (await auth()).newBackupCodes(pw || undefined)
    setBusy(false)
    if (!r.ok) return toast.error("No pudimos crear los códigos", { description: r.msg })
    setCodes(r.codes ?? []); setPw("")
  }
  const pwField = <Input type="password" autoComplete="current-password" className="h-11 max-w-xs" placeholder="Tu contraseña (vacía si entras solo con Google)" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="Tu contraseña" />

  return (
    <SettingStack>
      <SettingSection icon="key-round" title="Contraseña y formas de entrar" desc="Crea o cambia tu contraseña, conecta o quita tu cuenta de Google y cambia tu correo.">
        <SettingRow title="Cuentas conectadas" desc="Están en tu perfil, en la tarjeta Cuentas conectadas.">
          <Button variant="outline" asChild><Link href="/perfil#cuentas"><KeyRound /> Ir a Cuentas conectadas</Link></Button>
        </SettingRow>
      </SettingSection>
      <SettingSection icon="shield-check" title="Verificación en dos pasos" desc="Además de tu contraseña te pedimos un código de tu celular. Así nadie entra aunque sepa tu contraseña.">
        {enabled === null ? <Skeleton className="h-12 w-full max-w-md" /> : enabled ? (
          <div className="grid gap-3">
            <Tip label="Al entrar te pediremos el código de tu app de autenticación"><span className="w-fit"><StatusPill tone="pagado" check>Activada</StatusPill></span></Tip>
            <div className="flex flex-wrap items-center gap-2">{pwField}
              <Button variant="outline" disabled={busy} onClick={regen}><RefreshCw /> Códigos de respaldo nuevos</Button>
              <Button variant="ghost" className="text-danger" disabled={busy} onClick={off}><ShieldOff /> Desactivar</Button>
            </div>
            <p className="text-sm text-muted-foreground">Si pierdes el celular, entra con uno de tus códigos de respaldo. Si tampoco los tienes, escríbenos al correo de soporte.</p>
          </div>
        ) : enroll ? (
          <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
            <div className="w-fit rounded-lg bg-white p-3"><QRCodeSVG value={enroll.uri} size={168} title="Código QR para tu app de autenticación" /></div>
            <div className="grid content-start gap-3">
              <ol className="ml-5 list-decimal text-sm"><li>Abre Google Authenticator, Microsoft Authenticator o similar.</li><li>Escanea el código (o escribe la clave <code className="break-all">{enroll.secret}</code>).</li><li>Escribe el código de 6 dígitos que aparece.</li></ol>
              <InputOTP maxLength={6} value={code} onChange={setCode} inputMode="numeric" aria-label="Código"><InputOTPGroup>{[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}</InputOTPGroup></InputOTP>
              <div className="flex gap-2"><SubmitButton onClick={confirm} disabled={code.length !== 6} loading={busy} loadingText="Activando…" hint="Escribe los 6 dígitos de tu app">Activar</SubmitButton><Button variant="ghost" onClick={() => { setEnroll(null); setCode("") }}>Cancelar</Button></div>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">{pwField}<Button className="w-fit" disabled={busy} onClick={start}><ShieldCheck /> Activar verificación en dos pasos</Button></div>
        )}
        {codes && codes.length > 0 && (
          <Notice tone="info" title="Guarda tus códigos de respaldo">
            Sirven para entrar si pierdes el celular; cada uno una sola vez. No los volveremos a mostrar: <span className="font-mono break-all">{codes.join(" · ")}</span>
          </Notice>
        )}
      </SettingSection>
      <SettingSection icon="lock" title="Bloqueo y sesiones">
        <SettingRow title="Bloquear por inactividad" desc="Pide entrar de nuevo si no usas Mirai por un tiempo.">
          <div className="w-48"><Combobox value={String(prefs?.lock_minutes ?? 0)} onChange={(v) => save({ lock_minutes: +v })} options={[["0", "Nunca"], ["5", "5 minutos"], ["15", "15 minutos"], ["30", "30 minutos"], ["60", "1 hora"]].map(([value, label]) => ({ value, label }))} /></div>
        </SettingRow>
        <SettingRow title="Cerrar sesión en otros dispositivos" desc="Útil si entraste desde un computador que no es tuyo.">
          <Button variant="outline" onClick={async () => { const r = await (await auth()).signOutOthers(); if (r.ok) toast.success("Cerramos tu sesión en los demás dispositivos"); else toast.error(r.msg) }}><LogOut /> Cerrar en otros</Button>
        </SettingRow>
        <SettingRow title="Sesiones abiertas y actividad" desc="Mira en qué dispositivos tienes abierto Mirai y qué cambió en tu cuenta.">
          <Button variant="outline" asChild><Link href="/ajustes?tab=cuenta">Ver en Tu cuenta</Link></Button>
        </SettingRow>
      </SettingSection>
      <Notice tone="info" title="Tus datos están protegidos en el servidor">Cada hogar solo puede ver su información (reglas de seguridad en la base de datos) y las claves de tus servicios se guardan cifradas.</Notice>
    </SettingStack>
  )
}

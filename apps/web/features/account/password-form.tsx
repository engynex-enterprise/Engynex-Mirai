"use client"

import { useState } from "react"
import { toast } from "@/components/mirai/toast"
import { Input } from "@/components/ui/input"
import { SubmitButton } from "@/components/mirai/submit-button"
import { PasswordMeter, passwordScore } from "@/components/auth/password-meter"
import { createClient } from "@/utils/supabase/client"
import { isMiraiAuth } from "@/lib/auth/provider"

/** Crear o cambiar la contraseña (un solo formulario para Perfil › Cuentas conectadas y Ajustes). */
export function PasswordForm({ create, onDone }: { create?: boolean; onDone?: () => void }) {
  const [pw, setPw] = useState("")
  const [current, setCurrent] = useState("")
  const [busy, setBusy] = useState(false)
  // v7: con Better Auth cambiar la contraseña pide la actual; crearla (entró con Google) va por la API.
  const mirai = isMiraiAuth()
  const ok = pw.length >= 10 && passwordScore(pw) >= 3 && (!mirai || create || current.length > 0)
  const saveMirai = async () => {
    const r = create ? await (await import("./mirai-actions")).miraiSetPassword(pw) : await (await import("@/lib/auth/mirai")).changePassword(current, pw)
    setBusy(false)
    if (!r.ok) return toast.error("No se pudo guardar la contraseña", { description: r.msg })
    toast.success(create ? "Contraseña creada: ya puedes entrar con tu correo y esta contraseña" : "Contraseña actualizada")
    setPw(""); setCurrent("")
    onDone?.()
  }
  const save = async () => {
    if (!ok || busy) return
    setBusy(true)
    if (mirai) return saveMirai()
    const { error } = await createClient().auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return toast.error("No se pudo guardar la contraseña", { description: /same|different/i.test(error.message) ? "Escribe una contraseña distinta a la que tienes." : "Intenta de nuevo en un momento." })
    toast.success(create ? "Contraseña creada: ya puedes entrar con tu correo y esta contraseña" : "Contraseña actualizada")
    setPw("")
    onDone?.()
  }
  return (
    <form className="grid max-w-md gap-3" onSubmit={(e) => { e.preventDefault(); save() }}>
      {mirai && !create && <Input type="password" autoComplete="current-password" className="h-11" placeholder="Tu contraseña actual" value={current} onChange={(e) => setCurrent(e.target.value)} aria-label="Contraseña actual" />}
      <Input type="password" autoComplete="new-password" className="h-11" placeholder={create ? "Tu contraseña nueva" : "Contraseña nueva"} value={pw} onChange={(e) => setPw(e.target.value)} aria-label="Contraseña nueva" />
      {pw ? <PasswordMeter value={pw} /> : <p className="text-xs text-muted-foreground">Mínimo 10 caracteres. Mezcla letras, números y algún símbolo.</p>}
      <SubmitButton type="submit" className="w-fit" disabled={!ok} loading={busy} loadingText="Guardando…"
        hint={pw ? "Hazla más segura: al menos 10 caracteres con letras, números y algún símbolo" : "Escribe la contraseña nueva"}>{create ? "Crear contraseña" : "Cambiar contraseña"}</SubmitButton>
    </form>
  )
}

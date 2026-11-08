"use client"

import { useState } from "react"
import { toast } from "@/components/mirai/toast"
import { Input } from "@/components/ui/input"
import { SubmitButton } from "@/components/mirai/submit-button"
import { PasswordMeter, passwordScore } from "@/components/auth/password-meter"

/** Crear o cambiar la contraseña (un solo formulario para Perfil › Cuentas conectadas y Ajustes). */
export function PasswordForm({ create, onDone }: { create?: boolean; onDone?: () => void }) {
  const [pw, setPw] = useState("")
  const [current, setCurrent] = useState("")
  const [busy, setBusy] = useState(false)
  // Cambiar la contraseña pide la actual; crearla (entró con Google) va por la API.
  const ok = pw.length >= 10 && passwordScore(pw) >= 3 && (create || current.length > 0)
  const save = async () => {
    if (!ok || busy) return
    setBusy(true)
    const r = create ? await (await import("./mirai-actions")).miraiSetPassword(pw) : await (await import("@/lib/auth/mirai")).changePassword(current, pw)
    setBusy(false)
    if (!r.ok) return toast.error("No se pudo guardar la contraseña", { description: r.msg })
    toast.success(create ? "Contraseña creada: ya puedes entrar con tu correo y esta contraseña" : "Contraseña actualizada")
    setPw(""); setCurrent("")
    onDone?.()
  }
  return (
    <form className="grid max-w-md gap-3" onSubmit={(e) => { e.preventDefault(); save() }}>
      {!create && <Input type="password" autoComplete="current-password" className="h-11" placeholder="Tu contraseña actual" value={current} onChange={(e) => setCurrent(e.target.value)} aria-label="Contraseña actual" />}
      <Input type="password" autoComplete="new-password" className="h-11" placeholder={create ? "Tu contraseña nueva" : "Contraseña nueva"} value={pw} onChange={(e) => setPw(e.target.value)} aria-label="Contraseña nueva" />
      {pw ? <PasswordMeter value={pw} /> : <p className="text-xs text-muted-foreground">Mínimo 10 caracteres. Mezcla letras, números y algún símbolo.</p>}
      <SubmitButton type="submit" className="w-fit" disabled={!ok} loading={busy} loadingText="Guardando…"
        hint={pw ? "Hazla más segura: al menos 10 caracteres con letras, números y algún símbolo" : "Escribe la contraseña nueva"}>{create ? "Crear contraseña" : "Cambiar contraseña"}</SubmitButton>
    </form>
  )
}

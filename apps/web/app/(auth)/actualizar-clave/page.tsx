"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "@/components/mirai/toast"
import { SubmitButton } from "@/components/mirai/submit-button"
import { createClient } from "@/utils/supabase/client"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { PasswordMeter, passwordScore } from "@/components/auth/password-meter"
import { AuthHeader, EnterSubmit, PasswordInput } from "@/components/auth/auth-ui"

export default function ActualizarClavePage() {
  const router = useRouter()
  const [pw, setPw] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const fuerte = passwordScore(pw) >= 3 && pw.length >= 10
  const coincide = pw === confirm
  const valido = fuerte && coincide

  async function save() {
    if (!valido || busy) return
    setBusy(true)
    const { error } = await createClient().auth.updateUser({ password: pw })
    if (error) { setBusy(false); return toast.error("No pudimos cambiar la contraseña", { description: error.message }) }
    toast.success("Contraseña actualizada")
    router.replace("/inicio")
  }

  return (
    <form className="grid gap-6" noValidate onSubmit={(e) => { e.preventDefault(); save() }}>
      <AuthHeader icon="key-round" title="Crea una contraseña nueva" description="Úsala la próxima vez que entres a Mirai." />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="pw">Contraseña nueva</FieldLabel>
          <PasswordInput id="pw" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
          <PasswordMeter value={pw} />
        </Field>
        <Field data-invalid={!!confirm && !coincide}>
          <FieldLabel htmlFor="pw2">Repite la contraseña</FieldLabel>
          <PasswordInput id="pw2" autoComplete="new-password" invalid={!!confirm && !coincide} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {!!confirm && !coincide && <FieldError>Las contraseñas no coinciden</FieldError>}
        </Field>
        <EnterSubmit disabled={!valido || busy} />
        <SubmitButton className="h-11 w-full" disabled={!valido} loading={busy} onClick={save}
          hint={!fuerte ? "Usa una contraseña segura: revisa los requisitos" : "Repite la misma contraseña para confirmarla"}>
          Guardar contraseña
        </SubmitButton>
      </FieldGroup>
    </form>
  )
}

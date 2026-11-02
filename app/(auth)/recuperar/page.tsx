"use client"

import Link from "next/link"
import { useState } from "react"
import { toast } from "@/components/mirai/toast"
import { SubmitButton } from "@/components/mirai/submit-button"
import { createClient } from "@/utils/supabase/client"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { AuthDone, AuthHeader } from "@/components/auth/auth-ui"

const EMAIL = /^\S+@\S+\.\S+$/

export default function RecuperarPage() {
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const valido = EMAIL.test(email.trim())

  async function send() {
    if (!valido || busy) return
    setBusy(true)
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${location.origin}/auth/callback?next=/actualizar-clave`,
    })
    setBusy(false)
    if (error) return toast.error("No pudimos enviar el correo", { description: error.message })
    setSent(true)
  }

  if (sent)
    return (
      <AuthDone icon="mail-check" title="Revisa tu correo" actions={<Button asChild variant="ghost"><Link href="/login">Volver a entrar</Link></Button>}>
        Si <b className="text-foreground">{email.trim()}</b> tiene cuenta en Mirai, te llegará un enlace para crear una contraseña nueva.
      </AuthDone>
    )

  return (
    <form className="grid gap-6" noValidate onSubmit={(e) => { e.preventDefault(); send() }}>
      <AuthHeader title="Recupera tu cuenta" description="Escribe tu correo y te enviamos un enlace para crear una contraseña nueva." />
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Correo</FieldLabel>
          <Input id="email" type="email" autoComplete="email" inputMode="email" placeholder="tu@correo.com" className="h-11" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          <FieldDescription>El mismo con el que creaste tu cuenta.</FieldDescription>
        </Field>
        <SubmitButton className="h-11 w-full" disabled={!valido} loading={busy} loadingText="Enviando…" onClick={send} hint="Escribe un correo válido, por ejemplo tu@correo.com">
          Enviarme el enlace
        </SubmitButton>
      </FieldGroup>
      <Link href="/login" className="text-center text-sm text-brand hover:underline">Volver a entrar</Link>
    </form>
  )
}

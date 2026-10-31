"use client"

import Link from "next/link"
import { useState } from "react"
import { MailCheck } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/utils/supabase/client"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

export default function RecuperarPage() {
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)

  if (sent)
    return (
      <div className="grid gap-4 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-brand-soft text-brand"><MailCheck className="size-7" /></div>
        <h1 className="font-heading text-2xl font-semibold">Revisa tu correo</h1>
        <p className="text-muted-foreground">Si <b className="text-foreground">{email}</b> tiene cuenta en Mirai, te llegará un enlace para crear una contraseña nueva.</p>
        <Button asChild variant="ghost"><Link href="/login">Volver a entrar</Link></Button>
      </div>
    )

  return (
    <form
      className="grid gap-6"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!/^\S+@\S+\.\S+$/.test(email)) return toast.error("Escribe un correo válido")
        setBusy(true)
        const { error } = await createClient().auth.resetPasswordForEmail(email, {
          redirectTo: `${location.origin}/auth/callback?next=/actualizar-clave`,
        })
        setBusy(false)
        if (error) return toast.error("No pudimos enviar el correo", { description: error.message })
        setSent(true)
      }}
    >
      <div>
        <h1 className="font-heading text-[28px] leading-9 font-semibold">Recupera tu cuenta</h1>
        <p className="mt-1 text-muted-foreground">Escribe tu correo y te enviamos un enlace para crear una contraseña nueva.</p>
      </div>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="email">Correo</FieldLabel>
          <Input id="email" type="email" autoComplete="email" className="h-11" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Button type="submit" size="lg" className="h-11 w-full" disabled={busy}>{busy && <Spinner />} Enviarme el enlace</Button>
      </FieldGroup>
      <Link href="/login" className="text-center text-sm text-brand hover:underline">Volver a entrar</Link>
    </form>
  )
}

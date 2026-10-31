"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { createClient } from "@/utils/supabase/client"
import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { PasswordMeter, passwordScore } from "@/components/auth/password-meter"

export default function ActualizarClavePage() {
  const router = useRouter()
  const [pw, setPw] = useState("")
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="grid gap-6"
      onSubmit={async (e) => {
        e.preventDefault()
        if (passwordScore(pw) < 3 || pw.length < 10) return toast.error("La contraseña es muy débil", { description: "Revisa los requisitos." })
        setBusy(true)
        const { error } = await createClient().auth.updateUser({ password: pw })
        setBusy(false)
        if (error) return toast.error("No pudimos cambiar la contraseña", { description: error.message })
        toast.success("Contraseña actualizada")
        router.replace("/inicio")
      }}
    >
      <div>
        <h1 className="font-heading text-[28px] leading-9 font-semibold">Crea una contraseña nueva</h1>
        <p className="mt-1 text-muted-foreground">Úsala la próxima vez que entres a Mirai.</p>
      </div>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="pw">Contraseña nueva</FieldLabel>
          <Input id="pw" type="password" autoComplete="new-password" className="h-11" value={pw} onChange={(e) => setPw(e.target.value)} />
          <PasswordMeter value={pw} />
        </Field>
        <Button type="submit" size="lg" className="h-11 w-full" disabled={busy}>{busy && <Spinner />} Guardar contraseña</Button>
      </FieldGroup>
    </form>
  )
}

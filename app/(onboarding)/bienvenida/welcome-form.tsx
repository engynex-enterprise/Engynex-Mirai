"use client"

import { useActionState } from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Spinner } from "@/components/ui/spinner"
import { createHousehold, type WelcomeState } from "./actions"

export function WelcomeForm({ nombre }: { nombre: string }) {
  const [state, action, pending] = useActionState<WelcomeState, FormData>(createHousehold, undefined)
  return (
    <form action={action}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="nombre">¿Cómo te llamas?</FieldLabel>
          <Input id="nombre" name="nombre" defaultValue={nombre} className="h-11" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="hogar">Nombre de tu hogar</FieldLabel>
          <Input id="hogar" name="hogar" defaultValue={nombre ? `Familia ${nombre.split(" ").at(-1)}` : "Mi hogar"} className="h-11" required />
          <FieldDescription>Así lo verán las personas que invites (tu pareja, tus hijos o tu contador).</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="libro">Nombre de tu primer libro</FieldLabel>
          <Input id="libro" name="libro" defaultValue="Hogar" className="h-11" required />
          <FieldDescription>Un libro es un cuaderno de cuentas. Luego puedes crear otro, por ejemplo para tu negocio.</FieldDescription>
        </Field>
        {state?.error && <Alert variant="destructive"><AlertDescription>{state.error}</AlertDescription></Alert>}
        <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>{pending && <Spinner />} Empezar</Button>
      </FieldGroup>
    </form>
  )
}

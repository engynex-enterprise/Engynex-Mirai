"use client"

import { useActionState, useRef, useState } from "react"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Notice } from "@/components/mirai/notice"
import { SubmitButton } from "@/components/mirai/submit-button"
import { EnterSubmit } from "@/components/auth/auth-ui"
import { createHousehold, type WelcomeState } from "./actions"

const CAMPOS = [
  { id: "nombre", label: "¿Cómo te llamas?", autoComplete: "name", max: 80, hint: undefined },
  { id: "hogar", label: "Nombre de tu hogar", autoComplete: "off", max: 60, hint: "Así lo verán las personas que invites (tu pareja, tus hijos o tu contador)." },
  { id: "libro", label: "Nombre de tu primer libro", autoComplete: "off", max: 40, hint: "Un libro es un cuaderno de cuentas. Luego puedes crear otro, por ejemplo para tu negocio." },
] as const
type Campo = (typeof CAMPOS)[number]["id"]

export function WelcomeForm({ nombre }: { nombre: string }) {
  const [state, action, pending] = useActionState<WelcomeState, FormData>(createHousehold, undefined)
  const ref = useRef<HTMLFormElement>(null)
  const [v, setV] = useState<Record<Campo, string>>({
    nombre, hogar: nombre ? `Familia ${nombre.split(" ").at(-1)}` : "Mi hogar", libro: "Hogar",
  })
  // Las mismas reglas del servidor (actions.ts): al menos 2 letras en cada nombre.
  const ok = (c: Campo) => v[c].trim().length >= 2
  const valido = CAMPOS.every((c) => ok(c.id))
  return (
    <form ref={ref} action={action}>
      <FieldGroup>
        {CAMPOS.map((c) => (
          <Field key={c.id}>
            <FieldLabel htmlFor={c.id}>{c.label}</FieldLabel>
            <Input id={c.id} name={c.id} value={v[c.id]} onChange={(e) => setV((x) => ({ ...x, [c.id]: e.target.value }))}
              autoComplete={c.autoComplete} maxLength={c.max} className="h-11" required aria-invalid={!ok(c.id) || undefined} />
            {c.hint && <FieldDescription>{c.hint}</FieldDescription>}
          </Field>
        ))}
        {state?.error && <Notice tone="bad" title="No pudimos crear tu hogar">{state.error}</Notice>}
        <EnterSubmit disabled={!valido || pending} />
        <SubmitButton className="h-11 w-full" disabled={!valido} loading={pending} loadingText="Creando tu hogar…" onClick={() => ref.current?.requestSubmit()}
          hint="Escribe tu nombre, el de tu hogar y el de tu libro (al menos 2 letras cada uno)">
          Empezar
        </SubmitButton>
      </FieldGroup>
    </form>
  )
}

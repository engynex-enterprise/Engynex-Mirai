"use client"

import { useEffect, useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Icon } from "@/components/mirai/icon"

/** Título y descripción de cada pantalla de acceso (mismo tamaño y espaciado en todas). */
export function AuthHeader({ title, description, icon }: { title: string; description?: React.ReactNode; icon?: string }) {
  return (
    <div className="grid gap-3">
      {icon && <span className="grid size-14 place-items-center rounded-full bg-brand-soft text-brand"><Icon name={icon} className="size-7" /></span>}
      <div>
        <h1 className="font-heading text-[28px] leading-9 font-semibold">{title}</h1>
        {description && <p className="mt-1 text-muted-foreground">{description}</p>}
      </div>
    </div>
  )
}

/** Pantalla de "Revisa tu correo" / "Listo": ícono, título, texto y acciones, centrados. */
export function AuthDone({ icon, title, children, actions }: { icon: string; title: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="grid gap-4 text-center" role="status">
      <div className="mx-auto grid size-14 place-items-center rounded-full bg-brand-soft text-brand"><Icon name={icon} className="size-7" /></div>
      <h1 className="font-heading text-2xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">{children}</p>
      {actions}
    </div>
  )
}

/** Campo de contraseña con botón para mostrarla u ocultarla. Recibe las props del <input> (register de react-hook-form). */
export function PasswordInput({ id, autoComplete = "current-password", invalid, ...rest }: React.ComponentProps<"input"> & { invalid?: boolean }) {
  const [show, setShow] = useState(false)
  return (
    <InputGroup className="h-11">
      <InputGroupInput id={id} type={show ? "text" : "password"} autoComplete={autoComplete} aria-invalid={invalid || undefined} {...rest} />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs" aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={show} title={show ? "Ocultar contraseña" : "Mostrar contraseña"} onClick={() => setShow((s) => !s)}>
          {show ? <EyeOff /> : <Eye />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}

/**
 * Chrome y Safari llenan solos el correo y la contraseña guardados, pero no le avisan a la página hasta que la persona
 * toca algo. Mientras se vean llenos (`:autofill`), el botón Entrar no debe quedar inactivo.
 */
export function useAutofilled(ids: string[]) {
  const [on, setOn] = useState(false)
  const key = ids.join(",")
  useEffect(() => {
    const check = () => {
      const all = key.split(",").every((id) => {
        const el = document.getElementById(id)
        if (!el) return false
        try { return el.matches(":autofill") || el.matches(":-webkit-autofill") } catch { try { return el.matches(":-webkit-autofill") } catch { return false } }
      })
      setOn(all)
    }
    const ts = [150, 600, 1500].map((ms) => setTimeout(check, ms))
    return () => ts.forEach(clearTimeout)
  }, [key])
  return on
}

/**
 * Botón de envío invisible: permite enviar con Enter cuando el botón visible es un <SubmitButton> sin `form`
 * (formularios sin react-hook-form). No se ve ni recibe el foco; el visible es el que leen los lectores de pantalla.
 */
export function EnterSubmit({ disabled }: { disabled?: boolean }) {
  return <button type="submit" disabled={disabled} tabIndex={-1} aria-hidden className="sr-only">Enviar</button>
}

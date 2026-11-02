"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { MailCheck } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/utils/supabase/client"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { LEGAL_VERSION } from "@/lib/legal/version"
import { useCaptcha } from "./turnstile"
import { GoogleButton } from "./google-button"
import { PasswordMeter, passwordScore } from "./password-meter"

const schema = z
  .object({
    nombre: z.string().trim().min(2, "Escribe tu nombre"),
    email: z.email("Escribe un correo válido"),
    password: z.string().refine((p) => passwordScore(p) >= 3 && p.length >= 10, "La contraseña es muy débil: revisa los requisitos"),
    confirm: z.string(),
    acepta: z.literal(true, { error: "Debes aceptar para crear tu cuenta" }),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Las contraseñas no coinciden" })
type Values = z.input<typeof schema>

export function RegisterForm() {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { nombre: "", email: "", password: "", confirm: "", acepta: false as unknown as true } })
  const { errors, isSubmitting } = form.formState
  const pw = form.watch("password")
  const captcha = useCaptcha()
  // Referidos: /registro?ref=CÓDIGO queda en una cookie (sirve también si se registra con Google).
  const ref = typeof window !== "undefined" ? new URLSearchParams(location.search).get("ref")?.toUpperCase() ?? null : null
  useEffect(() => { if (ref && /^[A-Z0-9]{6,12}$/.test(ref)) document.cookie = `mirai_ref=${ref}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax` }, [ref])
  const { data: abierto } = useQuery({ queryKey: ["registro-abierto"], queryFn: async () => (await createClient().rpc("registro_abierto")).data ?? true, staleTime: 60_000 })

  async function onSubmit(v: Values) {
    const { error } = await createClient().auth.signUp({
      email: v.email,
      password: v.password,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback?next=/bienvenida`,
        data: { nombre: v.nombre.trim(), acepta_version: LEGAL_VERSION, ...(ref ? { ref } : {}) },
        captchaToken: captcha.token,
      },
    })
    captcha.reset()
    if (error) return toast.error("No pudimos crear tu cuenta", { description: error.message })
    setSentTo(v.email)
  }

  if (sentTo)
    return (
      <div className="grid gap-4 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-brand-soft text-brand"><MailCheck className="size-7" /></div>
        <h1 className="font-heading text-2xl font-semibold">Confirma tu correo</h1>
        <p className="text-muted-foreground">Te enviamos un enlace a <b className="text-foreground">{sentTo}</b>. Ábrelo para activar tu cuenta y empezar.</p>
        <Button asChild variant="ghost"><Link href="/login">Volver a entrar</Link></Button>
      </div>
    )

  if (abierto === false) return <div className="grid gap-3 text-center"><h1 className="font-heading text-2xl font-semibold">El registro está cerrado por ahora</h1><p className="text-muted-foreground">Estamos preparando todo para recibirte. Vuelve pronto o, si ya tienes cuenta, entra normalmente.</p><Button variant="outline" asChild><Link href="/login">Ir a entrar</Link></Button></div>

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-[28px] leading-9 font-semibold">Crea tu cuenta</h1>
        <p className="mt-1 text-muted-foreground">Gratis. Luego podrás invitar a tu familia.</p>
      </div>
      <GoogleButton next="/bienvenida" />
      <FieldSeparator>o con tu correo</FieldSeparator>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <Field data-invalid={!!errors.nombre}>
            <FieldLabel htmlFor="nombre">¿Cómo te llamas?</FieldLabel>
            <Input id="nombre" autoComplete="name" placeholder="Ej. Alberto Navarro" className="h-11" {...form.register("nombre")} />
            <FieldError errors={[errors.nombre]} />
          </Field>
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">Correo</FieldLabel>
            <Input id="email" type="email" autoComplete="email" inputMode="email" placeholder="tu@correo.com" className="h-11" {...form.register("email")} />
            <FieldError errors={[errors.email]} />
          </Field>
          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="password">Contraseña</FieldLabel>
            <Input id="password" type="password" autoComplete="new-password" className="h-11" {...form.register("password")} />
            <PasswordMeter value={pw} />
            <FieldError errors={[errors.password]} />
          </Field>
          <Field data-invalid={!!errors.confirm}>
            <FieldLabel htmlFor="confirm">Repite la contraseña</FieldLabel>
            <Input id="confirm" type="password" autoComplete="new-password" className="h-11" {...form.register("confirm")} />
            <FieldError errors={[errors.confirm]} />
          </Field>
          <Field orientation="horizontal" data-invalid={!!errors.acepta}>
            <Checkbox id="acepta" checked={form.watch("acepta") === true} onCheckedChange={(c) => form.setValue("acepta", (c === true) as true, { shouldValidate: true })} />
            <div className="grid gap-1">
              <FieldLabel htmlFor="acepta" className="font-normal leading-snug">
                Acepto los <Link href="/legal/terminos" target="_blank" className="text-brand underline">Términos</Link> y autorizo el tratamiento de mis datos según la{" "}
                <Link href="/legal/privacidad" target="_blank" className="text-brand underline">Política de privacidad</Link> (Ley 1581 de 2012).
              </FieldLabel>
              <FieldDescription>Tus datos son tuyos: puedes descargarlos o borrar tu cuenta cuando quieras.</FieldDescription>
              <FieldError errors={[errors.acepta]} />
            </div>
          </Field>
          {captcha.widget}
          <Button type="submit" size="lg" className="h-11 w-full" disabled={isSubmitting || (captcha.enabled && !captcha.token)}>
            {isSubmitting && <Spinner />} Crear mi cuenta
          </Button>
        </FieldGroup>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta? <Link href="/login" className="font-medium text-brand hover:underline">Entra</Link>
      </p>
    </div>
  )
}

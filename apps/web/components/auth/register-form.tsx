"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "@/components/mirai/toast"
import { SubmitButton, useSubmitState } from "@/components/mirai/submit-button"
import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/utils/supabase/client"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { LEGAL_VERSION } from "@/lib/legal/version"
import { useCaptcha } from "./turnstile"
import { GoogleButton } from "./google-button"
import { PasswordMeter, passwordScore } from "./password-meter"
import { AuthDone, AuthHeader, PasswordInput } from "./auth-ui"
import { isMiraiAuth } from "@/lib/auth/provider"

const FORM_ID = "registro"

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
  const form = useForm<Values>({ resolver: zodResolver(schema), mode: "onTouched", defaultValues: { nombre: "", email: "", password: "", confirm: "", acepta: false as unknown as true } })
  const { errors } = form.formState
  const pw = useWatch({ control: form.control, name: "password" })
  const acepta = useWatch({ control: form.control, name: "acepta" }) === true
  const captcha = useCaptcha()
  const captchaOk = !captcha.enabled || !!captcha.token
  useSubmitState(FORM_ID, form, { valid: captchaOk })
  // Referidos: /registro?ref=CÓDIGO queda en una cookie (sirve también si se registra con Google).
  const ref = typeof window !== "undefined" ? new URLSearchParams(location.search).get("ref")?.toUpperCase() ?? null : null
  useEffect(() => { if (ref && /^[A-Z0-9]{6,12}$/.test(ref)) document.cookie = `mirai_ref=${ref}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax` }, [ref])
  const { data: abierto } = useQuery({
    queryKey: ["registro-abierto"],
    queryFn: async () => (isMiraiAuth() ? (await (await import("@/lib/auth/mirai")).authConfig()).registroAbierto : ((await createClient().rpc("registro_abierto")).data ?? true)),
    staleTime: 60_000,
  })

  /** AUTH_PROVIDER=mirai: Better Auth guarda nombre, aceptación legal (Ley 1581) y referido para handle_new_user(). */
  async function onSubmitMirai(v: Values) {
    const r = await (await import("@/lib/auth/mirai")).signUp({ nombre: v.nombre.trim(), email: v.email, password: v.password, ref, captcha: captcha.token })
    captcha.reset()
    if (!r.ok) return toast.error("No pudimos crear tu cuenta", { description: r.msg })
    setSentTo(v.email)
  }

  async function onSubmit(v: Values) {
    if (isMiraiAuth()) return onSubmitMirai(v)
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
      <AuthDone icon="mail-check" title="Confirma tu correo" actions={<Button asChild variant="ghost"><Link href="/login">Volver a entrar</Link></Button>}>
        Te enviamos un enlace a <b className="text-foreground">{sentTo}</b>. Ábrelo para activar tu cuenta y empezar.
      </AuthDone>
    )

  if (abierto === false)
    return (
      <AuthDone icon="clock" title="El registro está cerrado por ahora" actions={<Button variant="outline" asChild><Link href="/login">Ir a entrar</Link></Button>}>
        Estamos preparando todo para recibirte. Vuelve pronto o, si ya tienes cuenta, entra normalmente.
      </AuthDone>
    )

  return (
    <div className="grid gap-6">
      <AuthHeader title="Crea tu cuenta" description="Gratis. Luego podrás invitar a tu familia." />
      <GoogleButton next="/bienvenida" />
      <FieldSeparator>o con tu correo</FieldSeparator>
      <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <Field data-invalid={!!errors.nombre}>
            <FieldLabel htmlFor="nombre">¿Cómo te llamas?</FieldLabel>
            <Input id="nombre" autoComplete="name" placeholder="Ej. Alberto Navarro" className="h-11" aria-invalid={!!errors.nombre || undefined} {...form.register("nombre")} />
            <FieldError errors={[errors.nombre]} />
          </Field>
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">Correo</FieldLabel>
            <Input id="email" type="email" autoComplete="email" inputMode="email" placeholder="tu@correo.com" className="h-11" aria-invalid={!!errors.email || undefined} {...form.register("email")} />
            <FieldError errors={[errors.email]} />
          </Field>
          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="password">Contraseña</FieldLabel>
            <PasswordInput id="password" autoComplete="new-password" invalid={!!errors.password} {...form.register("password")} />
            <PasswordMeter value={pw} />
            <FieldError errors={[errors.password]} />
          </Field>
          <Field data-invalid={!!errors.confirm}>
            <FieldLabel htmlFor="confirm">Repite la contraseña</FieldLabel>
            <PasswordInput id="confirm" autoComplete="new-password" invalid={!!errors.confirm} {...form.register("confirm")} />
            <FieldError errors={[errors.confirm]} />
          </Field>
          <Field orientation="horizontal" data-invalid={!!errors.acepta}>
            <Checkbox id="acepta" checked={acepta} onCheckedChange={(c) => form.setValue("acepta", (c === true) as true, { shouldValidate: true })} />
            <div className="grid gap-1">
              <FieldLabel htmlFor="acepta" className="font-normal leading-snug">
                Acepto los <Link href="/legal/terminos" target="_blank" className="text-brand underline">Términos</Link> y autorizo el tratamiento de mis datos según la{" "}
                <Link href="/legal/privacidad" target="_blank" className="text-brand underline">Política de privacidad</Link> (Ley 1581 de 2012).
              </FieldLabel>
              <FieldDescription>Tus datos son tuyos: puedes descargarlos o borrar tu cuenta cuando quieras.</FieldDescription>
              {errors.acepta ? <FieldError errors={[errors.acepta]} /> : !acepta && <p className="text-[12.5px] text-muted-foreground">Debes aceptar para crear tu cuenta.</p>}
            </div>
          </Field>
          {captcha.widget}
          <SubmitButton form={FORM_ID} className="h-11 w-full" loadingText="Creando tu cuenta…"
            hint={!captchaOk ? "Espera un momento: estamos verificando que no eres un robot" : "Completa tus datos, usa una contraseña segura y acepta la política para continuar"}>
            Crear mi cuenta
          </SubmitButton>
        </FieldGroup>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta? <Link href="/login" className="font-medium text-brand hover:underline">Entra</Link>
      </p>
    </div>
  )
}

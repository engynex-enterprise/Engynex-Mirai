"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Wand2 } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Notice } from "@/components/mirai/notice"
import { SubmitButton, useSubmitState } from "@/components/mirai/submit-button"
import { createClient } from "@/utils/supabase/client"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCaptcha } from "./turnstile"
import { GoogleButton } from "./google-button"
import { AuthDone, AuthHeader, PasswordInput, useAutofilled } from "./auth-ui"
import { safeNext } from "@/lib/security/safe-next"

const FORM_ID = "login"
const schema = z.object({
  mode: z.enum(["password", "magic"]),
  email: z.email("Escribe un correo válido"),
  password: z.string(),
  remember: z.boolean(),
}).refine((v) => v.mode === "magic" || v.password.length > 0, { path: ["password"], message: "Escribe tu contraseña" })
type Values = z.infer<typeof schema>

const AUTH_ERRORS: Record<string, string> = {
  "Invalid login credentials": "El correo o la contraseña no coinciden.",
  "Email not confirmed": "Aún no confirmas tu correo. Revisa tu bandeja de entrada.",
}

export function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = safeNext(params.get("next"))
  const [sent, setSent] = useState(false)
  // Tras entrar, el botón sigue en "Entrando…" mientras carga la siguiente pantalla.
  const [leaving, setLeaving] = useState(false)
  const form = useForm<Values>({ resolver: zodResolver(schema), mode: "onTouched", defaultValues: { mode: "password", email: "", password: "", remember: true } })
  const { errors } = form.formState
  const mode = useWatch({ control: form.control, name: "mode" })
  const remember = useWatch({ control: form.control, name: "remember" })
  const captcha = useCaptcha()
  // El navegador puede haber llenado el correo y la contraseña sin avisar: en ese caso Entrar queda activo.
  const autofilled = useAutofilled(mode === "magic" ? ["email"] : ["email", "password"])
  const captchaOk = !captcha.enabled || !!captcha.token
  useSubmitState(FORM_ID, form, { valid: (form.formState.isValid || autofilled) && captchaOk, busy: leaving })

  async function onSubmit(v: Values) {
    const sb = createClient()
    if (v.mode === "magic") {
      const { error } = await sb.auth.signInWithOtp({
        email: v.email,
        options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: false, captchaToken: captcha.token },
      })
      captcha.reset()
      if (error) return toast.error("No pudimos enviar el enlace", { description: error.message })
      setSent(true)
      return
    }
    const { error } = await sb.auth.signInWithPassword({ email: v.email, password: v.password, options: { captchaToken: captcha.token } })
    captcha.reset()
    if (error) return toast.error("No pudiste entrar", { description: AUTH_ERRORS[error.message] ?? error.message })
    try { localStorage.setItem("mirai-remember", v.remember ? "1" : "0") } catch {}
    setLeaving(true)
    const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel()
    router.replace(data && data.nextLevel === "aal2" && data.currentLevel !== "aal2" ? `/verificacion?next=${encodeURIComponent(next)}` : next)
    router.refresh()
  }

  if (sent)
    return (
      <AuthDone icon="mail" title="Revisa tu correo" actions={<Button variant="ghost" onClick={() => setSent(false)}>Usar otro correo</Button>}>
        Te enviamos un enlace a <b className="text-foreground">{form.getValues("email")}</b>. Ábrelo desde este dispositivo para entrar sin contraseña.
      </AuthDone>
    )

  return (
    <div className="grid gap-6">
      <AuthHeader title="Hola de nuevo" description="Entra para ver las finanzas de tu hogar." />
      {params.get("aviso") === "correo" && <Notice tone="info" title="Revisa tu correo">Si cambiaste el correo de tu cuenta, entra con el correo nuevo. Si aún falta confirmar, abre el enlace que te llegó al otro correo.</Notice>}
      {params.get("salida") === "todas" && <Notice tone="info" title="Cerramos tu sesión en todos los dispositivos">Vuelve a entrar cuando quieras.</Notice>}
      <GoogleButton next={next} />
      <FieldSeparator>o con tu correo</FieldSeparator>
      <Tabs value={mode} onValueChange={(m) => { form.setValue("mode", m as Values["mode"], { shouldValidate: true }); form.clearErrors("password") }}>
        <TabsList className="w-full">
          <TabsTrigger value="password">Contraseña</TabsTrigger>
          <TabsTrigger value="magic"><Wand2 /> Enlace mágico</TabsTrigger>
        </TabsList>
      </Tabs>
      <form id={FORM_ID} onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FieldGroup>
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">Correo</FieldLabel>
            <Input id="email" type="email" autoComplete="email" inputMode="email" placeholder="tu@correo.com" className="h-11" aria-invalid={!!errors.email} {...form.register("email")} />
            <FieldError errors={[errors.email]} />
          </Field>
          {mode === "password" && (
            <>
              <Field data-invalid={!!errors.password}>
                <div className="flex items-center justify-between">
                  <FieldLabel htmlFor="password">Contraseña</FieldLabel>
                  <Link href="/recuperar" className="text-sm text-brand hover:underline">¿La olvidaste?</Link>
                </div>
                <PasswordInput id="password" autoComplete="current-password" invalid={!!errors.password} {...form.register("password")} />
                <FieldError errors={[errors.password]} />
              </Field>
              <Field orientation="horizontal">
                <Checkbox id="remember" checked={remember} onCheckedChange={(c) => form.setValue("remember", c === true)} />
                <FieldLabel htmlFor="remember" className="font-normal">Recordarme en este dispositivo</FieldLabel>
              </Field>
            </>
          )}
          {mode === "magic" && (
            <p className="text-sm text-muted-foreground">Te enviamos un enlace al correo para entrar sin escribir la contraseña.</p>
          )}
          {captcha.widget}
          <SubmitButton form={FORM_ID} className="h-11 w-full" loadingText={mode === "magic" ? "Enviando el enlace…" : "Entrando…"}
            hint={!captchaOk ? "Espera un momento: estamos verificando que no eres un robot" : mode === "magic" ? "Escribe tu correo para recibir el enlace" : "Escribe tu correo y tu contraseña para entrar"}>
            {mode === "magic" ? "Enviarme el enlace" : "Entrar"}
          </SubmitButton>
        </FieldGroup>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        ¿No tienes cuenta? <Link href="/registro" className="font-medium text-brand hover:underline">Crea una gratis</Link>
      </p>
    </div>
  )
}

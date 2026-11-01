"use client"

import Link from "next/link"
import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Eye, EyeOff, Mail, Wand2 } from "lucide-react"
import { toast } from "sonner"
import { createClient } from "@/utils/supabase/client"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCaptcha } from "./turnstile"
import { GoogleButton } from "./google-button"

const schema = z.object({
  email: z.email("Escribe un correo válido"),
  password: z.string(),
  remember: z.boolean(),
})
type Values = z.infer<typeof schema>

const AUTH_ERRORS: Record<string, string> = {
  "Invalid login credentials": "El correo o la contraseña no coinciden.",
  "Email not confirmed": "Aún no confirmas tu correo. Revisa tu bandeja de entrada.",
}

export function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get("next") || "/inicio"
  const [mode, setMode] = useState<"password" | "magic">("password")
  const [show, setShow] = useState(false)
  const [sent, setSent] = useState(false)
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "", remember: true } })
  const { isSubmitting, errors } = form.formState
  const captcha = useCaptcha()

  async function onSubmit(v: Values) {
    const sb = createClient()
    if (mode === "magic") {
      const { error } = await sb.auth.signInWithOtp({
        email: v.email,
        options: { emailRedirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: false, captchaToken: captcha.token },
      })
      captcha.reset()
      if (error) return toast.error("No pudimos enviar el enlace", { description: error.message })
      setSent(true)
      return
    }
    if (!v.password) return form.setError("password", { message: "Escribe tu contraseña" })
    const { error } = await sb.auth.signInWithPassword({ email: v.email, password: v.password, options: { captchaToken: captcha.token } })
    captcha.reset()
    if (error) return toast.error("No pudiste entrar", { description: AUTH_ERRORS[error.message] ?? error.message })
    try { localStorage.setItem("mirai-remember", v.remember ? "1" : "0") } catch {}
    const { data } = await sb.auth.mfa.getAuthenticatorAssuranceLevel()
    router.replace(data && data.nextLevel === "aal2" && data.currentLevel !== "aal2" ? `/verificacion?next=${encodeURIComponent(next)}` : next)
    router.refresh()
  }

  if (sent)
    return (
      <div className="grid gap-4 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-full bg-brand-soft text-brand"><Mail className="size-7" /></div>
        <h1 className="font-heading text-2xl font-semibold">Revisa tu correo</h1>
        <p className="text-muted-foreground">Te enviamos un enlace a <b className="text-foreground">{form.getValues("email")}</b>. Ábrelo desde este dispositivo para entrar sin contraseña.</p>
        <Button variant="ghost" onClick={() => setSent(false)}>Usar otro correo</Button>
      </div>
    )

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-heading text-[28px] leading-9 font-semibold">Hola de nuevo</h1>
        <p className="mt-1 text-muted-foreground">Entra para ver las finanzas de tu hogar.</p>
      </div>
      <GoogleButton next={next} />
      <FieldSeparator>o con tu correo</FieldSeparator>
      <Tabs value={mode} onValueChange={(m) => setMode(m as typeof mode)}>
        <TabsList className="w-full">
          <TabsTrigger value="password">Contraseña</TabsTrigger>
          <TabsTrigger value="magic"><Wand2 /> Enlace mágico</TabsTrigger>
        </TabsList>
      </Tabs>
      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
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
                <InputGroup className="h-11">
                  <InputGroupInput id="password" type={show ? "text" : "password"} autoComplete="current-password" aria-invalid={!!errors.password} {...form.register("password")} />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton size="icon-xs" aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"} onClick={() => setShow((s) => !s)}>
                      {show ? <EyeOff /> : <Eye />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                <FieldError errors={[errors.password]} />
              </Field>
              <Field orientation="horizontal">
                <Checkbox id="remember" checked={form.watch("remember")} onCheckedChange={(c) => form.setValue("remember", c === true)} />
                <FieldLabel htmlFor="remember" className="font-normal">Recordarme en este dispositivo</FieldLabel>
              </Field>
            </>
          )}
          {mode === "magic" && (
            <p className="text-sm text-muted-foreground">Te enviamos un enlace al correo para entrar sin escribir la contraseña.</p>
          )}
          {captcha.widget}
          <Button type="submit" size="lg" className="h-11 w-full" disabled={isSubmitting || (captcha.enabled && !captcha.token)}>
            {isSubmitting && <Spinner />} {mode === "magic" ? "Enviarme el enlace" : "Entrar"}
          </Button>
        </FieldGroup>
      </form>
      <p className="text-center text-sm text-muted-foreground">
        ¿No tienes cuenta? <Link href="/registro" className="font-medium text-brand hover:underline">Crea una gratis</Link>
      </p>
    </div>
  )
}

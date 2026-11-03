"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "@/components/mirai/toast"
import { SubmitButton } from "@/components/mirai/submit-button"
import { createClient } from "@/utils/supabase/client"
import { Button } from "@/components/ui/button"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { AuthSkeleton } from "@/components/auth/auth-skeleton"
import { AuthHeader } from "@/components/auth/auth-ui"
import { safeNext } from "@/lib/security/safe-next"
import { isMiraiAuth } from "@/lib/auth/provider"
import { MiraiVerification } from "@/components/auth/mirai-verification"

function Verificacion() {
  const router = useRouter()
  const next = safeNext(useSearchParams().get("next"))
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    createClient().auth.mfa.listFactors().then(({ data }) => setFactorId(data?.totp.find((f) => f.status === "verified")?.id ?? null))
  }, [])

  async function verify(c: string) {
    if (!factorId || c.length !== 6 || busy) return
    setBusy(true)
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId, code: c })
    if (error) {
      setBusy(false)
      setCode("")
      return toast.error("El código no es válido", { description: "Revisa la hora de tu celular y vuelve a intentar." })
    }
    router.replace(next)
    router.refresh()
  }

  return (
    <div className="grid gap-6">
      <AuthHeader icon="shield-check" title="Verificación en dos pasos" description="Escribe el código de 6 dígitos de tu app de autenticación (Google Authenticator, Microsoft Authenticator…)." />
      <InputOTP maxLength={6} value={code} onChange={(v) => { setCode(v.replace(/\D/g, "")); if (v.length === 6) verify(v) }} autoFocus inputMode="numeric" autoComplete="one-time-code" disabled={busy} aria-label="Código de verificación">
        <InputOTPGroup className="w-full justify-between">
          {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} className="h-14 w-12 text-lg" />)}
        </InputOTPGroup>
      </InputOTP>
      <SubmitButton className="h-11 w-full" disabled={code.length !== 6 || !factorId} loading={busy} loadingText="Verificando…" onClick={() => verify(code)}
        hint={!factorId ? "Buscando tu app de autenticación…" : "Escribe los 6 dígitos del código"}>
        Verificar
      </SubmitButton>
      <Button variant="ghost" onClick={async () => { await createClient().auth.signOut(); router.replace("/login") }}>Salir</Button>
    </div>
  )
}

export default function Page() {
  // v7: con AUTH_PROVIDER=mirai, el reto de Better Auth (código, respaldo o re-enrolamiento).
  return <Suspense fallback={<AuthSkeleton />}>{isMiraiAuth() ? <MiraiVerification /> : <Verificacion />}</Suspense>
}

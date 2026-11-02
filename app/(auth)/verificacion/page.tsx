"use client"

import { Suspense, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ShieldCheck } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { createClient } from "@/utils/supabase/client"
import { Button } from "@/components/ui/button"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { Spinner } from "@/components/ui/spinner"
import { AuthSkeleton } from "@/components/auth/auth-skeleton"

function Verificacion() {
  const router = useRouter()
  const next = useSearchParams().get("next") || "/inicio"
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    createClient().auth.mfa.listFactors().then(({ data }) => setFactorId(data?.totp.find((f) => f.status === "verified")?.id ?? null))
  }, [])

  async function verify(c: string) {
    if (!factorId || c.length !== 6) return
    setBusy(true)
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId, code: c })
    setBusy(false)
    if (error) {
      setCode("")
      return toast.error("El código no es válido", { description: "Revisa la hora de tu celular y vuelve a intentar." })
    }
    router.replace(next)
    router.refresh()
  }

  return (
    <div className="grid gap-6">
      <div className="grid size-14 place-items-center rounded-full bg-brand-soft text-brand"><ShieldCheck className="size-7" /></div>
      <div>
        <h1 className="font-heading text-[28px] leading-9 font-semibold">Verificación en dos pasos</h1>
        <p className="mt-1 text-muted-foreground">Escribe el código de 6 dígitos de tu app de autenticación (Google Authenticator, Microsoft Authenticator…).</p>
      </div>
      <InputOTP maxLength={6} value={code} onChange={(v) => { setCode(v); if (v.length === 6) verify(v) }} autoFocus inputMode="numeric" aria-label="Código de verificación">
        <InputOTPGroup className="w-full justify-between">
          {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} className="h-14 w-12 text-lg" />)}
        </InputOTPGroup>
      </InputOTP>
      <Button size="lg" className="h-11" disabled={busy || code.length !== 6} onClick={() => verify(code)}>{busy && <Spinner />} Verificar</Button>
      <Button variant="ghost" onClick={async () => { await createClient().auth.signOut(); router.replace("/login") }}>Salir</Button>
    </div>
  )
}

export default function Page() {
  return <Suspense fallback={<AuthSkeleton />}><Verificacion /></Suspense>
}

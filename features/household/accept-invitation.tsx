"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { Notice } from "@/components/mirai/notice"
import { createClient } from "@/utils/supabase/client"
import { acceptInvitation } from "./actions"

/** Aceptar una invitación a un hogar: si no hay sesión, pide entrar o crear la cuenta y vuelve aquí. */
export function AcceptInvitation({ token }: { token: string }) {
  const router = useRouter()
  const [session, setSession] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const next = encodeURIComponent(`/invitacion/${token}`)
  useEffect(() => { createClient().auth.getClaims().then(({ data }) => setSession(!!data?.claims)) }, [])

  return (
    <div className="mx-auto grid w-full max-w-sm gap-5 text-center">
      <IsoIcon k="familia" size={72} className="mx-auto" />
      <div className="grid gap-1"><h1 className="text-2xl font-semibold">Te invitaron a un hogar</h1><p className="text-muted-foreground">Al aceptar, verás y llevarás juntos las cuentas de ese hogar en Mirai.</p></div>
      {err && <Notice tone="bad" title="No pudimos aceptar la invitación">{err}</Notice>}
      {session === null ? <Spinner className="mx-auto" /> : session ? (
        <Button size="lg" className="h-11" disabled={busy} onClick={async () => {
          setBusy(true); const r = await acceptInvitation(token); setBusy(false)
          if (!r.ok) return setErr(r.msg)
          router.replace("/inicio"); router.refresh()
        }}>{busy && <Spinner />} Aceptar invitación</Button>
      ) : (
        <div className="grid gap-2">
          <Button size="lg" className="h-11" asChild><Link href={`/registro?next=${next}`}>Crear mi cuenta</Link></Button>
          <Button size="lg" variant="outline" className="h-11" asChild><Link href={`/login?next=${next}`}>Ya tengo cuenta</Link></Button>
          <p className="text-xs text-muted-foreground">Usa el mismo correo al que te llegó la invitación.</p>
        </div>
      )}
    </div>
  )
}

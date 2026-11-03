"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { Icon } from "@/components/mirai/icon"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { Notice } from "@/components/mirai/notice"
import { createClient } from "@/utils/supabase/client"
import { ROLE_INFO } from "@/lib/household/roles"
import { fmtVence } from "@/lib/household/invites"
import { acceptInvitation } from "./api"
import type { InvitationInfo } from "./query"

const NO_SIRVE: Record<string, { t: string; d: string }> = {
  no_existe: { t: "Esta invitación no existe", d: "Revisa que el enlace esté completo o pídele a quien te invitó que te la envíe de nuevo." },
  vencida: { t: "Esta invitación venció", d: "Las invitaciones duran 7 días. Pídele a quien te invitó que te la reenvíe desde Mirai." },
  cancelada: { t: "Esta invitación fue cancelada", d: "Quien te invitó la canceló. Si fue un error, pídele una nueva." },
  aceptada: { t: "Esta invitación ya se usó", d: "Si eres tú, entra con tu cuenta y busca el hogar en el selector de libros." },
}

/** Aceptar una invitación a un hogar: muestra quién invita y el rol; si no hay sesión, pide entrar o crear la cuenta. */
export function AcceptInvitation({ token, info }: { token: string; info: InvitationInfo }) {
  const router = useRouter()
  const [session, setSession] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const next = encodeURIComponent(`/invitacion/${token}`)
  useEffect(() => { createClient().auth.getClaims().then(({ data }) => setSession(!!data?.claims)) }, [])
  const rol = info.rol ? ROLE_INFO[info.rol] : null
  const usable = info.estado === "pendiente" || info.ya_miembro

  return (
    <div className="mx-auto grid w-full max-w-sm gap-5 text-center">
      <IsoIcon k="familia" size={72} className="mx-auto" />
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold">{info.hogar ? `${info.invita} te invitó a “${info.hogar}”` : "Te invitaron a un hogar"}</h1>
        <p className="text-muted-foreground">Al aceptar, verás y llevarán juntos las cuentas de ese hogar en Mirai.</p>
      </div>
      {rol && usable && (
        <div className="grid gap-1 rounded-xl bg-brand-soft/60 p-4 text-left">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Tu rol</p>
          <p className="flex items-center gap-2 font-semibold"><Icon name={rol.icon} className="size-4 text-brand" />{rol.label}</p>
          <p className="text-sm text-muted-foreground">{rol.desc}</p>
          {info.vence && info.estado === "pendiente" && <p className="pt-1 text-xs text-muted-foreground">Vence el {fmtVence(info.vence)}.</p>}
        </div>
      )}
      {!usable && <Notice tone="warn" title={NO_SIRVE[info.estado]?.t ?? NO_SIRVE.no_existe.t}>{NO_SIRVE[info.estado]?.d ?? NO_SIRVE.no_existe.d}</Notice>}
      {err && <Notice tone="bad" title="No pudimos aceptar la invitación">{err}</Notice>}
      {!usable ? (
        <Button size="lg" variant="outline" className="h-11" asChild><Link href="/inicio">Ir a Mirai</Link></Button>
      ) : session === null ? <Spinner className="mx-auto" /> : session ? (
        <Button size="lg" className="h-11" disabled={busy} onClick={async () => {
          setBusy(true); const r = await acceptInvitation(token); setBusy(false)
          if (!r.ok) return setErr(r.msg)
          router.replace("/inicio"); router.refresh()
        }}>{busy && <Spinner />} {info.ya_miembro ? "Ir a ese hogar" : "Aceptar invitación"}</Button>
      ) : (
        <div className="grid gap-2">
          <Button size="lg" className="h-11" asChild><Link href={`/registro?next=${next}`}>Crear mi cuenta</Link></Button>
          <Button size="lg" variant="outline" className="h-11" asChild><Link href={`/login?next=${next}`}>Ya tengo cuenta</Link></Button>
          <p className="text-xs text-muted-foreground">Si te llegó por correo, usa ese mismo correo para crear la cuenta.</p>
        </div>
      )}
    </div>
  )
}

"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { FileCheck } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { createClient } from "@/utils/supabase/client"
import { LEGAL_CHANGES, LEGAL_VERSION } from "@/lib/legal/version"
import { isMiraiAuth } from "@/lib/auth/provider"

/** Pide aceptar los Términos y la Política cuando cambian (Ley 1581: autorización previa para usos nuevos). */
export function LegalUpdate() {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const { data: version } = useQuery({
    queryKey: ["legal-version"],
    // v7: con AUTH_PROVIDER=mirai la versión aceptada sale de /v1/me/consents (tabla consents).
    queryFn: async () => (isMiraiAuth() ? (await import("./actions")).miraiLegalVersion() : String((await createClient().auth.getUser()).data.user?.user_metadata?.acepta_version ?? "")),
    staleTime: Infinity,
  })
  if (version === undefined || version >= LEGAL_VERSION) return null
  const accept = async () => {
    setBusy(true)
    if (isMiraiAuth()) {
      const r = await (await import("./actions")).miraiAcceptLegal(LEGAL_VERSION)
      setBusy(false)
      if (!r.ok) return toast.error("No se pudo guardar", { description: r.msg })
      qc.setQueryData(["legal-version"], LEGAL_VERSION)
      return toast.success("Gracias. Aceptaste la nueva versión.")
    }
    const { error } = await createClient().auth.updateUser({ data: { acepta_version: LEGAL_VERSION, acepta_at: new Date().toISOString() } })
    setBusy(false)
    if (error) return toast.error("No se pudo guardar", { description: error.message })
    qc.setQueryData(["legal-version"], LEGAL_VERSION)
    toast.success("Gracias. Aceptaste la nueva versión.")
  }
  return (
    <Card className="mb-5 flex-row flex-wrap items-center gap-3 p-4 shadow-card ring-0" role="region" aria-label="Actualización de los términos">
      <FileCheck className="size-6 shrink-0 text-brand" />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="font-semibold">Actualizamos los términos y la política de datos</p>
        <p className="text-sm text-muted-foreground">{LEGAL_CHANGES} Lee los <Link className="text-link underline" href="/legal/terminos" target="_blank">términos</Link> y la <Link className="text-link underline" href="/legal/privacidad" target="_blank">política</Link>.</p>
      </div>
      <Button onClick={accept} disabled={busy}>{busy && <Spinner />} Acepto</Button>
    </Card>
  )
}

"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { BrandLogo } from "@/components/mirai/brand-logo"
import { createClient } from "@/utils/supabase/client"
import { toast } from "@/components/mirai/toast"

/** Botón "Continuar con Google" con el logo oficial de Google (pautas de marca de Google Sign-In). */
export function GoogleButton({ next = "/inicio" }: { next?: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        const { error } = await createClient().auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
        })
        if (error) {
          setBusy(false)
          toast.error("No pudimos abrir Google", { description: error.message })
        }
      }}
    >
      {busy ? <Spinner /> : <BrandLogo k="google" size={20} bare />}
      Continuar con Google
    </Button>
  )
}

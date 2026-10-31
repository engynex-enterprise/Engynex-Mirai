"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { createClient } from "@/utils/supabase/client"
import { toast } from "sonner"

/** Botón "Continuar con Google". Ícono genérico (sin logo de la marca). */
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
      {busy ? <Spinner /> : <span className="grid size-5 place-items-center rounded-full border text-[11px] font-bold">G</span>}
      Continuar con Google
    </Button>
  )
}

"use client"

import { useQuery } from "@tanstack/react-query"
import { IconButton } from "@/components/mirai/tip"
import { Card } from "@/components/ui/card"
import { useApp } from "@/components/app/app-context"
import { useShell } from "@/components/app/shell-store"
import { createClient } from "@/utils/supabase/client"
import { shouldPromptRating } from "@/lib/content/opiniones"
import { usePrefs } from "@/features/settings/prefs"
import { useMyFeedback } from "./feedback-dialog"
import { StarRating } from "./stars"

/** Tarjeta discreta en Inicio que pide calificar Mirai: tras 7 días de uso y como máximo una vez cada 90 días. */
export function RatingPrompt() {
  const { user } = useApp()
  const open = useShell((s) => s.openFeedback)
  const { prefs, saveQuiet } = usePrefs()
  const { data: mine } = useMyFeedback()
  const { data: since } = useQuery({
    queryKey: ["profile-since", user.id],
    queryFn: async () => (await createClient().from("profiles").select("created_at").eq("id", user.id).single()).data?.created_at ?? null,
    staleTime: Infinity,
  })
  const extra = (prefs?.extra ?? {}) as { fb_prompt_at?: string }
  if (!prefs || !mine || since === undefined) return null
  const lastRated = mine.find((f) => f.tipo === "calificacion")?.created_at
  if (!shouldPromptRating({ since, lastRated, lastDismissed: extra.fb_prompt_at })) return null
  const dismiss = () => saveQuiet({ extra: { ...extra, fb_prompt_at: new Date().toISOString() } })
  return (
    <Card className="relative flex-col items-center gap-3 p-5 text-center shadow-card ring-0 sm:flex-row sm:text-left" aria-label="Califica Mirai">
      <div className="grid flex-1 gap-1">
        <p className="font-semibold">¿Qué tal te ha parecido Mirai?</p>
        <p className="text-sm text-muted-foreground">Tu calificación nos ayuda a saber qué mejorar. Toma 10 segundos.</p>
      </div>
      <StarRating value={0} onChange={(n) => { dismiss(); open({ tipo: "calificacion", rating: n }) }} />
      <IconButton size="icon-sm" icon="x" label="Ahora no" className="absolute top-2 right-2" onClick={dismiss} />
    </Card>
  )
}

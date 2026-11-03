"use client"

import { useSetupProgress } from "@/features/setup/use-setup"
import { usePrefs } from "@/features/settings/prefs"
import { APP_VER } from "@/lib/content/ayuda"

/**
 * Insignias del menú (v4): "puesta" = pasos hechos/total mientras la guía no esté terminada.
 * "recordatorios" (vencidos) y "gastos" (hormiga sobre el límite) se suman con sus módulos.
 */
export function useNavBadges(): { badges: Record<string, number | string>; hidden: string[] } {
  const { data } = useSetupProgress()
  const { prefs } = usePrefs()
  const badges: Record<string, number | string> = {}
  const hidden: string[] = []
  if (data && !data.finished) badges.puesta = `${data.done}/${data.total}`
  if (data?.finished) hidden.push("puesta")
  if (prefs && prefs.seen_release !== APP_VER) badges.novedades = "Nuevo"
  return { badges, hidden }
}

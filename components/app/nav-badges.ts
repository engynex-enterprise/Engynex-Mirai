"use client"

import { useSetupProgress } from "@/features/setup/use-setup"

/**
 * Insignias del menú (v4): "puesta" = pasos hechos/total mientras la guía no esté terminada.
 * "recordatorios" (vencidos) y "gastos" (hormiga sobre el límite) se suman con sus módulos.
 */
export function useNavBadges(): { badges: Record<string, number | string>; hidden: string[] } {
  const { data } = useSetupProgress()
  const badges: Record<string, number | string> = {}
  const hidden: string[] = []
  if (data && !data.finished) badges.puesta = `${data.done}/${data.total}`
  if (data?.finished) hidden.push("puesta")
  return { badges, hidden }
}

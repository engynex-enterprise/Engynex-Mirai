"use client"

import { useQuery } from "@tanstack/react-query"
import { createClient } from "@/utils/supabase/client"
import { useBookId } from "./app-context"

/**
 * Insignias del menú (v4): "puesta" = pasos pendientes, "recordatorios" = pagos vencidos,
 * "gastos" = "!" si la hormiga superó el límite. Los cálculos completos llegan con cada módulo.
 */
export function useNavBadges(): Record<string, number | string> {
  const bookId = useBookId()
  const { data } = useQuery({
    queryKey: ["b", bookId, "book_settings", "badges"],
    queryFn: async () => {
      const { data } = await createClient().from("book_settings").select("setup").eq("book_id", bookId).maybeSingle()
      return data
    },
  })
  const out: Record<string, number | string> = {}
  const setup = data?.setup as { dismissed?: boolean } | undefined
  if (setup && !setup.dismissed) out.puesta = "Nuevo"
  return out
}

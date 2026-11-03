"use client"

import { useQuery } from "@tanstack/react-query"
import { Megaphone } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { cn } from "@/lib/utils"

const TONE = { info: "bg-info-soft text-info", warn: "bg-warning-soft text-warning", ok: "bg-success-soft text-success" } as const

/** Aviso global de la plataforma (también lo muestra Centro de ayuda › Estado del servicio). */
export function usePlatformNotice() {
  return useQuery({
    queryKey: ["platform-settings"],
    queryFn: async () => (await createClient().from("platform_settings").select("aviso_global,aviso_tono").maybeSingle()).data,
    staleTime: 5 * 60_000,
  })
}

/** Aviso para todos los usuarios, definido en la consola (Sistema › Aviso para todos). */
export function PlatformNotice() {
  const { data } = usePlatformNotice()
  if (!data?.aviso_global?.trim()) return null
  return (
    <div role="status" className={cn("mb-4 flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium", TONE[(data.aviso_tono as keyof typeof TONE) ?? "info"] ?? TONE.info)}>
      <Megaphone className="mt-0.5 size-4 shrink-0" />{data.aviso_global}
    </div>
  )
}

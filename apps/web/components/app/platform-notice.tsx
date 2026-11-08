"use client"

import { useQuery } from "@/lib/query"
import { Megaphone } from "lucide-react"
import { cn } from "@/lib/utils"

type Notice = { aviso_global: string | null; aviso_tono: string | null } | null

/** GET /v1/platform/notice (público). */
export async function loadPlatformNotice(): Promise<Notice> {
  const { browserApi, unwrap } = await import("@/lib/api/client")
  const n = unwrap(await browserApi().me.platformNotice())
  return { aviso_global: n.aviso, aviso_tono: n.tono }
}

const TONE = { info: "bg-info-soft text-info", warn: "bg-warning-soft text-warning", ok: "bg-success-soft text-success" } as const

/** Aviso global de la plataforma (también lo muestra Centro de ayuda › Estado del servicio). */
export function usePlatformNotice() {
  return useQuery({
    queryKey: ["platform-settings"],
    queryFn: loadPlatformNotice,
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

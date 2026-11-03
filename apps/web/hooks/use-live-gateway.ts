"use client"

// Tiempo real por el gateway socket.io de la API (v6 F2-G-5), con la MISMA interfaz que useBookRealtime
// (hooks/use-realtime.ts): `{ status, online }`, mismas invalidaciones (invalidateBook), mismo filtro de eco local
// (isLocalEcho) y misma agrupación de ráfagas (300 ms). Solo se usa si el interruptor NEXT_PUBLIC_LIVE_SOURCE=gateway
// (hooks/use-live.ts); apagado por defecto. socket.io-client se carga con import() solo en ese caso.
import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { createBurst, LiveGatewayClient } from "@mirai/contracts/realtime-client"
import { createClient } from "@/utils/supabase/client"
import { useApp } from "@/components/app/app-context"
import { invalidateBook, isLocalEcho } from "./use-book-data"
import type { LiveStatus, PresenceUser } from "./use-realtime"

/** URL del servicio mirai-realtime (p. ej. https://rt.mirai.engynex.com). */
export const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL ?? ""

/** Ventana para agrupar ráfagas de cambios (igual que hooks/use-realtime.ts). */
const BURST_MS = 300

let shared: Promise<LiveGatewayClient> | undefined

/** Una sola conexión por pestaña (la comparten el shell y el runner de automatizaciones). */
export function getLiveClient(): Promise<LiveGatewayClient> {
  return (shared ??= (async () => {
    const { io } = await import("socket.io-client")
    const sb = createClient()
    const client = new LiveGatewayClient({
      io,
      url: REALTIME_URL,
      // Token vigente en cada (re)conexión; Supabase lo renueva solo.
      getToken: async () => (await sb.auth.getSession()).data.session?.access_token ?? null,
    })
    sb.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" && session) void client.refreshToken(session.access_token)
      if (event === "SIGNED_OUT") {
        client.close()
        shared = undefined
      }
    })
    return client.connect()
  })())
}

export function useLiveGateway(bookId: string, me: Omit<PresenceUser, "at" | "path">, path: string) {
  const qc = useQueryClient()
  const householdId = useApp().household.id
  const [status, setStatus] = useState<LiveStatus>("conectando")
  const [online, setOnline] = useState<PresenceUser[]>([])
  const client = useRef<LiveGatewayClient | null>(null)

  useEffect(() => {
    let alive = true
    const offs: (() => void)[] = []
    const burst = createBurst(BURST_MS, (tables) => {
      for (const t of tables) invalidateBook(qc, bookId, t)
    })
    void getLiveClient().then((c) => {
      if (!alive) return
      client.current = c
      offs.push(
        c.on("status", setStatus),
        c.on("change", (ch) => {
          if (ch.householdId) {
            if (ch.householdId !== householdId) return
            void qc.invalidateQueries({ queryKey: ["h", householdId] })
            burst.add(ch.table)
            return
          }
          if (ch.bookId !== bookId || isLocalEcho(ch.table, ch.id)) return
          burst.add(ch.table)
        }),
        c.on("notification", () => void qc.invalidateQueries({ queryKey: ["notifications"] })),
        c.on("presence", (p) => {
          if (p.bookId === bookId) setOnline(p.users)
        }),
        // Se reconectó sin recuperar la sesión, o la base avisó que se perdieron cambios: trae lo que cambió.
        c.on("resync", (r) => {
          if (r.bookId === bookId) void qc.invalidateQueries({ queryKey: ["b", bookId] })
        }),
      )
      setStatus(c.status)
      void c.join(bookId)
    })
    return () => {
      alive = false
      burst.cancel()
      for (const off of offs) off()
      client.current?.leave(bookId)
      client.current = null
    }
  }, [bookId, householdId, qc])

  useEffect(() => {
    if (status === "en-vivo") client.current?.presence({ bookId, path, nombre: me.nombre, avatar: me.avatar })
  }, [status, path, me, bookId])

  return { status, online }
}

/** Equivalente del canal `auto:{libro}` de features/automations/runner.tsx: avisa cuando la base encola un evento. */
export function onGatewayAutomation(bookId: string, fn: () => void): () => void {
  let alive = true
  let off: (() => void) | undefined
  let joined: LiveGatewayClient | undefined
  void getLiveClient().then((c) => {
    if (!alive) return
    joined = c
    off = c.on("automation", (a) => {
      if (a.bookId === bookId) fn()
    })
    void c.join(bookId)
  })
  return () => {
    alive = false
    off?.()
    joined?.leave(bookId)
  }
}

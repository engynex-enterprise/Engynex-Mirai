"use client"

// Tiempo real por el gateway socket.io de la API: `{ status, online }` del libro, invalidaciones por tabla
// (invalidateBook), filtro de eco local (isLocalEcho) y agrupación de ráfagas (300 ms). La sesión es la cookie httpOnly
// de Better Auth (el gateway la lee en el handshake; se renueva sola). socket.io-client se carga con import().
// Las tablas que se sincronizan (LIVE_TABLES, HOUSEHOLD_TABLES) viven en @mirai/contracts/live.
import { startTransition, useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { createBurst, LiveGatewayClient } from "@mirai/contracts/realtime-client"
import { useApp } from "@/components/app/app-context"
import { invalidateBook, isLocalEcho } from "./use-book-data"

export type PresenceUser = { id: string; nombre: string; avatar: string | null; path: string; at: string }
export type LiveStatus = "conectando" | "en-vivo" | "sin-conexion"

/** URL del servicio de tiempo real; vacía = el mismo origen (/socket.io por el balanceador). */
export const REALTIME_URL = process.env.NEXT_PUBLIC_REALTIME_URL ?? ""

/** Ventana para agrupar ráfagas de cambios (importar 100 gastos = una sola recarga de la tabla). */
const BURST_MS = 300

let shared: Promise<LiveGatewayClient> | undefined

/** Una sola conexión por pestaña (la comparten el shell y el runner de automatizaciones). */
export function getLiveClient(): Promise<LiveGatewayClient> {
  return (shared ??= (async () => {
    const { io } = await import("socket.io-client")
    // Sin token ni `auth:refresh`: la cookie de sesión viaja en el handshake.
    const client = new LiveGatewayClient({ io, url: REALTIME_URL || window.location.origin, getToken: async () => null, socketOptions: { withCredentials: true } })
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
    // En transición: si la conexión llega antes de que termine la hidratación (con la cookie de sesión es casi
    // inmediata), React hidrata primero con el estado del servidor ("Conectando…") y luego aplica el cambio, en vez
    // de romper la hidratación del menú lateral (error #418).
    const setLive = (s: LiveStatus) => startTransition(() => setStatus(s))
    void getLiveClient().then((c) => {
      if (!alive) return
      client.current = c
      offs.push(
        c.on("status", setLive),
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
          if (p.bookId === bookId) startTransition(() => setOnline(p.users))
        }),
        // Se reconectó sin recuperar la sesión, o la base avisó que se perdieron cambios: trae lo que cambió.
        c.on("resync", (r) => {
          if (r.bookId === bookId) void qc.invalidateQueries({ queryKey: ["b", bookId] })
        }),
      )
      setLive(c.status)
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

/** Avisa cuando la base encola un evento de automatización del libro (features/automations/runner.tsx). */
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

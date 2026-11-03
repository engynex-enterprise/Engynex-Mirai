"use client"

import { useEffect } from "react"
import { createClient } from "@/utils/supabase/client"
import { useBookId } from "@/components/app/app-context"
import { runPendingAutomations } from "./actions"
import { LIVE_SOURCE } from "@/hooks/use-live"
import { onGatewayAutomation } from "@/hooks/use-live-gateway"

const KEY = "mirai:auto-kick"

/** Pide revisar la cola ya (tras una cuota, una compra con tarjeta, un cobro…): no depende solo de Realtime. */
export const kickAutomations = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event("mirai:auto-kick")) }

/**
 * Corre las automatizaciones al instante: cuando la base encola un evento del libro (se registró un gasto, un ingreso o
 * el pago de un fijo, desde cualquier dispositivo) le pide al servidor procesarlo. El cron de cada hora es el respaldo.
 */
export function AutomationRunner() {
  const bookId = useBookId()
  useEffect(() => {
    const sb = createClient()
    let t: ReturnType<typeof setTimeout> | undefined
    const kick = () => {
      clearTimeout(t)
      t = setTimeout(() => { runPendingAutomations().catch(() => {}) }, 1200)
    }
    // Al abrir la app (máximo cada 10 minutos): revisa lo que haya quedado pendiente.
    try {
      const last = Number(sessionStorage.getItem(`${KEY}:${bookId}`) ?? 0)
      if (Date.now() - last > 600_000) { sessionStorage.setItem(`${KEY}:${bookId}`, String(Date.now())); kick() }
    } catch { /* sin almacenamiento: el cron lo procesa */ }
    // Fuente del aviso: Supabase Realtime (por defecto) o el gateway de la API (interruptor de hooks/use-live.ts).
    const ch = LIVE_SOURCE === "gateway" ? null : sb
      .channel(`auto:${bookId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "automation_events", filter: `book_id=eq.${bookId}` }, kick)
      .subscribe()
    const offGateway = LIVE_SOURCE === "gateway" ? onGatewayAutomation(bookId, kick) : undefined
    // Respaldo si Realtime se demora: lo que se registra desde esta pestaña revisa la cola al instante.
    addEventListener("mirai:accion", kick)
    addEventListener("mirai:auto-kick", kick)
    return () => {
      clearTimeout(t)
      if (ch) sb.removeChannel(ch)
      offGateway?.()
      removeEventListener("mirai:accion", kick)
      removeEventListener("mirai:auto-kick", kick)
    }
  }, [bookId])
  return null
}

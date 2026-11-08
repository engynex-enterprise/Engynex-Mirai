"use client"

import { useEffect } from "react"
import { useBookId } from "@/components/app/app-context"
import { runPendingAutomations } from "./api"
import { onGatewayAutomation } from "@/hooks/use-live-gateway"

const KEY = "mirai:auto-kick"

/** Pide revisar la cola ya (tras una cuota, una compra con tarjeta, un cobro…): no depende solo del tiempo real. */
export const kickAutomations = () => { if (typeof window !== "undefined") window.dispatchEvent(new Event("mirai:auto-kick")) }

/**
 * Corre las automatizaciones al instante: cuando la base encola un evento del libro (se registró un gasto, un ingreso o
 * el pago de un fijo, desde cualquier dispositivo) le pide al servidor procesarlo. El cron de cada hora es el respaldo.
 */
export function AutomationRunner() {
  const bookId = useBookId()
  useEffect(() => {
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
    // Aviso del gateway de tiempo real de la API cuando la base encola un evento del libro.
    const offGateway = onGatewayAutomation(bookId, kick)
    // Respaldo si el tiempo real se demora: lo que se registra desde esta pestaña revisa la cola al instante.
    addEventListener("mirai:accion", kick)
    addEventListener("mirai:auto-kick", kick)
    return () => {
      clearTimeout(t)
      offGateway()
      removeEventListener("mirai:accion", kick)
      removeEventListener("mirai:auto-kick", kick)
    }
  }, [bookId])
  return null
}

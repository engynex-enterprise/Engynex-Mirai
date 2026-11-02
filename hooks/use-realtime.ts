"use client"

import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { createClient } from "@/utils/supabase/client"
import { invalidateBook, isLocalEcho } from "./use-book-data"

/** Tablas sincronizadas en vivo (deben estar en la publicación supabase_realtime). */
const LIVE_TABLES = [
  "book_settings", "categories", "income_categories", "entities", "payment_methods", "keyword_rules",
  "incomes", "extra_incomes", "fixed_expenses", "expenses", "fixed_expense_payments", "subscriptions",
  "credit_cards", "card_purchases", "contacts", "loans", "loan_payments", "assets", "liabilities",
  "investments", "goals", "emergency_funds", "fund_movements", "calendar_events", "shared_groups",
  "shared_group_expenses", "allowances", "allowance_movements", "savings_challenges", "tax_years",
  "tax_assets", "attachments", "accountant_notes", "advisor_consultations", "gami_badges", "wishlist", "net_worth_snapshots",
  "automations", "automation_runs", "providers",
] as const

export type PresenceUser = { id: string; nombre: string; avatar: string | null; path: string; at: string }
export type LiveStatus = "conectando" | "en-vivo" | "sin-conexion"

/** Ventana para agrupar ráfagas de cambios (importar 100 gastos = una sola recarga de la tabla). */
const BURST_MS = 300

type ChangePayload = { new?: { id?: string } | null; old?: { id?: string } | null }

/**
 * Un canal por libro: Postgres Changes (refresca la caché de TanStack Query cuando alguien
 * de la familia cambia algo) + Presence (quién está conectado y en qué pantalla).
 * - Ignora el eco de lo que este navegador acaba de guardar (useSave/useSoftDelete ya refrescan).
 * - Agrupa las ráfagas por tabla y solo invalida las consultas que leen esa tabla (invalidateBook).
 * - Si la conexión se cae y vuelve, recarga el libro: pudo perderse algún cambio mientras tanto.
 */
export function useBookRealtime(bookId: string, me: Omit<PresenceUser, "at" | "path">, path: string) {
  const qc = useQueryClient()
  const [status, setStatus] = useState<LiveStatus>("conectando")
  const [online, setOnline] = useState<PresenceUser[]>([])
  const channel = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    const sb = createClient()
    const ch = sb.channel(`book:${bookId}`, { config: { presence: { key: me.id } } })
    const dirty = new Set<string>()
    let timer: ReturnType<typeof setTimeout> | undefined
    let lost = false
    const flush = () => {
      timer = undefined
      for (const t of dirty) invalidateBook(qc, bookId, t)
      dirty.clear()
    }
    for (const table of LIVE_TABLES) {
      ch.on("postgres_changes", { event: "*", schema: "public", table, filter: `book_id=eq.${bookId}` }, (p: ChangePayload) => {
        if (isLocalEcho(table, p.new?.id ?? p.old?.id)) return
        dirty.add(table)
        timer ??= setTimeout(flush, BURST_MS)
      })
    }
    ch.on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${me.id}` }, () =>
      qc.invalidateQueries({ queryKey: ["notifications"] }),
    )
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<PresenceUser>()
      setOnline(Object.values(state).map((v) => v[0]).filter(Boolean))
    })
    ch.subscribe((s) => {
      if (channel.current !== ch) return // aviso de un canal ya descartado (p. ej. doble montaje en desarrollo)
      if (s === "SUBSCRIBED") {
        setStatus("en-vivo")
        if (lost) qc.invalidateQueries({ queryKey: ["b", bookId] }) // se reconectó: trae lo que cambió mientras tanto
        lost = false
      } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
        setStatus("sin-conexion")
        lost = true
      }
    })
    channel.current = ch
    return () => {
      channel.current = null
      if (timer) clearTimeout(timer)
      void sb.removeChannel(ch)
    }
  }, [bookId, me.id, qc])

  useEffect(() => {
    if (status === "en-vivo") channel.current?.track({ ...me, path, at: new Date().toISOString() })
  }, [status, path, me])

  return { status, online }
}

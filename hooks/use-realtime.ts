"use client"

import { useEffect, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import type { RealtimeChannel } from "@supabase/supabase-js"
import { createClient } from "@/utils/supabase/client"
import { invalidateBook } from "./use-book-data"

/** Tablas sincronizadas en vivo (deben estar en la publicación supabase_realtime). */
const LIVE_TABLES = [
  "book_settings", "categories", "income_categories", "entities", "payment_methods", "keyword_rules",
  "incomes", "extra_incomes", "fixed_expenses", "expenses", "fixed_expense_payments", "subscriptions",
  "credit_cards", "card_purchases", "contacts", "loans", "loan_payments", "assets", "liabilities",
  "investments", "goals", "emergency_funds", "fund_movements", "calendar_events", "shared_groups",
  "shared_group_expenses", "allowances", "allowance_movements", "savings_challenges", "tax_years",
  "tax_assets", "attachments", "accountant_notes", "advisor_consultations", "gami_badges", "wishlist", "net_worth_snapshots",
  "automations", "automation_runs",
] as const

export type PresenceUser = { id: string; nombre: string; avatar: string | null; path: string; at: string }
export type LiveStatus = "conectando" | "en-vivo" | "sin-conexion"

/**
 * Un canal por libro: Postgres Changes (refresca la caché de TanStack Query cuando alguien
 * de la familia cambia algo) + Presence (quién está conectado y en qué pantalla).
 */
export function useBookRealtime(bookId: string, me: Omit<PresenceUser, "at" | "path">, path: string) {
  const qc = useQueryClient()
  const [status, setStatus] = useState<LiveStatus>("conectando")
  const [online, setOnline] = useState<PresenceUser[]>([])
  const channel = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    const sb = createClient()
    const ch = sb.channel(`book:${bookId}`, { config: { presence: { key: me.id } } })
    for (const table of LIVE_TABLES) {
      ch.on("postgres_changes", { event: "*", schema: "public", table, filter: `book_id=eq.${bookId}` }, () => invalidateBook(qc, bookId, table))
    }
    ch.on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () =>
      qc.invalidateQueries({ queryKey: ["notifications"] }),
    )
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<PresenceUser>()
      setOnline(Object.values(state).map((v) => v[0]).filter(Boolean))
    })
    ch.subscribe((s) => {
      if (channel.current !== ch) return // aviso de un canal ya descartado (p. ej. doble montaje en desarrollo)
      if (s === "SUBSCRIBED") setStatus("en-vivo")
      else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") setStatus("sin-conexion")
    })
    channel.current = ch
    return () => {
      channel.current = null
      sb.removeChannel(ch)
    }
  }, [bookId, me.id, qc])

  useEffect(() => {
    if (status === "en-vivo") channel.current?.track({ ...me, path, at: new Date().toISOString() })
  }, [status, path, me])

  return { status, online }
}

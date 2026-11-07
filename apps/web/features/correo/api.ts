// Gmail y Google Calendar por la API (v6 F2-H-5, interruptor `google`): POST /v1/books/:b/mail/scan,
// DELETE /v1/google, POST …/calendar/sync, GET …/calendar/status y GET …/google/connect-url.
// Misma firma y misma forma que las Server Actions de ./actions.ts; con el interruptor apagado son exactamente esas.
// V7-H3: la conexión de Google (GET /v1/google/connection, interruptor `google`) y los gastos que se registran desde el
// correo (CRUD del libro, interruptor `book-tables:expenses`). Apagados: google_connections_public y expenses directo
// con la sesión de Supabase (modo heredado: las únicas ramas con `.from` de esta carpeta, además de ./actions.ts).
import type { MailScan } from "@mirai/ai/server/mail"
import type { Insert } from "@mirai/db/tables"
import { readWithFallback } from "@/lib/api/book-tables"
import { apiInsertRow, rowsViaApi } from "@/lib/api/book-rows"
import { failure } from "@/lib/api/errors"
import { activeBookId, apiOn } from "@/lib/api/session"
import { viaApiOr } from "@/lib/api/via"
import { createClient } from "@/utils/supabase/client"
import * as actions from "./actions"

export type { MailRow } from "./actions"

const on = () => apiOn("google")
const api = async () => {
  const { browserApi, unwrap, unwrapData } = await import("@/lib/api/client")
  return { api: browserApi(), unwrap, unwrapData, params: { bookId: activeBookId() } }
}

export const scanMail = viaApiOr(on, actions.scanMail, async (query?: string): Promise<MailScan> => {
  try {
    const { api: a, unwrapData, params } = await api()
    const d = unwrapData(await a.ai.mailScan({ params, body: { query } }))
    return { ok: true, rows: d.rows, ...(d.ia !== undefined ? { ia: d.ia } : {}) }
  } catch (e) { return { ...failure(e), rows: [] } }
})

export const googleDisconnect = viaApiOr(on, actions.googleDisconnect, async () => {
  const { api: a, unwrapData } = await api()
  unwrapData(await a.google.disconnect())
})

export const syncCalendar = viaApiOr(on, actions.syncCalendar, async () => {
  try {
    const { api: a, unwrapData, params } = await api()
    return { ok: true, msg: unwrapData(await a.google.calendarSync({ params })).msg }
  } catch (e) { return failure(e) }
})

export const calendarStatus = viaApiOr(on, actions.calendarStatus, async () => {
  try {
    const { api: a, unwrap, params } = await api()
    return unwrap(await a.google.calendarStatus({ params }))
  } catch { return { conectado: false, plan: false, eventos: 0 } }
})

/** ¿Conectar Google va por la API? (apagado: los enlaces de siempre a /api/google/connect). */
export const googleViaApi = on

/**
 * Conectar Gmail o Calendar por la API: arma la URL de Google con un `state` firmado (sin cookie) y el callback vuelve
 * por la API (`?google=ok|cancelado|error`). Solo se llama con el interruptor encendido.
 */
export async function connectGoogleViaApi(s: "gmail" | "calendar", back: string) {
  const { toast } = await import("@/components/mirai/toast")
  try {
    const { api: a, unwrap, params } = await api()
    location.href = unwrap(await a.google.connectUrl({ params, query: { s, back } })).url
  } catch (e) { toast.error("No pudimos conectar con Google", { description: failure(e).msg }) }
}

// ── V7-H3 ───────────────────────────────────────────────────────────────────────────────────────────────────────

export type GoogleConn = { email: string | null; scopes: string[] | null } | null

/** Tu conexión de Google (correo y permisos; nunca los tokens). */
export async function googleConnection(): Promise<GoogleConn> {
  const legacy = async (): Promise<GoogleConn> => (await createClient().from("google_connections_public").select("email,scopes").maybeSingle()).data
  if (!on()) return legacy()
  return readWithFallback(async () => {
    const { api: a, unwrap } = await api()
    const c = unwrap(await a.google.connection())
    return c.scopes.length || c.email ? c : null
  }, legacy)
}

type NewExpense = Omit<Insert<"expenses">, "book_id">

/** Gastos que la persona confirmó desde el correo (uno por movimiento). `error` con el mensaje para la persona. */
export async function insertExpenses(bookId: string, rows: NewExpense[]): Promise<{ error: { message: string } | null }> {
  if (rowsViaApi("expenses")) {
    const results = await Promise.all(rows.map((r) => apiInsertRow(bookId, "expenses", r as Record<string, unknown>)))
    return { error: results.find((r) => r.error)?.error ?? null }
  }
  const { error } = await createClient().from("expenses").insert(rows.map((r) => ({ ...r, book_id: bookId })))
  return { error }
}

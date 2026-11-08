// Gmail y Google Calendar por la API: POST /v1/books/:b/mail/scan, DELETE /v1/google, POST …/calendar/sync,
// GET …/calendar/status, GET …/google/connect-url y GET /v1/google/connection. Los gastos que se registran desde el
// correo van por el CRUD del libro.
import type { MailScan } from "@mirai/ai/server/mail"
import type { Insert } from "@mirai/db/tables"
import { apiInsertRow } from "@/lib/api/book-rows"
import { failure } from "@/lib/api/errors"
import { activeBookId } from "@/lib/api/session"

export type { MailRow } from "@mirai/ai/server/mail"

const api = async () => {
  const { browserApi, unwrap, unwrapData } = await import("@/lib/api/client")
  return { api: browserApi(), unwrap, unwrapData, params: { bookId: activeBookId() } }
}

export async function scanMail(query?: string): Promise<MailScan> {
  try {
    const { api: a, unwrapData, params } = await api()
    const d = unwrapData(await a.ai.mailScan({ params, body: { query } }))
    return { ok: true, rows: d.rows, ...(d.ia !== undefined ? { ia: d.ia } : {}) }
  } catch (e) { return { ...failure(e), rows: [] } }
}

export async function googleDisconnect(): Promise<void> {
  const { api: a, unwrapData } = await api()
  unwrapData(await a.google.disconnect())
}

export async function syncCalendar(): Promise<{ ok: boolean; msg: string }> {
  try {
    const { api: a, unwrapData, params } = await api()
    return { ok: true, msg: unwrapData(await a.google.calendarSync({ params })).msg }
  } catch (e) { return failure(e) }
}

/** Estado de Google Calendar para Ajustes › Alertas: si está conectado, si el plan lo incluye y cuántos eventos lleva Mirai. */
export async function calendarStatus(): Promise<{ conectado: boolean; plan: boolean; eventos: number }> {
  try {
    const { api: a, unwrap, params } = await api()
    return unwrap(await a.google.calendarStatus({ params }))
  } catch { return { conectado: false, plan: false, eventos: 0 } }
}

/**
 * Conectar Gmail o Calendar por la API: arma la URL de Google con un `state` firmado (sin cookie) y el callback vuelve
 * por la API (`?google=ok|cancelado|error`).
 */
export async function connectGoogleViaApi(s: "gmail" | "calendar", back: string) {
  const { toast } = await import("@/components/mirai/toast")
  try {
    const { api: a, unwrap, params } = await api()
    location.href = unwrap(await a.google.connectUrl({ params, query: { s, back } })).url
  } catch (e) { toast.error("No pudimos conectar con Google", { description: failure(e).msg }) }
}

export type GoogleConn = { email: string | null; scopes: string[] | null } | null

/** Tu conexión de Google (correo y permisos; nunca los tokens). */
export async function googleConnection(): Promise<GoogleConn> {
  const { api: a, unwrap } = await api()
  const c = unwrap(await a.google.connection())
  return c.scopes.length || c.email ? c : null
}

type NewExpense = Omit<Insert<"expenses">, "book_id">

/** Gastos que la persona confirmó desde el correo (uno por movimiento). `error` con el mensaje para la persona. */
export async function insertExpenses(bookId: string, rows: NewExpense[]): Promise<{ error: { message: string } | null }> {
  const results = await Promise.all(rows.map((r) => apiInsertRow(bookId, "expenses", r as Record<string, unknown>)))
  return { error: results.find((r) => r.error)?.error ?? null }
}

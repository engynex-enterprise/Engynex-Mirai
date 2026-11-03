// Gmail y Google Calendar por la API (v6 F2-H-5, interruptor `google`): POST /v1/books/:b/mail/scan,
// DELETE /v1/google, POST …/calendar/sync, GET …/calendar/status y GET …/google/connect-url.
// Misma firma y misma forma que las Server Actions de ./actions.ts; con el interruptor apagado son exactamente esas.
import type { MailScan } from "@mirai/ai/server/mail"
import { failure } from "@/lib/api/errors"
import { activeBookId, apiOn } from "@/lib/api/session"
import { viaApiOr } from "@/lib/api/via"
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

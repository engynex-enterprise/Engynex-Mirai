// Avisos por la API (v6 F2-H-5, interruptor `notify`): /v1/books/:b/notifications/*, telegram/* y cobro-whatsapp.
// Misma firma y misma forma que las Server Actions de ./actions.ts; con el interruptor apagado son exactamente esas.
// logroNotifs va con el interruptor `gami` (POST /v1/books/:b/gami/logros, V7-H3).
import type { Canal } from "@/lib/notify/digest"
import { failure } from "@/lib/api/errors"
import { activeBookId, apiOn } from "@/lib/api/session"
import { viaApiOr } from "@/lib/api/via"
import * as actions from "./actions"

const on = () => apiOn("notify")
const api = async () => {
  const { browserApi, unwrap, unwrapData } = await import("@/lib/api/client")
  return { api: browserApi(), unwrap, unwrapData, params: { bookId: activeBookId() } }
}

export const sendDigestNow = viaApiOr(on, actions.sendDigestNow, async (canal) => {
  try {
    const { api: a, unwrapData, params } = await api()
    return { ok: true, msg: unwrapData(await a.notify.digestNow({ params, body: { canal } })).msg }
  } catch (e) { return failure(e) }
})

export const notifyChannels = viaApiOr(on, actions.notifyChannels, async (): Promise<Record<Canal, boolean>> => {
  try {
    const { api: a, unwrap, params } = await api()
    return unwrap(await a.notify.channels({ params }))
  } catch { return { email: false, telegram: false, whatsapp: false, push: false } }
})

export const sendTestNow = viaApiOr(on, actions.sendTestNow, async (canal) => {
  try {
    const { api: a, unwrapData, params } = await api()
    return { ok: true, msg: unwrapData(await a.notify.test({ params, body: { canal } })).msg }
  } catch (e) { return failure(e) }
})

export const telegramStartLink = viaApiOr(on, actions.telegramStartLink, async () => {
  try {
    const { api: a, unwrapData, params } = await api()
    return { ok: true, url: unwrapData(await a.notify.telegramLink({ params })).url }
  } catch (e) { return failure(e) }
})

export const telegramConfirm = viaApiOr(on, actions.telegramConfirm, async () => {
  try {
    const { api: a, unwrapData, params } = await api()
    return { ok: true, msg: unwrapData(await a.notify.telegramConfirm({ params })).msg }
  } catch (e) { return failure(e) }
})

export const telegramUnlink = viaApiOr(on, actions.telegramUnlink, async () => {
  const { api: a, unwrapData, params } = await api()
  unwrapData(await a.notify.telegramUnlink({ params }))
})

export const openAppNotifs = viaApiOr(on, actions.openAppNotifs, async () => {
  try {
    const { api: a, unwrap, params } = await api()
    return unwrap(await a.notify.open({ params }))
  } catch { return [] }
})

/** V7-H3: insignias y nivel → campana por POST /v1/books/:b/gami/logros (interruptor `gami`). Como la acción, nunca lanza. */
export const logroNotifs = viaApiOr(() => apiOn("gami"), actions.logroNotifs, async (input) => {
  try {
    const { api: a, unwrapData } = await api()
    unwrapData(await a.gami.logros({ params: { bookId: input.bookId }, body: { badges: input.badges, nivel: input.nivel } }))
    return { ok: true }
  } catch { return { ok: false } }
})

export const cobroWaStatus = viaApiOr(on, actions.cobroWaStatus, async () => {
  try {
    const { api: a, unwrap, params } = await api()
    return unwrap(await a.notify.cobroWaStatus({ params }))
  } catch { return { disponible: false, verificado: false } }
})

export const sendCobroWhatsApp = viaApiOr(on, actions.sendCobroWhatsApp, async (input) => {
  try {
    const { api: a, unwrapData, params } = await api()
    return { ok: true, msg: unwrapData(await a.notify.cobroWaSend({ params, body: input })).msg }
  } catch (e) { return failure(e) }
})

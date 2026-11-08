// Avisos por la API: /v1/books/:b/notifications/*, telegram/* y cobro-whatsapp. logroNotifs va por
// POST /v1/books/:b/gami/logros. Los errores vuelven como { ok:false, msg } con el texto en español de la API.
import type { Canal } from "@mirai/services/notify/digest"
import { failure } from "@/lib/api/errors"
import { activeBookId } from "@/lib/api/session"

const api = async () => {
  const { browserApi, unwrap, unwrapData } = await import("@/lib/api/client")
  return { api: browserApi(), unwrap, unwrapData, params: { bookId: activeBookId() } }
}

/** "Enviar resumen ahora" por un canal (también sirve de prueba si no hay avisos). */
export async function sendDigestNow(canal: Canal): Promise<{ ok: boolean; msg: string }> {
  try {
    const { api: a, unwrapData, params } = await api()
    return { ok: true, msg: unwrapData(await a.notify.digestNow({ params, body: { canal } })).msg }
  } catch (e) { return failure(e) }
}

/** Canales que Mirai ofrece a este hogar (los activa el administrador en la consola). */
export async function notifyChannels(): Promise<Record<Canal, boolean>> {
  try {
    const { api: a, unwrap, params } = await api()
    return unwrap(await a.notify.channels({ params }))
  } catch { return { email: false, telegram: false, whatsapp: false, push: false } }
}

/** "Enviarme una prueba" por un canal: un mensaje corto, sin el resumen. */
export async function sendTestNow(canal: Canal): Promise<{ ok: boolean; msg: string }> {
  try {
    const { api: a, unwrapData, params } = await api()
    return { ok: true, msg: unwrapData(await a.notify.test({ params, body: { canal } })).msg }
  } catch (e) { return failure(e) }
}

/** Telegram: genera un código y el enlace t.me/<bot>?start=<código>. */
export async function telegramStartLink(): Promise<{ ok: boolean; url?: string; msg?: string }> {
  try {
    const { api: a, unwrapData, params } = await api()
    return { ok: true, url: unwrapData(await a.notify.telegramLink({ params })).url }
  } catch (e) { return failure(e) }
}

/** Telegram: busca el mensaje "/start <código>" en el bot y guarda el chat. */
export async function telegramConfirm(): Promise<{ ok: boolean; msg: string }> {
  try {
    const { api: a, unwrapData, params } = await api()
    return { ok: true, msg: unwrapData(await a.notify.telegramConfirm({ params })).msg }
  } catch (e) { return failure(e) }
}

export async function telegramUnlink(): Promise<void> {
  const { api: a, unwrapData, params } = await api()
  unwrapData(await a.notify.telegramUnlink({ params }))
}

/** Al abrir la app: actualiza la campana y devuelve hasta 3 avisos urgentes para mostrar. */
export async function openAppNotifs(): Promise<{ id: string; t: string; b: string; go: string; lvl: string }[]> {
  try {
    const { api: a, unwrap, params } = await api()
    return unwrap(await a.notify.open({ params }))
  } catch { return [] }
}

export type LogroInput = {
  bookId: string
  badges: { id: string; n: string; d: string }[]
  nivel: { n: number; name: string } | null
}

/** Insignias nuevas y subida de nivel → campana (POST /v1/books/:b/gami/logros). Nunca lanza. */
export async function logroNotifs(input: LogroInput): Promise<{ ok: boolean }> {
  try {
    const { api: a, unwrapData } = await api()
    unwrapData(await a.gami.logros({ params: { bookId: input.bookId }, body: { badges: input.badges, nivel: input.nivel } }))
    return { ok: true }
  } catch { return { ok: false } }
}

/** ¿Se puede enviar el recordatorio de cobro desde el número de Mirai? */
export async function cobroWaStatus(): Promise<{ disponible: boolean; verificado: boolean; motivo?: string }> {
  try {
    const { api: a, unwrap, params } = await api()
    return unwrap(await a.notify.cobroWaStatus({ params }))
  } catch { return { disponible: false, verificado: false } }
}

/** Envía a quien te debe el recordatorio de su cuota desde el número de Mirai (requiere su consentimiento). */
export async function sendCobroWhatsApp(input: { loanId: string; consentimiento: true }): Promise<{ ok: boolean; msg: string }> {
  try {
    const { api: a, unwrapData, params } = await api()
    return { ok: true, msg: unwrapData(await a.notify.cobroWaSend({ params, body: input })).msg }
  } catch (e) { return failure(e) }
}

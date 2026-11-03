"use server"

import { requireRole, getAppContext } from "@/lib/dal"
import { supabaseAdmin } from "@/lib/supabase/admin"
import type { Canal } from "@/lib/notify/digest"
import { channelsFor, cobroWaStatusFor, digestNowFor, isCanal, openAppNotifsFor, sendCobroWhatsAppFor, telegramConfirmFor, telegramLinkFor, telegramUnlinkFor, testNowFor, type Who } from "@/lib/notify/actions"
import { limitError } from "@/lib/security/rate-limit"
import { z } from "zod"

/** Persona y libro activos (para los casos de uso de @mirai/services/notify/actions). */
const who = (ctx: Awaited<ReturnType<typeof getAppContext>>): Who => ({ userId: ctx.user.id, householdId: ctx.household.id, bookId: ctx.book.id, email: ctx.user.email, nombre: ctx.user.nombre })

/** "Enviar resumen ahora" por un canal (también sirve de prueba si no hay avisos). */
export async function sendDigestNow(canal: "email" | "telegram" | "push" | "whatsapp"): Promise<{ ok: boolean; msg: string }> {
  try {
    if (!isCanal(canal)) return { ok: false, msg: "Canal desconocido." }
    const ctx = await getAppContext()
    const lim = await limitError("pruebaAviso", ctx.user.id, "Enviaste muchas pruebas seguidas")
    if (lim) return { ok: false, msg: lim }
    return { ok: true, msg: await digestNowFor(who(ctx), canal) }
  } catch (e) { return { ok: false, msg: (e as Error).message } }
}

/** Canales que Mirai ofrece a este hogar (los activa el administrador en la consola). */
export async function notifyChannels(): Promise<Record<Canal, boolean>> {
  try { const ctx = await getAppContext(); return await channelsFor(ctx.household.id) }
  catch { return { email: false, telegram: false, whatsapp: false, push: false } }
}

/** "Enviarme una prueba" por un canal: un mensaje corto, sin el resumen. Queda en el registro de envíos. */
export async function sendTestNow(canal: Canal): Promise<{ ok: boolean; msg: string }> {
  try {
    if (!isCanal(canal)) return { ok: false, msg: "Canal desconocido." }
    const ctx = await getAppContext()
    const lim = await limitError("pruebaAviso", ctx.user.id, "Enviaste muchas pruebas seguidas")
    if (lim) return { ok: false, msg: lim }
    return { ok: true, msg: await testNowFor(who(ctx), canal) }
  } catch (e) { return { ok: false, msg: (e as Error).message } }
}

/** Telegram: genera un código y el enlace t.me/<bot>?start=<código>. */
export async function telegramStartLink(): Promise<{ ok: boolean; url?: string; msg?: string }> {
  const ctx = await requireRole("viewer")
  try { return { ok: true, url: await telegramLinkFor({ householdId: ctx.household.id, userId: ctx.user.id }) } }
  catch (e) { return { ok: false, msg: (e as Error).message } }
}

/** Telegram: busca el mensaje "/start <código>" en el bot y guarda el chat. */
export async function telegramConfirm(): Promise<{ ok: boolean; msg: string }> {
  const ctx = await requireRole("viewer")
  try { return { ok: true, msg: await telegramConfirmFor({ householdId: ctx.household.id, userId: ctx.user.id, nombre: ctx.user.nombre }) } }
  catch (e) { return { ok: false, msg: (e as Error).message } }
}

export async function telegramUnlink() {
  const ctx = await requireRole("viewer")
  await telegramUnlinkFor(ctx.user.id)
}

/** Al abrir la app: actualiza la campana y devuelve hasta 3 avisos urgentes para mostrar (maybePopups de la v4). */
export async function openAppNotifs(): Promise<{ id: string; t: string; b: string; go: string; lvl: string }[]> {
  try {
    const ctx = await getAppContext()
    return await openAppNotifsFor({ userId: ctx.user.id, bookId: ctx.book.id })
  } catch { return [] }
}

const LogroIn = z.object({
  bookId: z.string().uuid(),
  badges: z.array(z.object({ id: z.string().max(60), n: z.string().max(120), d: z.string().max(300) })).max(20),
  nivel: z.object({ n: z.number().int().min(1).max(200), name: z.string().max(80) }).nullable(),
})

/** Insignias nuevas y subida de nivel → campana (kind "logro"). Sin duplicados: una por insignia y nivel. */
export async function logroNotifs(input: z.infer<typeof LogroIn>): Promise<{ ok: boolean }> {
  try {
    const d = LogroIn.parse(input)
    const ctx = await getAppContext()
    if (ctx.book.id !== d.bookId) return { ok: false }
    const rows = [
      ...d.badges.map((b) => ({ user_id: ctx.user.id, book_id: d.bookId, kind: "logro", titulo: `Insignia: ${b.n}`, cuerpo: b.d, href: "/logros", dedupe: `${d.bookId}:logro:${b.id}` })),
      ...(d.nivel ? [{ user_id: ctx.user.id, book_id: d.bookId, kind: "logro", titulo: `¡Subiste al nivel ${d.nivel.n}!`, cuerpo: `Ahora eres ${d.nivel.name}. ¡Sigue así!`, href: "/logros", dedupe: `${d.bookId}:nivel:${d.nivel.n}` }] : []),
    ]
    if (rows.length) await supabaseAdmin().from("notifications").upsert(rows, { onConflict: "user_id,dedupe", ignoreDuplicates: true })
    return { ok: true }
  } catch { return { ok: false } }
}

// ── Recordatorio de cobro por WhatsApp desde el número de Mirai (Me deben) ─────────────────────────────────────────

/**
 * ¿Se puede enviar el recordatorio desde el número de Mirai? Hace falta: WhatsApp activo, una plantilla PROPIA aprobada para
 * el caso "Recordatorio a quien te debe" (consola › WhatsApp) y que la persona tenga su WhatsApp verificado (ya recibió
 * algún mensaje de Mirai en su número).
 */
export async function cobroWaStatus(): Promise<{ disponible: boolean; verificado: boolean; motivo?: string }> {
  try {
    const ctx = await requireRole("editor")
    return await cobroWaStatusFor({ householdId: ctx.household.id, userId: ctx.user.id, bookId: ctx.book.id })
  } catch { return { disponible: false, verificado: false } }
}

const CobroIn = z.object({ loanId: z.string().uuid(), consentimiento: z.literal(true) })

/**
 * Envía a la persona que te debe el recordatorio de su cuota desde el número de Mirai, con la plantilla aprobada del caso
 * "cobro_tercero" (nunca con una de respaldo: el mensaje debe decir que es un cobro y de parte de quién). Requiere que
 * confirmes que esa persona aceptó recibirlo. Uno por préstamo al día; queda en el registro de envíos.
 */
export async function sendCobroWhatsApp(input: z.infer<typeof CobroIn>): Promise<{ ok: boolean; msg: string }> {
  try {
    const d = CobroIn.safeParse(input)
    if (!d.success) return { ok: false, msg: "Confirma que la persona aceptó recibir el recordatorio por WhatsApp." }
    const ctx = await requireRole("editor")
    const st = await cobroWaStatusFor({ householdId: ctx.household.id, userId: ctx.user.id, bookId: ctx.book.id })
    if (!st.disponible) return { ok: false, msg: st.motivo ?? "El envío por WhatsApp desde Mirai no está disponible." }
    if (!st.verificado) return { ok: false, msg: st.motivo ?? "Primero verifica tu WhatsApp: en Ajustes › Alertas envíate una prueba." }
    const lim = await limitError("cobroWa", ctx.user.id, "Enviaste muchos recordatorios hoy")
    if (lim) return { ok: false, msg: lim }
    return { ok: true, msg: await sendCobroWhatsAppFor(who(ctx), d.data.loanId) }
  } catch (e) { return { ok: false, msg: (e as Error).message } }
}

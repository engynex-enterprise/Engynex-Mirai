"use server"

import { randomBytes } from "node:crypto"
import { requireRole, getAppContext } from "@/lib/dal"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { getIntegration } from "@/features/integrations/store"
import { telegramApi } from "@/lib/notify/channels"
import { avisosPara, channelStatus, defaultRule, deliver, horaBogota, NOT_READY, sendDigest, testMsg, upsertAppNotifs, type Canal, type Rule } from "@/lib/notify/digest"
import { caseConfig, formatCoPhone, normalizeCoPhone, waSettings, waValuesFromText } from "@/lib/notify/whatsapp"
import { sendWhatsApp, fallbackNote } from "@/lib/notify/channels"
import { claimSend, finishSend } from "@/lib/notify/log"
import { maskDest } from "@/lib/notify/rules"
import { formatCOP, loanEngine, todayBogota } from "@/lib/domain"
import { siteUrl } from "@/lib/site-url"
import { enSilencio } from "@/lib/notify/rules"
import { limitError } from "@/lib/security/rate-limit"
import { z } from "zod"

async function myRule() {
  const ctx = await getAppContext()
  const { data } = await supabaseAdmin().from("notification_rules").select("*").eq("user_id", ctx.user.id).eq("book_id", ctx.book.id).maybeSingle()
  return { ctx, rule: (data as unknown as Rule) ?? defaultRule(ctx.user.id, ctx.book.id) }
}

/** "Enviar resumen ahora" por un canal (también sirve de prueba si no hay avisos). */
export async function sendDigestNow(canal: "email" | "telegram" | "push" | "whatsapp"): Promise<{ ok: boolean; msg: string }> {
  try {
    if (!["email", "telegram", "push", "whatsapp"].includes(canal)) return { ok: false, msg: "Canal desconocido." }
    const { ctx, rule } = await myRule()
    const lim = await limitError("pruebaAviso", ctx.user.id, "Enviaste muchas pruebas seguidas")
    if (lim) return { ok: false, msg: lim }
    const r = await sendDigest({ householdId: ctx.household.id, rule, canal, email: ctx.user.email, nombre: ctx.user.nombre, force: true })
    return { ok: true, msg: r.msg }
  } catch (e) { return { ok: false, msg: (e as Error).message } }
}

/** Canales que Mirai ofrece a este hogar (los activa el administrador en la consola). */
export async function notifyChannels(): Promise<Record<Canal, boolean>> {
  try { const ctx = await getAppContext(); return await channelStatus(ctx.household.id) }
  catch { return { email: false, telegram: false, whatsapp: false, push: false } }
}

/** "Enviarme una prueba" por un canal: un mensaje corto, sin el resumen. Queda en el registro de envíos. */
export async function sendTestNow(canal: Canal): Promise<{ ok: boolean; msg: string }> {
  try {
    if (!["email", "telegram", "push", "whatsapp"].includes(canal)) return { ok: false, msg: "Canal desconocido." }
    const { ctx, rule } = await myRule()
    const lim = await limitError("pruebaAviso", ctx.user.id, "Enviaste muchas pruebas seguidas")
    if (lim) return { ok: false, msg: lim }
    if (canal === "whatsapp" && rule.whatsapp_to && !normalizeCoPhone(rule.whatsapp_to)) return { ok: false, msg: "Tu número de WhatsApp no es válido: escribe un celular de 10 dígitos (por ejemplo 315 123 4567)." }
    const msg = await deliver({ householdId: ctx.household.id, userId: ctx.user.id, canal, emailTo: rule.email_to || ctx.user.email, whatsappTo: rule.whatsapp_to, kind: "prueba" }, testMsg(ctx.user.nombre))
    return { ok: true, msg }
  } catch (e) { return { ok: false, msg: (e as Error).message } }
}

/** Telegram: genera un código y el enlace t.me/<bot>?start=<código>. */
export async function telegramStartLink(): Promise<{ ok: boolean; url?: string; msg?: string }> {
  const ctx = await requireRole("viewer")
  const v = await getIntegration(ctx.household.id, "telegram")
  if (!v?.secrets.botToken) return { ok: false, msg: NOT_READY.telegram }
  try {
    const me = await telegramApi<{ username: string }>(v.secrets.botToken, "getMe")
    const code = randomBytes(6).toString("hex")
    await supabaseAdmin().from("telegram_links").upsert({ user_id: ctx.user.id, link_code: code })
    return { ok: true, url: `https://t.me/${me.username}?start=${code}` }
  } catch (e) { return { ok: false, msg: (e as Error).message } }
}

/** Telegram: busca el mensaje "/start <código>" en el bot y guarda el chat. */
export async function telegramConfirm(): Promise<{ ok: boolean; msg: string }> {
  const ctx = await requireRole("viewer")
  const v = await getIntegration(ctx.household.id, "telegram")
  const db = supabaseAdmin()
  const { data: link } = await db.from("telegram_links").select("*").eq("user_id", ctx.user.id).maybeSingle()
  if (!v?.secrets.botToken) return { ok: false, msg: NOT_READY.telegram }
  if (!link?.link_code) return { ok: false, msg: "Primero toca “Vincular Telegram”." }
  try {
    const ups = await telegramApi<{ message?: { text?: string; chat: { id: number } } }[]>(v.secrets.botToken, "getUpdates", { allowed_updates: ["message"], limit: 100 })
    const hit = ups.reverse().find((u) => u.message?.text?.trim() === `/start ${link.link_code}`)
    if (!hit?.message) return { ok: false, msg: "Aún no vemos tu mensaje. Abre el enlace, toca “Iniciar” en Telegram y vuelve a intentar." }
    const chat = String(hit.message.chat.id)
    await db.from("telegram_links").update({ chat_id: chat, linked_at: new Date().toISOString(), link_code: null }).eq("user_id", ctx.user.id)
    await telegramApi(v.secrets.botToken, "sendMessage", { chat_id: chat, text: `¡Listo, ${ctx.user.nombre.split(" ")[0]}! Desde ahora te llegarán aquí los avisos de Mirai.` })
    return { ok: true, msg: "Telegram vinculado." }
  } catch (e) { return { ok: false, msg: (e as Error).message } }
}

export async function telegramUnlink() {
  const ctx = await requireRole("viewer")
  await supabaseAdmin().from("telegram_links").delete().eq("user_id", ctx.user.id)
}

/** Al abrir la app: actualiza la campana y devuelve hasta 3 avisos urgentes para mostrar (maybePopups de la v4). */
export async function openAppNotifs(): Promise<{ id: string; t: string; b: string; go: string; lvl: string }[]> {
  try {
    const { ctx, rule } = await myRule()
    if (rule.canales?.app === false) return []
    const list = await avisosPara(ctx.book.id, rule, "app")
    await upsertAppNotifs(rule, list)
    if (rule.canales?.popup === false || enSilencio(horaBogota(), rule.silencio)) return []
    return list.filter((n) => n.lvl === "bad" || n.lvl === "warn").slice(0, 6).map((n) => ({ id: n.id, t: n.t, b: n.b, go: n.go, lvl: n.lvl }))
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
    const v = await getIntegration(ctx.household.id, "whatsapp")
    const c = v?.secrets.token && v.config.phoneId ? caseConfig(waSettings(v.config), "cobro_tercero") : null
    if (!c?.propia) return { disponible: false, verificado: false, motivo: "Mirai todavía no tiene lista la plantilla de WhatsApp para recordar cobros." }
    const { data: rule } = await supabaseAdmin().from("notification_rules").select("whatsapp_to").eq("user_id", ctx.user.id).eq("book_id", ctx.book.id).maybeSingle()
    const mio = normalizeCoPhone(rule?.whatsapp_to)
    const { count } = mio ? await supabaseAdmin().from("notification_log").select("id", { count: "exact", head: true }).eq("user_id", ctx.user.id).eq("channel", "whatsapp").eq("status", "enviado") : { count: 0 }
    return { disponible: true, verificado: !!mio && (count ?? 0) > 0, motivo: mio ? undefined : "Primero escribe tu número de WhatsApp en Ajustes › Alertas y envíate una prueba." }
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
    const st = await cobroWaStatus()
    if (!st.disponible) return { ok: false, msg: st.motivo ?? "El envío por WhatsApp desde Mirai no está disponible." }
    if (!st.verificado) return { ok: false, msg: st.motivo ?? "Primero verifica tu WhatsApp: en Ajustes › Alertas envíate una prueba." }
    const lim = await limitError("cobroWa", ctx.user.id, "Enviaste muchos recordatorios hoy")
    if (lim) return { ok: false, msg: lim }
    const db = supabaseAdmin()
    const { data: L } = await db.from("loans").select("*, loan_payments(*)").eq("id", d.data.loanId).eq("book_id", ctx.book.id).is("deleted_at", null).maybeSingle()
    if (!L || L.kind !== "cobrar") return { ok: false, msg: "No encontramos ese préstamo en Me deben." }
    const { data: contact } = L.contact_id ? await db.from("contacts").select("nombre,telefono").eq("id", L.contact_id).maybeSingle() : { data: null }
    const to = normalizeCoPhone(contact?.telefono)
    if (!contact || !to) return { ok: false, msg: "El contacto necesita un celular de Colombia válido (10 dígitos)." }
    const hoy = todayBogota()
    const e = loanEngine({ ...L, extra: Number(L.extra ?? 0), payments: (L.loan_payments ?? []).filter((p: { deleted_at?: string | null }) => !p.deleted_at) } as never, hoy)
    const cu = e.vencidas.length ? e.vencidas : e.next ? [e.next] : []
    if (!cu.length) return { ok: false, msg: "Este préstamo no tiene cuotas pendientes." }
    const monto = formatCOP(cu.reduce((a, c) => a + c.valor, 0))
    const fecha = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long" }).format(new Date(`${cu[0].fecha}T12:00:00`))
    const quien = ctx.user.nombre || "Tu contacto"
    const concepto = L.concepto || "el préstamo"
    const resumen = `${quien} te recuerda la cuota de ${monto} de ${concepto} (${e.vencidas.length ? `venció el ${fecha}` : `para el ${fecha}`})`
    const v = (await getIntegration(ctx.household.id, "whatsapp"))!
    const claim = await claimSend({ dedupe: `cobro:${L.id}:${hoy}`, userId: ctx.user.id, householdId: ctx.household.id, bookId: ctx.book.id, channel: "whatsapp", kind: "cobro_tercero" })
    if (!claim) return { ok: false, msg: "Hoy ya le enviaste este recordatorio desde Mirai." }
    try {
      const r = await sendWhatsApp(v, to, waValuesFromText(resumen, { nombre: contact.nombre.split(" ")[0] ?? "", cobra: quien, titulo: `Cuota de ${concepto}`, detalle: concepto, monto, fecha, enlace: siteUrl() }), { caso: "cobro_tercero", text: resumen, override: { template: caseConfig(waSettings(v.config), "cobro_tercero").template } })
      await finishSend(claim, { status: "enviado", provider: "whatsapp", source: v.source ?? null, destino: maskDest("whatsapp", to), ref: r.id, error: fallbackNote(r.fallback) })
      return { ok: true, msg: `Recordatorio enviado al WhatsApp de ${contact.nombre} (${formatCoPhone(to)}).` }
    } catch (err) {
      const msg = (err as Error).message || "Error desconocido"
      await finishSend(claim, { status: "fallido", provider: "whatsapp", source: v.source ?? null, destino: maskDest("whatsapp", to), error: msg })
      return { ok: false, msg }
    }
  } catch (e) { return { ok: false, msg: (e as Error).message } }
}

// Envío de las invitaciones al hogar por los canales de Mirai: correo (el proveedor activo de la plataforma) y
// WhatsApp (plantilla propia aprobada del caso "invitacion"). Lo usa el adaptador de la API
// (apps/api/src/modules/households/adapters/services.messenger.ts). Solo servidor.
// Si no hay canal configurado o la plantilla no está aprobada, devuelve un resultado con el motivo en español y la
// persona comparte el enlace o lo envía desde su propio WhatsApp (nada se rompe).

import { fmtVence, inviteText, isTestEmail, type ChannelResult } from "@mirai/domain/household/invites"
import { ROLE_INFO, type AccessRole } from "@mirai/domain/household/roles"
import { getIntegration } from "../integrations/store"
import { emailProvider } from "../notify/digest"
import { rt } from "../runtime"
import { brandEmail, sendEmail } from "../notify/email"
import { fallbackNote, sendWhatsApp } from "../notify/channels"
import { claimSend, finishSend } from "../notify/log"
import { maskDest } from "../notify/rules"
import { caseConfig, normalizeCoPhone, waSettings, waValuesFromText } from "../notify/whatsapp"

/** Datos de la invitación que se van a enviar (los arma la API al crear o reenviar). */
export type InviteMsg = {
  householdId: string
  /** Quién invita (para el registro de envíos). */
  userId: string
  invita: string
  hogar: string
  nombre?: string | null
  rol: AccessRole
  url: string
  vence: string
}

/** Aviso a quien recibe el hogar al pasárselo. */
export type TransferMsg = { householdId: string; userId: string; de: string; para: string; hogar: string; url: string; vence: string }

const ahora = () => new Date().toISOString()
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

/** Cuerpo del correo de invitación, con el botón de aceptar y qué puede hacer con ese rol. */
function inviteHtml(m: InviteMsg) {
  const rol = ROLE_INFO[m.rol]
  const hola = m.nombre?.trim() ? `Hola, ${esc(m.nombre.trim().split(" ")[0])}` : "Hola"
  return brandEmail(`${esc(m.invita)} te invitó a su hogar en Mirai`, `
<p style="margin:0 0 12px;font-size:15px;line-height:22px">${hola}: <b>${esc(m.invita)}</b> te invitó a <b>${esc(m.hogar)}</b> para llevar juntos las cuentas de la casa en Mirai.</p>
<p style="margin:0 0 16px;font-size:15px;line-height:22px">Tu rol será <b>${esc(rol.label)}</b>. ${esc(rol.desc)}</p>
<p style="margin:0 0 20px"><a href="${m.url}" style="display:inline-block;background:#1F2B4B;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px">Aceptar la invitación</a></p>
<p style="margin:0 0 8px;font-size:13px;color:#616161">El enlace vence el ${esc(fmtVence(m.vence))}. Si el botón no abre, copia esta dirección:<br><span style="word-break:break-all">${esc(m.url)}</span></p>
<p style="margin:0;font-size:13px;color:#616161">Mirai es gratis y tus datos son privados: cada quien entra con su propia cuenta.</p>`,
    { footer: "Recibes este correo porque alguien te invitó a su hogar en Mirai. Si no lo esperabas, ignóralo: sin aceptar, nadie ve tu información." })
}

function transferHtml(m: TransferMsg) {
  return brandEmail(`${esc(m.de)} quiere pasarte el hogar ${esc(m.hogar)}`, `
<p style="margin:0 0 12px;font-size:15px;line-height:22px">Hola, ${esc(m.para)}: <b>${esc(m.de)}</b> quiere que tú seas el dueño del hogar <b>${esc(m.hogar)}</b> en Mirai.</p>
<p style="margin:0 0 20px"><a href="${m.url}" style="display:inline-block;background:#1F2B4B;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px">Ver la solicitud</a></p>
<p style="margin:0;font-size:13px;color:#616161">Tienes hasta el ${esc(fmtVence(m.vence))} para aceptar o rechazar.</p>`)
}

/**
 * Invitación por correo con el proveedor activo de Mirai. A los dominios de prueba no se les envía nada
 * (quedan como "prueba"), igual que en el resto de avisos.
 */
export async function sendInviteEmail(m: InviteMsg, to: string): Promise<ChannelResult> {
  const at = ahora()
  if (isTestEmail(to)) return { ok: true, at, via: "prueba", provider: "prueba" }
  const v = await emailProvider(m.householdId)
  if (!v) return { ok: false, at, via: "api", error: "No hay un servicio de correo activo en Mirai. Comparte el enlace o envíalo por WhatsApp." }
  const claim = await claimSend({ dedupe: `invitacion:${m.url}:${Date.now()}`, userId: m.userId, householdId: m.householdId, channel: "email", kind: "invitacion" })
  try {
    const ref = await sendEmail(v, { to, subject: `${m.invita} te invitó a su hogar en Mirai`, html: inviteHtml(m), text: inviteText(m) })
    if (claim) await finishSend(claim, { status: "enviado", provider: v.kind, source: v.source ?? null, destino: maskDest("email", to), ref })
    return { ok: true, at: ahora(), via: "api", provider: v.kind }
  } catch (e) {
    const error = (e as Error).message || "No pudimos enviar el correo"
    if (claim) await finishSend(claim, { status: "fallido", provider: v.kind, source: v.source ?? null, destino: maskDest("email", to), error })
    return { ok: false, at: ahora(), via: "api", provider: v.kind, error }
  }
}

/**
 * Invitación por WhatsApp desde el número de Mirai, con la plantilla propia aprobada del caso "invitacion".
 * Sin plantilla propia (o sin WhatsApp configurado) no se envía nada: la persona la manda desde su WhatsApp.
 */
export async function sendInviteWhatsApp(m: InviteMsg, phone: string): Promise<ChannelResult> {
  const at = ahora()
  const to = normalizeCoPhone(phone)
  if (!to) return { ok: false, at, via: "propio", error: "Ese celular no parece de Colombia: envíala desde tu WhatsApp." }
  const v = await getIntegration(m.householdId, "whatsapp")
  const cfg = v?.secrets.token && v.config.phoneId ? caseConfig(waSettings(v.config), "invitacion") : null
  if (!v || !cfg?.propia) return { ok: false, at, via: "propio", error: "Mirai todavía no envía invitaciones por WhatsApp: mándala desde tu WhatsApp con el botón de abajo." }
  const texto = inviteText(m)
  const claim = await claimSend({ dedupe: `invitacion-wa:${m.url}:${Date.now()}`, userId: m.userId, householdId: m.householdId, channel: "whatsapp", kind: "invitacion" })
  try {
    const r = await sendWhatsApp(v, to, waValuesFromText(texto, {
      nombre: m.nombre?.trim().split(" ")[0] ?? "", invita: m.invita, hogar: m.hogar,
      titulo: "Invitación al hogar", detalle: `${m.invita} te invitó a "${m.hogar}" en Mirai`, enlace: m.url,
    }), { caso: "invitacion", text: texto, override: { template: cfg.template } })
    if (claim) await finishSend(claim, { status: "enviado", provider: "whatsapp", source: v.source ?? null, destino: maskDest("whatsapp", to), ref: r.id, error: fallbackNote(r.fallback) })
    return { ok: true, at: ahora(), via: "api", provider: "whatsapp" }
  } catch (e) {
    const error = (e as Error).message || "No pudimos enviar el WhatsApp"
    if (claim) await finishSend(claim, { status: "fallido", provider: "whatsapp", source: v.source ?? null, destino: maskDest("whatsapp", to), error })
    return { ok: false, at: ahora(), via: "api", provider: "whatsapp", error }
  }
}

/** Correo de "te quiero pasar el hogar". Devuelve el estado que guarda la API. */
export async function sendTransferEmail(m: TransferMsg, to: string | null | undefined): Promise<"enviado" | "prueba" | "sin_correo" | "fallo"> {
  if (!to) return "sin_correo"
  if (isTestEmail(to)) return "prueba"
  const v = await emailProvider(m.householdId)
  if (!v) return "fallo"
  try {
    await sendEmail(v, { to, subject: `${m.de} quiere pasarte el hogar ${m.hogar}`, html: transferHtml(m), text: `${m.de} quiere pasarte el hogar "${m.hogar}" en Mirai. Míralo aquí: ${m.url} (vence el ${fmtVence(m.vence)}).` })
    return "enviado"
  } catch {
    return "fallo"
  }
}

/** ¿Mirai puede enviar la invitación por este canal? Lo usa la web para mostrar las opciones de envío. */
export async function inviteChannels(householdId: string): Promise<{ email: boolean; whatsapp: boolean; motivoWhatsApp?: string }> {
  const [mail, wa] = await Promise.all([emailProvider(householdId), getIntegration(householdId, "whatsapp")])
  const cfg = wa?.secrets.token && wa.config.phoneId ? caseConfig(waSettings(wa.config), "invitacion") : null
  return {
    email: !!mail,
    whatsapp: !!cfg?.propia,
    motivoWhatsApp: cfg?.propia ? undefined : "Mirai todavía no tiene aprobada la plantilla de WhatsApp para invitaciones.",
  }
}

/** Dirección pública de Mirai (para armar el enlace de la invitación cuando la API no la pasa). */
export const siteUrl = () => rt().siteUrl()

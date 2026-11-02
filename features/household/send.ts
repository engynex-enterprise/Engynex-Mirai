import "server-only"
import { getIntegration } from "@/features/integrations/store"
import { brandEmail, EMAIL_KINDS, sendEmail } from "@/lib/notify/email"
import { loadTemplate, sendWhatsApp } from "@/lib/notify/channels"
import { logSend } from "@/lib/notify/log"
import { maskDest } from "@/lib/notify/rules"
import { caseConfig, esPlantillaDeMeta, waSettings } from "@/lib/notify/whatsapp"
import { fmtVence, inviteText, isTestEmail, type ChannelResult } from "@/lib/household/invites"
import { ROLE_INFO, type AccessRole } from "@/lib/household/roles"

export type InviteMsg = { householdId: string; userId: string; invita: string; hogar: string; nombre?: string | null; rol: AccessRole; url: string; vence: string }

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)

/** Correo de invitación con la marca Mirai: quién invita, a qué hogar, el rol en palabras simples, botón y vencimiento. */
export function inviteEmailHtml(m: InviteMsg) {
  const r = ROLE_INFO[m.rol]
  const hola = m.nombre?.trim() ? `Hola, ${esc(m.nombre.trim().split(" ")[0])}:` : "Hola:"
  return brandEmail(`${esc(m.invita)} te invitó a su hogar en Mirai`, `
<p style="margin:0 0 12px">${hola}</p>
<p style="margin:0 0 16px"><b>${esc(m.invita)}</b> quiere que lleven juntos las cuentas de la casa en <b>“${esc(m.hogar)}”</b>. Mirai es una app para organizar los gastos, los ingresos y las metas de la familia, sin enredos.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F8E9;border-radius:10px;margin:0 0 20px"><tr><td style="padding:14px 16px">
<p style="margin:0;font-size:12px;color:#3F7A1E;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Tu rol</p>
<p style="margin:4px 0 2px;font-size:16px;font-weight:600">${esc(r.label)}</p>
<p style="margin:0;font-size:14px;color:#424242">${esc(r.desc)}</p>
</td></tr></table>
<p style="margin:0 0 20px"><a href="${m.url}" style="display:inline-block;background:#1F2B4B;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Aceptar invitación</a></p>
<p style="margin:0 0 6px;font-size:13px;color:#616161">La invitación vence el <b>${esc(fmtVence(m.vence))}</b>. Si no tienes cuenta, la creas en un minuto con este mismo correo.</p>
<p style="margin:0;font-size:12px;color:#9E9E9E;word-break:break-all">Si el botón no abre, copia este enlace: ${m.url}</p>`, {
    footer: `Recibes este correo porque ${esc(m.invita)} te invitó a su hogar en Mirai. Si no conoces a esta persona, ignóralo: sin aceptar no pasa nada.`,
  })
}

/** Envía la invitación por correo con el proveedor activo. Los dominios de prueba (.test, example.com) no se envían. */
export async function sendInviteEmail(m: InviteMsg, to: string): Promise<ChannelResult> {
  const at = new Date().toISOString()
  if (isTestEmail(to)) return { ok: true, at, via: "prueba", provider: "prueba" }
  let last: ChannelResult | null = null
  for (const k of EMAIL_KINDS) {
    const v = await getIntegration(m.householdId, k)
    if (!v?.enabled) continue
    const log = { user_id: m.userId, household_id: m.householdId, channel: "email", kind: "invitacion", provider: k, source: v.source ?? null, destino: maskDest("email", to) } as const
    try {
      const ref = await sendEmail(v, { to, subject: `${m.invita} te invitó a su hogar en Mirai`, html: inviteEmailHtml(m), text: inviteText({ ...m, url: m.url }) })
      await logSend({ ...log, status: "enviado", ref })
      return { ok: true, at, provider: k, via: "api" }
    } catch (e) {
      const error = (e as Error).message || "error desconocido"
      await logSend({ ...log, status: "fallido", error })
      last = { ok: false, at, provider: k, error, via: "api" }
    }
  }
  return last ?? { ok: false, at, error: "No hay un servicio de correo activo en Mirai. Comparte el enlace o envíalo por WhatsApp.", via: "api" }
}

/**
 * WhatsApp con la Cloud API SOLO si el caso "invitacion" tiene una plantilla propia aprobada (nunca la de prueba de
 * Meta ni la plantilla por defecto de los avisos). Si no, devuelve `via: "propio"` para que la persona la envíe
 * desde su WhatsApp con el enlace wa.me.
 */
export async function sendInviteWhatsApp(m: InviteMsg, phone: string): Promise<ChannelResult> {
  const at = new Date().toISOString()
  const v = await getIntegration(m.householdId, "whatsapp")
  if (!v?.enabled || !v.secrets?.token || !v.config?.phoneId) return { ok: false, at, via: "propio", error: "Envíala desde tu WhatsApp: Mirai aún no envía invitaciones por WhatsApp." }
  const s = waSettings(v.config)
  const c = caseConfig(s, "invitacion")
  if (!c.propia || !c.template || esPlantillaDeMeta(c.template)) return { ok: false, at, via: "propio", error: "Envíala desde tu WhatsApp: la plantilla de invitación aún no está lista en Meta." }
  const log = { user_id: m.userId, household_id: m.householdId, channel: "whatsapp", kind: "invitacion", provider: "whatsapp", source: v.source ?? null, destino: maskDest("whatsapp", phone) } as const
  try {
    await loadTemplate(v, c.template, c.lang) // error legible si está en revisión, rechazada o pausada (sin plantilla de respaldo)
    const text = inviteText(m)
    const r = await sendWhatsApp(v, phone, {
      nombre: m.nombre?.trim().split(" ")[0] ?? "", invita: m.invita, hogar: m.hogar, enlace: m.url, resumen: text,
      titulo: "Invitación al hogar", detalle: `${m.invita} te invitó a "${m.hogar}" en Mirai`, monto: "", cantidad: "1", fecha: fmtVence(m.vence),
    }, { caso: "invitacion", override: { template: c.template, lang: c.lang, map: c.map } })
    await logSend({ ...log, status: "enviado", ref: r.id })
    return { ok: true, at, provider: "whatsapp", via: "api" }
  } catch (e) {
    const error = String((e as Error).message || "error desconocido").replace(/^WhatsApp: /, "")
    await logSend({ ...log, status: "fallido", error })
    return { ok: false, at, provider: "whatsapp", via: "api", error }
  }
}

import "server-only"
import { getIntegration } from "@/features/integrations/store"
import { brandEmail, EMAIL_KINDS, sendEmail } from "@/lib/notify/email"
import { logSend } from "@/lib/notify/log"
import { maskDest } from "@/lib/notify/rules"
import { isTestEmail } from "@/lib/household/invites"
import { escapeHtml as esc } from "@/lib/security/errors"
import { TRANSFER_DAYS } from "@/lib/household/transfer"

export type TransferMail = { householdId: string; userId: string; de: string; para: string; hogar: string; url: string; vence: string }

export function transferEmailHtml(m: TransferMail) {
  const vence = new Date(m.vence).toLocaleDateString("es-CO", { timeZone: "America/Bogota", weekday: "long", day: "numeric", month: "long" })
  return brandEmail(`${esc(m.de)} quiere pasarte el hogar “${esc(m.hogar)}”`, `
<p style="margin:0 0 12px">Hola, ${esc(m.para.split(" ")[0] || "")}:</p>
<p style="margin:0 0 16px"><b>${esc(m.de)}</b> quiere que seas el <b>Dueño del hogar</b> “${esc(m.hogar)}” en Mirai.</p>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F1F8E9;border-radius:10px;margin:0 0 20px"><tr><td style="padding:14px 16px;font-size:14px;color:#424242">
<p style="margin:0 0 6px">• Podrás cambiar o pagar el plan, borrar el hogar y pasárselo a otra persona.</p>
<p style="margin:0 0 6px">• ${esc(m.de)} sigue en el hogar con otro rol.</p>
<p style="margin:0">• No se borra nada: los libros y los movimientos siguen igual.</p>
</td></tr></table>
<p style="margin:0 0 20px"><a href="${m.url}" style="display:inline-block;background:#1F2B4B;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600">Aceptar o rechazar</a></p>
<p style="margin:0;font-size:13px;color:#616161">Tienes ${TRANSFER_DAYS} días, hasta el <b>${esc(vence)}</b>. También lo ves en la campana de avisos de Mirai.</p>`, {
    footer: `Recibes este correo porque ${esc(m.de)} quiere pasarte su hogar en Mirai. Si no la conoces, ignóralo: sin aceptar no cambia nada.`,
  })
}

/** Aviso por correo a quien recibe el hogar. Los dominios de prueba (.test, example.com) no se envían. */
export async function sendTransferEmail(m: TransferMail, to: string | null | undefined): Promise<"enviado" | "prueba" | "sin_correo" | "fallo"> {
  if (!to) return "sin_correo"
  if (isTestEmail(to)) return "prueba"
  for (const k of EMAIL_KINDS) {
    const v = await getIntegration(m.householdId, k)
    if (!v?.enabled) continue
    const log = { user_id: m.userId, household_id: m.householdId, channel: "email", kind: "hogar", provider: k, source: v.source ?? null, destino: maskDest("email", to) } as const
    try {
      const ref = await sendEmail(v, { to, subject: `${m.de} quiere pasarte el hogar “${m.hogar}” en Mirai`, html: transferEmailHtml(m), text: `${m.de} quiere que seas el dueño del hogar “${m.hogar}” en Mirai. Acepta o rechaza aquí: ${m.url}` })
      await logSend({ ...log, status: "enviado", ref })
      return "enviado"
    } catch (e) {
      await logSend({ ...log, status: "fallido", error: (e as Error).message || "error desconocido" })
    }
  }
  return "fallo"
}

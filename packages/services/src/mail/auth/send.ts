// Envío de los correos de auth (v7, V7-A) con el puerto de correo de siempre: el proveedor activo de la plataforma
// (consola › Integraciones globales: Resend, Brevo, SendGrid, Gmail o SMTP), con el registro en notification_log
// (consola › Envíos, destino enmascarado). Solo servidor. El remitente se puede fijar (AUTH_MAIL_FROM).
import { getGlobalIntegration, type IntegrationValue } from "../../integrations/store"
import { EMAIL_KINDS } from "../../notify/email-kinds"
import { sendEmail } from "../../notify/email"
import { logSend } from "../../notify/log"
import { maskDest } from "../../notify/rules"
import type { AuthMail } from "./templates"

export type AuthSendResult = { ok: true; provider: string; ref: string | null } | { ok: false; error: string }

/** Proveedores de correo encendidos en la plataforma (en el orden del registro). */
async function platformMailers(): Promise<IntegrationValue[]> {
  const out: IntegrationValue[] = []
  for (const kind of EMAIL_KINDS) {
    const g = await getGlobalIntegration(kind)
    if (!g || g.modo === "apagada") continue
    out.push({ kind, enabled: true, config: g.config, secrets: g.secrets, source: "plataforma" })
  }
  return out
}

/**
 * Envía un correo de auth con el primer proveedor que funcione. Nunca lanza: devuelve el resultado para que el flujo
 * decida (Better Auth no debe revelar si el correo existe). `userId` va al registro de envíos.
 */
export async function sendAuthMail(to: string, mail: AuthMail, o: { userId?: string | null; from?: string; fromName?: string } = {}): Promise<AuthSendResult> {
  const mailers = await platformMailers().catch(() => [])
  if (!mailers.length) return { ok: false, error: "No hay un servicio de correo activo en la plataforma" }
  let last = "sin proveedor"
  for (const v of mailers) {
    const value: IntegrationValue = o.from ? { ...v, config: { ...v.config, from: o.from, fromName: o.fromName ?? v.config.fromName ?? "Mirai" } } : v
    const log = { user_id: o.userId ?? null, channel: "email" as const, kind: `auth_${mail.kind}`, provider: v.kind, source: "plataforma", destino: maskDest("email", to) }
    try {
      const ref = await sendEmail(value, { to, subject: mail.subject, html: mail.html, text: mail.text })
      await logSend({ ...log, status: "enviado", ref })
      return { ok: true, provider: v.kind, ref }
    } catch (e) {
      last = (e as Error).message || "error desconocido"
      await logSend({ ...log, status: "fallido", error: last })
    }
  }
  return { ok: false, error: last }
}

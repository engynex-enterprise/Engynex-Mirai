import "server-only"
import nodemailer from "nodemailer"
import { Resend } from "resend"
import type { IntegrationValue } from "@/features/integrations/store"

export type Mail = { to: string; subject: string; html: string; text?: string }

/** Envía un correo con el proveedor configurado (Resend, Brevo, SendGrid, Gmail o SMTP). Devuelve el id del mensaje si el proveedor lo da. */
export async function sendEmail(v: IntegrationValue, m: Mail): Promise<string | null> {
  const c = v.config as Record<string, string>, s = v.secrets
  const fromName = c.fromName || "Mirai"
  switch (v.kind) {
    case "email_resend": {
      const r = await new Resend(s.apiKey).emails.send({ from: `${fromName} <${c.from}>`, to: m.to, subject: m.subject, html: m.html, text: m.text })
      if (r.error) throw new Error(r.error.message)
      return r.data?.id ?? null
    }
    case "email_brevo": {
      const r = await fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": s.apiKey, "content-type": "application/json" }, body: JSON.stringify({ sender: { email: c.from, name: fromName }, to: [{ email: m.to }], subject: m.subject, htmlContent: m.html, textContent: m.text }) })
      if (!r.ok) throw new Error(`Brevo ${r.status}: ${await r.text()}`)
      return ((await r.json().catch(() => ({}))) as { messageId?: string }).messageId ?? null
    }
    case "email_sendgrid": {
      const r = await fetch("https://api.sendgrid.com/v3/mail/send", { method: "POST", headers: { authorization: `Bearer ${s.apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ personalizations: [{ to: [{ email: m.to }] }], from: { email: c.from, name: fromName }, subject: m.subject, content: [{ type: "text/html", value: m.html }] }) })
      if (!r.ok) throw new Error(`SendGrid ${r.status}: ${await r.text()}`)
      return r.headers.get("x-message-id")
    }
    case "email_gmail":
    case "email_smtp": {
      const gmail = v.kind === "email_gmail"
      const t = nodemailer.createTransport(gmail ? { service: "gmail", auth: { user: c.user, pass: s.pass } } : { host: c.host, port: Number(c.port) || 465, secure: c.secure !== "false" && (c.secure as unknown) !== false, auth: { user: c.user, pass: s.pass } })
      const info = await t.sendMail({ from: `${fromName} <${gmail ? c.user : c.from}>`, to: m.to, subject: m.subject, html: m.html, text: m.text })
      return info.messageId ?? null
    }
    default: throw new Error("Proveedor de correo desconocido")
  }
}

export { EMAIL_KINDS } from "./email-kinds"

/** Plantilla HTML con la marca Mirai para todos los correos. */
export function brandEmail(title: string, bodyHtml: string) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#F5F5F5;font-family:Segoe UI,Arial,sans-serif;color:#242424">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:#1F2B4B;padding:20px 24px;color:#fff;font-size:20px;font-weight:600">Mirai <span style="font-weight:400;opacity:.7;font-size:13px">· Tu futuro financiero</span></td></tr>
<tr><td style="height:4px;background:#9EDB4E"></td></tr>
<tr><td style="padding:24px"><h1 style="font-size:18px;margin:0 0 12px">${title}</h1>${bodyHtml}</td></tr>
<tr><td style="padding:16px 24px;font-size:12px;color:#616161;border-top:1px solid #E0E0E0">Recibes este correo porque activaste los avisos en Mirai › Ajustes. Puedes apagarlos cuando quieras.</td></tr>
</table></td></tr></table></body></html>`
}

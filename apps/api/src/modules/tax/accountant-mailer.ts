// Correo con el enlace para el contador (V7-G). Puerto + adaptador con @mirai/services: el primer proveedor de correo
// activo del hogar (o de la plataforma), con el registro de envíos, igual que `mail()` de
// apps/web/features/contador/actions.ts. En las pruebas, un doble sin red.
import { Injectable } from "@nestjs/common"
import { getIntegration } from "@mirai/services/integrations/store"
import { brandEmail, EMAIL_KINDS, sendEmail } from "@mirai/services/notify/email"
import { logSend } from "@mirai/services/notify/log"
import { maskDest } from "@mirai/services/notify/rules"

export abstract class AccountantMailer {
  /** Envía el enlace. true = salió; false = no hay correo activo. Lanza si el proveedor falló. */
  abstract send(o: { householdId: string; to: string; owner: string; url: string }): Promise<boolean>
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

@Injectable()
export class ServicesAccountantMailer extends AccountantMailer {
  async send({ householdId, to, owner, url }: { householdId: string; to: string; owner: string; url: string }) {
    for (const k of EMAIL_KINDS) {
      const v = await getIntegration(householdId, k)
      if (!v?.enabled) continue
      const log = { household_id: householdId, channel: "email", kind: "contador", provider: k, source: v.source ?? null, destino: maskDest("email", to) } as const
      const name = owner.replace(/[\r\n<>]/g, " ").trim().slice(0, 80) || "Tu cliente"
      try {
        const ref = await sendEmail(v, {
          to,
          subject: `${name} te dio acceso a su información en Mirai`,
          html: brandEmail("Tienes acceso de solo lectura", `<p>${esc(name)} te compartió su información para la declaración de renta en Mirai.</p><p style="margin-top:20px"><a href="${url}" style="background:#1F2B4B;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Abrir la información</a></p><p style="color:#616161;font-size:13px">El enlace es personal. No lo reenvíes.</p>`),
        })
        await logSend({ ...log, status: "enviado", ref })
      } catch (e) {
        await logSend({ ...log, status: "fallido", error: (e as Error).message })
        throw e
      }
      return true
    }
    return false
  }
}

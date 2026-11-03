// Puerto de los correos de auth (§3.1.8). Adaptadores:
// - ServicesAuthMailer: el proveedor de correo de la plataforma con @mirai/services (registro en notification_log).
// - LogAuthMailer: solo local; escribe el tipo y el enlace en el log de depuración (para entrar sin proveedor).
// - MemoryAuthMailer: pruebas; guarda los correos.
// Los correos de prueba (.test, example.com) nunca se envían de verdad, igual que en el resto de Mirai.
import { Inject, Injectable } from "@nestjs/common"
import type { Logger } from "pino"
import { isTestEmail } from "@mirai/domain/household/invites"
import { sendAuthMail } from "@mirai/services/mail/auth/send"
import type { AuthMail } from "@mirai/services/mail/auth/templates"
import { LOGGER } from "../../core/logging/logger"

export type SentAuthMail = { to: string; mail: AuthMail; userId: string | null }

export abstract class AuthMailer {
  abstract send(to: string, mail: AuthMail, o: { userId: string | null }): Promise<void>
}

export class ServicesAuthMailer extends AuthMailer {
  constructor(
    private readonly log: Logger,
    private readonly from: string,
  ) {
    super()
  }
  async send(to: string, mail: AuthMail, o: { userId: string | null }) {
    if (isTestEmail(to)) return
    const r = await sendAuthMail(to, mail, { userId: o.userId, from: this.from, fromName: "Mirai" })
    if (!r.ok) this.log.warn({ kind: mail.kind, userId: o.userId }, "No se pudo enviar un correo de auth")
  }
}

@Injectable()
export class LogAuthMailer extends AuthMailer {
  constructor(@Inject(LOGGER) private readonly log: Logger) {
    super()
  }
  async send(_to: string, mail: AuthMail, o: { userId: string | null }) {
    // Solo en local (MIRAI_ENV=local): el enlace sirve para entrar sin proveedor de correo. Nunca en pruebas/producción.
    const url = /https?:\/\/\S+/.exec(mail.text)?.[0]
    this.log.info({ kind: mail.kind, userId: o.userId, url }, "Correo de auth (local, sin enviar)")
  }
}

export class MemoryAuthMailer extends AuthMailer {
  readonly sent: SentAuthMail[] = []
  async send(to: string, mail: AuthMail, o: { userId: string | null }) {
    this.sent.push({ to, mail, userId: o.userId })
  }
  /** Último enlace enviado a `to` (de un tipo). */
  lastUrl(to: string, kind?: AuthMail["kind"]): string {
    const m = [...this.sent].reverse().find((s) => s.to.toLowerCase() === to.toLowerCase() && (!kind || s.mail.kind === kind))
    const url = m ? /https?:\/\/\S+/.exec(m.mail.text)?.[0] : undefined
    if (!url) throw new Error(`No hay correo ${kind ?? ""} para ${to}`)
    return url.replace(/[).,]+$/, "")
  }
  clear() {
    this.sent.length = 0
  }
}

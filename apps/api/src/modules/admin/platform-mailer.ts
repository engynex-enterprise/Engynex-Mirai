// Correo de la plataforma (integración global de correo) para la consola: enlaces de contraseña y comunicados.
// El adaptador real (proveedor activo en consola › Integraciones globales, plantilla de marca y notification_log) lo
// da F2-E-2 (`@mirai/services/notify`). Mientras tanto `NoPlatformMailer` responde como la web cuando no hay un
// correo de la plataforma activo: el enlace se devuelve para copiarlo y los comunicados van solo en la app.
import { Injectable } from "@nestjs/common"

export type PlatformMail = { to: string; subject: string; title: string; html: string; text?: string }

export abstract class PlatformMailer {
  /** ¿Hay un correo de la plataforma activo? */
  abstract available(): Promise<boolean>
  /** Envía con la marca Mirai. Lanza si el proveedor falla. Devuelve la referencia del proveedor. */
  abstract send(m: PlatformMail): Promise<string | null>
}

@Injectable()
export class NoPlatformMailer extends PlatformMailer {
  async available() {
    return false
  }
  async send(): Promise<string | null> {
    throw new Error("No hay un correo de la plataforma activo.")
  }
}

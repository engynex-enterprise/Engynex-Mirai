// Puertos externos del hogar (F2-I): envío de invitaciones y avisos de titularidad, y borrado de archivos (Ley 1581).
// Los servicios solo conocen estas clases abstractas; los adaptadores se eligen en households.module.ts.
import { Inject, Injectable } from "@nestjs/common"
import type { Logger } from "pino"
import { isTestEmail, type ChannelResult } from "@mirai/domain/household/invites"
import type { AccessRole } from "@mirai/domain/household/roles"
import { systemScope } from "../../core/db/scope"
import { SupabaseJsFactory } from "../../core/db/supabase-js.factory"
import { LOGGER } from "../../core/logging/logger"

/** Datos de una invitación para el correo / WhatsApp (InviteMsg de apps/web/features/household/send.ts). */
export type InviteMsg = { householdId: string; userId: string; invita: string; hogar: string; nombre?: string | null; rol: AccessRole; url: string; vence: string }
/** Aviso a quien recibe el hogar (TransferMail de apps/web/features/account/send.ts). */
export type TransferMail = { householdId: string; userId: string; de: string; para: string; hogar: string; url: string; vence: string }

/**
 * Canales para las invitaciones y los avisos del hogar. El adaptador real (correo con el proveedor activo, WhatsApp
 * con plantilla propia aprobada, registro en notification_log) lo da F2-E-2 (`@mirai/services/notify`, por
 * inyección). Mientras tanto `NoChannelMessenger` responde como la web cuando no hay ningún correo configurado:
 * la invitación queda creada y la persona la comparte con el enlace o desde su WhatsApp.
 */
export type InviteChannels = { email: boolean; whatsapp: boolean; motivoWhatsApp?: string }

export abstract class HouseholdMessenger {
  /** Por dónde puede enviar Mirai (la web muestra el resto de opciones para compartir). */
  abstract channels(householdId: string): Promise<InviteChannels>
  abstract inviteEmail(m: InviteMsg, to: string): Promise<ChannelResult>
  abstract inviteWhatsApp(m: InviteMsg, phone: string): Promise<ChannelResult>
  abstract transferEmail(m: TransferMail, to: string | null | undefined): Promise<"enviado" | "prueba" | "sin_correo" | "fallo">
}

@Injectable()
export class NoChannelMessenger extends HouseholdMessenger {
  async channels(): Promise<InviteChannels> {
    return { email: false, whatsapp: false, motivoWhatsApp: "Mirai aún no envía invitaciones por WhatsApp." }
  }
  async inviteEmail(_m: InviteMsg, to: string): Promise<ChannelResult> {
    const at = new Date().toISOString()
    if (isTestEmail(to)) return { ok: true, at, via: "prueba", provider: "prueba" }
    return { ok: false, at, error: "No hay un servicio de correo activo en Mirai. Comparte el enlace o envíalo por WhatsApp.", via: "api" }
  }
  async inviteWhatsApp(): Promise<ChannelResult> {
    return { ok: false, at: new Date().toISOString(), via: "propio", error: "Envíala desde tu WhatsApp: Mirai aún no envía invitaciones por WhatsApp." }
  }
  async transferEmail(_m: TransferMail, to: string | null | undefined) {
    if (!to) return "sin_correo" as const
    return isTestEmail(to) ? ("prueba" as const) : ("fallo" as const)
  }
}

/** Borra archivos de Storage (supresión, Ley 1581): adjuntos, respaldos y logos de los libros; avatar y capturas. */
export abstract class StoragePurge {
  /** Archivos de los libros de un hogar (antes de borrar el hogar). */
  abstract household(householdId: string): Promise<number>
  /** Foto de perfil subida y capturas de opiniones de una persona. */
  abstract user(userId: string): Promise<number>
}

/** Igual que apps/web/features/data/purge.ts (recorre subcarpetas por páginas de 1.000), con la clave del sistema. */
@Injectable()
export class SupabaseStoragePurge extends StoragePurge {
  constructor(
    private readonly sb: SupabaseJsFactory,
    @Inject(LOGGER) private readonly log: Logger,
  ) {
    super()
  }

  private get db() {
    return this.sb.for(systemScope("borrar archivos (Ley 1581)"))
  }

  private async listAll(bucket: string, prefix: string, depth = 0): Promise<string[]> {
    if (depth > 6) return []
    const out: string[] = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await this.db.storage.from(bucket).list(prefix, { limit: 1000, offset })
      if (error || !data?.length) break
      for (const f of data) {
        const p = `${prefix}/${f.name}`
        if (!f.id && !f.metadata) out.push(...(await this.listAll(bucket, p, depth + 1)))
        else out.push(p)
      }
      if (data.length < 1000) break
    }
    return out
  }

  private async removeAll(bucket: string, prefix: string) {
    const paths = await this.listAll(bucket, prefix)
    for (let i = 0; i < paths.length; i += 500) await this.db.storage.from(bucket).remove(paths.slice(i, i + 500))
    return paths.length
  }

  async household(householdId: string) {
    const { data: bs } = await this.db.from("books").select("id").eq("household_id", householdId)
    let n = 0
    for (const b of bs ?? []) for (const bucket of ["attachments", "backups", "logos"]) n += await this.removeAll(bucket, b.id)
    this.log.info({ householdId, archivos: n }, "archivos del hogar borrados")
    return n
  }

  async user(userId: string) {
    return (await this.removeAll("avatars", userId)) + (await this.removeAll("feedback", userId))
  }
}

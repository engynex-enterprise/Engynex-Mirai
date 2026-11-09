// Adaptador real de HouseholdMessenger sobre @mirai/services: envía la invitación por el correo que Mirai tiene
// activo y, si hay plantilla propia aprobada, por WhatsApp desde el número de Mirai. Lo que no se puede enviar
// vuelve con su motivo en español y la persona comparte el enlace o lo manda desde su WhatsApp.
import { Injectable } from "@nestjs/common"
import type { ChannelResult } from "@mirai/domain/household/invites"
import { inviteChannels, sendInviteEmail, sendInviteWhatsApp, sendTransferEmail } from "@mirai/services/household/invites-send"
import { HouseholdMessenger, type InviteChannels, type InviteMsg, type TransferMail } from "../ports"

@Injectable()
export class ServicesHouseholdMessenger extends HouseholdMessenger {
  channels(householdId: string): Promise<InviteChannels> {
    return inviteChannels(householdId)
  }
  inviteEmail(m: InviteMsg, to: string): Promise<ChannelResult> {
    return sendInviteEmail(m, to)
  }
  inviteWhatsApp(m: InviteMsg, phone: string): Promise<ChannelResult> {
    return sendInviteWhatsApp(m, phone)
  }
  transferEmail(m: TransferMail, to: string | null | undefined) {
    return sendTransferEmail(m, to)
  }
}

import "server-only"
import { connection } from "next/server"
import type { AccessRole } from "@/lib/household/roles"
import { serverApi } from "@/lib/api/server"

export type InvitationInfo = {
  estado: "pendiente" | "vencida" | "aceptada" | "cancelada" | "no_existe"
  hogar?: string; invita?: string; rol?: AccessRole; nombre?: string | null; vence?: string; ya_miembro?: boolean
}

/** Datos de la invitación para /invitacion/<token>: GET /v1/invitations/:token (público; con la cookie dice si ya eres miembro). */
export async function getInvitationInfo(token: string): Promise<InvitationInfo> {
  await connection()
  try {
    const res = await serverApi().households.invitationInfo({ params: { token } })
    return res.status === 200 ? res.body : { estado: "no_existe" }
  } catch {
    return { estado: "no_existe" }
  }
}

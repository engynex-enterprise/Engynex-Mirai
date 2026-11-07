import "server-only"
import { supabaseServer } from "@/utils/supabase/server"
import { toAccess, type AccessRole } from "@/lib/household/roles"
import { serverAuthProvider } from "@/lib/auth/provider"

export type InvitationInfo = {
  estado: "pendiente" | "vencida" | "aceptada" | "cancelada" | "no_existe"
  hogar?: string; invita?: string; rol?: AccessRole; nombre?: string | null; vence?: string; ya_miembro?: boolean
}

/** Datos de la invitación para /invitacion/<token> (RPC invitation_info: funciona sin sesión). */
export async function getInvitationInfo(token: string): Promise<InvitationInfo> {
  if (serverAuthProvider() === "mirai") return invitationInfoMirai(token)
  // Modo heredado: RPC con Supabase directo.
  const sb = await supabaseServer()
  const { data } = await sb.rpc("invitation_info", { p_token: token })
  const d = (data ?? { estado: "no_existe" }) as InvitationInfo & { rol?: string }
  return { ...d, rol: d.rol ? toAccess(d.rol) : undefined }
}

/** v7 (V7-H4), AUTH_PROVIDER=mirai: GET /v1/invitations/:token (público; con la cookie dice si ya eres miembro). */
async function invitationInfoMirai(token: string): Promise<InvitationInfo> {
  const { connection } = await import("next/server")
  await connection()
  const [{ miraiApiConfig }, { serverApi }] = await Promise.all([import("@/lib/dal"), import("@/lib/api/server")])
  try {
    const res = await serverApi(miraiApiConfig()).households.invitationInfo({ params: { token } })
    return res.status === 200 ? res.body : { estado: "no_existe" }
  } catch {
    return { estado: "no_existe" }
  }
}

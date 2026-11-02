import "server-only"
import { supabaseServer } from "@/utils/supabase/server"
import { toAccess, type AccessRole } from "@/lib/household/roles"

export type InvitationInfo = {
  estado: "pendiente" | "vencida" | "aceptada" | "cancelada" | "no_existe"
  hogar?: string; invita?: string; rol?: AccessRole; nombre?: string | null; vence?: string; ya_miembro?: boolean
}

/** Datos de la invitación para /invitacion/<token> (RPC invitation_info: funciona sin sesión). */
export async function getInvitationInfo(token: string): Promise<InvitationInfo> {
  const sb = await supabaseServer()
  const { data } = await sb.rpc("invitation_info", { p_token: token })
  const d = (data ?? { estado: "no_existe" }) as InvitationInfo & { rol?: string }
  return { ...d, rol: d.rol ? toAccess(d.rol) : undefined }
}

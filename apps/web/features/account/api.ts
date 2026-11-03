// "Tu cuenta" por la API (v6 F2-H-5, interruptor `account`): /v1/account/** y, para pasar, salir o borrar un hogar,
// /v1/households/:h/** y /v1/transfers/:id. Misma firma y misma forma de respuesta que ./actions.ts; con el
// interruptor apagado es exactamente la acción de siempre.
// Diferencia conocida: salir/borrar el hogar activo y cerrar todas las sesiones borraban la cookie mirai-book
// (httpOnly: el navegador no puede). Con la cookie vieja el servidor abre el libro predeterminado de lo que quede.
import { z } from "zod"
import { failure, isApiError } from "@/lib/api/errors"
import { activeHouseholdId, apiOn } from "@/lib/api/session"
import { viaApiOr } from "@/lib/api/via"
import { createClient } from "@/utils/supabase/client"
import { isMiraiAuth } from "@/lib/auth/provider"
import type { MiraiApi } from "@/lib/api/client"
import * as actions from "./actions"
import type { AccountData, TransferCandidates } from "./types"

// v7: con AUTH_PROVIDER=mirai la cuenta siempre va por la API (las acciones de Supabase ya no aplican).
const on = () => isMiraiAuth() || apiOn("account")
const client = () => import("@/lib/api/client")
type Res = { ok: boolean; msg: string; code?: string }
const uuid = z.uuid()

async function msgOf(run: (api: MiraiApi) => Promise<{ status: number; body: unknown; headers: Headers }>): Promise<Res> {
  try {
    const { browserApi, unwrapData } = await client()
    const d = unwrapData((await run(browserApi())) as never) as { msg: string; prueba?: boolean }
    return d.prueba ? { ok: true, code: "prueba", msg: d.msg } : { ok: true, msg: d.msg }
  } catch (e) {
    const r: Res = failure(e)
    const reason = isApiError(e) ? (e.details as { reason?: string } | undefined)?.reason : undefined
    return reason === "reauth" ? { ...r, code: "reauth" } : r
  }
}

export const loadAccount = viaApiOr(on, actions.loadAccount, async (): Promise<AccountData> => {
  const { browserApi, unwrap } = await client()
  return unwrap(await browserApi().account.get({ query: { householdId: activeHouseholdId() } })) as unknown as AccountData
})

export const requestEmailChange = viaApiOr(on, actions.requestEmailChange, (email: string) =>
  msgOf((api) => api.account.requestEmailChange({ body: { email: String(email ?? "") } })))

export const resendEmailChange = viaApiOr(on, actions.resendEmailChange, () => msgOf((api) => api.account.resendEmailChange()))

export const cancelEmailChange = viaApiOr(on, actions.cancelEmailChange, () => msgOf((api) => api.account.cancelEmailChange()))

export const removeMethod = viaApiOr(on, actions.removeMethod, (input: Parameters<typeof actions.removeMethod>[0]) => {
  const m = input as { kind?: string; identityId?: string }
  if (m?.kind === "password") return msgOf((api) => api.account.removePassword())
  if (m?.kind === "google" && uuid.safeParse(m.identityId).success) return msgOf((api) => api.account.removeGoogle({ params: { identityId: m.identityId! } }))
  return Promise.resolve({ ok: false, msg: "Esa forma de entrar no existe." })
})

export const revokeSession = viaApiOr(on, actions.revokeSession, async (id: string) => {
  if (!uuid.safeParse(id).success) return { ok: false, msg: "Esa sesión no existe." }
  return msgOf((api) => api.account.revokeSession({ params: { sessionId: id } }))
})

/** La API cierra todas las sesiones; luego se limpia la de este navegador (como hacía signOut en el servidor). */
export const signOutEverywhere = viaApiOr(on, actions.signOutEverywhere, async () => {
  const r = await msgOf((api) => api.account.signOutEverywhere())
  if (r.ok) {
    if (isMiraiAuth()) await (await import("@/lib/auth/mirai")).signOut()
    else await createClient().auth.signOut({ scope: "local" }).catch(() => {})
  }
  return r
})

export const loadTransferCandidates = viaApiOr(on, actions.loadTransferCandidates, async (householdId: string): Promise<TransferCandidates> => {
  const empty = { people: [], tienePago: false, hogar: "" }
  if (!uuid.safeParse(householdId).success) return { ok: false, msg: "Ese hogar no existe.", ...empty }
  try {
    const { browserApi, unwrap } = await client()
    const { owner, ...rest } = unwrap(await browserApi().households.transferCandidates({ params: { householdId } }))
    return { ok: owner, ...rest }
  } catch (e) {
    return { ...failure(e), ...empty }
  }
})

const Transfer = z.object({
  householdId: z.uuid(),
  userId: z.uuid(),
  fromRole: z.enum(["admin", "editor", "registra", "viewer"]),
  planAction: z.enum(["seguir", "cancelar"]),
  confirm: z.string().max(120),
})

export const requestTransfer = viaApiOr(on, actions.requestTransfer, async (input: z.input<typeof Transfer>) => {
  const p = Transfer.safeParse(input)
  if (!p.success) return { ok: false, msg: "Revisa los datos: elige a la persona y tu rol." }
  const { householdId, ...body } = p.data
  return msgOf((api) => api.households.requestTransfer({ params: { householdId }, body }))
})

export const respondTransfer = viaApiOr(on, actions.respondTransfer, async (id: string, accept: boolean) => {
  if (!uuid.safeParse(id).success) return { ok: false, msg: "Esa solicitud no existe." }
  return msgOf((api) => api.households.respondTransfer({ params: { transferId: id }, body: { accept: !!accept } }))
})

export const cancelTransfer = viaApiOr(on, actions.cancelTransfer, async (id: string) => {
  if (!uuid.safeParse(id).success) return { ok: false, msg: "Esa solicitud no existe." }
  return msgOf((api) => api.households.cancelTransfer({ params: { transferId: id } }))
})

export const leaveHousehold = viaApiOr(on, actions.leaveHousehold, async (householdId: string) => {
  if (!uuid.safeParse(householdId).success) return { ok: false, msg: "Ese hogar no existe." }
  return msgOf((api) => api.households.leave({ params: { householdId } }))
})

export const deleteHousehold = viaApiOr(on, actions.deleteHousehold, async (householdId: string, confirm: string) => {
  if (!uuid.safeParse(householdId).success) return { ok: false, msg: "Ese hogar no existe." }
  return msgOf((api) => api.households.remove({ params: { householdId }, body: { confirm: String(confirm ?? "") } }))
})

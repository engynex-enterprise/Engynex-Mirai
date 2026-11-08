// "Tu cuenta" por la API: /v1/account/** y, para pasar, salir o borrar un hogar, /v1/households/:h/** y
// /v1/transfers/:id. Responden { ok, msg, code? } con mensajes en español.
// La cookie mirai-book es httpOnly (el navegador no la borra): tras salir o borrar el hogar activo, el servidor abre
// el libro predeterminado de lo que quede.
import { z } from "zod"
import { failure, isApiError } from "@/lib/api/errors"
import { activeHouseholdId } from "@/lib/api/session"
import type { MiraiApi } from "@/lib/api/client"
import type { AccountData, RemoveMethodInput, TransferCandidates } from "./types"

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

export async function loadAccount(): Promise<AccountData> {
  const { browserApi, unwrap } = await client()
  return unwrap(await browserApi().account.get({ query: { householdId: activeHouseholdId() } })) as unknown as AccountData
}

export const requestEmailChange = (email: string): Promise<Res> => msgOf((api) => api.account.requestEmailChange({ body: { email: String(email ?? "") } }))

export const resendEmailChange = (): Promise<Res> => msgOf((api) => api.account.resendEmailChange())

export const cancelEmailChange = (): Promise<Res> => msgOf((api) => api.account.cancelEmailChange())

export function removeMethod(input: RemoveMethodInput): Promise<Res> {
  const m = input as { kind?: string; identityId?: string }
  if (m?.kind === "password") return msgOf((api) => api.account.removePassword())
  if (m?.kind === "google" && uuid.safeParse(m.identityId).success) return msgOf((api) => api.account.removeGoogle({ params: { identityId: m.identityId! } }))
  return Promise.resolve({ ok: false, msg: "Esa forma de entrar no existe." })
}

export async function revokeSession(id: string): Promise<Res> {
  if (!uuid.safeParse(id).success) return { ok: false, msg: "Esa sesión no existe." }
  return msgOf((api) => api.account.revokeSession({ params: { sessionId: id } }))
}

/** La API cierra todas las sesiones; luego se limpia la de este navegador. */
export async function signOutEverywhere(): Promise<Res> {
  const r = await msgOf((api) => api.account.signOutEverywhere())
  if (r.ok) await (await import("@/lib/auth/mirai")).signOut()
  return r
}

export async function loadTransferCandidates(householdId: string): Promise<TransferCandidates> {
  const empty = { people: [], tienePago: false, hogar: "" }
  if (!uuid.safeParse(householdId).success) return { ok: false, msg: "Ese hogar no existe.", ...empty }
  try {
    const { browserApi, unwrap } = await client()
    const { owner, ...rest } = unwrap(await browserApi().households.transferCandidates({ params: { householdId } }))
    return { ok: owner, ...rest }
  } catch (e) {
    return { ...failure(e), ...empty }
  }
}

const Transfer = z.object({
  householdId: z.uuid(),
  userId: z.uuid(),
  fromRole: z.enum(["admin", "editor", "registra", "viewer"]),
  planAction: z.enum(["seguir", "cancelar"]),
  confirm: z.string().max(120),
})

export async function requestTransfer(input: z.input<typeof Transfer>): Promise<Res> {
  const p = Transfer.safeParse(input)
  if (!p.success) return { ok: false, msg: "Revisa los datos: elige a la persona y tu rol." }
  const { householdId, ...body } = p.data
  return msgOf((api) => api.households.requestTransfer({ params: { householdId }, body }))
}

export async function respondTransfer(id: string, accept: boolean): Promise<Res> {
  if (!uuid.safeParse(id).success) return { ok: false, msg: "Esa solicitud no existe." }
  return msgOf((api) => api.households.respondTransfer({ params: { transferId: id }, body: { accept: !!accept } }))
}

export async function cancelTransfer(id: string): Promise<Res> {
  if (!uuid.safeParse(id).success) return { ok: false, msg: "Esa solicitud no existe." }
  return msgOf((api) => api.households.cancelTransfer({ params: { transferId: id } }))
}

export async function leaveHousehold(householdId: string): Promise<Res> {
  if (!uuid.safeParse(householdId).success) return { ok: false, msg: "Ese hogar no existe." }
  return msgOf((api) => api.households.leave({ params: { householdId } }))
}

export async function deleteHousehold(householdId: string, confirm: string): Promise<Res> {
  if (!uuid.safeParse(householdId).success) return { ok: false, msg: "Ese hogar no existe." }
  return msgOf((api) => api.households.remove({ params: { householdId }, body: { confirm: String(confirm ?? "") } }))
}

// "Tu hogar" por la API: /v1/households/:h/** y /v1/invitations/:token.
// Los casos con `code` llegan de la API como error con `details.reason` (409 miembro / pendiente / mismo_nombre,
// 402 límite del plan, 429 espera) y aquí se convierten en `{ ok:false, code, … }`.
import { ACCESS_ROLES, type AccessRole } from "@/lib/household/roles"
import { failure, isApiError } from "@/lib/api/errors"
import { activeHouseholdId } from "@/lib/api/session"
import type { MiraiApi } from "@/lib/api/client"
import type { FamilyMemberInput, HouseholdPeople, InviteInput, InviteResult, Share } from "./types"

const client = () => import("@/lib/api/client")
type Res = { ok: boolean; msg: string }

/** `{ ok:false, msg, code? }` desde un error de la API (con la razón que traía `details`). */
export function inviteFailure(e: unknown): InviteResult {
  const base = failure(e)
  if (!isApiError(e)) return base
  const d = (e.details && typeof e.details === "object" ? e.details : {}) as { reason?: string; invitationId?: string; familyId?: string }
  if (e.code === "PLAN_REQUIRED") return { ...base, code: "limite" }
  if (d.reason === "miembro" || d.reason === "pendiente" || d.reason === "mismo_nombre" || d.reason === "espera") {
    return { ...base, code: d.reason, ...(d.invitationId ? { invitationId: d.invitationId } : {}), ...(d.familyId ? { familyId: d.familyId } : {}) }
  }
  return base
}

/** Comando que responde `{ ok:true, data:{ msg } }` → `{ ok, msg }` (los errores, como `{ ok:false, msg }`). */
export async function msgOf(run: (api: MiraiApi) => Promise<{ status: number; body: unknown; headers: Headers }>): Promise<Res> {
  try {
    const { browserApi, unwrapData } = await client()
    const data = unwrapData((await run(browserApi())) as never) as { msg: string }
    return { ok: true, msg: data.msg }
  } catch (e) {
    return failure(e)
  }
}

export const loadHouseholdPeople = async (): Promise<HouseholdPeople> => {
  const { browserApi, unwrap } = await client()
  return unwrap(await browserApi().households.people({ params: { householdId: activeHouseholdId() } })) as unknown as HouseholdPeople
}

export const invitePerson = async (input: InviteInput): Promise<InviteResult> => {
  try {
    const { browserApi, unwrapData } = await client()
    const d = unwrapData(await browserApi().households.invite({ params: { householdId: activeHouseholdId() }, body: input as never }))
    return { ok: true, invitationId: d.invitationId, share: d.share, delivery: d.delivery as InviteResult["delivery"], msg: d.msg }
  } catch (e) {
    return inviteFailure(e)
  }
}

export const resendInvitation = async (id: string): Promise<InviteResult> => {
  try {
    const { browserApi, unwrapData } = await client()
    const d = unwrapData(await browserApi().households.resendInvitation({ params: { householdId: activeHouseholdId(), invitationId: id } }))
    return { ok: true, invitationId: d.invitationId, share: d.share, delivery: d.delivery as InviteResult["delivery"], msg: d.msg }
  } catch (e) {
    return inviteFailure(e)
  }
}

export const shareInvitation = async (id: string): Promise<Res & { share?: Share }> => {
  try {
    const { browserApi, unwrapData } = await client()
    const d = unwrapData(await browserApi().households.shareInvitation({ params: { householdId: activeHouseholdId(), invitationId: id } }))
    return { ok: true, msg: "", share: d.share }
  } catch (e) {
    return failure(e)
  }
}

export const markInvitationShared = (id: string): Promise<Res> =>
  msgOf((api) => api.households.markInvitationShared({ params: { householdId: activeHouseholdId(), invitationId: id } }))

export const cancelInvitation = (id: string): Promise<Res> =>
  msgOf((api) => api.households.cancelInvitation({ params: { householdId: activeHouseholdId(), invitationId: id } }))

export const changeRole = async (userId: string, access: AccessRole): Promise<Res> => {
  // La API solo acepta los roles que se pueden dar: el de dueño se pasa con transferHousehold.
  if (!(ACCESS_ROLES as readonly string[]).includes(access) || access === "owner") return { ok: false, msg: "Ese rol no existe. Para que alguien sea dueño, pásale el hogar." }
  return msgOf((api) => api.households.changeRole({ params: { householdId: activeHouseholdId(), userId }, body: { access: access as "admin" | "editor" | "registra" | "viewer" } }))
}

// Nota: si sales tú, la cookie mirai-book (httpOnly) no se borra desde el navegador; con la cookie vieja el servidor
// abre el libro predeterminado del hogar que te queda, que es lo mismo que verías al volver a entrar.
export const removePerson = (userId: string): Promise<Res> =>
  msgOf((api) => api.households.removePerson({ params: { householdId: activeHouseholdId(), userId } }))

export const transferHousehold = (userId: string): Promise<Res> =>
  msgOf((api) => api.households.makeOwner({ params: { householdId: activeHouseholdId() }, body: { userId } }))

export const linkPerson = (userId: string, familyId: string): Promise<Res> =>
  msgOf((api) => api.households.linkPerson({ params: { householdId: activeHouseholdId(), userId }, body: { familyId } }))

export const saveFamilyMember = async (input: FamilyMemberInput): Promise<Res & { code?: "mismo_nombre"; id?: string }> => {
  const { id, ...body } = input
  try {
    const { browserApi, unwrapData } = await client()
    const api = browserApi()
    const householdId = activeHouseholdId()
    const d = unwrapData(id
      ? await api.households.updateFamily({ params: { householdId, familyId: id }, body })
      : await api.households.createFamily({ params: { householdId }, body }))
    return { ok: true, id: d.id, msg: d.msg }
  } catch (e) {
    const r = inviteFailure(e)
    return r.code === "mismo_nombre" ? { ok: false, code: "mismo_nombre" as const, msg: r.msg } : { ok: false, msg: r.msg }
  }
}

export const deleteFamilyMember = (id: string, restore = false): Promise<Res> =>
  msgOf((api) => {
    const params = { householdId: activeHouseholdId(), familyId: id }
    return restore ? api.households.restoreFamily({ params }) : api.households.deleteFamily({ params })
  })

export const renameHousehold = (nombre: string): Promise<Res> =>
  msgOf((api) => api.households.rename({ params: { householdId: activeHouseholdId() }, body: { nombre } }))

/**
 * Acepta por la API y deja abierto el hogar nuevo: la cookie mirai-book (httpOnly) la pone switchBook, la misma
 * Server Action del selector de libros (también guarda el último libro del perfil).
 */
export const acceptInvitation = async (token: string): Promise<Res> => {
  try {
    const { browserApi, unwrapData } = await client()
    const d = unwrapData(await browserApi().households.acceptInvitation({ params: { token } }))
    if (d.bookId) {
      const { switchBook } = await import("@/components/app/actions")
      await switchBook(d.bookId).catch(() => {})
    }
    return { ok: true, msg: d.msg }
  } catch (e) {
    return failure(e)
  }
}

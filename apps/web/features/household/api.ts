// "Tu hogar" por la API (v6 F2-H-5, interruptor `households`): /v1/households/:h/** y /v1/invitations/:token.
// Misma firma y misma forma de respuesta que las Server Actions de ./actions.ts; con el interruptor apagado es
// exactamente la acción de siempre (ni siquiera se carga el cliente de la API).
// Los casos que la web devolvía con `code` llegan de la API como error con `details.reason` (409 miembro / pendiente /
// mismo_nombre, 402 límite del plan, 429 espera) y aquí se vuelven a convertir en `{ ok:false, code, … }`.
import { ACCESS_ROLES, type AccessRole } from "@/lib/household/roles"
import { failure, isApiError } from "@/lib/api/errors"
import { activeHouseholdId, apiOn } from "@/lib/api/session"
import { viaApiOr } from "@/lib/api/via"
import type { MiraiApi } from "@/lib/api/client"
import * as actions from "./actions"
import type { HouseholdPeople, InviteResult } from "./types"

const on = () => apiOn("households")
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

export const loadHouseholdPeople = viaApiOr(on, actions.loadHouseholdPeople, async (): Promise<HouseholdPeople> => {
  const { browserApi, unwrap } = await client()
  return unwrap(await browserApi().households.people({ params: { householdId: activeHouseholdId() } })) as unknown as HouseholdPeople
})

export const invitePerson = viaApiOr(on, actions.invitePerson, async (input: Parameters<typeof actions.invitePerson>[0]): Promise<InviteResult> => {
  try {
    const { browserApi, unwrapData } = await client()
    const d = unwrapData(await browserApi().households.invite({ params: { householdId: activeHouseholdId() }, body: input as never }))
    return { ok: true, invitationId: d.invitationId, share: d.share, delivery: d.delivery as InviteResult["delivery"], msg: d.msg }
  } catch (e) {
    return inviteFailure(e)
  }
})

export const resendInvitation = viaApiOr(on, actions.resendInvitation, async (id: string): Promise<InviteResult> => {
  try {
    const { browserApi, unwrapData } = await client()
    const d = unwrapData(await browserApi().households.resendInvitation({ params: { householdId: activeHouseholdId(), invitationId: id } }))
    return { ok: true, invitationId: d.invitationId, share: d.share, delivery: d.delivery as InviteResult["delivery"], msg: d.msg }
  } catch (e) {
    return inviteFailure(e)
  }
})

export const shareInvitation = viaApiOr(on, actions.shareInvitation, async (id: string) => {
  try {
    const { browserApi, unwrapData } = await client()
    const d = unwrapData(await browserApi().households.shareInvitation({ params: { householdId: activeHouseholdId(), invitationId: id } }))
    return { ok: true, msg: "", share: d.share }
  } catch (e) {
    return failure(e)
  }
})

export const markInvitationShared = viaApiOr(on, actions.markInvitationShared, (id: string) =>
  msgOf((api) => api.households.markInvitationShared({ params: { householdId: activeHouseholdId(), invitationId: id } })))

export const cancelInvitation = viaApiOr(on, actions.cancelInvitation, (id: string) =>
  msgOf((api) => api.households.cancelInvitation({ params: { householdId: activeHouseholdId(), invitationId: id } })))

export const changeRole = viaApiOr(on, actions.changeRole, async (userId: string, access: AccessRole) => {
  // Mismo aviso que la acción antes de llamar (la API solo acepta los roles que se pueden dar).
  if (!(ACCESS_ROLES as readonly string[]).includes(access) || access === "owner") return { ok: false, msg: "Ese rol no existe. Para que alguien sea dueño, pásale el hogar." }
  return msgOf((api) => api.households.changeRole({ params: { householdId: activeHouseholdId(), userId }, body: { access: access as "admin" | "editor" | "registra" | "viewer" } }))
})

// Nota: si sales tú, la acción borraba la cookie mirai-book (httpOnly, el navegador no puede); con la cookie vieja el
// servidor abre el libro predeterminado del hogar que te queda, que es lo mismo que verías al volver a entrar.
export const removePerson = viaApiOr(on, actions.removePerson, (userId: string) =>
  msgOf((api) => api.households.removePerson({ params: { householdId: activeHouseholdId(), userId } })))

export const transferHousehold = viaApiOr(on, actions.transferHousehold, (userId: string) =>
  msgOf((api) => api.households.makeOwner({ params: { householdId: activeHouseholdId() }, body: { userId } })))

export const linkPerson = viaApiOr(on, actions.linkPerson, (userId: string, familyId: string) =>
  msgOf((api) => api.households.linkPerson({ params: { householdId: activeHouseholdId(), userId }, body: { familyId } })))

export const saveFamilyMember = viaApiOr(on, actions.saveFamilyMember, async (input: Parameters<typeof actions.saveFamilyMember>[0]) => {
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
})

export const deleteFamilyMember = viaApiOr(on, actions.deleteFamilyMember, (id: string, restore = false) =>
  msgOf((api) => {
    const params = { householdId: activeHouseholdId(), familyId: id }
    return restore ? api.households.restoreFamily({ params }) : api.households.deleteFamily({ params })
  }))

export const renameHousehold = viaApiOr(on, actions.renameHousehold, (nombre: string) =>
  msgOf((api) => api.households.rename({ params: { householdId: activeHouseholdId() }, body: { nombre } })))

/**
 * Acepta por la API y deja abierto el hogar nuevo: la cookie mirai-book (httpOnly) la pone switchBook, la misma
 * Server Action del selector de libros (también guarda el último libro del perfil).
 */
export const acceptInvitation = viaApiOr(on, actions.acceptInvitation, async (token: string) => {
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
})

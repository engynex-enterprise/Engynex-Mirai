// Consola de la plataforma por la API (v6 F2-H-5, interruptor `admin`): /v1/admin/** (@PlatformAdmin y admin_audit en
// la API). Misma firma y misma forma que las Server Actions de ./actions.ts y ./server.ts; con el interruptor apagado
// es exactamente la acción de siempre (ni se carga el cliente). La consola sigue sin mostrar montos de los hogares.
//
// V7-H3: también las integraciones globales (adminGlobalIntegrations, adminSaveGlobalIntegration, adminTestGlobal,
// adminSendTest → /v1/admin/integrations/**) y WhatsApp de la consola (./whatsapp.ts → /v1/admin/whatsapp/**). Con el
// interruptor apagado, ./actions.ts, ./server.ts y ./whatsapp.ts son el modo heredado (Server Actions con la clave
// secreta de Supabase).
import { errorMsg } from "@/lib/api/errors"
import { apiOn } from "@/lib/api/session"
import { viaApiOr } from "@/lib/api/via"
import type { TemplateDraft } from "@/lib/notify/wa-templates"
import type { WaCase, WaSettings } from "@/lib/notify/whatsapp"
import * as actions from "./actions"
import * as server from "./server"
import * as wa from "./whatsapp"

export type { WaState } from "./whatsapp"

type Ret<F extends (...a: never[]) => Promise<unknown>> = Awaited<ReturnType<F>>

const on = () => apiOn("admin")
const admin = async () => {
  const { browserApi, unwrap, unwrapData } = await import("@/lib/api/client")
  return { a: browserApi().admin, unwrap, unwrapData }
}
const cleanEmail = (e: string) => e.trim().toLowerCase()

// ── features/admin/actions.ts ───────────────────────────────────────────────────────────────────────────────────

export const adminOverview = viaApiOr(on, actions.adminOverview, async () => {
  const { a, unwrap } = await admin()
  return unwrap(await a.overview()) as Ret<typeof actions.adminOverview>
})

export const adminClients = viaApiOr(on, actions.adminClients, async () => {
  const { a, unwrap } = await admin()
  return unwrap(await a.clients()) as Ret<typeof actions.adminClients>
})

export const adminFeedback = viaApiOr(on, actions.adminFeedback, async () => {
  const { a, unwrap } = await admin()
  return unwrap(await a.feedback()) as unknown as Ret<typeof actions.adminFeedback>
})

export const adminUpdateFeedback = viaApiOr(on, actions.adminUpdateFeedback, async (id, patch) => {
  const { a, unwrapData } = await admin()
  unwrapData(await a.updateFeedback({ params: { feedbackId: id }, body: patch }))
})

export const adminRevenue = viaApiOr(on, actions.adminRevenue, async () => {
  const { a, unwrap } = await admin()
  return unwrap(await a.revenue()) as unknown as Ret<typeof actions.adminRevenue>
})

export const adminGrantPremium = viaApiOr(on, actions.adminGrantPremium, async (householdId, hasta, nota) => {
  const { a, unwrapData } = await admin()
  unwrapData(await a.grantPremium({ params: { householdId }, body: { hasta, nota } }))
})

export const adminRevokeCourtesy = viaApiOr(on, actions.adminRevokeCourtesy, async (householdId) => {
  const { a, unwrapData } = await admin()
  unwrapData(await a.revokeCourtesy({ params: { householdId } }))
})

// ── features/admin/server.ts: personas ──────────────────────────────────────────────────────────────────────────

export const adminUser = viaApiOr(on, server.adminUser, async (id) => {
  const { a, unwrap } = await admin()
  return unwrap(await a.user({ params: { userId: id } })) as unknown as Ret<typeof server.adminUser>
})

export const adminSetSuspended = viaApiOr(on, server.adminSetSuspended, async (id, suspend) => {
  const { a, unwrapData } = await admin()
  unwrapData(await a.setSuspended({ params: { userId: id }, body: { suspend } }))
})

export const adminRecoveryLink = viaApiOr(on, server.adminRecoveryLink, async (id) => {
  const { a, unwrapData } = await admin()
  const { sent, link, msg } = unwrapData(await a.recoveryLink({ params: { userId: id } }))
  return link === undefined ? { sent, msg } : { sent, link, msg }
})

export const adminSetPlatformAdmin = viaApiOr(on, server.adminSetPlatformAdmin, async (id, value) => {
  const { a, unwrapData } = await admin()
  unwrapData(await a.setPlatformAdmin({ params: { userId: id }, body: { on: value } }))
})

export const adminDeleteUser = viaApiOr(on, server.adminDeleteUser, async (id, confirmEmail) => {
  const { a, unwrapData } = await admin()
  unwrapData(await a.deleteUser({ params: { userId: id }, body: { confirmEmail } }))
})

export const adminAddNote = viaApiOr(on, server.adminAddNote, async (userId, texto) => {
  const { a, unwrapData } = await admin()
  unwrapData(await a.addNote({ params: { userId }, body: { texto } }))
})

export const adminDeleteNote = viaApiOr(on, server.adminDeleteNote, async (id) => {
  const { a, unwrapData } = await admin()
  unwrapData(await a.deleteNote({ params: { noteId: id } }))
})

export const adminInviteUser = viaApiOr(on, server.adminInviteUser, async (email, nombre) => {
  const { a, unwrapData } = await admin()
  unwrapData(await a.inviteUser({ body: { email: cleanEmail(email), nombre } }))
})

// ── Hogares, planes y pagos ─────────────────────────────────────────────────────────────────────────────────────

export const adminHouseholds = viaApiOr(on, server.adminHouseholds, async () => {
  const { a, unwrap } = await admin()
  return unwrap(await a.households()) as unknown as Ret<typeof server.adminHouseholds>
})

export const adminAssignPlan = viaApiOr(on, server.adminAssignPlan, async (householdId, plan, hasta, nota) => {
  const { a, unwrapData } = await admin()
  unwrapData(await a.assignPlan({ params: { householdId }, body: { plan, hasta, nota } }))
})

export const adminSubscriptions = viaApiOr(on, server.adminSubscriptions, async () => {
  const { a, unwrap } = await admin()
  return unwrap(await a.subscriptions()) as unknown as Ret<typeof server.adminSubscriptions>
})

export const adminUpdateSubscription = viaApiOr(on, server.adminUpdateSubscription, async (id, action) => {
  const { a, unwrapData } = await admin()
  unwrapData(await a.updateSubscription({ params: { subscriptionId: id }, body: { action } }))
})

export const adminManualPayment = viaApiOr(on, server.adminManualPayment, async (input) => {
  const { a, unwrapData } = await admin()
  unwrapData(await a.manualPayment({ body: input }))
})

export const adminUpdatePayment = viaApiOr(on, server.adminUpdatePayment, async (id, patch) => {
  const { a, unwrapData } = await admin()
  unwrapData(await a.updatePayment({ params: { paymentId: id }, body: patch }))
})

// ── Comunicados, administradores, auditoría y sistema ───────────────────────────────────────────────────────────

export const adminBroadcast = viaApiOr(on, server.adminBroadcast, async (input) => {
  const { a, unwrapData } = await admin()
  const { personas, correos } = unwrapData(await a.broadcast({ body: input }))
  return { personas, correos }
})

export const adminAdmins = viaApiOr(on, server.adminAdmins, async () => {
  const { a, unwrap } = await admin()
  return unwrap(await a.admins()) as unknown as Ret<typeof server.adminAdmins>
})

export const adminAddAdminByEmail = viaApiOr(on, server.adminAddAdminByEmail, async (email) => {
  const { a, unwrapData } = await admin()
  unwrapData(await a.addAdmin({ body: { email: cleanEmail(email) } }))
})

export const adminAuditLog = viaApiOr(on, server.adminAuditLog, async () => {
  const { a, unwrap } = await admin()
  return unwrap(await a.audit()) as unknown as Ret<typeof server.adminAuditLog>
})

export const adminSystem = viaApiOr(on, server.adminSystem, async () => {
  const { a, unwrap } = await admin()
  return unwrap(await a.system()) as unknown as Ret<typeof server.adminSystem>
})

export const adminSaveSettings = viaApiOr(on, server.adminSaveSettings, async (patch) => {
  const { a, unwrapData } = await admin()
  unwrapData(await a.saveSettings({ body: patch }))
})

export const adminCleanOrphanHouseholds = viaApiOr(on, server.adminCleanOrphanHouseholds, async () => {
  const { a, unwrapData } = await admin()
  return unwrapData(await a.cleanOrphans()).borrados
})

export const adminNotifyLog = viaApiOr(on, server.adminNotifyLog, async () => {
  const { a, unwrap } = await admin()
  return unwrap(await a.notifyLog()) as unknown as Ret<typeof server.adminNotifyLog>
})

export const adminTestDefaults = viaApiOr(on, server.adminTestDefaults, async () => {
  const { a, unwrap } = await admin()
  return unwrap(await a.testDefaults())
})

// ── Integraciones globales (V7-H3) ──────────────────────────────────────────────────────────────────────────────

/** Los errores que el administrador debe leer vuelven como `{ ok:false, msg }` (como las Server Actions). */
const fail = (e: unknown) => ({ ok: false as const, msg: errorMsg(e) })

export const adminGlobalIntegrations = viaApiOr(on, server.adminGlobalIntegrations, async () => {
  const { a, unwrap } = await admin()
  return unwrap(await a.integrations()) as unknown as Ret<typeof server.adminGlobalIntegrations>
})

export const adminSaveGlobalIntegration = viaApiOr(on, server.adminSaveGlobalIntegration, async (kind, input) => {
  try {
    const { a, unwrapData } = await admin()
    const d = unwrapData(await a.saveIntegration({ params: { kind }, body: { modo: input.modo as never, planes: input.planes, values: input.values } }))
    return { ok: true, ...(d.warn ? { warn: d.warn } : {}) } as Awaited<ReturnType<typeof server.adminSaveGlobalIntegration>>
  } catch (e) { return fail(e) }
})

export const adminTestGlobal = viaApiOr(on, server.adminTestGlobal, async (kind) => {
  try {
    const { a, unwrapData } = await admin()
    return unwrapData(await a.testIntegration({ params: { kind } }))
  } catch (e) { return fail(e) }
})

export const adminSendTest = viaApiOr(on, server.adminSendTest, async (kind, to) => {
  try {
    const { a, unwrapData } = await admin()
    return unwrapData(await a.sendTest({ params: { kind }, body: { to } }))
  } catch (e) { return fail(e) }
})

// ── WhatsApp de la consola (V7-H3) ──────────────────────────────────────────────────────────────────────────────

export const adminWaState = viaApiOr(on, wa.adminWaState, async (fresh = false) => {
  const { a, unwrap } = await admin()
  return unwrap(await a.waState({ query: fresh ? { fresh: "1" } : {} })) as unknown as wa.WaState
})

export const adminWaSaveSettings = viaApiOr(on, wa.adminWaSaveSettings, async (input: WaSettings) => {
  try {
    const { a, unwrapData } = await admin()
    unwrapData(await a.waSaveSettings({ body: input as never }))
    return { ok: true } as Awaited<ReturnType<typeof wa.adminWaSaveSettings>>
  } catch (e) { return fail(e) }
})

export const adminWaSaveTemplate = viaApiOr(on, wa.adminWaSaveTemplate, async (draft: TemplateDraft, edit?: { id: string; status?: string }) => {
  try {
    const { a, unwrapData } = await admin()
    return { ok: true, msg: unwrapData(await a.waSaveTemplate({ body: { draft, ...(edit ? { edit } : {}) } })).msg }
  } catch (e) { return fail(e) }
})

export const adminWaDeleteTemplate = viaApiOr(on, wa.adminWaDeleteTemplate, async (name: string, id?: string) => {
  try {
    const { a, unwrapData } = await admin()
    return { ok: true, msg: unwrapData(await a.waDeleteTemplate({ params: { name }, query: id ? { id } : {} })).msg }
  } catch (e) { return fail(e) }
})

export const adminWaPreview = viaApiOr(on, wa.adminWaPreview, async (caso: WaCase, override?: WaSettings["casos"][WaCase]) => {
  try {
    const { a, unwrapData } = await admin()
    const d = unwrapData(await a.waPreview({ body: { caso, ...(override ? { override } : {}) } }))
    return { ok: true, preview: d.preview, template: d.template }
  } catch (e) { return fail(e) }
})

export const adminWaSendTest = viaApiOr(on, wa.adminWaSendTest, async (input: { caso: WaCase; to: string; override?: WaSettings["casos"][WaCase] }) => {
  try {
    const { a, unwrapData } = await admin()
    const d = unwrapData(await a.waSendTest({ body: { caso: input.caso, to: input.to, ...(input.override ? { override: input.override } : {}) } }))
    return d.preview ? { ok: true, msg: d.msg, preview: d.preview } : { ok: true, msg: d.msg }
  } catch (e) { return fail(e) }
})

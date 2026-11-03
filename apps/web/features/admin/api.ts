// Consola de la plataforma por la API (v6 F2-H-5, interruptor `admin`): /v1/admin/** (@PlatformAdmin y admin_audit en
// la API). Misma firma y misma forma que las Server Actions de ./actions.ts y ./server.ts; con el interruptor apagado
// es exactamente la acción de siempre (ni se carga el cliente). La consola sigue sin mostrar montos de los hogares.
//
// Pendientes (sin endpoint todavía: siguen siendo la Server Action, también con el interruptor encendido):
// integraciones globales (adminGlobalIntegrations, adminSaveGlobalIntegration, adminTestGlobal) y adminSendTest.
import { apiOn } from "@/lib/api/session"
import { viaApiOr } from "@/lib/api/via"
import * as actions from "./actions"
import * as server from "./server"

export { adminGlobalIntegrations, adminSaveGlobalIntegration, adminSendTest, adminTestGlobal } from "./server"

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

// Consola de la plataforma por la API: /v1/admin/** (@PlatformAdmin y admin_audit en la API). También las
// integraciones globales (/v1/admin/integrations/**) y WhatsApp de la consola (/v1/admin/whatsapp/**).
// La consola sigue sin mostrar montos de los hogares.
import type { z } from "zod"
import type { SaveSettings, UpdateFeedback } from "@mirai/contracts/modules/admin"
import { errorMsg } from "@/lib/api/errors"
import type { Row } from "@/lib/supabase/tables"
import type { TemplateDraft } from "@/lib/notify/wa-templates"
import type { MetaTemplate, ParamPreview, WaCase, WaSettings } from "@/lib/notify/whatsapp"

/** Estado de WhatsApp para la consola: ajustes guardados y plantillas de la cuenta (leídas de Meta en vivo). */
export type WaState = {
  ok: boolean; msg?: string
  activa: boolean; configurada: boolean; tieneWaba: boolean
  numero?: string; settings: WaSettings; templates: MetaTemplate[]
  defaultImage: string; base: string
}

export type SubscriptionAction = { kind: "extender"; dias: number } | { kind: "plan"; plan: string } | { kind: "cancelar" } | { kind: "terminar" }

const admin = async () => {
  const { browserApi, unwrap, unwrapData } = await import("@/lib/api/client")
  return { a: browserApi().admin, unwrap, unwrapData }
}
const cleanEmail = (e: string) => e.trim().toLowerCase()

// ── Resumen, clientes, opiniones e ingresos ─────────────────────────────────────────────────────────────────────

export async function adminOverview() {
  const { a, unwrap } = await admin()
  return unwrap(await a.overview())
}

export async function adminClients() {
  const { a, unwrap } = await admin()
  return unwrap(await a.clients())
}

export async function adminFeedback() {
  const { a, unwrap } = await admin()
  return unwrap(await a.feedback())
}

export async function adminUpdateFeedback(id: string, patch: z.input<typeof UpdateFeedback>): Promise<void> {
  const { a, unwrapData } = await admin()
  unwrapData(await a.updateFeedback({ params: { feedbackId: id }, body: patch }))
}

export async function adminRevenue() {
  const { a, unwrap } = await admin()
  return unwrap(await a.revenue())
}

export async function adminGrantPremium(householdId: string, hasta: string, nota: string): Promise<void> {
  const { a, unwrapData } = await admin()
  unwrapData(await a.grantPremium({ params: { householdId }, body: { hasta, nota } }))
}

export async function adminRevokeCourtesy(householdId: string): Promise<void> {
  const { a, unwrapData } = await admin()
  unwrapData(await a.revokeCourtesy({ params: { householdId } }))
}

// ── Personas ────────────────────────────────────────────────────────────────────────────────────────────────────

export async function adminUser(id: string) {
  const { a, unwrap } = await admin()
  return unwrap(await a.user({ params: { userId: id } }))
}

export async function adminSetSuspended(id: string, suspend: boolean): Promise<void> {
  const { a, unwrapData } = await admin()
  unwrapData(await a.setSuspended({ params: { userId: id }, body: { suspend } }))
}

export async function adminRecoveryLink(id: string): Promise<{ sent: boolean; link?: string; msg: string }> {
  const { a, unwrapData } = await admin()
  const { sent, link, msg } = unwrapData(await a.recoveryLink({ params: { userId: id } }))
  return link === undefined ? { sent, msg } : { sent, link, msg }
}

export async function adminSetPlatformAdmin(id: string, value: boolean): Promise<void> {
  const { a, unwrapData } = await admin()
  unwrapData(await a.setPlatformAdmin({ params: { userId: id }, body: { on: value } }))
}

export async function adminDeleteUser(id: string, confirmEmail: string): Promise<void> {
  const { a, unwrapData } = await admin()
  unwrapData(await a.deleteUser({ params: { userId: id }, body: { confirmEmail } }))
}

export async function adminAddNote(userId: string, texto: string): Promise<void> {
  const { a, unwrapData } = await admin()
  unwrapData(await a.addNote({ params: { userId }, body: { texto } }))
}

export async function adminDeleteNote(id: string): Promise<void> {
  const { a, unwrapData } = await admin()
  unwrapData(await a.deleteNote({ params: { noteId: id } }))
}

export async function adminInviteUser(email: string, nombre: string): Promise<void> {
  const { a, unwrapData } = await admin()
  unwrapData(await a.inviteUser({ body: { email: cleanEmail(email), nombre } }))
}

// ── Hogares, planes y pagos ─────────────────────────────────────────────────────────────────────────────────────

export async function adminHouseholds() {
  const { a, unwrap } = await admin()
  return unwrap(await a.households())
}

export async function adminAssignPlan(householdId: string, plan: string, hasta: string, nota: string): Promise<void> {
  const { a, unwrapData } = await admin()
  unwrapData(await a.assignPlan({ params: { householdId }, body: { plan, hasta, nota } }))
}

export async function adminSubscriptions() {
  const { a, unwrap } = await admin()
  return unwrap(await a.subscriptions())
}

export async function adminUpdateSubscription(id: string, action: SubscriptionAction): Promise<void> {
  const { a, unwrapData } = await admin()
  unwrapData(await a.updateSubscription({ params: { subscriptionId: id }, body: { action } }))
}

export async function adminManualPayment(input: { householdId: string; plan: string; periodo: "mes" | "anio"; monto: number; nota: string }): Promise<void> {
  const { a, unwrapData } = await admin()
  unwrapData(await a.manualPayment({ body: input }))
}

export async function adminUpdatePayment(id: string, patch: { estado?: "reembolsado" | "anulado"; factura_ref?: string; nota?: string }): Promise<void> {
  const { a, unwrapData } = await admin()
  unwrapData(await a.updatePayment({ params: { paymentId: id }, body: patch }))
}

// ── Comunicados, administradores, auditoría y sistema ───────────────────────────────────────────────────────────

export async function adminBroadcast(input: { titulo: string; cuerpo: string; href: string; segmento: string; correo: boolean }): Promise<{ personas: number; correos: number }> {
  const { a, unwrapData } = await admin()
  const { personas, correos } = unwrapData(await a.broadcast({ body: input }))
  return { personas, correos }
}

export async function adminAdmins() {
  const { a, unwrap } = await admin()
  return unwrap(await a.admins())
}

export async function adminAddAdminByEmail(email: string): Promise<void> {
  const { a, unwrapData } = await admin()
  unwrapData(await a.addAdmin({ body: { email: cleanEmail(email) } }))
}

export async function adminAuditLog() {
  const { a, unwrap } = await admin()
  return unwrap(await a.audit())
}

/** Ajustes de la plataforma (fila de `platform_settings`), migraciones, hogares vacíos, referidos y configuración. */
export async function adminSystem() {
  const { a, unwrap } = await admin()
  const d = unwrap(await a.system())
  return { ...d, settings: d.settings as Row<"platform_settings"> | null }
}

export async function adminSaveSettings(patch: z.input<typeof SaveSettings>): Promise<void> {
  const { a, unwrapData } = await admin()
  unwrapData(await a.saveSettings({ body: patch }))
}

export async function adminCleanOrphanHouseholds(): Promise<number> {
  const { a, unwrapData } = await admin()
  return unwrapData(await a.cleanOrphans()).borrados
}

export async function adminNotifyLog() {
  const { a, unwrap } = await admin()
  return unwrap(await a.notifyLog())
}

export async function adminTestDefaults(): Promise<{ email: string; whatsapp: string }> {
  const { a, unwrap } = await admin()
  return unwrap(await a.testDefaults())
}

// ── Integraciones globales ──────────────────────────────────────────────────────────────────────────────────────

/** Los errores que el administrador debe leer vuelven como `{ ok:false, msg }`. */
const fail = (e: unknown) => ({ ok: false as const, msg: errorMsg(e) })

export async function adminGlobalIntegrations() {
  const { a, unwrap } = await admin()
  return unwrap(await a.integrations())
}

export async function adminSaveGlobalIntegration(kind: string, input: { modo: string; planes: string[]; values: Record<string, string | number | boolean> }): Promise<{ ok: boolean; msg?: string; warn?: string }> {
  try {
    const { a, unwrapData } = await admin()
    const d = unwrapData(await a.saveIntegration({ params: { kind }, body: { modo: input.modo as never, planes: input.planes, values: input.values } }))
    return { ok: true, ...(d.warn ? { warn: d.warn } : {}) }
  } catch (e) { return fail(e) }
}

export async function adminTestGlobal(kind: string): Promise<{ ok: boolean; msg: string }> {
  try {
    const { a, unwrapData } = await admin()
    return unwrapData(await a.testIntegration({ params: { kind } }))
  } catch (e) { return fail(e) }
}

export async function adminSendTest(kind: string, to: string): Promise<{ ok: boolean; msg: string }> {
  try {
    const { a, unwrapData } = await admin()
    return unwrapData(await a.sendTest({ params: { kind }, body: { to } }))
  } catch (e) { return fail(e) }
}

// ── WhatsApp de la consola ──────────────────────────────────────────────────────────────────────────────────────

export async function adminWaState(fresh = false): Promise<WaState> {
  const { a, unwrap } = await admin()
  return unwrap(await a.waState({ query: fresh ? { fresh: "1" } : {} })) as unknown as WaState
}

export async function adminWaSaveSettings(input: WaSettings): Promise<{ ok: boolean; msg?: string }> {
  try {
    const { a, unwrapData } = await admin()
    unwrapData(await a.waSaveSettings({ body: input as never }))
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function adminWaSaveTemplate(draft: TemplateDraft, edit?: { id: string; status?: string }): Promise<{ ok: boolean; msg: string }> {
  try {
    const { a, unwrapData } = await admin()
    return { ok: true, msg: unwrapData(await a.waSaveTemplate({ body: { draft, ...(edit ? { edit } : {}) } })).msg }
  } catch (e) { return fail(e) }
}

export async function adminWaDeleteTemplate(name: string, id?: string): Promise<{ ok: boolean; msg: string }> {
  try {
    const { a, unwrapData } = await admin()
    return { ok: true, msg: unwrapData(await a.waDeleteTemplate({ params: { name }, query: id ? { id } : {} })).msg }
  } catch (e) { return fail(e) }
}

export async function adminWaPreview(caso: WaCase, override?: WaSettings["casos"][WaCase]): Promise<{ ok: boolean; msg?: string; preview?: ParamPreview[]; template?: string }> {
  try {
    const { a, unwrapData } = await admin()
    const d = unwrapData(await a.waPreview({ body: { caso, ...(override ? { override } : {}) } }))
    return { ok: true, preview: d.preview as ParamPreview[], template: d.template }
  } catch (e) { return fail(e) }
}

export async function adminWaSendTest(input: { caso: WaCase; to: string; override?: WaSettings["casos"][WaCase] }): Promise<{ ok: boolean; msg: string; preview?: ParamPreview[] }> {
  try {
    const { a, unwrapData } = await admin()
    const d = unwrapData(await a.waSendTest({ body: { caso: input.caso, to: input.to, ...(input.override ? { override: input.override } : {}) } }))
    return d.preview ? { ok: true, msg: d.msg, preview: d.preview as ParamPreview[] } : { ok: true, msg: d.msg }
  } catch (e) { return fail(e) }
}

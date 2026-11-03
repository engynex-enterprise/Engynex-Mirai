"use server"

import { createHash, randomBytes } from "node:crypto"
import { cookies } from "next/headers"
import { z } from "zod"
import { BOOK_COOKIE, getAppContext, requireCan } from "@/lib/dal"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { supabaseServer } from "@/utils/supabase/server"
import { decrypt, encrypt } from "@/lib/crypto"
import { logSend } from "@/lib/notify/log"
import { maskDest } from "@/lib/notify/rules"
import { formatCoPhone } from "@/lib/notify/whatsapp"
import { siteUrl } from "@/lib/site-url"
import { limitOf } from "@/lib/plans"
import { planOf } from "@/lib/plan-server"
import { ACCESS_ROLES, assignableRoles, can, deniedMsg, ROLE_INFO, ROLE_RANK, toAccess, type AccessRole } from "@/lib/household/roles"
import { afterSend, checkDuplicate, inviteEstado, inviteText, isTestEmail, normalizeDest, resendGate, sameName, waMeLink, type LastResult } from "@/lib/household/invites"
import { sendInviteEmail, sendInviteWhatsApp, type InviteMsg } from "./send"
import { limitError } from "@/lib/security/rate-limit"
import { publicError } from "@/lib/security/errors"
import type { HouseholdPeople, InviteResult, Person, Share } from "./types"

type Res = { ok: boolean; msg: string }
const hash = (t: string) => createHash("sha256").update(t).digest("hex")
const DAYS = 7
const err = (e: unknown) => String((e as { message?: string })?.message ?? e ?? "Error desconocido")
/** Error legible de una función SQL (los RAISE EXCEPTION ya vienen en español). */
const sqlMsg = (m: string) => publicError({ message: m })

type Ctx = Awaited<ReturnType<typeof getAppContext>>
type Gate<T> = ({ ctx: Ctx; error?: undefined } & T) | { ctx?: undefined; error: string }

/** Ctx con un permiso o un mensaje "Tu rol no permite…" (sin lanzar: en producción Next oculta los throw). */
async function allowed(p: Parameters<typeof requireCan>[0]): Promise<Gate<object>> {
  try { return { ctx: await requireCan(p) } } catch (e) { return { error: err(e) } }
}

type InvRow = {
  id: string; household_id: string; email: string | null; phone: string | null; role: string; access_role: string | null; nombre: string | null; parentesco: string | null
  family_member_id: string | null; token_enc: string | null; expires_at: string; created_at: string; accepted_at: string | null; canceled_at: string | null
  last_sent_at: string | null; sends_day: string | null; sends_today: number; sent_count: number; last_result: unknown; invited_by: string | null
}
const INV_COLS = "id,household_id,email,phone,role,access_role,nombre,parentesco,family_member_id,token_enc,expires_at,created_at,accepted_at,canceled_at,last_sent_at,sends_day,sends_today,sent_count,last_result,invited_by"

// ── Lista de personas ─────────────────────────────────────────────────────────────────────────────────────────

/** Integrantes sin cuenta, personas con cuenta e invitaciones pendientes del hogar activo, en una sola lista. */
export async function loadHouseholdPeople(): Promise<HouseholdPeople> {
  const ctx = await getAppContext()
  const db = supabaseAdmin()
  const hh = ctx.household.id
  const admin = can(ctx.household.access, "invitar")
  const [{ data: ms }, { data: fams }, { data: invs }] = await Promise.all([
    db.from("household_members").select("user_id,role,access_role,created_at").eq("household_id", hh).order("created_at"),
    db.from("family_members").select("*").eq("household_id", hh).is("deleted_at", null).order("sort").order("created_at"),
    admin ? db.from("household_invitations").select(INV_COLS).eq("household_id", hh).is("accepted_at", null).is("canceled_at", null).order("created_at", { ascending: false }) : Promise.resolve({ data: [] as InvRow[] }),
  ])
  const ids = (ms ?? []).map((m) => m.user_id)
  const { data: ps } = ids.length ? await db.from("profiles").select("id,nombre,apodo,email,avatar_url").in("id", ids) : { data: [] }
  const prof = new Map((ps ?? []).map((p) => [p.id, p]))
  const mem = new Map((ms ?? []).map((m) => [m.user_id, m]))
  const now = new Date()
  const invOf = (i: InvRow): Person["invite"] => ({
    id: i.id, kind: i.phone ? "tel" : "email", destino: i.phone ? formatCoPhone(i.phone) : String(i.email ?? ""), phone: i.phone,
    access: toAccess(i.access_role, i.role), createdAt: i.created_at, expiresAt: i.expires_at, estado: inviteEstado(i, now) === "vencida" ? "vencida" : "pendiente",
    lastSentAt: i.last_sent_at, sendsDay: i.sends_day, sendsToday: i.sends_today ?? 0, result: (i.last_result ?? {}) as LastResult,
    share: inviteEstado(i, now) === "pendiente" && i.token_enc ? (() => { try { return shareOf(ctx, i, decrypt(i.token_enc!)) } catch { return null } })() : null,
  })
  const pending = (invs ?? []) as InvRow[]
  const people: Person[] = []
  const seen = new Set<string>()
  for (const f of fams ?? []) {
    const m = f.user_id ? mem.get(f.user_id) : undefined
    const p = f.user_id ? prof.get(f.user_id) : undefined
    const inv = !m ? pending.find((i) => i.family_member_id === f.id) : undefined
    if (m) seen.add(m.user_id)
    const invite = inv ? invOf(inv) : null
    people.push({
      key: `fm:${f.id}`, familyId: f.id, userId: m ? m.user_id : null, nombre: f.nombre, avatar: f.avatar || p?.avatar_url || null, parentesco: f.rol,
      access: m ? toAccess(m.access_role, m.role) : null, me: m?.user_id === ctx.user.id, titular: f.es_titular, email: p?.email ?? null,
      estado: m ? "miembro" : invite ? (invite.estado === "vencida" ? "vencida" : "invitado") : "sin_cuenta", invite, family: f,
    })
  }
  for (const m of ms ?? []) {
    if (seen.has(m.user_id)) continue
    const p = prof.get(m.user_id)
    people.push({
      key: `u:${m.user_id}`, familyId: null, userId: m.user_id, nombre: p?.nombre || p?.email || "Sin nombre", avatar: p?.avatar_url ?? null, parentesco: null,
      access: toAccess(m.access_role, m.role), me: m.user_id === ctx.user.id, titular: false, email: p?.email ?? null, estado: "miembro", invite: null, family: null,
    })
  }
  for (const i of pending) {
    if (i.family_member_id && people.some((x) => x.familyId === i.family_member_id)) continue
    const invite = invOf(i)!
    people.push({
      key: `inv:${i.id}`, familyId: null, userId: null, nombre: i.nombre?.trim() || invite.destino, avatar: null, parentesco: i.parentesco,
      access: null, me: false, titular: false, email: i.email, estado: invite.estado === "vencida" ? "vencida" : "invitado", invite, family: null,
    })
  }
  const order = (x: Person) => (x.me ? 0 : x.estado === "miembro" ? 10 - ROLE_RANK[x.access ?? "viewer"] / 10 : x.estado === "sin_cuenta" ? 20 : 30)
  people.sort((a, b) => order(a) - order(b))
  return {
    people,
    sinCuenta: people.filter((x) => x.estado === "sin_cuenta" && x.familyId).map((x) => ({ id: x.familyId!, nombre: x.nombre, parentesco: x.parentesco ?? "" })),
    limite: limitOf(ctx.plan, "personas"),
  }
}

// ── Invitar, reenviar, compartir y cancelar ────────────────────────────────────────────────────────────────────

const Invite = z.object({
  destino: z.string().max(120),
  nombre: z.string().max(60).optional().nullable(),
  parentesco: z.string().max(60).optional().nullable(),
  access: z.enum(["admin", "editor", "registra", "viewer"]),
  familyId: z.uuid().optional().nullable(),
  /** Es otra persona aunque se llame igual que un integrante sin cuenta. */
  nueva: z.boolean().optional(),
})

function newToken() {
  const token = randomBytes(24).toString("base64url")
  let enc: string | null = null
  try { enc = encrypt(token) } catch { /* sin ENCRYPTION_KEY el enlace solo se muestra al crearla */ }
  return { token, token_hash: hash(token), token_enc: enc }
}

function shareOf(ctx: Ctx, inv: Pick<InvRow, "nombre" | "phone" | "access_role" | "role" | "expires_at">, token: string): Share {
  const url = `${siteUrl()}/invitacion/${token}`
  const text = inviteText({ invita: ctx.user.apodo || ctx.user.nombre, hogar: ctx.household.nombre, nombre: inv.nombre, rol: toAccess(inv.access_role, inv.role), url, vence: inv.expires_at })
  return { url, text, wa: waMeLink(text, inv.phone) }
}

/** Token de una invitación (descifrado) o uno nuevo si no se guardó (invitaciones de la versión anterior). */
async function tokenOf(inv: InvRow) {
  if (inv.token_enc) try { return decrypt(inv.token_enc) } catch { /* se rota abajo */ }
  const t = newToken()
  await supabaseAdmin().from("household_invitations").update({ token_hash: t.token_hash, token_enc: t.token_enc }).eq("id", inv.id)
  return t.token
}

/** Envía por correo y/o WhatsApp, guarda el resultado y los contadores (límite de reenvíos). */
async function deliver(ctx: Ctx, inv: InvRow, token: string) {
  const share = shareOf(ctx, inv, token)
  const m: InviteMsg = { householdId: ctx.household.id, userId: ctx.user.id, invita: ctx.user.apodo || ctx.user.nombre, hogar: ctx.household.nombre, nombre: inv.nombre, rol: toAccess(inv.access_role, inv.role), url: share.url, vence: inv.expires_at }
  const prev = { ...((inv.last_result ?? {}) as LastResult) }
  delete prev.cancelada
  const result: LastResult = { ...prev }
  if (inv.email) result.email = await sendInviteEmail(m, inv.email)
  if (inv.phone) result.whatsapp = await sendInviteWhatsApp(m, inv.phone)
  await supabaseAdmin().from("household_invitations").update({ ...afterSend(inv), sent_count: (inv.sent_count ?? 0) + 1, last_result: result as never }).eq("id", inv.id)
  return { share, result }
}

/** Mensaje final según cómo salió cada canal. */
function deliveryMsg(quien: string, r: LastResult, reenvio: boolean) {
  const verbo = reenvio ? "reenviada" : "enviada"
  if (r.email?.ok && r.email.via === "prueba") return `Invitación ${verbo} (correo de prueba: no se envió de verdad).`
  if (r.email?.ok) return `Invitación ${verbo} por correo a ${quien}.`
  if (r.whatsapp?.ok) return `Invitación ${verbo} por WhatsApp a ${quien}.`
  if (r.email && !r.email.ok) return `La invitación quedó lista, pero el correo no salió: ${r.email.error}. Envíala desde tu WhatsApp o copia el enlace.`
  if (r.whatsapp?.via === "api") return `La invitación quedó lista, pero WhatsApp no la envió: ${r.whatsapp.error}. Envíala desde tu WhatsApp.`
  return `La invitación quedó lista. Envíasela a ${quien} desde tu WhatsApp o copia el enlace.`
}

/** Invita a una persona por correo o celular, sin duplicados (miembros, invitaciones pendientes e integrantes). */
export async function invitePerson(input: z.input<typeof Invite>): Promise<InviteResult> {
  const p = Invite.safeParse(input)
  if (!p.success) return { ok: false, msg: p.error.issues[0].message }
  const a = await allowed("invitar")
  if (!a.ctx) return { ok: false, msg: a.error }
  const ctx = a.ctx
  if (!assignableRoles(ctx.household.access).includes(p.data.access)) return { ok: false, msg: "No puedes dar un rol con más permisos que el tuyo." }
  const dest = normalizeDest(p.data.destino)
  if ("error" in dest) return { ok: false, msg: dest.error }
  // Límite de invitaciones nuevas (evita usar Mirai para enviar correos o WhatsApp masivos). Los correos de prueba
  // (.test, example.com) no se envían de verdad y no cuentan.
  const lim = dest.kind === "email" && isTestEmail(dest.value) ? null : (await limitError("invitarMin", ctx.user.id, "Enviaste muchas invitaciones seguidas")) ?? (await limitError("invitar", ctx.user.id, "Llegaste al límite de invitaciones de hoy"))
  if (lim) return { ok: false, msg: lim }
  const db = supabaseAdmin()
  const hh = ctx.household.id

  // Duplicados: ya es miembro o ya tiene una invitación pendiente.
  const [{ data: ms }, { data: invs }] = await Promise.all([
    db.from("household_members").select("user_id").eq("household_id", hh),
    db.from("household_invitations").select("id,email,phone,nombre,created_at,expires_at,family_member_id").eq("household_id", hh).is("accepted_at", null).is("canceled_at", null),
  ])
  const ids = (ms ?? []).map((m) => m.user_id)
  const { data: ps } = ids.length ? await db.from("profiles").select("id,nombre,email,telefono").in("id", ids) : { data: [] }
  const dup = checkDuplicate(dest, (ps ?? []).map((x) => ({ nombre: x.nombre, email: x.email, telefono: x.telefono })), invs ?? [])
  if (dup.kind === "miembro") return { ok: false, code: "miembro", msg: dup.msg }
  if (dup.kind === "pendiente") return { ok: false, code: "pendiente", invitationId: dup.id, msg: dup.msg }

  // Integrante sin cuenta: se vincula a ese mismo (al aceptar no se crea otro).
  let nombre = p.data.nombre?.trim() || null
  let parentesco = p.data.parentesco?.trim() || null
  const familyId = p.data.familyId ?? null
  const { data: fams } = await db.from("family_members").select("id,nombre,rol,user_id").eq("household_id", hh).is("deleted_at", null)
  if (familyId) {
    const f = (fams ?? []).find((x) => x.id === familyId)
    if (!f) return { ok: false, msg: "Ese integrante ya no está en el hogar." }
    if (f.user_id) return { ok: false, code: "miembro", msg: `${f.nombre} ya tiene su cuenta y hace parte de tu hogar.` }
    const other = (invs ?? []).find((i) => i.family_member_id === familyId)
    if (other) return { ok: false, code: "pendiente", invitationId: other.id, msg: `Ya invitaste a ${f.nombre}. ¿Quieres reenviarle la invitación?` }
    nombre ||= f.nombre
    parentesco ||= f.rol
  } else if (nombre && !p.data.nueva) {
    const same = (fams ?? []).find((x) => !x.user_id && sameName(x.nombre, nombre!))
    if (same) return { ok: false, code: "mismo_nombre", familyId: same.id, msg: `Ya tienes a ${same.nombre} en tu hogar (sin cuenta). ¿Es la misma persona?` }
  }

  // Límite de personas del plan.
  const max = limitOf(ctx.plan, "personas")
  if (max !== undefined) {
    const vivos = (invs ?? []).filter((i) => new Date(i.expires_at) > new Date()).length
    if (ids.length + vivos >= max) return { ok: false, code: "limite", msg: `Tu plan permite ${max} personas con cuenta por hogar. Cambia de plan para invitar a toda tu familia.` }
  }

  const t = newToken()
  const row = {
    household_id: hh, email: dest.kind === "email" ? dest.value : null, phone: dest.kind === "tel" ? dest.value : null,
    access_role: p.data.access, role: p.data.access === "admin" || p.data.access === "editor" ? "editor" : "viewer",
    nombre, parentesco, family_member_id: familyId, token_hash: t.token_hash, token_enc: t.token_enc, invited_by: ctx.user.id,
    expires_at: new Date(Date.now() + DAYS * 86400000).toISOString(),
  }
  const { data: inv, error } = await db.from("household_invitations").insert(row).select(INV_COLS).single()
  if (error || !inv) {
    if (error?.code === "23505") return { ok: false, code: "pendiente", msg: "Ya hay una invitación pendiente para esa persona. Búscala en la lista y reenvíala." }
    return { ok: false, msg: `No pudimos crear la invitación: ${publicError(error, "intenta de nuevo.")}` }
  }
  const { share, result } = await deliver(ctx, inv as InvRow, t.token)
  return { ok: true, invitationId: inv.id, share, delivery: result, msg: deliveryMsg(nombre || dest.label, result, false) }
}

async function ownInvitation(id: string): Promise<Gate<{ inv: InvRow }>> {
  const a = await allowed("invitar")
  if (!a.ctx) return { error: a.error }
  const { data } = await supabaseAdmin().from("household_invitations").select(INV_COLS).eq("id", id).eq("household_id", a.ctx.household.id).is("accepted_at", null).is("canceled_at", null).maybeSingle()
  if (!data) return { error: "Esa invitación ya no está pendiente (la aceptaron o la cancelaron)." }
  return { ctx: a.ctx, inv: data as InvRow }
}

/** Reenvía (máximo 1 cada 10 minutos y 5 al día). Si ya venció, la renueva por 7 días más. */
export async function resendInvitation(id: string): Promise<InviteResult> {
  const o = await ownInvitation(id)
  if (!o.ctx) return { ok: false, msg: o.error }
  const gate = resendGate(o.inv)
  if (!gate.ok) return { ok: false, code: "espera", msg: gate.msg }
  let inv = o.inv
  if (new Date(inv.expires_at) <= new Date()) {
    const expires_at = new Date(Date.now() + DAYS * 86400000).toISOString()
    await supabaseAdmin().from("household_invitations").update({ expires_at }).eq("id", inv.id)
    inv = { ...inv, expires_at }
  }
  const token = await tokenOf(inv)
  const { share, result } = await deliver(o.ctx, inv, token)
  return { ok: true, invitationId: inv.id, share, delivery: result, msg: deliveryMsg(inv.nombre || (inv.phone ? formatCoPhone(inv.phone) : inv.email ?? ""), result, true) }
}

/** Enlace, texto y wa.me de una invitación pendiente (Copiar enlace, Compartir, Enviar desde mi WhatsApp). */
export async function shareInvitation(id: string): Promise<{ ok: boolean; msg: string; share?: Share }> {
  const o = await ownInvitation(id)
  if (!o.ctx) return { ok: false, msg: o.error }
  if (new Date(o.inv.expires_at) <= new Date()) return { ok: false, msg: "La invitación venció. Reenvíala para renovarla por 7 días." }
  return { ok: true, msg: "", share: shareOf(o.ctx, o.inv, await tokenOf(o.inv)) }
}

/** Registra que la persona abrió su WhatsApp con la invitación lista (canal "propio"). */
export async function markInvitationShared(id: string): Promise<Res> {
  const o = await ownInvitation(id)
  if (!o.ctx) return { ok: false, msg: o.error }
  const at = new Date().toISOString()
  const result: LastResult = { ...((o.inv.last_result ?? {}) as LastResult), whatsapp: { ok: true, at, via: "propio", provider: "wa.me" } }
  await supabaseAdmin().from("household_invitations").update({ last_result: result as never }).eq("id", id)
  await logSend({ user_id: o.ctx.user.id, household_id: o.ctx.household.id, channel: "whatsapp", kind: "invitacion", provider: "wa.me", source: "hogar", status: "enviado", destino: o.inv.phone ? maskDest("whatsapp", o.inv.phone) : "contacto elegido en WhatsApp" })
  return { ok: true, msg: "" }
}

export async function cancelInvitation(id: string): Promise<Res> {
  const o = await ownInvitation(id)
  if (!o.ctx) return { ok: false, msg: o.error }
  const now = new Date().toISOString()
  const { error } = await supabaseAdmin().from("household_invitations").update({ canceled_at: now, canceled_by: o.ctx.user.id, expires_at: new Date(Math.min(Date.now(), new Date(o.inv.expires_at).getTime())).toISOString() }).eq("id", id)
  return error ? { ok: false, msg: publicError(error) } : { ok: true, msg: "Invitación cancelada. El enlace ya no sirve." }
}

// ── Roles y personas con cuenta ───────────────────────────────────────────────────────────────────────────────

const rpc = async (fn: "set_member_access" | "remove_household_member" | "transfer_household" | "link_family_member", args: Record<string, unknown>): Promise<string | null> => {
  const sb = await supabaseServer()
  const { error } = await sb.rpc(fn as never, args as never)
  return error ? sqlMsg(error.message) : null
}

export async function changeRole(userId: string, access: AccessRole): Promise<Res> {
  if (!(ACCESS_ROLES as readonly string[]).includes(access) || access === "owner") return { ok: false, msg: "Ese rol no existe. Para que alguien sea dueño, pásale el hogar." }
  const ctx = await getAppContext()
  const e = await rpc("set_member_access", { p_household: ctx.household.id, p_user: userId, p_access: access })
  return e ? { ok: false, msg: e } : { ok: true, msg: `Rol actualizado: ${ROLE_INFO[access].label}.` }
}

export async function removePerson(userId: string): Promise<Res> {
  const ctx = await getAppContext()
  const e = await rpc("remove_household_member", { p_household: ctx.household.id, p_user: userId })
  if (e) return { ok: false, msg: e }
  // Los accesos del contador que creó esa persona dejan de servir: ya no es del hogar.
  const db = supabaseAdmin()
  const { data: bs } = await db.from("books").select("id").eq("household_id", ctx.household.id)
  if (bs?.length) await db.from("accountant_shares").update({ revoked_at: new Date().toISOString() }).in("book_id", bs.map((b) => b.id)).eq("created_by", userId).is("revoked_at", null)
  if (userId === ctx.user.id) (await cookies()).delete(BOOK_COOKIE)
  return { ok: true, msg: userId === ctx.user.id ? "Saliste del hogar." : "Ya no tiene acceso al hogar. Sus gastos e ingresos se quedan a su nombre." }
}

export async function transferHousehold(userId: string): Promise<Res> {
  const ctx = await getAppContext()
  const e = await rpc("transfer_household", { p_household: ctx.household.id, p_user: userId })
  return e ? { ok: false, msg: e } : { ok: true, msg: "Listo: ahora esa persona es la dueña del hogar y tú quedas como Administra." }
}

/** Une a una persona con cuenta con el integrante sin cuenta que la representaba (la misma persona). */
export async function linkPerson(userId: string, familyId: string): Promise<Res> {
  const ctx = await getAppContext()
  const e = await rpc("link_family_member", { p_household: ctx.household.id, p_user: userId, p_family: familyId })
  return e ? { ok: false, msg: e } : { ok: true, msg: "Listo: ahora es una sola persona, con su cuenta y sus movimientos." }
}

// ── Integrantes sin cuenta ────────────────────────────────────────────────────────────────────────────────────

const Member = z.object({
  id: z.uuid().optional().nullable(),
  nombre: z.string().trim().min(1, "Escribe el nombre").max(60),
  rol: z.string().trim().max(60).optional().nullable(),
  avatar: z.string().max(500).optional().nullable(),
  nacimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  cupo: z.number().min(0).max(1e12).optional(),
  /** Guardar aunque ya haya alguien con el mismo nombre. */
  force: z.boolean().optional(),
})

/** Crea o edita un integrante (sin duplicar nombres sin confirmar). Con la sesión de la persona: queda en la auditoría. */
export async function saveFamilyMember(input: z.input<typeof Member>): Promise<Res & { code?: "mismo_nombre"; id?: string }> {
  const p = Member.safeParse(input)
  if (!p.success) return { ok: false, msg: p.error.issues[0].message }
  const ctx = await getAppContext()
  const perm = p.data.id ? "planear" : "invitar"
  if (!can(ctx.household.access, perm)) return { ok: false, msg: deniedMsg(perm) }
  const sb = await supabaseServer()
  if (!p.data.force) {
    const { data: fams } = await sb.from("family_members").select("id,nombre").eq("household_id", ctx.household.id).is("deleted_at", null)
    const same = (fams ?? []).find((f) => f.id !== p.data.id && sameName(f.nombre, p.data.nombre))
    if (same) return { ok: false, code: "mismo_nombre", msg: `Ya hay una persona llamada ${same.nombre} en tu hogar. ¿Es otra persona con el mismo nombre?` }
  }
  const row = { nombre: p.data.nombre, rol: p.data.rol || "Otro familiar", avatar: p.data.avatar ?? "", nacimiento: p.data.nacimiento ?? null, cupo: p.data.cupo ?? 0 }
  const { data, error } = p.data.id
    ? await sb.from("family_members").update(row).eq("id", p.data.id).eq("household_id", ctx.household.id).select("id").single()
    : await sb.from("family_members").insert({ ...row, household_id: ctx.household.id }).select("id").single()
  if (error || !data) return { ok: false, msg: `No se pudo guardar: ${error ? publicError(error, "intenta de nuevo.") : "sin permiso"}` }
  return { ok: true, id: data.id, msg: p.data.id ? `Se actualizaron los datos de ${row.nombre}.` : `${row.nombre} ya hace parte de tu hogar.` }
}

/** Saca del hogar a un integrante sin cuenta (borrado lógico, con Deshacer). Cancela su invitación pendiente. */
export async function deleteFamilyMember(id: string, restore = false): Promise<Res> {
  const a = await allowed("invitar")
  if (!a.ctx) return { ok: false, msg: a.error }
  const sb = await supabaseServer()
  const { data: f } = await sb.from("family_members").select("id,nombre,user_id,es_titular").eq("id", id).eq("household_id", a.ctx.household.id).maybeSingle()
  if (!f) return { ok: false, msg: "Ese integrante ya no está en el hogar." }
  if (!restore && (f.es_titular || f.user_id)) return { ok: false, msg: `${f.nombre} tiene cuenta en Mirai: primero quítale el acceso al hogar.` }
  const { error } = await sb.from("family_members").update({ deleted_at: restore ? null : new Date().toISOString() }).eq("id", id)
  if (error) return { ok: false, msg: publicError(error) }
  if (!restore) await supabaseAdmin().from("household_invitations").update({ canceled_at: new Date().toISOString(), canceled_by: a.ctx.user.id, expires_at: new Date().toISOString() }).eq("family_member_id", id).is("accepted_at", null).is("canceled_at", null)
  return { ok: true, msg: restore ? `${f.nombre} volvió al hogar.` : `${f.nombre} ya no está en el hogar.` }
}

export async function renameHousehold(nombre: string): Promise<Res> {
  const a = await allowed("ajustes")
  if (!a.ctx) return { ok: false, msg: a.error }
  const n = nombre.trim().slice(0, 60)
  if (!n) return { ok: false, msg: "Escribe un nombre" }
  await supabaseAdmin().from("households").update({ nombre: n }).eq("id", a.ctx.household.id)
  return { ok: true, msg: "Nombre actualizado" }
}

// ── Aceptar ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Acepta con la sesión actual (RPC accept_invitation, idempotente) y deja abierto el hogar nuevo. */
export async function acceptInvitation(token: string): Promise<{ ok: boolean; msg: string }> {
  const sb = await supabaseServer()
  const { data: info } = await sb.rpc("invitation_info", { p_token: token })
  const ya = !!(info as { ya_miembro?: boolean } | null)?.ya_miembro
  // Límite de personas del plan del hogar que invita (si bajó de plan después de invitar, no entra nadie más).
  if (!ya && typeof token === "string" && token.length <= 128) {
    const db = supabaseAdmin()
    const { data: inv } = await db.from("household_invitations").select("household_id").eq("token_hash", hash(token)).is("accepted_at", null).is("canceled_at", null).maybeSingle()
    if (inv) {
      const max = limitOf(await planOf(inv.household_id), "personas")
      const { count } = await db.from("household_members").select("user_id", { count: "exact", head: true }).eq("household_id", inv.household_id)
      if (max !== undefined && (count ?? 0) >= max) return { ok: false, msg: `Ese hogar ya tiene las ${max} personas que permite su plan. Pídele a quien te invitó que revise su plan en Ajustes › Mi plan.` }
    }
  }
  const { data: hh, error } = await sb.rpc("accept_invitation", { p_token: token })
  if (error) return { ok: false, msg: /venció|no existe/.test(error.message) ? "La invitación no existe o ya venció. Pide una nueva." : sqlMsg(error.message) }
  if (hh) {
    const { data: book } = await sb.from("books").select("id").eq("household_id", hh as string).is("deleted_at", null).order("is_default", { ascending: false }).order("created_at").limit(1).maybeSingle()
    if (book) {
      ;(await cookies()).set(BOOK_COOKIE, book.id, { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 })
      const { data: claims } = await sb.auth.getClaims()
      if (claims?.claims.sub) await sb.from("profiles").update({ last_book_id: book.id }).eq("id", claims.claims.sub)
    }
  }
  return { ok: !!hh, msg: ya ? "Ya hacías parte de este hogar. Te llevamos allá." : "¡Listo! Ya haces parte del hogar." }
}

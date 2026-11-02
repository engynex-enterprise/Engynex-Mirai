"use server"

import { cookies, headers } from "next/headers"
import { z } from "zod"
import { BOOK_COOKIE, getAppContext } from "@/lib/dal"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { supabaseServer } from "@/utils/supabase/server"
import { siteUrl } from "@/lib/site-url"
import { limitError } from "@/lib/security/rate-limit"
import { publicError } from "@/lib/security/errors"
import { isTestEmail } from "@/lib/household/invites"
import { toAccess } from "@/lib/household/roles"
import { canReceive, nameMatches, transferStatus, type TransferRow } from "@/lib/household/transfer"
import { canRemove, checkNewEmail, isRecentAuth, type AccountEvent, type AccountState } from "@/lib/account/account"
import { cancelPreapproval } from "@/lib/payments/mercadopago"
import { purgeHouseholdFiles } from "@/features/data/purge"
import { sendTransferEmail } from "./send"
import type { AccountData, MyHousehold, SessionRow, TransferCandidates, TransferView } from "./types"

type Res = { ok: boolean; msg: string; code?: string }
const sql = (e: { message?: string } | null | undefined) => publicError(e)

/** Origen de la petición (localhost, pruebas o producción) para los enlaces de vuelta. */
async function origin() {
  const h = await headers()
  const o = h.get("origin")
  if (o && /^https?:\/\/[^/\s]+$/.test(o)) return o
  return siteUrl()
}

/** Evento de la actividad de seguridad con IP y dispositivo (los triggers de Auth no los conocen). */
async function logEvent(userId: string, kind: string, detail: Record<string, unknown> = {}) {
  try {
    const h = await headers()
    const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || null
    await supabaseAdmin().from("account_events").insert({ user_id: userId, kind, detail: detail as never, ip, user_agent: h.get("user-agent")?.slice(0, 300) ?? null })
  } catch { /* informativo */ }
}

async function myAccount(sb: Awaited<ReturnType<typeof supabaseServer>>): Promise<AccountState | null> {
  const { data } = await sb.rpc("my_account")
  return (data as unknown as AccountState | null) ?? null
}

// ── Lectura ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Todo lo de "Tu cuenta" en un viaje: formas de entrar, sesiones, actividad, hogares y solicitudes de dueño. */
export async function loadAccount(): Promise<AccountData> {
  const ctx = await getAppContext()
  const sb = await supabaseServer()
  const db = supabaseAdmin()
  const ids = ctx.households.map((h) => h.id)
  const [account, { data: sessions }, { data: events }, { data: members }, { data: transfers }] = await Promise.all([
    myAccount(sb),
    sb.rpc("my_sessions"),
    sb.from("account_events").select("id,kind,detail,created_at,ip,user_agent").eq("user_id", ctx.user.id).order("created_at", { ascending: false }).limit(40),
    ids.length ? db.from("household_members").select("household_id,user_id").in("household_id", ids) : Promise.resolve({ data: [] as { household_id: string; user_id: string }[] }),
    sb.from("household_transfers").select("id,household_id,from_user,to_user,from_role,plan_action,status,expires_at,created_at").eq("status", "pendiente").or(`to_user.eq.${ctx.user.id},from_user.eq.${ctx.user.id}`),
  ])
  const pend = ((transfers ?? []) as TransferRow[]).filter((t) => transferStatus(t) === "pendiente")
  const people = [...new Set(pend.flatMap((t) => [t.from_user, t.to_user]))]
  const hhIds = [...new Set(pend.map((t) => t.household_id))]
  const [{ data: ps }, { data: hs }] = await Promise.all([
    people.length ? db.from("profiles").select("id,nombre,apodo,email").in("id", people) : Promise.resolve({ data: [] as { id: string; nombre: string; apodo: string; email: string | null }[] }),
    hhIds.length ? db.from("households").select("id,nombre").in("id", hhIds) : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
  ])
  const name = (id: string) => { const p = (ps ?? []).find((x) => x.id === id); return p?.apodo || p?.nombre || p?.email || "Alguien" }
  const view = (t: TransferRow): TransferView => ({ id: t.id, householdId: t.household_id, hogar: (hs ?? []).find((h) => h.id === t.household_id)?.nombre ?? "Hogar", de: name(t.from_user), para: name(t.to_user), fromRole: toAccess(t.from_role), planAction: t.plan_action === "cancelar" ? "cancelar" : "seguir", expiresAt: t.expires_at, createdAt: t.created_at })
  const households: MyHousehold[] = ctx.households.map((h) => ({
    id: h.id, nombre: h.nombre, access: h.access, active: h.id === ctx.household.id,
    personas: (members ?? []).filter((m) => m.household_id === h.id).length,
    firstBook: ctx.books.find((b) => b.household_id === h.id)?.id ?? null,
    outgoing: pend.filter((t) => t.household_id === h.id && t.from_user === ctx.user.id).map(view)[0] ?? null,
  }))
  return {
    account: account ?? { email: ctx.user.email, new_email: null, email_change_sent_at: null, email_change_confirm_status: 0, has_password: false, created_at: null, last_sign_in_at: null, identities: [] },
    sessions: ((sessions ?? []) as SessionRow[]),
    events: ((events ?? []) as AccountEvent[]),
    households,
    incoming: pend.filter((t) => t.to_user === ctx.user.id).map(view),
  }
}

// ── Correo de la cuenta ───────────────────────────────────────────────────────────────────────────────────────

/**
 * Pide cambiar el correo. Supabase envía el enlace al correo nuevo (y al actual si está activado "cambio de correo
 * seguro"). Con un correo de prueba (.test, example.com) no se envía nada: se deja el cambio pendiente con la API de
 * administración (generateLink no envía correos), igual que las invitaciones de prueba.
 */
export async function requestEmailChange(email: string): Promise<Res> {
  const ctx = await getAppContext()
  const sb = await supabaseServer()
  const acc = await myAccount(sb)
  const v = checkNewEmail(acc?.email ?? ctx.user.email, String(email ?? ""))
  if (!v.ok) return { ok: false, msg: v.msg }
  // Los correos de prueba (.test, example.com) no se envían de verdad y no cuentan para el límite.
  const lim = isTestEmail(v.email) ? null : await limitError("cuentaCorreo", ctx.user.id, "Pediste cambiar el correo muchas veces seguidas")
  if (lim) return { ok: false, msg: lim }
  const taken = /already|registered|exists/i
  if (isTestEmail(v.email)) {
    const { error } = await supabaseAdmin().auth.admin.generateLink({ type: "email_change_new", email: acc?.email ?? ctx.user.email, newEmail: v.email })
    if (error) return { ok: false, msg: taken.test(error.message) ? "Ese correo ya es de otra cuenta de Mirai. Usa otro o entra con esa cuenta." : "No pudimos pedir el cambio. Intenta de nuevo." }
    await logEvent(ctx.user.id, "correo_solicitado", { correo: v.email, prueba: true })
    return { ok: true, code: "prueba", msg: `Correo de prueba: no se envió de verdad. El cambio a ${v.email} quedó pendiente de confirmar.` }
  }
  const next = encodeURIComponent("/perfil?correo=listo#cuentas")
  const { error } = await sb.auth.updateUser({ email: v.email }, { emailRedirectTo: `${await origin()}/auth/callback?next=${next}` })
  if (error) {
    if (taken.test(error.message) || (error as { code?: string }).code === "email_exists") return { ok: false, msg: "Ese correo ya es de otra cuenta de Mirai. Usa otro o entra con esa cuenta." }
    if (/rate|seconds|security purposes/i.test(error.message)) return { ok: false, msg: "Acabamos de enviarte un correo. Espera un minuto y vuelve a intentar." }
    return { ok: false, msg: "No pudimos enviar el correo de confirmación. Intenta de nuevo en un rato." }
  }
  await logEvent(ctx.user.id, "correo_solicitado", { correo: v.email })
  return { ok: true, msg: `Te enviamos un enlace a ${v.email}. Ábrelo para confirmar el cambio.` }
}

/** Reenvía el enlace del cambio pendiente (Supabase espera al menos un minuto entre envíos). */
export async function resendEmailChange(): Promise<Res> {
  const ctx = await getAppContext()
  const sb = await supabaseServer()
  const acc = await myAccount(sb)
  if (!acc?.new_email) return { ok: false, msg: "No tienes un cambio de correo pendiente." }
  const lim = await limitError("cuentaCorreo", ctx.user.id, "Reenviaste el correo muchas veces seguidas")
  if (lim) return { ok: false, msg: lim }
  if (isTestEmail(acc.new_email)) return { ok: true, code: "prueba", msg: "Correo de prueba: no se envió de verdad." }
  const next = encodeURIComponent("/perfil?correo=listo#cuentas")
  const { error } = await sb.auth.updateUser({ email: acc.new_email }, { emailRedirectTo: `${await origin()}/auth/callback?next=${next}` })
  if (error) return { ok: false, msg: /rate|seconds|security purposes/i.test(error.message) ? "Acabamos de enviarte un correo. Espera un minuto y vuelve a intentar." : "No pudimos reenviar el correo. Intenta de nuevo en un rato." }
  return { ok: true, msg: `Te reenviamos el enlace a ${acc.new_email}.` }
}

export async function cancelEmailChange(): Promise<Res> {
  await getAppContext()
  const sb = await supabaseServer()
  const { data, error } = await sb.rpc("cancel_my_email_change")
  if (error) return { ok: false, msg: sql(error) }
  return data ? { ok: true, msg: "Cancelamos el cambio de correo. Los enlaces que te llegaron ya no sirven." } : { ok: false, msg: "No tenías un cambio de correo pendiente." }
}

// ── Formas de entrar ──────────────────────────────────────────────────────────────────────────────────────────

const Method = z.union([z.object({ kind: z.literal("google"), identityId: z.uuid() }), z.object({ kind: z.literal("password") })])

/** Quita una forma de entrar. Nunca la última, y solo si entraste hace poco (si no, pide volver a entrar). */
export async function removeMethod(input: z.input<typeof Method>): Promise<Res> {
  const p = Method.safeParse(input)
  if (!p.success) return { ok: false, msg: "Esa forma de entrar no existe." }
  const ctx = await getAppContext()
  const lim = await limitError("cuentaMetodo", ctx.user.id)
  if (lim) return { ok: false, msg: lim }
  const sb = await supabaseServer()
  const acc = await myAccount(sb)
  if (!acc) return { ok: false, msg: "Tu sesión venció. Vuelve a entrar." }
  const r = canRemove(acc, p.data)
  if (!r.ok) return { ok: false, msg: r.msg }
  const { data: claims } = await sb.auth.getClaims()
  if (!isRecentAuth(claims?.claims.amr)) return { ok: false, code: "reauth", msg: "Por seguridad, vuelve a entrar a Mirai y luego quita esta forma de entrar." }

  if (p.data.kind === "password") {
    const { error } = await sb.rpc("remove_my_password")
    return error ? { ok: false, msg: sql(error) } : { ok: true, msg: "Quitamos tu contraseña. Ahora entras con Google." }
  }
  // Supabase pide al menos 2 identidades para desconectar una: quien entró con Google y creó contraseña aún no
  // tiene la identidad "correo"; se crea (ensure_email_identity) y luego se desconecta Google.
  const wanted = p.data.identityId
  const { data: ids } = await sb.auth.getUserIdentities()
  let list = ids?.identities ?? []
  const target = list.find((i) => i.identity_id === wanted && i.provider === "google")
  if (!target) return { ok: false, msg: "Esa cuenta de Google ya no está conectada." }
  if (list.length < 2) {
    await sb.rpc("ensure_email_identity")
    await sb.auth.refreshSession()
    list = (await sb.auth.getUserIdentities()).data?.identities ?? list
  }
  const fresh = list.find((i) => i.identity_id === target.identity_id) ?? target
  const { error } = await sb.auth.unlinkIdentity(fresh)
  if (error) return { ok: false, msg: /single|at least|identities/i.test(error.message) ? "Es tu única forma de entrar. Agrega otra antes de quitarla." : "No pudimos quitar la cuenta de Google. Intenta de nuevo." }
  const email = (target.identity_data?.email as string | undefined) ?? null
  return { ok: true, msg: email ? `Quitamos la cuenta de Google ${email}. Ya no podrás entrar con ella.` : "Quitamos la cuenta de Google." }
}

// ── Sesiones ──────────────────────────────────────────────────────────────────────────────────────────────────

export async function revokeSession(id: string): Promise<Res> {
  if (!z.uuid().safeParse(id).success) return { ok: false, msg: "Esa sesión no existe." }
  const ctx = await getAppContext()
  const lim = await limitError("cuentaMetodo", ctx.user.id)
  if (lim) return { ok: false, msg: lim }
  const sb = await supabaseServer()
  const { data, error } = await sb.rpc("revoke_my_session", { p_session: id })
  if (error) return { ok: false, msg: sql(error) }
  return data ? { ok: true, msg: "Cerramos esa sesión. En unos minutos ese dispositivo tendrá que volver a entrar." } : { ok: false, msg: "Esa sesión ya estaba cerrada." }
}

/** Cierra la sesión en todos los dispositivos, incluido este. */
export async function signOutEverywhere(): Promise<Res> {
  const ctx = await getAppContext()
  const lim = await limitError("cuentaMetodo", ctx.user.id)
  if (lim) return { ok: false, msg: lim }
  await logEvent(ctx.user.id, "sesiones_cerradas")
  const sb = await supabaseServer()
  const { error } = await sb.auth.signOut({ scope: "global" })
  if (error) return { ok: false, msg: "No pudimos cerrar las sesiones. Intenta de nuevo." }
  ;(await cookies()).delete(BOOK_COOKIE)
  return { ok: true, msg: "Cerramos tu sesión en todos los dispositivos." }
}

// ── Pasar el hogar ────────────────────────────────────────────────────────────────────────────────────────────

async function ownerOf(householdId: string) {
  const ctx = await getAppContext()
  const h = ctx.households.find((x) => x.id === householdId)
  return { ctx, h, owner: h?.access === "owner" }
}

/** Personas que pueden recibir el hogar y si pagas una renovación automática. */
export async function loadTransferCandidates(householdId: string): Promise<TransferCandidates> {
  if (!z.uuid().safeParse(householdId).success) return { ok: false, msg: "Ese hogar no existe.", people: [], tienePago: false, hogar: "" }
  const { ctx, h, owner } = await ownerOf(householdId)
  if (!h) return { ok: false, msg: "Ese hogar no es tuyo.", people: [], tienePago: false, hogar: "" }
  const db = supabaseAdmin()
  const [{ data: ms }, { data: subs }] = await Promise.all([
    db.from("household_members").select("user_id,role,access_role").eq("household_id", householdId),
    db.from("plan_subscriptions").select("id").eq("household_id", householdId).eq("proveedor", "mercadopago").eq("created_by", ctx.user.id).in("estado", ["activa", "pendiente"]),
  ])
  const ids = (ms ?? []).map((m) => m.user_id)
  const { data: ps } = ids.length ? await db.from("profiles").select("id,nombre,apodo,email,avatar_url").in("id", ids) : { data: [] }
  const people = (ms ?? []).map((m) => {
    const p = (ps ?? []).find((x) => x.id === m.user_id)
    const access = toAccess(m.access_role, m.role)
    const c = { userId: m.user_id, access, me: m.user_id === ctx.user.id, estado: "miembro" }
    return { userId: m.user_id, nombre: p?.nombre || p?.email || "Sin nombre", email: p?.email ?? null, avatar: p?.avatar_url ?? null, access, ok: canReceive(h.access, c).ok }
  }).filter((p) => p.userId !== ctx.user.id)
  return { ok: owner, msg: owner ? "" : "Solo el dueño puede pasar el hogar a otra persona.", people, tienePago: !!subs?.length, hogar: h.nombre }
}

const Transfer = z.object({
  householdId: z.uuid(),
  userId: z.uuid(),
  fromRole: z.enum(["admin", "editor", "registra", "viewer"]),
  planAction: z.enum(["seguir", "cancelar"]),
  confirm: z.string().max(120),
})

/** Pide pasarle el hogar a otra persona. Queda pendiente hasta que acepte (7 días). Le llega un aviso y un correo. */
export async function requestTransfer(input: z.input<typeof Transfer>): Promise<Res> {
  const p = Transfer.safeParse(input)
  if (!p.success) return { ok: false, msg: "Revisa los datos: elige a la persona y tu rol." }
  const { ctx, h, owner } = await ownerOf(p.data.householdId)
  if (!h || !owner) return { ok: false, msg: "Solo el dueño puede pasar el hogar a otra persona." }
  if (!nameMatches(p.data.confirm, h.nombre)) return { ok: false, msg: "Escribe el nombre del hogar tal como aparece para confirmar." }
  const lim = await limitError("pasarHogar", ctx.user.id)
  if (lim) return { ok: false, msg: lim }
  const sb = await supabaseServer()
  const { data: id, error } = await sb.rpc("request_household_transfer", { p_household: h.id, p_user: p.data.userId, p_from_role: p.data.fromRole, p_plan_action: p.data.planAction, p_confirm: p.data.confirm })
  if (error || !id) return { ok: false, msg: sql(error) }
  const db = supabaseAdmin()
  const { data: to } = await db.from("profiles").select("nombre,apodo,email").eq("id", p.data.userId).maybeSingle()
  const para = to?.apodo || to?.nombre || "esa persona"
  const mail = await sendTransferEmail({ householdId: h.id, userId: ctx.user.id, de: ctx.user.apodo || ctx.user.nombre, para, hogar: h.nombre, url: `${siteUrl()}/ajustes?tab=cuenta`, vence: new Date(Date.now() + 7 * 86400000).toISOString() }, to?.email)
  const extra = mail === "enviado" ? " y un correo" : mail === "prueba" ? " (correo de prueba: no se envió)" : ""
  return { ok: true, msg: `Listo: le enviamos a ${para} un aviso en Mirai${extra}. Cuando acepte, será el dueño del hogar.` }
}

/** Acepta o rechaza ser el dueño. Si aceptas y quien te lo pasó pidió cancelar su renovación, se cancela. */
export async function respondTransfer(id: string, accept: boolean): Promise<Res> {
  if (!z.uuid().safeParse(id).success) return { ok: false, msg: "Esa solicitud no existe." }
  const ctx = await getAppContext()
  const lim = await limitError("pasarHogar", ctx.user.id)
  if (lim) return { ok: false, msg: lim }
  const sb = await supabaseServer()
  const { data, error } = await sb.rpc("respond_household_transfer", { p_transfer: id, p_accept: !!accept })
  if (error || !data) return { ok: false, msg: sql(error) }
  const r = data as { estado: string; household_id: string; from_user?: string; plan_action?: string }
  if (r.estado === "vencida") return { ok: false, msg: "La solicitud venció (pasaron 7 días). Pídele que te la envíe de nuevo." }
  if (r.estado === "no_aplica") return { ok: false, msg: "Esta solicitud ya no aplica: el hogar cambió de dueño o ya no haces parte de él." }
  if (r.estado === "cancelada") return { ok: false, msg: "Esta solicitud fue cancelada." }
  if (r.estado === "aceptada" && accept) {
    if (r.plan_action === "cancelar" && r.from_user) {
      const db = supabaseAdmin()
      const { data: subs } = await db.from("plan_subscriptions").select("id,proveedor_ref").eq("household_id", r.household_id).eq("proveedor", "mercadopago").eq("created_by", r.from_user).in("estado", ["activa", "pendiente"])
      for (const s of subs ?? []) {
        try { if (s.proveedor_ref) await cancelPreapproval(s.proveedor_ref); await db.from("plan_subscriptions").update({ estado: "cancelada" }).eq("id", s.id) } catch { /* el dueño nuevo lo ve en Mi plan */ }
      }
    }
    return { ok: true, msg: "¡Listo! Ahora eres el dueño del hogar. El plan y borrar el hogar quedan en tus manos." }
  }
  return { ok: true, msg: r.estado === "rechazada" ? "Rechazaste la solicitud. Todo sigue igual en el hogar." : "Esa solicitud ya tenía respuesta." }
}

export async function cancelTransfer(id: string): Promise<Res> {
  if (!z.uuid().safeParse(id).success) return { ok: false, msg: "Esa solicitud no existe." }
  const ctx = await getAppContext()
  const lim = await limitError("pasarHogar", ctx.user.id)
  if (lim) return { ok: false, msg: lim }
  const sb = await supabaseServer()
  const { error } = await sb.rpc("cancel_household_transfer", { p_transfer: id })
  return error ? { ok: false, msg: sql(error) } : { ok: true, msg: "Cancelaste la solicitud. Sigues siendo el dueño del hogar." }
}

// ── Salir o borrar un hogar ───────────────────────────────────────────────────────────────────────────────────

/** Sale de un hogar donde no eres dueño. Los accesos del contador que creaste en ese hogar se cierran. */
export async function leaveHousehold(householdId: string): Promise<Res> {
  if (!z.uuid().safeParse(householdId).success) return { ok: false, msg: "Ese hogar no existe." }
  const { ctx, h, owner } = await ownerOf(householdId)
  if (!h) return { ok: false, msg: "Ya no haces parte de ese hogar." }
  if (owner) return { ok: false, msg: "Eres el dueño: primero pásale el hogar a otra persona o bórralo." }
  const lim = await limitError("borrarHogar", ctx.user.id)
  if (lim) return { ok: false, msg: lim }
  const sb = await supabaseServer()
  const { error } = await sb.rpc("remove_household_member", { p_household: h.id, p_user: ctx.user.id })
  if (error) return { ok: false, msg: sql(error) }
  const db = supabaseAdmin()
  const { data: bs } = await db.from("books").select("id").eq("household_id", h.id)
  if (bs?.length) await db.from("accountant_shares").update({ revoked_at: new Date().toISOString() }).in("book_id", bs.map((b) => b.id)).eq("created_by", ctx.user.id).is("revoked_at", null)
  await logEvent(ctx.user.id, "hogar_salida", { hogar: h.nombre })
  if (h.id === ctx.household.id) (await cookies()).delete(BOOK_COOKIE)
  return { ok: true, msg: `Saliste de “${h.nombre}”. Para volver, alguien tendrá que invitarte de nuevo.` }
}

/** Borra un hogar del que eres dueño (con sus libros y archivos). Pide el nombre escrito y que no tenga un pago automático activo. */
export async function deleteHousehold(householdId: string, confirm: string): Promise<Res> {
  if (!z.uuid().safeParse(householdId).success) return { ok: false, msg: "Ese hogar no existe." }
  const { ctx, h, owner } = await ownerOf(householdId)
  if (!h || !owner) return { ok: false, msg: "Solo el dueño puede borrar el hogar." }
  if (!nameMatches(String(confirm ?? ""), h.nombre)) return { ok: false, msg: "Escribe el nombre del hogar tal como aparece para confirmar." }
  const lim = await limitError("borrarHogar", ctx.user.id)
  if (lim) return { ok: false, msg: lim }
  const db = supabaseAdmin()
  const { data: subs } = await db.from("plan_subscriptions").select("id").eq("household_id", h.id).eq("proveedor", "mercadopago").in("estado", ["activa", "pendiente"])
  if (subs?.length) return { ok: false, msg: "Este hogar tiene una renovación automática del plan. Cancélala primero en Ajustes › Mi plan." }
  await purgeHouseholdFiles(h.id)
  const { error } = await db.from("households").delete().eq("id", h.id)
  if (error) return { ok: false, msg: "No pudimos borrar el hogar. Intenta de nuevo." }
  await logEvent(ctx.user.id, "hogar_borrado", { hogar: h.nombre })
  if (h.id === ctx.household.id) (await cookies()).delete(BOOK_COOKIE)
  return { ok: true, msg: `Borramos “${h.nombre}” con sus libros.` }
}

"use server"

import { randomUUID } from "node:crypto"
import { generateText } from "ai"
import { z } from "zod"
import { requirePlatformAdmin } from "@/lib/dal"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { encrypt, mask } from "@/lib/crypto"
import { INTEGRATIONS, integrationByKind, isAdminOnly } from "@/lib/integrations/registry"
import { modelFrom, aiErrMsg } from "@/lib/ai/model"
import { brandEmail, EMAIL_KINDS, sendEmail } from "@/lib/notify/email"
import { applyPayment } from "@/lib/payments/apply"
import { cancelPreapproval } from "@/lib/payments/mercadopago"
import { siteUrl } from "@/lib/site-url"
import { vigente } from "@/lib/plans"
import { getGlobalIntegration, type IntegrationValue } from "@/features/integrations/store"
import { fetchFestivos, fetchFx, fetchTrm, fetchUsura } from "@/features/integrations/data-sources"
import { fallbackNote, fetchTemplateSpec, sendWhatsApp, whatsappNumber } from "@/lib/notify/channels"
import { testMsg } from "@/lib/notify/digest"
import { logSend } from "@/lib/notify/log"
import { maskDest } from "@/lib/notify/rules"
import { formatCoPhone, normalizeCoPhone } from "@/lib/notify/whatsapp"
import { purgeHouseholdFiles, purgeUserFiles } from "@/features/data/purge"

const DAY = 86_400_000
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString()
const Uuid = z.uuid()

/** Registro de todo lo que se hace en la consola (pestaña Auditoría). */
async function audit(actor: string, accion: string, objetivo: string | null, detalle: Record<string, unknown> = {}) {
  await supabaseAdmin().from("admin_audit").insert({ actor, accion, objetivo, detalle: detalle as never })
}

async function listAllUsers() {
  const db = supabaseAdmin()
  const out: { id: string; email?: string }[] = []
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(error.message)
    out.push(...data.users)
    if (data.users.length < 1000) break
  }
  return out
}

/** Correo de la plataforma (integración global de correo), si hay alguna configurada. */
async function platformEmail() {
  for (const k of EMAIL_KINDS) {
    const g = await getGlobalIntegration(k)
    if (g && g.modo !== "apagada") return { kind: k, enabled: true, config: g.config, secrets: g.secrets }
  }
  return null
}

// ── Usuarios ────────────────────────────────────────────────────────────────────────────────────────────────────

/** Ficha completa de una persona (sin montos: por privacidad la consola no muestra sus finanzas). */
export async function adminUser(id: string) {
  await requirePlatformAdmin()
  const uid = Uuid.parse(id)
  const db = supabaseAdmin()
  const [{ data: au, error }, { data: p }, { data: mem }, { data: acts }, { data: fb }, { data: notes }, { data: adm }] = await Promise.all([
    db.auth.admin.getUserById(uid),
    db.from("profiles").select("nombre,apodo,email,telefono,ciudad,doc_tipo,doc,trabajo,ocupacion,avatar_url,created_at,deletion_requested_at").eq("id", uid).maybeSingle(),
    db.from("household_members").select("role,household_id,households(id,nombre,created_at)").eq("user_id", uid),
    db.from("audit_log").select("tabla,accion,created_at").eq("actor", uid).gte("created_at", ago(90)).order("created_at", { ascending: false }).limit(2000),
    db.from("feedback").select("id,tipo,rating,mensaje,estado,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(50),
    db.from("admin_notes").select("id,texto,autor,created_at").eq("user_id", uid).order("created_at", { ascending: false }),
    db.from("platform_admins").select("user_id").eq("user_id", uid).maybeSingle(),
  ])
  if (error || !au.user) throw new Error("No encontramos a esa persona.")
  const hids = (mem ?? []).map((m) => m.household_id)
  const [{ data: subs }, { data: pays }, { data: books }, { data: members }] = hids.length ? await Promise.all([
    db.from("plan_subscriptions").select("id,household_id,plan,periodo,estado,proveedor,vence_at,nota,created_at").in("household_id", hids).order("created_at", { ascending: false }),
    db.from("plan_payments").select("id,household_id,plan,proveedor,referencia,periodo,monto,estado,metodo,paid_at,created_at,factura_ref,cupon").in("household_id", hids).order("created_at", { ascending: false }).limit(100),
    db.from("books").select("id,household_id,nombre,tipo,deleted_at").in("household_id", hids),
    db.from("household_members").select("household_id,user_id,role").in("household_id", hids),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }]
  const plans = await Promise.all(hids.map(async (h) => [h, (await db.rpc("household_plan", { h })).data ?? "gratis"] as const))
  const porTabla = Object.entries((acts ?? []).filter((a) => a.created_at >= ago(30)).reduce<Record<string, number>>((t, a) => ((t[a.tabla] = (t[a.tabla] ?? 0) + 1), t), {})).sort((a, b) => b[1] - a[1])
  const u = au.user
  return {
    id: uid, email: u.email ?? "", creado: u.created_at, ultimoIngreso: u.last_sign_in_at ?? null, confirmado: !!u.email_confirmed_at,
    acceso: (u.app_metadata.providers as string[] | undefined)?.join(", ") || u.app_metadata.provider || "email", suspendido: !!(u as { banned_until?: string }).banned_until && new Date((u as { banned_until?: string }).banned_until!) > new Date(),
    mfa: (u.factors ?? []).some((f) => f.status === "verified"), terminos: String(u.user_metadata?.acepta_version ?? ""), isAdmin: !!adm,
    perfil: p ? { ...p, doc: p.doc ? `•••${String(p.doc).slice(-4)}` : "" } : null,
    hogares: (mem ?? []).map((m) => {
      const h = m.households as { id: string; nombre: string; created_at: string } | null
      return {
        id: m.household_id, nombre: h?.nombre ?? "Hogar", rol: m.role, creado: h?.created_at ?? null, plan: plans.find((x) => x[0] === m.household_id)?.[1] ?? "gratis",
        integrantes: (members ?? []).filter((x) => x.household_id === m.household_id).length,
        libros: (books ?? []).filter((b) => b.household_id === m.household_id && !b.deleted_at).map((b) => b.nombre),
      }
    }),
    suscripciones: subs ?? [], pagos: pays ?? [],
    actividad: { total30: porTabla.reduce((t, x) => t + x[1], 0), porTabla, ultimas: (acts ?? []).slice(0, 15) },
    opiniones: fb ?? [], notas: notes ?? [],
  }
}

export async function adminSetSuspended(id: string, suspend: boolean) {
  const ctx = await requirePlatformAdmin()
  const uid = Uuid.parse(id)
  if (uid === ctx.user.id) throw new Error("No puedes suspender tu propia cuenta.")
  const { error } = await supabaseAdmin().auth.admin.updateUserById(uid, { ban_duration: suspend ? "876000h" : "none" })
  if (error) throw new Error(error.message)
  await audit(ctx.user.id, suspend ? "suspender usuario" : "reactivar usuario", uid)
}

/** Enlace para crear una contraseña nueva: se envía con el correo de la plataforma o se devuelve para copiarlo. */
export async function adminRecoveryLink(id: string): Promise<{ sent: boolean; link?: string; msg: string }> {
  const ctx = await requirePlatformAdmin()
  const db = supabaseAdmin()
  const { data: u } = await db.auth.admin.getUserById(Uuid.parse(id))
  if (!u.user?.email) throw new Error("La persona no tiene correo.")
  const { data, error } = await db.auth.admin.generateLink({ type: "recovery", email: u.user.email, options: { redirectTo: `${siteUrl()}/auth/callback?next=/actualizar-clave` } })
  if (error) throw new Error(error.message)
  const link = data.properties.action_link
  await audit(ctx.user.id, "enlace de contraseña", id)
  const mail = await platformEmail()
  if (mail) {
    try {
      await sendEmail(mail, { to: u.user.email, subject: "Mirai: crea una contraseña nueva", html: brandEmail("Crea una contraseña nueva", `<p>Nos pediste ayuda para entrar a Mirai. Toca el botón para crear una contraseña nueva.</p><p style="margin-top:20px"><a href="${link}" style="background:#1F2B4B;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Crear contraseña</a></p><p style="color:#616161;font-size:13px">Si no lo pediste, ignora este correo.</p>`) })
      return { sent: true, msg: `Enviamos el enlace a ${u.user.email}.` }
    } catch { /* se devuelve el enlace */ }
  }
  return { sent: false, link, msg: "No hay un correo de la plataforma activo: copia el enlace y compártelo por un canal seguro." }
}

export async function adminSetPlatformAdmin(id: string, on: boolean) {
  const ctx = await requirePlatformAdmin()
  const uid = Uuid.parse(id)
  const db = supabaseAdmin()
  if (!on) {
    if (uid === ctx.user.id) throw new Error("No puedes quitarte a ti mismo.")
    const { count } = await db.from("platform_admins").select("user_id", { count: "exact", head: true })
    if ((count ?? 0) <= 1) throw new Error("Debe quedar al menos un administrador.")
    await db.from("platform_admins").delete().eq("user_id", uid)
  } else await db.from("platform_admins").upsert({ user_id: uid })
  await audit(ctx.user.id, on ? "dar administración" : "quitar administración", uid)
}

/** Elimina la cuenta y los hogares donde era la única persona. Hay que escribir su correo para confirmar. */
export async function adminDeleteUser(id: string, confirmEmail: string) {
  const ctx = await requirePlatformAdmin()
  const uid = Uuid.parse(id)
  if (uid === ctx.user.id) throw new Error("No puedes eliminar tu propia cuenta desde aquí.")
  const db = supabaseAdmin()
  const { data: u } = await db.auth.admin.getUserById(uid)
  if (!u.user || u.user.email?.toLowerCase() !== confirmEmail.trim().toLowerCase()) throw new Error("El correo no coincide.")
  const { data: mem } = await db.from("household_members").select("household_id").eq("user_id", uid)
  for (const m of mem ?? []) {
    const { count } = await db.from("household_members").select("user_id", { count: "exact", head: true }).eq("household_id", m.household_id)
    if ((count ?? 0) <= 1) { await purgeHouseholdFiles(m.household_id); await db.from("households").delete().eq("id", m.household_id) }
  }
  await purgeUserFiles(uid).catch(() => 0)
  const { error } = await db.auth.admin.deleteUser(uid)
  if (error) throw new Error(error.message)
  await audit(ctx.user.id, "eliminar usuario", uid, { email: u.user.email })
}

export async function adminAddNote(userId: string, texto: string) {
  const ctx = await requirePlatformAdmin()
  const t = z.string().trim().min(1).max(2000).parse(texto)
  const { error } = await supabaseAdmin().from("admin_notes").insert({ user_id: Uuid.parse(userId), texto: t, autor: ctx.user.id })
  if (error) throw new Error(error.message)
}

export async function adminDeleteNote(id: string) {
  await requirePlatformAdmin()
  await supabaseAdmin().from("admin_notes").delete().eq("id", Uuid.parse(id))
}

// ── Hogares y planes ────────────────────────────────────────────────────────────────────────────────────────────

export async function adminHouseholds() {
  await requirePlatformAdmin()
  const db = supabaseAdmin()
  const [{ data: hh }, { data: mem }, { data: books }, { data: subs }, { data: profiles }, { data: acts }, { data: admins }] = await Promise.all([
    db.from("households").select("id,nombre,created_at"),
    db.from("household_members").select("household_id,user_id,role"),
    db.from("books").select("household_id").is("deleted_at", null),
    db.from("plan_subscriptions").select("household_id,plan,estado,vence_at,proveedor").in("estado", ["activa", "cancelada", "cortesia"]),
    db.from("profiles").select("id,nombre,email"),
    db.from("audit_log").select("household_id").gte("created_at", ago(30)).limit(50000),
    db.from("platform_admins").select("user_id"),
  ])
  const adminIds = new Set((admins ?? []).map((a) => a.user_id))
  const prof = new Map((profiles ?? []).map((p) => [p.id, p]))
  return (hh ?? []).map((h) => {
    const ms = (mem ?? []).filter((m) => m.household_id === h.id)
    const owner = ms.find((m) => m.role === "owner")
    const sub = (subs ?? []).filter((s) => s.household_id === h.id && vigente(s.vence_at)).sort((a, b) => (b.vence_at ?? "").localeCompare(a.vence_at ?? ""))[0]
    return {
      id: h.id, nombre: h.nombre, creado: h.created_at, integrantes: ms.length, libros: (books ?? []).filter((b) => b.household_id === h.id).length,
      dueno: owner ? { id: owner.user_id, nombre: prof.get(owner.user_id)?.nombre ?? "", email: prof.get(owner.user_id)?.email ?? "" } : null,
      plan: sub?.plan ?? (owner && adminIds.has(owner.user_id) ? "premium" : "gratis"), vence: sub?.vence_at ?? null, proveedor: sub?.proveedor ?? null,
      acciones30: (acts ?? []).filter((a) => a.household_id === h.id).length,
    }
  }).filter((h) => h.integrantes > 0).sort((a, b) => b.creado.localeCompare(a.creado))
}

/** Asigna un plan a un hogar hasta una fecha (cortesía, convenio o pago por fuera). */
export async function adminAssignPlan(householdId: string, plan: string, hasta: string, nota: string) {
  const ctx = await requirePlatformAdmin()
  const d = z.object({ h: Uuid, plan: z.string().regex(/^[a-z0-9-]{2,30}$/), hasta: z.iso.date(), nota: z.string().trim().max(200) }).parse({ h: householdId, plan, hasta, nota })
  if (new Date(d.hasta) <= new Date()) throw new Error("La fecha debe ser futura.")
  const db = supabaseAdmin()
  const { data: pl } = await db.from("plans").select("nombre").eq("id", d.plan).maybeSingle()
  if (!pl) throw new Error("Ese plan no existe.")
  const { error } = await db.from("plan_subscriptions").insert({ household_id: d.h, plan: d.plan, proveedor: "manual", estado: "cortesia", periodo: "mes", vence_at: new Date(`${d.hasta}T23:59:59-05:00`).toISOString(), nota: d.nota || null, created_by: ctx.user.id })
  if (error) throw new Error(error.message)
  const { data: owners } = await db.from("household_members").select("user_id").eq("household_id", d.h).eq("role", "owner")
  if (owners?.length) await db.from("notifications").insert(owners.map((o) => ({ user_id: o.user_id, kind: "plan", titulo: `¡Tienes Mirai ${pl.nombre}!`, cuerpo: `Disfrútalo hasta el ${new Date(`${d.hasta}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })}.`, href: "/ajustes?tab=plan", dedupe: `assign-${d.h}-${Date.now()}` })))
  await audit(ctx.user.id, "asignar plan", d.h, { plan: d.plan, hasta: d.hasta, nota: d.nota })
}

// ── Suscripciones ───────────────────────────────────────────────────────────────────────────────────────────────

export async function adminSubscriptions() {
  await requirePlatformAdmin()
  const db = supabaseAdmin()
  const [{ data: subs }, { data: hh }] = await Promise.all([
    db.from("plan_subscriptions").select("*").order("created_at", { ascending: false }).limit(2000),
    db.from("households").select("id,nombre"),
  ])
  const n = new Map((hh ?? []).map((h) => [h.id, h.nombre]))
  return (subs ?? []).map((s) => ({ ...s, hogar: n.get(s.household_id) ?? "Hogar eliminado", vigente: vigente(s.vence_at) && s.estado !== "pendiente" }))
}

export async function adminUpdateSubscription(id: string, action: { kind: "extender"; dias: number } | { kind: "plan"; plan: string } | { kind: "cancelar" } | { kind: "terminar" }) {
  const ctx = await requirePlatformAdmin()
  const db = supabaseAdmin()
  const { data: s } = await db.from("plan_subscriptions").select("*").eq("id", Uuid.parse(id)).single()
  if (!s) throw new Error("No existe esa suscripción.")
  if (action.kind === "extender") {
    const dias = z.number().int().min(1).max(3650).parse(action.dias)
    const base = s.vence_at && new Date(s.vence_at) > new Date() ? new Date(s.vence_at) : new Date()
    await db.from("plan_subscriptions").update({ vence_at: new Date(base.getTime() + dias * DAY).toISOString(), estado: s.estado === "vencida" || s.estado === "pendiente" ? "cortesia" : s.estado }).eq("id", s.id)
  } else if (action.kind === "plan") {
    await db.from("plan_subscriptions").update({ plan: z.string().regex(/^[a-z0-9-]{2,30}$/).parse(action.plan) }).eq("id", s.id)
  } else if (action.kind === "cancelar") {
    if (s.proveedor === "mercadopago" && s.proveedor_ref) await cancelPreapproval(s.proveedor_ref)
    await db.from("plan_subscriptions").update({ estado: "cancelada" }).eq("id", s.id)
  } else {
    if (s.proveedor === "mercadopago" && s.proveedor_ref && s.estado === "activa") await cancelPreapproval(s.proveedor_ref).catch(() => null)
    await db.from("plan_subscriptions").update({ estado: "vencida", vence_at: new Date(Date.now() - 4 * DAY).toISOString() }).eq("id", s.id)
  }
  await audit(ctx.user.id, `suscripción: ${action.kind}`, s.household_id, { sub: s.id, ...action })
}

// ── Pagos ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Registra un pago hecho por fuera (transferencia, efectivo, convenio) y extiende el plan del hogar. */
export async function adminManualPayment(input: { householdId: string; plan: string; periodo: "mes" | "anio"; monto: number; nota: string }) {
  const ctx = await requirePlatformAdmin()
  const d = z.object({ householdId: Uuid, plan: z.string().regex(/^[a-z0-9-]{2,30}$/), periodo: z.enum(["mes", "anio"]), monto: z.number().int().min(0).max(100_000_000), nota: z.string().trim().max(300) }).parse(input)
  const ref = `manual-${randomUUID()}`
  await applyPayment({ householdId: d.householdId, proveedor: "manual", referencia: ref, periodo: d.periodo, monto: d.monto, estado: "aprobado", metodo: "registrado por Mirai", plan: d.plan, nota: d.nota || null })
  await audit(ctx.user.id, "registrar pago manual", d.householdId, { ...d, ref })
}

export async function adminUpdatePayment(id: string, patch: { estado?: "reembolsado" | "anulado"; factura_ref?: string; nota?: string }) {
  const ctx = await requirePlatformAdmin()
  const p = z.object({ estado: z.enum(["reembolsado", "anulado"]).optional(), factura_ref: z.string().trim().max(80).optional(), nota: z.string().trim().max(300).optional() }).parse(patch)
  const { error } = await supabaseAdmin().from("plan_payments").update(p).eq("id", Uuid.parse(id))
  if (error) throw new Error(error.message)
  await audit(ctx.user.id, "actualizar pago", id, p)
}

// ── Comunicados ─────────────────────────────────────────────────────────────────────────────────────────────────

/** Aviso en la app (y por correo, si hay correo de la plataforma y se pide) a un segmento de personas. */
export async function adminBroadcast(input: { titulo: string; cuerpo: string; href: string; segmento: string; correo: boolean }) {
  const ctx = await requirePlatformAdmin()
  const d = z.object({ titulo: z.string().trim().min(2).max(120), cuerpo: z.string().trim().max(1000), href: z.string().trim().max(200), segmento: z.string().regex(/^(todos|admins|plan:[a-z0-9-]{2,30})$/), correo: z.boolean() }).parse(input)
  const db = supabaseAdmin()
  let ids: string[] = []
  if (d.segmento === "admins") ids = ((await db.from("platform_admins").select("user_id")).data ?? []).map((a) => a.user_id)
  else {
    const { data: mem } = await db.from("household_members").select("user_id,household_id")
    if (d.segmento === "todos") ids = [...new Set((mem ?? []).map((m) => m.user_id))]
    else {
      const plan = d.segmento.slice(5)
      const hids = [...new Set((mem ?? []).map((m) => m.household_id))]
      const keep = new Set<string>()
      for (const h of hids) if (((await db.rpc("household_plan", { h })).data ?? "gratis") === plan) keep.add(h)
      ids = [...new Set((mem ?? []).filter((m) => keep.has(m.household_id)).map((m) => m.user_id))]
    }
  }
  const tag = `bc-${randomUUID()}`
  for (let i = 0; i < ids.length; i += 500) {
    await db.from("notifications").insert(ids.slice(i, i + 500).map((user_id) => ({ user_id, kind: "sistema", titulo: d.titulo, cuerpo: d.cuerpo, href: d.href || null, dedupe: tag })))
  }
  let correos = 0
  if (d.correo) {
    const mail = await platformEmail()
    if (!mail) throw new Error("Se enviaron los avisos en la app, pero no hay un correo de la plataforma activo para enviar por correo.")
    const { data: profs } = await db.from("profiles").select("email").in("id", ids.slice(0, 2000))
    for (const p of profs ?? []) { if (!p.email) continue; try { await sendEmail(mail, { to: p.email, subject: d.titulo, html: brandEmail(d.titulo, `<p>${d.cuerpo.replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>${d.href ? `<p style="margin-top:20px"><a href="${siteUrl()}${d.href.startsWith("/") ? d.href : `/${d.href}`}" style="background:#1F2B4B;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Abrir Mirai</a></p>` : ""}`) }); correos++ } catch { /* sigue */ } }
  }
  await db.from("broadcasts").insert({ titulo: d.titulo, cuerpo: d.cuerpo, href: d.href || null, segmento: d.segmento, enviados: ids.length, created_by: ctx.user.id })
  await audit(ctx.user.id, "enviar comunicado", d.segmento, { titulo: d.titulo, personas: ids.length, correos })
  return { personas: ids.length, correos }
}

// ── Administradores, auditoría y sistema ────────────────────────────────────────────────────────────────────────

export async function adminAdmins() {
  await requirePlatformAdmin()
  const db = supabaseAdmin()
  const { data } = await db.from("platform_admins").select("user_id,created_at")
  const ids = (data ?? []).map((a) => a.user_id)
  const { data: profs } = ids.length ? await db.from("profiles").select("id,nombre,email,avatar_url").in("id", ids) : { data: [] }
  return (data ?? []).map((a) => ({ ...a, perfil: (profs ?? []).find((p) => p.id === a.user_id) ?? null }))
}

export async function adminAddAdminByEmail(email: string) {
  const ctx = await requirePlatformAdmin()
  const e = z.email().parse(email.trim().toLowerCase())
  const u = (await listAllUsers()).find((x) => x.email?.toLowerCase() === e)
  if (!u) throw new Error("No hay ninguna cuenta de Mirai con ese correo. La persona debe registrarse primero.")
  await supabaseAdmin().from("platform_admins").upsert({ user_id: u.id })
  await audit(ctx.user.id, "dar administración", u.id, { email: e })
}

export async function adminAuditLog() {
  await requirePlatformAdmin()
  const db = supabaseAdmin()
  const { data } = await db.from("admin_audit").select("*").order("created_at", { ascending: false }).limit(500)
  const ids = [...new Set((data ?? []).map((a) => a.actor).filter(Boolean))] as string[]
  const { data: profs } = ids.length ? await db.from("profiles").select("id,nombre,email").in("id", ids) : { data: [] }
  return (data ?? []).map((a) => ({ ...a, quien: (profs ?? []).find((p) => p.id === a.actor)?.nombre || (profs ?? []).find((p) => p.id === a.actor)?.email || "—" }))
}

export async function adminSystem() {
  await requirePlatformAdmin()
  const db = supabaseAdmin()
  const [{ data: settings }, { data: migr }, orphans, { count: referidos }, { count: premiados }] = await Promise.all([
    db.from("platform_settings").select("*").single(),
    db.rpc("admin_migrations"),
    db.rpc("count_orphan_households"),
    db.from("referrals").select("id", { count: "exact", head: true }),
    db.from("referrals").select("id", { count: "exact", head: true }).eq("estado", "recompensado"),
  ])

  const env = (k: string) => !!process.env[k]
  const { data: ads } = await db.from("platform_integrations").select("modo").eq("kind", "adsense").maybeSingle()
  return {
    settings, migraciones: migr ?? [], huerfanos: Number(orphans.data ?? 0), referidos: referidos ?? 0, premiados: premiados ?? 0,
    estado: [
      { k: "Supabase (servicio)", ok: env("SUPABASE_SECRET_KEY") }, { k: "Cifrado de claves", ok: env("ENCRYPTION_KEY") }, { k: "Cron de avisos", ok: env("CRON_SECRET") },
      { k: "Google (Gmail y Calendar)", ok: env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET") }, { k: "Vercel AI Gateway", ok: env("AI_GATEWAY_API_KEY") },
      { k: "Notificaciones push (VAPID)", ok: env("NEXT_PUBLIC_VAPID_PUBLIC_KEY") && env("VAPID_PRIVATE_KEY") },
      { k: "Mercado Pago", ok: env("MERCADOPAGO_ACCESS_TOKEN") }, { k: "Webhook Mercado Pago firmado", ok: env("MERCADOPAGO_WEBHOOK_SECRET") },
      { k: "Wompi", ok: env("NEXT_PUBLIC_WOMPI_PUBLIC_KEY") && env("WOMPI_INTEGRITY_SECRET") }, { k: "Eventos Wompi firmados", ok: env("WOMPI_EVENTS_SECRET") },
      { k: "Google AdSense", ok: (!!ads && ads.modo !== "apagada") || (env("NEXT_PUBLIC_ADSENSE_CLIENT") && env("NEXT_PUBLIC_ADSENSE_SLOT")) }, { k: "Dirección del sitio", ok: env("NEXT_PUBLIC_SITE_URL") || env("VERCEL_PROJECT_PRODUCTION_URL") },
    ],
    ambiente: process.env.VERCEL_ENV ?? "local", rama: process.env.VERCEL_GIT_COMMIT_REF ?? "local", commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7),
  }
}

const Settings = z.object({
  aviso_global: z.string().trim().max(300).optional(), aviso_tono: z.enum(["info", "warn", "ok"]).optional(), registro_abierto: z.boolean().optional(), limites_db: z.boolean().optional(), premium_db: z.boolean().optional(),
  referidos_activo: z.boolean().optional(), referidos_plan: z.string().regex(/^[a-z0-9-]{2,30}$/).optional(), referidos_dias: z.number().int().min(1).max(365).optional(),
})

export async function adminSaveSettings(patch: z.input<typeof Settings>) {
  const ctx = await requirePlatformAdmin()
  const p = Settings.parse(patch)
  const { error } = await supabaseAdmin().from("platform_settings").update({ ...p, updated_at: new Date().toISOString() }).eq("id", true)
  if (error) throw new Error(error.message)
  await audit(ctx.user.id, "ajustes de la plataforma", null, p)
}

export async function adminCleanOrphanHouseholds() {
  const ctx = await requirePlatformAdmin()
  const { data, error } = await supabaseAdmin().rpc("delete_orphan_households")
  if (error) throw new Error(error.message)
  await audit(ctx.user.id, "borrar hogares vacíos", null, { borrados: data })
  return Number(data ?? 0)
}

// ── Integraciones globales ──────────────────────────────────────────────────────────────────────────────────────

export async function adminGlobalIntegrations() {
  await requirePlatformAdmin()
  const db = supabaseAdmin()
  const [{ data: rows }, { data: own }] = await Promise.all([
    db.from("platform_integrations").select("kind,modo,planes,config,meta,updated_at,secrets_enc"),
    db.from("integrations").select("kind,enabled"),
  ])
  return INTEGRATIONS.map((def) => {
    const r = (rows ?? []).find((x) => x.kind === def.kind)
    const mine = (own ?? []).filter((x) => x.kind === def.kind)
    return { kind: def.kind, modo: (r?.modo ?? "apagada") as string, planes: r?.planes ?? [], config: (r?.config ?? {}) as Record<string, unknown>, meta: (r?.meta ?? {}) as Record<string, unknown>, updated_at: r?.updated_at ?? null, hogaresPropios: mine.filter((x) => x.enabled).length, hogaresApagada: mine.filter((x) => !x.enabled).length, env: !!(def.env && process.env[def.env]), adminOnly: isAdminOnly(def), existe: !!r, guardada: !!r?.secrets_enc || Object.keys((r?.config ?? {}) as object).length > 0 }
  })
}

/** Guarda una integración global. Los errores que el administrador debe leer se devuelven (en producción Next oculta los de un throw). */
export async function adminSaveGlobalIntegration(kind: string, input: { modo: string; planes: string[]; values: Record<string, string | number | boolean> }): Promise<{ ok: boolean; msg?: string; warn?: string }> {
  const ctx = await requirePlatformAdmin()
  const def = integrationByKind(kind)
  if (!def) throw new Error("Integración desconocida")
  const modo = z.enum(["apagada", "opcional", "por_defecto", "obligatoria"]).parse(input.modo)
  const planes = z.array(z.string().regex(/^[a-z0-9-]{2,30}$/)).max(20).parse(input.planes)
  const db = supabaseAdmin()
  const prev = await getGlobalIntegration(kind)
  const config: Record<string, unknown> = { ...(prev?.config ?? {}) }
  const secrets: Record<string, string> = { ...(prev?.secrets ?? {}) }
  const meta: Record<string, unknown> = {}
  for (const f of def.fields) {
    const v = input.values[f.k]
    if (f.type === "secret") { if (typeof v === "string" && v.trim()) secrets[f.k] = v.trim(); if (secrets[f.k]) meta[f.k] = mask(secrets[f.k]) }
    else if (v !== undefined) config[f.k] = v
    else if (config[f.k] === undefined && f.def !== undefined) config[f.k] = f.def
  }
  const missing = def.fields.filter((f) => f.required && !(f.type === "secret" ? secrets[f.k] || (def.env && process.env[def.env]) : config[f.k]))
  if (modo !== "apagada" && missing.length) return { ok: false, msg: `Falta: ${missing.map((f) => f.l).join(", ")}` }
  if (kind === "adsense" && modo !== "apagada") {
    if (!/^ca-pub-\d{10,20}$/.test(String(config.client ?? "").trim())) return { ok: false, msg: "El id de cliente debe verse así: ca-pub-1234567890123456" }
    if (!/^\d{6,20}$/.test(String(config.slot ?? "").trim())) return { ok: false, msg: "El id del bloque de anuncios debe ser solo números." }
    config.client = String(config.client).trim(); config.slot = String(config.slot).trim()
  }
  let warn: string | undefined
  if (kind === "whatsapp") {
    for (const k of ["phoneId", "wabaId", "template", "lang"]) if (typeof config[k] === "string") config[k] = String(config[k]).trim()
    if (config.phoneId && !/^\d{6,25}$/.test(String(config.phoneId))) return { ok: false, msg: "El ID del número de teléfono son solo números (Phone number ID)." }
    if (config.wabaId && !/^\d{6,25}$/.test(String(config.wabaId))) return { ok: false, msg: "El ID de la cuenta de WhatsApp Business son solo números." }
    delete config.tplSpec
    // Con la cuenta de WhatsApp Business se lee de Meta la plantilla por defecto (estructura, idioma y estado).
    if (config.template && config.wabaId && secrets.token) {
      try {
        const spec = await fetchTemplateSpec({ kind, enabled: true, config, secrets })
        if (spec) config.lang = spec.lang
      } catch (e) { warn = `Guardado, pero no pudimos leer la plantilla: ${(e as Error).message}` }
    } else if (config.template) warn = "Guardado. Sin el ID de la cuenta de WhatsApp Business, Mirai envía la plantilla con un solo parámetro (el resumen) y no puede administrar plantillas."
  }
  const { error } = await db.from("platform_integrations").upsert({ kind, modo, planes, config: config as never, meta: meta as never, secrets_enc: Object.keys(secrets).length ? encrypt(JSON.stringify(secrets)) : null, updated_by: ctx.user.id, updated_at: new Date().toISOString() })
  if (error) return { ok: false, msg: "No se pudo guardar. Intenta de nuevo." }
  await audit(ctx.user.id, "integración global", kind, { modo, planes })
  return { ok: true, warn }
}

/** Prueba la integración global (IA: una respuesta corta; correo: te envía uno; Telegram y WhatsApp: validan la cuenta; datos: una consulta). */
export async function adminTestGlobal(kind: string): Promise<{ ok: boolean; msg: string }> {
  const ctx = await requirePlatformAdmin()
  const g = await getGlobalIntegration(kind)
  const def = integrationByKind(kind)
  if (!def) return { ok: false, msg: "Integración desconocida." }
  const v: IntegrationValue = { kind, enabled: true, config: g?.config ?? {}, secrets: g?.secrets ?? {} }
  const keyless = !def.fields.some((f) => f.required)
  if (!g && !keyless) return { ok: false, msg: "Primero guarda la configuración." }
  const meta = async (lastOk: boolean, lastMsg: string) => {
    if (!g) return
    const { data } = await supabaseAdmin().from("platform_integrations").select("meta").eq("kind", kind).single()
    await supabaseAdmin().from("platform_integrations").update({ meta: { ...(data?.meta as object), lastTest: new Date().toISOString(), lastOk, lastMsg } as never }).eq("kind", kind)
  }
  try {
    let msg = "Esta integración no necesita prueba."
    if (def.cat === "ia") { const { text } = await generateText({ model: modelFrom(v), prompt: "Responde solo con la palabra: listo", maxOutputTokens: 20 }); msg = `Conexión exitosa. Respondió: “${text.trim().slice(0, 40)}”.` }
    else if (EMAIL_KINDS.includes(kind)) {
      const ref = await sendEmail(v, { to: ctx.user.email, subject: "Mirai: prueba del correo de la plataforma", html: brandEmail("El correo de la plataforma funciona", "<p>Desde ahora Mirai puede enviar avisos con esta cuenta.</p>") })
      await logSend({ user_id: ctx.user.id, channel: "email", kind: "prueba_admin", status: "enviado", provider: kind, source: "plataforma", destino: maskDest("email", ctx.user.email), ref })
      msg = `Te enviamos un correo de prueba a ${ctx.user.email}.`
    }
    else if (kind === "telegram") { const r = await fetch(`https://api.telegram.org/bot${v.secrets.botToken}/getMe`).then((x) => x.json()); if (!r.ok) throw new Error("401 token inválido"); msg = `Bot conectado: @${r.result.username}.` }
    else if (kind === "whatsapp") {
      const n = await whatsappNumber(v)
      msg = `Número conectado: ${n.display_phone_number ?? "?"}${n.verified_name ? ` (${n.verified_name})` : ""}${n.quality_rating ? ` · calidad ${n.quality_rating}` : ""}.`
      if (v.config.template) {
        const spec = await fetchTemplateSpec(v).catch((e) => { msg += ` ${(e as Error).message}`; return null })
        if (spec) msg += ` Plantilla "${spec.name}" aprobada en ${spec.lang} con ${spec.body.length} parámetro${spec.body.length === 1 ? "" : "s"} en el cuerpo.`
      }
    }
    else if (kind === "trm") { const t = await fetchTrm(); msg = `TRM de hoy: $${t.valor.toLocaleString("es-CO")} (vigente desde ${t.fecha}).` }
    else if (kind === "usura") { const u = await fetchUsura(); msg = `Tasa de usura vigente: ${u.usura.toFixed(2).replace(".", ",")} % E.A.` }
    else if (kind === "festivos") { const f = await fetchFestivos(new Date().getFullYear()); msg = `${f.length} festivos encontrados este año.` }
    else if (kind === "fx") { const r = await fetchFx(); msg = `1 USD = $${Math.round(r.USD).toLocaleString("es-CO")} · 1 EUR = $${Math.round(r.EUR).toLocaleString("es-CO")}.` }
    else if (kind === "coingecko") {
      const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=cop", { headers: v.secrets.apiKey ? { "x-cg-demo-api-key": v.secrets.apiKey } : {} }).then((x) => x.json())
      msg = `1 BTC = $${Math.round(r.bitcoin.cop).toLocaleString("es-CO")}.`
    }
    else if (kind === "stocks") {
      const key = v.secrets.apiKey
      const url = v.config.provider === "twelvedata" ? `https://api.twelvedata.com/price?symbol=SPY&apikey=${key}` : `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=SPY&apikey=${key}`
      const r = await fetch(url).then((x) => x.json())
      const p = r.price ?? r["Global Quote"]?.["05. price"]
      if (!p) throw new Error(r.message ?? r.Note ?? r.Information ?? "invalid api key")
      msg = `SPY = US$${Number(p).toFixed(2)}.`
    }
    await meta(true, msg)
    return { ok: true, msg }
  } catch (e) {
    const msg = aiErrMsg(e, def.url)
    if (EMAIL_KINDS.includes(kind)) await logSend({ user_id: ctx.user.id, channel: "email", kind: "prueba_admin", status: "fallido", provider: kind, source: "plataforma", destino: maskDest("email", ctx.user.email), error: msg })
    await meta(false, msg)
    return { ok: false, msg }
  }
}

/** Destinos sugeridos para "Enviar prueba": tu correo y el WhatsApp que guardaste en Ajustes › Alertas. */
export async function adminTestDefaults(): Promise<{ email: string; whatsapp: string }> {
  const ctx = await requirePlatformAdmin()
  const { data } = await supabaseAdmin().from("notification_rules").select("whatsapp_to").eq("user_id", ctx.user.id).not("whatsapp_to", "is", null).limit(1).maybeSingle()
  return { email: ctx.user.email, whatsapp: data?.whatsapp_to ?? "" }
}

/**
 * "Enviar prueba" de la consola: un mensaje real con la configuración global (aunque esté apagada, para probar antes
 * de activarla) al destino que escribas. Queda en el registro de envíos. Errores legibles en { ok: false, msg }.
 */
export async function adminSendTest(kind: string, to: string): Promise<{ ok: boolean; msg: string }> {
  const ctx = await requirePlatformAdmin()
  const isMail = EMAIL_KINDS.includes(kind)
  if (!isMail && kind !== "whatsapp") return { ok: false, msg: "Solo correo y WhatsApp tienen envío de prueba." }
  const channel = isMail ? "email" : "whatsapp"
  const dest = to.trim()
  if (isMail && !z.email().safeParse(dest).success) return { ok: false, msg: "Escribe un correo válido." }
  if (!isMail && !normalizeCoPhone(dest)) return { ok: false, msg: "Escribe un celular de Colombia de 10 dígitos (por ejemplo 315 123 4567)." }
  const g = await getGlobalIntegration(kind)
  if (!g) return { ok: false, msg: "Primero guarda la configuración." }
  const v: IntegrationValue = { kind, enabled: true, config: g.config, secrets: g.secrets, source: "plataforma" }
  const m = testMsg(ctx.user.nombre)
  const base = { user_id: ctx.user.id, channel, kind: "prueba_admin", provider: kind, source: "plataforma", destino: maskDest(channel, isMail ? dest : normalizeCoPhone(dest)) } as const
  try {
    let msg: string, ref: string | null
    if (isMail) { ref = await sendEmail(v, { to: dest, subject: m.subject, html: m.html, text: m.text }); msg = `Correo de prueba enviado a ${dest}.` }
    else { const r = await sendWhatsApp(v, dest, m.wa, { caso: m.caso, text: m.text }); ref = r.id; msg = `WhatsApp de prueba enviado a ${formatCoPhone(r.to)}${r.id ? ` (id ${r.id.slice(-12)})` : ""}.${r.fallback ? ` ${fallbackNote(r.fallback)}` : ""} Si no llega en un minuto, revisa el registro de envíos.` }
    await logSend({ ...base, status: "enviado", ref })
    await audit(ctx.user.id, "envío de prueba", kind, { destino: base.destino })
    return { ok: true, msg }
  } catch (e) {
    const msg = (e as Error).message || "Error desconocido"
    await logSend({ ...base, status: "fallido", error: msg })
    return { ok: false, msg }
  }
}

/** Registro de envíos (últimos 500): canal, estado, destino enmascarado y error. Sin el contenido de los mensajes. */
export async function adminNotifyLog() {
  await requirePlatformAdmin()
  const db = supabaseAdmin()
  const { data } = await db.from("notification_log").select("*").order("created_at", { ascending: false }).limit(500)
  const ids = [...new Set((data ?? []).map((r) => r.user_id).filter(Boolean))] as string[]
  const { data: people } = ids.length ? await db.from("profiles").select("id,email,nombre").in("id", ids) : { data: [] }
  const who = new Map((people ?? []).map((p) => [p.id, p.nombre || p.email || "—"]))
  return (data ?? []).map((r) => ({ ...r, quien: r.user_id ? who.get(r.user_id) ?? "—" : "Sistema" }))
}

/** Invita a una persona por correo (Supabase envía el enlace para crear su cuenta). */
export async function adminInviteUser(email: string, nombre: string) {
  const ctx = await requirePlatformAdmin()
  const e = z.email("Correo inválido").parse(email.trim().toLowerCase())
  const n = z.string().trim().max(80).parse(nombre)
  const { error } = await supabaseAdmin().auth.admin.inviteUserByEmail(e, { data: { nombre: n }, redirectTo: `${siteUrl()}/auth/callback?next=/bienvenida` })
  if (error) throw new Error(/already/i.test(error.message) ? "Ya existe una cuenta con ese correo." : error.message)
  await audit(ctx.user.id, "invitar persona", e, { nombre: n })
}

"use server"

import { randomUUID } from "node:crypto"
import { generateText } from "ai"
import { z } from "zod"
import { requirePlatformAdmin } from "@/lib/dal"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { encrypt, mask } from "@/lib/crypto"
import { INTEGRATIONS, integrationByKind } from "@/lib/integrations/registry"
import { modelFrom, aiErrMsg } from "@/lib/ai/model"
import { brandEmail, EMAIL_KINDS, sendEmail } from "@/lib/notify/email"
import { applyPayment } from "@/lib/payments/apply"
import { cancelPreapproval } from "@/lib/payments/mercadopago"
import { siteUrl } from "@/lib/site-url"
import { vigente } from "@/lib/plans"
import { getGlobalIntegration } from "@/features/integrations/store"

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
    if ((count ?? 0) <= 1) await db.from("households").delete().eq("id", m.household_id)
  }
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
  const [{ data: settings }, { data: migr }, orphans] = await Promise.all([
    db.from("platform_settings").select("*").single(),
    db.rpc("admin_migrations"),
    db.rpc("count_orphan_households"),
  ])
  const env = (k: string) => !!process.env[k]
  return {
    settings, migraciones: migr ?? [], huerfanos: Number(orphans.data ?? 0),
    estado: [
      { k: "Supabase (servicio)", ok: env("SUPABASE_SECRET_KEY") }, { k: "Cifrado de claves", ok: env("ENCRYPTION_KEY") }, { k: "Cron de avisos", ok: env("CRON_SECRET") },
      { k: "Google (Gmail y Calendar)", ok: env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET") }, { k: "Vercel AI Gateway", ok: env("AI_GATEWAY_API_KEY") },
      { k: "Notificaciones push (VAPID)", ok: env("NEXT_PUBLIC_VAPID_PUBLIC_KEY") && env("VAPID_PRIVATE_KEY") },
      { k: "Mercado Pago", ok: env("MERCADOPAGO_ACCESS_TOKEN") }, { k: "Webhook Mercado Pago firmado", ok: env("MERCADOPAGO_WEBHOOK_SECRET") },
      { k: "Wompi", ok: env("NEXT_PUBLIC_WOMPI_PUBLIC_KEY") && env("WOMPI_INTEGRITY_SECRET") }, { k: "Eventos Wompi firmados", ok: env("WOMPI_EVENTS_SECRET") },
      { k: "Google AdSense", ok: env("NEXT_PUBLIC_ADSENSE_CLIENT") && env("NEXT_PUBLIC_ADSENSE_SLOT") }, { k: "Dirección del sitio", ok: env("NEXT_PUBLIC_SITE_URL") || env("VERCEL_PROJECT_PRODUCTION_URL") },
    ],
    ambiente: process.env.VERCEL_ENV ?? "local", rama: process.env.VERCEL_GIT_COMMIT_REF ?? "local", commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7),
  }
}

const Settings = z.object({ aviso_global: z.string().trim().max(300).optional(), aviso_tono: z.enum(["info", "warn", "ok"]).optional(), registro_abierto: z.boolean().optional(), limites_db: z.boolean().optional() })

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
    db.from("platform_integrations").select("kind,modo,planes,config,meta,updated_at"),
    db.from("integrations").select("kind,enabled"),
  ])
  return INTEGRATIONS.map((def) => {
    const r = (rows ?? []).find((x) => x.kind === def.kind)
    const mine = (own ?? []).filter((x) => x.kind === def.kind)
    return { kind: def.kind, modo: (r?.modo ?? "apagada") as string, planes: r?.planes ?? [], config: (r?.config ?? {}) as Record<string, unknown>, meta: (r?.meta ?? {}) as Record<string, unknown>, updated_at: r?.updated_at ?? null, hogaresPropios: mine.filter((x) => x.enabled).length, hogaresApagada: mine.filter((x) => !x.enabled).length, env: !!(def.env && process.env[def.env]) }
  })
}

export async function adminSaveGlobalIntegration(kind: string, input: { modo: string; planes: string[]; values: Record<string, string | number | boolean> }) {
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
  if (modo !== "apagada" && missing.length) throw new Error(`Falta: ${missing.map((f) => f.l).join(", ")}`)
  const { error } = await db.from("platform_integrations").upsert({ kind, modo, planes, config: config as never, meta: meta as never, secrets_enc: Object.keys(secrets).length ? encrypt(JSON.stringify(secrets)) : null, updated_by: ctx.user.id, updated_at: new Date().toISOString() })
  if (error) throw new Error(error.message)
  await audit(ctx.user.id, "integración global", kind, { modo, planes })
}

/** Prueba la integración global (IA: una respuesta corta; correo: te envía uno; Telegram: valida el bot). */
export async function adminTestGlobal(kind: string): Promise<{ ok: boolean; msg: string }> {
  const ctx = await requirePlatformAdmin()
  const g = await getGlobalIntegration(kind)
  const def = integrationByKind(kind)
  if (!g || !def) return { ok: false, msg: "Primero guarda la configuración." }
  const v = { kind, enabled: true, config: g.config, secrets: g.secrets }
  try {
    let msg = "Esta integración no necesita prueba."
    if (def.cat === "ia") { const { text } = await generateText({ model: modelFrom(v), prompt: "Responde solo con la palabra: listo", maxOutputTokens: 20 }); msg = `Conexión exitosa. Respondió: “${text.trim().slice(0, 40)}”.` }
    else if (EMAIL_KINDS.includes(kind)) { await sendEmail(v, { to: ctx.user.email, subject: "Mirai: prueba del correo de la plataforma", html: brandEmail("El correo de la plataforma funciona", "<p>Desde ahora Mirai puede enviar avisos con esta cuenta.</p>") }); msg = `Te enviamos un correo de prueba a ${ctx.user.email}.` }
    else if (kind === "telegram") { const r = await fetch(`https://api.telegram.org/bot${g.secrets.botToken}/getMe`).then((x) => x.json()); if (!r.ok) throw new Error("401 token inválido"); msg = `Bot conectado: @${r.result.username}.` }
    await supabaseAdmin().from("platform_integrations").update({ meta: { ...(await supabaseAdmin().from("platform_integrations").select("meta").eq("kind", kind).single()).data?.meta as object, lastTest: new Date().toISOString(), lastOk: true, lastMsg: msg } as never }).eq("kind", kind)
    return { ok: true, msg }
  } catch (e) {
    const msg = aiErrMsg(e, def.url)
    await supabaseAdmin().from("platform_integrations").update({ meta: { ...(await supabaseAdmin().from("platform_integrations").select("meta").eq("kind", kind).single()).data?.meta as object, lastTest: new Date().toISOString(), lastOk: false, lastMsg: msg } as never }).eq("kind", kind)
    return { ok: false, msg }
  }
}

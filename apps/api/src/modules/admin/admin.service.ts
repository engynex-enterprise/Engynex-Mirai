// Consola de la plataforma (F2-I-5). Las rutas llevan @PlatformAdmin (lo revisa PlatformAdminGuard) y TODO comando
// queda en `admin_audit` (también los que la web no auditaba: notas, cortesías y opiniones). Mismas reglas y mensajes
// que features/admin/server.ts y actions.ts de apps/web. Por privacidad nunca lee montos ni movimientos de los libros.
import { randomUUID } from "node:crypto"
import { Injectable } from "@nestjs/common"
import type { UserDetail } from "@mirai/contracts/modules/admin"
import { vigente } from "@mirai/domain/plans"
import { integrationFromEnv } from "@mirai/services/integrations/env"
import { INTEGRATIONS, integrationByKind } from "@mirai/services/integrations/registry"
import { EMAIL_KINDS } from "@mirai/services/notify/email-kinds"
import { AppConfig } from "../../core/config/app-config"
import { RequestContextService } from "../../core/context/request-context.service"
import { systemScope } from "../../core/db/scope"
import { DomainError } from "../../core/errors/domain-error"
import { IdentityAdmin, type AdminUser } from "../account/identity-admin"
import { BillingService } from "../billing/billing.service"
import { MercadoPagoClient } from "../billing/mercadopago.client"
import { HouseholdAccess } from "../households/household-access"
import { StoragePurge } from "../households/ports"
import { SiteUrl } from "../households/site-url"
import { AdminRepo } from "./admin.repository"
import { accesoDe, agoIso, clients, DAY, households, overview, revenue } from "./admin.views"
import { PlatformMailer } from "./platform-mailer"

const SYS = systemScope("consola de la plataforma")
type Msg = { msg: string }
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!)
const fechaLarga = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" })

@Injectable()
export class AdminService {
  constructor(
    private readonly repo: AdminRepo,
    private readonly identity: IdentityAdmin,
    private readonly billing: BillingService,
    private readonly mp: MercadoPagoClient,
    private readonly purge: StoragePurge,
    private readonly mailer: PlatformMailer,
    private readonly access: HouseholdAccess,
    private readonly ctx: RequestContextService,
    private readonly site: SiteUrl,
    private readonly config: AppConfig,
  ) {}

  private get me() {
    return this.ctx.user
  }

  /** Registro de todo lo que se hace en la consola (pestaña Auditoría). */
  private audit(accion: string, objetivo: string | null, detalle: Record<string, unknown> = {}) {
    return this.repo.audit(SYS, { actor: this.me.id, accion, objetivo, detalle })
  }

  // ── Resumen y clientes ──

  async overview() {
    const [users, members, books, audit, fb] = await Promise.all([
      this.identity.listUsers(), this.repo.memberships(SYS), this.repo.countBooks(SYS), this.repo.activity(SYS, { sinceIso: agoIso(30), limit: 20000 }), this.repo.feedbackOf(SYS, { limit: 100000 }),
    ])
    return overview({ users, members, books, audit, feedback: fb as { tipo: string; rating: number | null; estado: string }[] })
  }

  async clients() {
    const [users, profiles, members, actors, subs, admins] = await Promise.all([
      this.identity.listUsers(), this.repo.profiles(SYS), this.repo.memberships(SYS), this.repo.activity(SYS, { sinceIso: agoIso(30), limit: 50000 }),
      this.repo.subscriptions(SYS, { estados: ["activa", "cancelada", "cortesia"] }), this.repo.platformAdmins(SYS),
    ])
    return clients({ users, profiles, members, actors, subs, admins: admins.map((a) => a.user_id) })
  }

  /** Ficha completa de una persona (sin montos: por privacidad la consola no muestra sus finanzas). */
  async user(uid: string): Promise<UserDetail> {
    const [u, p, mem, acts, fb, notes, admins] = await Promise.all([
      this.identity.getUser(uid), this.repo.profileDetail(SYS, uid), this.repo.memberships(SYS, { userId: uid }), this.repo.activity(SYS, { sinceIso: agoIso(90), actor: uid, limit: 2000 }),
      this.repo.feedbackOf(SYS, { userId: uid, limit: 50 }), this.repo.notes(SYS, uid), this.repo.platformAdmins(SYS),
    ])
    if (!u) throw DomainError.notFound("No encontramos a esa persona.")
    const hids = mem.map((m) => m.household_id)
    const [subs, pays, books, members] = await Promise.all([this.repo.subscriptions(SYS, { householdIds: hids }), this.repo.payments(SYS, { householdIds: hids, limit: 100 }), this.repo.books(SYS, hids), this.repo.memberships(SYS, { householdIds: hids })])
    const plans = await Promise.all(hids.map(async (h) => [h, await this.repo.householdPlan(SYS, h)] as const))
    const porTabla = Object.entries(acts.filter((a) => a.created_at >= agoIso(30)).reduce<Record<string, number>>((t, a) => ((t[a.tabla] = (t[a.tabla] ?? 0) + 1), t), {})).sort((a, b) => b[1] - a[1])
    const banned = (u as AdminUser).banned_until
    return {
      id: uid, email: u.email ?? "", creado: u.created_at, ultimoIngreso: u.last_sign_in_at ?? null, confirmado: !!u.email_confirmed_at, acceso: accesoDe(u),
      suspendido: !!banned && new Date(banned) > new Date(), mfa: (u.factors ?? []).some((f) => f.status === "verified"), terminos: String(u.user_metadata?.acepta_version ?? ""), isAdmin: admins.some((a) => a.user_id === uid),
      perfil: p ? {
        nombre: p.nombre ?? null, apodo: p.apodo ?? null, email: p.email ?? null, telefono: p.telefono ?? null, ciudad: p.ciudad ?? null, doc_tipo: p.doc_tipo ?? null,
        doc: p.doc ? `•••${String(p.doc).slice(-4)}` : "", trabajo: p.trabajo ?? null, ocupacion: p.ocupacion ?? null, avatar_url: p.avatar_url ?? null, created_at: p.created_at ?? null, deletion_requested_at: p.deletion_requested_at ?? null,
      } : null,
      hogares: mem.map((m) => ({
        id: m.household_id, nombre: m.households?.nombre ?? "Hogar", rol: m.role, creado: m.households?.created_at ?? null, plan: plans.find((x) => x[0] === m.household_id)?.[1] ?? "gratis",
        integrantes: members.filter((x) => x.household_id === m.household_id).length,
        libros: books.filter((b) => b.household_id === m.household_id && !b.deleted_at).map((b) => b.nombre),
      })),
      suscripciones: subs, pagos: pays.map(({ pagador: _p, ...x }) => x),
      actividad: { total30: porTabla.reduce((t, x) => t + x[1], 0), porTabla, ultimas: acts.slice(0, 15).map((a) => ({ tabla: a.tabla, accion: a.accion, created_at: a.created_at })) },
      opiniones: fb.map((f) => ({ id: String(f.id), tipo: String(f.tipo), rating: (f.rating as number | null) ?? null, mensaje: String(f.mensaje ?? ""), estado: String(f.estado), created_at: String(f.created_at) })),
      notas: notes,
    }
  }

  async setSuspended(uid: string, suspend: boolean): Promise<Msg> {
    if (uid === this.me.id) throw DomainError.validation("No puedes suspender tu propia cuenta.")
    const err = await this.identity.setBanned(uid, suspend)
    if (err) throw DomainError.upstream(err.message)
    await this.audit(suspend ? "suspender usuario" : "reactivar usuario", uid)
    return { msg: suspend ? "Cuenta suspendida." : "Cuenta reactivada." }
  }

  /** Enlace para crear una contraseña nueva: se envía con el correo de la plataforma o se devuelve para copiarlo. */
  async recoveryLink(uid: string): Promise<{ sent: boolean; link?: string; msg: string }> {
    const u = await this.identity.getUser(uid)
    if (!u?.email) throw DomainError.validation("La persona no tiene correo.")
    const r = await this.identity.recoveryLink(u.email, this.site.to("/auth/callback?next=/actualizar-clave"))
    if (r.error || !r.link) throw DomainError.upstream(r.error?.message ?? "No pudimos crear el enlace.")
    await this.audit("enlace de contraseña", uid)
    if (await this.mailer.available()) {
      try {
        await this.mailer.send({ to: u.email, subject: "Mirai: crea una contraseña nueva", title: "Crea una contraseña nueva", html: `<p>Nos pediste ayuda para entrar a Mirai. Toca el botón para crear una contraseña nueva.</p><p style="margin-top:20px"><a href="${r.link}" style="background:#1F2B4B;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Crear contraseña</a></p><p style="color:#616161;font-size:13px">Si no lo pediste, ignora este correo.</p>` })
        return { sent: true, msg: `Enviamos el enlace a ${u.email}.` }
      } catch {
        /* se devuelve el enlace */
      }
    }
    return { sent: false, link: r.link, msg: "No hay un correo de la plataforma activo: copia el enlace y compártelo por un canal seguro." }
  }

  async setPlatformAdmin(uid: string, on: boolean): Promise<Msg> {
    if (!on) {
      if (uid === this.me.id) throw DomainError.validation("No puedes quitarte a ti mismo.")
      if ((await this.repo.platformAdmins(SYS)).length <= 1) throw DomainError.conflict("Debe quedar al menos un administrador.")
    }
    await this.repo.setPlatformAdmin(SYS, uid, on)
    this.access.invalidate(uid)
    await this.audit(on ? "dar administración" : "quitar administración", uid)
    return { msg: on ? "Ahora es administrador de Mirai." : "Ya no es administrador de Mirai." }
  }

  /** Elimina la cuenta y los hogares donde era la única persona. Hay que escribir su correo para confirmar. */
  async deleteUser(uid: string, confirmEmail: string): Promise<Msg> {
    if (uid === this.me.id) throw DomainError.validation("No puedes eliminar tu propia cuenta desde aquí.")
    const u = await this.identity.getUser(uid)
    if (!u || u.email?.toLowerCase() !== confirmEmail.trim().toLowerCase()) throw DomainError.validation("El correo no coincide.")
    const mem = await this.repo.memberships(SYS, { userId: uid })
    const all = await this.repo.memberships(SYS, { householdIds: mem.map((m) => m.household_id) })
    for (const m of mem) {
      if (all.filter((x) => x.household_id === m.household_id).length <= 1) {
        await this.purge.household(m.household_id)
        await this.repo.deleteHousehold(SYS, m.household_id)
      }
    }
    await this.purge.user(uid).catch(() => 0)
    const err = await this.identity.deleteUser(uid)
    if (err) throw DomainError.upstream(err.message)
    this.access.invalidate(uid)
    await this.audit("eliminar usuario", uid, { email: u.email })
    return { msg: "Eliminamos la cuenta." }
  }

  async addNote(uid: string, texto: string) {
    const id = await this.repo.addNote(SYS, { user_id: uid, texto, autor: this.me.id })
    await this.audit("nota interna", uid, { nota: id })
    return { id, msg: "Nota guardada." }
  }

  async deleteNote(id: string): Promise<Msg> {
    await this.repo.deleteNote(SYS, id)
    await this.audit("borrar nota interna", id)
    return { msg: "Nota borrada." }
  }

  /** Invita a una persona por correo (el proveedor de identidad envía el enlace para crear su cuenta). */
  async inviteUser(email: string, nombre: string): Promise<Msg> {
    const e = email.trim().toLowerCase()
    const err = await this.identity.inviteUser(e, { nombre }, this.site.to("/auth/callback?next=/bienvenida"))
    if (err) throw /already/i.test(err.message) ? DomainError.conflict("Ya existe una cuenta con ese correo.") : DomainError.upstream(err.message)
    await this.audit("invitar persona", e, { nombre })
    return { msg: `Invitamos a ${e}.` }
  }

  // ── Hogares y planes ──

  async households() {
    const [hh, members, books, subs, profiles, activity, admins] = await Promise.all([
      this.repo.households(SYS), this.repo.memberships(SYS), this.repo.books(SYS), this.repo.subscriptions(SYS, { estados: ["activa", "cancelada", "cortesia"] }),
      this.repo.profiles(SYS), this.repo.activity(SYS, { sinceIso: agoIso(30), limit: 50000 }), this.repo.platformAdmins(SYS),
    ])
    return households({ households: hh, members, books, subs, profiles, activity, admins: admins.map((a) => a.user_id) })
  }

  private async notifyOwners(householdId: string, titulo: string, cuerpo: string, dedupe: string) {
    const owners = await this.repo.owners(SYS, householdId)
    await this.repo.notify(SYS, owners.map((user_id) => ({ user_id, kind: "plan", titulo, cuerpo, href: "/ajustes?tab=plan", dedupe })))
  }

  /** Asigna un plan a un hogar hasta una fecha (cortesía, convenio o pago por fuera). */
  async assignPlan(householdId: string, b: { plan: string; hasta: string; nota: string }): Promise<Msg> {
    if (new Date(b.hasta) <= new Date()) throw DomainError.validation("La fecha debe ser futura.")
    const pl = await this.repo.plan(SYS, b.plan)
    if (!pl) throw DomainError.notFound("Ese plan no existe.")
    await this.repo.insertSubscription(SYS, { household_id: householdId, plan: b.plan, proveedor: "manual", estado: "cortesia", periodo: "mes", vence_at: new Date(`${b.hasta}T23:59:59-05:00`).toISOString(), nota: b.nota || null, created_by: this.me.id })
    await this.notifyOwners(householdId, `¡Tienes Mirai ${pl.nombre}!`, `Disfrútalo hasta el ${fechaLarga(b.hasta)}.`, `assign-${householdId}-${Date.now()}`)
    await this.audit("asignar plan", householdId, { plan: b.plan, hasta: b.hasta, nota: b.nota })
    return { msg: `Listo: el hogar tiene ${pl.nombre} hasta el ${fechaLarga(b.hasta)}.` }
  }

  /** Regala Premium (cortesía) al hogar hasta una fecha. */
  async grantPremium(householdId: string, b: { hasta: string; nota: string }): Promise<Msg> {
    if (new Date(b.hasta) <= new Date()) throw DomainError.validation("La fecha debe ser futura.")
    await this.repo.insertSubscription(SYS, { household_id: householdId, proveedor: "manual", estado: "cortesia", periodo: "mes", vence_at: new Date(`${b.hasta}T23:59:59-05:00`).toISOString(), nota: b.nota || null, created_by: this.me.id })
    await this.notifyOwners(householdId, "¡Te regalamos Mirai Premium!", `Disfruta todas las funciones Premium hasta el ${fechaLarga(b.hasta)}.`, `gift-${householdId}-${Date.now()}`)
    await this.audit("regalar premium", householdId, { hasta: b.hasta, nota: b.nota })
    return { msg: `Listo: Premium de cortesía hasta el ${fechaLarga(b.hasta)}.` }
  }

  /** Quita el Premium de cortesía vigente de un hogar. */
  async revokeCourtesy(householdId: string): Promise<Msg> {
    await this.repo.endCourtesy(SYS, householdId)
    await this.audit("quitar cortesía", householdId)
    return { msg: "Quitamos la cortesía del hogar." }
  }

  // ── Suscripciones y pagos ──

  async subscriptions() {
    const [subs, hh] = await Promise.all([this.repo.subscriptions(SYS, { limit: 2000 }), this.repo.households(SYS)])
    const n = new Map(hh.map((h) => [h.id, h.nombre]))
    return subs.map((s) => ({ ...s, hogar: n.get(s.household_id) ?? "Hogar eliminado", vigente: vigente(s.vence_at) && s.estado !== "pendiente" }))
  }

  async updateSubscription(id: string, action: { kind: "extender"; dias: number } | { kind: "plan"; plan: string } | { kind: "cancelar" } | { kind: "terminar" }): Promise<Msg> {
    const s = await this.repo.subscription(SYS, id)
    if (!s) throw DomainError.notFound("No existe esa suscripción.")
    if (action.kind === "extender") {
      const base = s.vence_at && new Date(s.vence_at) > new Date() ? new Date(s.vence_at) : new Date()
      await this.repo.updateSubscription(SYS, s.id, { vence_at: new Date(base.getTime() + action.dias * DAY).toISOString(), estado: s.estado === "vencida" || s.estado === "pendiente" ? "cortesia" : s.estado })
    } else if (action.kind === "plan") {
      await this.repo.updateSubscription(SYS, s.id, { plan: action.plan })
    } else if (action.kind === "cancelar") {
      if (s.proveedor === "mercadopago" && s.proveedor_ref) await this.mp.cancelPreapproval(s.proveedor_ref)
      await this.repo.updateSubscription(SYS, s.id, { estado: "cancelada" })
    } else {
      if (s.proveedor === "mercadopago" && s.proveedor_ref && s.estado === "activa") await this.mp.cancelPreapproval(s.proveedor_ref).catch(() => null)
      await this.repo.updateSubscription(SYS, s.id, { estado: "vencida", vence_at: new Date(Date.now() - 4 * DAY).toISOString() })
    }
    await this.audit(`suscripción: ${action.kind}`, s.household_id, { sub: s.id, ...action })
    return { msg: "Suscripción actualizada." }
  }

  async revenue() {
    const [subs, pays, premium, hh] = await Promise.all([this.repo.subscriptions(SYS), this.repo.payments(SYS, { limit: 500 }), this.repo.plan(SYS, "premium"), this.repo.households(SYS)])
    return revenue({ subs, pays, premium, households: hh })
  }

  /** Registra un pago hecho por fuera (transferencia, efectivo, convenio) y extiende el plan del hogar. */
  async manualPayment(d: { householdId: string; plan: string; periodo: "mes" | "anio"; monto: number; nota: string }): Promise<Msg> {
    const ref = `manual-${randomUUID()}`
    await this.billing.applyPayment({ householdId: d.householdId, proveedor: "manual", referencia: ref, periodo: d.periodo, monto: d.monto, estado: "aprobado", metodo: "registrado por Mirai", plan: d.plan, nota: d.nota || null })
    await this.audit("registrar pago manual", d.householdId, { ...d, ref })
    return { msg: "Pago registrado y plan extendido." }
  }

  async updatePayment(id: string, p: { estado?: "reembolsado" | "anulado"; factura_ref?: string; nota?: string }): Promise<Msg> {
    await this.repo.updatePayment(SYS, id, p)
    await this.audit("actualizar pago", id, p)
    return { msg: "Pago actualizado." }
  }

  // ── Comunicados ──

  /** Aviso en la app (y por correo, si hay correo de la plataforma y se pide) a un segmento de personas. */
  async broadcast(d: { titulo: string; cuerpo: string; href: string; segmento: string; correo: boolean }) {
    let ids: string[] = []
    if (d.segmento === "admins") ids = (await this.repo.platformAdmins(SYS)).map((a) => a.user_id)
    else {
      const mem = await this.repo.memberships(SYS)
      if (d.segmento === "todos") ids = [...new Set(mem.map((m) => m.user_id))]
      else {
        const plan = d.segmento.slice(5)
        const keep = new Set<string>()
        for (const h of [...new Set(mem.map((m) => m.household_id))]) if ((await this.repo.householdPlan(SYS, h)) === plan) keep.add(h)
        ids = [...new Set(mem.filter((m) => keep.has(m.household_id)).map((m) => m.user_id))]
      }
    }
    const tag = `bc-${randomUUID()}`
    await this.repo.notify(SYS, ids.map((user_id) => ({ user_id, kind: "sistema", titulo: d.titulo, cuerpo: d.cuerpo, href: d.href || null, dedupe: tag })))
    let correos = 0
    let aviso = ""
    if (d.correo) {
      if (!(await this.mailer.available())) aviso = " Se enviaron los avisos en la app, pero no hay un correo de la plataforma activo para enviar por correo."
      else {
        const profs = await this.repo.profiles(SYS, ids.slice(0, 2000))
        const link = d.href ? `<p style="margin-top:20px"><a href="${this.site.to(d.href)}" style="background:#1F2B4B;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Abrir Mirai</a></p>` : ""
        for (const p of profs) {
          if (!p.email) continue
          try {
            await this.mailer.send({ to: p.email, subject: d.titulo, title: d.titulo, html: `<p>${esc(d.cuerpo).replace(/\n/g, "<br>")}</p>${link}` })
            correos++
          } catch {
            /* sigue */
          }
        }
      }
    }
    await this.repo.insertBroadcast(SYS, { titulo: d.titulo, cuerpo: d.cuerpo, href: d.href || null, segmento: d.segmento, enviados: ids.length, created_by: this.me.id })
    await this.audit("enviar comunicado", d.segmento, { titulo: d.titulo, personas: ids.length, correos })
    return { personas: ids.length, correos, msg: `Enviamos el aviso a ${ids.length} persona${ids.length === 1 ? "" : "s"}${correos ? ` y ${correos} correo${correos === 1 ? "" : "s"}` : ""}.${aviso}` }
  }

  // ── Administradores, auditoría y sistema ──

  async admins() {
    const list = await this.repo.platformAdmins(SYS)
    const profs = await this.repo.profiles(SYS, list.map((a) => a.user_id))
    return list.map((a) => {
      const p = profs.find((x) => x.id === a.user_id)
      return { ...a, perfil: p ? { id: p.id, nombre: p.nombre, email: p.email, avatar_url: p.avatar_url ?? null } : null }
    })
  }

  async addAdmin(email: string): Promise<Msg> {
    const e = email.trim().toLowerCase()
    const u = (await this.identity.listUsers()).find((x) => x.email?.toLowerCase() === e)
    if (!u) throw DomainError.notFound("No hay ninguna cuenta de Mirai con ese correo. La persona debe registrarse primero.")
    await this.repo.setPlatformAdmin(SYS, u.id, true)
    this.access.invalidate(u.id)
    await this.audit("dar administración", u.id, { email: e })
    return { msg: `${e} ahora es administrador de Mirai.` }
  }

  async auditLog() {
    const rows = await this.repo.auditLog(SYS, 500)
    const profs = await this.repo.profiles(SYS, [...new Set(rows.map((a) => a.actor).filter(Boolean))] as string[])
    return rows.map((a) => {
      const p = profs.find((x) => x.id === a.actor)
      return { ...a, quien: p?.nombre || p?.email || "—" }
    })
  }

  /**
   * Consola › Sistema: qué tiene configurado ESTE despliegue. v7 (desde 2026-11-07): un solo servidor con Dokploy
   * (Postgres + PostgREST interno + Redis + archivos S3 + esta API con Better Auth); ya no hay Vercel ni Supabase.
   * Correo, WhatsApp, Telegram, push, IA y AdSense se pueden encender con las variables del servidor o en consola ›
   * Integraciones globales: cuentan de las dos formas (y "Apagada" en la consola manda sobre la variable).
   * `req` = sin eso Mirai no funciona; lo demás es opcional. Solo dice SI hay dato, nunca su valor.
   */
  async system() {
    const [settings, migraciones, huerfanos, refs, modos] = await Promise.all([this.repo.settings(SYS), this.repo.migrations(SYS), this.repo.orphanCount(SYS), this.repo.referralCounts(SYS), this.repo.integrationModes(SYS)])
    const env = (k: string) => !!process.env[k]?.trim()
    const val = (k: string) => process.env[k]?.trim() || undefined
    const host = (u: string | undefined) => {
      try {
        return u ? new URL(u).host : undefined
      } catch {
        return undefined
      }
    }
    /** Encendida: lo guardado en la consola manda; si no hay fila, basta con las variables del servidor. */
    const activa = (kind: string) => {
      const modo = modos[kind]
      if (modo) return modo !== "apagada"
      const def = integrationByKind(kind)
      return !!integrationFromEnv(kind, (n) => process.env[n]) || !!(def?.env && env(def.env))
    }
    const primera = (kinds: readonly string[]) => kinds.find(activa)
    /** "Resend · variables del servidor" (sin claves ni correos: solo de dónde sale la configuración). */
    const nota = (kind: string | undefined) => (kind ? `${integrationByKind(kind)?.n ?? kind} · ${modos[kind] ? "consola › Integraciones globales" : "variables del servidor"}` : null)
    const it = (grupo: string, k: string, ok: unknown, o: { req?: boolean; nota?: string | null } = {}) => ({ grupo, k, ok: !!ok, req: !!o.req, nota: o.nota ?? null })

    const { adapter, postgrest, url: dbUrl } = this.config.db
    const dbOk = adapter === "postgrest" ? !!(postgrest?.url && postgrest.jwtSecret) : adapter === "pg" ? !!dbUrl : !!this.config.supabase.secretKey
    const store = val("OBJECT_STORE") ?? "supabase"
    const sitio = val("SITE_URL") ?? val("NEXT_PUBLIC_SITE_URL") ?? val("BETTER_AUTH_URL") ?? val("API_PUBLIC_URL")
    const correo = primera(EMAIL_KINDS)
    const wa = activa("whatsapp")
    const tg = activa("telegram")
    const ia = primera(INTEGRATIONS.filter((i) => i.cat === "ia").map((i) => i.kind))
    const iaPreferida = val("AI_PLATFORM_PROVIDER")
    const mp = env("MERCADOPAGO_ACCESS_TOKEN")
    const wompi = (env("WOMPI_PUBLIC_KEY") || env("NEXT_PUBLIC_WOMPI_PUBLIC_KEY")) && env("WOMPI_INTEGRITY_SECRET")

    return {
      settings, migraciones, huerfanos, referidos: refs.total, premiados: refs.premiados,
      estado: [
        it("Servidor", "Base de datos", dbOk, { req: true, nota: adapter === "postgrest" ? `PostgREST interno con RLS (${host(postgrest?.url) ?? "sin URL"})` : adapter === "pg" ? "Conexión directa a Postgres" : "Supabase" }),
        it("Servidor", "Conexión directa a la base", env("AUTH_DATABASE_URL") || env("DATABASE_URL"), { req: true, nota: "La usan el login propio y el tiempo real (LISTEN)" }),
        it("Servidor", "Cifrado de claves", this.config.encryptionKey, { req: true, nota: "ENCRYPTION_KEY: los secretos de las integraciones" }),
        it("Servidor", "Dirección del sitio", sitio, { req: true, nota: host(sitio) ?? "SITE_URL" }),
        it("Servidor", "Archivos (adjuntos y copias)", store !== "memory" && (store === "supabase" ? !!this.config.supabase.secretKey : env("STORAGE_BUCKET_PRIVATE")), { req: true, nota: `${store}${host(val("S3_ENDPOINT")) ? ` · ${host(val("S3_ENDPOINT"))}` : ""}` }),
        it("Servidor", "Tiempo real y colas (Redis)", env("REDIS_URL"), { nota: "Sin Redis funciona igual con un solo servidor" }),
        it("Servidor", "Trabajos programados", this.config.scheduler.cronSecret || this.config.scheduler.audience || this.config.scheduler.oidc, { req: true, nota: "Avisos, automatizaciones y copias (servicio cron)" }),

        it("Cuentas", "Login propio (Better Auth)", (val("BETTER_AUTH_SECRET")?.length ?? 0) >= 32, { req: true, nota: host(val("BETTER_AUTH_URL")) ?? "BETTER_AUTH_SECRET + BETTER_AUTH_URL" }),
        it("Cuentas", "Entrar con Google", env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"), { nota: "También Gmail y Calendar" }),
        it("Cuentas", "Captcha (Cloudflare Turnstile)", env("TURNSTILE_SECRET_KEY"), { nota: "Protege registro, ingreso y recuperar clave" }),

        it("Avisos", "Correo", correo, { req: true, nota: nota(correo) ?? "Sin correo no salen invitaciones ni verificación de cuenta" }),
        it("Avisos", "WhatsApp", wa, { nota: wa ? nota("whatsapp") : "Recordatorios y resúmenes por WhatsApp" }),
        it("Avisos", "Telegram", tg, { nota: tg ? nota("telegram") : "Avisos por el bot de Telegram" }),
        it("Avisos", "Notificaciones push (VAPID)", (env("VAPID_PUBLIC_KEY") || env("NEXT_PUBLIC_VAPID_PUBLIC_KEY")) && env("VAPID_PRIVATE_KEY"), { nota: "Avisos en el celular con la app instalada" }),

        it("Inteligencia artificial", "IA de la plataforma", ia, { nota: ia ? nota(ia) : `Chat, consejero y lectura de facturas${iaPreferida ? ` (preferida: ${integrationByKind(iaPreferida)?.n ?? iaPreferida})` : ""}` }),

        it("Cobros y anuncios", "Mercado Pago", mp),
        it("Cobros y anuncios", "Webhook de Mercado Pago firmado", env("MERCADOPAGO_WEBHOOK_SECRET"), { req: mp, nota: "Sin la firma no se registran los pagos" }),
        it("Cobros y anuncios", "Wompi", wompi),
        it("Cobros y anuncios", "Eventos de Wompi firmados", env("WOMPI_EVENTS_SECRET"), { req: !!wompi, nota: "Sin la firma no se registran los pagos" }),
        it("Cobros y anuncios", "Google AdSense", activa("adsense") || (env("NEXT_PUBLIC_ADSENSE_CLIENT") && env("NEXT_PUBLIC_ADSENSE_SLOT")), { nota: "Relleno de los espacios del plan gratis" }),
      ],
      ambiente: this.config.env, rama: val("GIT_BRANCH") ?? (this.config.env === "produccion" ? "main" : "local"), commit: this.config.commit.slice(0, 7),
    }
  }

  async saveSettings(p: Record<string, unknown>): Promise<Msg> {
    await this.repo.saveSettings(SYS, p)
    await this.audit("ajustes de la plataforma", null, p)
    return { msg: "Ajustes guardados." }
  }

  async cleanOrphans() {
    const borrados = await this.repo.deleteOrphans(SYS)
    await this.audit("borrar hogares vacíos", null, { borrados })
    return { borrados, msg: `Borramos ${borrados} hogar${borrados === 1 ? "" : "es"} sin personas.` }
  }

  // ── Opiniones y envíos ──

  /** Opiniones de todas las personas, con su autor y la captura (enlace temporal de 1 hora). */
  async feedback() {
    const rows = await this.repo.feedbackOf(SYS, { limit: 1000 })
    const profs = await this.repo.profiles(SYS, [...new Set(rows.map((f) => String(f.user_id)))])
    const urls = await this.repo.signedFeedbackUrls(SYS, rows.map((f) => f.captura).filter(Boolean) as string[], 3600)
    return rows.map((f) => {
      const p = profs.find((x) => x.id === f.user_id)
      return { ...f, autor: p ? { id: p.id, nombre: p.nombre, email: p.email, avatar_url: p.avatar_url ?? null } : null, capturaUrl: f.captura ? urls.get(String(f.captura)) ?? null : null }
    }) as never
  }

  /** Cambia el estado o responde, con la sesión del administrador (queda quién respondió y se avisa a la persona). */
  async updateFeedback(id: string, patch: { estado?: string; respuesta?: string }): Promise<Msg> {
    await this.repo.updateFeedback(this.ctx.db, id, patch)
    await this.audit("responder opinión", id, { estado: patch.estado, respondida: !!patch.respuesta })
    return { msg: "Opinión actualizada." }
  }

  /** Registro de envíos (últimos 500): canal, estado, destino enmascarado y error. Sin el contenido de los mensajes. */
  async notifyLog() {
    const rows = await this.repo.notifyLog(SYS, 500)
    const people = await this.repo.profiles(SYS, [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[])
    const who = new Map(people.map((p) => [p.id, p.nombre || p.email || "—"]))
    return rows.map((r) => ({ ...r, quien: r.user_id ? who.get(String(r.user_id)) ?? "—" : "Sistema" })) as never
  }

  /** Destinos sugeridos para "Enviar prueba": tu correo y el WhatsApp que guardaste en Ajustes › Alertas. */
  async testDefaults() {
    return { email: this.me.email ?? "", whatsapp: (await this.repo.whatsappTo(SYS, this.me.id)) ?? "" }
  }
}

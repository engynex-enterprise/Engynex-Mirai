// Consola › Planes, Cupones, Integraciones globales y WhatsApp (V7-G). Mismas reglas y mensajes que PlanesPanel,
// CuponesPanel (apps/web/features/admin/console-*.tsx) y features/admin/{server,whatsapp}.ts. La guarda
// @PlatformAdmin va en el controller; aquí cada comando queda en admin_audit. Lo que guarda la base va por RowStore
// (SystemScope con motivo) y la red (proveedores, Meta) por PlatformIntegrationsPort. Nunca devuelve secretos.
import { Injectable } from "@nestjs/common"
import { mask } from "@mirai/crypto"
import type { AdminCoupon, AdminPlan, BroadcastRow, CouponInput, GlobalIntegration, PlanInput, UsuraInput } from "@mirai/contracts/modules/admin-platform"
import { UsuraAdmin } from "@mirai/contracts/modules/admin-platform"
import { estadoUsura, mesUsura, usuraVigente, type UsuraRow } from "@mirai/domain/usura"
import { todayBogota } from "@mirai/domain/dates"
import { ENV_INTEGRATION_KINDS, integrationFromEnv, mergeEnv } from "@mirai/services/integrations/env"
import { INTEGRATIONS, integrationByKind, isAdminOnly, type IntegrationDef } from "@mirai/services/integrations/registry"
import type { IntegrationValue } from "@mirai/services/integrations/store"
import { EMAIL_KINDS } from "@mirai/services/notify/email-kinds"
import { maskDest } from "@mirai/services/notify/rules"
import { canEdit, validateDraft, type TemplateDraft } from "@mirai/services/notify/wa-templates"
import { normalizeCoPhone, WA_CASE_KEYS, WA_VARS, waSettings } from "@mirai/services/notify/whatsapp"
import { z } from "zod"
import { RequestContextService } from "../../core/context/request-context.service"
import { systemScope } from "../../core/db/scope"
import { CryptoService } from "../../core/crypto/crypto.service"
import { DomainError } from "../../core/errors/domain-error"
import { RowStore, type Rec } from "../../core/store/row-store"
import { num } from "../book-tables/http"
import { HouseholdAccess } from "../households/household-access"
import { PlatformIntegrationsPort, type WaCaseOverride } from "./platform-integrations.port"

const SYS = systemScope("consola: planes, cupones, integraciones globales y WhatsApp")
const FIXED_PLANS = new Set(["gratis", "premium"])
const NO_WA = "Primero configura WhatsApp en Integraciones globales."
type Msg = { msg: string }
type UsuraAdminT = z.infer<typeof UsuraAdmin>
type GlobalRow = { kind: string; modo: string; planes: string[] | null; config: Record<string, unknown> | null; meta: Record<string, unknown> | null; updated_at: string | null; secrets_enc: string | null }

@Injectable()
export class AdminPlatformService {
  constructor(
    private readonly store: RowStore,
    private readonly crypto: CryptoService,
    private readonly port: PlatformIntegrationsPort,
    private readonly access: HouseholdAccess,
    private readonly ctx: RequestContextService,
  ) {}

  private audit(accion: string, objetivo: string | null, detalle: Record<string, unknown> = {}) {
    return this.store.insert(SYS, "admin_audit", [{ actor: this.ctx.user.id, accion, objetivo, detalle }])
  }

  private logSend(row: Rec) {
    // El registro de envíos es informativo: nunca rompe la respuesta.
    return this.store.insert(SYS, "notification_log", [{ ...row, error: typeof row.error === "string" ? row.error.slice(0, 1000) : null }]).catch(() => [])
  }

  // ── Planes ──────────────────────────────────────────────────────────────────────────────────────────────────

  async plans(): Promise<AdminPlan[]> {
    const rows = await this.store.select<AdminPlan>(SYS, "plans", { order: [{ column: "orden" }, { column: "precio_mes" }] })
    return rows.map((p) => ({ ...p, precio_mes: num(p.precio_mes), precio_anio: num(p.precio_anio), limites: (p.limites ?? {}) as Record<string, unknown> }))
  }

  async savePlan(id: string, p: PlanInput): Promise<Msg & { creado: boolean }> {
    const gratis = id === "gratis"
    if (!gratis && p.precio_mes < 1000) throw DomainError.validation("El precio mensual debe ser de al menos $1.000.")
    const row = {
      nombre: p.nombre, descripcion: p.descripcion, precio_mes: gratis ? 0 : p.precio_mes, precio_anio: gratis ? 0 : p.precio_anio, funciones: p.funciones, anuncios: p.anuncios,
      limites: Object.fromEntries(Object.entries(p.limites).filter(([, x]) => x)),
      // Gratis siempre se puede usar (la web deshabilita el interruptor).
      activo: gratis ? true : p.activo, publico: p.publico, destacado: p.destacado, orden: p.orden,
    }
    const prev = await this.store.first(SYS, "plans", { columns: ["id"], eq: { id } })
    try {
      if (prev) await this.store.update(SYS, "plans", { eq: { id } }, { ...row, updated_at: new Date().toISOString() })
      else await this.store.insert(SYS, "plans", [{ id, ...row }])
    } catch (e) {
      if (e instanceof DomainError && e.code === "CONFLICT") throw DomainError.conflict("Ya existe un plan con ese nombre.")
      throw e
    }
    await this.audit(prev ? "editar plan" : "crear plan", id, { nombre: row.nombre, precio_mes: row.precio_mes, precio_anio: row.precio_anio, funciones: row.funciones, activo: row.activo, publico: row.publico })
    return { creado: !prev, msg: "Plan guardado." }
  }

  async deletePlan(id: string): Promise<Msg> {
    if (FIXED_PLANS.has(id)) throw DomainError.validation("Gratis y Premium son fijos: se pueden editar pero no borrar.")
    let n: number
    try {
      n = await this.store.delete(SYS, "plans", { eq: { id } })
    } catch (e) {
      if (e instanceof DomainError && e.code === "CONFLICT") throw DomainError.conflict("Hay suscripciones o pagos con este plan: ocúltalo y deja de venderlo.")
      throw e
    }
    if (!n) throw DomainError.notFound("No encontramos ese plan.")
    await this.audit("borrar plan", id)
    return { msg: "Plan borrado." }
  }

  // ── Cupones ─────────────────────────────────────────────────────────────────────────────────────────────────

  // ── Datos de referencia: usura por mes ──────────────────────────────────────────────────────────────────────

  private async usuraFilas(): Promise<UsuraRow[]> {
    const rows = await this.store.select<UsuraRow>(SYS, "ref_usury_rate", { eq: { modalidad: "consumo" }, columns: ["desde", "hasta", "tasa_ea", "fuente"], order: [{ column: "desde", ascending: false }] })
    return rows.map((r) => ({ desde: String(r.desde).slice(0, 10), hasta: String(r.hasta).slice(0, 10), tasa_ea: num(r.tasa_ea), fuente: r.fuente ?? null }))
  }

  async usura(): Promise<UsuraAdminT> {
    const hoy = todayBogota()
    const filas = await this.usuraFilas()
    const e = estadoUsura(filas, hoy)
    const [librosAuto, librosAlDia] = await Promise.all([
      this.store.count(SYS, "book_settings", { eq: { usura_auto: true } }),
      e.vigente ? this.store.count(SYS, "book_settings", { eq: { usura_auto: true, usura: e.vigente.tasa_ea } }) : Promise.resolve(0),
    ])
    return { hoy, vigente: e.vigente ? { ...e.vigente, fuente: e.vigente.fuente ?? null } : null, alerta: e.alerta, siguiente: e.siguiente, filas: filas.map((f) => ({ ...f, fuente: f.fuente ?? null })), librosAuto, librosAlDia }
  }

  /** Pone la usura vigente hoy en los libros en automático (como el cron, pero al momento). */
  private async aplicarUsura(): Promise<number> {
    const v = usuraVigente(await this.usuraFilas(), todayBogota())
    if (!v) return 0
    return (await this.store.update(SYS, "book_settings", { eq: { usura_auto: true }, neq: { usura: v.tasa_ea } }, { usura: v.tasa_ea })).length
  }

  async saveUsura(desde: string, u: UsuraInput): Promise<Msg & { libros: number }> {
    const { hasta } = mesUsura(desde.slice(0, 7))
    await this.store.upsert(SYS, "ref_usury_rate", [{ desde, hasta, modalidad: "consumo", tasa_ea: Math.round(u.tasa_ea * 100) / 100, fuente: u.fuente }], { onConflict: ["desde", "modalidad"] })
    const libros = await this.aplicarUsura()
    await this.audit("usura: cargar mes", desde.slice(0, 7), { tasa_ea: u.tasa_ea, fuente: u.fuente, libros })
    return { libros, msg: libros ? `Usura guardada y aplicada a ${libros} libro${libros === 1 ? "" : "s"}.` : "Usura guardada." }
  }

  async deleteUsura(desde: string): Promise<Msg & { libros: number }> {
    const n = await this.store.delete(SYS, "ref_usury_rate", { eq: { desde, modalidad: "consumo" } })
    if (!n) throw DomainError.notFound("No encontramos la usura de ese mes.")
    const libros = await this.aplicarUsura()
    await this.audit("usura: borrar mes", desde.slice(0, 7), { libros })
    return { libros, msg: "Usura del mes borrada." }
  }

  async coupons(): Promise<AdminCoupon[]> {
    const rows = await this.store.select<AdminCoupon>(SYS, "coupons", { order: [{ column: "created_at", ascending: false }] })
    return rows.map((c) => ({ ...c, valor: num(c.valor), usos: num(c.usos), max_usos: c.max_usos == null ? null : num(c.max_usos) }))
  }

  async saveCoupon(codigo: string, c: CouponInput): Promise<Msg & { creado: boolean }> {
    if (c.tipo === "porcentaje" && c.valor > 100) throw DomainError.validation("Un descuento en porcentaje va de 1 a 100.")
    if (c.desde && c.hasta && c.desde > c.hasta) throw DomainError.validation("La fecha «Hasta» debe ser después de «Desde».")
    const row = { descripcion: c.descripcion, tipo: c.tipo, valor: c.valor, planes: c.planes, periodos: c.periodos, desde: c.desde, hasta: c.hasta, max_usos: c.max_usos, activo: c.activo }
    const prev = await this.store.first(SYS, "coupons", { columns: ["codigo"], eq: { codigo } })
    try {
      if (prev) await this.store.update(SYS, "coupons", { eq: { codigo } }, row)
      else await this.store.insert(SYS, "coupons", [{ codigo, ...row }])
    } catch (e) {
      if (e instanceof DomainError && e.code === "CONFLICT") throw DomainError.conflict("Ya existe un cupón con ese código.")
      throw e
    }
    await this.audit(prev ? "editar cupón" : "crear cupón", codigo, { tipo: c.tipo, valor: c.valor, activo: c.activo, planes: c.planes, periodos: c.periodos })
    return { creado: !prev, msg: prev ? "Cupón guardado." : "Cupón creado." }
  }

  async deleteCoupon(codigo: string): Promise<Msg> {
    const n = await this.store.delete(SYS, "coupons", { eq: { codigo } })
    if (!n) throw DomainError.notFound("No encontramos ese cupón.")
    await this.audit("borrar cupón", codigo)
    return { msg: "Cupón borrado." }
  }

  // ── Integraciones globales ──────────────────────────────────────────────────────────────────────────────────

  private def(kind: string): IntegrationDef {
    const d = integrationByKind(kind)
    if (!d) throw DomainError.notFound("Integración desconocida.")
    return d
  }

  private secretsOf(enc: string | null | undefined): Record<string, string> {
    if (!enc) return {}
    try {
      return JSON.parse(this.crypto.decrypt(enc)) as Record<string, string>
    } catch {
      return {}
    }
  }

  /** Lo que el despliegue trae en sus variables (correo, WhatsApp, Telegram), o null si no está completo. */
  private envOf(kind: string) {
    return integrationFromEnv(kind, (n) => this.port.envValue(n))
  }

  /** La fila tal como está guardada (para no volver a guardar lo que ya vive en las variables del servidor). */
  private async row(kind: string) {
    const r = await this.store.first<GlobalRow>(SYS, "platform_integrations", { eq: { kind } })
    return r ? { row: r, config: { ...(r.config ?? {}) }, secrets: this.secretsOf(r.secrets_enc) } : null
  }

  /**
   * getGlobalIntegration de @mirai/services, con RowStore y CryptoService: la fila guardada combinada con las
   * variables del despliegue. Sin fila, las variables solas la dejan ACTIVA (`desdeEnv`), igual que en los avisos.
   */
  private async global(kind: string) {
    const [r, env] = [await this.row(kind), this.envOf(kind)]
    if (!r) return env ? { row: { kind, modo: "obligatoria", planes: [], config: env.config, meta: {}, updated_at: null, secrets_enc: null } as GlobalRow, config: env.config, secrets: env.secrets, desdeEnv: true } : null
    return { ...r, config: mergeEnv(env?.config, r.config), secrets: mergeEnv(env?.secrets, r.secrets), desdeEnv: false }
  }

  private view(def: IntegrationDef, r: GlobalRow | undefined, own: { kind: string; enabled: boolean }[]): GlobalIntegration {
    const mine = own.filter((x) => x.kind === def.kind)
    // Correo, WhatsApp y Telegram necesitan TODAS sus variables (clave, remitente, número) para contar como listas;
    // las demás, solo la del registro (VAPID, GOOGLE_CLIENT_ID…).
    const env = ENV_INTEGRATION_KINDS.includes(def.kind) ? !!this.envOf(def.kind) : !!(def.env && this.port.hasEnv(def.env))
    const envCfg = env ? this.envOf(def.kind)?.config : undefined
    return {
      kind: def.kind, modo: r?.modo ?? (env && envCfg ? "obligatoria" : "apagada"), planes: r?.planes ?? [],
      config: mergeEnv(envCfg, (r?.config ?? {}) as Record<string, unknown>), meta: (r?.meta ?? {}) as Record<string, unknown>,
      updated_at: r?.updated_at ?? null, hogaresPropios: mine.filter((x) => x.enabled).length, hogaresApagada: mine.filter((x) => !x.enabled).length,
      env, adminOnly: isAdminOnly(def), existe: !!r, guardada: !!r?.secrets_enc || Object.keys(r?.config ?? {}).length > 0,
    }
  }

  async integrations(): Promise<GlobalIntegration[]> {
    const [rows, own] = await Promise.all([
      this.store.select<GlobalRow>(SYS, "platform_integrations", { columns: ["kind", "modo", "planes", "config", "meta", "updated_at", "secrets_enc"] }),
      this.store.select<{ kind: string; enabled: boolean }>(SYS, "integrations", { columns: ["kind", "enabled"] }),
    ])
    return INTEGRATIONS.map((def) => this.view(def, rows.find((x) => x.kind === def.kind), own))
  }

  async integration(kind: string): Promise<GlobalIntegration> {
    const def = this.def(kind)
    const [r, own] = await Promise.all([
      this.store.first<GlobalRow>(SYS, "platform_integrations", { columns: ["kind", "modo", "planes", "config", "meta", "updated_at", "secrets_enc"], eq: { kind } }),
      this.store.select<{ kind: string; enabled: boolean }>(SYS, "integrations", { columns: ["kind", "enabled"], eq: { kind } }),
    ])
    return this.view(def, r ?? undefined, own)
  }

  /** adminSaveGlobalIntegration: los errores que el administrador debe leer salen como VALIDATION con el mismo texto. */
  async saveIntegration(kind: string, input: { modo: string; planes: string[]; values: Record<string, string | number | boolean> }): Promise<Msg & { warn?: string }> {
    const def = this.def(kind)
    const prev = await this.row(kind)
    const config: Record<string, unknown> = { ...(prev?.config ?? {}) }
    const secrets: Record<string, string> = { ...(prev?.secrets ?? {}) }
    const meta: Record<string, unknown> = {}
    for (const f of def.fields) {
      const v = input.values[f.k]
      if (f.type === "secret") {
        if (typeof v === "string" && v.trim()) secrets[f.k] = v.trim()
        if (secrets[f.k]) meta[f.k] = mask(secrets[f.k])
      } else if (v !== undefined) config[f.k] = v
      else if (config[f.k] === undefined && f.def !== undefined) config[f.k] = f.def
    }
    const missing = def.fields.filter((f) => f.required && !(f.type === "secret" ? secrets[f.k] || (def.env && this.port.hasEnv(def.env)) : config[f.k]))
    if (input.modo !== "apagada" && missing.length) throw DomainError.validation(`Falta: ${missing.map((f) => f.l).join(", ")}`)
    if (kind === "adsense" && input.modo !== "apagada") {
      if (!/^ca-pub-\d{10,20}$/.test(String(config.client ?? "").trim())) throw DomainError.validation("El id de cliente debe verse así: ca-pub-1234567890123456")
      if (!/^\d{6,20}$/.test(String(config.slot ?? "").trim())) throw DomainError.validation("El id del bloque de anuncios debe ser solo números.")
      config.client = String(config.client).trim()
      config.slot = String(config.slot).trim()
    }
    let warn: string | undefined
    if (kind === "whatsapp") {
      for (const k of ["phoneId", "wabaId", "template", "lang"]) if (typeof config[k] === "string") config[k] = String(config[k]).trim()
      if (config.phoneId && !/^\d{6,25}$/.test(String(config.phoneId))) throw DomainError.validation("El ID del número de teléfono son solo números (Phone number ID).")
      if (config.wabaId && !/^\d{6,25}$/.test(String(config.wabaId))) throw DomainError.validation("El ID de la cuenta de WhatsApp Business son solo números.")
      delete config.tplSpec
      // Con la cuenta de WhatsApp Business se lee de Meta la plantilla por defecto (estructura, idioma y estado).
      if (config.template && config.wabaId && secrets.token) {
        try {
          const lang = await this.port.templateLang({ kind, enabled: true, config, secrets })
          if (lang) config.lang = lang
        } catch (e) {
          warn = `Guardado, pero no pudimos leer la plantilla: ${(e as Error).message}`
        }
      } else if (config.template) warn = "Guardado. Sin el ID de la cuenta de WhatsApp Business, Mirai envía la plantilla con un solo parámetro (el resumen) y no puede administrar plantillas."
    }
    // La última prueba se conserva (la consola la muestra junto a la integración).
    const last = Object.fromEntries(Object.entries(prev?.row.meta ?? {}).filter(([k]) => ["lastTest", "lastOk", "lastMsg"].includes(k)))
    await this.store.upsert(SYS, "platform_integrations", [{
      kind, modo: input.modo, planes: input.planes, config, meta: { ...last, ...meta },
      secrets_enc: Object.keys(secrets).length ? this.crypto.encrypt(JSON.stringify(secrets)) : null, updated_by: this.ctx.user.id, updated_at: new Date().toISOString(),
    }], { onConflict: ["kind"] })
    await this.audit("integración global", kind, { modo: input.modo, planes: input.planes })
    return { msg: "Integración guardada.", ...(warn ? { warn } : {}) }
  }

  private async setLastTest(kind: string, lastOk: boolean, lastMsg: string) {
    const r = await this.store.first<{ meta: Record<string, unknown> | null }>(SYS, "platform_integrations", { columns: ["meta"], eq: { kind } })
    if (!r) return
    await this.store.update(SYS, "platform_integrations", { eq: { kind } }, { meta: { ...(r.meta ?? {}), lastTest: new Date().toISOString(), lastOk, lastMsg } })
  }

  /** adminTestGlobal: el resultado es dato ({ ok, msg }), también cuando el proveedor falla. */
  async testIntegration(kind: string): Promise<{ ok: boolean; msg: string }> {
    const def = this.def(kind)
    const g = await this.global(kind)
    const keyless = !def.fields.some((f) => f.required)
    if (!g && !keyless) return { ok: false, msg: "Primero guarda la configuración." }
    const fila = !!g && !g.desdeEnv
    const v: IntegrationValue = { kind, enabled: true, config: g?.config ?? {}, secrets: g?.secrets ?? {} }
    const { user } = await this.access.actor()
    const mail = EMAIL_KINDS.includes(kind)
    const log = { user_id: user.id, channel: "email", kind: "prueba_admin", provider: kind, source: "plataforma", destino: maskDest("email", user.email) }
    try {
      const r = await this.port.test(v, def, user.email)
      if (mail) await this.logSend({ ...log, status: "enviado", ref: r.ref ?? null })
      if (fila) await this.setLastTest(kind, true, r.msg)
      return { ok: true, msg: r.msg }
    } catch (e) {
      const msg = this.port.errorMsg(e, def.url)
      if (mail) await this.logSend({ ...log, status: "fallido", error: msg })
      if (fila) await this.setLastTest(kind, false, msg)
      return { ok: false, msg }
    }
  }

  /** adminSendTest: un mensaje real con la configuración global (aunque esté apagada) al destino que escribas. */
  async sendTest(kind: string, to: string): Promise<{ ok: boolean; msg: string }> {
    this.def(kind)
    const isMail = EMAIL_KINDS.includes(kind)
    if (!isMail && kind !== "whatsapp") throw DomainError.validation("Solo correo y WhatsApp tienen envío de prueba.")
    const channel = isMail ? "email" : "whatsapp"
    const dest = to.trim()
    if (isMail && !z.email().safeParse(dest).success) throw DomainError.validation("Escribe un correo válido.")
    const phone = isMail ? null : normalizeCoPhone(dest)
    if (!isMail && !phone) throw DomainError.validation("Escribe un celular de Colombia de 10 dígitos (por ejemplo 315 123 4567).")
    const g = await this.global(kind)
    if (!g) throw DomainError.validation("Primero guarda la configuración.")
    const { user } = await this.access.actor()
    const v: IntegrationValue = { kind, enabled: true, config: g.config, secrets: g.secrets, source: "plataforma" }
    const base = { user_id: user.id, channel, kind: "prueba_admin", provider: kind, source: "plataforma", destino: maskDest(channel, isMail ? dest : phone) }
    try {
      const r = await this.port.sendTest(v, channel, isMail ? dest : phone!, user.nombre)
      await this.logSend({ ...base, status: "enviado", ref: r.ref })
      await this.audit("envío de prueba", kind, { destino: base.destino })
      return { ok: true, msg: r.msg }
    } catch (e) {
      const msg = (e as Error).message || "Error desconocido"
      await this.logSend({ ...base, status: "fallido", error: msg })
      return { ok: false, msg }
    }
  }

  // ── WhatsApp de la consola ──────────────────────────────────────────────────────────────────────────────────

  private async wa(): Promise<IntegrationValue | null> {
    const g = await this.global("whatsapp")
    return g ? { kind: "whatsapp", enabled: g.row.modo !== "apagada", config: g.config, secrets: g.secrets, source: "plataforma" } : null
  }

  private caso(c: string) {
    if (!(WA_CASE_KEYS as string[]).includes(c)) throw DomainError.validation("Caso de WhatsApp desconocido.")
    return c
  }

  /** Las asignaciones solo usan variables conocidas (o un texto fijo). */
  private checkMap(map: Record<string, { src: string }> | undefined) {
    const vars = new Set<string>(WA_VARS.map((x) => x.k))
    for (const m of Object.values(map ?? {})) if (m.src !== "fijo" && !vars.has(m.src)) throw DomainError.validation(`Variable desconocida: ${m.src}.`)
  }

  async waState(fresh: boolean) {
    const v = await this.wa()
    const settings = waSettings(v?.config)
    const out = {
      ok: true, activa: !!v?.enabled, configurada: !!(v?.secrets.token && v.config.phoneId), tieneWaba: !!String(v?.config.wabaId ?? "").trim(),
      settings: settings as unknown as Record<string, unknown>, templates: [] as Record<string, unknown>[], defaultImage: this.port.defaultHeaderImage(), base: settings.enlaceBase || this.port.publicSiteUrl(),
    } as { ok: boolean; msg?: string; activa: boolean; configurada: boolean; tieneWaba: boolean; numero?: string; settings: Record<string, unknown>; templates: Record<string, unknown>[]; defaultImage: string; base: string }
    if (!v || !out.tieneWaba || !v.secrets.token)
      return { ...out, ok: false, msg: !v ? NO_WA : "Guarda el ID de la cuenta de WhatsApp Business y el token en Integraciones globales para administrar las plantillas." }
    try {
      const [templates, numero] = await Promise.all([this.port.waTemplates(v, fresh), this.port.waNumber(v)])
      out.templates = templates.sort((a, b) => String(a.name).localeCompare(String(b.name)) || String(a.language).localeCompare(String(b.language)))
      if (numero) out.numero = numero
      return out
    } catch (e) {
      return { ...out, ok: false, msg: (e as Error).message || "Error desconocido" }
    }
  }

  async waSaveSettings(s: { template: string; lang: string; map: Record<string, { src: string }>; headerImage: string; enlaceBase: string; casos: Record<string, WaCaseOverride & { map?: Record<string, { src: string }> }> }): Promise<Msg> {
    for (const k of Object.keys(s.casos)) this.caso(k)
    this.checkMap(s.map)
    for (const c of Object.values(s.casos)) this.checkMap(c.map)
    // Con WhatsApp encendido desde las variables del servidor todavía no hay fila: estos ajustes (plantilla por caso,
    // imagen del encabezado) la crean, sin tocar el token, que se queda en el servidor.
    if (!(await this.global("whatsapp"))) throw DomainError.validation(NO_WA)
    const prev = await this.row("whatsapp")
    // Solo se guardan los casos con algo propio.
    const casos = Object.fromEntries(Object.entries(s.casos).filter(([, c]) => c && (c.template || c.headerImage)).map(([k, c]) => [k, c.template ? c : { headerImage: c.headerImage }]))
    const config: Record<string, unknown> = { ...(prev?.config ?? {}), template: s.template, lang: s.lang, wa: { map: s.map, headerImage: s.headerImage, enlaceBase: s.enlaceBase.replace(/\/+$/, ""), casos } }
    delete config.tplSpec
    await this.store.upsert(SYS, "platform_integrations", [{
      kind: "whatsapp", modo: prev?.row.modo ?? "obligatoria", planes: prev?.row.planes ?? [], config, meta: prev?.row.meta ?? {},
      secrets_enc: prev?.row.secrets_enc ?? null, updated_by: this.ctx.user.id, updated_at: new Date().toISOString(),
    }], { onConflict: ["kind"] })
    await this.audit("whatsapp: ajustes de plantillas", "whatsapp", { template: s.template, lang: s.lang, casos: Object.fromEntries(Object.entries(casos).map(([k, c]) => [k, (c as { template?: string }).template ?? "(por defecto)"])) })
    return { msg: "Ajustes de WhatsApp guardados." }
  }

  async waPreview(caso: string, override?: WaCaseOverride) {
    this.caso(caso)
    this.checkMap(override?.map as Record<string, { src: string }> | undefined)
    const v = await this.wa()
    if (!v) throw DomainError.validation(NO_WA)
    try {
      return await this.port.waPreview(v, caso, override)
    } catch (e) {
      throw DomainError.upstream((e as Error).message || "Meta no respondió. Intenta de nuevo en un momento.", e)
    }
  }

  async waSendTest(input: { caso: string; to: string; override?: WaCaseOverride }) {
    const caso = this.caso(input.caso)
    this.checkMap(input.override?.map as Record<string, { src: string }> | undefined)
    const dest = normalizeCoPhone(input.to)
    if (!dest) throw DomainError.validation("Escribe un celular de Colombia de 10 dígitos (por ejemplo 315 123 4567).")
    const v = await this.wa()
    if (!v) throw DomainError.validation(NO_WA)
    const { user } = await this.access.actor()
    const base = { user_id: user.id, channel: "whatsapp", kind: `prueba_admin:${caso}`, provider: "whatsapp", source: "plataforma", destino: maskDest("whatsapp", dest) }
    try {
      const r = await this.port.waSend(v, dest, caso, input.override, user.nombre)
      await this.logSend({ ...base, status: "enviado", ref: r.ref })
      await this.audit("whatsapp: probar plantilla", caso, { destino: base.destino })
      return { msg: r.msg, preview: r.preview }
    } catch (e) {
      const msg = (e as Error).message || "Error desconocido"
      await this.logSend({ ...base, status: "fallido", error: msg })
      throw DomainError.upstream(msg, e)
    }
  }

  // ── V7-H3: plantillas en Meta (adminWaSaveTemplate / adminWaDeleteTemplate de la web) ──────────────────────────

  async waSaveTemplate(draft: TemplateDraft, edit?: { id: string; status?: string }): Promise<Msg> {
    const check = validateDraft(draft, { editing: !!edit })
    if (check.errors.length) throw DomainError.validation(check.errors.join(" "))
    const v = await this.wa()
    if (!v) throw DomainError.validation(NO_WA)
    if (edit && !canEdit(edit.status)) throw DomainError.validation("Meta no deja editar una plantilla mientras está en revisión. Espera el resultado.")
    try {
      if (edit) {
        await this.port.waEditTemplate(v, edit.id, draft)
        await this.audit("whatsapp: editar plantilla", draft.name, { lang: draft.language, category: draft.category })
        return { msg: `Enviamos los cambios de “${draft.name}” a Meta. Vuelve a revisión y suele tardar de minutos a 24 horas.` }
      }
      const r = await this.port.waCreateTemplate(v, draft)
      await this.audit("whatsapp: crear plantilla", draft.name, { lang: draft.language, category: draft.category, status: r.status })
      return { msg: `Plantilla “${draft.name}” enviada a Meta (estado: ${r.status === "APPROVED" ? "aprobada" : r.status === "REJECTED" ? "rechazada" : "en revisión"}). Te avisamos el estado aquí al refrescar.` }
    } catch (e) {
      if (e instanceof DomainError) throw e
      throw DomainError.upstream((e as Error).message || "Error desconocido", e)
    }
  }

  async waDeleteTemplate(name: string, id?: string): Promise<Msg> {
    const v = await this.wa()
    if (!v) throw DomainError.validation(NO_WA)
    const hsm = id && /^\d{5,30}$/.test(id) ? id : undefined
    try {
      await this.port.waDeleteTemplate(v, name, hsm)
    } catch (e) {
      throw DomainError.upstream((e as Error).message || "Error desconocido", e)
    }
    await this.audit("whatsapp: eliminar plantilla", name, { id })
    const s = waSettings(v.config)
    const enUso = s.template === name || Object.values(s.casos).some((c) => c?.template === name)
    return { msg: `Plantilla “${name}” eliminada en Meta.${enUso ? " Ojo: estaba asignada a un caso; escoge otra en “Casos de envío”." : ""} Meta no deja reutilizar el nombre durante 30 días.` }
  }

  // ── V7-H3: historial de comunicados (ComunicadosPanel) ──────────────────────────────────────────────────────

  async broadcasts(): Promise<BroadcastRow[]> {
    const rows = await this.store.select<BroadcastRow>(SYS, "broadcasts", { order: [{ column: "created_at", ascending: false }], limit: 100 })
    return rows.map((b) => ({ ...b, href: b.href ?? null, created_by: b.created_by ?? null, enviados: num(b.enviados) }))
  }
}

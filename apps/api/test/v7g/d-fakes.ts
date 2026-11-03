// Dobles del grupo D de V7-G (planes, contador y consola): proveedores de integraciones, Meta y correo sin red.
// Guardan cada llamada para revisar qué pidió el servicio (sin secretos en las respuestas).
import type { RawAppContext } from "@mirai/domain/app-context"
import type { IntegrationDef } from "@mirai/services/integrations/registry"
import type { IntegrationValue } from "@mirai/services/integrations/store"
import { PlatformIntegrationsPort, type WaCaseOverride } from "../../src/modules/admin/platform-integrations.port"
import { SiteUrl } from "../../src/modules/households/site-url"
import { AccountantMailer } from "../../src/modules/tax/accountant-mailer"
import { H_GRATIS, rawFor, USERS } from "../setup/fixtures"

export const SITE = "https://mirai.test"
export const site = () => Object.assign(Object.create(SiteUrl.prototype) as SiteUrl, { base: SITE })

const id = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`
/** Hogar Gratis propio del dueño (para probar el 402) y su libro. */
export const H_FREE = id(400)
export const B_FREE = id(401)
const premium = { id: "premium", nombre: "Premium", funciones: ["ia", "banco", "impuestos", "familia"], anuncios: false, limites: { libros: 5, personas: 8 }, precio_mes: 14900 }
const gratis = { id: "gratis", nombre: "Gratis", funciones: [], anuncios: true, limites: { libros: 1, personas: 2 }, precio_mes: 0 }

/** Contexto de las pruebas del contador: el hogar de los 5 roles es Premium y el dueño tiene además un hogar Gratis. */
export function premiumContext(userId: string): RawAppContext {
  const raw = rawFor(userId)
  raw.households = raw.households.map((h) => (h.id === H_GRATIS ? { ...h, plan: premium } : h))
  if (userId === USERS.owner) {
    raw.households.push({ id: H_FREE, nombre: "Arriendos", role: "owner", access_role: "owner", plan: gratis })
    raw.books.push({ id: B_FREE, nombre: "Arriendos", tipo: "otro", icon: "home", household_id: H_FREE, is_default: true } as (typeof raw.books)[number])
  }
  return raw
}

export class FakeMailer extends AccountantMailer {
  sent: { householdId: string; to: string; owner: string; url: string }[] = []
  fail = false
  on = true
  async send(o: { householdId: string; to: string; owner: string; url: string }) {
    if (this.fail) throw new Error("SMTP caído")
    if (!this.on) return false
    this.sent.push(o)
    return true
  }
}

export class FakePlatformIntegrations extends PlatformIntegrationsPort {
  env = new Set<string>()
  tests: { kind: string; config: Record<string, unknown>; secretKeys: string[]; adminEmail: string }[] = []
  testError: Error | null = null
  lang: string | null = "es_CO"
  langError: Error | null = null
  sends: { channel: string; dest: string; nombre: string }[] = []
  sendError: Error | null = null
  templates: Record<string, unknown>[] = [{ name: "resumen", language: "es_CO", status: "APPROVED" }, { name: "aviso", language: "es_CO", status: "APPROVED" }, { name: "aviso", language: "en_US", status: "PAUSED" }]
  waSends: { dest: string; caso: string; override?: WaCaseOverride; nombre: string }[] = []

  hasEnv(name: string) {
    return this.env.has(name)
  }
  publicSiteUrl() {
    return SITE
  }
  defaultHeaderImage() {
    return `${SITE}/brand/whatsapp-header.png`
  }
  errorMsg(e: unknown) {
    return `El proveedor dijo: ${(e as Error).message}`
  }
  async test(v: IntegrationValue, def: IntegrationDef, adminEmail: string) {
    this.tests.push({ kind: def.kind, config: v.config, secretKeys: Object.keys(v.secrets), adminEmail })
    if (this.testError) throw this.testError
    return { msg: `Conexión exitosa con ${def.n}.`, ref: def.kind.startsWith("email_") ? "msg-123" : null }
  }
  async templateLang() {
    if (this.langError) throw this.langError
    return this.lang
  }
  async sendTest(_v: IntegrationValue, channel: "email" | "whatsapp", dest: string, nombre: string) {
    if (this.sendError) throw this.sendError
    this.sends.push({ channel, dest, nombre })
    return { msg: `Prueba enviada a ${dest}.`, ref: "ref-1" }
  }
  async waTemplates() {
    return this.templates.map((t) => ({ ...t }))
  }
  async waNumber() {
    return "+57 300 000 0000 · Mirai"
  }
  async waPreview(_v: IntegrationValue, caso: string) {
    return { preview: [{ key: "1", label: "Nombre", value: "Ana", src: "nombre" }], template: `resumen (es_CO) · ${caso}` }
  }
  async waSend(_v: IntegrationValue, dest: string, caso: string, override: WaCaseOverride | undefined, nombre: string) {
    if (this.sendError) throw this.sendError
    this.waSends.push({ dest, caso, override, nombre })
    return { msg: `Enviado a ${dest}.`, ref: "wamid.1", preview: [{ key: "1", label: "Nombre", value: nombre, src: "nombre" }] }
  }
}

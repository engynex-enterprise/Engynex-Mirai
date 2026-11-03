// V7-G (grupo D): consola › Planes, Cupones, Integraciones globales y WhatsApp con la app real, RowStore en memoria y
// un doble de los proveedores (sin red). Revisa @PlatformAdmin en todas las rutas, admin_audit en cada comando,
// secretos cifrados que nunca salen en las respuestas, los mensajes en español de la web y el registro de envíos.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"
import type { AppRoute } from "@ts-rest/core"
import { adminPlatformContract } from "@mirai/contracts/modules/admin-platform"
import { adminContract, adminCoreContract } from "@mirai/contracts/modules/admin"
import { CryptoService } from "../../src/core/crypto/crypto.service"
import { PlatformIntegrationsPort } from "../../src/modules/admin/platform-integrations.port"
import { USERS } from "../setup/fixtures"
import { createV7gApp, type V7gApp } from "./app"
import { FakePlatformIntegrations } from "./d-fakes"

let t: V7gApp
const port = new FakePlatformIntegrations()
const A = "/v1/admin"
const audits = () => t.fx.rows.all<{ actor: string; accion: string; objetivo: string | null; detalle: Record<string, unknown> }>("admin_audit")
const crypto = () => t.app.get(CryptoService)
const SECRET = "123456:ABC-token-super-secreto"

beforeAll(async () => {
  t = await createV7gApp({ overrides: [[PlatformIntegrationsPort, port]] })
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => {
  t.fx.rows.reset()
  Object.assign(port, { tests: [], sends: [], waSends: [], testError: null, sendError: null, langError: null, lang: "es_CO" })
  port.env.clear()
})

describe("contrato y guardas", () => {
  it("adminContract = las 30 rutas de F2-I + las 15 de V7-G, sin repetir rutas", () => {
    expect(Object.keys(adminCoreContract)).toHaveLength(30)
    expect(Object.keys(adminPlatformContract)).toHaveLength(15)
    const routes = Object.values(adminContract) as AppRoute[]
    expect(routes).toHaveLength(45)
    expect(new Set(routes.map((r) => `${r.method} ${r.path}`)).size).toBe(45)
  })

  it("todas las rutas nuevas: 403 a quien no es administrador y 401 sin sesión", async () => {
    for (const r of Object.values(adminPlatformContract) as AppRoute[]) {
      const url = r.path.replace(":planId", "familia").replace(":codigo", "HOLA").replace(":kind", "telegram")
      const res = await t.call(r.method as "GET", url, "admin", r.method === "GET" ? undefined : {})
      expect(res.status, `${r.method} ${r.path}`).toBe(403)
      expect(res.body.msg).toBe("Solo el administrador de Mirai puede ver esto.")
      expect((await t.call(r.method as "GET", url, null, r.method === "GET" ? undefined : {})).status).toBe(401)
    }
    expect(audits()).toEqual([])
  })

  it("ninguna respuesta de la consola nueva trae campos de secretos", () => {
    const keys = (s: z.ZodType, out: string[] = []): string[] => {
      const def = (s as unknown as { def: { type: string; shape?: Record<string, z.ZodType>; element?: z.ZodType; innerType?: z.ZodType; options?: z.ZodType[] } }).def
      if (def.type === "object")
        for (const [k, v] of Object.entries(def.shape!)) {
          out.push(k)
          keys(v, out)
        }
      else if (def.type === "array") keys(def.element!, out)
      else if (["optional", "nullable", "default"].includes(def.type)) keys(def.innerType!, out)
      else if (def.type === "union") for (const o of def.options!) keys(o, out)
      return out
    }
    const all = (Object.values(adminPlatformContract) as AppRoute[]).flatMap((r) => keys(r.responses[200] as z.ZodType))
    expect(all.filter((k) => /secret|token|apiKey|password|hash/i.test(k))).toEqual([])
  })
})

describe("planes", () => {
  beforeEach(() => {
    t.fx.rows.seed("plans", [
      { id: "premium", nombre: "Premium", descripcion: "", precio_mes: "14900", precio_anio: 149000, funciones: ["ia"], anuncios: false, limites: { libros: 5 }, activo: true, publico: true, destacado: true, orden: 2, ia_creditos: null },
      { id: "gratis", nombre: "Gratis", descripcion: "", precio_mes: 0, precio_anio: 0, funciones: [], anuncios: true, limites: {}, activo: true, publico: true, destacado: false, orden: 1, ia_creditos: null },
    ])
  })

  it("lista todos en orden, crea y edita con auditoría", async () => {
    const l = await t.call("GET", `${A}/plans`, "owner")
    expect((l.body as unknown as { id: string; precio_mes: number }[]).map((p) => [p.id, p.precio_mes])).toEqual([["gratis", 0], ["premium", 14900]])
    const c = await t.call("PUT", `${A}/plans/familia`, "owner", { nombre: "Familia", precio_mes: 9900, precio_anio: 99000, funciones: ["familia"], limites: { personas: 6, libros: undefined } })
    expect(c.body).toEqual({ ok: true, data: { creado: true, msg: "Plan guardado." } })
    expect(t.fx.rows.all("plans").find((p) => p.id === "familia")).toMatchObject({ nombre: "Familia", precio_mes: 9900, limites: { personas: 6 }, activo: true, publico: true })
    const g = await t.call("PUT", `${A}/plans/gratis`, "owner", { nombre: "Gratis", precio_mes: 5000, precio_anio: 50000, activo: false })
    expect(g.body.data).toEqual({ creado: false, msg: "Plan guardado." })
    expect(t.fx.rows.all("plans").find((p) => p.id === "gratis")).toMatchObject({ precio_mes: 0, precio_anio: 0, activo: true })
    expect(audits().map((a) => [a.actor, a.accion, a.objetivo])).toEqual([[USERS.owner, "crear plan", "familia"], [USERS.owner, "editar plan", "gratis"]])
    expect(t.fx.rows.scopesOf("admin_audit")).toEqual(["system", "system"])
  })

  it("precio mínimo, planes fijos y no encontrado", async () => {
    expect((await t.call("PUT", `${A}/plans/familia`, "owner", { nombre: "Familia", precio_mes: 500, precio_anio: 0 })).body).toMatchObject({ code: "VALIDATION", msg: "El precio mensual debe ser de al menos $1.000." })
    expect((await t.call("PUT", `${A}/plans/familia`, "owner", { nombre: "F", precio_mes: 9900, precio_anio: 0 })).status).toBe(400)
    expect((await t.call("DELETE", `${A}/plans/premium`, "owner")).body).toMatchObject({ code: "VALIDATION", msg: "Gratis y Premium son fijos: se pueden editar pero no borrar." })
    expect((await t.call("DELETE", `${A}/plans/nada`, "owner")).body).toMatchObject({ code: "NOT_FOUND", msg: "No encontramos ese plan." })
    t.fx.rows.seed("plans", [{ id: "familia", nombre: "Familia" }])
    expect((await t.call("DELETE", `${A}/plans/familia`, "owner")).body).toEqual({ ok: true, data: { msg: "Plan borrado." } })
    expect(audits().map((a) => a.accion)).toEqual(["borrar plan"])
  })
})

describe("cupones", () => {
  const C = { tipo: "porcentaje", valor: 20, periodos: ["mes", "anio"] }

  it("crea con el código en mayúsculas, edita sin cambiar el código y borra", async () => {
    const c = await t.call("PUT", `${A}/coupons/lanzamiento`, "owner", { ...C, descripcion: " 20 % " })
    expect(c.body).toEqual({ ok: true, data: { creado: true, msg: "Cupón creado." } })
    expect(t.fx.rows.all("coupons")).toMatchObject([{ codigo: "LANZAMIENTO", descripcion: "20 %", valor: 20, planes: [], desde: null, max_usos: null, activo: true }])
    const e = await t.call("PUT", `${A}/coupons/LANZAMIENTO`, "owner", { ...C, activo: false })
    expect(e.body.data).toEqual({ creado: false, msg: "Cupón guardado." })
    expect(t.fx.rows.all("coupons")).toHaveLength(1)
    expect((await t.call("GET", `${A}/coupons`, "owner")).body).toMatchObject([{ codigo: "LANZAMIENTO", activo: false }])
    expect((await t.call("DELETE", `${A}/coupons/lanzamiento`, "owner")).body).toEqual({ ok: true, data: { msg: "Cupón borrado." } })
    expect((await t.call("DELETE", `${A}/coupons/lanzamiento`, "owner")).body).toMatchObject({ code: "NOT_FOUND", msg: "No encontramos ese cupón." })
    expect(audits().map((a) => [a.accion, a.objetivo])).toEqual([["crear cupón", "LANZAMIENTO"], ["editar cupón", "LANZAMIENTO"], ["borrar cupón", "LANZAMIENTO"]])
  })

  it("validaciones en español", async () => {
    expect((await t.call("PUT", `${A}/coupons/HOLA`, "owner", { ...C, valor: 150 })).body).toMatchObject({ msg: "Un descuento en porcentaje va de 1 a 100." })
    expect((await t.call("PUT", `${A}/coupons/HOLA`, "owner", { ...C, desde: "2026-12-01", hasta: "2026-11-01" })).body).toMatchObject({ msg: "La fecha «Hasta» debe ser después de «Desde»." })
    expect(JSON.stringify((await t.call("PUT", `${A}/coupons/HOLA`, "owner", { ...C, periodos: [] })).body)).toContain("Elige al menos un periodo")
    expect(JSON.stringify((await t.call("PUT", `${A}/coupons/A!`, "owner", C)).body)).toContain("Usa de 3 a 30 letras")
    expect(t.fx.rows.all("coupons")).toEqual([])
  })
})

describe("integraciones globales", () => {
  it("guarda Telegram: el secreto queda cifrado, la respuesta y la lista solo ven la máscara", async () => {
    const r = await t.call("PUT", `${A}/integrations/telegram`, "owner", { modo: "por_defecto", planes: ["premium"], values: { botToken: SECRET, botName: "@MiraiBot" } })
    expect(r.body).toEqual({ ok: true, data: { msg: "Integración guardada." } })
    const [row] = t.fx.rows.all<Record<string, unknown>>("platform_integrations")
    expect(row).toMatchObject({ kind: "telegram", modo: "por_defecto", planes: ["premium"], config: { botName: "@MiraiBot" }, meta: { botToken: "••••reto" }, updated_by: USERS.owner })
    expect(JSON.parse(crypto().decrypt(String(row.secrets_enc)))).toEqual({ botToken: SECRET })
    const l = await t.call("GET", `${A}/integrations`, "owner")
    expect(l.raw).not.toContain(SECRET)
    expect(l.raw).not.toContain(String(row.secrets_enc))
    expect((l.body as unknown as { kind: string }[]).find((x) => x.kind === "telegram")).toMatchObject({ modo: "por_defecto", existe: true, guardada: true, meta: { botToken: "••••reto" } })
    const one = await t.call("GET", `${A}/integrations/telegram`, "owner")
    expect(one.body).toMatchObject({ kind: "telegram", adminOnly: true })
    expect(audits()).toMatchObject([{ accion: "integración global", objetivo: "telegram", detalle: { modo: "por_defecto", planes: ["premium"] } }])
  })

  it("un secreto vacío conserva el guardado; sin el obligatorio y encendida: «Falta: …»", async () => {
    expect((await t.call("PUT", `${A}/integrations/telegram`, "owner", { modo: "opcional", values: {} })).body).toMatchObject({ code: "VALIDATION", msg: "Falta: Token del bot" })
    expect((await t.call("PUT", `${A}/integrations/telegram`, "owner", { modo: "apagada", values: {} })).status).toBe(200)
    await t.call("PUT", `${A}/integrations/telegram`, "owner", { modo: "opcional", values: { botToken: SECRET } })
    await t.call("PUT", `${A}/integrations/telegram`, "owner", { modo: "obligatoria", values: { botToken: "  " } })
    const [row] = t.fx.rows.all<Record<string, unknown>>("platform_integrations")
    expect(JSON.parse(crypto().decrypt(String(row.secrets_enc)))).toEqual({ botToken: SECRET })
    expect(row.modo).toBe("obligatoria")
  })

  it("AdSense y WhatsApp validan sus identificadores; WhatsApp lee el idioma de la plantilla en Meta", async () => {
    expect((await t.call("PUT", `${A}/integrations/adsense`, "owner", { modo: "opcional", values: { client: "pub-1", slot: "123456" } })).body).toMatchObject({ msg: "El id de cliente debe verse así: ca-pub-1234567890123456" })
    expect((await t.call("PUT", `${A}/integrations/whatsapp`, "owner", { modo: "apagada", values: { phoneId: "12a" } })).body).toMatchObject({ msg: "El ID del número de teléfono son solo números (Phone number ID)." })
    port.lang = "es_MX"
    const ok = await t.call("PUT", `${A}/integrations/whatsapp`, "owner", { modo: "apagada", values: { phoneId: " 1234567 ", wabaId: "7654321", template: "resumen", token: "EAAG-secreto" } })
    expect(ok.status).toBe(200)
    expect(t.fx.rows.all<Record<string, unknown>>("platform_integrations")[0].config).toMatchObject({ phoneId: "1234567", template: "resumen", lang: "es_MX" })
    port.langError = new Error("plantilla en revisión")
    const w = await t.call("PUT", `${A}/integrations/whatsapp`, "owner", { modo: "apagada", values: {} })
    expect(w.body.data).toEqual({ msg: "Integración guardada.", warn: "Guardado, pero no pudimos leer la plantilla: plantilla en revisión" })
  })

  it("integración desconocida: 404", async () => {
    expect((await t.call("GET", `${A}/integrations/no_existe`, "owner")).body).toMatchObject({ code: "NOT_FOUND", msg: "Integración desconocida." })
    expect((await t.call("PUT", `${A}/integrations/no_existe`, "owner", { modo: "apagada" })).status).toBe(404)
  })

  it("probar: sin configuración, bien (guarda la última prueba) y mal (mensaje del proveedor); el correo queda en el registro", async () => {
    expect((await t.call("POST", `${A}/integrations/telegram/test`, "owner")).body).toEqual({ ok: true, data: { ok: false, msg: "Primero guarda la configuración." } })
    await t.call("PUT", `${A}/integrations/telegram`, "owner", { modo: "opcional", values: { botToken: SECRET } })
    const r = await t.call("POST", `${A}/integrations/telegram/test`, "owner")
    expect(r.body.data).toEqual({ ok: true, msg: "Conexión exitosa con Telegram." })
    expect(port.tests).toMatchObject([{ kind: "telegram", secretKeys: ["botToken"], adminEmail: "owner@correo.co" }])
    expect(t.fx.rows.all<Record<string, unknown>>("platform_integrations")[0].meta).toMatchObject({ botToken: "••••reto", lastOk: true, lastMsg: "Conexión exitosa con Telegram." })
    port.testError = new Error("401 token inválido")
    expect((await t.call("POST", `${A}/integrations/telegram/test`, "owner")).body.data).toEqual({ ok: false, msg: "El proveedor dijo: 401 token inválido" })
    // Datos sin clave: se prueban sin guardar nada antes.
    port.testError = null
    expect((await t.call("POST", `${A}/integrations/trm/test`, "owner")).body.data).toEqual({ ok: true, msg: "Conexión exitosa con TRM del día." })
    await t.call("PUT", `${A}/integrations/email_resend`, "owner", { modo: "opcional", values: { apiKey: "re_123456", from: "Mirai <hola@mirai.co>" } })
    await t.call("POST", `${A}/integrations/email_resend/test`, "owner")
    expect(t.fx.rows.all("notification_log")).toMatchObject([{ user_id: USERS.owner, channel: "email", kind: "prueba_admin", status: "enviado", ref: "msg-123", destino: "ow•••@correo.co" }])
  })

  it("envío de prueba: valida el destino, registra el envío enmascarado y audita", async () => {
    expect((await t.call("POST", `${A}/integrations/telegram/send-test`, "owner", { to: "x@y.co" })).body).toMatchObject({ msg: "Solo correo y WhatsApp tienen envío de prueba." })
    expect((await t.call("POST", `${A}/integrations/email_resend/send-test`, "owner", { to: "no-es-correo" })).body).toMatchObject({ msg: "Escribe un correo válido." })
    expect((await t.call("POST", `${A}/integrations/whatsapp/send-test`, "owner", { to: "12345" })).body).toMatchObject({ msg: "Escribe un celular de Colombia de 10 dígitos (por ejemplo 315 123 4567)." })
    expect((await t.call("POST", `${A}/integrations/whatsapp/send-test`, "owner", { to: "315 123 4567" })).body).toMatchObject({ msg: "Primero guarda la configuración." })
    await t.call("PUT", `${A}/integrations/whatsapp`, "owner", { modo: "apagada", values: { phoneId: "1234567", token: "EAAG" } })
    const r = await t.call("POST", `${A}/integrations/whatsapp/send-test`, "owner", { to: "315 123 4567" })
    expect(r.body.data).toEqual({ ok: true, msg: "Prueba enviada a 573151234567." })
    expect(port.sends).toEqual([{ channel: "whatsapp", dest: "573151234567", nombre: "Ana" }])
    port.sendError = new Error("Meta: número no registrado")
    expect((await t.call("POST", `${A}/integrations/whatsapp/send-test`, "owner", { to: "3151234567" })).body.data).toEqual({ ok: false, msg: "Meta: número no registrado" })
    expect(t.fx.rows.all("notification_log").map((l) => [l.status, l.destino])).toEqual([["enviado", "+57 315 ••• 4567"], ["fallido", "+57 315 ••• 4567"]])
    expect(audits().map((a) => a.accion)).toEqual(["integración global", "envío de prueba"])
  })
})

describe("WhatsApp de la consola", () => {
  const SETTINGS = { template: "resumen", lang: "es_CO", map: { "1": { src: "nombre" } }, headerImage: "", enlaceBase: "https://mirai.engynex.com/", casos: { pagos: { template: "aviso" }, metas: {}, invitacion: { headerImage: "https://img.co/x.png" } } }

  it("sin configurar: lo dice; con cuenta y token: plantillas ordenadas y el número", async () => {
    expect((await t.call("GET", `${A}/whatsapp/templates`, "owner")).body).toMatchObject({ ok: false, msg: "Primero configura WhatsApp en Integraciones globales.", templates: [] })
    t.fx.rows.seed("platform_integrations", [{ kind: "whatsapp", modo: "opcional", planes: [], config: { phoneId: "1234567", wabaId: "7654321", template: "resumen" }, meta: {}, secrets_enc: crypto().encrypt(JSON.stringify({ token: "EAAG" })) }])
    const r = await t.call("GET", `${A}/whatsapp/templates?fresh=1`, "owner")
    expect(r.body).toMatchObject({ ok: true, activa: true, configurada: true, tieneWaba: true, numero: "+57 300 000 0000 · Mirai", base: "https://mirai.test" })
    expect((r.body.templates as { name: string; language: string }[]).map((x) => `${x.name}/${x.language}`)).toEqual(["aviso/en_US", "aviso/es_CO", "resumen/es_CO"])
    expect(r.raw).not.toContain("EAAG")
  })

  it("guarda los ajustes (solo los casos con algo propio) y audita; casos o variables desconocidas → 400", async () => {
    expect((await t.call("PUT", `${A}/whatsapp/templates`, "owner", SETTINGS)).body).toMatchObject({ msg: "Primero configura WhatsApp en Integraciones globales." })
    t.fx.rows.seed("platform_integrations", [{ kind: "whatsapp", modo: "opcional", planes: [], config: { phoneId: "1234567", tplSpec: { viejo: true } }, meta: {}, secrets_enc: null }])
    const r = await t.call("PUT", `${A}/whatsapp/templates`, "owner", SETTINGS)
    expect(r.body).toEqual({ ok: true, data: { msg: "Ajustes de WhatsApp guardados." } })
    const cfg = t.fx.rows.all<Record<string, unknown>>("platform_integrations")[0].config as Record<string, unknown>
    expect(cfg).toEqual({ phoneId: "1234567", template: "resumen", lang: "es_CO", wa: { map: { "1": { src: "nombre" } }, headerImage: "", enlaceBase: "https://mirai.engynex.com", casos: { pagos: { template: "aviso" }, invitacion: { headerImage: "https://img.co/x.png" } } } })
    expect(audits()).toMatchObject([{ accion: "whatsapp: ajustes de plantillas", detalle: { casos: { pagos: "aviso", invitacion: "(por defecto)" } } }])
    expect((await t.call("PUT", `${A}/whatsapp/templates`, "owner", { ...SETTINGS, casos: { inventado: {} } })).body).toMatchObject({ msg: "Caso de WhatsApp desconocido." })
    expect((await t.call("PUT", `${A}/whatsapp/templates`, "owner", { ...SETTINGS, map: { "1": { src: "clave" } } })).body).toMatchObject({ msg: "Variable desconocida: clave." })
  })

  it("vista previa y prueba de una plantilla (Meta falla → 502 con su mensaje)", async () => {
    t.fx.rows.seed("platform_integrations", [{ kind: "whatsapp", modo: "apagada", planes: [], config: { phoneId: "1234567" }, meta: {}, secrets_enc: crypto().encrypt(JSON.stringify({ token: "EAAG" })) }])
    expect((await t.call("POST", `${A}/whatsapp/preview`, "owner", { caso: "pagos" })).body.data).toEqual({ preview: [{ key: "1", label: "Nombre", value: "Ana", src: "nombre" }], template: "resumen (es_CO) · pagos" })
    expect((await t.call("POST", `${A}/whatsapp/test`, "owner", { caso: "pagos", to: "300" })).status).toBe(400)
    const r = await t.call("POST", `${A}/whatsapp/test`, "owner", { caso: "cobro_tercero", to: "+57 315 123 4567", override: { template: "aviso" } })
    expect(r.body.data).toEqual({ msg: "Enviado a 573151234567.", preview: [{ key: "1", label: "Nombre", value: "Ana", src: "nombre" }] })
    expect(port.waSends).toEqual([{ dest: "573151234567", caso: "cobro_tercero", override: { template: "aviso" }, nombre: "Ana" }])
    port.sendError = new Error("(#132001) La plantilla no existe")
    const f = await t.call("POST", `${A}/whatsapp/test`, "owner", { caso: "pagos", to: "3151234567" })
    expect(f).toMatchObject({ status: 502, body: { code: "UPSTREAM", msg: "(#132001) La plantilla no existe" } })
    expect(t.fx.rows.all("notification_log").map((l) => [l.kind, l.status])).toEqual([["prueba_admin:cobro_tercero", "enviado"], ["prueba_admin:pagos", "fallido"]])
    expect(audits().map((a) => [a.accion, a.objetivo])).toEqual([["whatsapp: probar plantilla", "cobro_tercero"]])
  })
})

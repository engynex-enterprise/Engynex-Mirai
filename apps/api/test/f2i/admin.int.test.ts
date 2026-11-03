// F2-I-5: consola de la plataforma. Todas las rutas con @PlatformAdmin, cada comando en admin_audit y ningún DTO con
// montos ni movimientos de los hogares (lo único con plata es lo que los hogares le pagan a Mirai).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { z } from "zod"
import type { AppRoute } from "@ts-rest/core"
import { adminCoreContract as adminContract } from "@mirai/contracts/modules/admin"
import { H_GRATIS, USERS } from "../setup/fixtures"
import { userToken } from "../setup/tokens"
import { createF2iApp, type F2iApp } from "./app"

let t: F2iApp
const ID = "33333333-3333-4333-8333-333333333333"

async function call(who: keyof typeof USERS, method: string, url: string, payload?: unknown) {
  const r = await t.app.inject({ method: method as "GET", url, payload: payload as object, headers: { authorization: `Bearer ${await userToken(USERS[who])}` } })
  return { status: r.statusCode, body: r.json() }
}
const pathOf = (r: AppRoute) => r.path.replace(":userId", USERS.editor).replace(":householdId", H_GRATIS).replace(/:\w+/g, ID)

beforeAll(async () => {
  t = await createF2iApp()
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => {
  t.fx.admin.audits = []
})

describe("@PlatformAdmin en toda la consola", () => {
  it("las 30 rutas responden 403 a quien no es administrador (aunque sea dueño de un hogar)", async () => {
    const routes = Object.values(adminContract) as AppRoute[]
    expect(routes).toHaveLength(30)
    for (const r of routes) {
      const res = await call("admin", r.method, pathOf(r), r.method === "GET" ? undefined : {})
      expect(res.status, `${r.method} ${r.path}`).toBe(403)
      expect(res.body.msg).toBe("Solo el administrador de Mirai puede ver esto.")
    }
    expect(t.fx.admin.audits).toEqual([])
  })

  it("sin sesión: 401", async () => {
    expect((await t.app.inject({ method: "GET", url: "/v1/admin/overview" })).statusCode).toBe(401)
  })
})

describe("lecturas", () => {
  it("resumen, clientes, hogares, ingresos, ficha y sistema validan contra el contrato", async () => {
    for (const p of ["overview", "clients", "households", "revenue", `users/${USERS.editor}`, "system", "audit", "admins", "feedback", "notify-log", "subscriptions", "test-defaults"]) {
      expect((await call("owner", "GET", `/v1/admin/${p}`)).status, p).toBe(200)
    }
    const u = (await call("owner", "GET", `/v1/admin/users/${USERS.owner}`)).body
    expect(u.perfil.doc).toBe("•••4050")
    expect(u.pagos[0]).not.toHaveProperty("pagador")
    const o = (await call("owner", "GET", "/v1/admin/overview")).body
    expect(o).toMatchObject({ personas: 6, hogares: 1, libros: 1, rating: { avg: 5, count: 1 }, opinionesNuevas: 1 })
  })
})

describe("cada comando queda en admin_audit", () => {
  const cases: [string, string, unknown, string][] = [
    ["POST", `users/${USERS.editor}/suspend`, { suspend: true }, "suspender usuario"],
    ["POST", `users/${USERS.editor}/recovery-link`, undefined, "enlace de contraseña"],
    ["PUT", `users/${USERS.editor}/platform-admin`, { on: true }, "dar administración"],
    ["POST", `users/${USERS.editor}/notes`, { texto: "Pidió ayuda con la renta" }, "nota interna"],
    ["DELETE", `notes/${ID}`, undefined, "borrar nota interna"],
    ["POST", "invitations", { email: "nueva@example.com", nombre: "Nueva" }, "invitar persona"],
    ["POST", `households/${H_GRATIS}/plan`, { plan: "premium", hasta: "2099-01-31", nota: "Convenio" }, "asignar plan"],
    ["POST", `households/${H_GRATIS}/courtesy`, { hasta: "2099-01-31", nota: "" }, "regalar premium"],
    ["DELETE", `households/${H_GRATIS}/courtesy`, undefined, "quitar cortesía"],
    ["POST", "payments", { householdId: H_GRATIS, plan: "premium", periodo: "mes", monto: 14900, nota: "Transferencia" }, "registrar pago manual"],
    ["PATCH", `payments/${ID}`, { factura_ref: "FE-001" }, "actualizar pago"],
    ["POST", "broadcasts", { titulo: "Novedades", cuerpo: "Hola", href: "/ayuda", segmento: "todos", correo: false }, "enviar comunicado"],
    ["PATCH", "settings", { aviso_global: "Mantenimiento el domingo" }, "ajustes de la plataforma"],
    ["POST", "system/clean-orphans", undefined, "borrar hogares vacíos"],
    ["PATCH", `feedback/${ID}`, { estado: "hecho", respuesta: "¡Gracias!" }, "responder opinión"],
  ]
  for (const [method, path, body, accion] of cases) {
    it(`${method} ${path} → ${accion}`, async () => {
      const r = await call("owner", method, `/v1/admin/${path}`, body)
      expect(r.status, JSON.stringify(r.body)).toBe(200)
      expect(t.fx.admin.audits.map((a) => a.accion)).toEqual([accion])
      expect(t.fx.admin.audits[0].actor).toBe(USERS.owner)
    })
  }

  it("responder una opinión va con la sesión del administrador (la base registra quién respondió)", async () => {
    await call("owner", "PATCH", `/v1/admin/feedback/${ID}`, { estado: "revisando" })
    expect(t.fx.admin.updatedFeedback.at(-1)).toEqual({ scope: "user", id: ID })
  })

  it("reglas: no se suspende a sí mismo, debe quedar un administrador y el correo debe coincidir", async () => {
    expect((await call("owner", "POST", `/v1/admin/users/${USERS.owner}/suspend`, { suspend: true })).body.msg).toBe("No puedes suspender tu propia cuenta.")
    t.fx.admin.admins = [{ user_id: USERS.owner, created_at: "" }, { user_id: USERS.viewer, created_at: "" }]
    t.fx.admin.admins = t.fx.admin.admins.slice(0, 1)
    expect((await call("owner", "PUT", `/v1/admin/users/${USERS.viewer}/platform-admin`, { on: false })).body.msg).toBe("Debe quedar al menos un administrador.")
    expect((await call("owner", "DELETE", `/v1/admin/users/${USERS.viewer}`, { confirmEmail: "otro@correo.co" })).body.msg).toBe("El correo no coincide.")
    expect(t.fx.admin.audits).toEqual([])
  })

  it("sin correo de la plataforma, el enlace de contraseña se devuelve para copiarlo", async () => {
    const r = await call("owner", "POST", `/v1/admin/users/${USERS.editor}/recovery-link`)
    expect(r.body.data).toMatchObject({ sent: false, link: expect.stringMatching(/^https:\/\//) })
    t.fx.mailer.on = true
    expect((await call("owner", "POST", `/v1/admin/users/${USERS.editor}/recovery-link`)).body.data).toEqual({ sent: true, msg: "Enviamos el enlace a editor@correo.co." })
    t.fx.mailer.on = false
  })
})

describe("privacidad: ningún DTO de la consola lleva montos ni movimientos de los hogares", () => {
  /** Campos de las finanzas de un hogar (libros): nunca deben salir en la consola. */
  const HOUSEHOLD_MONEY = /^(valor|saldo|saldos|bruto|neto|cupo|tope|deuda|deudas|gasto|gastos|ingreso|ingresos|movimiento|movimientos|expenses|incomes|transactions|presupuesto|patrimonio|reparto|cuota|cuotas|interes|deducciones|balance)$/i
  /** Lo único con plata: lo que los hogares le pagan a Mirai (ingresos de la plataforma). */
  const PLATFORM_REVENUE = new Set(["revenue.mrr", "revenue.ingresosMes", "revenue.ingresosTotal", "revenue.pagos[].monto", "user.pagos[].monto"])

  function keys(s: z.ZodType, path: string, out: string[]) {
    const def = (s as unknown as { def: { type: string; shape?: Record<string, z.ZodType>; element?: z.ZodType; innerType?: z.ZodType; options?: z.ZodType[]; items?: z.ZodType[]; valueType?: z.ZodType } }).def
    if (def.type === "object")
      for (const [k, v] of Object.entries(def.shape!)) {
        out.push(`${path}.${k}`)
        keys(v, `${path}.${k}`, out)
      }
    else if (def.type === "array") keys(def.element!, `${path}[]`, out)
    else if (["optional", "nullable", "default", "readonly"].includes(def.type)) keys(def.innerType!, path, out)
    else if (def.type === "union") for (const o of def.options!) keys(o, path, out)
    else if (def.type === "tuple") for (const o of def.items!) keys(o, `${path}[]`, out)
    else if (def.type === "record") keys(def.valueType!, `${path}{}`, out)
    return out
  }

  it("respuestas 200 de las 30 rutas", () => {
    const bad: string[] = []
    for (const [name, r] of Object.entries(adminContract) as [string, AppRoute][]) {
      const all = keys(r.responses[200] as z.ZodType, name, [])
      for (const p of all) {
        const k = p.split(".").pop()!.replace(/\[\]|\{\}/g, "")
        if (/monto|precio/i.test(k) && !PLATFORM_REVENUE.has(p.replace(/^(\w+)\.data\./, "$1."))) bad.push(p)
        if (HOUSEHOLD_MONEY.test(k)) bad.push(p)
      }
    }
    expect(bad).toEqual([])
  })

  it("la lista de excepciones existe de verdad (si se renombra un campo, la prueba avisa)", () => {
    const all = (Object.entries(adminContract) as [string, AppRoute][]).flatMap(([n, r]) => keys(r.responses[200] as z.ZodType, n, []))
    for (const p of PLATFORM_REVENUE) expect(all, p).toContain(p)
  })
})

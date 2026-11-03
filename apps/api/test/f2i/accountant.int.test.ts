// F2-I-4: portal del contador por token (AccountantTokenGuard): sin sesión, con SystemScope y límite por token.
import { createHash } from "node:crypto"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { B_GRATIS, B_PREMIUM, USERS } from "../setup/fixtures"
import { createF2iApp, type F2iApp } from "./app"
import { PLAN_ROWS } from "./fakes"

let t: F2iApp
const TOKEN = "TokenDelContador_0123456789abcdef"
const hash = (s: string) => createHash("sha256").update(s).digest("hex")
const get = (url: string) => t.app.inject({ method: "GET", url })

beforeAll(async () => {
  t = await createF2iApp()
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => {
  const a = t.fx.accountant
  a.shares = [{ id: "s-1", book_id: B_PREMIUM, label: "Contadora Luz", perms: "renta", expires_at: null, revoked_at: null, created_by: USERS.owner, views: 4, token_hash: hash(TOKEN) }]
  a.planOf = { [B_PREMIUM]: PLAN_ROWS.premium, [B_GRATIS]: PLAN_ROWS.gratis }
  a.views = []
  a.notes_ = []
  a.visible = new Set([`${B_PREMIUM}/renta/2025/certificado.pdf`])
})

describe("AccountantTokenGuard", () => {
  it("sin sesión: token mal formado, inexistente, revocado o vencido → 404 sin decir cuál", async () => {
    for (const tok of ["corto", "x".repeat(30), TOKEN]) {
      if (tok === TOKEN) t.fx.accountant.shares[0].revoked_at = new Date().toISOString()
      const r = await get(`/v1/accountant/${tok}`)
      expect(r.statusCode, tok).toBe(404)
      expect(r.json()).toMatchObject({ code: "NOT_FOUND", msg: "El acceso ya no está disponible." })
    }
    t.fx.accountant.shares[0].revoked_at = null
    t.fx.accountant.shares[0].expires_at = "2020-01-01T00:00:00Z"
    expect((await get(`/v1/accountant/${TOKEN}`)).statusCode).toBe(404)
  })

  it("abre el portal: suma una vista y con permiso 'renta' solo trae gastos desde el año anterior", async () => {
    const r = await get(`/v1/accountant/${TOKEN}`)
    expect(r.statusCode).toBe(200)
    const body = r.json()
    expect(body.share).toEqual({ id: "s-1", book_id: B_PREMIUM, label: "Contadora Luz", perms: "renta", expires_at: null, owner: "Ana" })
    expect(body.data.book.expenses.map((g: { id: string }) => g.id)).toEqual(["g2"])
    expect(t.fx.accountant.views).toEqual(["s-1"])
  })

  it("si el hogar bajó a un plan sin «impuestos»: bloqueado (y sin notas ni archivos)", async () => {
    t.fx.accountant.shares[0].book_id = B_GRATIS
    expect((await get(`/v1/accountant/${TOKEN}`)).json()).toEqual({ bloqueado: "plan" })
    expect(t.fx.accountant.views).toEqual([])
    expect((await get(`/v1/accountant/${TOKEN}/notes`)).statusCode).toBe(404)
  })

  it("notas del contador y documentos visibles (URL firmada solo dentro del libro)", async () => {
    const n = await t.app.inject({ method: "POST", url: `/v1/accountant/${TOKEN}/notes`, payload: { texto: "  Falta el certificado de ingresos  " } })
    expect(n.json()).toEqual({ ok: true, data: { saved: true } })
    expect((await get(`/v1/accountant/${TOKEN}/notes`)).json()).toMatchObject([{ autor: "contador", texto: "Falta el certificado de ingresos" }])
    const ok = await get(`/v1/accountant/${TOKEN}/files?path=${encodeURIComponent(`${B_PREMIUM}/renta/2025/certificado.pdf`)}`)
    expect(ok.json().url).toMatch(/^https:\/\/storage\.test\//)
    for (const p of [`${B_PREMIUM}/renta/2025/oculto.pdf`, `${B_GRATIS}/x.pdf`, `${B_PREMIUM}/../${B_GRATIS}/x.pdf`]) expect((await get(`/v1/accountant/${TOKEN}/files?path=${encodeURIComponent(p)}`)).json(), p).toEqual({ url: null })
  })

  it("límite portalContador por token (120 cada 10 minutos)", async () => {
    const tok = "OtroTokenDelContador_abcdefghijkl"
    t.fx.accountant.shares.push({ ...t.fx.accountant.shares[0], id: "s-2", token_hash: hash(tok) })
    let last = 0
    for (let i = 0; i < 121; i++) last = (await get(`/v1/accountant/${tok}/notes`)).statusCode
    expect(last).toBe(429)
  })
})

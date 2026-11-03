// V7-G (E2, E19, E24, E25): perfil, preferencias, libro activo y lo público de la plataforma, con la app real y
// RowStore en memoria. Revisa que todo vaya con la sesión de la persona (salvo el aviso público), los dígitos DIAN
// con cédula, la mezcla de `extra`, los errores en español y que no salgan datos de más.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { B_AJENO, B_GRATIS, B_PREMIUM, USERS } from "../setup/fixtures"
import { createV7gApp, type V7gApp } from "./app"

let t: V7gApp
const profile = (id: string) => ({
  id, email: "owner@correo.co", nombre: "Ana", apodo: "", avatar_url: null, nacimiento: null, doc: "", doc_tipo: "CC", digitos: "", telefono: "", ciudad: "",
  direccion: {}, ocupacion: "", trabajo: "", portada: "", riesgo: "moderado", cobro: [], last_book_id: null, created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z", deletion_requested_at: null,
})

beforeAll(async () => {
  t = await createV7gApp()
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => {
  t.fx.rows.reset()
  t.fx.rows.seed("profiles", [profile(USERS.owner), profile(USERS.viewer)])
})

describe("GET/PATCH /v1/me/profile", () => {
  it("lee y cambia solo el perfil propio, con la sesión de la persona", async () => {
    expect((await t.call("GET", "/v1/me/profile", "owner")).body).toMatchObject({ id: USERS.owner, nombre: "Ana" })
    const r = await t.call("PATCH", "/v1/me/profile", "owner", { nombre: "  Ana María ", avatar_url: "mirai:gato", telefono: "3001234567" })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ nombre: "Ana María", avatar_url: "mirai:gato", telefono: "3001234567" })
    const viewer = t.fx.rows.all<{ id: string; nombre: string }>("profiles").find((p) => p.id === USERS.viewer)
    expect(viewer?.nombre).toBe("Ana")
    expect(t.fx.rows.calls.every((c) => c.scope.kind === "user" && c.scope.userId === USERS.owner)).toBe(true)
  })

  it("con cédula los dígitos DIAN salen del documento (aunque se manden otros)", async () => {
    const r = await t.call("PATCH", "/v1/me/profile", "owner", { doc: "1.020.304.567", digitos: "11" })
    expect(r.body).toMatchObject({ doc: "1.020.304.567", digitos: "67" })
    const p = await t.call("PATCH", "/v1/me/profile", "owner", { doc_tipo: "PA", doc: "AB123", digitos: "45" })
    expect(p.body).toMatchObject({ doc_tipo: "PA", digitos: "45" })
  })

  it("la dirección arrastra la ciudad; datos inválidos salen en español", async () => {
    expect((await t.call("PATCH", "/v1/me/profile", "owner", { direccion: { dir: "Cra 7 # 1-2", ciudad: "Cali" } })).body).toMatchObject({ ciudad: "Cali" })
    const r = await t.call("PATCH", "/v1/me/profile", "owner", { avatar_url: "http://x.co/a.png", riesgo: "loco", nacimiento: "31/12/1990" })
    expect(r.status).toBe(400)
    const s = JSON.stringify(r.body)
    for (const m of ["Perfil de riesgo inválido", "Fecha inválida (usa AAAA-MM-DD)"]) expect(s).toContain(m)
    expect((await t.call("PATCH", "/v1/me/profile", "owner", {})).body).toMatchObject({ code: "VALIDATION" })
  })

  it("sin sesión → 401", async () => {
    expect((await t.call("GET", "/v1/me/profile", null)).status).toBe(401)
  })
})

describe("GET/PATCH /v1/me/preferences", () => {
  it("sin fila: los valores por defecto de la tabla", async () => {
    expect((await t.call("GET", "/v1/me/preferences", "viewer")).body).toMatchObject({ user_id: USERS.viewer, theme: "system", font_scale: "m", extra: {} })
  })

  it("upsert por persona y `extraPatch` mezcla sin pisar las otras llaves", async () => {
    await t.call("PATCH", "/v1/me/preferences", "owner", { theme: "dark", extra: { academia: { a1: true } } })
    const r = await t.call("PATCH", "/v1/me/preferences", "owner", { extraPatch: { fb_prompt_at: "2026-11-02" } })
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ theme: "dark", extra: { academia: { a1: true }, fb_prompt_at: "2026-11-02" } })
    expect(t.fx.rows.all("user_preferences")).toHaveLength(1)
  })

  it("valores fuera de lo permitido → 400 en español", async () => {
    const r = await t.call("PATCH", "/v1/me/preferences", "owner", { theme: "rosa", lock_minutes: 999 })
    expect(r.status).toBe(400)
    expect(JSON.stringify(r.body)).toContain("Tema inválido")
    expect(JSON.stringify(r.body)).toContain("Máximo 240 minutos")
  })
})

describe("PUT /v1/me/active-book", () => {
  it("recuerda un libro de tus hogares; uno ajeno es 404", async () => {
    expect((await t.call("PUT", "/v1/me/active-book", "owner", { bookId: B_PREMIUM })).body).toEqual({ ok: true, data: { bookId: B_PREMIUM } })
    expect(t.fx.rows.all<{ id: string; last_book_id: string }>("profiles").find((p) => p.id === USERS.owner)?.last_book_id).toBe(B_PREMIUM)
    expect((await t.call("PUT", "/v1/me/active-book", "viewer", { bookId: B_PREMIUM })).body).toMatchObject({ code: "NOT_FOUND", msg: "No encontramos ese libro." })
    expect((await t.call("PUT", "/v1/me/active-book", "viewer", { bookId: B_AJENO })).status).toBe(404)
    expect((await t.call("PUT", "/v1/me/active-book", "viewer", { bookId: B_GRATIS })).status).toBe(200)
  })
})

describe("plataforma", () => {
  it("GET /v1/platform/notice es público, lee con SystemScope y solo trae el aviso", async () => {
    t.fx.rows.seed("platform_settings", [{ id: true, aviso_global: "  Mantenimiento el domingo ", aviso_tono: "warn", premium_db: true }])
    const r = await t.call("GET", "/v1/platform/notice", null)
    expect(r.status).toBe(200)
    expect(r.body).toEqual({ aviso: "Mantenimiento el domingo", tono: "warn" })
    expect(t.fx.rows.scopesOf("platform_settings")).toEqual(["system"])
  })

  it("tono desconocido → info; sin ajustes → aviso vacío", async () => {
    expect((await t.call("GET", "/v1/platform/notice", null)).body).toEqual({ aviso: "", tono: "info" })
    t.fx.rows.seed("platform_settings", [{ id: true, aviso_global: "Hola", aviso_tono: "rojo" }])
    expect((await t.call("GET", "/v1/platform/notice", null)).body).toEqual({ aviso: "Hola", tono: "info" })
  })

  it("GET /v1/platform/integrations: con sesión, sin configuración ni secretos", async () => {
    t.fx.rows.seed("platform_integrations_public" as never, [{ kind: "email", modo: "por_defecto", planes: [], config: { from: "x@y.co" }, meta: {} }, { kind: "telegram", modo: "opcional", planes: ["premium"] }])
    expect((await t.call("GET", "/v1/platform/integrations", null)).status).toBe(401)
    const r = await t.call("GET", "/v1/platform/integrations", "viewer")
    expect(r.body).toEqual([{ kind: "email", modo: "por_defecto", planes: [] }, { kind: "telegram", modo: "opcional", planes: ["premium"] }])
    expect(t.fx.rows.scopesOf("platform_integrations_public" as never)).toEqual(["user"])
  })
})

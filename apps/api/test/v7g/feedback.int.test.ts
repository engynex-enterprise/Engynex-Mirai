// V7-G: opiniones y casos de soporte (feedback-dialog.tsx, opiniones-view.tsx, extras.tsx de la web) con la app real y
// RowStore en memoria: validación en español, captura solo de tu carpeta, hogar propio, idempotencia, límite, lista
// propia y borrar solo lo que aún no revisamos. Todo con la sesión de la persona (la RLS vuelve a revisar).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { ALREADY_REVIEWED, BAD_CAPTURE, FEEDBACK_NOT_FOUND, NOT_YOUR_HOUSEHOLD } from "../../src/modules/feedback/feedback.service"
import { H_GRATIS, H_PREMIUM, USERS } from "../setup/fixtures"
import { createV7gApp, type V7gApp } from "./app"

let t: V7gApp
const ctx = { version: "6.0.0", pantalla: "400×800", tema: "claro" }
const cap = (u: string) => `${u}/0b9f2c1e-1111-4222-8333-444455556666.png`

beforeAll(async () => {
  t = await createV7gApp()
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => {
  t.fx.rows.reset()
  t.fx.rows.defaults.feedback = () => ({ estado: "nuevo", respuesta: null, respondido_at: null, respondido_por: null, updated_at: "2026-11-02T00:00:00Z" })
})

describe("POST /v1/feedback", () => {
  it("guarda la opinión con tu sesión, tu hogar, la página y los datos técnicos; devuelve el número de caso", async () => {
    const r = await t.call("POST", "/v1/feedback", "viewer", { tipo: "error", mensaje: "  No carga el gráfico  ", householdId: H_GRATIS, pagina: "/reportes", contexto: ctx, captura: cap(USERS.viewer) })
    expect(r.status).toBe(200)
    const id = (r.body.data as { id: string }).id
    expect(t.fx.rows.all("feedback")).toEqual([expect.objectContaining({ id, user_id: USERS.viewer, tipo: "error", rating: null, mensaje: "No carga el gráfico", household_id: H_GRATIS, pagina: "/reportes", contexto: ctx, captura: cap(USERS.viewer), estado: "nuevo" })])
    expect(t.fx.rows.scopesOf("feedback")).toEqual(["user"])
  })

  it("caso de soporte con tema y asunto en el contexto", async () => {
    const r = await t.call("POST", "/v1/feedback", "editor", { tipo: "soporte", mensaje: "No puedo entrar\n\nMe pide el código", contexto: { ...ctx, soporte: { tema: "cuenta", asunto: "No puedo entrar" } } })
    expect(r.status).toBe(200)
    expect(t.fx.rows.all("feedback")[0]).toMatchObject({ tipo: "soporte", household_id: null, contexto: { soporte: { tema: "cuenta" } } })
  })

  it("errores en español: estrellas, mensaje corto, tipo raro, captura ajena y hogar ajeno", async () => {
    const cases: [unknown, number, string][] = [
      [{ tipo: "calificacion" }, 400, "Elige de 1 a 5 estrellas"],
      [{ tipo: "sugerencia", mensaje: "ok" }, 400, "Cuéntanos un poco más (al menos 3 letras)"],
      [{ tipo: "chisme", mensaje: "hola mundo" }, 400, "Elige de qué se trata tu opinión"],
      [{ tipo: "error", mensaje: "falla", captura: cap(USERS.owner) }, 400, BAD_CAPTURE],
      [{ tipo: "error", mensaje: "falla", captura: "../otro/archivo.png" }, 400, "La captura no es válida. Vuelve a adjuntarla."],
      [{ tipo: "error", mensaje: "falla", householdId: H_PREMIUM }, 404, NOT_YOUR_HOUSEHOLD],
    ]
    for (const [body, status, msg] of cases) {
      const r = await t.call("POST", "/v1/feedback", "viewer", body)
      expect(r.status, JSON.stringify(body)).toBe(status)
      expect(JSON.stringify(r.body)).toContain(msg)
    }
    expect(t.fx.rows.all("feedback")).toEqual([])
    expect((await t.call("POST", "/v1/feedback", null, { tipo: "otro", mensaje: "hola" })).status).toBe(401)
  })

  it("Idempotency-Key: repetir el envío no crea otra opinión", async () => {
    const h = { "idempotency-key": "opinion-0001-abc" }
    const a = await t.call("POST", "/v1/feedback", "admin", { tipo: "elogio", mensaje: "¡Me encanta!" }, h)
    const b = await t.call("POST", "/v1/feedback", "admin", { tipo: "elogio", mensaje: "¡Me encanta!" }, h)
    expect(b.body).toEqual(a.body)
    expect(b.headers["idempotent-replayed"]).toBe("true")
    expect(t.fx.rows.all("feedback")).toHaveLength(1)
  })

  it("límite por persona (opiniones: 10 por hora)", async () => {
    let last = 0
    for (let i = 0; i < 11; i++) last = (await t.call("POST", "/v1/feedback/rating", "outsider", { rating: 4 })).status
    expect(last).toBe(429)
  })
})

describe("POST /v1/feedback/rating", () => {
  it("calificación de 1 a 5 con comentario opcional", async () => {
    expect((await t.call("POST", "/v1/feedback/rating", "registra", { rating: 5, householdId: H_GRATIS })).status).toBe(200)
    expect(t.fx.rows.all("feedback")).toEqual([expect.objectContaining({ tipo: "calificacion", rating: 5, mensaje: "", user_id: USERS.registra })])
    const r = await t.call("POST", "/v1/feedback/rating", "registra", { rating: 6 })
    expect(r.status).toBe(400)
    expect(JSON.stringify(r.body)).toContain("Elige de 1 a 5 estrellas")
  })
})

describe("GET /v1/me/feedback y DELETE /v1/me/feedback/:id", () => {
  const row = (id: string, user: string, estado: string, created_at: string) => ({ id, user_id: user, household_id: null, tipo: "sugerencia", rating: null, mensaje: "Más gráficos", pagina: null, contexto: {}, captura: null, estado, respuesta: null, respondido_at: null, respondido_por: null, created_at, updated_at: created_at })
  const A = "a0000000-0000-4000-8000-000000000001"
  const B = "a0000000-0000-4000-8000-000000000002"
  const C = "a0000000-0000-4000-8000-000000000003"
  beforeEach(() => {
    t.fx.rows.seed("feedback", [row(A, USERS.viewer, "nuevo", "2026-10-01T00:00:00Z"), row(B, USERS.viewer, "revisando", "2026-10-05T00:00:00Z"), row(C, USERS.owner, "nuevo", "2026-10-03T00:00:00Z")])
  })

  it("solo las tuyas, la más reciente primero", async () => {
    const r = await t.call("GET", "/v1/me/feedback", "viewer")
    expect(r.status).toBe(200)
    expect((r.body as unknown as { id: string }[]).map((f) => f.id)).toEqual([B, A])
  })

  it("borras una tuya en «nuevo»; la ya revisada da 409 y la ajena 404", async () => {
    expect((await t.call("DELETE", `/v1/me/feedback/${A}`, "viewer")).body).toEqual({ ok: true, data: { id: A } })
    expect((await t.call("DELETE", `/v1/me/feedback/${B}`, "viewer")).body).toMatchObject({ code: "CONFLICT", msg: ALREADY_REVIEWED })
    expect((await t.call("DELETE", `/v1/me/feedback/${C}`, "viewer")).body).toMatchObject({ code: "NOT_FOUND", msg: FEEDBACK_NOT_FOUND })
    expect(t.fx.rows.all<{ id: string }>("feedback").map((f) => f.id).sort()).toEqual([B, C])
  })
})

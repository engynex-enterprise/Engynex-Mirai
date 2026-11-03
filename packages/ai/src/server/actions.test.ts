// Casos de uso de la IA de los formularios, correo, integraciones, resumen del mes y uso de IA con dobles (modelo
// simulado, base en memoria, Gmail y fetch falsos). Mismos resultados que las Server Actions de la web.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MockLanguageModelV4 } from "ai/test"
import type { IntegrationValue } from "@mirai/services/integrations/store"
import { toPlanInfo } from "@mirai/domain/plans"
import { libroPrueba } from "../chat/libro-prueba"
import { baseRpcs, fakeDb, fakeRuntime, type FakeDb } from "../testing/fake-db"
import type { AiCtx } from "./ctx"

const providers: { list: IntegrationValue[]; own: IntegrationValue | null } = { list: [], own: null }
const models: Record<string, MockLanguageModelV4> = {}
vi.mock("@mirai/services/integrations/store", () => ({
  enabledOf: async (_h: string, kinds: string[]) => providers.list.filter((v) => kinds.includes(v.kind)),
  getIntegration: async (_h: string, kind: string) => providers.list.find((v) => v.kind === kind) ?? null,
  getOwnIntegration: async () => providers.own,
}))
vi.mock("../model", async (orig) => ({ ...(await orig<typeof import("../model")>()), modelFrom: (v: IntegrationValue) => models[v.kind] }))

const A = await import("./ai-actions")
const { scanMailWith } = await import("./mail")
const { testAiIntegration, listAiModels } = await import("./integrations-ai")
const { monthSummaryWith } = await import("./reports")
const U = await import("./usage-report")
const { advisorConsultWith } = await import("./advisor")
const { resetAiSettingsMemo } = await import("../usage")

const B = "00000000-0000-4000-8000-0000000000b1"
const H = "00000000-0000-4000-8000-0000000000a1"
const PREMIUM = { id: "premium", nombre: "Premium", funciones: ["ia", "banco", "impuestos", "familia"], anuncios: false, limites: {}, precio_mes: 14900, ia_creditos: 1000 }
const GRATIS = { id: "gratis", nombre: "Gratis", funciones: [], anuncios: true, limites: {}, precio_mes: 0, ia_creditos: 100 }
const ctx = (plan = PREMIUM): AiCtx => ({ user: { id: "u-1" }, household: { id: H, access: "owner" }, book: { id: B }, plan: toPlanInfo(plan) })
const json = (o: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(o) }], finishReason: { unified: "stop" as const, raw: "stop" }, usage: { inputTokens: { total: 500, noCache: 500, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 50, text: 50, reasoning: 0 } }, warnings: [] })
const img = async () => ({ data: "aGVsbG8=", mediaType: "image/jpeg" })
let db: FakeDb

function setup(ia: Record<string, unknown> = {}, plan: (h: string) => string = () => "premium") {
  db = fakeDb({
    plans: [PREMIUM, GRATIS],
    book_settings: [{ book_id: B, ia, estricto: false, usura: 26 }],
    categories: [{ id: "c-mer", book_id: B, nombre: "Mercado", grupo: "n", icon: "tag", tope: 0, sort: 1, deleted_at: null }, { id: "c-res", book_id: B, nombre: "Restaurantes", grupo: "g", icon: "tag", tope: 0, sort: 2, deleted_at: null }],
  }, baseRpcs(plan))
  fakeRuntime(db, libroPrueba)
  resetAiSettingsMemo()
}

beforeEach(() => {
  providers.list = [{ kind: "ai_gemini", enabled: true, config: { model: "gemini-2.5-flash" }, secrets: { apiKey: "clave-falsa" }, source: "hogar" }]
  providers.own = providers.list[0]
  setup()
})

describe("IA de los formularios", () => {
  it("factura: comercio, valor redondeado, fecha válida y la categoría del libro", async () => {
    models.ai_gemini = new MockLanguageModelV4({ doGenerate: json({ comercio: "Crepes & Waffles", valor: 45210.6, fecha: "2026-11-01", categoria: "restaurantes" }) })
    const r = await A.readInvoiceWith(ctx(), db.client, img)
    expect(r).toEqual({ ok: true, comercio: "Crepes & Waffles", valor: 45211, fecha: "2026-11-01", category_id: "c-res" })
    expect(JSON.stringify(models.ai_gemini.doGenerateCalls[0].prompt)).toContain("Categorías: Mercado, Restaurantes")
    expect(db.rows("ai_usage")[0]).toMatchObject({ feature: "factura", fuente: "ia" })
  })

  it("factura con la lectura de fotos apagada o plan Gratis: mensaje para la persona", async () => {
    setup({ ocr: false })
    expect(await A.readInvoiceWith(ctx(), db.client, img)).toEqual({ ok: false, msg: "La lectura de fotos está desactivada en Ajustes › Inteligencia artificial." })
    setup({}, () => "gratis")
    expect(await A.readInvoiceWith(ctx(GRATIS), db.client, img)).toEqual({ ok: false, msg: "La inteligencia artificial no está incluida en tu plan. Conoce los planes en /planes." })
  })

  it("imageOf: tamaño y tipo como la web", () => {
    expect(() => A.imageOf({ size: 7 * 1024 * 1024, type: "image/png", data: "" })).toThrow("La foto pesa más de 6 MB")
    expect(() => A.imageOf({ size: 10, type: "text/plain", data: "" })).toThrow("Usa una foto (JPG, PNG) o un PDF")
    expect(A.imageOf({ size: 10, type: "application/pdf", data: "QQ==" })).toEqual({ data: "QQ==", mediaType: "application/pdf" })
  })

  it("clasificar: sin categoría ni hormiga activas no gasta IA (null)", async () => {
    setup({ autocat: false, hormiga: false })
    expect(await A.classifyExpensesWith(ctx(), db.client, [{ i: 0, descripcion: "Éxito", valor: 1000, veces_mes: 1 }])).toBeNull()
    expect(await A.classifyExpensesWith(ctx(), db.client, "no es lista")).toBeNull()
  })

  it("frase libre y asistentes: sin entender → { ok: false } (sin sugerencia)", async () => {
    models.ai_gemini = new MockLanguageModelV4({ doGenerate: json({ tipo: "gasto", valor: 0, descripcion: "nada", fecha: "x", categoria: null }) })
    expect(await A.parseNLWith(ctx(), db.client, "hola")).toEqual({ ok: false })
    setup({ asist: false })
    expect(await A.suggestCategoryWith(ctx(), db.client, "perro", "", ["tag"])).toEqual({ ok: false })
    expect(await A.identifyEntityWith(ctx(), "bancolombia")).toEqual({ ok: false })
  })

  it("cobro: tono inválido cae en «amable»", async () => {
    models.ai_gemini = new MockLanguageModelV4({ doGenerate: { ...json(""), content: [{ type: "text", text: "  Hola Juan, ¿me ayudas con la cuota?  " }] } })
    const r = await A.improveCobroWith(ctx(), "págame", "grosero" as never)
    expect(r).toEqual({ ok: true, text: "Hola Juan, ¿me ayudas con la cuota?" })
    expect(JSON.stringify(models.ai_gemini.doGenerateCalls[0].prompt)).toContain("Tono: amable")
  })
})

describe("consejero sin chat", () => {
  it("sin valor: devuelve las preguntas que faltan; con valor: análisis con tus números", async () => {
    const a = await advisorConsultWith(ctx(GRATIS), db.client, "¿Me conviene comprar un carro?")
    expect(a.ok).toBe(false)
    expect(!a.ok && a.preguntas.length).toBeGreaterThan(0)
    const b = await advisorConsultWith(ctx(GRATIS), db.client, "¿Me conviene comprar un celular de 3 millones a 12 cuotas?")
    expect(b.ok && b.consulta.d.valor).toBe(3000000)
    expect(db.rows("advisor_consultations")).toHaveLength(1)
  })
})

describe("correo del banco", () => {
  const gmail = (msgs: { id: string; subject: string; snippet: string }[]) => (async (_u: string, url: string) => {
    if (url.includes("/messages?")) return { messages: msgs.map((m) => ({ id: m.id })) }
    const m = msgs.find((x) => url.includes(`/messages/${x.id}?`))!
    return { id: m.id, snippet: m.snippet, internalDate: String(Date.parse("2026-11-01T12:00:00Z")), payload: { headers: [{ name: "Subject", value: m.subject }, { name: "From", value: "Bancolombia <alertas@bancolombia.com.co>" }] } }
  }) as never

  it("plan sin banco: no se lee", async () => {
    expect(await scanMailWith(ctx(GRATIS), db.client, undefined, gmail([]))).toEqual({ ok: false, rows: [], msg: "Leer el correo del banco no está incluido en tu plan." })
  })

  it("sin IA (apagada): respaldo con reglas; los correos sin monto ni se revisan y lo ya importado se salta", async () => {
    setup({ on: false })
    db.rows("expenses").push({ book_id: B, external_id: "gmail:m3" })
    const r = await scanMailWith(ctx(), db.client, undefined, gmail([
      { id: "m1", subject: "Compra aprobada", snippet: "Compraste $45.900 en EXITO CALLE 80" },
      { id: "m2", subject: "Novedades de tu tarjeta", snippet: "Conoce los nuevos beneficios" },
      { id: "m3", subject: "Compra aprobada", snippet: "Compraste $10.000 en D1" },
    ]))
    expect(r).toEqual({ ok: true, ia: false, rows: [{ id: "m1", fecha: "2026-11-01", comercio: "EXITO CALLE 80", valor: 45900, asunto: "Compra aprobada", remitente: "Bancolombia <alertas@bancolombia.com.co>" }] })
  })
})

describe("integraciones de IA del hogar", () => {
  it("probar: llama al modelo con 20 tokens, registra «prueba» sin créditos y guarda el resultado en meta", async () => {
    db.rows("integrations").push({ household_id: H, kind: "ai_gemini", meta: { masked: "••••1234" } })
    models.ai_gemini = new MockLanguageModelV4({ doGenerate: { ...json(""), content: [{ type: "text", text: "listo" }] } })
    const r = await testAiIntegration(ctx(), "ai_gemini")
    expect(r).toEqual({ ok: true, msg: "Conexión exitosa con Google Gemini. Respondió: “listo”." })
    expect(models.ai_gemini.doGenerateCalls[0].maxOutputTokens).toBe(20)
    expect(db.rows("ai_usage")[0]).toMatchObject({ feature: "prueba", creditos: 0, de_plataforma: false })
    expect(db.rows("integrations")[0].meta).toMatchObject({ masked: "••••1234", lastOk: true })
  })

  it("probar la IA de la plataforma no gasta sus créditos", async () => {
    providers.list = [{ ...providers.list[0], source: "plataforma" }]
    expect(await testAiIntegration(ctx(), "ai_gemini")).toEqual({ ok: true, msg: "Usas Google Gemini de Mirai: ya está lista y no hace falta probarla." })
  })

  it("modelos: con la clave escrita; error del proveedor en español", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ models: [{ name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", supportedGenerationMethods: ["generateContent"] }] }), { status: 200 }))
    const r = await listAiModels(ctx(), "ai_gemini", "clave-escrita", f as never)
    expect(r).toMatchObject({ ok: true, rec: "gemini-2.5-flash" })
    expect(String((f.mock.calls[0] as unknown[])[0])).toContain("key=clave-escrita")
    const bad = await listAiModels(ctx(), "ai_gemini", "x", (async () => new Response("unauthorized", { status: 401 })) as never)
    expect(bad).toMatchObject({ ok: false, msg: expect.stringMatching(/clave no es válida/) })
    expect(await listAiModels(ctx(), "resend", "x")).toMatchObject({ ok: false, msg: "Este proveedor no tiene lista de modelos." })
  })
})

describe("resumen del mes y uso de IA", () => {
  it("resumen: sin IA (plan Gratis) responde con los números y lo guarda", async () => {
    setup({}, () => "gratis")
    const r = await monthSummaryWith(ctx(GRATIS), db.client, "2026-11")
    expect(r).toMatchObject({ local: true, titular: expect.stringMatching(/^Gastaste .* en noviembre 2026$/) })
    expect(r.recomendacion).toMatch(/no está incluida en tu plan/)
    expect(db.rows("monthly_summaries")[0]).toMatchObject({ book_id: B, mes: "2026-11" })
    await expect(monthSummaryWith(ctx(), db.client, "2026-13x")).rejects.toThrow("Mes inválido")
  })

  it("consola: cada cambio queda en admin_audit con quién lo hizo", async () => {
    db.rows("platform_settings").push({ id: true, ia_precios: {} })
    await U.saveAiSettings("admin-1", { cacheHoras: 12 })
    await U.setPlanAiCupo("admin-1", "premium", 2000)
    await U.setModelPrice("admin-1", "google/gemini-2.5-flash", { in: 0.3, out: 2.5 })
    await U.setModelPrice("admin-1", "google/gemini-2.5-flash", null)
    db.rows("ai_cache").push({ key: "k1" }, { key: "k2" })
    expect(await U.clearAiCache("admin-1")).toBe(2)
    expect(db.rows("admin_audit").map((a) => [a.actor, a.accion])).toEqual([
      ["admin-1", "ajustes de IA"], ["admin-1", "cupo de IA del plan"], ["admin-1", "precio de modelo"], ["admin-1", "quitar precio de modelo"], ["admin-1", "vaciar caché de IA"],
    ])
    expect(db.rows("plans").find((p) => p.id === "premium")!.ia_creditos).toBe(2000)
    expect(() => U.PlanId.parse("PLAN MALO")).toThrow()
  })

  it("uso del hogar: cupo, totales del mes y últimas solicitudes", async () => {
    db.rpcs.ai_usage_rollup = () => [{ dia: new Date().toISOString().slice(0, 10), household_id: H, plan: "premium", feature: "chat", fuente: "ia", provider: "ai_gemini", model: "gemini-2.5-flash", de_plataforma: true, ok: true, llamadas: 3, input_tokens: 3000, output_tokens: 300, cached_tokens: 0, tokens_evitados: 0, costo_usd: 0.002, costo_cop: 8, creditos: 2, duracion_ms: 900 }]
    db.rows("ai_usage").push({ id: "r1", household_id: H, created_at: "2026-11-02T10:00:00Z", feature: "chat", costo_usd: "0.001", creditos: "1" })
    const r = await U.myAiUsageWith(ctx(), db.client)
    expect(r).toMatchObject({ plan: "Premium", incluyeIa: true, quota: { cupo: 1000, nivel: "ok" }, mes: { llamadas: 3, creditos: 2 } })
    expect(r.recientes[0]).toMatchObject({ costo_usd: 0.001, creditos: 1 })
  })
})

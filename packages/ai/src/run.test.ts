// run.ts con dobles: proveedores simulados (MockLanguageModelV4, sin red ni créditos), base en memoria y runtime falso.
// Revisa el orden plan → interruptor → caché → cupo → límite → proveedores → registro en ai_usage.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MockLanguageModelV4 } from "ai/test"
import { z } from "zod"
import type { IntegrationValue } from "@mirai/services/integrations/store"
import { baseRpcs, fakeDb, fakeRuntime, type FakeDb } from "./testing/fake-db"
import { libroPrueba } from "./chat/libro-prueba"

const providers: { list: IntegrationValue[] } = { list: [] }
const models: Record<string, MockLanguageModelV4> = {}

vi.mock("@mirai/services/integrations/store", () => ({
  enabledOf: async (_h: string, kinds: string[]) => providers.list.filter((v) => kinds.includes(v.kind)),
  getIntegration: async () => null,
  getOwnIntegration: async () => null,
}))
vi.mock("./model", async (orig) => ({ ...(await orig<typeof import("./model")>()), modelFrom: (v: IntegrationValue) => models[v.kind] }))

const { aiObject, aiText, AiUnavailable, AI_OFF_MSG, AI_PLAN_MSG } = await import("./run")
const { resetAiSettingsMemo } = await import("./usage")

const usage = (input: number, output: number) => ({ inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: output, text: output, reasoning: 0 } })
const gen = (text: string, modelId = "gemini-2.5-flash") => ({ content: [{ type: "text" as const, text }], finishReason: { unified: "stop" as const, raw: "stop" }, usage: usage(1000, 200), warnings: [], response: { modelId } })
const fail = (msg: string) => async () => { throw new Error(msg) }

const H = "h-premium", HG = "h-gratis", B = "b-1"
const PLANS = [
  { id: "premium", nombre: "Premium", funciones: ["ia", "banco", "impuestos", "familia"], anuncios: false, limites: {}, precio_mes: 14900, ia_creditos: 1000 },
  { id: "gratis", nombre: "Gratis", funciones: [], anuncios: true, limites: {}, precio_mes: 0, ia_creditos: 100 },
]
let db: FakeDb

function setup(o: { ia?: Record<string, unknown>; used?: number } = {}) {
  db = fakeDb({ plans: PLANS, book_settings: [{ book_id: B, ia: o.ia ?? {} }] }, { ...baseRpcs((h) => (h === HG ? "gratis" : "premium")), ai_creditos_desde: () => o.used ?? 0 })
  fakeRuntime(db, libroPrueba)
  resetAiSettingsMemo()
}

beforeEach(() => {
  providers.list = [{ kind: "ai_gemini", enabled: true, config: { model: "gemini-2.5-flash" }, secrets: { apiKey: "clave-falsa" }, source: "plataforma" }]
  for (const k of Object.keys(models)) delete models[k]
  models.ai_gemini = new MockLanguageModelV4({ doGenerate: gen("listo") })
  setup()
})

describe("aiText / aiObject (run.ts)", () => {
  it("plan Gratis: AiUnavailable con el mensaje de siempre y sin llamar al proveedor", async () => {
    await expect(aiText({ householdId: HG, bookId: B, prompt: "hola" })).rejects.toThrow(AI_PLAN_MSG)
    await expect(aiText({ householdId: HG, bookId: B, prompt: "hola" })).rejects.toBeInstanceOf(AiUnavailable)
    expect(models.ai_gemini.doGenerateCalls).toHaveLength(0)
  })

  it("IA apagada en el libro: AiUnavailable", async () => {
    setup({ ia: { on: false } })
    await expect(aiText({ householdId: H, bookId: B, prompt: "hola" })).rejects.toThrow(AI_OFF_MSG)
  })

  it("registra la llamada en ai_usage con la función, tokens, costo y créditos", async () => {
    const r = await aiText({ householdId: H, bookId: B, userId: "u-1", feature: "cobro", prompt: "Tono: amable" })
    expect(r).toMatchObject({ text: "listo", provider: "Google Gemini", fuente: "ia" })
    const [row] = db.rows("ai_usage")
    expect(row).toMatchObject({ household_id: H, book_id: B, user_id: "u-1", plan: "premium", feature: "cobro", fuente: "ia", provider: "ai_gemini", de_plataforma: true, input_tokens: 1000, output_tokens: 200, ok: true })
    // gemini-2.5-flash: 0,3 US$/M de entrada y 2,5 US$/M de salida → 0,0008 US$ = 0,8 créditos (1 crédito = 0,001 US$).
    expect(+(row.costo_usd as number)).toBeCloseTo(0.0008, 6)
    expect(r.creditos).toBeCloseTo(0.8, 3)
  })

  it("respaldo entre proveedores: si el primero falla, responde el siguiente y ambos quedan registrados", async () => {
    providers.list = [
      { kind: "ai_groq", enabled: true, config: { model: "llama-3.3-70b-versatile" }, secrets: { apiKey: "x" }, source: "hogar" },
      ...providers.list,
    ]
    models.ai_groq = new MockLanguageModelV4({ doGenerate: fail("429 Too Many Requests") })
    const r = await aiText({ householdId: H, bookId: B, feature: "prima", prompt: "datos" })
    expect(r.provider).toBe("Google Gemini")
    const rows = db.rows("ai_usage")
    expect(rows.map((x) => [x.provider, x.ok])).toEqual([["ai_groq", false], ["ai_gemini", true]])
    expect(rows[0].error).toMatch(/límite de uso/)
  })

  it("todos fallan: error con el mensaje en español del último proveedor", async () => {
    models.ai_gemini = new MockLanguageModelV4({ doGenerate: fail("401 invalid api key") })
    await expect(aiText({ householdId: H, bookId: B, feature: "prima", prompt: "x" })).rejects.toThrow(/clave no es válida/)
  })

  it("caché: la misma entrada responde lo guardado, 0 tokens, y lo registra como «cache»", async () => {
    models.ai_gemini = new MockLanguageModelV4({ doGenerate: gen(JSON.stringify({ nombre: "Mascotas" })) })
    const call = () => aiObject({ householdId: H, bookId: B, feature: "categoria_nueva", schema: z.object({ nombre: z.string() }), prompt: "perro" })
    const a = await call()
    const b = await call()
    expect(a.object).toEqual({ nombre: "Mascotas" })
    expect(b).toMatchObject({ object: { nombre: "Mascotas" }, provider: "Respuesta guardada", fuente: "cache", creditos: 0 })
    expect(models.ai_gemini.doGenerateCalls).toHaveLength(1)
    expect(db.rows("ai_usage").map((x) => x.fuente)).toEqual(["ia", "cache"])
  })

  it("créditos del mes agotados: sin la IA de la plataforma no hay con qué responder", async () => {
    setup({ used: 5000 })
    await expect(aiText({ householdId: H, bookId: B, prompt: "x" })).rejects.toThrow(/Usaste todos los créditos de IA de este mes/)
    // Con su propia clave el hogar sigue (sin descontar créditos).
    providers.list = [{ kind: "ai_openai", enabled: true, config: { model: "gpt-5-mini" }, secrets: { apiKey: "x" }, source: "hogar" }]
    models.ai_openai = new MockLanguageModelV4({ doGenerate: gen("ok", "gpt-5-mini") })
    const r = await aiText({ householdId: H, bookId: B, feature: "prima", prompt: "x" })
    expect(r.creditos).toBe(0)
  })

  it("límite por hora (rate_limit_hit): AiUnavailable con el mensaje de espera", async () => {
    db.rpcs.rate_limit_hit = () => ({ ok: false, remaining: 0, reset_ms: 120_000 })
    await expect(aiText({ householdId: H, bookId: B, prompt: "x" })).rejects.toThrow(/muchas consultas de IA en la última hora\. Espera 2 minutos/)
  })
})

// run.ts con la IA de la nube de la plataforma: la integración efectiva sale del store real (base en memoria y
// variables de entorno falsas) y solo el modelo es un doble (MockLanguageModelV4). Sin red ni créditos reales.
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MockLanguageModelV4 } from "ai/test"
import type { IntegrationValue } from "@mirai/services/integrations/store"
import { baseRpcs, fakeDb, fakeRuntime, type FakeDb } from "../testing/fake-db"
import { libroPrueba } from "../chat/libro-prueba"

const models: Record<string, MockLanguageModelV4> = {}
const built: { kind: string; model: string; source?: string }[] = []
vi.mock("../model", async (orig) => ({
  ...(await orig<typeof import("../model")>()),
  modelFrom: (v: IntegrationValue, override?: string) => { built.push({ kind: v.kind, model: override ?? String(v.config.model ?? ""), source: v.source }); return models[v.kind] },
}))

const { aiText } = await import("../run")
const { aiProviders } = await import("../model")
const { resetAiSettingsMemo } = await import("../usage")

const usage = (input: number, output: number) => ({ inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: output, text: output, reasoning: 0 } })
const gen = (text: string, modelId: string) => ({ content: [{ type: "text" as const, text }], finishReason: { unified: "stop" as const, raw: "stop" }, usage: usage(1000, 200), warnings: [], response: { modelId } })
const ok = (modelId: string) => new MockLanguageModelV4({ doGenerate: gen("listo", modelId) })
const fail = (msg: string) => new MockLanguageModelV4({ doGenerate: async () => { throw new Error(msg) } })

const H = "h-premium", B = "b-1"
const PLANS = [{ id: "premium", nombre: "Premium", funciones: ["ia", "banco", "impuestos", "familia"], anuncios: false, limites: {}, precio_mes: 14900, ia_creditos: 1000 }]
let db: FakeDb

/** Hogar con su propia clave de Gemini (integrations) y, opcional, filas globales y variables del despliegue. */
function setup(o: { env?: Record<string, string>; ia?: Record<string, unknown>; globals?: Record<string, unknown>[] } = {}) {
  db = fakeDb({
    plans: PLANS,
    book_settings: [{ book_id: B, ia: o.ia ?? {} }],
    integrations: [{ household_id: H, kind: "ai_gemini", enabled: true, config: { model: "gemini-2.5-flash" }, secrets_enc: JSON.stringify({ apiKey: "clave-del-hogar" }) }],
    platform_integrations: o.globals ?? [],
  }, baseRpcs())
  fakeRuntime(db, libroPrueba, o.env ?? {})
  resetAiSettingsMemo()
}

beforeEach(() => {
  for (const k of Object.keys(models)) delete models[k]
  built.length = 0
  models.ai_vertex = ok("gemini-2.5-flash")
  models.ai_gemini = ok("gemini-2.5-flash")
  models.ai_gateway = ok("google/gemini-2.5-flash")
  models.ai_bedrock = ok("us.anthropic.claude-haiku-4-5-20251001-v1:0")
  models.ai_azure = ok("gpt-5-mini")
})

describe("IA de la plataforma en run.ts", () => {
  it("AI_PLATFORM_PROVIDER=vertex: Vertex va primero, se cobra en créditos y ai_usage registra ai_vertex", async () => {
    setup({ env: { AI_PLATFORM_PROVIDER: "vertex", GOOGLE_VERTEX_PROJECT: "mirai-pruebas" } })
    const r = await aiText({ householdId: H, bookId: B, feature: "prima", prompt: "datos" })
    expect(r.provider).toBe("Google Vertex AI")
    const [row] = db.rows("ai_usage")
    expect(row).toMatchObject({ provider: "ai_vertex", model: "gemini-2.5-flash", de_plataforma: true, ok: true, input_tokens: 1000, output_tokens: 200 })
    // Precio de Gemini 2.5 Flash (0,3/2,5 US$ por millón) → 0,8 créditos.
    expect(+(row.costo_usd as number)).toBeCloseTo(0.0008, 6)
    expect(r.creditos).toBeCloseTo(0.8, 3)
    expect(models.ai_gemini.doGenerateCalls).toHaveLength(0)
  })

  it("respaldo: si Vertex falla responde la clave del hogar y quedan los dos intentos", async () => {
    setup({ env: { AI_PLATFORM_PROVIDER: "vertex", GOOGLE_VERTEX_PROJECT: "mirai-pruebas" } })
    models.ai_vertex = fail("429 RESOURCE_EXHAUSTED")
    const r = await aiText({ householdId: H, bookId: B, feature: "prima", prompt: "datos" })
    expect(r.provider).toBe("Google Gemini")
    expect(r.creditos).toBe(0)
    expect(db.rows("ai_usage").map((x) => [x.provider, x.ok, x.de_plataforma])).toEqual([["ai_vertex", false, true], ["ai_gemini", true, false]])
  })

  it("tarea simple: Vertex prueba primero su modelo barato (Flash Lite)", async () => {
    setup({ env: { AI_PLATFORM_PROVIDER: "vertex", GOOGLE_VERTEX_PROJECT: "p" } })
    await aiText({ householdId: H, bookId: B, feature: "categoria_nueva", prompt: "perro", cache: false })
    expect(built[0]).toEqual({ kind: "ai_vertex", model: "gemini-2.5-flash-lite", source: "plataforma" })
  })

  it("sin variables de la nube ni AI_GATEWAY_API_KEY: solo la clave del hogar, y el Gateway global sin clave ni se intenta", async () => {
    setup({ globals: [{ kind: "ai_gateway", modo: "por_defecto", planes: [], config: {}, secrets_enc: null }] })
    const r = await aiText({ householdId: H, bookId: B, feature: "prima", prompt: "datos" })
    expect(r.provider).toBe("Google Gemini")
    expect(db.rows("ai_usage").map((x) => x.provider)).toEqual(["ai_gemini"])
    expect(built.map((b) => b.kind)).toEqual(["ai_gemini"])
  })

  it("AI_PLATFORM_PROVIDER vacío: el orden de hoy (Gateway con su variable primero)", async () => {
    setup({ env: { AI_GATEWAY_API_KEY: "k", GOOGLE_VERTEX_PROJECT: "p" } })
    const list = await aiProviders(H)
    expect(list.map((x) => x.kind)).toEqual(["ai_gateway", "ai_vertex", "ai_gemini"])
  })

  it("bedrock y azure por variables: entran solo con credenciales; none deja primero la clave del hogar", async () => {
    setup({ env: { AI_PLATFORM_PROVIDER: "bedrock", AI_BEDROCK_REGION: "us-east-1", AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: "/c", AZURE_OPENAI_ENDPOINT: "https://r.openai.azure.com" } })
    expect((await aiProviders(H)).map((x) => x.kind)).toEqual(["ai_bedrock", "ai_azure", "ai_gemini"])
    await aiText({ householdId: H, bookId: B, feature: "prima", prompt: "x" })
    expect(db.rows("ai_usage")[0]).toMatchObject({ provider: "ai_bedrock", de_plataforma: true, ok: true })
    // Bedrock sin credenciales (solo la región): no se intenta.
    setup({ env: { AI_PLATFORM_PROVIDER: "bedrock", AI_BEDROCK_REGION: "us-east-1" } })
    expect((await aiProviders(H)).map((x) => x.kind)).toEqual(["ai_gemini"])
    setup({ env: { AI_PLATFORM_PROVIDER: "none", GOOGLE_VERTEX_PROJECT: "p" } })
    expect((await aiProviders(H)).map((x) => x.kind)).toEqual(["ai_gemini", "ai_vertex"])
  })

  it("el orden propio del hogar manda sobre AI_PLATFORM_PROVIDER", async () => {
    setup({ env: { AI_PLATFORM_PROVIDER: "vertex", GOOGLE_VERTEX_PROJECT: "p" }, ia: { orden: ["ai_gemini", "ai_gateway"] } })
    await aiText({ householdId: H, bookId: B, feature: "prima", prompt: "x" })
    expect(db.rows("ai_usage")[0]).toMatchObject({ provider: "ai_gemini" })
  })

  it("la consola puede apagar Vertex aunque exista la variable", async () => {
    setup({ env: { AI_PLATFORM_PROVIDER: "vertex", GOOGLE_VERTEX_PROJECT: "p" }, globals: [{ kind: "ai_vertex", modo: "apagada", planes: [], config: {}, secrets_enc: null }] })
    expect((await aiProviders(H)).map((x) => x.kind)).toEqual(["ai_gemini"])
  })
})

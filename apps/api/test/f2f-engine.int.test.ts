// El chat de la API con el motor REAL de @mirai/ai (el mismo de app/api/chat de la web) sobre una base en memoria y un
// modelo simulado: sin red, sin la base compartida y sin gastar créditos. Comprueba que el NDJSON de la API es el de la
// web, que la conversación queda guardada con el JWT de la persona y que confirmar escribe con ChatWritesPort.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"
import type { NestFastifyApplication } from "@nestjs/platform-fastify"
import { Test } from "@nestjs/testing"
import type { IntegrationValue } from "@mirai/services/integrations/store"
import { libroPrueba } from "@mirai/ai/chat/libro-prueba"
import { baseRpcs, fakeDb, fakeRuntime, type FakeDb } from "@mirai/ai/testing/fake-db"
import { resetAiSettingsMemo } from "@mirai/ai/usage"
import { AppModule } from "../src/app.module"
import { configureApp, fastifyAdapter } from "../src/app.setup"
import { staticJwks } from "../src/core/auth/jwks"
import { JoseTokenVerifier } from "../src/core/auth/supabase-jwt.verifier"
import { TokenVerifier } from "../src/core/auth/token-verifier"
import { loadConfig } from "../src/core/config/config.schema"
import { AppContextRepo } from "../src/core/context/app-context.repo"
import { DbHealth } from "../src/core/db/db-health"
import { SupabaseJsFactory } from "../src/core/db/supabase-js.factory"
import { createLogger } from "../src/core/logging/logger"
import { CRON_SECRET, TEST_KEY } from "./setup/app"
import { FakeAppContextRepo } from "./setup/fakes"
import { B_GRATIS, B_PREMIUM, H_GRATIS, H_PREMIUM, USERS } from "./setup/fixtures"
import { AUDIENCE, ISSUER, signers, userToken } from "./setup/tokens"

const models: Record<string, MockLanguageModelV4> = {}
vi.mock("@mirai/services/integrations/store", () => ({
  enabledOf: async (_h: string, kinds: string[]) => ([{ kind: "ai_gemini", enabled: true, config: { model: "gemini-2.5-flash" }, secrets: { apiKey: "falsa" }, source: "plataforma" }] as IntegrationValue[]).filter((v) => kinds.includes(v.kind)),
  getIntegration: async () => null,
  getOwnIntegration: async () => null,
}))
vi.mock("@mirai/ai/model", async (orig) => ({ ...(await orig<typeof import("@mirai/ai/model")>()), modelFrom: (v: IntegrationValue) => models[v.kind] }))

const usage = { inputTokens: { total: 800, noCache: 800, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 30, text: 30, reasoning: 0 } }
const PLANS = [
  { id: "premium", nombre: "Premium", funciones: ["ia", "banco", "impuestos", "familia"], anuncios: false, limites: {}, precio_mes: 14900, ia_creditos: 1000 },
  { id: "gratis", nombre: "Gratis", funciones: [], anuncios: true, limites: {}, precio_mes: 0, ia_creditos: 100 },
]

let app: NestFastifyApplication
let db: FakeDb
const auth = async (role: keyof typeof USERS) => ({ authorization: `Bearer ${await userToken(USERS[role])}`, "content-type": "application/json" })
const lines = (body: string) => body.trim().split("\n").map((l) => JSON.parse(l) as { t: string; [k: string]: unknown })

beforeAll(async () => {
  db = fakeDb({ plans: PLANS, book_settings: [{ book_id: B_PREMIUM, ia: { autocat: false, hormiga: false } }, { book_id: B_GRATIS, ia: {} }] }, baseRpcs((h) => (h === H_PREMIUM ? "premium" : "gratis")))
  models.ai_gemini = new MockLanguageModelV4({
    doStream: async () => ({ stream: simulateReadableStream({ chunks: [{ type: "text-start", id: "1" }, { type: "text-delta", id: "1", delta: "Los CDT son una opción segura." }, { type: "text-end", id: "1" }, { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage }] }) }),
  })
  const config = loadConfig({ MIRAI_ENV: "local", SUPABASE_URL: "https://proyecto-prueba.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_prueba", ENCRYPTION_KEY: TEST_KEY, CRON_SECRET, LOG_LEVEL: "silent", RATE_LIMIT_DEFAULT_PER_MIN: "1000" })
  const logger = createLogger({ level: "silent", service: "mirai-api", version: "test", destination: { write: () => {} } })
  const { supabase } = await signers()
  const mod = await Test.createTestingModule({ imports: [AppModule.register({ config, logger })] })
    .overrideProvider(TokenVerifier).useValue(new JoseTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, jwks: staticJwks(supabase.jwks) }))
    .overrideProvider(AppContextRepo).useValue(new FakeAppContextRepo())
    .overrideProvider(DbHealth).useValue({ check: async () => ({ ok: true }) })
    .overrideProvider(SupabaseJsFactory).useValue({ for: () => db.client, ping: async () => ({ ok: true }) })
    .compile()
  app = mod.createNestApplication<NestFastifyApplication>(fastifyAdapter(config), { rawBody: true, logger: false })
  configureApp(app, config, logger)
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
  // Después de ServicesRuntime (F2-E): el runtime de @mirai/services con la base en memoria y el libro de prueba.
  fakeRuntime(db, libroPrueba)
  resetAiSettingsMemo()
})
afterAll(async () => {
  await app?.close()
})

describe("chat de la API con el motor de la web", () => {
  it("pregunta de datos: mismo NDJSON que /api/chat y la conversación queda guardada", async () => {
    const r = await app.inject({ method: "POST", url: `/v1/books/${B_GRATIS}/chat/messages`, headers: await auth("viewer"), payload: JSON.stringify({ text: "¿Cuánto gasté este mes?" }) })
    expect(r.statusCode).toBe(200)
    const ev = lines(r.body)
    expect(ev.map((e) => e.t).filter((t) => t !== "delta")).toEqual(["thread", "user", "done"])
    const done = ev.at(-1) as unknown as { msg: { content: string; meta: { fuente: string } } }
    expect(done.msg.meta.fuente).toBe("algoritmo")
    expect(db.rows("chat_threads").find((x) => x.book_id === B_GRATIS)).toMatchObject({ user_id: USERS.viewer })
    expect(db.rows("ai_usage").find((x) => x.household_id === H_GRATIS)).toMatchObject({ fuente: "algoritmo", feature: "chat" })
  })

  it("plan Gratis y pregunta abierta: aviso de Premium; Premium: IA en streaming registrada en ai_usage", async () => {
    const g = lines((await app.inject({ method: "POST", url: `/v1/books/${B_GRATIS}/chat/messages`, headers: await auth("editor"), payload: JSON.stringify({ text: "¿Qué opinas de los CDT?" }) })).body)
    expect((g.at(-1) as unknown as { msg: { meta: { aviso: string } } }).msg.meta.aviso).toBe("plan")
    const p = lines((await app.inject({ method: "POST", url: `/v1/books/${B_PREMIUM}/chat/messages`, headers: await auth("owner"), payload: JSON.stringify({ text: "¿Qué opinas de los CDT?" }) })).body)
    expect(p.filter((e) => e.t === "delta").map((e) => e.text).join("")).toBe("Los CDT son una opción segura.")
    expect(db.rows("ai_usage").find((x) => x.household_id === H_PREMIUM && x.fuente === "ia")).toMatchObject({ feature: "chat", input_tokens: 800, output_tokens: 30, plan: "premium" })
  })

  it("registrar y confirmar: la tarjeta llega en el stream y confirmar escribe en el libro (ChatWritesPort → confirm.ts)", async () => {
    const ev = lines((await app.inject({ method: "POST", url: `/v1/books/${B_PREMIUM}/chat/messages`, headers: await auth("owner"), payload: JSON.stringify({ text: "registra un ingreso de 200 mil por una venta" }) })).body)
    const card = ev.find((e) => e.t === "card") as unknown as { propuesta: { id: string; tipo: string } }
    expect(card.propuesta.tipo).toBe("ingreso")
    const done = ev.at(-1) as unknown as { msg: { id: string } }
    const r = await app.inject({ method: "POST", url: `/v1/books/${B_PREMIUM}/chat/messages/${done.msg.id}/proposals/${card.propuesta.id}/confirm`, headers: { authorization: (await auth("owner")).authorization } })
    expect(r.statusCode).toBe(200)
    expect(r.json().data).toMatchObject({ msg: "Ingreso registrado", propuesta: { estado: "hecho" } })
    expect(db.rows("extra_incomes")).toHaveLength(1)
    expect(db.rows("extra_incomes")[0]).toMatchObject({ book_id: B_PREMIUM, valor: 200000 })
  })
})

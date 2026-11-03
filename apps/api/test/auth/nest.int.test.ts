// La API completa (Nest + Fastify) con AUTH_PROVIDER=mirai: Better Auth montado en /api/auth/*, la cookie httpOnly
// sirve para /v1/** (AuthGuard + cadena de verificadores), /v1/auth/** del contrato y, con AUTH_PROVIDER=supabase, nada
// cambia (no se monta /api/auth y un JWT de Supabase sigue entrando).
import type { NestFastifyApplication } from "@nestjs/platform-fastify"
import { Test } from "@nestjs/testing"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { AppModule } from "../../src/app.module"
import { configureApp, fastifyAdapter } from "../../src/app.setup"
import { staticJwks } from "../../src/core/auth/jwks"
import { JoseTokenVerifier, SupabaseJwtVerifier } from "../../src/core/auth/supabase-jwt.verifier"
import { loadConfig } from "../../src/core/config/config.schema"
import { AppContextRepo } from "../../src/core/context/app-context.repo"
import { DbHealth } from "../../src/core/db/db-health"
import { createLogger } from "../../src/core/logging/logger"
import { AuthMailer, MemoryAuthMailer } from "../../src/modules/auth/auth-mailer"
import { MiraiAuthService } from "../../src/modules/auth/mirai-auth.service"
import { FakeAppContextRepo } from "../setup/fakes"
import { AUDIENCE, ISSUER, signers } from "../setup/tokens"
import { TEST_KEY } from "../setup/app"
import { freshDb, hasPg, type TestDb } from "./pg"

const ORIGIN = "http://localhost:3000"
const PW = "Clave-Segura-2026!"

async function boot(env: Record<string, string>) {
  const saved: Record<string, string | undefined> = {}
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k]
    process.env[k] = v
  }
  const config = loadConfig({ MIRAI_ENV: "local", SUPABASE_URL: "https://proyecto-prueba.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_prueba", ENCRYPTION_KEY: TEST_KEY, WEB_ORIGINS: ORIGIN, LOG_LEVEL: "silent", RATE_LIMIT_DEFAULT_PER_MIN: "1000" })
  const logger = createLogger({ level: "silent", service: "mirai-api", version: "test", project: undefined, destination: { write: () => undefined } })
  const { supabase } = await signers()
  const mailer = new MemoryAuthMailer()
  const mod = await Test.createTestingModule({ imports: [AppModule.register({ config, logger })] })
    .overrideProvider(SupabaseJwtVerifier)
    .useValue(new JoseTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, jwks: staticJwks(supabase.jwks) }))
    .overrideProvider(AppContextRepo)
    .useValue(new FakeAppContextRepo())
    .overrideProvider(DbHealth)
    .useValue({ check: async () => ({ ok: true }) })
    .overrideProvider(AuthMailer)
    .useValue(mailer)
    .compile()
  const app = mod.createNestApplication<NestFastifyApplication>(fastifyAdapter(config), { rawBody: true, logger: false })
  configureApp(app, config, logger)
  await app.init()
  await app.getHttpAdapter().getInstance().ready()
  const restore = () => {
    for (const [k, v] of Object.entries(saved)) if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  return { app, mailer, restore, supabase }
}

describe.skipIf(!hasPg)("API con AUTH_PROVIDER=mirai (Nest + Fastify + Postgres 17)", () => {
  let t: TestDb
  let app: NestFastifyApplication
  let mailer: MemoryAuthMailer
  let restore: () => void
  beforeAll(async () => {
    t = await freshDb("nest")
    ;({ app, mailer, restore } = await boot({ AUTH_PROVIDER: "mirai", BETTER_AUTH_SECRET: "secreto-de-better-auth-para-pruebas-1234567890", AUTH_DATABASE_URL: t.url, BETTER_AUTH_URL: ORIGIN, AUTH_MAIL_DRIVER: "memory" }))
    app.get(MiraiAuthService).useDb(t.db)
  })
  afterAll(async () => {
    await app?.close()
    restore?.()
    await t?.drop()
  })

  const inject = (o: { method: "GET" | "POST" | "DELETE"; url: string; body?: unknown; cookie?: string; headers?: Record<string, string> }) =>
    app.getHttpAdapter().getInstance().inject({ method: o.method, url: o.url, payload: o.body as object | undefined, headers: { origin: ORIGIN, ...(o.cookie ? { cookie: o.cookie } : {}), ...o.headers } })
  const cookieOf = (setCookie: string | string[] | undefined) => (Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []).map((c) => c.split(";")[0]).join("; ")

  it("/v1/auth/config es público y dice el proveedor", async () => {
    const r = await inject({ method: "GET", url: "/v1/auth/config" })
    expect(r.statusCode).toBe(200)
    expect(r.json()).toMatchObject({ provider: "mirai", registroAbierto: true, google: false, captcha: false, passwordMin: 10 })
  })

  it("registro y entrada por /api/auth/*; la cookie httpOnly sirve para /v1/** (consentimientos, segundo factor, sesiones)", async () => {
    const up = await inject({ method: "POST", url: "/api/auth/sign-up/email", body: { email: "nest@ejemplo.co", password: PW, name: "Nest", nombre: "Nest Prueba", acepta_version: "2026-11-01.2" } })
    expect(up.statusCode, up.body).toBe(200)
    const verifyUrl = new URL(mailer.lastUrl("nest@ejemplo.co", "verificar_correo"))
    const v = await inject({ method: "GET", url: `${verifyUrl.pathname}${verifyUrl.search}` })
    expect(v.statusCode).toBe(302)
    const sign = await inject({ method: "POST", url: "/api/auth/sign-in/email", body: { email: "nest@ejemplo.co", password: PW } })
    expect(sign.statusCode).toBe(200)
    const raw = ([] as string[]).concat(sign.headers["set-cookie"] as string | string[])
    expect(raw.find((c) => c.startsWith("mirai.session_token="))).toMatch(/HttpOnly/i)
    const cookie = cookieOf(sign.headers["set-cookie"] as string[])

    expect((await inject({ method: "GET", url: "/v1/auth/mfa" })).statusCode).toBe(401)
    const mfa = await inject({ method: "GET", url: "/v1/auth/mfa", cookie })
    expect(mfa.statusCode, mfa.body).toBe(200)
    expect(mfa.json()).toEqual({ enabled: false, reactivar: false, backupCodes: false, aal: "aal1" })

    const cons = await inject({ method: "GET", url: "/v1/me/consents", cookie })
    expect(cons.json()).toMatchObject({ version: "2026-11-01.2" })
    // CSRF: con la cookie, una escritura sin X-Mirai-Client no entra.
    expect((await inject({ method: "POST", url: "/v1/me/consents", cookie, body: { version: "2026-12-01.1" } })).statusCode).toBe(401)
    const acc = await inject({ method: "POST", url: "/v1/me/consents", cookie, body: { version: "2026-12-01.1" }, headers: { "x-mirai-client": "web@test" } })
    expect(acc.statusCode).toBe(200)
    expect((await inject({ method: "GET", url: "/v1/me/consents", cookie })).json().version).toBe("2026-12-01.1")

    // Bearer con el token de sesión (SSR de Next): mismo resultado.
    const token = (await inject({ method: "GET", url: "/api/auth/get-session", cookie })).json().session.token
    expect((await inject({ method: "GET", url: "/v1/auth/mfa", headers: { authorization: `Bearer ${token}` } })).statusCode).toBe(200)

    // Crear contraseña cuando ya hay una: 409 en español.
    const set = await inject({ method: "POST", url: "/v1/auth/password", cookie, body: { newPassword: "Otra-Clave-Larga-1" }, headers: { "x-mirai-client": "web@test" } })
    expect(set.statusCode).toBe(409)
    expect(set.json().msg).toMatch(/Ya tienes una contraseña/)

    // Sesiones de la consola: sin ser administrador, 403/404.
    const uid = (await inject({ method: "GET", url: "/api/auth/get-session", cookie })).json().user.id
    expect((await inject({ method: "GET", url: `/v1/admin/users/${uid}/sessions`, cookie })).statusCode).toBeGreaterThanOrEqual(403)
  })

  it("rutas desconocidas de Better Auth responden 404", async () => {
    expect((await inject({ method: "GET", url: "/api/auth/no-existe" })).statusCode).toBe(404)
  })
})

describe("API con AUTH_PROVIDER=supabase (por defecto): sin cambios", () => {
  let app: NestFastifyApplication
  let restore: () => void
  let supabase: Awaited<ReturnType<typeof signers>>["supabase"]
  beforeAll(async () => {
    ;({ app, restore, supabase } = await boot({ AUTH_PROVIDER: "supabase" }))
  })
  afterAll(async () => {
    await app?.close()
    restore?.()
  })

  it("no monta /api/auth y /v1/auth/config dice supabase", async () => {
    const f = app.getHttpAdapter().getInstance()
    expect((await f.inject({ method: "POST", url: "/api/auth/sign-in/email", payload: {} })).statusCode).toBe(404)
    expect((await f.inject({ method: "GET", url: "/v1/auth/config" })).json()).toMatchObject({ provider: "supabase" })
  })

  it("un JWT de Supabase sigue entrando y una cookie de Better Auth no", async () => {
    const f = app.getHttpAdapter().getInstance()
    const jwt = await supabase.sign({ sub: "00000000-0000-4000-8000-000000000001", role: "authenticated", email: "qa@ejemplo.co" })
    const ok = await f.inject({ method: "GET", url: "/v1/me", headers: { authorization: `Bearer ${jwt}` } })
    expect(ok.statusCode).not.toBe(401)
    const no = await f.inject({ method: "GET", url: "/v1/me", headers: { cookie: "mirai.session_token=abc.def" } })
    expect(no.statusCode).toBe(401)
  })
})

import { describe, expect, it } from "vitest"
import { ConfigError, loadConfig } from "./config.schema"

const KEY = Buffer.alloc(32, 1).toString("base64")
const base = { SUPABASE_URL: "https://x.supabase.co/", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x" }

describe("configuración por entorno (zod)", () => {
  it("local: valores por defecto y respaldo NEXT_PUBLIC_* (.env.local de la web)", () => {
    const c = loadConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "k" })
    expect(c).toMatchObject({ env: "local", mode: "api", port: 8080, db: { adapter: "supabase" }, webOrigins: ["http://localhost:3000"], docs: true })
    expect(c.auth).toEqual({ jwksUrl: "https://x.supabase.co/auth/v1/.well-known/jwks.json", issuer: "https://x.supabase.co/auth/v1", audience: "authenticated", jwtSecret: undefined })
    expect(c.rateLimit.store).toBe("memory")
  })

  it("pruebas/producción exigen los secretos (Secret Manager) y CORS; el error nombra variables, nunca valores", () => {
    try {
      loadConfig({ ...base, MIRAI_ENV: "produccion", SUPABASE_SECRET_KEY: "sb_secret_NO_DEBE_SALIR" })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError)
      const msg = (e as Error).message
      expect(msg).toMatch(/ENCRYPTION_KEY/)
      expect(msg).toMatch(/WEB_ORIGINS/)
      expect(msg).toMatch(/SCHEDULER_AUDIENCE/)
      expect(msg).not.toContain("NO_DEBE_SALIR")
    }
    const c = loadConfig({ ...base, MIRAI_ENV: "produccion", SUPABASE_SECRET_KEY: "s", ENCRYPTION_KEY: KEY, WEB_ORIGINS: "https://mirai.engynex.com", CRON_SECRET: "c" })
    expect(c).toMatchObject({ docs: false, validateResponses: false, rateLimit: { store: "supabase" }, webOrigins: ["https://mirai.engynex.com"] })
  })

  it("MODE=realtime fuera de local no exige las variables del cron (el gateway no tiene /v1/jobs)", () => {
    const remote = { ...base, MIRAI_ENV: "produccion", SUPABASE_SECRET_KEY: "s", ENCRYPTION_KEY: KEY, WEB_ORIGINS: "https://mirai.engynex.com" }
    expect(loadConfig({ ...remote, MODE: "realtime" })).toMatchObject({ mode: "realtime", scheduler: { cronSecret: undefined, audience: undefined, serviceAccounts: [] } })
    expect(() => loadConfig({ ...remote, MODE: "api" })).toThrow(/SCHEDULER_AUDIENCE/)
    expect(() => loadConfig({ ...base, MIRAI_ENV: "produccion", MODE: "realtime", SUPABASE_SECRET_KEY: "s", ENCRYPTION_KEY: KEY })).toThrow(/WEB_ORIGINS/)
  })

  it("valida ENCRYPTION_KEY, PORT y combinaciones (pg sin DATABASE_URL, Cloud Tasks sin proyecto)", () => {
    expect(() => loadConfig({ ...base, ENCRYPTION_KEY: "corta" })).toThrow(/32 bytes/)
    expect(() => loadConfig({ ...base, PORT: "99999" })).toThrow(ConfigError)
    expect(() => loadConfig({ ...base, DB_ADAPTER: "pg" })).toThrow(/DATABASE_URL/)
    expect(() => loadConfig({ ...base, QUEUE_DRIVER: "cloudtasks" })).toThrow(/GCP_PROJECT/)
    expect(() => loadConfig({ ...base, IDEMPOTENCY_STORE: "supabase" })).toThrow(/SUPABASE_SECRET_KEY/)
    expect(() => loadConfig({})).toThrow(/SUPABASE_URL/)
  })

  it("listas separadas por coma y booleanos", () => {
    const c = loadConfig({ ...base, WEB_ORIGINS: " https://a.co , https://b.co ", SCHEDULER_SERVICE_ACCOUNTS: "x@y.iam.gserviceaccount.com", DOCS: "0" })
    expect(c.webOrigins).toEqual(["https://a.co", "https://b.co"])
    expect(c.scheduler.serviceAccounts).toEqual(["x@y.iam.gserviceaccount.com"])
    expect(c.docs).toBe(false)
  })
})

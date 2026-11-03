// V7-D · PostgrestFactory sin red: qué JWT interno y qué encabezados manda por alcance, y que SupabaseJsFactory lo
// entregue con la forma de siempre cuando DB_ADAPTER=postgrest.
import { decodeJwt, jwtVerify } from "jose"
import pino from "pino"
import { describe, expect, it } from "vitest"
import type { AppConfig } from "../config/app-config"
import { internalClaims, INTERNAL_JWT_TTL_S, PostgrestFactory } from "./postgrest.factory"
import { systemScope, type UserScope } from "./scope"
import { SupabaseJsFactory } from "./supabase-js.factory"

const SECRET = "secreto-de-prueba-de-32-caracteres-o-mas"
const config = { db: { adapter: "postgrest", url: undefined, postgrest: { url: "http://pgrst.interno:3000", jwtSecret: SECRET } } } as unknown as AppConfig
const log = pino({ level: "silent" })
const user: UserScope = { kind: "user", userId: "u-1", token: "jwt-de-supabase", claims: { sub: "u-1", role: "authenticated", email: "a@b.co", session_id: "s-1", aal: "aal2", exp: 1 } }

function capture() {
  const calls: { url: string; headers: Headers; method?: string }[] = []
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), headers: new Headers(init?.headers), method: init?.method })
    return new Response("[]", { status: 200, headers: { "content-type": "application/json", "content-range": "0-0/0" } })
  }) as typeof fetch
  return { calls, f }
}

describe("PostgrestFactory", () => {
  it("claims del JWT interno: la persona (sin el token de Supabase) y el sistema como service_role", () => {
    expect(internalClaims(user)).toEqual({ sub: "u-1", role: "authenticated", aud: "authenticated", email: "a@b.co", session_id: "s-1", aal: "aal2" })
    expect(internalClaims(systemScope("cron"))).toEqual({ role: "service_role" })
  })

  it("UserScope: Bearer firmado con POSTGREST_JWT_SECRET (60 s) + x-mirai-enlaces; lo reusa en la misma petición", async () => {
    const { calls, f } = capture()
    const pf = new PostgrestFactory(config, log, f)
    const db = pf.for(user)
    await db.from("categories").select("id").eq("book_id", "b-1")
    await db.rpc("sync_enlaces_on")
    expect(calls[0].url).toBe("http://pgrst.interno:3000/categories?select=id&book_id=eq.b-1")
    expect(calls[1].url).toBe("http://pgrst.interno:3000/rpc/sync_enlaces_on")
    const token = calls[0].headers.get("authorization")!.replace("Bearer ", "")
    expect(calls[1].headers.get("authorization")).toBe(`Bearer ${token}`)
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET), { algorithms: ["HS256"] })
    expect(payload).toMatchObject({ sub: "u-1", role: "authenticated", iss: "mirai-api" })
    expect(Number(payload.exp) - Number(payload.iat)).toBe(INTERNAL_JWT_TTL_S)
    expect(calls[0].headers.get("x-mirai-enlaces")).toBe("1")
    expect(pf.for(user)).toBe(db)
  })

  it("SystemScope: service_role y sin x-mirai-enlaces (igual que supabaseAdmin())", async () => {
    const { calls, f } = capture()
    await new PostgrestFactory(config, log, f).for(systemScope("cron")).from("plans").select("id")
    expect(decodeJwt(calls[0].headers.get("authorization")!.replace("Bearer ", ""))).toMatchObject({ role: "service_role" })
    expect(calls[0].headers.get("x-mirai-enlaces")).toBeNull()
  })

  it("SupabaseJsFactory con DB_ADAPTER=postgrest: mismo .from/.rpc; .auth y .storage fallan con un mensaje claro", async () => {
    const { calls, f } = capture()
    const sb = new SupabaseJsFactory(config, log, new PostgrestFactory(config, log, f))
    await sb.for(user).from("expenses").select("id")
    expect(calls[0].url).toBe("http://pgrst.interno:3000/expenses?select=id")
    expect(() => sb.for(user).auth).toThrow()
    expect(() => sb.for(systemScope("x")).storage).toThrow()
    expect((await sb.ping()).ok).toBe(true)
    expect(calls.at(-1)).toMatchObject({ url: "http://pgrst.interno:3000/", method: "HEAD" })
  })

  it("sin POSTGREST_URL o sin secreto: error interno (de configuración), nunca una consulta sin firmar", async () => {
    const bad = new PostgrestFactory({ db: { adapter: "postgrest", postgrest: { url: "http://x" } } } as unknown as AppConfig, log, capture().f)
    await expect(bad.token(user)).rejects.toMatchObject({ code: "INTERNAL" })
  })
})

// App de prueba del gateway (F2-G): la app real con MODE=realtime (HealthModule + RealtimeModule) escuchando en un
// puerto local efímero, con los mismos dobles que test/setup/app.ts (JWT con JWKS local, contexto en memoria). Sin
// Redis ni base: presencia en memoria y el trigger simulado llamando a PgLiveListener.handle / LiveFanout.
import type { NestFastifyApplication } from "@nestjs/platform-fastify"
import { Test } from "@nestjs/testing"
import { io, type Socket } from "socket.io-client"
import type { RawAppContext } from "@mirai/domain/app-context"
import type { ClientToServerEvents, ServerToClientEvents } from "@mirai/contracts/modules/realtime"
import { AppModule } from "../../src/app.module"
import { configureApp, fastifyAdapter } from "../../src/app.setup"
import { staticJwks } from "../../src/core/auth/jwks"
import { JoseTokenVerifier } from "../../src/core/auth/supabase-jwt.verifier"
import { TokenVerifier } from "../../src/core/auth/token-verifier"
import { loadConfig } from "../../src/core/config/config.schema"
import { AppContextRepo } from "../../src/core/context/app-context.repo"
import { DbHealth } from "../../src/core/db/db-health"
import { createLogger } from "../../src/core/logging/logger"
import { RealtimeConfig, type RealtimeConfigShape } from "../../src/modules/realtime/realtime.config"
import { FakeAppContextRepo } from "../setup/fakes"
import { rawFor } from "../setup/fixtures"
import { AUDIENCE, ISSUER, signers } from "../setup/tokens"

export const ORIGIN_OK = "https://mirai.engynex.com"

export type RtTestApp = {
  app: NestFastifyApplication
  url: string
  logs: Record<string, unknown>[]
  contextRepo: FakeAppContextRepo
  /** Personas que "salieron" del hogar (el contexto en memoria ya no les da libros). */
  removed: Set<string>
  /** Rol forzado por persona (simula un cambio de rol). */
  roles: Map<string, RawAppContext["households"][number]["access_role"]>
  close(): Promise<void>
}

export async function createRealtimeApp(o: { rt?: Partial<RealtimeConfigShape>; providers?: { provide: unknown; useValue: unknown }[] } = {}): Promise<RtTestApp> {
  const config = loadConfig({
    MIRAI_ENV: "local",
    MODE: "realtime",
    SUPABASE_URL: "https://proyecto-prueba.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_publishable_prueba",
    ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    WEB_ORIGINS: `${ORIGIN_OK},https://engynex-mirai-*.vercel.app`,
    LOG_LEVEL: "debug",
  })
  const rt: RealtimeConfigShape = {
    path: "/socket.io", tokenCheckMs: 600_000, presenceTtlMs: 60_000, recoveryMs: 120_000, maxBooks: 5, eventsPer10s: 40,
    pgListen: false, apiEmit: false, webOrigins: config.webOrigins, ...o.rt,
  }
  const logs: Record<string, unknown>[] = []
  const logger = createLogger({ level: "debug", service: "mirai-realtime", version: "test", destination: { write: (s: string) => void logs.push(JSON.parse(s)) } })
  const { supabase } = await signers()
  const removed = new Set<string>()
  const roles = new Map<string, RawAppContext["households"][number]["access_role"]>()
  const contextRepo = new FakeAppContextRepo((uid) => {
    if (removed.has(uid)) return rawFor("99999999-0000-4000-8000-999999999999")
    const raw = rawFor(uid)
    const r = roles.get(uid)
    return r ? { ...raw, households: raw.households.map((h) => ({ ...h, access_role: r })) } : raw
  })

  let b = Test.createTestingModule({ imports: [AppModule.register({ config, logger })] })
    .overrideProvider(TokenVerifier)
    .useValue(new JoseTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, jwks: staticJwks(supabase.jwks) }))
    .overrideProvider(AppContextRepo)
    .useValue(contextRepo)
    .overrideProvider(DbHealth)
    .useValue({ check: async () => ({ ok: true }) })
    .overrideProvider(RealtimeConfig)
    .useValue(rt)
  for (const p of o.providers ?? []) b = b.overrideProvider(p.provide).useValue(p.useValue)
  const mod = await b.compile()

  const app = mod.createNestApplication<NestFastifyApplication>(fastifyAdapter(config), { logger: false })
  configureApp(app, config, logger)
  await app.listen(0, "127.0.0.1")
  const addr = app.getHttpServer().address() as { port: number }
  return { app, url: `http://127.0.0.1:${addr.port}`, logs, contextRepo, removed, roles, close: () => app.close() }
}

export type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>

/** Cliente socket.io sin reconexión automática (cada prueba controla la suya). */
export function connect(url: string, token: string | null, opts: Parameters<typeof io>[1] = {}): TestSocket {
  return io(url, { transports: ["websocket"], forceNew: true, reconnection: false, auth: token ? { token } : {}, ...opts })
}

/** Espera a que conecte o falle (con el error del middleware). */
export function connected(s: TestSocket): Promise<{ ok: true } | { ok: false; message: string; data?: { code: string; msg: string } }> {
  return new Promise((res) => {
    s.once("connect", () => res({ ok: true }))
    s.once("connect_error", (e) => res({ ok: false, message: e.message, data: (e as Error & { data?: { code: string; msg: string } }).data }))
  })
}

/** Siguiente evento `ev` (o falla a los `ms`). */
export function next<E extends keyof ServerToClientEvents>(s: TestSocket, ev: E, ms = 2_000): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`no llegó ${String(ev)} en ${ms} ms`)), ms)
    s.once(ev as never, ((p: unknown) => {
      clearTimeout(t)
      res(p as never)
    }) as never)
  })
}

/** Junta los eventos `ev` que lleguen. */
export function collect<E extends keyof ServerToClientEvents>(s: TestSocket, ev: E): Parameters<ServerToClientEvents[E]>[0][] {
  const out: Parameters<ServerToClientEvents[E]>[0][] = []
  s.on(ev as never, ((p: unknown) => void out.push(p as never)) as never)
  return out
}

export const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Espera hasta que `fn` sea verdadero (o falla). */
export async function until(fn: () => boolean, ms = 2_000) {
  const end = Date.now() + ms
  while (!fn()) {
    if (Date.now() > end) throw new Error("tiempo agotado")
    await wait(10)
  }
}

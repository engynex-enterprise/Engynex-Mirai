// v7 (V7-H4): handshake del gateway con la cookie httpOnly de Better Auth (AUTH_PROVIDER=mirai). El navegador no tiene
// token: manda la cookie del mismo origen (o del mismo sitio en local) y el gateway la valida con el mismo verificador
// de la API. Cerrar la sesión en otro dispositivo desconecta en el siguiente barrido.
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { staticJwks } from "../../src/core/auth/jwks"
import { BetterAuthVerifier, SessionResolver, type ResolvedSession } from "../../src/core/auth/better-auth.verifier"
import { TokenChain } from "../../src/core/auth/chain.verifier"
import { JoseTokenVerifier } from "../../src/core/auth/supabase-jwt.verifier"
import { TokenVerifier } from "../../src/core/auth/token-verifier"
import { RealtimeGateway } from "../../src/modules/realtime/realtime.gateway"
import { B_GRATIS, USERS } from "../setup/fixtures"
import { AUDIENCE, ISSUER, signers, userToken } from "../setup/tokens"
import { connect, connected, createRealtimeApp, next, ORIGIN_OK, type RtTestApp, until } from "./helpers"

const live = new Set<string>(["sesion-buena"])

/** Sesiones de mentira: la cookie `mirai.session_token=<token>.<firma>` es válida mientras su token esté en `live`. */
class FakeResolver extends SessionResolver {
  get enabled() {
    return true
  }
  async resolve(o: { token?: string | null; cookie?: string | null }): Promise<ResolvedSession | null> {
    const raw = o.token ?? /mirai\.session_token=([^.;]+)/.exec(o.cookie ?? "")?.[1] ?? ""
    const tok = raw.split(".")[0]
    if (!live.has(tok)) return null
    const now = Date.now()
    return {
      user: { id: USERS.owner, email: "owner@correo.co", name: "Ana", emailVerified: true, twoFactorEnabled: false, banned: false, mfaReactivar: false },
      session: { id: "s-1", token: tok, aal: "aal1", amr: "password", createdAt: new Date(now - 1000), expiresAt: new Date(now + 3_600_000) },
    }
  }
}

let t: RtTestApp
const open: { close(): void }[] = []
const track = <T extends { close(): void }>(s: T) => (open.push(s), s)

beforeAll(async () => {
  const { supabase } = await signers()
  const chain = new TokenChain(new JoseTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, jwks: staticJwks(supabase.jwks) }), new BetterAuthVerifier(new FakeResolver()))
  t = await createRealtimeApp({ providers: [{ provide: TokenVerifier, useValue: chain }] })
})
afterEach(async () => {
  for (const s of open.splice(0)) s.close()
  live.clear()
  live.add("sesion-buena")
  await until(() => t.app.get(RealtimeGateway).server.sockets.sockets.size === 0)
})
afterAll(async () => {
  await t?.close()
})

describe("handshake con la cookie de Better Auth (AUTH_PROVIDER=mirai)", () => {
  it("sin token y con la cookie de sesión: entra y se une a su libro", async () => {
    const s = track(connect(t.url, null, { extraHeaders: { cookie: "otra=1; mirai.session_token=sesion-buena.firma", origin: ORIGIN_OK } }))
    expect(await connected(s)).toEqual({ ok: true })
    expect(await s.emitWithAck("join:book", { bookId: B_GRATIS })).toMatchObject({ ok: true, bookId: B_GRATIS, role: "owner" })
  })

  it("cookie inválida o sin cookie de sesión: UNAUTHENTICATED", async () => {
    expect(await connected(track(connect(t.url, null, { extraHeaders: { cookie: "mirai.session_token=vencida.firma", origin: ORIGIN_OK } })))).toMatchObject({ ok: false, data: { code: "UNAUTHENTICATED" } })
    expect(await connected(track(connect(t.url, null, { extraHeaders: { cookie: "otra=1", origin: ORIGIN_OK } })))).toMatchObject({ ok: false, data: { code: "UNAUTHENTICATED" } })
  })

  it("con un token (Supabase) la cookie no se usa: el JWT sigue mandando", async () => {
    const s = track(connect(t.url, await userToken(USERS.viewer), { extraHeaders: { cookie: "mirai.session_token=sesion-buena.firma", origin: ORIGIN_OK } }))
    expect(await connected(s)).toEqual({ ok: true })
    const srv = (await t.app.get(RealtimeGateway).server.fetchSockets()).find((x) => x.data.user?.id === USERS.viewer)
    expect(srv?.data.cookie).toBeUndefined()
  })

  it("la sesión se cierra en otro dispositivo: el siguiente barrido manda auth:expired y desconecta", async () => {
    const s = track(connect(t.url, null, { extraHeaders: { cookie: "mirai.session_token=sesion-buena.firma", origin: ORIGIN_OK } }))
    expect(await connected(s)).toEqual({ ok: true })
    const gw = t.app.get(RealtimeGateway)
    await gw.sweep()
    expect(s.connected).toBe(true)
    live.delete("sesion-buena")
    const expired = next(s, "auth:expired")
    await gw.sweep()
    expect(await expired).toMatchObject({ msg: expect.any(String) })
  })
})

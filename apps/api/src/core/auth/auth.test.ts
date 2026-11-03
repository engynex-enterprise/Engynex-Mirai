import { SignJWT } from "jose"
import { describe, expect, it } from "vitest"
import { AUDIENCE, ISSUER, signers, userToken } from "../../../test/setup/tokens"
import { DomainError } from "../errors/domain-error"
import { bearer } from "./auth.guard"
import { secretEquals } from "./scheduler.guard"
import { CachedRemoteJwks, staticJwks } from "./jwks"
import { JoseTokenVerifier } from "./supabase-jwt.verifier"

const verifier = async (hsSecret?: string) => new JoseTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, jwks: staticJwks((await signers()).supabase.jwks), hsSecret })

describe("JoseTokenVerifier (JWT de Supabase)", () => {
  it("ES256 válido → AuthUser con los claims", async () => {
    const tok = await userToken("u-1", { email: "ana@correo.co", aal: "aal2", is_anonymous: false })
    const u = await (await verifier()).verify(tok)
    expect(u).toMatchObject({ id: "u-1", email: "ana@correo.co", role: "authenticated", aal: "aal2", sessionId: "s-1", isAnonymous: false, token: tok })
    expect(u.expiresIn).toBeGreaterThan(3500)
  })

  it("rechaza vencido, otro emisor, otra audiencia, rol anon y HS256 sin secreto configurado", async () => {
    const v = await verifier()
    const fail = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
    await fail(v.verify(await userToken("u", {}, { expSec: -100 })))
    await fail(v.verify(await userToken("u", {}, { iss: "https://otro/auth/v1" })))
    await fail(v.verify(await userToken("u", {}, { aud: "anon" })))
    await fail(v.verify(await userToken("u", { role: "anon" })))
    const hs = await new SignJWT({ sub: "u", role: "authenticated" }).setProtectedHeader({ alg: "HS256" }).setIssuer(ISSUER).setAudience(AUDIENCE).setExpirationTime("1h").sign(new TextEncoder().encode("secreto-hs"))
    await fail(v.verify(hs))
    // Con SUPABASE_JWT_SECRET (proyectos que aún firman con HS256) sí pasa.
    expect((await (await verifier("secreto-hs")).verify(hs)).id).toBe("u")
    await fail(v.verify("basura"))
  })

  it("el vencido dice que la sesión venció", async () => {
    const e = await (await verifier()).verify(await userToken("u", {}, { expSec: -100 })).catch((x) => x)
    expect(e).toBeInstanceOf(DomainError)
    expect(e.msg).toBe("Tu sesión venció. Vuelve a iniciar sesión.")
  })

  it("ready() con JWKS local", async () => {
    expect(await (await verifier()).ready()).toMatchObject({ ok: true })
  })
})

describe("utilidades", () => {
  it("bearer()", () => {
    expect(bearer("Bearer abc.def")).toBe("abc.def")
    expect(bearer("bearer x")).toBe("x")
    expect(bearer("Basic x")).toBeNull()
    expect(bearer(undefined)).toBeNull()
  })
  it("secretEquals en tiempo constante", () => {
    expect(secretEquals("abc", "abc")).toBe(true)
    expect(secretEquals("abc", "abd")).toBe(false)
    expect(secretEquals("", "")).toBe(false)
    expect(secretEquals(undefined, "x")).toBe(false)
  })
})

describe("CachedRemoteJwks", () => {
  const setup = async () => {
    const { exportJWK, generateKeyPair, SignJWT } = await import("jose")
    const mk = async (kid: string) => {
      const k = await generateKeyPair("ES256", { extractable: true })
      return { kid, priv: k.privateKey, jwk: { ...(await exportJWK(k.publicKey)), kid, alg: "ES256" } }
    }
    const sign = (k: Awaited<ReturnType<typeof mk>>) => new SignJWT({ sub: "u", role: "authenticated" }).setProtectedHeader({ alg: "ES256", kid: k.kid }).setIssuer(ISSUER).setAudience(AUDIENCE).setExpirationTime("1h").sign(k.priv)
    return { mk, sign }
  }

  it("descarga una vez, sirve la copia vigente y refresca en segundo plano sin bloquear", async () => {
    const { mk, sign } = await setup()
    const a = await mk("a")
    let now = 0
    let calls = 0
    let release!: () => void
    const f = async () => {
      calls++
      if (calls === 2) await new Promise<void>((r) => (release = r)) // el refresco tarda
      return new Response(JSON.stringify({ keys: [a.jwk] }))
    }
    const jwks = new CachedRemoteJwks(new URL("https://x/jwks"), { fetch: f as never, now: () => now, refreshMs: 1000 })
    const v = new JoseTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, jwks })
    expect(jwks.loaded).toBe(false)
    await v.verify(await sign(a))
    await v.verify(await sign(a))
    expect(calls).toBe(1)
    now = 5000 // vencida: la verificación NO espera el refresco
    expect((await v.verify(await sign(a))).id).toBe("u")
    expect(calls).toBe(2)
    release()
  })

  it("kid desconocido (rotación): recarga y reintenta; si sigue sin estar, 401", async () => {
    const { mk, sign } = await setup()
    const a = await mk("a"), b = await mk("b")
    let keys = [a.jwk]
    let now = 0
    const f = async () => new Response(JSON.stringify({ keys }))
    const jwks = new CachedRemoteJwks(new URL("https://x/jwks"), { fetch: f as never, now: () => now, cooldownMs: 1000 })
    const v = new JoseTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, jwks })
    await v.verify(await sign(a))
    keys = [a.jwk, b.jwk]
    now = 2000
    expect((await v.verify(await sign(b))).id).toBe("u")
    await expect(v.verify(await sign(await mk("c")))).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
  })

  it("si el JWKS no responde: ready() lo dice y verificar da UPSTREAM (no 401)", async () => {
    const f = async () => {
      throw Object.assign(new Error("fetch failed"), { name: "TypeError" })
    }
    const jwks = new CachedRemoteJwks(new URL("https://x/jwks"), { fetch: f as never })
    const v = new JoseTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, jwks })
    expect(await v.ready()).toMatchObject({ ok: false })
    await expect(v.verify(await userToken("u"))).rejects.toMatchObject({ code: "UPSTREAM" })
    const caido = new CachedRemoteJwks(new URL("https://x/jwks"), { fetch: (async () => new Response("", { status: 503 })) as never })
    await expect(new JoseTokenVerifier({ issuer: ISSUER, audience: AUDIENCE, jwks: caido }).verify(await userToken("u"))).rejects.toMatchObject({ code: "UPSTREAM" })
  })
})

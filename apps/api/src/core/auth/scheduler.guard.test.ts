// SchedulerGuard con el emisor OIDC genérico (V7-F): llaves locales (jose.generateKeyPair), JWKS en memoria y un
// servidor HTTP local para el descubrimiento (.well-known/openid-configuration). Nada sale a la red.
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose"
import { createServer, type Server } from "node:http"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type { AppConfig } from "../config/app-config"
import type { RequestContextService } from "../context/request-context.service"
import { IssuerOidcVerifier, JoseOidcVerifier, SchedulerGuard } from "./scheduler.guard"

const ENTRA = "https://login.microsoftonline.com/tenant-1/v2.0"
const AUD = "api://mirai-api"
const OID = "11111111-2222-3333-4444-555555555555"

type Keys = Awaited<ReturnType<typeof keys>>
async function keys(kid: string, alg: "RS256" | "ES256" = "RS256") {
  const { privateKey, publicKey } = await generateKeyPair(alg, { extractable: true })
  const jwk = { ...(await exportJWK(publicKey)), kid, alg, use: "sig" }
  return {
    jwk,
    jwks: createLocalJWKSet({ keys: [jwk] }),
    sign: (p: JWTPayload, o: { iss?: string; aud?: string | null; expSec?: number } = {}) => {
      const j = new SignJWT(p).setProtectedHeader({ alg, kid }).setIssuer(o.iss ?? ENTRA).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) + (o.expSec ?? 600))
      if (o.aud !== null) j.setAudience(o.aud ?? AUD)
      return j.sign(privateKey)
    },
  }
}

const config = (o: Partial<AppConfig["scheduler"]> = {}) =>
  ({ scheduler: { cronSecret: "secreto-cron", audience: "https://api.mirai.test", serviceAccounts: ["sch@p.iam.gserviceaccount.com"], ...o } }) as unknown as AppConfig

function call(guard: SchedulerGuard, authorization?: string) {
  const req = { headers: authorization ? { authorization } : {} }
  return guard.canActivate({ switchToHttp: () => ({ getRequest: () => req }) } as never)
}

describe("SchedulerGuard: emisor OIDC genérico", () => {
  let entra: Keys, google: Keys, other: Keys
  let server: Server
  let base = ""

  beforeAll(async () => {
    ;[entra, google, other] = await Promise.all([keys("entra-1"), keys("goog-1"), keys("otro-1", "ES256")])
    // Emisor local con descubrimiento: issuer = http://127.0.0.1:<puerto>/tenant-x
    server = createServer((req, res) => {
      if (req.url === "/tenant-x/.well-known/openid-configuration") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ issuer: `${base}/tenant-x`, jwks_uri: `${base}/tenant-x/keys` }))
      if (req.url === "/malo/.well-known/openid-configuration") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ issuer: "https://otro", jwks_uri: `${base}/tenant-x/keys` }))
      if (req.url === "/tenant-x/keys") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ keys: [other.jwk] }))
      res.writeHead(404).end()
    })
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()))
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  })
  afterAll(() => new Promise((r) => server.close(r)))

  const make = (issuer: IssuerOidcVerifier | undefined, cfg = config()) => {
    const ctx = { patch: vi.fn() }
    return { guard: new SchedulerGuard(cfg, new JoseOidcVerifier(google.jwks), ctx as unknown as RequestContextService, issuer), ctx }
  }
  const entraVerifier = (o: Partial<ConstructorParameters<typeof IssuerOidcVerifier>[0]> = {}) => new IssuerOidcVerifier({ issuer: ENTRA, jwks: entra.jwks, audience: [AUD], principals: [OID], ...o })

  it("token válido de Entra (identidad administrada: oid) → pasa y registra quién llamó", async () => {
    const { guard, ctx } = make(entraVerifier())
    expect(await call(guard, `Bearer ${await entra.sign({ oid: OID, sub: OID, appid: "app-1" })}`)).toBe(true)
    expect(ctx.patch).toHaveBeenCalledWith({ caller: `oidc:login.microsoftonline.com:sub:${OID}` })
  })

  it("rechaza audiencia mala, emisor malo, principal no permitido, vencido y firma de otra llave", async () => {
    const { guard } = make(entraVerifier())
    await expect(call(guard, `Bearer ${await entra.sign({ oid: OID }, { aud: "api://otra" })}`)).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
    await expect(call(guard, `Bearer ${await entra.sign({ oid: OID }, { iss: "https://login.microsoftonline.com/otro-tenant/v2.0" })}`)).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
    await expect(call(guard, `Bearer ${await entra.sign({ oid: "99999999-0000-0000-0000-000000000000", sub: "x" })}`)).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
    await expect(call(guard, `Bearer ${await entra.sign({ oid: OID }, { expSec: -120 })}`)).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
    await expect(call(guard, `Bearer ${await other.sign({ oid: OID })}`)).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
    await expect(call(guard, "Bearer no.es.jwt")).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
    await expect(call(guard)).rejects.toMatchObject({ code: "UNAUTHENTICATED", message: "Falta el token del programador de tareas." })
  })

  it("Cognito (client credentials): sin `aud`, el principal es client_id; un email sin verificar no cuenta", async () => {
    const COGNITO = "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_Prueba"
    const v = new IssuerOidcVerifier({ issuer: COGNITO, jwks: entra.jwks, principals: ["cliente-eventbridge"] })
    const { guard, ctx } = make(v)
    expect(await call(guard, `Bearer ${await entra.sign({ client_id: "cliente-eventbridge", token_use: "access", scope: "mirai/jobs" }, { iss: COGNITO, aud: null })}`)).toBe(true)
    expect(ctx.patch).toHaveBeenCalledWith({ caller: "oidc:cognito-idp.us-east-1.amazonaws.com:client_id:cliente-eventbridge" })
    const ev = new IssuerOidcVerifier({ issuer: COGNITO, jwks: entra.jwks, principals: ["robot@mirai.co"] })
    const g2 = make(ev).guard
    await expect(call(g2, `Bearer ${await entra.sign({ email: "robot@mirai.co", email_verified: false }, { iss: COGNITO, aud: null })}`)).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
    expect(await call(g2, `Bearer ${await entra.sign({ email: "Robot@Mirai.co" }, { iss: COGNITO, aud: null })}`)).toBe(true)
  })

  it("JWKS por descubrimiento (.well-known) y emisor con o sin barra final; descubrimiento con otro emisor = 401", async () => {
    const v = new IssuerOidcVerifier({ issuer: `${base}/tenant-x/`, audience: [AUD], principals: ["job-1"] })
    const { guard } = make(v)
    expect(await call(guard, `Bearer ${await other.sign({ sub: "job-1" }, { iss: `${base}/tenant-x` })}`)).toBe(true)
    expect(await call(guard, `Bearer ${await other.sign({ sub: "job-1" }, { iss: `${base}/tenant-x/` })}`)).toBe(true)
    const bad = new IssuerOidcVerifier({ issuer: `${base}/malo`, audience: [AUD], principals: ["job-1"] })
    await expect(call(make(bad).guard, `Bearer ${await other.sign({ sub: "job-1" }, { iss: `${base}/malo` })}`)).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
    await expect(bad.verify(await other.sign({ sub: "job-1" }, { iss: `${base}/malo` }))).rejects.toThrow(/otro emisor/)
  })

  it("JWKS por URL fija", async () => {
    const v = new IssuerOidcVerifier({ issuer: "https://emisor.mirai.test", jwksUrl: `${base}/tenant-x/keys`, principals: ["job-2"] })
    expect(await v.verify(await other.sign({ azp: "job-2" }, { iss: "https://emisor.mirai.test" }))).toBe("azp:job-2")
  })

  it("Google y CRON_SECRET siguen funcionando junto al emisor genérico; sin emisor configurado no se aceptan otros tokens", async () => {
    const { guard, ctx } = make(entraVerifier())
    const g = await google.sign({ email: "sch@p.iam.gserviceaccount.com", email_verified: true }, { iss: "https://accounts.google.com", aud: "https://api.mirai.test" })
    expect(await call(guard, `Bearer ${g}`)).toBe(true)
    expect(ctx.patch).toHaveBeenLastCalledWith({ caller: "oidc:sch@p.iam.gserviceaccount.com" })
    expect(await call(guard, "Bearer secreto-cron")).toBe(true)
    expect(ctx.patch).toHaveBeenLastCalledWith({ caller: "secret" })
    await expect(call(guard, "Bearer otro-secreto")).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
    // Un token de Google no pasa por el emisor genérico ni al revés.
    await expect(call(guard, `Bearer ${await entra.sign({ oid: OID }, { iss: "https://accounts.google.com" })}`)).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
    const sinEmisor = make(undefined).guard
    await expect(call(sinEmisor, `Bearer ${await entra.sign({ oid: OID })}`)).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
  })

  it("arma el emisor desde la configuración (SCHEDULER_OIDC_*) si no se inyecta", async () => {
    const cfg = config({ cronSecret: undefined, oidc: { issuer: "https://emisor.mirai.test", jwksUrl: `${base}/tenant-x/keys`, audience: [], principals: ["job-3"] } })
    const ctx = { patch: vi.fn() }
    const guard = new SchedulerGuard(cfg, new JoseOidcVerifier(google.jwks), ctx as unknown as RequestContextService)
    expect(await call(guard, `Bearer ${await other.sign({ sub: "job-3" }, { iss: "https://emisor.mirai.test" })}`)).toBe(true)
  })
})

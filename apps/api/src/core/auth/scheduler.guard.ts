// SchedulerGuard (§2.2, §2.7.7, §3.6): protege /v1/jobs/**. Acepta:
//  1. Token OIDC de Google (Cloud Scheduler / Cloud Tasks) con audiencia = SCHEDULER_AUDIENCE y emitido para una de
//     las cuentas de SCHEDULER_SERVICE_ACCOUNTS (correo verificado).
//  2. (V7-F) Token de un emisor OIDC configurable (SCHEDULER_OIDC_ISSUER): Azure Entra (identidad administrada de un
//     Container Apps Job), AWS Cognito (client credentials de EventBridge API destinations), Keycloak… JWKS por
//     descubrimiento (<issuer>/.well-known/openid-configuration) o SCHEDULER_OIDC_JWKS_URL, audiencia opcional
//     (SCHEDULER_OIDC_AUDIENCE) y principales permitidos (SCHEDULER_OIDC_PRINCIPALS) comparados con
//     sub/email/client_id/azp/appid/oid.
//  3. `Authorization: Bearer CRON_SECRET` (Vercel, pg_cron, curl de un job programado), comparado en tiempo constante.
// El emisor del token (sin verificar) elige el verificador; la firma, el emisor, la audiencia y el vencimiento se revisan
// siempre con el JWKS del emisor elegido.
import { applyDecorators, type CanActivate, type ExecutionContext, Inject, Injectable, Optional, UseGuards } from "@nestjs/common"
import { createHash, timingSafeEqual } from "node:crypto"
import { createRemoteJWKSet, decodeJwt, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose"
import { AppConfig } from "../config/app-config"
import { RequestContextService } from "../context/request-context.service"
import { DomainError } from "../errors/domain-error"
import { bearer } from "./auth.guard"
import { Public } from "./decorators"

/** Compara dos secretos sin revelar cuántos caracteres coinciden (igual que bearerOk de apps/web). */
export function secretEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  const ha = createHash("sha256").update(a).digest(), hb = createHash("sha256").update(b).digest()
  return timingSafeEqual(ha, hb)
}

export const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"]

/** Verificador del token OIDC de Google (puerto para poder probarlo con un JWKS local). */
export abstract class OidcVerifier {
  /** Devuelve el correo de la cuenta de servicio o lanza. */
  abstract verify(token: string, audience: string): Promise<string>
}

export class JoseOidcVerifier extends OidcVerifier {
  constructor(private readonly jwks: JWTVerifyGetKey) {
    super()
  }
  async verify(token: string, audience: string): Promise<string> {
    const { payload } = await jwtVerify(token, this.jwks, { issuer: GOOGLE_ISSUERS, audience, algorithms: ["RS256"], clockTolerance: 30 })
    if (payload.email_verified !== true || typeof payload.email !== "string") throw new Error("Token sin correo verificado")
    return payload.email
  }
}

@Injectable()
export class GoogleOidcVerifier extends JoseOidcVerifier {
  constructor() {
    super(createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"), { cacheMaxAge: 60 * 60_000, timeoutDuration: 3_000 }))
  }
}

// ── Emisor OIDC genérico ────────────────────────────────────────────────────────────────────────────────────────────

export type IssuerOidcOptions = {
  issuer: string
  /** JWKS fijo; si no, se descubre en <issuer>/.well-known/openid-configuration. */
  jwksUrl?: string
  /** Llaves ya cargadas (pruebas). */
  jwks?: JWTVerifyGetKey
  /** Audiencias aceptadas; vacío = no se revisa `aud`. */
  audience?: string[]
  /** Principales permitidos (sub, email, client_id, azp, appid u oid). */
  principals: string[]
  algorithms?: string[]
  fetch?: typeof fetch
}

/** Claims donde cada nube pone "quién es": Entra (oid, appid/azp, sub), Cognito (client_id, sub), Google/Keycloak (email, azp). */
export const PRINCIPAL_CLAIMS = ["sub", "email", "client_id", "azp", "appid", "oid"] as const

const ASYMMETRIC = ["RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512", "EdDSA"]

const trimSlash = (s: string) => s.replace(/\/+$/, "")

/** Token de identificación para /v1/jobs/** emitido por un proveedor OIDC configurable. */
export const SCHEDULER_ISSUER = Symbol("mirai.scheduler.issuer")

export class IssuerOidcVerifier {
  private keys?: Promise<JWTVerifyGetKey>
  private readonly issuers: string[]
  private readonly principals: Set<string>

  constructor(private readonly o: IssuerOidcOptions) {
    // Entra v1 usa barra final (https://sts.windows.net/<tenant>/) y Cognito no: se aceptan las dos formas.
    this.issuers = [...new Set([o.issuer, trimSlash(o.issuer), `${trimSlash(o.issuer)}/`])]
    this.principals = new Set(o.principals.map((p) => p.trim().toLowerCase()).filter(Boolean))
  }

  get issuer() {
    return this.o.issuer
  }

  /** ¿Este token dice venir de este emisor? (sin verificar: solo para elegir el verificador). */
  claims(iss: string | undefined): boolean {
    return !!iss && this.issuers.includes(iss)
  }

  private jwks(): Promise<JWTVerifyGetKey> {
    if (this.o.jwks) return Promise.resolve(this.o.jwks)
    const remote = (u: string) => createRemoteJWKSet(new URL(u), { cacheMaxAge: 60 * 60_000, timeoutDuration: 3_000 })
    if (this.o.jwksUrl) return (this.keys ??= Promise.resolve(remote(this.o.jwksUrl)))
    this.keys ??= (async () => {
      const f = this.o.fetch ?? fetch
      const r = await f(`${trimSlash(this.o.issuer)}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(5_000) })
      if (!r.ok) throw new Error(`Descubrimiento OIDC respondió ${r.status}`)
      const doc = (await r.json()) as { issuer?: string; jwks_uri?: string }
      if (!doc.issuer || !this.issuers.includes(doc.issuer)) throw new Error("El descubrimiento OIDC trae otro emisor")
      if (!doc.jwks_uri || !/^https?:\/\//.test(doc.jwks_uri)) throw new Error("El descubrimiento OIDC no trae jwks_uri")
      return remote(doc.jwks_uri)
    })().catch((e) => {
      this.keys = undefined // se reintenta en la próxima petición
      throw e
    })
    return this.keys
  }

  /** Verifica firma, emisor, audiencia (si hay) y vencimiento; devuelve el principal permitido o lanza. */
  async verify(token: string): Promise<string> {
    const { payload } = await jwtVerify(token, await this.jwks(), {
      issuer: this.issuers,
      ...(this.o.audience?.length ? { audience: this.o.audience } : {}),
      algorithms: this.o.algorithms ?? ASYMMETRIC,
      clockTolerance: 30,
      requiredClaims: ["exp"],
    })
    const hit = principalOf(payload, this.principals)
    if (!hit) throw new Error("Principal no permitido")
    return hit
  }
}

function principalOf(p: JWTPayload, allowed: Set<string>): string | undefined {
  for (const c of PRINCIPAL_CLAIMS) {
    const v = p[c]
    if (typeof v !== "string" || !v) continue
    if (c === "email" && p.email_verified === false) continue
    if (allowed.has(v.toLowerCase())) return `${c}:${v}`
  }
  return undefined
}

/** Arma el verificador del emisor configurable desde la configuración (undefined si no hay emisor). */
export function issuerVerifierFromConfig(c: AppConfig["scheduler"]["oidc"]): IssuerOidcVerifier | undefined {
  return c ? new IssuerOidcVerifier({ issuer: c.issuer, jwksUrl: c.jwksUrl, audience: c.audience, principals: c.principals }) : undefined
}

// ── Guarda ──────────────────────────────────────────────────────────────────────────────────────────────────────────

@Injectable()
export class SchedulerGuard implements CanActivate {
  private readonly issuer?: IssuerOidcVerifier

  constructor(
    private readonly config: AppConfig,
    private readonly oidc: OidcVerifier,
    private readonly ctx: RequestContextService,
    @Optional() @Inject(SCHEDULER_ISSUER) issuer?: IssuerOidcVerifier,
  ) {
    this.issuer = issuer ?? issuerVerifierFromConfig(config.scheduler.oidc)
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>()
    const token = bearer(req.headers.authorization)
    const { cronSecret, audience, serviceAccounts } = this.config.scheduler
    if (!token) throw DomainError.unauthenticated("Falta el token del programador de tareas.")
    if (cronSecret && secretEquals(token, cronSecret)) {
      this.ctx.patch({ caller: "secret" })
      return true
    }
    if (token.split(".").length === 3) {
      let iss: string | undefined
      try {
        iss = decodeJwt(token).iss
      } catch {
        /* no es un JWT: 401 */
      }
      if (iss && GOOGLE_ISSUERS.includes(iss) && audience && serviceAccounts.length) {
        try {
          const email = await this.oidc.verify(token, audience)
          if (serviceAccounts.includes(email)) {
            this.ctx.patch({ caller: `oidc:${email}` })
            return true
          }
        } catch {
          /* puede ser el emisor genérico (si también es Google) o un 401 */
        }
      }
      if (this.issuer?.claims(iss)) {
        try {
          const who = await this.issuer.verify(token)
          this.ctx.patch({ caller: `oidc:${new URL(this.issuer.issuer).host}:${who}` })
          return true
        } catch {
          /* cae al 401 de abajo */
        }
      }
    }
    throw DomainError.unauthenticated("Token del programador de tareas inválido.")
  }
}

/** Ruta de trabajo programado: sin sesión de persona, pero con OIDC (Google u otro emisor) o CRON_SECRET. */
export const Scheduler = () => applyDecorators(Public(), UseGuards(SchedulerGuard))

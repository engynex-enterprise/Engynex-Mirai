// Valida el access token de Supabase Auth (F2-B-2). El proyecto firma con ES256 (claves asimétricas): se valida con el
// JWKS público `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` (CachedRemoteJwks: caché que refresca en segundo plano).
// Si se configura SUPABASE_JWT_SECRET también acepta HS256 (proyectos que aún no rotaron a claves asimétricas).
import { Inject, Injectable, type OnApplicationBootstrap } from "@nestjs/common"
import { errors, jwtVerify, type JWTHeaderParameters, type JWTPayload, type JWTVerifyGetKey } from "jose"
import type { Logger } from "pino"
import { AppConfig } from "../config/app-config"
import { LOGGER } from "../logging/logger"
import { DomainError } from "../errors/domain-error"
import { CachedRemoteJwks, type JwksSource } from "./jwks"
import { TokenVerifier, type AuthUser } from "./token-verifier"

/** Errores de jose que significan "este token no sirve" (401). Cualquier otro es del JWKS o de la red (502). */
const TOKEN_ERRORS = [
  errors.JWTClaimValidationFailed, errors.JWTInvalid, errors.JWSInvalid, errors.JWSSignatureVerificationFailed,
  errors.JWKSNoMatchingKey, errors.JWKSMultipleMatchingKeys, errors.JOSEAlgNotAllowed, errors.JOSENotSupported, errors.JWKInvalid,
]

export type JwtVerifierOptions = { issuer: string; audience: string; jwks: JwksSource; hsSecret?: string; clockToleranceS?: number }

/** Verificador genérico con jose (lo reusan las pruebas con un JWKS local). */
export class JoseTokenVerifier extends TokenVerifier {
  private readonly secret?: Uint8Array
  constructor(private readonly o: JwtVerifierOptions) {
    super()
    this.secret = o.hsSecret ? new TextEncoder().encode(o.hsSecret) : undefined
  }

  async verify(token: string): Promise<AuthUser> {
    if (!token || token.split(".").length !== 3) throw DomainError.unauthenticated("Inicia sesión para continuar.")
    let payload: JWTPayload
    try {
      const key = (h: JWTHeaderParameters, t: Parameters<JWTVerifyGetKey>[1]) => (h.alg === "HS256" && this.secret ? this.secret : this.o.jwks.getKey(h, t))
      ;({ payload } = await jwtVerify(token, key as JWTVerifyGetKey, {
        issuer: this.o.issuer,
        audience: this.o.audience,
        algorithms: ["ES256", "RS256", "EdDSA", ...(this.secret ? ["HS256"] : [])],
        clockTolerance: this.o.clockToleranceS ?? 30,
        requiredClaims: ["sub", "exp"],
      }))
    } catch (e) {
      if (e instanceof errors.JWTExpired) throw DomainError.unauthenticated()
      if (TOKEN_ERRORS.some((E) => e instanceof E)) throw DomainError.unauthenticated("Tu sesión no es válida. Vuelve a iniciar sesión.")
      // Lo demás (JWKS caído o lento, red): no es culpa del token.
      throw DomainError.upstream("No pudimos validar tu sesión en este momento. Intenta de nuevo.", e)
    }
    if (payload.role !== "authenticated") throw DomainError.unauthenticated("Tu sesión no es válida. Vuelve a iniciar sesión.")
    return {
      id: String(payload.sub),
      email: typeof payload.email === "string" ? payload.email : null,
      role: String(payload.role),
      sessionId: typeof payload.session_id === "string" ? payload.session_id : undefined,
      aal: typeof payload.aal === "string" ? payload.aal : undefined,
      isAnonymous: payload.is_anonymous === true,
      token,
      claims: payload,
      expiresIn: Math.max(0, Number(payload.exp) - Math.floor(Date.now() / 1000)),
    }
  }

  /** Listo si ya hay llaves; si no, intenta descargarlas (lo que tarde lo corta /readyz). */
  async ready() {
    if (this.o.jwks.loaded) return { ok: true }
    try {
      await this.o.jwks.reload()
      return { ok: true }
    } catch (e) {
      return { ok: false, msg: `No se pudo leer el JWKS (${(e as Error).name})` }
    }
  }
}

@Injectable()
export class SupabaseJwtVerifier extends JoseTokenVerifier implements OnApplicationBootstrap {
  constructor(
    config: AppConfig,
    @Inject(LOGGER) private readonly log: Logger,
  ) {
    super({
      issuer: config.auth.issuer,
      audience: config.auth.audience,
      jwks: new CachedRemoteJwks(new URL(config.auth.jwksUrl)),
      hsSecret: config.auth.jwtSecret,
    })
  }

  /** Descarga el JWKS al arrancar (el de Supabase a veces tarda segundos en responder) con dos reintentos, para que
   *  /readyz y la primera petición no esperen. Si aún falla, la primera verificación lo vuelve a intentar. */
  onApplicationBootstrap() {
    void this.warmUp()
  }

  private async warmUp(waits = [0, 2_000, 5_000]) {
    const t = Date.now()
    for (const w of waits) {
      if (w) await new Promise((r) => setTimeout(r, w).unref())
      const r = await this.ready()
      if (r.ok) return this.log.debug({ ms: Date.now() - t }, "JWKS listo")
      this.log.warn({ ms: Date.now() - t, msg: r.msg }, "JWKS no disponible todavía")
    }
  }
}

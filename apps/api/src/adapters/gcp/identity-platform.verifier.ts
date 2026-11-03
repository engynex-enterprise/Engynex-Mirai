// Identity Platform (Firebase Auth) como adaptador OPCIONAL de identidad (v7 §3.1.9). Escrito, sin encender: el plan usa
// Better Auth. Si algún día se activa (AUTH_PROVIDER=gip), entra en la cadena de core/auth/chain.verifier.ts como el
// verificador de JWT y los uid de 28 caracteres se traducen a los UUID de Mirai con auth.external_ids
// (provider = 'gip', external_uid, user_id), que llena la importación de usuarios (importUsers de Identity Platform con
// hashes BCRYPT y `localId` = el UUID de Mirai para las cuentas migradas).
import { errors, jwtVerify, type JWTPayload } from "jose"
import { CachedRemoteJwks, type JwksSource } from "../../core/auth/jwks"
import { TokenVerifier, type AuthUser } from "../../core/auth/token-verifier"
import { DomainError } from "../../core/errors/domain-error"

export const GIP_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"

/** uid de Identity Platform → UUID de Mirai (auth.external_ids). null = cuenta sin mapear. */
export type ExternalIdLookup = (externalUid: string) => Promise<string | null>

export class IdentityPlatformVerifier extends TokenVerifier {
  private readonly jwks: JwksSource
  constructor(
    private readonly project: string,
    private readonly lookup: ExternalIdLookup,
    jwks?: JwksSource,
  ) {
    super()
    this.jwks = jwks ?? new CachedRemoteJwks(new URL(GIP_JWKS_URL))
  }

  async verify(token: string): Promise<AuthUser> {
    let payload: JWTPayload
    try {
      ;({ payload } = await jwtVerify(token, this.jwks.getKey, { issuer: `https://securetoken.google.com/${this.project}`, audience: this.project, algorithms: ["RS256"], requiredClaims: ["sub", "exp"] }))
    } catch (e) {
      if (e instanceof errors.JOSEError) throw DomainError.unauthenticated("Tu sesión no es válida. Vuelve a iniciar sesión.")
      throw DomainError.upstream("No pudimos validar tu sesión en este momento. Intenta de nuevo.", e)
    }
    const uid = String(payload.sub)
    const id = /^[0-9a-f-]{36}$/i.test(uid) ? uid : await this.lookup(uid)
    if (!id) throw DomainError.unauthenticated("Tu cuenta no está lista. Vuelve a iniciar sesión.")
    const fb = (payload.firebase ?? {}) as { sign_in_second_factor?: string; sign_in_provider?: string }
    const aal = fb.sign_in_second_factor ? "aal2" : "aal1"
    const claims: JWTPayload = { ...payload, sub: id, role: "authenticated", aal, amr: [{ method: fb.sign_in_provider ?? "password", timestamp: Number(payload.auth_time ?? payload.iat ?? 0) }] }
    return {
      id,
      email: typeof payload.email === "string" ? payload.email : null,
      role: "authenticated",
      sessionId: undefined,
      aal,
      isAnonymous: fb.sign_in_provider === "anonymous",
      token,
      claims,
      expiresIn: Math.max(0, Number(payload.exp) - Math.floor(Date.now() / 1000)),
    }
  }

  async ready() {
    if (this.jwks.loaded) return { ok: true }
    try {
      await this.jwks.reload()
      return { ok: true }
    } catch (e) {
      return { ok: false, msg: `No se pudo leer el JWKS de Identity Platform (${(e as Error).name})` }
    }
  }
}

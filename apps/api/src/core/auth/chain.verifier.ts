// Cadena de verificadores (§3.1.5): durante la transición la API acepta las dos identidades.
//   - Un JWT (tres partes separadas por punto) → Supabase (hasta el corte B + 30 días) o, si algún día se enciende,
//     Identity Platform.
//   - Cualquier otro token o la cookie de sesión → Better Auth (solo con AUTH_PROVIDER=mirai).
// Con AUTH_PROVIDER=supabase no hay SessionResolver encendido y todo va a Supabase: exactamente lo de antes.
import { Injectable, type OnApplicationBootstrap } from "@nestjs/common"
import { ModuleRef } from "@nestjs/core"
import { DomainError } from "../errors/domain-error"
import { BetterAuthVerifier, SessionResolver } from "./better-auth.verifier"
import { SupabaseJwtVerifier } from "./supabase-jwt.verifier"
import { TokenVerifier, type AuthUser, type VerifyHint } from "./token-verifier"

export const isJwt = (t: string) => t.split(".").length === 3

/** Elige el verificador por la forma del token (sin red). Reutilizable en pruebas con dobles. */
export class TokenChain extends TokenVerifier {
  constructor(
    private readonly jwt: TokenVerifier | null,
    private readonly session: TokenVerifier | null,
  ) {
    super()
  }

  async verify(token: string, hint?: VerifyHint): Promise<AuthUser> {
    if (!hint?.fromCookie && isJwt(token)) {
      if (!this.jwt) throw DomainError.unauthenticated("Tu sesión no es válida. Vuelve a iniciar sesión.")
      return this.jwt.verify(token, hint)
    }
    if (!this.session) throw DomainError.unauthenticated("Tu sesión no es válida. Vuelve a iniciar sesión.")
    return this.session.verify(token, hint)
  }

  async ready() {
    return this.jwt ? this.jwt.ready() : { ok: true }
  }
}

@Injectable()
export class ChainVerifier extends TokenVerifier implements OnApplicationBootstrap {
  private chain: TokenChain

  constructor(
    private readonly supabase: SupabaseJwtVerifier,
    private readonly moduleRef: ModuleRef,
  ) {
    super()
    this.chain = new TokenChain(supabase, null)
  }

  /** El SessionResolver vive en AuthModule (global): se busca cuando ya existe todo el grafo. */
  onApplicationBootstrap() {
    let resolver: SessionResolver | null = null
    try {
      resolver = this.moduleRef.get(SessionResolver, { strict: false })
    } catch {
      resolver = null
    }
    this.chain = new TokenChain(this.supabase, resolver?.enabled ? new BetterAuthVerifier(resolver) : null)
  }

  verify(token: string, hint?: VerifyHint) {
    return this.chain.verify(token, hint)
  }
  ready() {
    return this.chain.ready()
  }
}

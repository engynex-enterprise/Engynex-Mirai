// Verificador de sesiones de Better Auth (v7, V7-A; §3.1.5). Lee la sesión de la cookie httpOnly (mismo origen) o de un
// `Authorization: Bearer <token de sesión>` (SSR de Next, pruebas, clientes nativos) y arma los claims que espera la RLS:
// { sub, role: "authenticated", email, session_id, aal, amr }. Los pone el puente PostgREST / Kysely en
// request.jwt.claims, así auth.uid(), auth.jwt() y my_sessions() siguen idénticos.
import type { JWTPayload } from "jose"
import { DomainError } from "../errors/domain-error"
import { TokenVerifier, type AuthUser, type VerifyHint } from "./token-verifier"

/** Sesión válida con lo que necesitan la RLS y los servicios. */
export type ResolvedSession = {
  user: { id: string; email: string; name: string; emailVerified: boolean; twoFactorEnabled: boolean; banned: boolean; mfaReactivar: boolean }
  session: { id: string; token: string; aal: string; amr: string | null; createdAt: Date; expiresAt: Date }
}

/** Puerto: lo implementa MiraiAuthService (modules/auth). Con AUTH_PROVIDER=supabase, `enabled` es false. */
export abstract class SessionResolver {
  abstract get enabled(): boolean
  /** `token` (Bearer) o `cookie` (encabezado Cookie completo). null = no hay sesión válida. */
  abstract resolve(o: { token?: string | null; cookie?: string | null }): Promise<ResolvedSession | null>
}

/** Nombres de la cookie de sesión (con https Better Auth antepone `__Secure-`). */
export const SESSION_COOKIES = ["__Secure-mirai.session_token", "mirai.session_token"]

/** Valor de la cookie de sesión de Better Auth en un encabezado Cookie (o null). */
export function sessionCookieToken(cookie: string | string[] | undefined): string | null {
  const raw = Array.isArray(cookie) ? cookie.join("; ") : (cookie ?? "")
  for (const name of SESSION_COOKIES) {
    const m = new RegExp(`(?:^|;\\s*)${name.replace(/[.]/g, "\\.")}=([^;]+)`).exec(raw)
    if (m?.[1]) {
      try {
        return decodeURIComponent(m[1])
      } catch {
        return m[1]
      }
    }
  }
  return null
}

/** Claims con la forma de Supabase (amr con timestamp: "entraste hace poco" de @mirai/domain/account). */
export function claimsOf(r: ResolvedSession): JWTPayload {
  return {
    sub: r.user.id,
    role: "authenticated",
    aud: "authenticated",
    iss: "mirai",
    email: r.user.email,
    session_id: r.session.id,
    aal: r.session.aal,
    amr: [{ method: r.session.amr ?? "password", timestamp: Math.floor(r.session.createdAt.getTime() / 1000) }],
    is_anonymous: false,
    iat: Math.floor(r.session.createdAt.getTime() / 1000),
    exp: Math.floor(r.session.expiresAt.getTime() / 1000),
  }
}

export class BetterAuthVerifier extends TokenVerifier {
  constructor(private readonly resolver: SessionResolver) {
    super()
  }

  async verify(token: string, hint?: VerifyHint): Promise<AuthUser> {
    const r = await this.resolver.resolve(hint?.fromCookie ? { cookie: hint.cookie } : { token })
    if (!r) throw DomainError.unauthenticated("Tu sesión venció. Vuelve a entrar.")
    if (r.user.banned) throw DomainError.unauthenticated("Tu cuenta está suspendida. Escríbenos si crees que es un error.")
    // Nunca hay sesión sin el segundo factor (mirai-gate); esto es la red de seguridad.
    if (r.user.twoFactorEnabled && r.session.aal !== "aal2") throw DomainError.unauthenticated("Completa la verificación en dos pasos para continuar.")
    const claims = claimsOf(r)
    return {
      id: r.user.id,
      email: r.user.email,
      role: "authenticated",
      sessionId: r.session.id,
      aal: r.session.aal,
      isAnonymous: false,
      token: r.session.token,
      claims,
      expiresIn: Math.max(0, Math.floor((r.session.expiresAt.getTime() - Date.now()) / 1000)),
    }
  }

  async ready() {
    return { ok: true }
  }
}

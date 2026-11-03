// Puerto de autenticación (§2.2, D6): hoy lo implementa SupabaseJwtVerifier; en la fase 4, Identity Platform.
import type { JWTPayload } from "jose"

/** Persona autenticada (claims validados del JWT). `token` se reenvía a PostgREST para que la RLS siga igual. */
export type AuthUser = {
  id: string
  email: string | null
  /** `authenticated` (Supabase). */
  role: string
  sessionId?: string
  /** aal1 / aal2 (MFA). */
  aal?: string
  isAnonymous: boolean
  token: string
  claims: JWTPayload
  /** Segundos hasta que vence el token. */
  expiresIn: number
}

export abstract class TokenVerifier {
  /** Valida firma, emisor, audiencia y vencimiento. Lanza DomainError UNAUTHENTICATED si no sirve. */
  abstract verify(token: string): Promise<AuthUser>
  /** Para /readyz: ¿las llaves públicas (JWKS) están disponibles? */
  abstract ready(): Promise<{ ok: boolean; msg?: string }>
}

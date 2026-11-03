// Alcance de cada operación de base (§2.1, §2.3).
// - UserScope: con el JWT de la persona → la RLS de la base filtra igual que hoy.
// - SystemScope: salta RLS (clave secreta / dueño de las tablas). Solo cron, webhooks, portal del contador, consola
//   admin, límites de tasa e idempotencia; siempre con un `reason` que queda en el log.
import type { JWTPayload } from "jose"
import type { AuthUser } from "../auth/token-verifier"

export type UserScope = { kind: "user"; userId: string; token: string; claims: JWTPayload }
export type SystemScope = { kind: "system"; reason: string }
export type DbScope = UserScope | SystemScope

const userScopes = new WeakMap<AuthUser, UserScope>()

/** Alcance de la persona (uno por AuthUser, para reusar el cliente dentro de la misma petición). */
export function userScope(u: AuthUser): UserScope {
  let s = userScopes.get(u)
  if (!s) userScopes.set(u, (s = { kind: "user", userId: u.id, token: u.token, claims: u.claims }))
  return s
}

export const systemScope = (reason: string): SystemScope => ({ kind: "system", reason })

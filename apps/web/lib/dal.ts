import "server-only"
import { cache } from "react"
import { cookies } from "next/headers"
import { connection } from "next/server"
import { redirect } from "next/navigation"
import { FEATURES, can, type PremiumFeature } from "@/lib/plans"
import { atLeast, can as canRole, deniedMsg, type AccessRole, type LegacyRole, type Perm } from "@/lib/household/roles"
import type { AppContext as DomainAppContext } from "@mirai/domain/app-context"
import { serverApi } from "@/lib/api/server"
import { ApiError } from "@/lib/api/errors"
import { miraiSessionToken } from "@/lib/auth/server"

export const BOOK_COOKIE = "mirai-book"

/** Nivel que conoce la versión publicada (columna household_members.role). */
export type Role = LegacyRole
export type { AccessRole }
/** Contexto del shell: el de @mirai/domain/app-context (el que arma GET /v1/me con buildAppContext). */
export type AppContext = DomainAppContext

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Sesión vencida o inválida con la cookie todavía puesta: /login la borra (lib/auth/proxy.ts) y no hay bucle. */
export const SESSION_EXPIRED_URL = "/login?sesion=vencida"

/**
 * Lee la sesión, el hogar y el libro activo. Una sola vez por petición (cache de React).
 * GET /v1/me con la cookie de Better Auth (reenviada como Bearer de sesión, lib/api/server.ts) y el libro de la cookie.
 * Sin cookie → /login; 401 → /login (sesión vencida); 404 con `redirect` → /bienvenida (sin hogar).
 */
export const getAppContext = cache(async (): Promise<AppContext> => {
  await connection()
  const store = await cookies()
  const wanted = store.get(BOOK_COOKIE)?.value
  if (!(await miraiSessionToken())) redirect("/login")
  const res = await serverApi().me.get({ query: wanted && UUID.test(wanted) ? { bookId: wanted } : {} })
  if (res.status === 200) return res.body
  if ((res.status as number) === 401) redirect(SESSION_EXPIRED_URL)
  const redirectTo = res.status === 404 ? (res.body.details as { redirect?: string } | undefined)?.redirect : undefined
  if (redirectTo === "/bienvenida") redirect("/bienvenida")
  throw ApiError.from(res.status, res.body, res.headers)
})

/** Exige Premium en el hogar activo para una función (Server Actions de IA, banco, impuestos y familia). */
export async function requirePremium(feature: PremiumFeature) {
  const ctx = await getAppContext()
  if (!can(ctx.plan, feature)) throw new Error(`${FEATURES[feature].label} no está incluido en tu plan. Conoce los planes en /planes.`)
  return ctx
}

/** Exige ser administrador de la plataforma (panel /admin y sus Server Actions). */
export async function requirePlatformAdmin() {
  const ctx = await getAppContext()
  if (!ctx.isAdmin) throw new Error("Solo el administrador de Mirai puede ver esto.")
  return ctx
}

/**
 * Exige un rol mínimo en el hogar del libro activo (para Server Actions). Compara con el rol real: "admin"
 * (Administra) pasa "editor" pero no "owner"; "registra" (Registra sus gastos) solo pasa "viewer" y "registra".
 */
export async function requireRole(min: AccessRole) {
  const ctx = await getAppContext()
  if (!atLeast(ctx.household.access, min)) throw new Error("No tienes permiso para hacer esto en este hogar.")
  return ctx
}

/** Exige un permiso de la matriz de roles (lib/household/roles.ts) con un mensaje claro ("Tu rol no permite…"). */
export async function requireCan(p: Perm) {
  const ctx = await getAppContext()
  if (!canRole(ctx.household.access, p)) throw new Error(deniedMsg(p))
  return ctx
}

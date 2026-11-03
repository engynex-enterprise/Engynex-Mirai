import "server-only"
import { cache } from "react"
import { cookies } from "next/headers"
import { connection } from "next/server"
import { redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { FEATURES, can, type PremiumFeature } from "@/lib/plans"
import { atLeast, can as canRole, deniedMsg, type AccessRole, type LegacyRole, type Perm } from "@/lib/household/roles"
import { buildAppContext, NoHouseholdError, pickBook, type AppContext as DomainAppContext, type CtxHousehold, type PlanRow, type RawAppContext } from "@mirai/domain/app-context"
import { API_OFF, type ApiConfig } from "@/lib/api/modules"
import { getApiConfig } from "@/lib/api/rollout"
import { serverApi } from "@/lib/api/server"
import { viaApi } from "@/lib/api/via"

export const BOOK_COOKIE = "mirai-book"

/** Nivel que conoce la versión publicada (columna household_members.role). */
export type Role = LegacyRole
export type { AccessRole }
/**
 * Contexto del shell: el mismo de @mirai/domain/app-context (el que arma GET /v1/me con buildAppContext) más `api`,
 * la configuración de la API para esta persona (origen e interruptores; API_OFF con todo apagado).
 */
export type AppContext = DomainAppContext & { api: ApiConfig }

type Sb = ReturnType<typeof createClient>

/** Un solo viaje a la base (función mirai_app_context, RLS con el JWT de la persona). */
async function loadContextRpc(sb: Sb): Promise<RawAppContext | null> {
  const { data, error } = await sb.rpc("mirai_app_context")
  if (error || !data) return null
  return data as unknown as RawAppContext
}

/** Respaldo con las consultas sueltas (si la función aún no existe en la base). */
async function loadContextQueries(sb: Sb, uid: string): Promise<RawAppContext> {
  const [{ data: profile }, { data: memberships }, { data: admin }] = await Promise.all([
    sb.from("profiles").select("id,email,nombre,avatar_url,apodo,nacimiento,last_book_id").eq("id", uid).single(),
    sb.from("household_members").select("role, access_role, households(id,nombre)").eq("user_id", uid),
    sb.from("platform_admins").select("user_id").eq("user_id", uid).maybeSingle(),
  ])
  const households = (memberships ?? []).filter((m) => m.households).map((m) => ({ id: m.households!.id, nombre: m.households!.nombre, role: m.role, access_role: m.access_role }))
  const { data: books } = households.length
    ? await sb.from("books").select("id,nombre,tipo,icon,household_id,is_default").in("household_id", households.map((h) => h.id)).is("deleted_at", null).order("created_at")
    : { data: [] }
  return { profile, admin: !!admin, households, books: books ?? [] }
}

async function planOf(sb: Sb, h: CtxHousehold): Promise<PlanRow> {
  if (h.plan !== undefined) return h.plan
  const { data: planId } = await sb.rpc("household_plan", { h: h.id })
  const { data } = await sb.from("plans").select("id,nombre,funciones,anuncios,limites,precio_mes").eq("id", planId ?? "gratis").maybeSingle()
  return data
}

/** Lo de siempre: la base con el JWT de la persona y la misma regla que la API (buildAppContext). */
async function contextFromDb(sb: Sb, uid: string, claimsEmail: unknown, wanted: string | undefined): Promise<DomainAppContext> {
  const raw = (await loadContextRpc(sb)) ?? (await loadContextQueries(sb, uid))
  const book = pickBook(raw, wanted)
  const rawHousehold = book ? raw.households.find((h) => h.id === book.household_id) : undefined
  if (!rawHousehold) redirect("/bienvenida")
  const planRow = await planOf(sb, rawHousehold)
  try {
    return buildAppContext(raw, { uid, claimsEmail: claimsEmail == null ? null : String(claimsEmail), wantedBookId: wanted, planRow })
  } catch (e) {
    if (e instanceof NoHouseholdError) redirect("/bienvenida")
    throw e
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Por la API (interruptor `me`): GET /v1/me con el libro de la cookie. Sin hogar → /bienvenida (como hoy). Si la API
 * falla (red, 5xx, 401…) devuelve null y se lee de la base: en las lecturas siempre hay respaldo.
 */
async function contextFromApi(cfg: ApiConfig, sb: Sb, wanted: string | undefined): Promise<DomainAppContext | null> {
  let res: Awaited<ReturnType<ReturnType<typeof serverApi>["me"]["get"]>>
  try {
    res = await serverApi(cfg, sb).me.get({ query: wanted && UUID.test(wanted) ? { bookId: wanted } : {} })
  } catch {
    return null
  }
  if (res.status === 200) return res.body
  const redirectTo = res.status === 404 ? (res.body.details as { redirect?: string } | undefined)?.redirect : undefined
  if (redirectTo === "/bienvenida") redirect("/bienvenida")
  return null
}

/**
 * Lee la sesión, el hogar y el libro activo. Una sola vez por petición (cache de React).
 * Antes eran 4 viajes en serie a la base (perfil/hogares → libros → plan → fila del plan); ahora es uno.
 * Con el interruptor `me` encendido lo pide a la API (GET /v1/me); con todo apagado (por defecto) es lo de siempre.
 */
export const getAppContext = cache(async (): Promise<AppContext> => {
  await connection()
  const store = await cookies()
  const sb = createClient(store)
  const { data: claims } = await sb.auth.getClaims()
  const uid = claims?.claims.sub
  if (!uid) redirect("/login")

  const wanted = store.get(BOOK_COOKIE)?.value
  // Apagado (sin MIRAI_API_URL / MIRAI_API_ROLLOUT) no consulta nada: API_OFF.
  const pre = await getApiConfig({ userId: uid }, sb)
  const base = (viaApi(pre, "me") ? await contextFromApi(pre, sb, wanted) : null) ?? (await contextFromDb(sb, uid, claims?.claims.email, wanted))
  // Con la API configurada, se resuelve otra vez sabiendo si es administrador (modo "admins"; la caché evita otra lectura).
  const api = pre.url ? await getApiConfig({ userId: uid, isAdmin: base.isAdmin }, sb) : API_OFF
  return { ...base, api }
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

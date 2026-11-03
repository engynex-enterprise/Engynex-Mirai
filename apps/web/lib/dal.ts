import "server-only"
import { cache } from "react"
import { cookies } from "next/headers"
import { connection } from "next/server"
import { redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { FEATURES, can, toPlanInfo, type PlanInfo, type PremiumFeature } from "@/lib/plans"
import { atLeast, can as canRole, deniedMsg, toAccess, type AccessRole, type Perm } from "@/lib/household/roles"

export const BOOK_COOKIE = "mirai-book"

/** Nivel que conoce la versión publicada (columna household_members.role). */
export type Role = "owner" | "editor" | "viewer"
export type { AccessRole }
export type AppContext = {
  user: { id: string; email: string; nombre: string; avatar: string | null; apodo: string; nacimiento: string | null }
  /** `role`: nivel equivalente (owner/editor/viewer) · `access`: rol real (Dueño, Administra, Colabora, Registra sus gastos, Solo mira). */
  household: { id: string; nombre: string; role: Role; access: AccessRole }
  households: { id: string; nombre: string; role: Role; access: AccessRole }[]
  book: { id: string; nombre: string; tipo: string; icon: string }
  books: { id: string; nombre: string; tipo: string; icon: string; household_id: string }[]
  /** Administrador de la plataforma (dueño de Mirai): ve el panel /admin. */
  isAdmin: boolean
  /** Plan del hogar activo (lo comparten todos sus integrantes): funciones, anuncios y límites. */
  plan: PlanInfo
}

type PlanRow = Parameters<typeof toPlanInfo>[0]
type CtxProfile = { id: string; email: string | null; nombre: string | null; avatar_url: string | null; apodo: string | null; nacimiento: string | null; last_book_id: string | null }
type CtxHousehold = { id: string; nombre: string; role: string; access_role: string | null; plan?: PlanRow }
type CtxBook = { id: string; nombre: string; tipo: string; icon: string; household_id: string; is_default: boolean | null }
type RawContext = { profile: CtxProfile | null; admin: boolean; households: CtxHousehold[]; books: CtxBook[] }
type Sb = ReturnType<typeof createClient>

/** Un solo viaje a la base (función mirai_app_context, RLS con el JWT de la persona). */
async function loadContextRpc(sb: Sb): Promise<RawContext | null> {
  const { data, error } = await sb.rpc("mirai_app_context")
  if (error || !data) return null
  return data as unknown as RawContext
}

/** Respaldo con las consultas sueltas (si la función aún no existe en la base). */
async function loadContextQueries(sb: Sb, uid: string): Promise<RawContext> {
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

/**
 * Lee la sesión, el hogar y el libro activo. Una sola vez por petición (cache de React).
 * Antes eran 4 viajes en serie a la base (perfil/hogares → libros → plan → fila del plan); ahora es uno.
 */
export const getAppContext = cache(async (): Promise<AppContext> => {
  await connection()
  const store = await cookies()
  const sb = createClient(store)
  const { data: claims } = await sb.auth.getClaims()
  const uid = claims?.claims.sub
  if (!uid) redirect("/login")

  const raw = (await loadContextRpc(sb)) ?? (await loadContextQueries(sb, uid))
  const { profile, books } = raw
  const households = raw.households.map((h) => ({ id: h.id, nombre: h.nombre, role: h.role as Role, access: toAccess(h.access_role, h.role) }))
  if (!households.length || !books.length) redirect("/bienvenida")

  const wanted = store.get(BOOK_COOKIE)?.value ?? profile?.last_book_id
  const book = books.find((b) => b.id === wanted) ?? books.find((b) => b.is_default) ?? books[0]
  const household = households.find((h) => h.id === book.household_id)!
  const planRow = await planOf(sb, raw.households.find((h) => h.id === household.id)!)

  return {
    user: { id: uid, email: profile?.email ?? String(claims?.claims.email ?? ""), nombre: profile?.nombre || "Tú", avatar: profile?.avatar_url ?? null, apodo: profile?.apodo ?? "", nacimiento: profile?.nacimiento ?? null },
    household,
    households,
    book: { id: book.id, nombre: book.nombre, tipo: book.tipo, icon: book.icon },
    books: books.map((b) => ({ id: b.id, nombre: b.nombre, tipo: b.tipo, icon: b.icon, household_id: b.household_id })),
    isAdmin: raw.admin,
    plan: toPlanInfo(planRow),
  }
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

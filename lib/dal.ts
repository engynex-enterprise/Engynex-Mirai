import "server-only"
import { cache } from "react"
import { cookies } from "next/headers"
import { connection } from "next/server"
import { redirect } from "next/navigation"
import { createClient } from "@/utils/supabase/server"
import { FEATURES, type PlanId, type PremiumFeature } from "@/lib/plans"

export const BOOK_COOKIE = "mirai-book"

export type Role = "owner" | "editor" | "viewer"
export type AppContext = {
  user: { id: string; email: string; nombre: string; avatar: string | null; apodo: string; nacimiento: string | null }
  household: { id: string; nombre: string; role: Role }
  households: { id: string; nombre: string; role: Role }[]
  book: { id: string; nombre: string; tipo: string; icon: string }
  books: { id: string; nombre: string; tipo: string; icon: string; household_id: string }[]
  /** Administrador de la plataforma (dueño de Mirai): ve el panel /admin. */
  isAdmin: boolean
  /** Plan del hogar activo (Premium lo comparten todos sus integrantes). */
  plan: PlanId
}

/** Lee la sesión, el hogar y el libro activo. Una sola vez por petición (cache de React). */
export const getAppContext = cache(async (): Promise<AppContext> => {
  await connection()
  const store = await cookies()
  const sb = createClient(store)
  const { data: claims } = await sb.auth.getClaims()
  const uid = claims?.claims.sub
  if (!uid) redirect("/login")

  const [{ data: profile }, { data: memberships }, { data: admin }] = await Promise.all([
    sb.from("profiles").select("id,email,nombre,avatar_url,apodo,nacimiento,last_book_id").eq("id", uid).single(),
    sb.from("household_members").select("role, households(id,nombre)").eq("user_id", uid),
    sb.from("platform_admins").select("user_id").eq("user_id", uid).maybeSingle(),
  ])
  const households = (memberships ?? [])
    .filter((m) => m.households)
    .map((m) => ({ id: m.households!.id, nombre: m.households!.nombre, role: m.role as Role }))
  if (!households.length) redirect("/bienvenida")

  const { data: books } = await sb
    .from("books")
    .select("id,nombre,tipo,icon,household_id,is_default")
    .in("household_id", households.map((h) => h.id))
    .is("deleted_at", null)
    .order("created_at")
  if (!books?.length) redirect("/bienvenida")

  const wanted = store.get(BOOK_COOKIE)?.value ?? profile?.last_book_id
  const book = books.find((b) => b.id === wanted) ?? books.find((b) => b.is_default) ?? books[0]
  const household = households.find((h) => h.id === book.household_id)!
  const { data: plan } = await sb.rpc("household_plan", { h: household.id })

  return {
    user: { id: uid, email: profile?.email ?? String(claims?.claims.email ?? ""), nombre: profile?.nombre || "Tú", avatar: profile?.avatar_url ?? null, apodo: profile?.apodo ?? "", nacimiento: profile?.nacimiento ?? null },
    household,
    households,
    book: { id: book.id, nombre: book.nombre, tipo: book.tipo, icon: book.icon },
    books: books.map((b) => ({ id: b.id, nombre: b.nombre, tipo: b.tipo, icon: b.icon, household_id: b.household_id })),
    isAdmin: !!admin,
    plan: plan === "premium" ? "premium" : "gratis",
  }
})

/** Exige Premium en el hogar activo para una función (Server Actions de IA, banco, impuestos y familia). */
export async function requirePremium(feature: PremiumFeature) {
  const ctx = await getAppContext()
  if (ctx.plan !== "premium") throw new Error(`${FEATURES[feature].label} es parte de Mirai Premium. Conoce los planes en /planes.`)
  return ctx
}

/** Exige ser administrador de la plataforma (panel /admin y sus Server Actions). */
export async function requirePlatformAdmin() {
  const ctx = await getAppContext()
  if (!ctx.isAdmin) throw new Error("Solo el administrador de Mirai puede ver esto.")
  return ctx
}

/** Exige un rol mínimo en el hogar del libro activo (para Server Actions). */
export async function requireRole(min: Role) {
  const ctx = await getAppContext()
  const rank = { viewer: 1, editor: 2, owner: 3 }
  if (rank[ctx.household.role] < rank[min]) throw new Error("No tienes permiso para hacer esto en este hogar.")
  return ctx
}

// Contexto de la app (usuario, hogares, libro activo, plan y admin) a partir de lo que devuelve la base
// (función mirai_app_context o las consultas sueltas de respaldo). Puro: lo arma apps/api (GET /v1/me y BookGuard)
// con la misma regla de apps/web/lib/dal.ts (getAppContext), para que los dos den el mismo resultado.
import { toAccess, type AccessRole, type LegacyRole } from "./household/roles"
import { toPlanInfo, type PlanInfo } from "./plans"

export type PlanRow = Parameters<typeof toPlanInfo>[0]
export type CtxProfile = { id: string; email: string | null; nombre: string | null; avatar_url: string | null; apodo: string | null; nacimiento: string | null; last_book_id: string | null }
export type CtxHousehold = { id: string; nombre: string; role: string; access_role: string | null; plan?: PlanRow }
export type CtxBook = { id: string; nombre: string; tipo: string; icon: string; household_id: string; is_default: boolean | null }
/** Lo que devuelve `mirai_app_context()` (migración 20261103001300_rendimiento.sql). */
export type RawAppContext = { profile: CtxProfile | null; admin: boolean; households: CtxHousehold[]; books: CtxBook[] }

export type AppHousehold = { id: string; nombre: string; role: LegacyRole; access: AccessRole }
export type AppBook = { id: string; nombre: string; tipo: string; icon: string }
export type AppContext = {
  user: { id: string; email: string; nombre: string; avatar: string | null; apodo: string; nacimiento: string | null }
  /** `role`: nivel equivalente (owner/editor/viewer) · `access`: rol real (Dueño, Administra, Colabora, Registra sus gastos, Solo mira). */
  household: AppHousehold
  households: AppHousehold[]
  book: AppBook
  books: (AppBook & { household_id: string })[]
  /** Administrador de la plataforma (dueño de Mirai). */
  isAdmin: boolean
  /** Plan del hogar del libro activo (lo comparten todos sus integrantes). */
  plan: PlanInfo
}

/** Si la persona aún no tiene hogar o libro (la web la manda a /bienvenida). */
export class NoHouseholdError extends Error {
  constructor() {
    super("Todavía no tienes un hogar. Créalo en la bienvenida.")
  }
}

export type BuildContextInput = {
  uid: string
  /** `email` de los claims del JWT (respaldo si el perfil no lo tiene). */
  claimsEmail?: string | null
  /** Libro pedido (cookie `mirai-book` en la web; `?bookId=` o la ruta en la API). */
  wantedBookId?: string | null
  /** Plan del hogar activo si `raw.households[i].plan` no vino (respaldo con consultas sueltas). */
  planRow?: PlanRow
}

/** Hogar del libro que se usará: el pedido, el último que abrió, el predeterminado o el primero. */
export function pickBook(raw: RawAppContext, wanted?: string | null): CtxBook | null {
  const { books } = raw
  if (!books.length) return null
  const w = wanted ?? raw.profile?.last_book_id
  return books.find((b) => b.id === w) ?? books.find((b) => b.is_default) ?? books[0]
}

/**
 * Arma el AppContext con la misma regla de `getAppContext` (apps/web/lib/dal.ts). Lanza NoHouseholdError si no hay
 * hogar o libro. Si se pide un libro que la persona no ve, usa el de respaldo (igual que la cookie en la web);
 * quien necesite exigir un libro concreto (BookGuard) lo revisa aparte con `findBook`.
 */
export function buildAppContext(raw: RawAppContext, input: BuildContextInput): AppContext {
  const { profile, books } = raw
  const households = raw.households.map((h) => ({ id: h.id, nombre: h.nombre, role: h.role as LegacyRole, access: toAccess(h.access_role, h.role) }))
  const book = pickBook(raw, input.wantedBookId)
  if (!households.length || !book) throw new NoHouseholdError()
  const household = households.find((h) => h.id === book.household_id)
  if (!household) throw new NoHouseholdError()
  const rawHousehold = raw.households.find((h) => h.id === household.id)
  const planRow = rawHousehold?.plan !== undefined ? rawHousehold.plan : input.planRow

  return {
    user: { id: input.uid, email: profile?.email ?? String(input.claimsEmail ?? ""), nombre: profile?.nombre || "Tú", avatar: profile?.avatar_url ?? null, apodo: profile?.apodo ?? "", nacimiento: profile?.nacimiento ?? null },
    household,
    households,
    book: { id: book.id, nombre: book.nombre, tipo: book.tipo, icon: book.icon },
    books: books.map((b) => ({ id: b.id, nombre: b.nombre, tipo: b.tipo, icon: b.icon, household_id: b.household_id })),
    isAdmin: raw.admin,
    plan: toPlanInfo(planRow),
  }
}

/** El libro exacto si la persona lo ve (la RLS de mirai_app_context ya filtró), o null. */
export const findBook = (raw: RawAppContext, bookId: string) => raw.books.find((b) => b.id === bookId) ?? null

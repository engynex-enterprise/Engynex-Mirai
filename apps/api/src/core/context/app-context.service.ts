// Contexto de la persona con caché de 30 s por persona (§2.2: BookGuard "con una caché de 30 s por (usuario, libro)").
// Se cachea lo que devuelve la base (RawAppContext) por usuario; el libro se elige en cada petición.
import { Injectable } from "@nestjs/common"
import { buildAppContext, findBook, NoHouseholdError, type AppContext, type RawAppContext } from "@mirai/domain/app-context"
import { toAccess } from "@mirai/domain/household/roles"
import { toPlanInfo } from "@mirai/domain/plans"
import type { AuthUser } from "../auth/token-verifier"
import { userScope } from "../db/scope"
import { DomainError } from "../errors/domain-error"
import { AppContextRepo } from "./app-context.repo"
import type { BookAccess } from "./request-context"

type Entry = { at: number; raw: Promise<RawAppContext> }

export const CONTEXT_TTL_MS = 30_000
const MAX_ENTRIES = 5_000

@Injectable()
export class AppContextService {
  private readonly cache = new Map<string, Entry>()

  constructor(private readonly repo: AppContextRepo) {}

  /** Lo que la base sabe de la persona (cacheado 30 s; las peticiones simultáneas comparten el mismo viaje). */
  raw(user: AuthUser, now = Date.now()): Promise<RawAppContext> {
    const hit = this.cache.get(user.id)
    if (hit && now - hit.at < CONTEXT_TTL_MS) return hit.raw
    const raw = this.repo.load(userScope(user))
    this.cache.set(user.id, { at: now, raw })
    raw.catch(() => this.cache.delete(user.id))
    if (this.cache.size > MAX_ENTRIES) for (const [k, v] of this.cache) if (now - v.at >= CONTEXT_TTL_MS) this.cache.delete(k)
    return raw
  }

  /** Olvida la caché de la persona (después de crear un hogar, cambiar de rol…). */
  invalidate(userId: string) {
    this.cache.delete(userId)
  }

  /** GET /v1/me: mismo resultado que getAppContext (apps/web/lib/dal.ts). */
  async me(user: AuthUser, wantedBookId?: string | null): Promise<AppContext> {
    const raw = await this.raw(user)
    try {
      const pre = buildAppContext(raw, { uid: user.id, claimsEmail: user.email, wantedBookId })
      const h = raw.households.find((x) => x.id === pre.household.id)
      if (h && h.plan === undefined) return { ...pre, plan: toPlanInfo(await this.repo.planOf(userScope(user), h.id)) }
      return pre
    } catch (e) {
      if (e instanceof NoHouseholdError) throw DomainError.notFound(e.message, { redirect: "/bienvenida" })
      throw e
    }
  }

  /** BookGuard: el libro exacto, el rol fino de la persona en su hogar y el plan. null si no es miembro. */
  async bookAccess(user: AuthUser, bookId: string): Promise<BookAccess | null> {
    const raw = await this.raw(user)
    const book = findBook(raw, bookId)
    if (!book) return null
    const h = raw.households.find((x) => x.id === book.household_id)
    if (!h) return null
    const plan = toPlanInfo(h.plan !== undefined ? h.plan : await this.repo.planOf(userScope(user), h.id))
    const access = toAccess(h.access_role, h.role)
    return {
      book: { id: book.id, nombre: book.nombre, tipo: book.tipo, icon: book.icon, household_id: book.household_id },
      household: { id: h.id, nombre: h.nombre, role: h.role as BookAccess["household"]["role"], access },
      access,
      plan,
    }
  }
}

// Casos de uso de los libros (V7-G, E1 y E18). Todo con la sesión de la persona (UserScope): la RLS de `books` y
// `book_settings` vuelve a revisar lo que aquí se revisa con el rol (crear: "editor" del hogar; editar: "editor";
// borrar: "owner"). No conoce Supabase: usa RowStore.
import { Injectable } from "@nestjs/common"
import type { Book, BookPatch, BookSettings, BookSettingsPatch } from "@mirai/contracts/modules/books"
import { atLeast } from "@mirai/domain/household/roles"
import { limitOf, type PlanInfo } from "@mirai/domain/plans"
import { AppContextService } from "../../core/context/app-context.service"
import { roleMsg } from "../../core/context/book.guard"
import { RequestContextService } from "../../core/context/request-context.service"
import { DomainError } from "../../core/errors/domain-error"
import { EventsService } from "../../core/events/events.service"
import { RowStore } from "../../core/store/row-store"
import { HouseholdAccess } from "../households/household-access"

const BOOK_COLS = ["id", "household_id", "nombre", "tipo", "icon", "is_default", "sample", "deleted_at"] as const

/** Mismo texto de createBook (apps/web/components/app/actions.ts). */
export const bookLimitMsg = (max: number) => `Tu plan incluye ${max} libro(s) de cuentas. Cambia de plan para llevar también tu negocio o tus arriendos.`

@Injectable()
export class BooksService {
  constructor(
    private readonly rows: RowStore,
    private readonly ctx: RequestContextService,
    private readonly access: HouseholdAccess,
    private readonly contexts: AppContextService,
    private readonly events: EventsService,
  ) {}

  private get scope() {
    return this.ctx.db
  }

  /** Libros vivos del hogar (para el límite del plan). */
  private async alive(householdId: string): Promise<Book[]> {
    return this.rows.select<Book>(this.scope, "books", { columns: BOOK_COLS, eq: { household_id: householdId, deleted_at: null } })
  }

  private async checkLimit(householdId: string, plan: PlanInfo) {
    const max = limitOf(plan, "libros")
    if (max !== undefined && (await this.alive(householdId)).length >= max) throw DomainError.plan(bookLimitMsg(max))
  }

  async create(b: { householdId: string; nombre: string; tipo: string; icon: string }): Promise<{ bookId: string }> {
    const h = await this.access.atLeast(b.householdId, "editor")
    await this.checkLimit(h.household.id, h.plan)
    let bookId: unknown
    try {
      bookId = await this.rows.rpc(this.scope, "create_book", { p_household: h.household.id, p_nombre: b.nombre, p_tipo: b.tipo, p_icon: b.icon })
    } catch (e) {
      // Igual que la web: los textos de permiso de la base se muestran; lo demás, un mensaje genérico.
      if (e instanceof DomainError && (e.code === "ROLE_DENIED" || e.code === "PLAN_REQUIRED" || /permiso|plan/i.test(e.msg))) throw e
      throw new DomainError("INTERNAL", "No pudimos crear el libro. Intenta de nuevo.", undefined, { cause: e })
    }
    if (typeof bookId !== "string") throw DomainError.internal(new Error("create_book no devolvió el id"))
    await this.rows.update(this.scope, "profiles", { eq: { id: this.ctx.user.id } }, { last_book_id: bookId })
    this.access.invalidate()
    return { bookId }
  }

  async update(patch: BookPatch): Promise<Book> {
    const id = this.ctx.book.book.id
    const [row] = await this.rows.update<Book>(this.scope, "books", { eq: { id, deleted_at: null } }, patch)
    if (!row) throw DomainError.notFound("No encontramos ese libro.")
    this.contexts.invalidate(this.ctx.user.id)
    return pick(row)
  }

  async remove(confirm: string): Promise<{ msg: string }> {
    const { book, household } = this.ctx.book
    if (confirm.trim().toLowerCase() !== book.nombre.trim().toLowerCase()) throw DomainError.validation("Escribe el nombre del libro exactamente para confirmar")
    const all = await this.alive(household.id)
    const me = all.find((x) => x.id === book.id)
    if (me?.is_default) throw DomainError.conflict("Este es el libro principal del hogar: no se puede borrar.")
    if (all.length <= 1) throw DomainError.conflict("Es el único libro del hogar: crea otro antes de borrar este.")
    const [row] = await this.rows.update(this.scope, "books", { eq: { id: book.id, deleted_at: null } }, { deleted_at: new Date().toISOString() })
    if (!row) throw DomainError.notFound("No encontramos ese libro.")
    // Si era el último libro de la persona, que el próximo /v1/me elija otro.
    await this.rows.update(this.scope, "profiles", { eq: { id: this.ctx.user.id, last_book_id: book.id } }, { last_book_id: null })
    this.contexts.invalidate(this.ctx.user.id)
    return { msg: `Enviamos «${book.nombre}» a la papelera.` }
  }

  async restore(id: string): Promise<Book> {
    // La RLS deja leer los libros (también los borrados) de los hogares donde la persona es miembro.
    const book = await this.rows.first<Book>(this.scope, "books", { columns: BOOK_COLS, eq: { id } })
    if (!book) throw DomainError.notFound("No encontramos ese libro.")
    const h = await this.access.of(book.household_id)
    if (!atLeast(h.access, "owner")) throw DomainError.role(roleMsg("owner"))
    if (!book.deleted_at) return pick(book)
    await this.checkLimit(h.household.id, h.plan)
    const [row] = await this.rows.update<Book>(this.scope, "books", { eq: { id } }, { deleted_at: null })
    this.contexts.invalidate(this.ctx.user.id)
    return pick(row ?? { ...book, deleted_at: null })
  }

  async settings(): Promise<BookSettings> {
    const s = await this.rows.first<BookSettings>(this.scope, "book_settings", { eq: { book_id: this.ctx.book.book.id } })
    if (!s) throw DomainError.notFound("No encontramos los ajustes de este libro.")
    return s
  }

  async updateSettings(patch: BookSettingsPatch): Promise<BookSettings> {
    const bookId = this.ctx.book.book.id
    const [s] = await this.rows.update<BookSettings>(this.scope, "book_settings", { eq: { book_id: bookId } }, patch)
    if (!s) throw DomainError.notFound("No encontramos los ajustes de este libro.")
    this.events.changed(bookId, ["book_settings"], bookId)
    return s
  }
}

const pick = (b: Book): Book => ({ id: b.id, household_id: b.household_id, nombre: b.nombre, tipo: b.tipo, icon: b.icon, is_default: !!b.is_default, sample: !!b.sample, deleted_at: b.deleted_at ?? null })

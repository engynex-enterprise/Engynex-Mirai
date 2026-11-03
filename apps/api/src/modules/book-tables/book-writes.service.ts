// Escrituras del CRUD genérico del libro (§2.5, F2-D-1) y las revisiones que comparten todos los módulos de escritura:
// rol del hogar (BOOK_TABLE_POLICY.write), regla "Registra sus gastos" (own + canEditRow), plan (feature), validación
// zod por tabla (BOOK_TABLE_SCHEMAS), referencias del mismo libro y aviso de cambios (EventsService → tiempo real y
// outbox de automatizaciones). La RLS de la base vuelve a revisar todo con el JWT de la persona.
//
// Equivalencias con apps/web/hooks/use-book-data.ts:
//   PUT    /t/:table/:id          → useSave (id del navegador: crear o editar; repetir da lo mismo)
//   DELETE /t/:table/:id          → useSoftDelete (deleted_at = ahora)
//   POST   /t/:table/:id/restore  → "Deshacer" del toast (deleted_at = null)
import { Injectable } from "@nestjs/common"
import { BOOK_TABLE_POLICY, isGenericTable, type BookTablePolicy, type PolicyTable } from "@mirai/contracts/book-tables"
import { isBookColumn } from "@mirai/contracts/book-table-columns"
import { isWritableTable, refTable, writeSchema, type WritableTable } from "@mirai/contracts/book-table-schemas"
import type { BookRow } from "@mirai/contracts/modules/book-tables"
import { atLeast, canEditRow, deniedMsg, type AccessRole, type Perm } from "@mirai/domain/household/roles"
import { can as planCan, type PremiumFeature } from "@mirai/domain/plans"
import { planMsg, roleMsg } from "../../core/context/book.guard"
import { RequestContextService } from "../../core/context/request-context.service"
import type { UserScope } from "../../core/db/scope"
import { DomainError } from "../../core/errors/domain-error"
import { issuesToDetails } from "../../core/errors/all-exceptions.filter"
import { EventsService } from "../../core/events/events.service"
import type { LiveChange } from "@mirai/contracts/live"
import { aliveIds, BookStore, type Rec } from "./book-store"
import { touched } from "./cascades"
import { TABLE_NOT_FOUND } from "./book-tables.service"

export const ROW_NOT_FOUND = "No encontramos ese registro."
export const ROW_IN_TRASH = "Este registro está en la papelera. Recupéralo primero con «Deshacer»."
export const OWN_ONLY = "Tu rol solo te deja cambiar lo que registraste tú."
export const REF_OTHER_BOOK = "Algún dato apunta a un registro que no es de este libro o que ya borraste."

@Injectable()
export class BookWritesService {
  constructor(
    private readonly store: BookStore,
    private readonly ctx: RequestContextService,
    private readonly events: EventsService,
  ) {}

  // ── Contexto y revisiones compartidas ───────────────────────────────────────────────────────────────────────
  get bookId(): string {
    return this.ctx.book.book.id
  }
  get scope(): UserScope {
    return this.ctx.db
  }
  get userId(): string {
    return this.ctx.user.id
  }
  get access(): AccessRole {
    return this.ctx.book.access
  }

  /** Rol mínimo (mismo texto que BookGuard) o un permiso de la matriz ("Tu rol no permite…"). */
  requireRole(min: AccessRole, perm?: Perm) {
    if (atLeast(this.access, min)) return
    throw DomainError.role(perm ? deniedMsg(perm) : roleMsg(min))
  }

  /** ¿El plan del hogar incluye la función? (sin lanzar: p. ej. la IA es opcional al registrar un gasto). */
  hasFeature(f: PremiumFeature): boolean {
    return planCan(this.ctx.book.plan, f)
  }

  /** Función Premium del plan del hogar (402 con el mensaje de siempre). */
  requireFeature(f: PremiumFeature | null | undefined) {
    if (f && !planCan(this.ctx.book.plan, f)) throw DomainError.plan(planMsg(f))
  }

  /** "Registra sus gastos" solo cambia las filas que creó (canEditRow); los demás roles, todas. */
  requireOwnRow(row: { created_by?: unknown }) {
    if (!canEditRow(this.access, { created_by: (row.created_by as string | null) ?? null }, this.userId)) throw DomainError.role(OWN_ONLY)
  }

  /** La fila existe en ESTE libro (si es de otro, la tratamos como inexistente: nunca se cruza de libro). */
  async rowOf(table: string, id: string, o: { alive?: boolean; msg?: string } = {}): Promise<BookRow> {
    const row = await this.store.find(this.scope, table, id)
    if (!row || row.book_id !== this.bookId) throw DomainError.notFound(o.msg ?? ROW_NOT_FOUND)
    if (o.alive && row.deleted_at) throw DomainError.notFound(o.msg ?? ROW_NOT_FOUND)
    return row
  }

  /** Las referencias que llegan (`category_id`, `card_id`…) son filas vivas de este libro. */
  async assertRefs(table: string, data: Rec) {
    const want = new Map<string, string[]>()
    for (const [col, v] of Object.entries(data)) {
      if (typeof v !== "string" || !v) continue
      const t = isWritableTable(table) ? refTable(table, col) : undefined
      if (!t) continue
      want.set(t, [...(want.get(t) ?? []), v])
    }
    for (const [t, ids] of want) {
      const ok = await aliveIds(this.store, this.scope, t, this.bookId, ids)
      const bad = ids.find((x) => !ok.has(x))
      if (bad) throw DomainError.validation(REF_OTHER_BOOK, { fields: Object.fromEntries(Object.entries(data).filter(([, v]) => v === bad).map(([k]) => [k, REF_OTHER_BOOK])) })
    }
  }

  /** Avisa que cambió `table` (y lo que arrastran sus triggers) después de escribir. Nunca lanza. */
  changed(table: string, id: string | undefined, op: LiveChange["op"] = "UPDATE", extra: readonly string[] = []) {
    this.events.changed(this.bookId, touched(table, extra), id, op)
  }

  /** Valida `body` con el esquema de la tabla (VALIDATION con los campos en español). */
  parse(table: WritableTable, body: unknown, mode: "insert" | "update"): Rec {
    const r = writeSchema(table, mode).safeParse(body)
    if (!r.success) throw DomainError.validation("Revisa los datos del formulario.", issuesToDetails(r.error.issues as never))
    return r.data
  }

  // ── CRUD genérico ───────────────────────────────────────────────────────────────────────────────────────────
  /** PUT /v1/books/:bookId/t/:table/:id (useSave): crea con el id del navegador o edita lo que llega. */
  async upsert(table: string, id: string, body: unknown): Promise<BookRow> {
    const [t, pol] = this.writable(table)
    this.requireRole(pol.write as AccessRole, pol.own ? "registrarPropio" : "editarTodo")
    this.requireFeature(pol.feature)
    const prev = await this.store.find(this.scope, t, id)
    if (prev && prev.book_id !== this.bookId) throw DomainError.notFound(ROW_NOT_FOUND)
    if (prev?.deleted_at) throw DomainError.conflict(ROW_IN_TRASH)
    if (prev) this.requireOwnRow(prev)
    const data = this.parse(t, body, prev ? "update" : "insert")
    await this.assertRefs(t, data)
    let row: BookRow | null
    if (prev) row = await this.store.update(this.scope, t, this.bookId, id, data)
    else {
      const ins: Rec = { ...data, id, book_id: this.bookId }
      if (isBookColumn(t, "created_by")) ins.created_by = this.userId
      try {
        row = (await this.store.insert(this.scope, t, [ins]))[0] ?? null
      } catch (e) {
        // Dos guardados del mismo registro a la vez (doble clic, reintento): el segundo edita lo que creó el primero.
        if (!(e instanceof DomainError && e.code === "CONFLICT")) throw e
        const again = await this.store.find(this.scope, t, id)
        if (!again || again.book_id !== this.bookId) throw e
        row = await this.store.update(this.scope, t, this.bookId, id, data)
      }
    }
    if (!row) throw DomainError.role(pol.own ? OWN_ONLY : deniedMsg("editarTodo"))
    this.changed(t, id, prev ? "UPDATE" : "INSERT")
    return row
  }

  /** DELETE /v1/books/:bookId/t/:table/:id (useSoftDelete). Repetirlo no cambia nada. Borrar no exige el plan. */
  async remove(table: string, id: string): Promise<{ id: string; deleted_at: string }> {
    const [t, pol] = this.writable(table)
    this.requireRole(pol.write as AccessRole, pol.own ? "registrarPropio" : "editarTodo")
    const prev = await this.rowOf(t, id)
    this.requireOwnRow(prev)
    if (prev.deleted_at) return { id, deleted_at: String(prev.deleted_at) }
    const row = await this.store.update(this.scope, t, this.bookId, id, { deleted_at: new Date().toISOString() })
    if (!row) throw DomainError.role(pol.own ? OWN_ONLY : deniedMsg("editarTodo"))
    this.changed(t, id, "UPDATE")
    return { id, deleted_at: String(row.deleted_at) }
  }

  /** POST /v1/books/:bookId/t/:table/:id/restore ("Deshacer"): vuelve a la fila viva. Exige el plan (RLS restrictiva). */
  async restore(table: string, id: string): Promise<BookRow> {
    const [t, pol] = this.writable(table)
    this.requireRole(pol.write as AccessRole, pol.own ? "registrarPropio" : "editarTodo")
    this.requireFeature(pol.feature)
    const prev = await this.rowOf(t, id)
    this.requireOwnRow(prev)
    if (!prev.deleted_at) return prev
    const row = await this.store.update(this.scope, t, this.bookId, id, { deleted_at: null })
    if (!row) throw DomainError.role(pol.own ? OWN_ONLY : deniedMsg("editarTodo"))
    this.changed(t, id, "UPDATE")
    return row
  }

  /** Tabla del CRUD genérico que se puede escribir (si no, 404 como en la lectura). */
  private writable(table: string): [WritableTable, BookTablePolicy] {
    if (!isGenericTable(table) || !isWritableTable(table)) throw DomainError.notFound(TABLE_NOT_FOUND)
    const pol = BOOK_TABLE_POLICY[table as PolicyTable]
    if (pol.write === "system") throw DomainError.notFound(TABLE_NOT_FOUND)
    return [table, pol]
  }
}

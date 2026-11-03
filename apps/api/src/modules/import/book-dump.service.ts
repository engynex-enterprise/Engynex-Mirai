// Copia completa del libro (F2-D-9) en el formato BookDump v5 de apps/web/features/data/backup.ts: ajustes y todas
// las tablas de BOOK_TABLES (padres antes que hijos) INCLUIDA la papelera, para poder recuperarla. Lee con el alcance
// que le pasen (UserScope: la RLS deja leer a los miembros del libro). Lo usan GET …/export.json, POST …/backups y
// GET /v1/account/export de F2-I (exportMyData: libros completos donde la persona es Dueño o Administra).
import { Injectable } from "@nestjs/common"
import { BOOK_TABLES } from "@mirai/contracts/book-tables"
import type { BookDump } from "@mirai/contracts/modules/import"
import type { DbScope } from "../../core/db/scope"
import { DomainError } from "../../core/errors/domain-error"
import { BookStore } from "../book-tables/book-store"

export type DumpBook = { id: string; household_id: string; nombre: string }

@Injectable()
export class BookDumpService {
  constructor(private readonly store: BookStore) {}

  async dump(scope: DbScope, book: DumpBook): Promise<BookDump> {
    const settings = await this.store.single(scope, "book_settings", book.id)
    if (!settings) throw DomainError.notFound("No encontramos los ajustes de este libro.")
    const data: BookDump["data"] = {}
    for (const t of BOOK_TABLES) data[t] = await this.store.rows(scope, t, book.id, { alive: false })
    return { app: "mirai", v: 5, book_id: book.id, household_id: book.household_id, nombre: book.nombre, fecha: new Date().toISOString(), settings, data }
  }

  /** Solo los movimientos que registró la persona (libros donde no es Dueño ni Administra: exportMyData). */
  async ownRows(scope: DbScope, book: DumpBook, userId: string) {
    const [expenses, incomes, extra_incomes] = await Promise.all(["expenses", "incomes", "extra_incomes"].map((t) => this.store.rows(scope, t, book.id, { alive: false, eq: { created_by: userId } })))
    return { book_id: book.id, nombre: book.nombre, solo_mis_registros: true as const, data: { expenses, incomes, extra_incomes } }
  }
}

// Puerto del CRUD genérico del libro (§2.5). F2-C: lectura (lista de una tabla y partes del libro). F2-D agrega aquí
// las escrituras (upsert, borrado lógico y restaurar). Todos los métodos reciben el alcance: con UserScope la RLS vuelve
// a filtrar aunque el servicio ya revisó tabla, columnas y rol.
import type { BookRow } from "@mirai/contracts/modules/book-tables"
import type { PolicyTable } from "@mirai/contracts/book-tables"
import type { BookPart, PartRows } from "@mirai/domain/book-data"
import type { DbScope } from "../../core/db/scope"

/** Consulta de lista ya validada contra BOOK_TABLE_COLUMNS (el adaptador nunca recibe nombres sin revisar). */
export type ListRows = {
  bookId: string
  table: PolicyTable
  /** Columnas pedidas o "*". */
  select: readonly string[] | "*"
  /** Filtros de igualdad (null = `is null`), en el orden en que llegaron. */
  eq: readonly (readonly [string, string | null])[]
  order?: { column: string; ascending: boolean }
}

export abstract class BookTablesRepo {
  /** Filas vivas (sin `deleted_at`) de la tabla en el libro (useList). */
  abstract list(scope: DbScope, q: ListRows): Promise<BookRow[]>
  /** Una parte del libro como loadBookPart: filas vivas con los hijos embebidos (book_settings/emergency_funds: 0 o 1 fila). */
  abstract part(scope: DbScope, bookId: string, part: BookPart): Promise<PartRows>
}

// Casos de uso de lectura del CRUD genérico (§2.5, F2-C-1). Revisa la tabla (BOOK_TABLE_POLICY.generic) y cada columna
// pedida contra BOOK_TABLE_COLUMNS antes de tocar la base; la RLS vuelve a filtrar con el JWT de la persona.
// Lo exporta el módulo: insights y gami cargan el libro completo con loadBook() (insights → book-tables, §2.6).
import { Injectable } from "@nestjs/common"
import { BOOK_TABLE_POLICY, isGenericTable, type PolicyTable } from "@mirai/contracts/book-tables"
import { isBookColumn } from "@mirai/contracts/book-table-columns"
import type { BookRow, ListQuery, Snapshot } from "@mirai/contracts/modules/book-tables"
import { assembleBook, BOOK_PART_NAMES, type BookPart, type BookParts, type LoadedBook } from "@mirai/domain/book-data"
import { RequestContextService } from "../../core/context/request-context.service"
import { DomainError } from "../../core/errors/domain-error"
import { BookTablesRepo, type ListRows } from "./book-tables.repository"

export const TABLE_NOT_FOUND = "No encontramos esa tabla."
export const NO_SETTINGS = "No encontramos los ajustes de este libro."

@Injectable()
export class BookTablesService {
  constructor(
    private readonly repo: BookTablesRepo,
    private readonly ctx: RequestContextService,
  ) {}

  /** GET /v1/books/:bookId/t/:table (useList). */
  list(table: string, query: ListQuery): Promise<BookRow[]> {
    if (!isGenericTable(table)) throw DomainError.notFound(TABLE_NOT_FOUND)
    return this.repo.list(this.ctx.db, parseList(this.ctx.book.book.id, table, query))
  }

  /** GET /v1/books/:bookId/snapshot (loadBookPart de cada parte pedida, en paralelo). */
  async snapshot(parts?: string): Promise<Snapshot> {
    const pedidas = parseParts(parts)
    const rows = await this.loadParts(pedidas)
    return { parts: Object.fromEntries(pedidas.map((p, i) => [p, rows[i]])) }
  }

  /** El libro completo armado para los cálculos (loadBookData): lo usan insights y gami. */
  async loadBook(today?: string): Promise<LoadedBook> {
    const rows = await this.loadParts(BOOK_PART_NAMES)
    return assembleBook(Object.fromEntries(BOOK_PART_NAMES.map((p, i) => [p, rows[i]])) as BookParts, today)
  }

  private async loadParts(parts: readonly BookPart[]) {
    const bookId = this.ctx.book.book.id
    const rows = await Promise.all(parts.map((p) => this.repo.part(this.ctx.db, bookId, p)))
    const i = parts.indexOf("book_settings")
    if (i >= 0 && !rows[i].length) throw DomainError.notFound(NO_SETTINGS)
    return rows
  }
}

const bad = (msg: string, campo: string) => DomainError.validation(msg, { fields: { [campo]: msg } })

/** Convierte la consulta del cliente en una ListRows con columnas de la lista blanca (exportada para las pruebas). */
export function parseList(bookId: string, table: PolicyTable, query: ListQuery): ListRows {
  const col = (c: string, campo: string) => {
    if (!isBookColumn(table, c)) throw bad(`La columna «${c}» no existe en ${table}.`, campo)
    return c
  }
  const { select, order, ...rest } = query
  const sel = !select || select === "*" ? ("*" as const) : select.split(",").map((s) => col(s.trim(), "select"))
  const eq: [string, string | null][] = []
  for (const [k, v] of Object.entries(rest)) {
    if (!k.startsWith("eq.")) throw bad(`Filtro desconocido: «${k}». Usa eq.<campo>=<valor>.`, k)
    if (typeof v !== "string") throw bad(`Usa un solo valor para «${k}».`, k)
    eq.push([col(k.slice(3), k), v === "null" ? null : v])
  }
  const [column, dir] = (order ?? "").split(".")
  return { bookId, table, select: sel, eq, ...(order ? { order: { column: col(column, "order"), ascending: dir !== "desc" } } : {}) }
}

/** Partes pedidas (sin repetir, en el orden de BOOK_PARTS). Sin `parts`: todas. */
export function parseParts(parts?: string): BookPart[] {
  if (!parts) return [...BOOK_PART_NAMES]
  const want = new Set(parts.split(",").map((s) => s.trim()).filter(Boolean))
  for (const p of want) if (!(BOOK_PART_NAMES as readonly string[]).includes(p)) throw bad(`La parte «${p}» no existe. Usa: ${BOOK_PART_NAMES.join(", ")}.`, "parts")
  return BOOK_PART_NAMES.filter((p) => want.has(p))
}

/** Política de la tabla (para que F2-D reutilice la misma revisión al escribir). */
export const policyOf = (t: PolicyTable) => BOOK_TABLE_POLICY[t]

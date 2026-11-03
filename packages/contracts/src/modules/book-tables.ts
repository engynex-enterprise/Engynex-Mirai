// Módulo `book-tables` (docs/arquitectura/v6-separacion-front-back.md §2.5). Dueño: F2-C (lectura) y F2-D (escritura).
// CRUD genérico del libro con BOOK_TABLE_POLICY. F2-C deja la LECTURA:
//   GET /v1/books/:bookId/t/:table   → useList(table, { eq, order, select }) de apps/web/hooks/use-book-data.ts
//   GET /v1/books/:bookId/snapshot   → loadBookPart / useBookData (las partes del libro; el cliente las arma con
//                                      assembleBook de @mirai/domain/book-data, igual que hoy)
// F2-D agrega la ESCRITURA (validación por tabla en ../book-table-schemas.ts):
//   PUT    /v1/books/:bookId/t/:table/:id          → useSave (crea con el id del navegador o edita; repetir = lo mismo)
//   DELETE /v1/books/:bookId/t/:table/:id          → useSoftDelete (borrado lógico)
//   POST   /v1/books/:bookId/t/:table/:id/restore  → "Deshacer"
// Sin `meta`: book-tables no es uno de los 31 módulos de §2.6 (modules/index.ts
// lo agrega aparte).
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { BOOK_PART_NAMES, type BookPart } from "@mirai/domain/book-data"
import { ApiError, ApiOk, COMMON_ERRORS, Uuid } from "../common"

/** Nombre de una columna o tabla (la lista blanca de verdad está en BOOK_TABLE_COLUMNS; esto solo filtra basura). */
const Ident = z.string().regex(/^[a-z_][a-z0-9_]{0,62}$/, "Nombre inválido")

export const TableParams = z.object({ bookId: Uuid, table: Ident })

/**
 * Filtros de la lista. Además de `select` y `order` acepta `eq.<campo>=<valor>` (uno por campo, como `eq` de useList);
 * `eq.<campo>=null` filtra los vacíos (`is null`). Campos y columnas: solo los de BOOK_TABLE_COLUMNS de la tabla.
 */
export const ListQuery = z.looseObject({
  /** Columnas separadas por coma (`id,nombre,valor`) o `*` (por defecto). Sin relaciones embebidas. */
  select: z.string().trim().max(2000).optional(),
  /** `campo` o `campo.asc` / `campo.desc` (como `order: { column, ascending }`). */
  order: z.string().trim().regex(/^[a-z_][a-z0-9_]{0,62}(\.(asc|desc))?$/, "Usa campo.asc o campo.desc").optional(),
})
export type ListQuery = z.infer<typeof ListQuery>

/** Fila de una tabla del libro (la forma exacta depende de la tabla: ver `Row<T>` de @mirai/db). */
export const BookRow = z.record(z.string(), z.unknown())
export type BookRow = z.infer<typeof BookRow>

export const BookParams = z.object({ bookId: Uuid })
export const SnapshotQuery = z.object({
  /** Partes separadas por coma (`expenses,loans`). Sin `parts`: todas (lo que pide useBookData). */
  parts: z.string().trim().max(400).optional(),
})
/** Filas vivas de cada parte pedida; las partes con hijos (`fixed_expenses`, `loans`, `credit_cards`) los traen embebidos. */
export const Snapshot = z.object({ parts: z.record(z.string(), z.array(BookRow)) })
export type Snapshot = { parts: Partial<Record<BookPart, BookRow[]>> }

/** Partes válidas del snapshot (BOOK_PARTS de @mirai/domain/book-data). */
export const SNAPSHOT_PARTS: readonly BookPart[] = BOOK_PART_NAMES

export const RowParams = z.object({ bookId: Uuid, table: Ident, id: Uuid })
/** Columnas a crear o cambiar (la forma exacta y los obligatorios dependen de la tabla: BOOK_TABLE_SCHEMAS). */
export const RowBody = z.record(z.string(), z.unknown())
export const Deleted = z.object({ id: z.string(), deleted_at: z.string() })

const WRITE_ERRORS = { ...COMMON_ERRORS, 402: ApiError, 409: ApiError } as const

const c = initContract()
export const bookTablesContract = c.router(
  {
    list: {
      method: "GET",
      path: "/v1/books/:bookId/t/:table",
      pathParams: TableParams,
      query: ListQuery,
      responses: { ...COMMON_ERRORS, 200: z.array(BookRow), 404: ApiError },
      summary: "Filas vivas (sin borrar) de una tabla del libro (antes useList)",
      description: "Solo tablas con `generic: true` en BOOK_TABLE_POLICY. 404 si la tabla no existe o no va por el CRUD genérico; 400 si una columna no es de la tabla.",
    },
    snapshot: {
      method: "GET",
      path: "/v1/books/:bookId/snapshot",
      pathParams: BookParams,
      query: SnapshotQuery,
      responses: { ...COMMON_ERRORS, 200: Snapshot },
      summary: "Partes del libro para los cálculos (antes loadBookPart/useBookData)",
      description: "Mismas consultas que loadBookPart: book_settings y emergency_funds traen una fila (o ninguna), el resto solo filas vivas.",
    },
    upsert: {
      method: "PUT",
      path: "/v1/books/:bookId/t/:table/:id",
      pathParams: RowParams,
      body: RowBody,
      responses: { ...WRITE_ERRORS, 200: BookRow },
      summary: "Crea (con el id del navegador) o edita una fila del libro (antes useSave)",
      description: "Rol: `write` de BOOK_TABLE_POLICY; «Registra sus gastos» solo sus filas de expenses/incomes/extra_incomes. Plan: `feature` (402). Cuerpo validado con BOOK_TABLE_SCHEMAS (crear: obligatorios; editar: cualquier subconjunto). Las referencias (`*_id`) deben ser de este libro. 409 si la fila está en la papelera.",
    },
    remove: {
      method: "DELETE",
      path: "/v1/books/:bookId/t/:table/:id",
      pathParams: RowParams,
      body: c.noBody(),
      responses: { ...WRITE_ERRORS, 200: ApiOk(Deleted) },
      summary: "Envía la fila a la papelera (borrado lógico, antes useSoftDelete). Repetirlo no cambia nada",
    },
    restore: {
      method: "POST",
      path: "/v1/books/:bookId/t/:table/:id/restore",
      pathParams: RowParams,
      body: c.noBody(),
      responses: { ...WRITE_ERRORS, 200: ApiOk(BookRow) },
      summary: "Saca la fila de la papelera (el «Deshacer» del aviso)",
    },
  },
  { strictStatusCodes: true },
)

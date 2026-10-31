import type { Database } from "./database.types"

export type Tables = Database["public"]["Tables"]
export type TableName = keyof Tables
export type Row<T extends TableName> = Tables[T]["Row"]
export type Insert<T extends TableName> = Tables[T]["Insert"]
export type Update<T extends TableName> = Tables[T]["Update"]

/** Tablas de datos de un libro con borrado lógico (deleted_at). */
export type BookTable = {
  [K in TableName]: Row<K> extends { book_id: string; deleted_at: string | null; id: string } ? K : never
}[TableName]

/** Clave de caché de TanStack Query para una tabla del libro. Realtime invalida por este prefijo. */
export const qk = (bookId: string, table: string, ...rest: unknown[]) => ["b", bookId, table, ...rest] as const

/** Consultas derivadas (que leen varias tablas) que se refrescan ante cualquier cambio del libro. */
export const DERIVED_KEYS = ["setup-progress", "search-index", "summary"] as const

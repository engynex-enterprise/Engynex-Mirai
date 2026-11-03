// Puerto de escritura del libro (F2-D). Lo usan el CRUD genérico (PUT/DELETE/restore de /t/:table) y los módulos con
// reglas propias (gastos, ingresos, fijos, tarjetas, préstamos, ahorro, patrimonio, presupuesto e importar).
//
// Por qué un puerto compartido y no uno por agregado (§2.1): las reglas viven en los servicios de cada módulo; lo que
// cambia entre ellos son tablas y RPC, no la forma de hablar con la base. Un solo puerto con dos adaptadores
// (supabase-js hoy, Kysely en Cloud SQL) evita 10 pares de adaptadores casi iguales y deja la paridad en un lugar.
// Todos los métodos reciben el alcance: con UserScope la RLS de la base vuelve a revisar todo lo que el servicio revisó.
// Tablas y columnas llegan ya validadas contra BOOK_TABLE_POLICY / BOOK_TABLE_SCHEMAS (nunca texto del cliente).
import type { BookRow } from "@mirai/contracts/modules/book-tables"
import type { Database } from "@mirai/db"
import type { DbScope } from "../../core/db/scope"
import { DomainError } from "../../core/errors/domain-error"

export type Rec = Record<string, unknown>

/** Funciones de la base que se pueden llamar (Database["public"]["Functions"]) y sus argumentos. */
export type RpcName = keyof Database["public"]["Functions"]
export type RpcArgs<F extends RpcName> = Database["public"]["Functions"][F]["Args"]

/** Filtro de una consulta de filas: igualdad (null = `is null`) e `in` sobre una columna. */
export type RowsQuery = {
  eq?: Record<string, string | number | boolean | null>
  in?: readonly [string, readonly string[]]
  /** Solo filas sin borrar (por defecto true). */
  alive?: boolean
  /** Columnas (`*` por defecto). */
  select?: readonly string[]
  order?: { column: string; ascending: boolean }
  limit?: number
}

/** Tablas 1:1 del libro (llave = book_id). */
export type SingleTable = "book_settings" | "emergency_funds"

export abstract class BookStore {
  /** La fila con ese id en la tabla (de cualquier libro que la RLS deje ver), o null. Incluye las borradas. */
  abstract find(scope: DbScope, table: string, id: string): Promise<BookRow | null>
  /** Filas del libro con el filtro (paginadas por dentro si son muchas). */
  abstract rows(scope: DbScope, table: string, bookId: string, q?: RowsQuery): Promise<BookRow[]>
  /** Inserta y devuelve las filas creadas (en el mismo orden). */
  abstract insert(scope: DbScope, table: string, rows: Rec[]): Promise<BookRow[]>
  /** Cambia la fila `id` del libro; null si no la encontró (o la RLS no la deja cambiar). */
  abstract update(scope: DbScope, table: string, bookId: string, id: string, patch: Rec): Promise<BookRow | null>
  /** Fila 1:1 del libro (ajustes, fondo de emergencia), o null. */
  abstract single(scope: DbScope, table: SingleTable, bookId: string): Promise<BookRow | null>
  /** Crea o cambia la fila 1:1 del libro. */
  abstract upsertSingle(scope: DbScope, table: SingleTable, bookId: string, patch: Rec): Promise<BookRow>
  /** Llama una función transaccional de la base (las mismas RPC que hoy llama el navegador). */
  abstract rpc<F extends RpcName>(scope: DbScope, fn: F, args: RpcArgs<F>): Promise<unknown>
}

/**
 * Error de la base → DomainError, con los textos de las funciones (`raise exception '…'`, ya en español) en el código
 * que les corresponde: "Sin permiso" → ROLE_DENIED; "… no encontrado/a" → NOT_FOUND; "ya está pagado / enlazado" → CONFLICT.
 */
export function storeError(e: unknown): DomainError {
  const d = DomainError.fromPg(e)
  if (d.code !== "VALIDATION" || (e as { code?: string })?.code !== "P0001") return d
  const m = d.msg
  if (/^sin permiso$/i.test(m) || /^no tienes permiso/i.test(m)) return new DomainError("ROLE_DENIED", "Tu rol no permite hacer esto en este hogar.", undefined, { cause: e })
  if (/no encontrad[oa]$/i.test(m)) return new DomainError("NOT_FOUND", `${m}.`, undefined, { cause: e })
  if (/ya está pagado|ya está enlazado|ya es el pago/i.test(m)) return new DomainError("CONFLICT", m, undefined, { cause: e })
  return d
}

/** Ids de `ids` que existen vivos en `table` del libro (para revisar referencias). */
export async function aliveIds(store: BookStore, scope: DbScope, table: string, bookId: string, ids: readonly string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const rows = await store.rows(scope, table, bookId, { in: ["id", [...new Set(ids)]], select: ["id"] })
  return new Set(rows.map((r) => String(r.id)))
}

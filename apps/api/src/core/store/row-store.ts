// Puerto RowStore (V7-G): lectura y escritura de las tablas que NO son del libro (perfil, preferencias, consentimientos,
// reglas de aviso, logros, opiniones, anuncios, planes, cupones, integraciones globales, automatizaciones, accesos del
// contador, respaldos…). Es el mismo razonamiento de BookStore (modules/book-tables/book-store.ts): las reglas viven en
// los servicios y lo que cambia entre módulos son tablas y columnas, no la forma de hablar con la base. Un puerto con
// dos adaptadores (supabase-js / PostgREST hoy, Kysely en Postgres propio) en vez de un par de adaptadores por módulo.
//
// Reglas:
// - Tablas y columnas las elige SIEMPRE el servicio (constantes del código), nunca texto del cliente.
// - Todo método recibe el alcance: con UserScope la RLS de la base vuelve a revisar; SystemScope solo con `reason`.
// - `update` y `delete` exigen un filtro (nunca tocan toda la tabla).
import type { Database } from "@mirai/db"
import type { TableName } from "@mirai/db/tables"
import type { DbScope } from "../db/scope"
import { DomainError } from "../errors/domain-error"

export type Rec = Record<string, unknown>
export type Scalar = string | number | boolean

/** Filtro: todas las condiciones se cumplen a la vez (AND). `eq` con null = `is null`. */
export type Where = {
  eq?: Record<string, Scalar | null>
  neq?: Record<string, Scalar>
  in?: Record<string, readonly Scalar[]>
  notNull?: readonly string[]
  gte?: Record<string, Scalar>
  lte?: Record<string, Scalar>
  gt?: Record<string, Scalar>
  lt?: Record<string, Scalar>
  /** Contiene el texto sin importar mayúsculas (`%` y `_` del valor se escapan). */
  ilike?: Record<string, string>
}

export type Query = Where & {
  columns?: readonly string[]
  order?: readonly { column: string; ascending?: boolean }[]
  limit?: number
  offset?: number
}

export type RpcName = keyof Database["public"]["Functions"]
/** Tablas y vistas (las vistas solo se leen: select y count). */
export type Relation = TableName | keyof Database["public"]["Views"]
export type Upsert = { onConflict: readonly string[]; ignoreDuplicates?: boolean }

export abstract class RowStore {
  /** Filas que cumplen el filtro (paginadas por dentro si no hay `limit`). */
  abstract select<T = Rec>(scope: DbScope, table: Relation, q?: Query): Promise<T[]>
  /** Cuántas filas cumplen el filtro. */
  abstract count(scope: DbScope, table: Relation, w?: Where): Promise<number>
  /** Inserta y devuelve las filas creadas. */
  abstract insert<T = Rec>(scope: DbScope, table: TableName, rows: Rec[]): Promise<T[]>
  /** Inserta o actualiza por la llave `onConflict` (con `ignoreDuplicates`: no toca la que ya existe). */
  abstract upsert<T = Rec>(scope: DbScope, table: TableName, rows: Rec[], o: Upsert): Promise<T[]>
  /** Cambia las filas del filtro y las devuelve. */
  abstract update<T = Rec>(scope: DbScope, table: TableName, w: Where, patch: Rec): Promise<T[]>
  /** Borra (de verdad) las filas del filtro. Devuelve cuántas borró. */
  abstract delete(scope: DbScope, table: TableName, w: Where): Promise<number>
  /** Llama una función de la base (mismas RPC que hoy usa la web). */
  abstract rpc(scope: DbScope, fn: RpcName, args?: Rec): Promise<unknown>

  /** La primera fila del filtro, o null. */
  async first<T = Rec>(scope: DbScope, table: Relation, q: Query = {}): Promise<T | null> {
    return (await this.select<T>(scope, table, { ...q, limit: 1 }))[0] ?? null
  }
}

/** ¿El filtro tiene al menos una condición? (update/delete nunca van sin filtro). */
export function hasWhere(w: Where): boolean {
  return Object.values(w).some((v) => (Array.isArray(v) ? v.length > 0 : v && typeof v === "object" && Object.keys(v).length > 0))
}

export function requireWhere(op: string, table: string, w: Where) {
  if (!hasWhere(w)) throw DomainError.internal(new Error(`RowStore.${op}(${table}) sin filtro`))
}

/** `%` y `_` del texto del usuario se buscan tal cual. */
export const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

/**
 * Error de la base → DomainError, igual que storeError de BookStore: los textos de las funciones (`raise exception`,
 * ya en español) conservan su código: «Sin permiso» → ROLE_DENIED; «… no encontrado/a» → NOT_FOUND.
 */
export function rowStoreError(e: unknown): DomainError {
  const d = DomainError.fromPg(e)
  if (d.code !== "VALIDATION" || (e as { code?: string })?.code !== "P0001") return d
  const m = d.msg
  if (/^sin permiso/i.test(m) || /^no tienes permiso/i.test(m)) return new DomainError("ROLE_DENIED", "Tu rol no permite hacer esto en este hogar.", undefined, { cause: e })
  if (/no encontrad[oa]\.?$/i.test(m)) return new DomainError("NOT_FOUND", m.endsWith(".") ? m : `${m}.`, undefined, { cause: e })
  return d
}

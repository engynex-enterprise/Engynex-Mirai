// CRUD genérico del libro y snapshot por la API: lo que usan useList / useSave / useSoftDelete
// (hooks/use-book-data.ts) y useBookData (features/book/use-book-data.ts). El error llega al toast con el mensaje en
// español de la API.
import type { BookPart, PartRows } from "@mirai/domain/book-data"

/** Columnas que la API pone sola (el esquema de escritura las rechaza: z.strictObject). */
export const SYSTEM_COLUMNS = ["id", "book_id", "created_by", "created_at", "updated_at", "deleted_at"] as const

export type ListArgs = {
  order?: { column: string; ascending?: boolean }
  eq?: Record<string, string | number | boolean | null | undefined>
  select?: string
}

/** Query de `GET /t/:table` con la misma semántica de useList: `eq.campo=valor|null`, `order=campo.asc|desc`, `select`. */
export function listQuery(o: ListArgs): Record<string, string> {
  const q: Record<string, string> = {}
  if (o.select && o.select !== "*") q.select = o.select.replace(/\s+/g, "")
  if (o.order) q.order = `${o.order.column}.${o.order.ascending === false ? "desc" : "asc"}`
  for (const [k, v] of Object.entries(o.eq ?? {})) {
    if (v === undefined) continue
    q[`eq.${k}`] = v === null ? "null" : String(v)
  }
  return q
}

/** Cuerpo del PUT: sin las columnas del sistema (el id va en la ruta y el libro sale de la ruta). */
export function writeBody(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(values)) if (!(SYSTEM_COLUMNS as readonly string[]).includes(k) && v !== undefined) out[k] = v
  return out
}


const client = () => import("./client")

export async function apiList(bookId: string, table: string, o: ListArgs, signal?: AbortSignal): Promise<unknown[]> {
  const { browserApi, unwrap } = await client()
  return unwrap(await browserApi().bookTables.list({ params: { bookId, table }, query: listQuery(o), fetchOptions: { signal } }))
}

export async function apiUpsert(bookId: string, table: string, id: string, values: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { browserApi, unwrap } = await client()
  return unwrap(await browserApi().bookTables.upsert({ params: { bookId, table, id }, body: writeBody(values) }))
}

/** Borrado lógico (`deleted_at` = fecha) o "Deshacer" (`null`). */
export async function apiSetDeleted(bookId: string, table: string, id: string, deletedAt: string | null): Promise<void> {
  const { browserApi, unwrapData } = await client()
  const api = browserApi()
  if (deletedAt) unwrapData(await api.bookTables.remove({ params: { bookId, table, id } }))
  else unwrapData(await api.bookTables.restore({ params: { bookId, table, id } }))
}

// ── Snapshot ────────────────────────────────────────────────────────────────────────────────────────────────────
// useBookData pide 16 partes (una consulta de TanStack por parte, para invalidar solo la que cambió). Por la API se
// juntan las que se piden en el mismo momento en UNA petición `snapshot?parts=a,b,c` y cada parte recibe lo suyo.

type Waiter = { resolve: (rows: PartRows) => void; reject: (e: unknown) => void }
const batches = new Map<string, Map<BookPart, Waiter[]>>()

async function flushSnapshot(bookId: string) {
  const batch = batches.get(bookId)
  batches.delete(bookId)
  if (!batch) return
  const parts = [...batch.keys()]
  try {
    const { browserApi, unwrap } = await client()
    const res = unwrap(await browserApi().bookTables.snapshot({ params: { bookId }, query: { parts: parts.join(",") } }))
    for (const p of parts) {
      const rows = (res.parts[p] ?? []) as PartRows
      for (const w of batch.get(p)!) {
        if (p === "book_settings" && !rows.length) w.reject(new Error("No encontramos los ajustes de este libro"))
        else w.resolve(rows)
      }
    }
  } catch (e) {
    for (const ws of batch.values()) for (const w of ws) w.reject(e)
  }
}

/** Una parte del libro por la API (misma forma que loadBookPart). */
export function apiSnapshotPart(bookId: string, part: BookPart): Promise<PartRows> {
  return new Promise<PartRows>((resolve, reject) => {
    let batch = batches.get(bookId)
    if (!batch) {
      batch = new Map()
      batches.set(bookId, batch)
      setTimeout(() => void flushSnapshot(bookId), 0)
    }
    if (!batch.has(part)) batch.set(part, [])
    batch.get(part)!.push({ resolve, reject })
  })
}

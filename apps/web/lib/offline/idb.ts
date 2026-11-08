// Base local de Mirai en el dispositivo (IndexedDB "mirai-offline"), para usar la app sin conexión:
//   · kv:     lo último que se vio (consultas de TanStack por persona), páginas a preparar y marcas de tiempo.
//   · outbox: cambios hechos sin conexión que esperan para enviarse (los manda la app o el service worker).
// public/sw.js abre la MISMA base (nombre, versión y almacenes): si cambias algo aquí, cámbialo allá también.
// Se borra completa al cerrar sesión (lib/offline/clear.ts).

export const DB_NAME = "mirai-offline"
export const DB_VERSION = 1

/** Un cambio pendiente: la petición HTTP tal cual se enviará a la API (PUT/DELETE/POST del CRUD del libro). */
export type OutboxEntry = {
  seq?: number
  at: number
  userId: string
  bookId: string
  table: string
  id: string
  method: "PUT" | "DELETE" | "POST"
  url: string
  body: string | null
  /** La API aplica una sola vez cada clave (si llega dos veces responde lo mismo). */
  key: string
  /** Texto corto para mostrar ("Gasto: Mercado"). */
  label?: string
}

let dbp: Promise<IDBDatabase> | null = null

export const idbAvailable = () => typeof indexedDB !== "undefined"

export function openDb(): Promise<IDBDatabase> {
  if (!idbAvailable()) return Promise.reject(new Error("Sin IndexedDB"))
  dbp ??= new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB_NAME, DB_VERSION)
    r.onupgradeneeded = () => {
      const db = r.result
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv")
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "seq", autoIncrement: true })
    }
    r.onsuccess = () => {
      const db = r.result
      // Otra pestaña borra la base (cerrar sesión): se cierra esta conexión para no bloquearla.
      db.onversionchange = () => { db.close(); dbp = null }
      resolve(db)
    }
    r.onerror = () => { dbp = null; reject(r.error) }
    r.onblocked = () => { dbp = null; reject(new Error("Base local bloqueada")) }
  })
  return dbp
}

function req<T>(store: "kv" | "outbox", mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const r = fn(tx.objectStore(store))
    tx.oncomplete = () => resolve(r.result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  }))
}

export const kvGet = <T>(k: string) => req<T | undefined>("kv", "readonly", (s) => s.get(k) as IDBRequest<T | undefined>).catch(() => undefined)
export const kvSet = (k: string, v: unknown) => req("kv", "readwrite", (s) => s.put(v, k)).then(() => undefined).catch(() => undefined)
export const kvDel = (k: string) => req("kv", "readwrite", (s) => s.delete(k)).then(() => undefined).catch(() => undefined)

export const outboxAdd = (e: OutboxEntry) => req<IDBValidKey>("outbox", "readwrite", (s) => s.add(e)).then(() => undefined)
export const outboxAll = () => req<OutboxEntry[]>("outbox", "readonly", (s) => s.getAll() as IDBRequest<OutboxEntry[]>).catch(() => [] as OutboxEntry[])
export const outboxDelete = (seq: number) => req("outbox", "readwrite", (s) => s.delete(seq)).then(() => undefined).catch(() => undefined)
export const outboxCount = () => req<number>("outbox", "readonly", (s) => s.count()).catch(() => 0)

/** Borra toda la base local (cerrar sesión o "Borrar datos de este dispositivo"). */
export async function deleteDb(): Promise<void> {
  if (!idbAvailable()) return
  try { (await dbp)?.close() } catch { /* ya cerrada */ }
  dbp = null
  await new Promise<void>((resolve) => {
    const r = indexedDB.deleteDatabase(DB_NAME)
    r.onsuccess = r.onerror = r.onblocked = () => resolve()
  })
}

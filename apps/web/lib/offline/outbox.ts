// Cambios hechos sin conexión (crear, editar, borrar y deshacer en el CRUD del libro): se guardan en la base local y se
// envían en orden cuando vuelve el internet. Los envía la app (al volver la conexión, al abrir o al volver a la pestaña)
// o el service worker (Background Sync, aunque Mirai esté cerrado). Las dos partes usan el mismo candado
// ("mirai-outbox") y la API aplica una sola vez cada Idempotency-Key, así que nada se guarda dos veces.
import { create } from "zustand"
import { ApiError } from "@/lib/api/errors"
import { writeBody } from "@/lib/api/book-tables"
import { outboxAdd, outboxAll, outboxCount, outboxDelete, type OutboxEntry } from "./idb"

export const OUTBOX_LOCK = "mirai-outbox"
export const OUTBOX_SYNC_TAG = "mirai-outbox"

/** Estado visible: conexión y cambios por enviar (barra "Sin conexión" y Ajustes › Mirai como app). */
export const useOffline = create<{ online: boolean; pending: number; syncing: boolean; set: (p: Partial<{ online: boolean; pending: number; syncing: boolean }>) => void }>((set) => ({
  online: true, pending: 0, syncing: false, set: (p) => set(p),
}))

export const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false

/** ¿El error es de red (no hubo respuesta del servidor)? Entonces el cambio se guarda para después. */
export const isNetworkError = (e: unknown) => (e instanceof ApiError && e.code === "NETWORK") || e instanceof TypeError

const rowUrl = (bookId: string, table: string, id: string) => `/v1/books/${encodeURIComponent(bookId)}/t/${encodeURIComponent(table)}/${encodeURIComponent(id)}`
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)

export async function refreshPending() {
  useOffline.getState().set({ pending: await outboxCount() })
}

async function add(e: Omit<OutboxEntry, "at" | "key">) {
  await outboxAdd({ ...e, at: Date.now(), key: newKey() })
  await refreshPending()
  // Android/Chrome: el service worker lo envía apenas haya internet, aunque Mirai esté cerrado.
  try {
    const reg = await navigator.serviceWorker?.ready
    await (reg as ServiceWorkerRegistration & { sync?: { register: (t: string) => Promise<void> } })?.sync?.register(OUTBOX_SYNC_TAG)
  } catch { /* sin Background Sync: lo envía la app al volver la conexión */ }
}

/** Guarda para después un crear/editar (PUT idempotente por id). */
export const queueUpsert = (userId: string, bookId: string, table: string, id: string, values: Record<string, unknown>, label?: string) =>
  add({ userId, bookId, table, id, method: "PUT", url: rowUrl(bookId, table, id), body: JSON.stringify(writeBody(values)), label })

/** Guarda para después un borrado (DELETE) o un "Deshacer" (POST …/restore). */
export const queueSetDeleted = (userId: string, bookId: string, table: string, id: string, deleted: boolean, label?: string) =>
  add({ userId, bookId, table, id, method: deleted ? "DELETE" : "POST", url: rowUrl(bookId, table, id) + (deleted ? "" : "/restore"), body: null, label })

export type FlushResult = { sent: OutboxEntry[]; failed: { e: OutboxEntry; msg: string }[]; left: number }

async function withLock<T>(fn: () => Promise<T>): Promise<T | null> {
  const locks = (navigator as Navigator & { locks?: { request: (n: string, o: { ifAvailable: boolean }, cb: (l: unknown) => Promise<T>) => Promise<T | null> } }).locks
  if (!locks) return fn()
  return locks.request(OUTBOX_LOCK, { ifAvailable: true }, async (l) => (l ? fn() : null))
}

/**
 * Envía los cambios pendientes en orden. Se detiene en el primero que no logra salir por red o porque la sesión venció
 * (quedan para después). Un cambio que la API rechaza (datos inválidos, sin permiso) se descarta y se informa.
 */
export async function flushOutbox(userId: string): Promise<FlushResult | null> {
  if (isOffline()) return null
  return withLock(async () => {
    useOffline.getState().set({ syncing: true })
    const sent: OutboxEntry[] = [], failed: { e: OutboxEntry; msg: string }[] = []
    try {
      for (const e of await outboxAll()) {
        if (e.userId !== userId) continue // de otra cuenta en este dispositivo: espera a que esa persona entre
        let res: Response
        try {
          res = await fetch(e.url, {
            method: e.method, credentials: "same-origin", body: e.body,
            headers: { ...(e.body ? { "content-type": "application/json" } : {}), "idempotency-key": e.key, "x-mirai-client": "web-offline" },
          })
        } catch { break } // sin red otra vez
        if (res.ok || res.status === 404 && e.method !== "PUT") { await outboxDelete(e.seq!); sent.push(e); continue }
        if (res.status === 401 || res.status === 408 || res.status === 429 || res.status >= 500) break // más tarde
        let msg = "La API no aceptó el cambio"
        try { const b = await res.json(); if (typeof b?.msg === "string") msg = b.msg } catch { /* sin cuerpo */ }
        await outboxDelete(e.seq!)
        failed.push({ e, msg })
      }
    } finally {
      useOffline.getState().set({ syncing: false })
      await refreshPending()
    }
    return { sent, failed, left: useOffline.getState().pending }
  })
}

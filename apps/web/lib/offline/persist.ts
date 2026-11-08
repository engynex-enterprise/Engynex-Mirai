// Lo último que se vio, guardado en el dispositivo: al abrir Mirai sin conexión las pantallas muestran esos datos en vez
// de quedarse cargando. Se guarda por persona (clave con su id) y se borra al cerrar sesión.
import { dehydrate, hydrate, type QueryClient } from "@tanstack/react-query"
import { kvGet, kvSet } from "./idb"

/** Súbelo si cambia la forma de los datos guardados (descarta lo viejo). */
export const PERSIST_VERSION = 1
/** Lo guardado sirve hasta una semana sin conexión. */
export const PERSIST_MAX_AGE = 7 * 864e5

type Saved = { v: number; at: number; state: ReturnType<typeof dehydrate> }
const key = (userId: string) => `rq:${userId}`

/** Consultas que vale la pena guardar: las que salieron bien y no son de un solo uso. */
const shouldSave = (q: { state: { status: string }; queryKey: readonly unknown[]; meta?: Record<string, unknown> }) =>
  q.state.status === "success" && q.meta?.offline !== false && q.queryKey[0] !== "refs-latest"

export async function saveQueries(qc: QueryClient, userId: string) {
  const state = dehydrate(qc, { shouldDehydrateQuery: shouldSave, shouldDehydrateMutation: () => false })
  await kvSet(key(userId), { v: PERSIST_VERSION, at: Date.now(), state } satisfies Saved)
  await kvSet("persist-at", Date.now())
}

/** Devuelve cuándo se guardó (o null). No pisa datos más nuevos que ya estén en memoria. */
export async function restoreQueries(qc: QueryClient, userId: string): Promise<number | null> {
  const s = await kvGet<Saved>(key(userId))
  if (!s || s.v !== PERSIST_VERSION || Date.now() - s.at > PERSIST_MAX_AGE) return null
  // Lo restaurado se marca como viejo (fecha 1, casi 1970): se muestra al instante, pero con internet se vuelve a pedir
  // enseguida y nunca pisa lo que ya llegó del servidor (hydrate solo reemplaza datos más viejos). No 0: una consulta
  // montada que aún espera (sin conexión) también tiene 0 y no recibiría los datos.
  const state = { ...s.state, queries: s.state.queries.map((q) => ({ ...q, state: { ...q.state, dataUpdatedAt: 1 } })) }
  try { hydrate(qc, state) } catch { return null }
  return s.at
}

export const lastSavedAt = () => kvGet<number>("persist-at")

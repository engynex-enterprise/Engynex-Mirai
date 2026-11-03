// Ventana fija alineada al reloj: la misma regla que rate_limit_hit (SQL) y que
// apps/web/lib/security/rate-limit-core.ts (respaldo en memoria). Puro.
export type Window = { start: number; count: number }
export type LimitResult = { ok: boolean; remaining: number; resetMs: number }

export function hitWindow(store: Map<string, Window>, key: string, max: number, windowMs: number, now = Date.now()): LimitResult {
  const start = Math.floor(now / windowMs) * windowMs
  const prev = store.get(key)
  const w = prev && prev.start === start ? { start, count: prev.count + 1 } : { start, count: 1 }
  store.set(key, w)
  if (store.size > 5000) for (const [k, v] of store) if (v.start < start) store.delete(k)
  return { ok: w.count <= max, remaining: Math.max(0, max - w.count), resetMs: start + windowMs - now }
}

/** Mensaje en palabras simples (el mismo de limitMsg en apps/web). */
export function limitMsg(resetMs: number, que = "Hiciste muchos intentos seguidos") {
  const min = Math.max(1, Math.ceil(resetMs / 60000))
  return `${que}. Espera ${min === 1 ? "un minuto" : min < 60 ? `${min} minutos` : "un rato"} y vuelve a intentar.`
}

// Límite de tasa de ventana fija. Puro (sin red ni base): lo usa el respaldo en memoria de lib/security/rate-limit.ts
// y tiene la misma regla que la función SQL rate_limit_hit (migración 20261103001400_seguridad.sql).

export type Window = { start: number; count: number }
export type LimitResult = { ok: boolean; remaining: number; resetMs: number }

/**
 * Registra un intento en `store[key]` y dice si todavía cabe. Ventana fija de `windowMs` alineada al reloj
 * (como la SQL): al empezar una ventana nueva el contador vuelve a 1. `max` intentos permitidos por ventana.
 */
export function hitWindow(store: Map<string, Window>, key: string, max: number, windowMs: number, now = Date.now()): LimitResult {
  const start = Math.floor(now / windowMs) * windowMs
  const prev = store.get(key)
  const w = prev && prev.start === start ? { start, count: prev.count + 1 } : { start, count: 1 }
  store.set(key, w)
  // Limpieza perezosa para que el mapa no crezca sin fin en una instancia de larga vida.
  if (store.size > 5000) for (const [k, v] of store) if (v.start < start) store.delete(k)
  return { ok: w.count <= max, remaining: Math.max(0, max - w.count), resetMs: start + windowMs - now }
}

/** Mensaje en palabras simples para cuando se llega al límite. */
export function limitMsg(resetMs: number, que = "Hiciste muchos intentos seguidos") {
  const min = Math.max(1, Math.ceil(resetMs / 60000))
  return `${que}. Espera ${min === 1 ? "un minuto" : min < 60 ? `${min} minutos` : "un rato"} y vuelve a intentar.`
}

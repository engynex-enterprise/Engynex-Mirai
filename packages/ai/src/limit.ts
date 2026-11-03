// Límite de tasa de la IA por hogar y hora, compartido entre instancias (web en Vercel y API en Cloud Run): la función
// SQL rate_limit_hit (tabla rate_limits, solo service_role) con LIMITS de @mirai/contracts. Si la base no responde,
// un contador en memoria de la instancia. Misma regla que apps/web/lib/security/rate-limit.ts (rateLimit + limitMsg),
// que es lo que usaba lib/ai/run.ts antes de moverse a este paquete. Solo servidor.
import { LIMITS, type LimitName } from "@mirai/contracts/limits"
import { rt } from "@mirai/services/runtime"

type Window = { start: number; count: number }
export type LimitResult = { ok: boolean; remaining: number; resetMs: number }

const memory = new Map<string, Window>()

/** Ventana fija alineada al reloj (como la SQL): `max` intentos por ventana de `windowMs`. */
export function hitWindow(store: Map<string, Window>, key: string, max: number, windowMs: number, now = Date.now()): LimitResult {
  const start = Math.floor(now / windowMs) * windowMs
  const prev = store.get(key)
  const w = prev && prev.start === start ? { start, count: prev.count + 1 } : { start, count: 1 }
  store.set(key, w)
  if (store.size > 5000) for (const [k, v] of store) if (v.start < start) store.delete(k)
  return { ok: w.count <= max, remaining: Math.max(0, max - w.count), resetMs: start + windowMs - now }
}

/** Mensaje en palabras simples para cuando se llega al límite. */
export function limitMsg(resetMs: number, que = "Hiciste muchos intentos seguidos") {
  const min = Math.max(1, Math.ceil(resetMs / 60000))
  return `${que}. Espera ${min === 1 ? "un minuto" : min < 60 ? `${min} minutos` : "un rato"} y vuelve a intentar.`
}

/** Registra un intento de `name` para `key` (persona, hogar o token). Nunca lanza: si algo falla, deja pasar. */
export async function rateLimit(name: LimitName, key: string): Promise<LimitResult> {
  const { max, windowS } = LIMITS[name]
  const k = `${name}:${key}`
  try {
    const { data, error } = await rt().admin().rpc("rate_limit_hit" as never, { p_key: k, p_max: max, p_window_s: windowS } as never)
    if (error) throw error
    const r = (Array.isArray(data) ? data[0] : data) as { ok: boolean; remaining: number; reset_ms: number } | null
    if (r && typeof r.ok === "boolean") return { ok: r.ok, remaining: Number(r.remaining) || 0, resetMs: Number(r.reset_ms) || 0 }
  } catch { /* respaldo en memoria */ }
  return hitWindow(memory, k, max, windowS * 1000)
}

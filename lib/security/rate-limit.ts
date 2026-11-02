import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { hitWindow, limitMsg, type LimitResult, type Window } from "./rate-limit-core"

// Límite de tasa compartido entre todas las instancias de Vercel: función SQL rate_limit_hit (tabla rate_limits,
// solo service_role). Si la base no responde se usa un contador en memoria de la instancia (mejor que nada).

const memory = new Map<string, Window>()

/** Límites de Mirai: intentos por ventana (segundos). Una sola tabla para ajustarlos. */
export const LIMITS = {
  chat: { max: 60, windowS: 600 },             // mensajes al chat por persona cada 10 minutos
  chatAdjunto: { max: 15, windowS: 3600 },     // fotos o PDF al chat por persona por hora
  ia: { max: 120, windowS: 3600 },             // llamadas a la IA por hogar por hora (si no hay Upstash)
  invitar: { max: 15, windowS: 86400 },        // invitaciones nuevas por persona al día
  invitarMin: { max: 5, windowS: 300 },        // y no más de 5 en 5 minutos
  pruebaAviso: { max: 6, windowS: 900 },       // "Enviarme una prueba" / "Enviar resumen ahora" cada 15 minutos
  contador: { max: 10, windowS: 86400 },       // accesos nuevos para el contador al día
  portalContador: { max: 120, windowS: 600 },  // aperturas del portal por enlace cada 10 minutos
  cuentaCorreo: { max: 5, windowS: 3600 },     // pedir, reenviar o cancelar un cambio de correo por hora
  cuentaMetodo: { max: 10, windowS: 3600 },    // quitar formas de entrar o cerrar sesiones por hora
  pasarHogar: { max: 12, windowS: 3600 },      // pedir, responder o cancelar pasar el hogar por hora
  borrarHogar: { max: 3, windowS: 3600 },      // borrar o salir de hogares por hora
} as const
export type LimitName = keyof typeof LIMITS

/** Registra un intento de `name` para `key` (persona, hogar o token). Nunca lanza: si algo falla, deja pasar. */
export async function rateLimit(name: LimitName, key: string): Promise<LimitResult> {
  const { max, windowS } = LIMITS[name]
  const k = `${name}:${key}`
  try {
    const { data, error } = await supabaseAdmin().rpc("rate_limit_hit" as never, { p_key: k, p_max: max, p_window_s: windowS } as never)
    if (error) throw error
    const r = (Array.isArray(data) ? data[0] : data) as { ok: boolean; remaining: number; reset_ms: number } | null
    if (r && typeof r.ok === "boolean") return { ok: r.ok, remaining: Number(r.remaining) || 0, resetMs: Number(r.reset_ms) || 0 }
  } catch { /* respaldo en memoria */ }
  return hitWindow(memory, k, max, windowS * 1000)
}

/** Igual que rateLimit, pero devuelve el mensaje para la persona (o null si puede seguir). */
export async function limitError(name: LimitName, key: string, que?: string): Promise<string | null> {
  const r = await rateLimit(name, key)
  return r.ok ? null : limitMsg(r.resetMs, que)
}

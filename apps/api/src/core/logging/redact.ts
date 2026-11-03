// Qué nunca se escribe en el log (§2.7.3): credenciales, tokens, secretos y MONTOS (en el servidor no hay data-money,
// así que la regla es no registrar cuerpos ni campos de dinero).
const SECRET = /authorization|cookie|token|secret|password|passwd|apikey|api_key|private|signature|^key$|_key$|-key$|credential/i
const MONEY = /valor|monto|amount|saldo|precio|bruto|neto|total|cuota|balance|ingreso|gasto|pago|tope|price|^value$/i

export const REDACTED = "[oculto]"

/** Copia el objeto ocultando claves sensibles (hasta 6 niveles). Para `details` y metadatos de errores. */
export function scrub(v: unknown, depth = 0): unknown {
  if (v === null || typeof v !== "object") return v
  if (depth > 6) return "[…]"
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => scrub(x, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = SECRET.test(k) || MONEY.test(k) ? REDACTED : scrub(x, depth + 1)
  return out
}

/** Ruta sin query y sin tokens en la ruta (portal del contador, invitaciones). */
export function safeUrl(url: string | undefined): string {
  const path = String(url ?? "").split("?")[0]
  return path.replace(/\/(accountant|invitations|contador|invitacion)\/[^/]+/gi, "/$1/:token")
}

/** Rutas de pino que se ocultan siempre (por si alguien registra un objeto de petición). */
export const PINO_REDACT = [
  "req.headers.authorization", "req.headers.cookie", "headers.authorization", "headers.cookie",
  "*.authorization", "*.token", "*.access_token", "*.refresh_token", "*.password", "*.secret", "*.apiKey", "*.api_key",
  "body", "*.body",
]

import { createHash, timingSafeEqual } from "node:crypto"

// Comparación de secretos en tiempo constante (cron, webhooks, tokens). Puro, sin red: se prueba en secrets.test.ts.

/**
 * ¿`a` y `b` son iguales? Compara los SHA-256 de ambos con timingSafeEqual: el tiempo no depende de cuántos
 * caracteres coinciden ni del largo del secreto (no se filtra por diferencia de longitud).
 */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string" || !a || !b) return false
  const x = createHash("sha256").update(a).digest()
  const y = createHash("sha256").update(b).digest()
  return timingSafeEqual(x, y)
}

/** ¿El encabezado `Authorization` trae `Bearer <secret>`? Falso si el secreto no está configurado. */
export function bearerOk(header: string | null | undefined, secret: string | null | undefined): boolean {
  if (!secret || !header) return false
  const m = /^Bearer\s+(.+)$/i.exec(header.trim())
  return !!m && safeEqual(m[1].trim(), secret)
}

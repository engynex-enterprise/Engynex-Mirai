// TOTP heredado de Supabase (§3.1.7). Supabase guarda el secreto en base32 y la llave HMAC son esos bytes decodificados;
// Better Auth usa el texto del secreto como llave (UTF-8), así que un secreto de Supabase no sirve tal cual.
// El script de migración lo guarda cifrado como `supabase-b32:<BASE32>` y el plugin mirai-gate lo verifica aquí, con la
// misma ventana (±1 periodo de 30 s) y 6 dígitos: nadie tiene que volver a escanear el código QR.
import { createHmac, timingSafeEqual } from "node:crypto"

export const LEGACY_TOTP_PREFIX = "supabase-b32:"

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

export function base32Decode(input: string): Buffer {
  const s = input.toUpperCase().replace(/=+$/g, "").replace(/\s+/g, "")
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of s) {
    const i = B32.indexOf(ch)
    if (i < 0) throw new Error("base32 inválido")
    value = (value << 5) | i
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** ¿Es un secreto TOTP de Supabase legible? (base32 de 16 a 64 caracteres). */
export const isBase32Secret = (s: unknown): s is string => typeof s === "string" && /^[A-Z2-7]{16,64}=*$/i.test(s.trim())

export function hotp(key: Buffer, counter: number, digits = 6): string {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(BigInt(counter))
  const h = createHmac("sha1", key).update(buf).digest()
  const o = h[h.length - 1] & 15
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]
  return String(n % 10 ** digits).padStart(digits, "0")
}

export function totpNow(base32: string, at = Date.now(), period = 30): string {
  return hotp(base32Decode(base32), Math.floor(at / 1000 / period))
}

/** Verifica un código de 6 dígitos con ±`window` periodos (comparación en tiempo constante). */
export function verifyLegacyTotp(base32: string, code: string, at = Date.now(), window = 1, period = 30): boolean {
  if (!/^\d{6}$/.test(String(code ?? ""))) return false
  const key = base32Decode(base32)
  const counter = Math.floor(at / 1000 / period)
  let ok = false
  for (let i = -window; i <= window; i++) {
    const a = Buffer.from(hotp(key, counter + i))
    ok = timingSafeEqual(a, Buffer.from(code)) || ok
  }
  return ok
}

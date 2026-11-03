// @mirai/crypto: cifrado de secretos (AES-256-GCM). Solo servidor. Movido de apps/web/lib/crypto.ts (F2-B-7) sin
// cambiar el formato: lo que cifró la v5 se descifra igual aquí, en la web y en la API.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

const TAG = 16
const IV = 12

/** Convierte ENCRYPTION_KEY (32 bytes en base64) en la llave. Lanza si no tiene 32 bytes. */
export function parseKey(b64: string | undefined | null): Buffer {
  const k = Buffer.from(b64 ?? "", "base64")
  if (k.length !== 32) throw new Error("ENCRYPTION_KEY debe tener 32 bytes en base64")
  return k
}

/** ¿La llave tiene 32 bytes en base64? (para /readyz y la validación de la configuración). */
export function isValidKey(b64: string | undefined | null): boolean {
  try {
    parseKey(b64)
    return true
  } catch {
    return false
  }
}

/** AES-256-GCM. Formato: v1.iv.tag.data (base64url). */
export function encryptWith(key: Buffer, plain: string): string {
  const iv = randomBytes(IV)
  const c = createCipheriv("aes-256-gcm", key, iv, { authTagLength: TAG })
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()])
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(".")
}

export function decryptWith(key: Buffer, blob: string): string {
  const [v, iv, tag, data, extra] = String(blob ?? "").split(".")
  if (v !== "v1" || extra !== undefined || !iv || !tag || data === undefined) throw new Error("Formato de cifrado desconocido")
  const ivB = Buffer.from(iv, "base64url"), tagB = Buffer.from(tag, "base64url")
  // Etiqueta completa (16 bytes) e IV de 12: una etiqueta recortada debilitaría la autenticación.
  if (ivB.length !== IV || tagB.length !== TAG) throw new Error("Formato de cifrado desconocido")
  const d = createDecipheriv("aes-256-gcm", key, ivB, { authTagLength: TAG })
  d.setAuthTag(tagB)
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8")
}

/** Igual que encryptWith, con ENCRYPTION_KEY del entorno (lo que usa apps/web). */
export const encrypt = (plain: string): string => encryptWith(parseKey(process.env.ENCRYPTION_KEY), plain)

/** Igual que decryptWith, con ENCRYPTION_KEY del entorno (lo que usa apps/web). */
export const decrypt = (blob: string): string => decryptWith(parseKey(process.env.ENCRYPTION_KEY), blob)

/** ••••1234 para mostrar una clave sin revelarla. */
export const mask = (s: string) => (s ? `••••${s.slice(-4)}` : "")

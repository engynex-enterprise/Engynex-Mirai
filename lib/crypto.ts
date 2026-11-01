import "server-only"
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

/** AES-256-GCM con ENCRYPTION_KEY (32 bytes en base64). Formato: v1.iv.tag.data (base64url). */
const key = () => {
  const k = Buffer.from(process.env.ENCRYPTION_KEY ?? "", "base64")
  if (k.length !== 32) throw new Error("ENCRYPTION_KEY debe tener 32 bytes en base64")
  return k
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv("aes-256-gcm", key(), iv)
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()])
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(".")
}

export function decrypt(blob: string): string {
  const [v, iv, tag, data] = blob.split(".")
  if (v !== "v1") throw new Error("Formato de cifrado desconocido")
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"))
  d.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8")
}

/** ••••1234 para mostrar una clave sin revelarla. */
export const mask = (s: string) => (s ? `••••${s.slice(-4)}` : "")

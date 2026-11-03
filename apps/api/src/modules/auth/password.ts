// Contraseñas del auth propio (§3.1.2). Se guardan con bcrypt (costo 12): es el formato de Supabase ($2a$10$…) y el que
// importan Firebase/Identity Platform, así una salida futura tampoco obliga a nadie a cambiar su clave.
// `verify` acepta los hashes bcrypt de Supabase ($2a$, $2b$, $2y$) y, por si acaso, el scrypt por defecto de Better Auth.
import bcrypt from "bcryptjs"
import { verifyPassword as verifyScrypt } from "better-auth/crypto"

export const BCRYPT_COST = 12

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST)
}

/** ¿Es un hash bcrypt? ($2a$, $2b$ o $2y$ con costo de dos dígitos y 53 caracteres de sal+hash). */
export const isBcrypt = (hash: string) => /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash)

export async function verifyPassword({ hash, password }: { hash: string; password: string }): Promise<boolean> {
  if (!hash || !password) return false
  if (isBcrypt(hash)) return bcrypt.compare(password, hash.replace(/^\$2y\$/, "$2b$"))
  if (/^[0-9a-f]+:[0-9a-f]+$/i.test(hash)) return verifyScrypt({ hash, password }).catch(() => false)
  return false
}

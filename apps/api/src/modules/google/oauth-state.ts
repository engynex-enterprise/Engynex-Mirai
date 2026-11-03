// `state` de OAuth firmado (F2-E-3): reemplaza la cookie `g_oauth` de la web. Lleva la persona, el servicio, a dónde
// volver, un nonce y el vencimiento; la firma es HMAC-SHA256 con GOOGLE_OAUTH_STATE_KEY y se compara en tiempo constante.
// Así el callback (público) sabe de quién son los tokens sin sesión ni cookie, y nadie puede fabricar uno.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto"

export type OAuthState = { u: string; s: "gmail" | "calendar"; b: string; n: string; exp: number }

export const STATE_TTL_S = 600

const b64 = (x: Buffer | string) => Buffer.from(x).toString("base64url")
const mac = (key: string, data: string) => createHmac("sha256", key).update(data).digest()

export function signState(key: string, p: Omit<OAuthState, "n" | "exp">, now = Date.now()): string {
  const body = b64(JSON.stringify({ ...p, n: randomBytes(9).toString("base64url"), exp: Math.floor(now / 1000) + STATE_TTL_S } satisfies OAuthState))
  return `${body}.${b64(mac(key, body))}`
}

/** El estado si la firma es válida y no venció; si no, null. */
export function verifyState(key: string, state: string | null | undefined, now = Date.now()): OAuthState | null {
  if (typeof state !== "string" || state.length > 2000) return null
  const [body, sig, extra] = state.split(".")
  if (!body || !sig || extra !== undefined) return null
  const want = mac(key, body)
  const got = Buffer.from(sig, "base64url")
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as OAuthState
    if (typeof p.u !== "string" || (p.s !== "gmail" && p.s !== "calendar") || typeof p.b !== "string" || typeof p.exp !== "number") return null
    return p.exp * 1000 >= now ? p : null
  } catch {
    return null
  }
}

// Firmas locales para las pruebas: un "Supabase Auth" (ES256) y un "Google" (RS256, tokens OIDC de Scheduler) con
// sus JWKS en memoria. Nada sale a la red.
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from "jose"

export const ISSUER = "https://proyecto-prueba.supabase.co/auth/v1"
export const AUDIENCE = "authenticated"

type Signer = { jwks: ReturnType<typeof createLocalJWKSet>; sign(p: JWTPayload, o?: { expSec?: number; iss?: string; aud?: string; alg?: string }): Promise<string> }

async function signer(alg: "ES256" | "RS256", kid: string, defaults: { iss: string; aud: string }): Promise<Signer> {
  const { privateKey, publicKey } = await generateKeyPair(alg, { extractable: true })
  const jwk = { ...(await exportJWK(publicKey)), kid, alg, use: "sig" }
  const jwks = createLocalJWKSet({ keys: [jwk] })
  return {
    jwks,
    sign: (p, o = {}) =>
      new SignJWT(p)
        .setProtectedHeader({ alg, kid })
        .setIssuer(o.iss ?? defaults.iss)
        .setAudience(o.aud ?? defaults.aud)
        .setIssuedAt()
        .setExpirationTime(Math.floor(Date.now() / 1000) + (o.expSec ?? 3600))
        .sign(privateKey),
  }
}

let cache: Promise<{ supabase: Signer; google: Signer }> | undefined
export const signers = () =>
  (cache ??= (async () => ({
    supabase: await signer("ES256", "supa-1", { iss: ISSUER, aud: AUDIENCE }),
    google: await signer("RS256", "goog-1", { iss: "https://accounts.google.com", aud: "https://api-pruebas.mirai.test" }),
  }))())

/** Access token como el de Supabase Auth para `sub`. */
export async function userToken(sub: string, extra: JWTPayload = {}, o?: { expSec?: number; iss?: string; aud?: string }) {
  const { supabase } = await signers()
  return supabase.sign({ sub, role: "authenticated", email: `${sub.slice(0, 4)}@correo.co`, session_id: "s-1", aal: "aal1", ...extra }, o)
}

/** Token OIDC como el que manda Cloud Scheduler. */
export async function googleToken(email: string, o?: { aud?: string; verified?: boolean }) {
  const { google } = await signers()
  return google.sign({ email, email_verified: o?.verified ?? true, sub: "1234567890" }, { aud: o?.aud })
}

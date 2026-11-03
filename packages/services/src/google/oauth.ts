// Google OAuth en el servidor (Gmail de solo lectura y Google Calendar). Los tokens se guardan cifrados.
// Movido de apps/web/lib/google.ts (F2-E-3). La web usa su callback (/api/google/callback); la API pasa el suyo.
import { rt } from "../runtime"

const supabaseAdmin = () => rt().admin()
const decrypt = (s: string) => rt().decrypt(s)
const encrypt = (s: string) => rt().encrypt(s)
const env = (n: string) => rt().env(n)

export const G_SCOPES = { gmail: "https://www.googleapis.com/auth/gmail.readonly", calendar: "https://www.googleapis.com/auth/calendar.events" } as const
export const siteUrl = () => rt().siteUrl()
/** Callback de la web (el que está registrado hoy en Google Cloud). */
export const redirectUri = () => `${siteUrl()}/api/google/callback`

export type Tokens = { access_token: string; refresh_token?: string; expires_at: number; scope: string }

/** ¿El despliegue tiene GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET? */
export const googleConfigured = () => !!(env("GOOGLE_CLIENT_ID") && env("GOOGLE_CLIENT_SECRET"))

/** Cambia el código de OAuth por tokens. `redirect` = el callback que se usó al pedir el código (por defecto, el de la web). */
export async function exchangeCode(code: string, redirect: string = redirectUri()) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env("GOOGLE_CLIENT_ID")!, client_secret: env("GOOGLE_CLIENT_SECRET")!, redirect_uri: redirect, grant_type: "authorization_code" }),
  }).then((x) => x.json())
  if (r.error) throw new Error(r.error_description || r.error)
  return { access_token: r.access_token, refresh_token: r.refresh_token, expires_at: Date.now() + (r.expires_in - 60) * 1000, scope: r.scope } as Tokens
}

export async function saveTokens(userId: string, t: Tokens, email?: string) {
  const db = supabaseAdmin()
  const { data: prev } = await db.from("google_connections").select("tokens_enc,scopes").eq("user_id", userId).maybeSingle()
  let old: Partial<Tokens> = {}
  if (prev?.tokens_enc) { try { old = JSON.parse(decrypt(prev.tokens_enc)) } catch { old = {} } }
  const merged = { ...old, ...t, refresh_token: t.refresh_token ?? old.refresh_token }
  const scopes = [...new Set([...(prev?.scopes ?? []), ...t.scope.split(" ")])]
  await db.from("google_connections").upsert({ user_id: userId, email: email ?? undefined, scopes, tokens_enc: encrypt(JSON.stringify(merged)), updated_at: new Date().toISOString() })
}

/** Token de acceso vigente (lo renueva con el refresh token si venció). */
export async function googleToken(userId: string, need: keyof typeof G_SCOPES): Promise<string> {
  const { data } = await supabaseAdmin().from("google_connections").select("tokens_enc,scopes").eq("user_id", userId).maybeSingle()
  if (!data?.tokens_enc || !data.scopes.includes(G_SCOPES[need])) throw new Error(`Conecta tu cuenta de Google (${need === "gmail" ? "Gmail" : "Calendar"}) primero.`)
  const t = JSON.parse(decrypt(data.tokens_enc)) as Tokens
  if (t.expires_at > Date.now()) return t.access_token
  if (!t.refresh_token) throw new Error("La conexión con Google venció. Vuelve a conectarla.")
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env("GOOGLE_CLIENT_ID")!, client_secret: env("GOOGLE_CLIENT_SECRET")!, refresh_token: t.refresh_token, grant_type: "refresh_token" }),
  }).then((x) => x.json())
  if (r.error) throw new Error("La conexión con Google venció. Vuelve a conectarla.")
  await saveTokens(userId, { access_token: r.access_token, expires_at: Date.now() + (r.expires_in - 60) * 1000, scope: r.scope ?? t.scope })
  return r.access_token
}

export async function googleFetch<T>(userId: string, need: keyof typeof G_SCOPES, url: string, init?: RequestInit): Promise<T> {
  const tok = await googleToken(userId, need)
  const r = await fetch(url, { ...init, headers: { ...(init?.headers ?? {}), authorization: `Bearer ${tok}`, "content-type": "application/json" } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j?.error?.message ?? `Google respondió ${r.status}`)
  return j as T
}

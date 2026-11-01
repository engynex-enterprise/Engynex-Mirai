import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { decrypt, encrypt } from "@/lib/crypto"

// Google OAuth en el servidor (Gmail de solo lectura y Google Calendar). Los tokens se guardan cifrados.
export const G_SCOPES = { gmail: "https://www.googleapis.com/auth/gmail.readonly", calendar: "https://www.googleapis.com/auth/calendar.events" } as const
export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "")
export const redirectUri = () => `${siteUrl()}/api/google/callback`

type Tokens = { access_token: string; refresh_token?: string; expires_at: number; scope: string }

export async function exchangeCode(code: string) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
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
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, refresh_token: t.refresh_token, grant_type: "refresh_token" }),
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

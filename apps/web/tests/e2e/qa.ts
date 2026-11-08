import { createClient } from "@supabase/supabase-js"
import { LEGAL_VERSION } from "../../lib/legal/version"

/** Usuario de pruebas (se registra por la API y queda con el correo verificado; no envía correos). */
try { process.loadEnvFile?.(".env.local") } catch { /* en CI las variables vienen del entorno */ }
export const QA = {
  email: process.env.E2E_QA_EMAIL ?? "qa.e2e@mirai.test",
  password: process.env.E2E_QA_PASSWORD ?? "",
  nombre: "Ana Prueba",
}

// Auth propio (Better Auth en la API) sobre la Postgres local de Docker (pnpm e2e:local). `admin()` usa supabase-js
// solo como cliente de PostgREST: las tablas van al PostgREST de la base local con la llave service_role local, y
// `auth.admin.*` se arma con Better Auth (registro por la API) + SQL directo a la base local. Solo funciona contra
// Docker local (E2E_DB_URL / E2E_POSTGREST_URL apuntan a localhost).
const restClient = (url: string, key: string, init: Parameters<typeof createClient>[2]) => createClient(url, key, init)
type Sb = ReturnType<typeof restClient>
type PgRow = Record<string, unknown>

async function pg<T extends PgRow = PgRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const url = process.env.E2E_DB_URL
  if (!url || !/localhost|127\.0\.0\.1/.test(url)) throw new Error("Las pruebas necesitan E2E_DB_URL de la base local (pnpm e2e:local)")
  const { default: PG } = await import("pg")
  const c = new PG.Client({ connectionString: url })
  await c.connect()
  try {
    return (await c.query(sql, params)).rows as T[]
  } finally {
    await c.end()
  }
}

/** Quita los límites de intentos del auth propio (las pruebas entran muchas veces seguidas desde la misma IP). */
export async function clearAuthLimits() {
  await pg("delete from auth.rate_limits")
}

/** Crea la cuenta como lo haría una persona (POST /api/auth/sign-up/email) y la deja con el correo verificado. */
async function miraiSignUp(email: string, password: string, nombre: string, ref?: string): Promise<string> {
  await clearAuthLimits()
  const api = process.env.E2E_API_URL ?? "http://localhost:55080"
  const origin = process.env.E2E_BASE_URL ?? "http://localhost:55300"
  const r = await fetch(`${api}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email, password, name: nombre, nombre, acepta_version: LEGAL_VERSION, callbackURL: "/bienvenida", ...(ref ? { ref } : {}) }),
  })
  if (!r.ok) throw new Error(`No se pudo crear ${email} en el auth propio (${r.status}): ${(await r.text()).slice(0, 200)}`)
  const [u] = await pg<{ id: string }>("update auth.users set email_verified = true, email_confirmed_at = coalesce(email_confirmed_at, now()) where lower(email) = lower($1) returning id", [email])
  if (!u) throw new Error(`La cuenta ${email} no quedó en auth.users`)
  return u.id
}

/** `auth.admin.*` (lo que usan las pruebas) sobre el auth propio. Misma forma de respuesta que supabase-js. */
const miraiAuthAdmin = {
  async listUsers() {
    const users = await pg<{ id: string; email: string }>("select id::text, email from auth.users")
    return { data: { users }, error: null }
  },
  async createUser(o: { email: string; password?: string; email_confirm?: boolean; user_metadata?: { nombre?: string; ref?: string } }) {
    try {
      // Como el formulario de registro: el código de referido viaja en el cuerpo (queda en raw_user_meta_data.ref).
      const id = await miraiSignUp(o.email, o.password ?? `Qa-${Date.now()}-x!`, o.user_metadata?.nombre ?? o.email.split("@")[0], o.user_metadata?.ref)
      return { data: { user: { id, email: o.email } }, error: null }
    } catch (e) {
      return { data: { user: null }, error: e as Error }
    }
  },
  async deleteUser(id: string) {
    await pg("delete from auth.users where id = $1", [id])
    return { data: {}, error: null }
  },
}

let miraiAdmin: Sb | null = null

export function admin(): Sb {
  if (miraiAdmin) return miraiAdmin
  // PostgREST de la base destino (sin /rest/v1): supabase-js arma <url>/rest/v1/…, el fetch lo quita.
  const rest = (process.env.E2E_POSTGREST_URL ?? "http://localhost:55430").replace(/\/+$/, "")
  if (!/localhost|127\.0\.0\.1/.test(rest)) throw new Error("Las pruebas necesitan E2E_POSTGREST_URL local (pnpm e2e:local)")
  const key = process.env.E2E_SERVICE_KEY ?? ""
  const sb = restClient(rest, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(String(input instanceof Request ? input.url : input).replace(`${rest}/rest/v1`, rest), init) },
  })
  // `auth` es un getter del cliente: se sobrescribe con lo mínimo que usan las pruebas.
  miraiAdmin = new Proxy(sb as unknown as Sb, { get: (t, p, r) => (p === "auth" ? { admin: miraiAuthAdmin } : Reflect.get(t, p, r)) }) as Sb
  return miraiAdmin
}

/** Borra y recrea el usuario de QA (con sus hogares) para empezar limpio. */
export async function resetQaUser() {
  const [old] = await pg<{ id: string }>("select id::text from auth.users where lower(email) = lower($1)", [QA.email])
  if (old) {
    await pg("delete from public.households where id in (select household_id from public.household_members where user_id = $1)", [old.id])
    await pg("delete from auth.users where id = $1", [old.id])
  }
  await miraiSignUp(QA.email, QA.password, QA.nombre)
  await pg("delete from public.households h where h.nombre = 'Familia Prueba' and not exists (select 1 from public.household_members m where m.household_id = h.id)")
}

const qaId = async (): Promise<string | undefined> =>
  (await pg<{ id: string }>("select id::text from auth.users where lower(email) = lower($1)", [QA.email]))[0]?.id

/** Marca la bienvenida como vista para QA (las pruebas no la ven, salvo la suya). */
export async function setQaWelcome(seen: boolean) {
  const sb = admin()
  const uid = await qaId()
  if (!uid) return
  const { data: p } = await sb.from("user_preferences").select("extra").eq("user_id", uid).maybeSingle()
  const extra = { ...((p?.extra ?? {}) as Record<string, unknown>) }
  if (seen) extra.welcome_seen = extra.welcome_seen ?? new Date().toISOString(); else delete extra.welcome_seen
  await sb.from("user_preferences").upsert({ user_id: uid, extra })
}

/**
 * Deja abierto el libro principal de QA. Con la API el libro activo se recuerda en profiles.last_book_id (para tus otros
 * dispositivos): sin esto, "Ver un ejemplo" de una prueba deja el libro de ejemplo (con pagos vencidos y sus avisos
 * emergentes) abierto en todas las que siguen.
 */
export async function setQaDefaultBook() {
  const sb = admin()
  const uid = await qaId()
  if (!uid) return
  const { data: hh } = await sb.from("household_members").select("household_id").eq("user_id", uid).eq("role", "owner")
  const ids = (hh ?? []).map((h) => h.household_id)
  if (!ids.length) return
  const { data: bk } = await sb.from("books").select("id").in("household_id", ids).is("deleted_at", null).eq("is_default", true).limit(1).maybeSingle()
  if (!bk) return
  await sb.from("profiles").update({ last_book_id: bk.id }).eq("id", uid)
  // Sin avisos emergentes (Ajustes › Alertas): los datos que dejan otras pruebas ("Mañana: Cuota 1…") salen como toasts
  // al abrir la app y mueven el "Deshacer" de la prueba (Playwright: "element is not stable"). La campana sigue igual.
  const { data: r } = await sb.from("notification_rules").select("canales").eq("user_id", uid).eq("book_id", bk.id).maybeSingle()
  const canales = { app: true, ...((r?.canales ?? {}) as Record<string, unknown>), popup: false }
  if (r) await sb.from("notification_rules").update({ canales }).eq("user_id", uid).eq("book_id", bk.id)
  else await sb.from("notification_rules").insert({ user_id: uid, book_id: bk.id, canales })
}

/** Pone el hogar de QA en Premium (cortesía de prueba) o en Gratis. Las pruebas usan Premium salvo las del plan gratis. */
export async function setQaPlan(plan: "premium" | "gratis") {
  const sb = admin()
  const uid = await qaId()
  if (!uid) return
  const { data: hh } = await sb.from("household_members").select("household_id").eq("user_id", uid)
  const ids = (hh ?? []).map((h) => h.household_id)
  if (!ids.length) return
  await sb.from("plan_subscriptions").delete().in("household_id", ids).eq("proveedor", "manual")
  if (plan === "premium") await sb.from("plan_subscriptions").insert(ids.map((household_id) => ({ household_id, proveedor: "manual", estado: "cortesia", nota: "e2e", vence_at: new Date(Date.now() + 86_400_000).toISOString() })))
}

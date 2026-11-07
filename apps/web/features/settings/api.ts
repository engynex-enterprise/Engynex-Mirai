// Lecturas y escrituras de Ajustes por la API (V7-H2). Cada función tiene la misma forma que la consulta de siempre y
// elige el camino con su interruptor: encendido = la API; apagado = Supabase directo (la rama heredada, como hoy).
// Lecturas con respaldo (si la API no responde se lee de Supabase); escrituras sin respaldo (nunca se repiten).
//   · Reglas de aviso (Alertas, Privacidad) y Telegram: `notify` → /v1/books/:b/notification-rules/me, /v1/me/telegram
//   · Respaldos e historial (Datos): `importer` → /v1/books/:b/backups · `books` → /v1/books/:b/audit
//   · Integraciones (Inteligencia artificial): `integrations` → /v1/platform/integrations y /v1/books/:b/integrations
//   · TRM y usura vigentes (Finanzas): `refs` → /v1/refs/trm y /v1/refs/usura
import { apiOn } from "@/lib/api/session"
import { isApiError } from "@/lib/api/errors"
import { readWithFallback } from "@/lib/api/book-tables"
import { createClient } from "@/utils/supabase/client"
import type { Row } from "@/lib/supabase/tables"

const api = () => import("@/lib/api/client")

// ── Reglas de aviso ────────────────────────────────────────────────────────────────────────────────────────────

/** Campos de notification_rules que la persona cambia (los demás los pone el servidor). */
const RULE_KEYS = ["matriz", "canales", "hora", "frecuencia", "silencio", "ocultar_montos", "email_to", "whatsapp_to", "notif"] as const

/** Mi regla de avisos en el libro, o null si aún no hay (la API devuelve la de por defecto). */
export async function fetchMyRule(userId: string, bookId: string): Promise<Record<string, unknown> | null> {
  const legacy = async () => (await createClient().from("notification_rules").select("*").eq("user_id", userId).eq("book_id", bookId).maybeSingle()).data as Record<string, unknown> | null
  if (!apiOn("notify")) return legacy()
  return readWithFallback(async () => {
    const { browserApi, unwrap } = await api()
    return unwrap(await browserApi().notify.getMyRule({ params: { bookId } })) as Record<string, unknown>
  }, legacy)
}

/** Guarda campos de mi regla de avisos (upsert). Lanza Error con el mensaje para la persona. */
export async function saveMyRule(userId: string, bookId: string, p: Record<string, unknown>): Promise<void> {
  if (apiOn("notify")) {
    const body = Object.fromEntries(Object.entries(p).filter(([k]) => (RULE_KEYS as readonly string[]).includes(k)))
    const { browserApi, unwrap } = await api()
    unwrap(await browserApi().notify.putMyRule({ params: { bookId }, body: body as never }))
    return
  }
  const { error } = await createClient().from("notification_rules").upsert({ user_id: userId, book_id: bookId, ...p })
  if (error) throw new Error(error.message)
}

/** ¿Mi chat de Telegram está vinculado? */
export async function fetchTelegramLinked(userId: string): Promise<boolean> {
  const legacy = async () => !!(await createClient().from("telegram_links").select("chat_id,linked_at").eq("user_id", userId).maybeSingle()).data?.chat_id
  if (!apiOn("notify")) return legacy()
  return readWithFallback(async () => {
    const { browserApi, unwrap } = await api()
    return unwrap(await browserApi().me.telegram()).linked
  }, legacy)
}

// ── Respaldos e historial ──────────────────────────────────────────────────────────────────────────────────────

/** Respaldos guardados del libro (los 30 más recientes). Sin permiso de «Administra»: ninguno. */
export async function fetchBackups(bookId: string): Promise<Row<"backups">[]> {
  const legacy = async () => (await createClient().from("backups").select("*").eq("book_id", bookId).order("created_at", { ascending: false }).limit(30)).data ?? []
  if (!apiOn("importer")) return legacy()
  try {
    return await readWithFallback(async () => {
      const { browserApi, unwrap } = await api()
      return unwrap(await browserApi().importer.backups({ params: { bookId } })).slice(0, 30)
    }, legacy)
  } catch (e) {
    if (isApiError(e) && e.code === "ROLE_DENIED") return []
    throw e
  }
}

export type AuditRow = { id: string; tabla: string; accion: string; actor: string | null; resumen: string | null; created_at: string; quien: string }

/** Historial de cambios del libro con el nombre de quien los hizo. */
export async function fetchAudit(bookId: string, limit: number): Promise<AuditRow[]> {
  const legacy = async (): Promise<AuditRow[]> => {
    const sb = createClient()
    const { data } = await sb.from("audit_log").select("id,tabla,accion,actor,resumen,created_at").eq("book_id", bookId).order("created_at", { ascending: false }).limit(limit)
    const ids = [...new Set((data ?? []).map((r) => r.actor).filter(Boolean))] as string[]
    const { data: ps } = ids.length ? await sb.from("profiles").select("id,nombre,email").in("id", ids) : { data: [] }
    const pm = new Map((ps ?? []).map((p) => [p.id, p.nombre || p.email]))
    return (data ?? []).map((r) => ({ ...r, id: String(r.id), quien: (r.actor && pm.get(r.actor)) || "Sistema" }))
  }
  if (!apiOn("books")) return legacy()
  return readWithFallback(async () => {
    const { browserApi, unwrap } = await api()
    return unwrap(await browserApi().books.audit({ params: { bookId }, query: { limit } }))
  }, legacy)
}

// ── Integraciones ──────────────────────────────────────────────────────────────────────────────────────────────

export type PlatformIntegration = { modo: string; planes: string[] }

/** Integraciones que ofrece la plataforma (sin secretos), por tipo. */
export async function fetchPlatformIntegrations(): Promise<Record<string, PlatformIntegration>> {
  const legacy = async () => Object.fromEntries(((await createClient().from("platform_integrations_public").select("kind,modo,planes")).data ?? []).map((r) => [r.kind!, r])) as Record<string, PlatformIntegration>
  if (!apiOn("integrations")) return legacy()
  return readWithFallback(async () => {
    const { browserApi, unwrap } = await api()
    return Object.fromEntries(unwrap(await browserApi().me.platformIntegrations()).map((r) => [r.kind, r]))
  }, legacy)
}

export type IntegrationPub = { kind: string; enabled: boolean; config: Record<string, unknown>; meta: Record<string, unknown> }

/** Integraciones del hogar (con máscara, sin secretos), por tipo. */
export async function fetchHouseholdIntegrations(householdId: string, bookId: string): Promise<Record<string, IntegrationPub>> {
  const legacy = async () => Object.fromEntries(((await createClient().from("integrations_public").select("kind,enabled,config,meta").eq("household_id", householdId)).data ?? []).map((r) => [r.kind!, r as unknown as IntegrationPub]))
  if (!apiOn("integrations")) return legacy()
  return readWithFallback(async () => {
    const { browserApi, unwrap } = await api()
    return Object.fromEntries(unwrap(await browserApi().integrations.list({ params: { bookId } })).items.map((r) => [r.kind, r as IntegrationPub]))
  }, legacy)
}

// ── Datos de referencia ────────────────────────────────────────────────────────────────────────────────────────

export type LatestRefs = { trm: { fecha: string; valor: number } | null; usura: { desde: string; hasta: string; tasa_ea: number } | null }

/** TRM y tasa de usura más recientes. */
export async function fetchLatestRefs(): Promise<LatestRefs> {
  const legacy = async (): Promise<LatestRefs> => {
    const sb = createClient()
    const [trm, usura] = await Promise.all([
      sb.from("ref_trm").select("fecha,valor").order("fecha", { ascending: false }).limit(1).maybeSingle(),
      sb.from("ref_usury_rate").select("desde,hasta,tasa_ea").order("desde", { ascending: false }).limit(1).maybeSingle(),
    ])
    return { trm: trm.data, usura: usura.data }
  }
  if (!apiOn("refs")) return legacy()
  return readWithFallback(async () => {
    const { browserApi, unwrap } = await api()
    const a = browserApi()
    const [t, u] = await Promise.all([a.refs.trm({ query: { limit: 1 } }), a.refs.usura({ query: { limit: 1 } })])
    const trm = unwrap(t)[0]
    const usura = unwrap(u)[0]
    return { trm: trm ? { fecha: trm.fecha, valor: trm.valor } : null, usura: usura ? { desde: usura.desde, hasta: usura.hasta, tasa_ea: usura.tasa_ea } : null }
  }, legacy)
}

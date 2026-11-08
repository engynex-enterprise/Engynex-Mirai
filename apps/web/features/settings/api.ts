// Lecturas y escrituras de Ajustes por la API:
//   · Reglas de aviso (Alertas, Privacidad) y Telegram → /v1/books/:b/notification-rules/me, /v1/me/telegram
//   · Respaldos e historial (Datos) → /v1/books/:b/backups, /v1/books/:b/audit
//   · Integraciones (Inteligencia artificial) → /v1/platform/integrations y /v1/books/:b/integrations
//   · TRM y usura vigentes (Finanzas) → /v1/refs/trm y /v1/refs/usura
import { isApiError } from "@/lib/api/errors"
import type { Row } from "@/lib/supabase/tables"

const api = () => import("@/lib/api/client")

// ── Reglas de aviso ────────────────────────────────────────────────────────────────────────────────────────────

/** Campos de notification_rules que la persona cambia (los demás los pone el servidor). */
const RULE_KEYS = ["matriz", "canales", "hora", "frecuencia", "silencio", "ocultar_montos", "email_to", "whatsapp_to", "notif"] as const

/** Mi regla de avisos en el libro (la API devuelve la de por defecto si aún no hay). */
export async function fetchMyRule(_userId: string, bookId: string): Promise<Record<string, unknown> | null> {
  const { browserApi, unwrap } = await api()
  return unwrap(await browserApi().notify.getMyRule({ params: { bookId } })) as Record<string, unknown>
}

/** Guarda campos de mi regla de avisos (upsert). Lanza Error con el mensaje para la persona. */
export async function saveMyRule(_userId: string, bookId: string, p: Record<string, unknown>): Promise<void> {
  const body = Object.fromEntries(Object.entries(p).filter(([k]) => (RULE_KEYS as readonly string[]).includes(k)))
  const { browserApi, unwrap } = await api()
  unwrap(await browserApi().notify.putMyRule({ params: { bookId }, body: body as never }))
}

/** ¿Mi chat de Telegram está vinculado? */
export async function fetchTelegramLinked(): Promise<boolean> {
  const { browserApi, unwrap } = await api()
  return unwrap(await browserApi().me.telegram()).linked
}

// ── Respaldos e historial ──────────────────────────────────────────────────────────────────────────────────────

/** Respaldos guardados del libro (los 30 más recientes). Sin permiso de «Administra»: ninguno. */
export async function fetchBackups(bookId: string): Promise<Row<"backups">[]> {
  try {
    const { browserApi, unwrap } = await api()
    return unwrap(await browserApi().importer.backups({ params: { bookId } })).slice(0, 30)
  } catch (e) {
    if (isApiError(e) && e.code === "ROLE_DENIED") return []
    throw e
  }
}

export type AuditRow = { id: string; tabla: string; accion: string; actor: string | null; resumen: string | null; created_at: string; quien: string }

/** Historial de cambios del libro con el nombre de quien los hizo. */
export async function fetchAudit(bookId: string, limit: number): Promise<AuditRow[]> {
  const { browserApi, unwrap } = await api()
  return unwrap(await browserApi().books.audit({ params: { bookId }, query: { limit } }))
}

// ── Integraciones ──────────────────────────────────────────────────────────────────────────────────────────────

export type PlatformIntegration = { modo: string; planes: string[] }

/** Integraciones que ofrece la plataforma (sin secretos), por tipo. */
export async function fetchPlatformIntegrations(): Promise<Record<string, PlatformIntegration>> {
  const { browserApi, unwrap } = await api()
  return Object.fromEntries(unwrap(await browserApi().me.platformIntegrations()).map((r) => [r.kind, r]))
}

export type IntegrationPub = { kind: string; enabled: boolean; config: Record<string, unknown>; meta: Record<string, unknown> }

/** Integraciones del hogar (con máscara, sin secretos), por tipo. */
export async function fetchHouseholdIntegrations(_householdId: string, bookId: string): Promise<Record<string, IntegrationPub>> {
  const { browserApi, unwrap } = await api()
  return Object.fromEntries(unwrap(await browserApi().integrations.list({ params: { bookId } })).items.map((r) => [r.kind, r as IntegrationPub]))
}

// ── Datos de referencia ────────────────────────────────────────────────────────────────────────────────────────

export type LatestRefs = { trm: { fecha: string; valor: number } | null; usura: { desde: string; hasta: string; tasa_ea: number } | null }

/** TRM y tasa de usura más recientes. */
export async function fetchLatestRefs(): Promise<LatestRefs> {
  const { browserApi, unwrap } = await api()
  const a = browserApi()
  const [t, u] = await Promise.all([a.refs.trm({ query: { limit: 1 } }), a.refs.usura({ query: { limit: 1 } })])
  const trm = unwrap(t)[0]
  const usura = unwrap(u)[0]
  return { trm: trm ? { fecha: trm.fecha, valor: trm.valor } : null, usura: usura ? { desde: usura.desde, hasta: usura.hasta, tasa_ea: usura.tasa_ea } : null }
}

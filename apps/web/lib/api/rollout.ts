import "server-only"
// Interruptores de la API leídos en el servidor de Next (v6 F2-H). Dos llaves, las dos tienen que estar encendidas:
//
// 1. Variables de entorno (por defecto apagado: sin ellas NO se lee nada de la base y la web es la de siempre):
//    MIRAI_API_URL (o NEXT_PUBLIC_API_URL)  origen de la API, p. ej. https://api-pruebas.mirai.engynex.com
//    MIRAI_API_ROLLOUT                      off (por defecto) | db | all | {"chat":"on",…}
//      off   todo como hoy, sin consultar la base
//      db    lee platform_settings.api_rollout (caché de 30 s por instancia) → qa / admins / pct:N / on por módulo
//      all   todos los módulos encendidos para todos (E2E `api-on` y local; se ignora en producción de Vercel)
//      {…}   un objeto literal con la misma forma de api_rollout (pruebas locales)
// 2. platform_settings.api_rollout (con MIRAI_API_ROLLOUT=db): por módulo, y `_off: true` apaga todo al instante.
//
// Apagado de emergencia: `update platform_settings set api_rollout = api_rollout || '{"_off":true}'` (≤ 30 s, sin
// desplegar) o MIRAI_API_ROLLOUT=off en Vercel + volver a desplegar. Procedimiento: docs/arquitectura/v6-f2h-encendido.md.
import type { SupabaseClient } from "@supabase/supabase-js"
import { resolveRollout, type RolloutWho } from "@mirai/contracts/rollout"
import { API_MODULE_NAMES, API_OFF, type ApiConfig, type ApiModule } from "./modules"
import { viaApi } from "./via"
import { serverAuthProvider } from "@/lib/auth/provider"

const TTL_MS = 30_000
let cache: { at: number; value: unknown } | null = null

/** Origen de la API sin la barra final ("" = no configurada). Se lee en cada llamada (no al compilar). */
export function apiUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = (env.MIRAI_API_URL || env.NEXT_PUBLIC_API_URL || "").trim()
  if (!raw) return ""
  try {
    const u = new URL(raw)
    return u.origin + u.pathname.replace(/\/+$/, "")
  } catch {
    return ""
  }
}

/** Todos los módulos en "on" (modo `all`). */
export const ALL_ON = Object.fromEntries(API_MODULE_NAMES.map((m) => [m, "on"]))

type Mode = { kind: "off" } | { kind: "db" } | { kind: "literal"; value: unknown }

/** Qué dice MIRAI_API_ROLLOUT. Cualquier cosa rara = apagado. */
export function rolloutMode(env: NodeJS.ProcessEnv = process.env): Mode {
  const v = (env.MIRAI_API_ROLLOUT ?? "").trim()
  if (!v || v === "off") return { kind: "off" }
  if (v === "db") return { kind: "db" }
  if (v === "all") return env.VERCEL_ENV === "production" ? { kind: "off" } : { kind: "literal", value: ALL_ON }
  if (v.startsWith("{")) {
    try {
      return { kind: "literal", value: JSON.parse(v) }
    } catch {
      return { kind: "off" }
    }
  }
  return { kind: "off" }
}

/** platform_settings.api_rollout con caché corta. Si la columna no existe (migración sin aplicar) o falla: {} (apagado). */
type SbSource = SupabaseClient | (() => Promise<SupabaseClient> | SupabaseClient)

async function readRollout(source: SbSource): Promise<unknown> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value
  let value: unknown = {}
  try {
    const sb = typeof source === "function" ? await source() : source
    const { data, error } = await sb.from("platform_settings").select("api_rollout").limit(1).maybeSingle()
    if (!error && data) value = (data as { api_rollout?: unknown }).api_rollout ?? {}
  } catch {
    value = {}
  }
  cache = { at: Date.now(), value }
  return value
}

/** Para las pruebas. */
export function resetRolloutCache() {
  cache = null
}

/**
 * Configuración de la API para esta persona: `{ url, flags }`. Con las variables apagadas devuelve API_OFF sin tocar la
 * red ni la base. `sb`: cliente de Supabase con el que se lee platform_settings (el de la persona o, sin sesión, el
 * administrador en los webhooks).
 */
export async function getApiConfig(who: RolloutWho, sb: SbSource, env: NodeJS.ProcessEnv = process.env): Promise<ApiConfig> {
  const url = apiUrl(env)
  // v7: con AUTH_PROVIDER=mirai no hay Supabase: todo por la API, sin leer platform_settings (igual que miraiApiConfig
  // de lib/dal.ts). Cubre las rutas sin persona: webhooks de pagos, portal del contador y precios.
  if (serverAuthProvider(env) === "mirai") {
    if (!url) throw new Error("AUTH_PROVIDER=mirai necesita MIRAI_API_URL (la API de Mirai).")
    return { url, flags: Object.fromEntries(API_MODULE_NAMES.map((m) => [m, true])) as ApiConfig["flags"] }
  }
  const mode = rolloutMode(env)
  if (!url || mode.kind === "off") return API_OFF
  const rollout = mode.kind === "db" ? await readRollout(sb) : mode.value
  return { url, flags: resolveRollout(rollout, who) }
}

/** Para rutas sin persona (webhooks, portal del contador): el módulo solo cuenta si está en "on". */
export async function globalApiOn(module: ApiModule, sb: SbSource, env: NodeJS.ProcessEnv = process.env): Promise<ApiConfig | null> {
  const cfg = await getApiConfig({}, sb, env)
  return viaApi(cfg, module) ? cfg : null
}

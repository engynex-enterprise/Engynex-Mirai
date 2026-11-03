import "server-only"
import { createHash } from "node:crypto"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { DEFAULT_CREDIT_USD, DEFAULT_CUPOS, type PriceTable } from "./pricing"
import { monthStartBogota, quotaState, type Quota } from "./credits"
import type { AiFeature } from "./features"

// Registro de uso de la IA, cupo de créditos y caché de respuestas (solo servidor, con la clave de servicio).

export type AiPlatformSettings = { creditUsd: number; cuposActivo: boolean; avisoPct: number; cacheHoras: number; precios: PriceTable }

let memo: { at: number; v: AiPlatformSettings } | null = null
/** Ajustes de IA de la plataforma (memoria de 60 s para no consultarlos en cada llamada). */
export async function aiPlatformSettings(): Promise<AiPlatformSettings> {
  if (memo && Date.now() - memo.at < 60_000) return memo.v
  const { data } = await supabaseAdmin().from("platform_settings").select("ia_credito_usd,ia_cupos_activo,ia_aviso_pct,ia_cache_horas,ia_precios").eq("id", true).maybeSingle()
  const v: AiPlatformSettings = {
    creditUsd: +(data?.ia_credito_usd ?? 0) || DEFAULT_CREDIT_USD, cuposActivo: data?.ia_cupos_activo ?? true, avisoPct: data?.ia_aviso_pct ?? 80,
    cacheHoras: data?.ia_cache_horas ?? 24, precios: (data?.ia_precios ?? {}) as PriceTable,
  }
  memo = { at: Date.now(), v }
  return v
}
export const resetAiSettingsMemo = () => { memo = null }

let trmMemo: { at: number; v: number | null } | null = null
/** Última TRM registrada (ref_trm), para pasar el costo a pesos. Memoria de 1 hora. */
export async function latestTrm(): Promise<number | null> {
  if (trmMemo && Date.now() - trmMemo.at < 3_600_000) return trmMemo.v
  const { data } = await supabaseAdmin().from("ref_trm").select("valor").order("fecha", { ascending: false }).limit(1).maybeSingle()
  trmMemo = { at: Date.now(), v: data ? +data.valor : null }
  return trmMemo.v
}

/** Cupo mensual del plan (plans.ia_creditos; null = sin límite). */
export async function planCupo(planId: string): Promise<number | null> {
  const { data } = await supabaseAdmin().from("plans").select("ia_creditos").eq("id", planId).maybeSingle()
  if (!data) return DEFAULT_CUPOS[planId] ?? null
  return data.ia_creditos
}

/** Créditos usados por el hogar este mes (Colombia) y estado del cupo. */
export async function householdQuota(householdId: string, planId: string): Promise<Quota> {
  const db = supabaseAdmin()
  const [{ data: used }, cupo, s] = await Promise.all([db.rpc("ai_creditos_desde", { h: householdId, desde: monthStartBogota() }), planCupo(planId), aiPlatformSettings()])
  return quotaState(+(used ?? 0), cupo, s.avisoPct)
}

export type UsageRow = {
  householdId: string; bookId?: string | null; userId?: string | null; plan?: string | null; feature: AiFeature; fuente: "ia" | "cache" | "algoritmo"
  provider?: string | null; model?: string | null; dePlataforma?: boolean; input?: number; output?: number; cached?: number; evitados?: number
  usd?: number; real?: boolean; creditos?: number; ms?: number; ok?: boolean; error?: string | null
}

/** Guarda una llamada en ai_usage. Nunca lanza: si falla el registro, la respuesta de la IA sigue igual. */
export async function logUsage(r: UsageRow) {
  try {
    const trm = r.usd ? await latestTrm() : null
    await supabaseAdmin().from("ai_usage").insert({
      household_id: r.householdId, book_id: r.bookId ?? null, user_id: r.userId ?? null, plan: r.plan ?? null, feature: r.feature, fuente: r.fuente,
      provider: r.provider ?? null, model: r.model ?? null, de_plataforma: !!r.dePlataforma, input_tokens: Math.round(r.input ?? 0), output_tokens: Math.round(r.output ?? 0),
      cached_tokens: Math.round(r.cached ?? 0), tokens_evitados: Math.round(r.evitados ?? 0), costo_usd: r.usd ?? 0, costo_cop: trm && r.usd ? Math.round(r.usd * trm * 100) / 100 : null,
      costo_real: !!r.real, creditos: r.creditos ?? 0, duracion_ms: Math.round(r.ms ?? 0), ok: r.ok ?? true, error: r.error ? r.error.slice(0, 300) : null,
    })
  } catch { /* el registro nunca rompe la respuesta */ }
}

// ── Caché de respuestas idénticas ──

/** Clave de caché: hash de la función, el hogar y la entrada completa (prompt, system e imágenes). */
export function cacheKey(feature: string, householdId: string, material: unknown) {
  return createHash("sha256").update(`${feature}|${householdId}|${JSON.stringify(material)}`).digest("hex")
}

export async function cacheGet<T>(key: string): Promise<{ result: T; tokens: number } | null> {
  try {
    const db = supabaseAdmin()
    const { data } = await db.from("ai_cache").select("result,tokens,hits,expires_at").eq("key", key).maybeSingle()
    if (!data || new Date(data.expires_at).getTime() < Date.now()) return null
    await db.from("ai_cache").update({ hits: data.hits + 1 }).eq("key", key)
    return { result: data.result as T, tokens: data.tokens }
  } catch { return null }
}

export async function cacheSet(key: string, r: { householdId: string; feature: string; result: unknown; tokens: number; ttlHours: number }) {
  if (r.ttlHours <= 0) return
  try {
    const db = supabaseAdmin()
    await db.from("ai_cache").upsert({ key, household_id: r.householdId, feature: r.feature, result: r.result as never, tokens: r.tokens, hits: 0, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + r.ttlHours * 3_600_000).toISOString() })
    // Limpieza ocasional de lo vencido (1 de cada 50 escrituras).
    if (Math.random() < 0.02) await db.from("ai_cache").delete().lt("expires_at", new Date().toISOString())
  } catch { /* sin caché no pasa nada */ }
}

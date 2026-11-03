import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { decrypt } from "@/lib/crypto"
import { integrationByKind, isAdminOnly } from "@/lib/integrations/registry"
import { resolveIntegration, resolvePlatformOnly, type GlobalMode } from "@/lib/integrations/resolve"

export type IntegrationValue = { kind: string; enabled: boolean; config: Record<string, unknown>; secrets: Record<string, string>; source?: "hogar" | "plataforma" }

const secretsOf = (enc: string | null | undefined) => { if (!enc) return {}; try { return JSON.parse(decrypt(enc)) as Record<string, string> } catch { return {} } }

/** Integración global de la plataforma (consola › Integraciones), con secretos descifrados. */
export async function getGlobalIntegration(kind: string) {
  const { data } = await supabaseAdmin().from("platform_integrations").select("*").eq("kind", kind).maybeSingle()
  return data ? { modo: data.modo as GlobalMode, planes: data.planes ?? [], config: (data.config ?? {}) as Record<string, unknown>, secrets: secretsOf(data.secrets_enc) } : null
}

/** Solo la configuración propia del hogar (para guardarla sin mezclar los secretos de la plataforma). */
export async function getOwnIntegration(householdId: string, kind: string) {
  const { data } = await supabaseAdmin().from("integrations").select("*").eq("household_id", householdId).eq("kind", kind).maybeSingle()
  return data ? { enabled: data.enabled, config: (data.config ?? {}) as Record<string, unknown>, secrets: secretsOf(data.secrets_enc) } : null
}

/**
 * Integración efectiva de un hogar (solo servidor).
 * - IA: combina la del hogar con la global de la plataforma: obligatoria → siempre la de la plataforma · por defecto → la
 *   de la plataforma salvo que el hogar la apague o use la suya · opcional → la del hogar, o la de la plataforma si el
 *   hogar eligió usarla. Las globales solo aplican a los planes elegidos.
 * - Todo lo demás (correo, WhatsApp, Telegram, push, datos, Google, infraestructura) lo decide solo el administrador:
 *   la fila del hogar se ignora (no se borra) y se usa la global, la variable de entorno o el servicio sin claves.
 */
export async function getIntegration(householdId: string, kind: string): Promise<IntegrationValue | null> {
  const db = supabaseAdmin()
  const def = integrationByKind(kind)
  const envReady = !!(def?.env && process.env[def.env])
  if (isAdminOnly(def)) {
    const [global, { data: plan }] = await Promise.all([getGlobalIntegration(kind), db.rpc("household_plan", { h: householdId })])
    const r = resolvePlatformOnly({ global, plan: plan ?? "gratis", envReady, keyless: !!def && !def.env && !def.fields.some((f) => f.required) })
    if (!r) return null
    return { kind, enabled: true, config: global?.config ?? {}, secrets: global?.secrets ?? {}, source: "plataforma" }
  }
  const [{ data }, global, { data: plan }] = await Promise.all([
    db.from("integrations").select("*").eq("household_id", householdId).eq("kind", kind).maybeSingle(),
    getGlobalIntegration(kind),
    db.rpc("household_plan", { h: householdId }),
  ])
  const own = data ? { enabled: data.enabled, config: (data.config ?? {}) as Record<string, unknown>, secrets: secretsOf(data.secrets_enc) } : null
  const r = resolveIntegration({ own, global, plan: plan ?? "gratis", envReady })
  if (!r) return null
  if (r.source === "plataforma") return { kind, enabled: true, config: global?.config ?? {}, secrets: global?.secrets ?? {}, source: "plataforma" }
  if (r.source === "env") return { kind, enabled: true, config: own?.config ?? {}, secrets: own?.secrets ?? {}, source: "plataforma" }
  return { kind, enabled: own!.enabled, config: own!.config, secrets: own!.secrets, source: "hogar" }
}

/** Todas las integraciones activas de un hogar de una categoría (en el orden configurado). */
export async function enabledOf(householdId: string, kinds: string[]): Promise<IntegrationValue[]> {
  const out: IntegrationValue[] = []
  for (const k of kinds) { const v = await getIntegration(householdId, k); if (v?.enabled) out.push(v) }
  return out
}

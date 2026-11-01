import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { decrypt } from "@/lib/crypto"
import { integrationByKind } from "@/lib/integrations/registry"
import { resolveIntegration, type GlobalMode } from "@/lib/integrations/resolve"

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
 * Integración efectiva de un hogar (solo servidor), combinando la del hogar con la global de la plataforma:
 * obligatoria → siempre la de la plataforma · por defecto → la de la plataforma salvo que el hogar la apague o use la suya ·
 * opcional → la del hogar, o la de la plataforma si el hogar eligió usarla. Las globales solo aplican a los planes elegidos.
 */
export async function getIntegration(householdId: string, kind: string): Promise<IntegrationValue | null> {
  const db = supabaseAdmin()
  const [{ data }, global, { data: plan }] = await Promise.all([
    db.from("integrations").select("*").eq("household_id", householdId).eq("kind", kind).maybeSingle(),
    getGlobalIntegration(kind),
    db.rpc("household_plan", { h: householdId }),
  ])
  const def = integrationByKind(kind)
  const own = data ? { enabled: data.enabled, config: (data.config ?? {}) as Record<string, unknown>, secrets: secretsOf(data.secrets_enc) } : null
  const r = resolveIntegration({ own, global, plan: plan ?? "gratis", envReady: !!(def?.env && process.env[def.env]) })
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

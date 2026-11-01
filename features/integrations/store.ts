import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { decrypt } from "@/lib/crypto"
import { integrationByKind } from "@/lib/integrations/registry"

export type IntegrationValue = { kind: string; enabled: boolean; config: Record<string, unknown>; secrets: Record<string, string> }

/** Lee una integración con sus secretos descifrados (solo servidor). */
export async function getIntegration(householdId: string, kind: string): Promise<IntegrationValue | null> {
  const { data } = await supabaseAdmin().from("integrations").select("*").eq("household_id", householdId).eq("kind", kind).maybeSingle()
  const def = integrationByKind(kind)
  // Integraciones del despliegue habilitadas por variable de entorno (p. ej. AI_GATEWAY_API_KEY)
  if (!data && def?.env && process.env[def.env]) return { kind, enabled: true, config: {}, secrets: {} }
  if (!data) return null
  let secrets: Record<string, string> = {}
  if (data.secrets_enc) { try { secrets = JSON.parse(decrypt(data.secrets_enc)) } catch { secrets = {} } }
  return { kind, enabled: data.enabled, config: (data.config ?? {}) as Record<string, unknown>, secrets }
}

/** Todas las integraciones activas de un hogar de una categoría (en el orden configurado). */
export async function enabledOf(householdId: string, kinds: string[]): Promise<IntegrationValue[]> {
  const out: IntegrationValue[] = []
  for (const k of kinds) { const v = await getIntegration(householdId, k); if (v?.enabled) out.push(v) }
  return out
}

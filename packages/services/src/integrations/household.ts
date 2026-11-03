// Integraciones del hogar (hoy solo la IA: Ajustes › Inteligencia artificial). Movido de
// apps/web/features/integrations/actions.ts (F2-E-1): la web (Server Actions) y la API (/v1/books/:b/integrations/**)
// lo llaman con el rol ya revisado (admin). Los secretos se cifran con @mirai/crypto y el navegador solo ve la máscara.
import { mask } from "@mirai/crypto"
import { USE_PLATFORM } from "@mirai/domain/integrations/resolve"
import { rt, ServiceError } from "../runtime"
import { integrationByKind, isAdminOnly } from "./registry"
import { getGlobalIntegration, getOwnIntegration } from "./store"

/** Los hogares solo configuran la IA; el resto lo administra Mirai en la consola. */
export const ADMIN_MSG = "Esta integración la administra Mirai. Los avisos se eligen en Ajustes › Alertas."

export type IntegrationValues = Record<string, string | number | boolean>

/** Guarda la configuración (los secretos vacíos conservan los guardados) y la activa. */
export async function saveHouseholdIntegration(o: { householdId: string; userId: string; kind: string; values: IntegrationValues; enabled?: boolean }) {
  const enabled = o.enabled ?? true
  const def = integrationByKind(o.kind)
  if (!def) throw new ServiceError("Integración desconocida", "NOT_FOUND")
  if (isAdminOnly(def)) throw new ServiceError(ADMIN_MSG, "ROLE_DENIED")
  const prev = await getOwnIntegration(o.householdId, o.kind)
  const config: Record<string, unknown> = {}
  const secrets: Record<string, string> = { ...(prev?.secrets ?? {}) }
  const meta: Record<string, string> = {}
  for (const f of def.fields) {
    const v = o.values[f.k]
    if (f.type === "secret") {
      if (typeof v === "string" && v.trim()) secrets[f.k] = v.trim()
      if (secrets[f.k]) meta[f.k] = mask(secrets[f.k])
    } else config[f.k] = v ?? f.def ?? ""
  }
  const missing = def.fields.filter((f) => (f.required || (def.scope === "platform" && f.k === "apiKey")) && !(f.type === "secret" ? secrets[f.k] : config[f.k]))
  if (enabled && missing.length) throw new ServiceError(`Falta: ${missing.map((f) => f.l).join(", ")}`)
  const { error } = await rt().admin().from("integrations").upsert({
    household_id: o.householdId, kind: o.kind, enabled, config: config as never, meta: meta as never,
    secrets_enc: Object.keys(secrets).length ? rt().encrypt(JSON.stringify(secrets)) : null, updated_by: o.userId,
  }, { onConflict: "household_id,kind" })
  if (error) throw new Error(error.message)
}

/** Prende o apaga. Sin datos propios, prender = usar la de la plataforma (si la ofrece al plan del hogar). */
export async function toggleHouseholdIntegration(o: { householdId: string; userId: string; planId: string; kind: string; enabled: boolean }) {
  const def = integrationByKind(o.kind)
  if (isAdminOnly(def)) throw new ServiceError(ADMIN_MSG, "ROLE_DENIED")
  const own = await getOwnIntegration(o.householdId, o.kind)
  const global = await getGlobalIntegration(o.kind)
  const offered = !!global && global.modo !== "apagada" && (!global.planes.length || global.planes.includes(o.planId))
  if (global?.modo === "obligatoria" && offered) throw new ServiceError("Mirai administra esta integración para todos: no se puede apagar.", "CONFLICT")
  const useGlobal = o.enabled && offered && !Object.keys(own?.secrets ?? {}).length
  if (o.enabled && !useGlobal && def?.fields.some((f) => f.required) && !own) throw new ServiceError("Primero completa sus datos")
  const { error } = await rt().admin().from("integrations").upsert({ household_id: o.householdId, kind: o.kind, enabled: o.enabled, updated_by: o.userId, ...(useGlobal ? { config: { ...(own?.config ?? {}), [USE_PLATFORM]: true } as never } : {}) }, { onConflict: "household_id,kind" })
  if (error) throw new Error(error.message)
}

export async function deleteHouseholdIntegration(o: { householdId: string; kind: string }) {
  if (isAdminOnly(o.kind)) throw new ServiceError(ADMIN_MSG, "ROLE_DENIED")
  await rt().admin().from("integrations").delete().eq("household_id", o.householdId).eq("kind", o.kind)
}

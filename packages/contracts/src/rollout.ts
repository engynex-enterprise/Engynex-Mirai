// Interruptores de la migración a la API (§4.1, F2-B-8): platform_settings.api_rollout (jsonb, migración aditiva
// 20261103003801_api_rollout.sql). Por módulo: "off" (todo como hoy), "qa" (solo las personas de `_users`) o "on".
// Lo lee el front (apps/web/lib/api/rollout.ts, F2-H) para decidir si llama a la API o a lo de siempre.
import { z } from "zod"

export const RolloutMode = z.enum(["off", "qa", "on"])
export type RolloutMode = z.infer<typeof RolloutMode>

export const ApiRollout = z
  .object({
    /** Personas (UUID) que ven los módulos en "qa" (p. ej. el usuario QA de las E2E). */
    _users: z.array(z.string()).default([]),
  })
  .catchall(RolloutMode)
export type ApiRollout = z.infer<typeof ApiRollout>

/** ¿Este módulo va por la API para esta persona? (vacío o desconocido = "off": nada cambia). */
export function viaApi(rollout: unknown, module: string, userId: string | null | undefined): boolean {
  const r = ApiRollout.safeParse(rollout ?? {})
  if (!r.success) return false
  const mode = (r.data as Record<string, unknown>)[module]
  if (mode === "on") return true
  return mode === "qa" && !!userId && r.data._users.includes(userId)
}

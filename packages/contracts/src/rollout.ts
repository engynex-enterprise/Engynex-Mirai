// Interruptores de la migración a la API (§4.1, F2-B-8 y F2-H): platform_settings.api_rollout (jsonb, migración aditiva
// 20261103003801_api_rollout.sql). Por módulo (o `módulo:detalle`, p. ej. "book-tables:expenses", que gana sobre el
// módulo):
//   "off"     todo como hoy (también un valor vacío, desconocido o mal escrito)
//   "qa"      solo las personas de `_users` (p. ej. el usuario QA de las E2E)
//   "admins"  solo los administradores de la plataforma
//   "pct:N"   el N % de las personas (0–100), siempre las mismas: hash estable de (módulo, persona)
//   "on"      todas
// `_off: true` apaga todo al instante (apagado de emergencia sin desplegar).
// Lo lee el servidor de la web (apps/web/lib/api/rollout.ts, F2-H) para decidir si llama a la API o a lo de siempre.
import { z } from "zod"

export const ROLLOUT_FIXED = ["off", "qa", "admins", "on"] as const
export type RolloutMode = (typeof ROLLOUT_FIXED)[number] | `pct:${number}`
export const RolloutMode = z.union([
  z.enum(ROLLOUT_FIXED),
  z.string().regex(/^pct:(100|[1-9]?\d)$/, "Usa pct:0 … pct:100") as unknown as z.ZodType<`pct:${number}`>,
])

export const ApiRollout = z
  .object({
    /** Personas (UUID) que ven los módulos en "qa" (p. ej. el usuario QA de las E2E). */
    _users: z.array(z.string()).default([]),
    /** Apagado de emergencia: todo "off" sin importar el resto. */
    _off: z.boolean().optional(),
  })
  .catchall(RolloutMode)
export type ApiRollout = z.infer<typeof ApiRollout>

/** Quién pregunta (el modo "admins" necesita saber si es administrador de la plataforma). */
export type RolloutWho = { userId?: string | null; isAdmin?: boolean }

/** Cubeta 0–99 estable para (módulo, persona): FNV-1a de 32 bits. La misma persona cae siempre en la misma. */
export function rolloutBucket(module: string, userId: string): number {
  let h = 0x811c9dc5
  const s = `${module}:${userId}`
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h % 100
}

/** Lee el objeto sin romperse: claves con valores inválidos quedan "off" (no tumban las demás). */
function parse(rollout: unknown): { users: string[]; off: boolean; modes: Record<string, RolloutMode> } {
  const o = rollout && typeof rollout === "object" && !Array.isArray(rollout) ? (rollout as Record<string, unknown>) : {}
  const users = Array.isArray(o._users) ? o._users.filter((u): u is string => typeof u === "string") : []
  const modes: Record<string, RolloutMode> = {}
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith("_")) continue
    const m = RolloutMode.safeParse(v)
    if (m.success) modes[k] = m.data
  }
  return { users, off: o._off === true, modes }
}

/** ¿Este modo enciende el módulo para esta persona? */
export function modeOn(mode: RolloutMode | undefined, module: string, who: RolloutWho, users: readonly string[] = []): boolean {
  if (!mode || mode === "off") return false
  if (mode === "on") return true
  if (mode === "qa") return !!who.userId && users.includes(who.userId)
  if (mode === "admins") return who.isAdmin === true
  const pct = Number(mode.slice(4))
  return !!who.userId && pct > 0 && rolloutBucket(module, who.userId) < pct
}

/**
 * Resuelve todo el objeto para una persona: `{ módulo: true|false }` por cada clave escrita (incluidas las de detalle,
 * `book-tables:expenses`). Lo que no aparece es "off". Es lo que el servidor de la web le pasa al navegador.
 */
export function resolveRollout(rollout: unknown, who: RolloutWho): Record<string, boolean> {
  const { users, off, modes } = parse(rollout)
  const out: Record<string, boolean> = {}
  if (off) return out
  for (const [k, m] of Object.entries(modes)) out[k] = modeOn(m, k.split(":")[0], who, users)
  return out
}

/** Consulta un mapa ya resuelto: gana la clave de detalle (`módulo:detalle`) si existe; si no, la del módulo. */
export function flagOn(flags: Readonly<Record<string, boolean>> | null | undefined, module: string, detail?: string): boolean {
  if (!flags) return false
  if (detail !== undefined) {
    const d = flags[`${module}:${detail}`]
    if (d !== undefined) return d
  }
  return flags[module] === true
}

/** ¿Este módulo va por la API para esta persona? (vacío o desconocido = "off": nada cambia). */
export function viaApi(rollout: unknown, module: string, userId: string | null | undefined, opts: { isAdmin?: boolean; detail?: string } = {}): boolean {
  return flagOn(resolveRollout(rollout, { userId, isAdmin: opts.isAdmin }), module, opts.detail)
}

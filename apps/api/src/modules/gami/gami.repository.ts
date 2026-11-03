// Puerto de gami (logros y referidos). Mismas consultas que useGamiState (apps/web/features/gami/use-gami.ts) y
// misReferidos (apps/web/features/referidos/actions.ts).
import type { ChallengeIn } from "@mirai/domain/challenges"
import type { DbScope, SystemScope } from "../../core/db/scope"

/** Estado guardado de logros del libro para una persona (useGamiState, sin calcular). */
export type GamiState = {
  on: boolean
  visitas: string[]
  unl: Record<string, string>
  /** Misiones cumplidas por semana (las últimas 12 semanas). */
  mis: Record<string, string[]>
  maxLevel: number
  init: string | null
  chats: number
  consejos: number
  retos: ChallengeIn[]
  fondo: { on: boolean; saldo: number } | null
  nombre: string
}

export type ReferidosRows = {
  codigo: string | null
  invitados: { id: string; referred: string; estado: string; created_at: string }[]
  nombres: Record<string, string>
  cfg: { referidos_activo: boolean | null; referidos_plan: string | null; referidos_dias: number | null } | null
  plan: string | null
}

export abstract class GamiRepo {
  abstract state(scope: DbScope, q: { bookId: string; userId: string }): Promise<GamiState>
  /** Referidos con la clave del sistema (nombres de otras personas y ajustes de la plataforma, como la web). */
  abstract referidos(scope: SystemScope, userId: string): Promise<ReferidosRows>
  /** Crea el código de la persona; false si ya existía ese código (colisión) y hay que probar otro. */
  abstract crearCodigo(scope: SystemScope, userId: string, codigo: string): Promise<boolean>
}

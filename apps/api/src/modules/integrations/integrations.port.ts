// Puerto de integraciones del hogar (§2.1). El servicio no conoce Supabase ni el cifrado: el adaptador usa
// @mirai/services (el mismo código que la web) y la vista integrations_public con el JWT de la persona (RLS).
import type { IntegrationPublic } from "@mirai/contracts/modules/integrations"
import type { IntegrationValues } from "@mirai/services/integrations/household"
import type { DbScope } from "../../core/db/scope"

export abstract class IntegrationsPort {
  /** Filas públicas (sin secretos) del hogar, con el alcance de la persona. */
  abstract listPublic(scope: DbScope, householdId: string): Promise<IntegrationPublic[]>
  abstract save(o: { householdId: string; userId: string; kind: string; values: IntegrationValues; enabled?: boolean }): Promise<void>
  abstract toggle(o: { householdId: string; userId: string; planId: string; kind: string; enabled: boolean }): Promise<void>
  abstract remove(o: { householdId: string; kind: string }): Promise<void>
}

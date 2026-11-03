// Adaptador de IntegrationsPort: escrituras con @mirai/services (SystemScope + @mirai/crypto, como la web) y lectura de
// integrations_public con el JWT de la persona (la RLS filtra por hogar). Con DB_ADAPTER=pg (fase 4) la lectura pasa a
// Kysely; las escrituras siguen en el paquete compartido.
import { Injectable } from "@nestjs/common"
import type { IntegrationPublic } from "@mirai/contracts/modules/integrations"
import { deleteHouseholdIntegration, saveHouseholdIntegration, toggleHouseholdIntegration } from "@mirai/services/integrations/household"
import type { DbScope } from "../../../core/db/scope"
import { DomainError } from "../../../core/errors/domain-error"
import { SupabaseJsFactory } from "../../../core/db/supabase-js.factory"
import { IntegrationsPort } from "../integrations.port"

@Injectable()
export class ServicesIntegrations extends IntegrationsPort {
  constructor(private readonly sb: SupabaseJsFactory) {
    super()
  }

  async listPublic(scope: DbScope, householdId: string): Promise<IntegrationPublic[]> {
    const { data, error } = await this.sb.for(scope).from("integrations_public").select("kind,enabled,config,meta,updated_at").eq("household_id", householdId).order("kind")
    if (error) throw DomainError.fromPg(error)
    return (data ?? []).map((r) => ({ kind: r.kind, enabled: !!r.enabled, config: (r.config ?? {}) as Record<string, unknown>, meta: (r.meta ?? {}) as Record<string, unknown>, updated_at: r.updated_at ?? null }))
  }
  save(o: Parameters<IntegrationsPort["save"]>[0]) {
    return saveHouseholdIntegration(o)
  }
  toggle(o: Parameters<IntegrationsPort["toggle"]>[0]) {
    return toggleHouseholdIntegration(o)
  }
  remove(o: Parameters<IntegrationsPort["remove"]>[0]) {
    return deleteHouseholdIntegration(o)
  }
}

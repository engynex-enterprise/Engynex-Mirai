// Misma lectura que apps/web/lib/dal.ts (loadContextRpc + loadContextQueries + planOf), con el JWT de la persona.
import { Injectable } from "@nestjs/common"
import type { CtxHousehold, PlanRow, RawAppContext } from "@mirai/domain/app-context"
import type { UserScope } from "../../db/scope"
import { SupabaseJsFactory } from "../../db/supabase-js.factory"
import { DomainError } from "../../errors/domain-error"
import { AppContextRepo } from "../app-context.repo"

@Injectable()
export class SupabaseJsAppContextRepo extends AppContextRepo {
  constructor(private readonly sb: SupabaseJsFactory) {
    super()
  }

  async load(scope: UserScope): Promise<RawAppContext> {
    const sb = this.sb.for(scope)
    const { data, error } = await sb.rpc("mirai_app_context")
    if (!error && data) return data as unknown as RawAppContext
    if (error && !/mirai_app_context|PGRST202|42883/.test(`${error.code} ${error.message}`)) throw DomainError.fromPg(error)
    return this.loadQueries(scope)
  }

  /** Respaldo si la función aún no existe en la base (igual que loadContextQueries). */
  private async loadQueries(scope: UserScope): Promise<RawAppContext> {
    const sb = this.sb.for(scope)
    const uid = scope.userId
    const [p, m, a] = await Promise.all([
      sb.from("profiles").select("id,email,nombre,avatar_url,apodo,nacimiento,last_book_id").eq("id", uid).maybeSingle(),
      sb.from("household_members").select("role, access_role, households(id,nombre)").eq("user_id", uid),
      sb.from("platform_admins").select("user_id").eq("user_id", uid).maybeSingle(),
    ])
    for (const r of [p, m, a]) if (r.error) throw DomainError.fromPg(r.error)
    const households: CtxHousehold[] = (m.data ?? [])
      .filter((x) => x.households)
      .map((x) => ({ id: x.households!.id, nombre: x.households!.nombre, role: x.role, access_role: x.access_role }))
    let books: RawAppContext["books"] = []
    if (households.length) {
      const b = await sb.from("books").select("id,nombre,tipo,icon,household_id,is_default").in("household_id", households.map((h) => h.id)).is("deleted_at", null).order("created_at")
      if (b.error) throw DomainError.fromPg(b.error)
      books = b.data ?? []
    }
    return { profile: p.data, admin: !!a.data, households, books }
  }

  async planOf(scope: UserScope, householdId: string): Promise<PlanRow> {
    const sb = this.sb.for(scope)
    const { data: planId } = await sb.rpc("household_plan", { h: householdId })
    const { data, error } = await sb.from("plans").select("id,nombre,funciones,anuncios,limites,precio_mes").eq("id", planId ?? "gratis").maybeSingle()
    if (error) throw DomainError.fromPg(error)
    return data
  }
}

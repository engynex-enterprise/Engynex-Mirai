// Puerto: lo que la base sabe de la persona (perfil, hogares con rol y plan, libros, admin). Lo usan GET /v1/me y
// BookGuard. Adaptadores: SupabaseJsAppContextRepo (hoy) y, en la fase 4, uno con PgKysely.
import type { PlanRow, RawAppContext } from "@mirai/domain/app-context"
import type { UserScope } from "../db/scope"

export abstract class AppContextRepo {
  /** Un solo viaje: función mirai_app_context() con la RLS de la persona (respaldo: consultas sueltas). */
  abstract load(scope: UserScope): Promise<RawAppContext>
  /** Plan del hogar (solo si `load` no lo trajo). */
  abstract planOf(scope: UserScope, householdId: string): Promise<PlanRow>
}

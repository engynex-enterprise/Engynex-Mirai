// Quién llama a los casos de uso de la IA y el chat. La web pasa su AppContext (lib/dal.ts) tal cual; la API lo arma con
// lo que dejó BookGuard (libro de la ruta, hogar, rol fino y plan) y la persona del token. Solo los campos que se usan.
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@mirai/db"
import type { AccessRole } from "@mirai/domain/household/roles"
import type { PlanInfo } from "@mirai/domain/plans"

/** Cliente de Supabase de la persona (RLS): la web usa supabaseServer(), la API el UserScope. */
export type Sb = SupabaseClient<Database>

export type AiCtx = {
  user: { id: string; nombre?: string | null; apodo?: string | null }
  household: { id: string; access: AccessRole }
  book: { id: string }
  plan: PlanInfo
}

/** Quién, para aiText/aiObject y el registro en ai_usage. */
export const whoOf = (ctx: Pick<AiCtx, "household" | "book" | "user">) => ({ householdId: ctx.household.id, bookId: ctx.book.id, userId: ctx.user.id })

// Plan vigente de un hogar desde el servidor (clave secreta). Movido de apps/web/lib/plan-server.ts.
import { can, toPlanInfo, type PlanInfo, type PremiumFeature } from "@mirai/domain/plans"
import { rt } from "./runtime"

const supabaseAdmin = () => rt().admin()

/** Plan vigente de un hogar (servidor, con la clave de servicio). */
export async function planOf(householdId: string): Promise<PlanInfo> {
  const db = supabaseAdmin()
  const { data: id } = await db.rpc("household_plan", { h: householdId })
  const { data } = await db.from("plans").select("id,nombre,funciones,anuncios,limites,precio_mes").eq("id", id ?? "gratis").maybeSingle()
  return toPlanInfo(data)
}

export async function householdCan(householdId: string, f: PremiumFeature) {
  return can(await planOf(householdId), f)
}

/** ¿El plan del hogar dueño del libro incluye la función? (portal del contador y procesos sin sesión). */
export async function bookCan(bookId: string, f: PremiumFeature) {
  const { data } = await supabaseAdmin().from("books").select("household_id").eq("id", bookId).maybeSingle()
  return !!data && (await householdCan(data.household_id, f))
}

import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { can, toPlanInfo, type PlanInfo, type PremiumFeature } from "@/lib/plans"

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

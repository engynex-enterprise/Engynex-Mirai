import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { notifyOwners } from "./apply"

const DAY = 86_400_000

/**
 * Avisos del plan (una vez al día): Premium que vence en 5 días sin renovación automática (Wompi o cortesía)
 * y Premium que terminó ayer. Las suscripciones con tarjeta se renuevan solas y no se avisan.
 */
export async function planReminders(now = new Date()) {
  const db = supabaseAdmin()
  const iso = (d: number) => new Date(now.getTime() + d * DAY).toISOString()
  const [{ data: soon }, { data: ended }] = await Promise.all([
    db.from("plan_subscriptions").select("id,household_id,vence_at,proveedor,estado").in("estado", ["activa", "cortesia", "cancelada"]).gte("vence_at", iso(4)).lt("vence_at", iso(5)),
    db.from("plan_subscriptions").select("id,household_id,vence_at,proveedor,estado").in("estado", ["activa", "cortesia", "cancelada"]).gte("vence_at", iso(-1)).lt("vence_at", iso(0)),
  ])
  let n = 0
  for (const s of soon ?? []) {
    if (s.proveedor === "mercadopago" && s.estado === "activa") continue
    await notifyOwners(s.household_id, "Tu Premium vence en 5 días", "Para no perder la IA, la automatización con tu banco y los impuestos, renuévalo en Ajustes › Mi plan.", `plan-soon-${s.id}-${s.vence_at!.slice(0, 10)}`)
    n++
  }
  for (const s of ended ?? []) {
    if (s.proveedor === "mercadopago" && s.estado === "activa") continue
    // Si el hogar tiene otra suscripción vigente (por ejemplo pagó otra vez), no se avisa.
    const { data: other } = await db.from("plan_subscriptions").select("id").eq("household_id", s.household_id).neq("id", s.id).in("estado", ["activa", "cortesia", "cancelada"]).gt("vence_at", now.toISOString()).limit(1)
    if (other?.length) continue
    await notifyOwners(s.household_id, "Tu Premium terminó", "Tu hogar volvió al plan Gratis. No se borró nada: vuelve a Premium cuando quieras desde Planes.", `plan-end-${s.id}-${s.vence_at!.slice(0, 10)}`)
    n++
  }
  return n
}

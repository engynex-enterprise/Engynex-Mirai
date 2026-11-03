import "server-only"
import { randomInt } from "node:crypto"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { MAX_RECOMPENSAS, nuevoCodigo as codigoCon } from "@mirai/domain/referidos"

// Programa de referidos: código por persona y recompensa (cortesía del plan configurado) para quien invita y quien llega.
// Las reglas puras (alfabeto, tope, validación) viven en @mirai/domain/referidos (las comparte la API).

export { MAX_RECOMPENSAS }

export function nuevoCodigo(n = 8) {
  return codigoCon(n, randomInt)
}

/** Código de la persona (lo crea la primera vez). */
export async function codigoDe(userId: string) {
  const db = supabaseAdmin()
  const { data } = await db.from("referral_codes").select("codigo").eq("user_id", userId).maybeSingle()
  if (data) return data.codigo
  for (let i = 0; i < 5; i++) {
    const codigo = nuevoCodigo()
    const { error } = await db.from("referral_codes").insert({ user_id: userId, codigo })
    if (!error) return codigo
  }
  throw new Error("No pudimos crear tu código. Intenta de nuevo.")
}

async function hogarPropio(userId: string) {
  const { data } = await supabaseAdmin().from("household_members").select("household_id").eq("user_id", userId).eq("role", "owner").limit(1).maybeSingle()
  return data?.household_id ?? null
}

/**
 * Registra que `referred` llegó con `codigo` y, si aplica, da la recompensa a los dos hogares.
 * Se llama al crear el hogar en la bienvenida. Idempotente (una persona solo puede ser referida una vez).
 */
export async function reclamarReferido(referred: string, codigo: string | null | undefined) {
  const c = codigo?.trim().toUpperCase()
  if (!c || !/^[A-Z0-9]{6,12}$/.test(c)) return
  const db = supabaseAdmin()
  const [{ data: dueno }, { data: cfg }, { data: ya }] = await Promise.all([
    db.from("referral_codes").select("user_id").eq("codigo", c).maybeSingle(),
    db.from("platform_settings").select("referidos_activo,referidos_plan,referidos_dias").single(),
    db.from("referrals").select("id").eq("referred", referred).maybeSingle(),
  ])
  if (!dueno || dueno.user_id === referred || ya) return
  const { data: ref, error } = await db.from("referrals").insert({ referrer: dueno.user_id, referred, codigo: c }).select("id").single()
  if (error || !ref) return
  const { count } = await db.from("referrals").select("id", { count: "exact", head: true }).eq("referrer", dueno.user_id).eq("estado", "recompensado")
  const [hA, hB] = await Promise.all([hogarPropio(dueno.user_id), hogarPropio(referred)])
  if (!cfg?.referidos_activo || !hA || !hB || (count ?? 0) >= MAX_RECOMPENSAS) { await db.from("referrals").update({ estado: "sin_recompensa" }).eq("id", ref.id); return }
  const dias = cfg.referidos_dias ?? 30
  const { data: plan } = await db.from("plans").select("id,nombre").eq("id", cfg.referidos_plan ?? "premium").maybeSingle()
  if (!plan) return
  for (const [h, uid, quien] of [[hA, dueno.user_id, "por invitar a alguien"], [hB, referred, "por llegar con una invitación"]] as const) {
    // Si el hogar ya tiene una cortesía vigente, se suman los días.
    const { data: prev } = await db.from("plan_subscriptions").select("id,vence_at").eq("household_id", h).eq("estado", "cortesia").eq("plan", plan.id).gt("vence_at", new Date().toISOString()).order("vence_at", { ascending: false }).limit(1).maybeSingle()
    const base = prev?.vence_at ? new Date(prev.vence_at) : new Date()
    const vence = new Date(base.getTime() + dias * 86_400_000).toISOString()
    if (prev) await db.from("plan_subscriptions").update({ vence_at: vence }).eq("id", prev.id)
    else await db.from("plan_subscriptions").insert({ household_id: h, plan: plan.id, proveedor: "manual", estado: "cortesia", periodo: "mes", vence_at: vence, nota: "Referido" })
    await db.from("notifications").insert({ user_id: uid, kind: "plan", titulo: `¡Ganaste ${dias} días de Mirai ${plan.nombre}!`, cuerpo: `Te lo regalamos ${quien}. Disfrútalo.`, href: "/referidos", dedupe: `ref-${ref.id}-${uid}` })
  }
  await db.from("referrals").update({ estado: "recompensado", rewarded_at: new Date().toISOString() }).eq("id", ref.id)
}

"use server"

import { getAppContext } from "@/lib/dal"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { siteUrl } from "@/lib/site-url"
import { MAX_RECOMPENSAS, codigoDe } from "@/lib/referidos"

/** Tu código, el enlace para compartir y a quiénes has invitado (solo el primer nombre, por privacidad). */
export async function misReferidos() {
  const ctx = await getAppContext()
  const db = supabaseAdmin()
  const codigo = await codigoDe(ctx.user.id)
  const [{ data: refs }, { data: cfg }] = await Promise.all([
    db.from("referrals").select("id,referred,estado,created_at,rewarded_at").eq("referrer", ctx.user.id).order("created_at", { ascending: false }),
    db.from("platform_settings").select("referidos_activo,referidos_plan,referidos_dias").single(),
  ])
  const ids = (refs ?? []).map((r) => r.referred)
  const { data: profs } = ids.length ? await db.from("profiles").select("id,nombre").in("id", ids) : { data: [] }
  const { data: plan } = await db.from("plans").select("nombre").eq("id", cfg?.referidos_plan ?? "premium").maybeSingle()
  return {
    codigo, link: `${siteUrl()}/registro?ref=${codigo}`, activo: cfg?.referidos_activo ?? true, dias: cfg?.referidos_dias ?? 30, plan: plan?.nombre ?? "Premium", max: MAX_RECOMPENSAS,
    invitados: (refs ?? []).map((r) => ({ id: r.id, nombre: (profs ?? []).find((p) => p.id === r.referred)?.nombre?.split(" ")[0] || "Alguien", estado: r.estado, fecha: r.created_at })),
  }
}

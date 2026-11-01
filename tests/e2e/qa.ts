import { createClient } from "@supabase/supabase-js"
import { LEGAL_VERSION } from "../../lib/legal/version"

/** Usuario de pruebas (se crea confirmado con la clave secreta; no envía correos). */
process.loadEnvFile?.(".env.local")
export const QA = {
  email: process.env.E2E_QA_EMAIL ?? "qa.e2e@mirai.test",
  password: process.env.E2E_QA_PASSWORD ?? "",
  nombre: "Ana Prueba",
}

export function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })
}

/** Borra y recrea el usuario de QA (con sus hogares) para empezar limpio. */
export async function resetQaUser() {
  const sb = admin()
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const old = data.users.find((u) => u.email === QA.email)
  if (old) {
    const { data: hh } = await sb.from("household_members").select("household_id").eq("user_id", old.id)
    if (hh?.length) await sb.from("households").delete().in("id", hh.map((h) => h.household_id))
    await sb.auth.admin.deleteUser(old.id)
  }
  const { error } = await sb.auth.admin.createUser({
    email: QA.email, password: QA.password, email_confirm: true,
    user_metadata: { nombre: QA.nombre, acepta_version: LEGAL_VERSION },
  })
  if (error) throw error
  // Restos de corridas anteriores: hogares de prueba que quedaron sin integrantes.
  const { data: orphans } = await sb.from("households").select("id,household_members(user_id)").eq("nombre", "Familia Prueba")
  const ids = (orphans ?? []).filter((h) => !(h.household_members as unknown[]).length).map((h) => h.id)
  if (ids.length) await sb.from("households").delete().in("id", ids)
}

/** Pone el hogar de QA en Premium (cortesía de prueba) o en Gratis. Las pruebas usan Premium salvo las del plan gratis. */
export async function setQaPlan(plan: "premium" | "gratis") {
  const sb = admin()
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const uid = data.users.find((u) => u.email === QA.email)?.id
  if (!uid) return
  const { data: hh } = await sb.from("household_members").select("household_id").eq("user_id", uid)
  const ids = (hh ?? []).map((h) => h.household_id)
  if (!ids.length) return
  await sb.from("plan_subscriptions").delete().in("household_id", ids).eq("proveedor", "manual")
  if (plan === "premium") await sb.from("plan_subscriptions").insert(ids.map((household_id) => ({ household_id, proveedor: "manual", estado: "cortesia", nota: "e2e", vence_at: new Date(Date.now() + 86_400_000).toISOString() })))
}

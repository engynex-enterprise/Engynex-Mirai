import { createClient } from "@supabase/supabase-js"

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
    user_metadata: { nombre: QA.nombre, acepta_version: "2026-10-31" },
  })
  if (error) throw error
}

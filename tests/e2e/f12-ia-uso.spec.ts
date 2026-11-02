import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { QA, admin } from "./qa"

async function qaIds() {
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 })
  const userId = data.users.find((u) => u.email === QA.email)!.id
  const { data: m } = await admin().from("household_members").select("household_id").eq("user_id", userId).limit(1).single()
  return { userId, householdId: m!.household_id as string }
}

test.afterAll(async () => {
  const { userId, householdId } = await qaIds()
  await admin().from("ai_usage").delete().eq("household_id", householdId)
  await admin().from("platform_admins").delete().eq("user_id", userId)
})

test("uso de IA: créditos del mes, ahorro, por función y aviso del 80 %", async ({ page }, info) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  await login(page)
  const { userId, householdId } = await qaIds()
  await admin().from("ai_usage").delete().eq("household_id", householdId)
  const base = { household_id: householdId, user_id: userId, plan: "premium", provider: "ai_gateway", model: "google/gemini-2.5-flash", de_plataforma: true }
  await admin().from("ai_usage").insert([
    { ...base, feature: "chat", fuente: "ia", input_tokens: 2000, output_tokens: 300, costo_usd: 0.0014, creditos: 1.4, duracion_ms: 2100 },
    { ...base, feature: "categorizar", fuente: "algoritmo", provider: null, model: null, tokens_evitados: 600 },
    { ...base, feature: "categorizar", fuente: "cache", provider: null, model: null, tokens_evitados: 500 },
  ])

  await page.goto("/ajustes?tab=usoia")
  await expect(page.getByRole("heading", { name: "Créditos de IA de este mes" })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText("Te quedan")).toBeVisible()
  await expect(page.getByText("Ahorro con cálculos de Mirai")).toBeVisible()
  await expect(page.getByText("Chat con el asesor").first()).toBeVisible()
  await expect(page.getByText("Categoría y gasto hormiga").first()).toBeVisible()
  await shot(page, "ia-uso", info.project.name)

  // Pasar del 80 % del cupo de Premium (1.000 créditos por defecto) muestra el aviso.
  const { data: plan } = await admin().from("plans").select("ia_creditos").eq("id", "premium").single()
  const cupo = plan?.ia_creditos ?? 1000
  await admin().from("ai_usage").insert({ ...base, feature: "consejero_analizar", fuente: "ia", input_tokens: 1000, output_tokens: 500, costo_usd: cupo * 0.00085, creditos: cupo * 0.85 })
  await page.reload()
  await expect(page.getByText(/Llevas el \d+ % de tus créditos de IA del mes/).first()).toBeVisible({ timeout: 30_000 })
  await shot(page, "ia-uso-aviso", info.project.name)
  expect(errs).toEqual([])
})

test("consola: uso de IA de la plataforma, cupos y precios", async ({ page }, info) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  await login(page)
  const { userId } = await qaIds()
  await admin().from("platform_admins").upsert({ user_id: userId })
  await page.goto("/admin/ia")
  await expect(page.getByRole("heading", { name: "Uso de IA", level: 1 })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText("Costo por día")).toBeVisible()
  await expect(page.getByText("Cupo mensual de créditos por plan")).toBeVisible()
  await expect(page.getByText("Hogares que más usan la IA este mes")).toBeVisible()
  await page.getByRole("radio", { name: "7 días" }).click()
  await expect(page.getByText("Costo por día")).toBeVisible()
  await shot(page, "consola-ia", info.project.name)
  expect(errs).toEqual([])
})

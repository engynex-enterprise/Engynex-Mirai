import { expect, test } from "@playwright/test"
import { login, watchErrors } from "./helpers"

test("asistentes: categoría sugerida (con respaldo sin IA), entidad por NIT, lectura con foto y plan de la prima", async ({ page }) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  await login(page)

  await page.goto("/gastos?nuevo=1")
  await page.getByRole("textbox", { name: "¿En qué gastaste?" }).fill("comida del perro")
  await expect(page.getByRole("button", { name: "Leer una factura con foto" })).toBeVisible()
  await page.getByRole("combobox", { name: "Categoría" }).click()
  await page.getByPlaceholder("Buscar…").fill("Peludos")
  await page.getByRole("option", { name: /Crear/ }).first().click()
  await expect(page.getByRole("heading", { name: "Nueva categoría" })).toBeVisible()
  await page.getByRole("button", { name: "Sugerir" }).click()
  await expect(page.getByRole("button", { name: "Sugerir otra vez" })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole("textbox", { name: "Nombre de la categoría" })).toHaveValue(/\S/)
  await page.keyboard.press("Escape")

  await page.goto("/le-debo?nuevo=1")
  // La lectura con foto aparece al escoger un crédito con el banco.
  await page.getByRole("radio", { name: "Banco, cooperativa o financiera" }).click({ timeout: 30_000 })
  await expect(page.getByRole("button", { name: "Leer con foto" })).toBeVisible()
  await page.getByRole("combobox", { name: /banco o entidad/i }).click()
  await page.getByPlaceholder("Buscar…").fill("890903938")
  await page.getByRole("option", { name: /Crear banco o entidad/ }).first().click()
  await expect(page.getByRole("textbox", { name: "NIT o documento" })).toHaveValue("890903938")
  await expect(page.getByText(/NIT con dígito de verificación: 890903938-8/)).toBeVisible()
  await page.keyboard.press("Escape")

  await page.goto("/primas")
  await expect(page.getByText("Tu salario mensual")).toBeVisible({ timeout: 30_000 })
  expect(errs, errs.join("\n")).toEqual([])
})

test("probar la conexión de la IA queda en el uso de IA (ai_usage, función prueba)", async ({ page }) => {
  // Llama de verdad al proveedor del hogar: solo con E2E_AI=1 y un proveedor propio configurado en el hogar de QA.
  test.skip(!process.env.E2E_AI, "Solo con E2E_AI=1: llama al proveedor de IA del hogar")
  test.setTimeout(120_000)
  const { admin, QA } = await import("./qa")
  await login(page)
  const desde = new Date(Date.now() - 5_000).toISOString()
  await page.goto("/ajustes?tab=ia")
  const probar = page.getByRole("button", { name: "Probar conexión" }).first()
  await expect(probar).toBeVisible({ timeout: 30_000 })
  await probar.click()
  const toast = page.getByText(/Conexión exitosa|La prueba falló/).first()
  await expect(toast).toBeVisible({ timeout: 60_000 })
  const plataforma = await page.getByText(/no hace falta probarla/).isVisible().catch(() => false)
  if (plataforma) return // la IA de Mirai no se prueba (no gasta sus créditos)
  const sb = admin()
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const uid = users.users.find((u) => u.email === QA.email)!.id
  await expect.poll(async () => {
    const { data } = await sb.from("ai_usage").select("id").eq("user_id", uid).eq("feature", "prueba").gte("created_at", desde)
    return data?.length ?? 0
  }, { timeout: 20_000 }).toBeGreaterThan(0)
})

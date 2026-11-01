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
  await expect(page.getByRole("button", { name: "Leer con foto" })).toBeVisible({ timeout: 30_000 })
  await page.getByRole("combobox", { name: "Banco o entidad" }).click()
  await page.getByPlaceholder("Buscar…").fill("890903938")
  await page.getByRole("option", { name: /Crear banco o entidad/ }).first().click()
  await expect(page.getByRole("textbox", { name: "NIT o documento" })).toHaveValue("890903938")
  await expect(page.getByText(/NIT con dígito de verificación: 890903938-8/)).toBeVisible()
  await page.keyboard.press("Escape")

  await page.goto("/primas")
  await expect(page.getByText("Tu salario mensual")).toBeVisible({ timeout: 30_000 })
  expect(errs, errs.join("\n")).toEqual([])
})

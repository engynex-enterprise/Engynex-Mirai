import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

test("gastos: registrar, hormiga, borrar y deshacer", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/gastos")
  await expect(page.getByRole("heading", { name: "Gastos y hormiga" })).toBeVisible()
  await shot(page, "gastos-vacio", info.project.name)

  // Registrar un tinto (hormiga automática por palabra clave)
  const desc = `Tinto ${info.project.name} ${Date.now() % 10000}`
  await page.getByRole("button", { name: "Registrar gasto" }).first().click()
  await page.getByRole("textbox", { name: "¿En qué gastaste?" }).fill(desc)
  await page.getByRole("textbox", { name: "Valor" }).fill("4500")
  await page.getByRole("combobox", { name: "Categoría" }).click()
  await page.getByPlaceholder("Buscar…").fill("Café")
  await page.getByRole("option", { name: /^Café/ }).click()
  await expect(page.getByText("Parece un gasto hormiga.")).toBeVisible()
  await shot(page, "gastos-form", info.project.name)
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText("Gasto hormiga registrado")).toBeVisible()

  const row = page.locator("#main li", { hasText: desc })
  await expect(row).toBeVisible()
  await expect(row.getByText("hormiga")).toBeVisible()
  await shot(page, "gastos-lista", info.project.name)

  // Quitar de hormiga con la taza
  await row.getByRole("button", { name: "Quitar de hormiga" }).click()
  await expect(row.getByText("hormiga")).toHaveCount(0)

  // Eliminar y deshacer
  await row.getByRole("button", { name: "Eliminar gasto" }).click()
  await expect(page.locator("#main li", { hasText: desc })).toHaveCount(0)
  await page.getByRole("button", { name: "Deshacer" }).click()
  await expect(page.locator("#main li", { hasText: desc })).toBeVisible()

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  expect(errs, errs.join("\n")).toEqual([])
})

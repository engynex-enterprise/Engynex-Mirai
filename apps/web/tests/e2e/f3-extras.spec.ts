import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

test("retos, gastos compartidos, mesadas y primas", async ({ page }, info) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/puesta")
  await page.getByRole("button", { name: "Ver un ejemplo" }).click()
  await expect(page.getByText("Datos de ejemplo cargados")).toBeVisible({ timeout: 60_000 })
  await page.waitForURL(/inicio/)

  await page.goto("/retos?nuevo=1")
  await page.getByRole("button", { name: /Reto de las 52 semanas/ }).click()
  await expect(page.getByText("¡Reto iniciado!")).toBeVisible()
  await page.getByRole("button", { name: "Semana 1", exact: true }).click()
  await expect(page.getByRole("button", { name: "Semana 1", exact: true })).toHaveAttribute("aria-pressed", "true")
  await shot(page, "retos", info.project.name)

  await page.goto("/compartidos?nuevo=1")
  const grupo = `Paseo ${info.project.name}`
  const hotel = `Hotel ${info.project.name}`
  await page.getByRole("textbox", { name: "Nombre del grupo" }).fill(grupo)
  await page.getByRole("textbox", { name: "¿Quiénes participan?" }).fill("Ana, Beto, Caro")
  await page.getByRole("button", { name: "Crear grupo" }).click()
  await page.getByRole("button", { name: "Anotar gasto" }).click()
  await page.getByRole("textbox", { name: "¿Qué se pagó?" }).fill(hotel)
  await page.getByRole("textbox", { name: "Valor" }).fill("300000")
  await page.getByRole("checkbox", { name: /Registrar mi parte en mis gastos/ }).click()
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText("Gasto anotado")).toBeVisible()
  await expect(page.getByText("Le deben").first()).toBeVisible()
  await shot(page, "compartidos", info.project.name)
  // Mi parte quedó en Gastos; al borrar el gasto del grupo, también sale de Gastos.
  await page.goto("/gastos")
  await expect(page.locator("#main li", { hasText: `${hotel} (${grupo})` })).toBeVisible()
  await page.goto("/compartidos")
  const g = page.getByRole("radio", { name: grupo })
  if (await g.count()) await g.first().click()
  await page.getByRole("button", { name: `Eliminar gasto ${hotel}` }).click()
  await expect(page.getByText("Gasto eliminado")).toBeVisible()
  await page.goto("/gastos")
  await expect(page.locator("#main li").first()).toBeVisible() // la lista ya cargó (tiene los datos de ejemplo)
  await expect(page.locator("#main li", { hasText: `${hotel} (${grupo})` })).toHaveCount(0)

  await page.goto("/mesadas")
  await page.getByRole("button", { name: /Entregar mesada/ }).first().click()
  await expect(page.getByText("Mesada entregada")).toBeVisible()
  await shot(page, "mesadas", info.project.name)

  await page.goto("/primas")
  await expect(page.getByText("Próximas fechas")).toBeVisible()
  await shot(page, "primas", info.project.name)
  expect(errs, errs.join("\n")).toEqual([])
})

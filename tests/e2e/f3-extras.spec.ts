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
  await page.getByRole("textbox", { name: "Nombre del grupo" }).fill("Paseo")
  await page.getByRole("textbox", { name: "¿Quiénes participan?" }).fill("Ana, Beto, Caro")
  await page.getByRole("button", { name: "Crear grupo" }).click()
  await page.getByRole("button", { name: "Anotar gasto" }).click()
  await page.getByRole("textbox", { name: "Valor" }).fill("300000")
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText("Gasto anotado")).toBeVisible()
  await expect(page.getByText("Le deben").first()).toBeVisible()
  await shot(page, "compartidos", info.project.name)

  await page.goto("/mesadas")
  await page.getByRole("button", { name: /Entregar mesada/ }).first().click()
  await expect(page.getByText("Mesada entregada")).toBeVisible()
  await shot(page, "mesadas", info.project.name)

  await page.goto("/primas")
  await expect(page.getByText("Próximas fechas")).toBeVisible()
  await shot(page, "primas", info.project.name)
  expect(errs, errs.join("\n")).toEqual([])
})

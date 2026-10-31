import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

test("gastos fijos: rango variable, pagar, ajustar rango y deshacer", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/fijos?nuevo=1")
  const nombre = `Energía ${info.project.name}`
  await page.getByRole("textbox", { name: "Nombre" }).fill(nombre)
  await page.getByRole("radio", { name: "Varía según consumo" }).click()
  await page.getByRole("textbox", { name: "Lo mínimo que pagas" }).fill("150000")
  await page.getByRole("textbox", { name: "Lo máximo que pagas" }).fill("222000")
  await shot(page, "fijo-form", info.project.name)
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText(`${nombre} guardado`)).toBeVisible()
  const row = page.locator("li", { hasText: nombre })
  await expect(row.getByText("varía según consumo")).toBeVisible()
  await expect(row.getByText(/Servicios públicos/)).toBeVisible()
  await shot(page, "fijos", info.project.name)

  if (info.project.name === "movil") { await row.getByRole("button", { name: "Más acciones" }).click(); await page.getByRole("menuitem", { name: `Pagar ${nombre}` }).click() }
  else await row.getByRole("button", { name: `Pagar ${nombre}` }).click()
  await page.getByRole("textbox", { name: "Valor pagado" }).fill("230000")
  await page.getByRole("button", { name: "Registrar pago" }).click()
  await expect(page.getByText(/superó tu máximo habitual/)).toBeVisible()
  const paid = page.locator("li", { hasText: nombre }).filter({ hasText: "Pagado el" })
  await expect(paid).toBeVisible()

  await page.goto("/gastos")
  await expect(page.locator("li", { hasText: nombre }).getByText("fijo")).toBeVisible()
  await page.goto("/fijos")
  const paid2 = page.locator("li", { hasText: nombre }).filter({ hasText: "Pagado el" })
  if (info.project.name === "movil") { await paid2.getByRole("button", { name: "Más acciones" }).click(); await page.getByRole("menuitem", { name: "Deshacer pago" }).click() }
  else await paid2.getByRole("button", { name: "Deshacer pago" }).click()
  await expect(page.getByText("Pago deshecho")).toBeVisible()
  await expect(page.locator("li", { hasText: nombre }).filter({ hasText: "Pagado el" })).toHaveCount(0)
  expect(errs, errs.join("\n")).toEqual([])
})

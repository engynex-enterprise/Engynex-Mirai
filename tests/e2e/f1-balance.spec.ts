import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

test("balance: agregar cuenta, patrimonio y quincenas", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/balance?nuevo=activo")
  const nombre = `Ahorros ${info.project.name}`
  await page.getByRole("textbox", { name: "Nombre" }).fill(nombre)
  await page.getByRole("textbox", { name: "Valor hoy" }).fill("12400000")
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText(nombre)).toBeVisible()
  await expect(page.getByText("Patrimonio")).toBeVisible()
  await shot(page, "balance", info.project.name)
  await page.getByRole("radio", { name: "1ª quincena" }).click()
  await expect(page.getByText("Disponible del periodo")).toBeVisible()
  // Depende de los datos del usuario QA: o hay salidas (fijos, suscripciones, gasto variable estimado) o el aviso de vacío.
  await expect(page.getByText("Salidas", { exact: true })).toBeVisible()
  await expect(page.getByText(/Te sobra|Te falta/).first()).toBeVisible()
  await shot(page, "quincena", info.project.name)
  expect(errs, errs.join("\n")).toEqual([])
})

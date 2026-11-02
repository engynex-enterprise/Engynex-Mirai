import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

test("importar extracto de ejemplo y evitar duplicados", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/importar")
  await page.getByRole("button", { name: "Probar con un extracto de ejemplo" }).click()
  await expect(page.getByText("Revisa antes de importar")).toBeVisible()
  await expect(page.getByText(/7 de 8 seleccionados|7 de 7 seleccionados/)).toBeVisible()
  await shot(page, "importar", info.project.name)
  await page.getByRole("button", { name: "Importar seleccionados" }).click()
  await expect(page.getByText(/Importamos \d+ gastos?/)).toBeVisible()
  // Segunda vez: todo queda marcado como ya registrado
  await page.getByRole("button", { name: "Probar con un extracto de ejemplo" }).click()
  await expect(page.getByText(/^0 de/)).toBeVisible()
  expect(errs, errs.join("\n")).toEqual([])
})

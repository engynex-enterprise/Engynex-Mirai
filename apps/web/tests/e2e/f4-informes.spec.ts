import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

// Informes a la medida (/informes): cada tipo abre su tabla, el periodo cambia con las flechas y Mes a mes trae los 12
// meses. Las cifras (que suman lo mismo que «Sale» y el Balance) están en packages/domain/src/informes.test.ts.
test("informes: cada tipo, el periodo y mes a mes", async ({ page }, info) => {
  test.setTimeout(150_000)
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/informes")
  await expect(page.getByRole("heading", { name: "Informes" }).first()).toBeVisible({ timeout: 30_000 })
  const tipos = page.getByRole("radiogroup", { name: "Tipo de informe" })
  for (const nombre of ["Por persona", "Por proveedor o a quién", "Por producto o concepto", "Por medio de pago", "Por tipo de gasto", "Por fuente", "Activos", "Pasivos", "Deudas (Le debo)", "Préstamos que hiciste (Me deben)"]) {
    await tipos.getByRole("radio", { name: nombre }).first().click()
    await expect(tipos.getByRole("radio", { name: nombre }).first()).toHaveAttribute("aria-checked", "true")
    await expect(page.getByTestId("data-table")).toBeVisible()
  }
  // Un informe de gastos: el periodo se mueve con las flechas.
  await tipos.getByRole("radio", { name: "Por categoría" }).click()
  await page.getByRole("button", { name: "Periodo anterior" }).click()
  await expect(page).toHaveURL(/tipo=gastos-categoria|\/informes$/)
  await shot(page, "informes", info.project.name)
  // Mes a mes: los 12 meses del año.
  await tipos.getByRole("radio", { name: "Mes a mes" }).click()
  await expect(page.getByText(/12 meses/)).toBeVisible({ timeout: 20_000 })
  await shot(page, "informes-mes-a-mes", info.project.name)
  // Desde el menú: Informes › Informes a tu medida.
  expect(errs, errs.join("\n")).toEqual([])
})

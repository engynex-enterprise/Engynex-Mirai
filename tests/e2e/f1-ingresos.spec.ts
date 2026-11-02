import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

test("ingresos: salario bruto con descuentos de nómina", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/ingresos?nuevo=1")
  const concepto = `Salario ${info.project.name}`
  await page.getByRole("textbox", { name: "Concepto" }).fill(concepto)
  await page.getByRole("textbox", { name: "Valor" }).fill("4750000")
  await page.getByRole("combobox", { name: "¿Cada cuánto te pagan?" }).click()
  await page.getByRole("option", { name: /^Cada quincena/ }).click()
  await page.getByRole("radio", { name: "No, es el salario o valor del contrato" }).click()
  await expect(page.getByText("Lo que te llega a la cuenta", { exact: true })).toBeVisible()
  await expect(page.getByText("− Salud")).toBeVisible()
  await expect(page.getByText("− Pensión")).toBeVisible()
  await shot(page, "ingreso-form", info.project.name)
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText(/1ª quincena te llegan .* y 2ª quincena .*descuentos del mes/)).toBeVisible()
  const row = page.locator("li", { hasText: concepto })
  await expect(row.getByText("neto")).toBeVisible()
  await expect(row.getByText(/^Bruto \$/)).toBeVisible()
  await expect(page.getByText("Ingreso mensual")).toBeVisible()
  await shot(page, "ingresos", info.project.name)
  expect(errs, errs.join("\n")).toEqual([])
})

test("ingresos flexibles: descuentos en la 2ª quincena, bono por quincena y valores distintos", async ({ page }, info) => {
  const errs = watchErrors(page)
  const p = info.project.name
  await login(page)
  const quincenal = async (concepto: string) => {
    await page.goto("/ingresos?nuevo=1")
    await page.getByRole("textbox", { name: "Concepto" }).fill(concepto)
    await page.getByRole("combobox", { name: "¿Cada cuánto te pagan?" }).click()
    await page.getByRole("option", { name: /^Cada quincena/ }).click()
  }
  const row = (t: string) => page.locator("li", { hasText: t })

  // Nómina de $9.000.000 al mes: la 1ª quincena llega completa y en la 2ª descuentan todo.
  await quincenal(`Nómina ${p}`)
  await page.getByRole("textbox", { name: "Valor de cada quincena" }).fill("4500000")
  await page.getByRole("radio", { name: "No, es el salario o valor del contrato" }).click()
  await page.getByRole("radio", { name: /Todo en la 2ª quincena/ }).click()
  const dlg = page.getByRole("dialog")
  await expect(dlg.getByText("1ª quincena (día 15)").locator("..")).toContainText(/\$\s?4\.500\.000/)
  await shot(page, "ingreso-quincenas-form", p)
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText(/1ª quincena te llegan \$\s?4\.500\.000 y 2ª quincena/)).toBeVisible()
  await expect(row(`Nómina ${p}`).getByText(/1ª quincena \$\s?4\.500\.000 · 2ª quincena .* · descuentos en la 2ª/)).toBeVisible()

  // Bono de $30.000 en cada quincena (lo mismo en las dos).
  await quincenal(`Bono ${p}`)
  await page.getByRole("textbox", { name: "Valor de cada quincena" }).fill("30000")
  await expect(page.getByText(/Al mes: \$\s?60\.000/)).toBeVisible()
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(row(`Bono ${p}`).getByText(/^\$\s?30\.000$/).filter({ visible: true }).first()).toBeVisible()

  // Auxilio que cambia: $200.000 en la 1ª y $50.000 en la 2ª, con días propios.
  await quincenal(`Auxilio ${p}`)
  await page.getByRole("radio", { name: "No, cambia" }).click()
  await page.getByRole("textbox", { name: "Valor de la 1ª quincena" }).fill("200000")
  await page.getByRole("textbox", { name: "Valor de la 2ª quincena" }).fill("50000")
  await page.getByRole("spinbutton", { name: "Día de pago 1ª quincena" }).fill("5")
  await page.getByRole("spinbutton", { name: "Día de pago 2ª quincena" }).fill("20")
  await page.getByRole("button", { name: "Guardar" }).click()
  const aux = row(`Auxilio ${p}`)
  await expect(aux.getByText("Cada quincena (5 y 20)", { exact: false })).toBeVisible()
  await expect(aux.getByText(/1ª quincena \$\s?200\.000 · 2ª quincena \$\s?50\.000/)).toBeVisible()
  await expect(aux.getByText("al mes", { exact: true }).filter({ visible: true }).first()).toBeVisible()

  // Al editar, el formulario recuerda el reparto.
  await aux.click()
  await expect(page.getByRole("textbox", { name: "Valor de la 1ª quincena" })).toHaveValue(/200\.000/)
  await page.getByRole("button", { name: "Cancelar" }).click()
  await shot(page, "ingresos-quincenas", p)
  expect(errs, errs.join("\n")).toEqual([])
})

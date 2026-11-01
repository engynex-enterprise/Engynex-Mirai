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
  await expect(page.getByText("Lo que te llega a la cuenta por quincena")).toBeVisible()
  await expect(page.getByText("− Salud")).toBeVisible()
  await expect(page.getByText("− Pensión")).toBeVisible()
  await shot(page, "ingreso-form", info.project.name)
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText(/Te llegan .* después de .* en descuentos/)).toBeVisible()
  const row = page.locator("li", { hasText: concepto })
  await expect(row.getByText("neto")).toBeVisible()
  await expect(row.getByText(/^Bruto \$/)).toBeVisible()
  await expect(page.getByText("Ingreso mensual")).toBeVisible()
  await shot(page, "ingresos", info.project.name)
  expect(errs, errs.join("\n")).toEqual([])
})

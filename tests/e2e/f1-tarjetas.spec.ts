import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

test("tarjetas: agregar, compra a cuotas, simulador y pagar total", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/tarjetas?nuevo=1")
  const nombre = `Visa ${info.project.name}`
  await page.getByRole("textbox", { name: "Nombre de la tarjeta" }).fill(nombre)
  await page.getByRole("textbox", { name: "Cupo" }).fill("5000000")
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText("Tarjeta agregada")).toBeVisible()
  await page.getByRole("button", { name: "Registrar compra" }).click()
  await page.getByRole("textbox", { name: "¿Qué compraste?" }).fill("Nevera")
  await page.getByRole("textbox", { name: "Valor" }).fill("2400000")
  await page.getByRole("radio", { name: "12", exact: true }).click()
  await expect(page.getByText(/Cuota de .* · intereses/)).toBeVisible()
  await page.getByRole("button", { name: "Guardar compra" }).click()
  await expect(page.getByText("Compra registrada")).toBeVisible()
  await expect(page.getByText("Nevera").filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByText("36 cuotas")).toBeVisible()
  await shot(page, "tarjetas", info.project.name)
  await page.getByRole("button", { name: "Pagué el total de la tarjeta" }).click()
  await expect(page.getByText("¡Tarjeta al día!")).toBeVisible()
  expect(errs, errs.join("\n")).toEqual([])
})

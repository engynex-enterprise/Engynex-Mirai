import { expect, test, type Page } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

/** Con varias tarjetas en el libro (las de la otra ventana de prueba), deja escogida la de esta prueba. */
async function elegir(page: Page, nombre: string) {
  const r = page.getByRole("radio", { name: nombre })
  if (await r.count()) await r.first().click()
  await expect(page.locator("#main").getByText(nombre).first()).toBeVisible()
}

test("tarjetas: agregar, compra a cuotas, simulador y pagar la tarjeta", async ({ page }, info) => {
  test.setTimeout(120_000)
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/tarjetas?nuevo=1")
  const nombre = `Visa ${info.project.name}`
  const nevera = `Nevera ${info.project.name}`
  await page.getByRole("textbox", { name: "Nombre de la tarjeta" }).fill(nombre)
  await page.getByRole("textbox", { name: "Cupo" }).fill("5000000")
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText("Tarjeta agregada")).toBeVisible()
  await page.getByRole("button", { name: "Registrar compra" }).click()
  await page.getByRole("textbox", { name: "¿Qué compraste?" }).fill(nevera)
  await page.getByRole("textbox", { name: "Valor" }).fill("2400000")
  await page.getByRole("radio", { name: "12", exact: true }).click()
  await expect(page.getByText(/Cuota de .* · intereses/)).toBeVisible()
  await page.getByRole("button", { name: "Guardar compra" }).click()
  await expect(page.getByText("Compra registrada")).toBeVisible()
  await expect(page.getByText(nevera).filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByText("36 cuotas")).toBeVisible()
  await shot(page, "tarjetas", info.project.name)

  // Borrar el gasto de la compra en Gastos: la compra sale de la tarjeta (y la deuda baja).
  await page.goto("/gastos")
  const g = page.locator("#main li", { hasText: nevera })
  await expect(g).toBeVisible()
  await g.getByRole("button", { name: "Eliminar gasto" }).click()
  await expect(page.locator("#main li", { hasText: nevera })).toHaveCount(0)
  await page.goto("/tarjetas")
  await elegir(page, nombre)
  await expect(page.locator("#main").getByText(nevera)).toHaveCount(0)

  // Pagar la tarjeta: la deuda queda en cero y el pago aparece en el flujo del Balance.
  const tv = `Televisor ${info.project.name}`
  await page.getByRole("button", { name: "Registrar compra" }).click()
  await page.getByRole("textbox", { name: "¿Qué compraste?" }).fill(tv)
  await page.getByRole("textbox", { name: "Valor" }).fill("1000000")
  await page.getByRole("button", { name: "Guardar compra" }).click()
  await expect(page.getByText("Compra registrada")).toBeVisible()
  await page.getByRole("button", { name: "Pagar la tarjeta" }).first().click()
  const dlg = page.getByRole("dialog")
  await dlg.getByRole("radio", { name: /Todo lo que debes/ }).click()
  await shot(page, "tarjeta-pagar", info.project.name)
  await dlg.getByRole("button", { name: "Registrar pago" }).click()
  await expect(page.getByText("¡Tarjeta al día!")).toBeVisible()
  await expect(page.getByText("Pagos que registraste")).toBeVisible()
  await expect(page.locator("#main li", { hasText: tv }).getByText("pagada")).toBeVisible()
  await expect(page.getByRole("button", { name: "Pagar la tarjeta" })).toHaveCount(0)

  await page.goto("/balance?tab=mes")
  await expect(page.getByText("Disponible del periodo")).toBeVisible()
  await expect(page.locator("#main li", { hasText: `Tarjeta ${nombre}` }).filter({ hasText: "Pagaste el total de la tarjeta" }).first()).toBeVisible()
  expect(errs, errs.join("\n")).toEqual([])
})

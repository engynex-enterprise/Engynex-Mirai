import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

test("suscripciones: acceso rápido, compartida, ya se cobró y deshacer", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/suscripciones?nuevo=1")
  await page.getByRole("group", { name: "Servicios comunes" }).getByRole("button", { name: "Netflix" }).click()
  await expect(page.getByRole("textbox", { name: "Servicio" })).toHaveValue("Netflix")
  const nombre = `Netflix ${info.project.name}`
  await page.getByRole("textbox", { name: "Servicio" }).fill(nombre)
  await page.getByRole("textbox", { name: "Valor" }).fill("44900")
  await page.getByRole("radio", { name: "Entre 2" }).click()
  await shot(page, "suscripcion-form", info.project.name)
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText(`${nombre} guardada`)).toBeVisible()
  const row = page.locator("#main li", { hasText: nombre }).first()
  await expect(row.getByText("compartida entre 2")).toBeVisible()
  await expect(page.getByText("Te cuestan al mes")).toBeVisible()
  const antes = await row.getByText(/próximo cobro/).first().textContent()
  if (info.project.name === "movil") { await row.getByRole("button", { name: "Más acciones" }).click(); await page.getByRole("menuitem", { name: `Ya se cobró ${nombre}` }).click() }
  else await row.getByRole("button", { name: `Ya se cobró ${nombre}` }).click()
  await expect(page.getByText("Cobro registrado")).toBeVisible()
  await expect(row.getByText(/próximo cobro/).first()).not.toHaveText(antes!)
  await shot(page, "suscripciones", info.project.name)
  // Deshacer: el gasto se borra y el próximo cobro vuelve a su fecha.
  await page.getByRole("button", { name: "Deshacer" }).click()
  await expect(page.getByText("Cobro deshecho")).toBeVisible()
  await expect(row.getByText(/próximo cobro/).first()).toHaveText(antes!)
  expect(errs, errs.join("\n")).toEqual([])
})

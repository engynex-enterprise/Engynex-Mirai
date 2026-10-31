import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

test("suscripciones: acceso rápido, compartida, ya se cobró", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/suscripciones?nuevo=1")
  await page.getByRole("group", { name: "Servicios comunes" }).getByRole("button", { name: "Netflix" }).click()
  await expect(page.getByRole("textbox", { name: "Servicio" })).toHaveValue("Netflix")
  await page.getByRole("textbox", { name: "Valor" }).fill("44900")
  await page.getByRole("radio", { name: "Entre 2" }).click()
  await shot(page, "suscripcion-form", info.project.name)
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText("Netflix guardada")).toBeVisible()
  const row = page.locator("li", { hasText: "Netflix" }).first()
  await expect(row.getByText("compartida entre 2")).toBeVisible()
  await expect(page.getByText("Te cuestan al mes")).toBeVisible()
  if (info.project.name === "movil") { await row.getByRole("button", { name: "Más acciones" }).click(); await page.getByRole("menuitem", { name: "Ya se cobró Netflix" }).click() }
  else await row.getByRole("button", { name: "Ya se cobró Netflix" }).click()
  await expect(page.getByText("Cobro registrado")).toBeVisible()
  await shot(page, "suscripciones", info.project.name)
  expect(errs, errs.join("\n")).toEqual([])
})

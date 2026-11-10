import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

test("contactos: crear con dirección detectada, editar y borrar", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/personas?nuevo=1")
  const nombre = `Laura Gómez ${info.project.name}`
  await page.getByRole("textbox", { name: "Nombre completo" }).fill(nombre)
  await page.getByRole("textbox", { name: "Celular" }).fill("3001234567")
  const dir = page.getByRole("textbox", { name: "Dirección" })
  await dir.fill("calle 80 numero 15-20 apto 301 Chía")
  await expect(page.getByText(/Detectamos: .*Chía/)).toBeVisible()
  await dir.blur()
  await expect(dir).toHaveValue("Cl 80 # 15-20 Apto 301")
  await shot(page, "contacto-form", info.project.name)
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText("Contacto guardado")).toBeVisible()
  const card = page.locator("[id^=c-]", { hasText: nombre })
  await expect(card.getByText("Chía")).toBeVisible()
  await shot(page, "contactos", info.project.name)
  await card.getByRole("button", { name: `Eliminar ${nombre}` }).click()
  await expect(page.locator("[id^=c-]", { hasText: nombre })).toHaveCount(0)
  await page.getByRole("button", { name: "Deshacer" }).click()
  await expect(page.locator("[id^=c-]", { hasText: nombre })).toBeVisible()
  expect(errs, errs.join("\n")).toEqual([])
})

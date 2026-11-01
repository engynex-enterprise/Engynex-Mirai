import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

test("ajustes: pestañas, catálogos, finanzas, alertas, integraciones, hogar y datos", async ({ page }, info) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  const mobile = info.project.name.includes("movil")
  await login(page)
  const tab = async (id: string) => { await page.goto(`/ajustes?tab=${id}`) }

  await tab("general")
  await expect(page.getByText("Pantalla de inicio")).toBeVisible({ timeout: 30_000 })
  if (!mobile) {
    await page.getByRole("textbox", { name: "Buscar ajuste" }).fill("tasas")
    await expect(page.getByRole("button", { name: "Finanzas" })).toBeVisible()
    await page.getByRole("button", { name: "Finanzas" }).click()
  } else await tab("finanzas")
  await expect(page.getByText("Tasa de usura (% E.A.)")).toBeVisible()
  await shot(page, "ajustes-finanzas", info.project.name)

  // Catálogos: crear y borrar una categoría
  await tab("cats")
  const name = `QA cat ${Date.now() % 10000}`
  await page.getByRole("textbox", { name: /Nueva categoría/ }).fill(name)
  await page.locator("#main").getByRole("button", { name: "Agregar" }).click()
  await expect(page.getByRole("textbox", { name: `Nombre de ${name}` })).toBeVisible()
  await page.getByRole("button", { name: `Eliminar ${name}` }).click()
  await expect(page.getByText("Categoría eliminada")).toBeVisible()

  await tab("rels")
  await expect(page.getByRole("button", { name: "Quitar Familiar" })).toBeVisible()

  await tab("alertas")
  await expect(page.getByText("¿Qué te avisamos y por dónde?")).toBeVisible()
  await expect(page.getByRole("checkbox", { name: "Pagos por vencer y vencidos por En la app" })).toBeChecked()
  await shot(page, "ajustes-alertas", info.project.name)

  await tab("integraciones")
  await expect(page.getByText("TRM del día")).toBeVisible()
  await expect(page.getByRole("switch", { name: "Activar Telegram" })).toBeVisible()
  await shot(page, "ajustes-integraciones", info.project.name)

  await tab("ia")
  await expect(page.getByRole("switch", { name: "Usar inteligencia artificial" })).toBeVisible()
  await expect(page.getByText("Orden de los proveedores")).toBeVisible()

  await tab("hogar")
  await expect(page.getByText("Personas con acceso")).toBeVisible()
  await expect(page.getByText("(tú)")).toBeVisible()

  await tab("respaldo")
  await page.getByRole("button", { name: "Crear respaldo ahora" }).click()
  await expect(page.getByText("Respaldo guardado")).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText("Manual ·").first()).toBeVisible()
  await expect(page.getByText("Historial de cambios")).toBeVisible()
  await shot(page, "ajustes-datos", info.project.name)

  await tab("seguridad")
  await expect(page.getByText(/dos pasos/i).first()).toBeVisible()
  expect(errs, errs.join("\n")).toEqual([])
})

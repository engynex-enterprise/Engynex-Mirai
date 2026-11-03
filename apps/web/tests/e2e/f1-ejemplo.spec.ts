import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

test.describe.configure({ mode: "serial" })

test("ejemplo: cargar datos de la familia Navarro y recorrer Mi dinero", async ({ page }, info) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/puesta")
  await page.getByRole("button", { name: "Ver un ejemplo" }).click()
  await expect(page.getByText("Datos de ejemplo cargados")).toBeVisible({ timeout: 60_000 })
  // El nombre del libro va en el aviso (en celular el selector de libro está dentro del menú cerrado).
  await expect(page.getByText(/Ejemplo · familia Navarro/).first()).toBeAttached()
  await page.waitForURL(/inicio/)
  await expect(page.getByText("Lo que tienes menos lo que debes")).toBeVisible({ timeout: 30_000 })
  await shot(page, "ej-inicio", info.project.name)
  for (const [ruta, texto] of [["/gastos", "Movimientos"], ["/ingresos", "Ingreso mensual"], ["/fijos", "Total al mes"], ["/balance", "Patrimonio"], ["/suscripciones", "Te cuestan al mes"], ["/tarjetas", "Debes en tarjetas"]] as const) {
    await page.goto(ruta)
    await expect(page.getByText(texto).first()).toBeVisible({ timeout: 30_000 })
    await shot(page, `ej-${ruta.slice(1)}`, info.project.name)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, `scroll horizontal en ${ruta}`).toBeLessThanOrEqual(0)
  }
  expect(errs, errs.join("\n")).toEqual([])
})

import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

test("planeación con datos de ejemplo: presupuesto, flujo, salud y por miembro", async ({ page }, info) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/puesta")
  await page.getByRole("button", { name: "Ver un ejemplo" }).click()
  await expect(page.getByText("Datos de ejemplo cargados")).toBeVisible({ timeout: 60_000 })
  await page.waitForURL(/inicio/)
  for (const [ruta, texto] of [["/presupuesto", "Cada categoría este mes"], ["/flujo", "En 12 meses tendrías"], ["/indicadores", "Tu salud financiera"], ["/familia", "Lo que aporta cada uno"]] as const) {
    await page.goto(ruta)
    await expect(page.getByText(texto).first()).toBeVisible({ timeout: 30_000 })
    await shot(page, `f3-${ruta.slice(1)}`, info.project.name)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `scroll en ${ruta}`).toBeLessThanOrEqual(0)
  }
  expect(errs, errs.join("\n")).toEqual([])
})

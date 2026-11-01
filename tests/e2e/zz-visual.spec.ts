import { test } from "@playwright/test"
import { login } from "./helpers"

// Capturas de revisión visual (no son pruebas de comportamiento).
test("capturas del rediseño", async ({ page }, info) => {
  test.setTimeout(240_000)
  await login(page)
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => localStorage.setItem("theme", t), theme)
    for (const r of ["/inicio", "/gastos", "/consejero", "/ajustes", "/renta", "/logros"]) {
      await page.goto(r)
      await page.waitForTimeout(2500)
      await page.screenshot({ path: `tests/.out/vis-${r.slice(1)}-${theme}-${info.project.name}.png`, fullPage: r !== "/inicio" ? false : true })
    }
  }
  await page.evaluate(() => localStorage.setItem("theme", "light"))
})

test("capturas: ilustraciones y estados vacíos", async ({ page }, info) => {
  await login(page)
  await page.goto("/no-existe-esta-pagina")
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `tests/.out/vis-404-${info.project.name}.png` })
  await page.goto("/faq")
  await page.getByRole("textbox", { name: "Buscar en preguntas frecuentes" }).fill("zzzz")
  await page.waitForTimeout(800)
  await page.screenshot({ path: `tests/.out/vis-faq-vacio-${info.project.name}.png` })
  await page.goto("/novedades")
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `tests/.out/vis-menu-isos-${info.project.name}.png` })
})

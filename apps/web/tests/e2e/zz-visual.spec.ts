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

test("capturas: banner de cada módulo", async ({ page }, info) => {
  test.setTimeout(900_000)
  await login(page)
  // /consejero es un chat a pantalla completa (sin banner): sus capturas están en f14-chat.spec.ts.
  const ids = ["puesta", "inicio", "dashboard", "balance", "ingresos", "gastos", "fijos", "tarjetas", "suscripciones", "correo", "importar",
    "me-deben", "le-debo", "contactos", "estrategia", "presupuesto", "flujo", "metas", "retos", "logros", "primas", "familia", "mesadas",
    "compartidos", "inversiones", "renta", "calendario", "contador", "recordatorios", "indicadores", "reportes", "novedades", "faq", "manual", "ajustes"]
  for (const id of ids) {
    await page.goto(`/${id}`)
    const h = page.locator("#main header.banner-bg").first()
    await h.waitFor({ timeout: 30_000 })
    await page.waitForTimeout(400)
    await h.screenshot({ path: `tests/.out/banner-${id}-${info.project.name}.png`, animations: "disabled" })
  }
})

test("capturas: avatares y logos de servicios", async ({ page, browser }, info) => {
  test.setTimeout(180_000)
  const n = info.project.name
  await login(page)
  await page.goto("/perfil")
  await page.getByRole("button", { name: "Cambiar avatar" }).first().click()
  await page.getByRole("dialog", { name: "Elige tu avatar" }).waitFor()
  await page.waitForTimeout(600)
  await page.screenshot({ path: `tests/.out/vis-avatares-${n}.png` })
  await page.keyboard.press("Escape")
  await page.goto("/ajustes?tab=ia")
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `tests/.out/vis-integraciones-${n}.png`, fullPage: true })
  await page.goto("/ajustes?tab=alertas")
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `tests/.out/vis-alertas-${n}.png`, fullPage: true })
  await page.goto("/suscripciones?nuevo=1")
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `tests/.out/vis-suscripciones-${n}.png` })
  const anon = await browser.newPage({ viewport: page.viewportSize()! })
  await anon.goto("/login")
  await anon.waitForTimeout(1500)
  await anon.screenshot({ path: `tests/.out/vis-login-${n}.png` })
  await anon.close()
})

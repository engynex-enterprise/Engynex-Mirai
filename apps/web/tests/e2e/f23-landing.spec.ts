import { expect, test } from "@playwright/test"
import { shot, watchErrors } from "./helpers"

// Portada pública (sin sesión): secciones, pestañas de funciones, interruptor Sin/Con Mirai, demo, planes, FAQ y CTA.
test("portada: secciones, VS que conmuta, demo, planes y CTA a registro", async ({ page }, info) => {
  const errs = watchErrors(page)
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Tus finanzas en orden, sin saber de finanzas.", level: 1 })).toBeVisible({ timeout: 30_000 })

  // Secciones con su ancla
  for (const id of ["que-es", "como-funciona", "funciones", "vs", "demo", "seguridad", "planes", "preguntas"]) {
    await expect(page.locator(`#${id}`)).toBeAttached()
  }
  await expect(page.getByRole("heading", { name: "Todo lo que hace Mirai, una a una" })).toBeVisible()

  // Funciones por grupo: cambiar de pestaña muestra sus funciones
  await page.locator("#funciones").scrollIntoViewIfNeeded()
  await page.getByRole("tab", { name: /Impuestos/ }).click()
  await expect(page.getByRole("heading", { name: /Declaración de renta estimada/ })).toBeVisible()

  // Sin Mirai ↔ Con Mirai
  const vs = page.getByTestId("vs")
  const sw = page.getByRole("switch", { name: "Con Mirai" })
  await sw.scrollIntoViewIfNeeded()
  await expect(vs).toHaveAttribute("data-vs", "con")
  await expect(sw).toHaveAttribute("aria-checked", "true")
  await sw.click()
  await expect(vs).toHaveAttribute("data-vs", "sin")
  await expect(sw).toHaveAttribute("aria-checked", "false")
  await expect(page.getByText("Así se ven hoy las finanzas de muchas familias.")).toBeVisible()
  if (info.project.name === "movil") {
    // En el celular solo se ve el lado elegido
    await expect(vs.getByText("Llega el 30, la cuenta está en ceros")).toBeVisible()
    await expect(vs.getByText("Ves en qué se fue cada peso")).toBeHidden()
  }
  await sw.click()
  await expect(vs).toHaveAttribute("data-vs", "con")

  // Demo: cambia con lo que escribe la persona (no guarda nada)
  await page.locator("#demo").scrollIntoViewIfNeeded()
  await page.getByLabel("¿Cuánto te entra al mes?").fill("3000000")
  await page.getByLabel("Gastos fijos del mes").fill("1000000")
  await page.getByLabel("Cuotas de deudas y tarjetas").fill("0")
  await page.getByLabel("¿Cuánto gastas en antojos al día?").fill("0")
  await expect(page.getByTestId("demo-queda")).toHaveText(/2\.000\.000/)

  // Planes con el precio real y FAQ que se abre
  await expect(page.locator("#planes").getByText("$14.900")).toBeVisible({ timeout: 20_000 })
  await page.getByText("¿Es gratis?").click()
  await expect(page.getByText(/Lo básico es gratis para siempre: gastos/)).toBeVisible()

  // SEO: datos estructurados
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(2)

  // Sin scroll horizontal y sin elementos que se salgan de la pantalla
  const fuera = await page.evaluate(() => {
    const W = window.innerWidth
    const bad: string[] = []
    for (const el of document.querySelectorAll("main *, header *, footer *")) {
      if (el.closest("[aria-hidden=true], .overflow-x-auto")) continue
      const r = el.getBoundingClientRect()
      if (r.width && (r.right > W + 1 || r.left < -1)) bad.push(el.tagName)
    }
    return { scroll: document.documentElement.scrollWidth - W, bad: bad.length }
  })
  expect(fuera.scroll).toBeLessThanOrEqual(1)
  expect(fuera.bad).toBe(0)

  await shot(page, "landing-completa", info.project.name)

  // CTA principal lleva al registro
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.getByRole("link", { name: /Crear cuenta gratis/ }).first().click()
  await expect(page).toHaveURL(/registro/)
  expect(errs).toEqual([])
})

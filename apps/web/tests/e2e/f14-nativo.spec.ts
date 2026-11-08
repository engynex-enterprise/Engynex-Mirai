import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

// Apariencia de app nativa: sin zoom con los dedos, plataforma marcada en <html>, barra superior del celular (Buscar,
// campana, Atrás en una vista de detalle) y, en tablet, el menú lateral en íconos.
test("app nativa: sin zoom, plataforma, barra superior del celular y menú de tablet", async ({ page }, info) => {
  test.setTimeout(120_000)
  const errs = watchErrors(page)
  const movil = info.project.name.includes("movil")
  await login(page)
  await page.goto("/inicio")
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /maximum-scale=1.*user-scalable=no|user-scalable=no.*maximum-scale=1/)
  const cls = await page.evaluate(() => document.documentElement.className)
  if (movil) {
    expect(cls).toMatch(/\bandroid\b/)
    expect(cls).toMatch(/\btouch\b/)
    const bar = page.locator("header.mobile-topbar")
    await expect(bar.getByRole("button", { name: "Buscar" })).toBeVisible()
    await expect(bar.getByRole("button", { name: /Notificaciones/ })).toBeVisible()
    await expect(bar.getByRole("button", { name: "Atrás" })).toHaveCount(0)
    await bar.getByRole("button", { name: /Notificaciones/ }).click()
    await expect(page.getByRole("dialog", { name: "Notificaciones" })).toBeVisible()
    await page.keyboard.press("Escape")
    // Vista de detalle: aparece Atrás y vuelve a la sección.
    await page.goto("/academia")
    await page.goto("/academia?leccion=presupuesto")
    await expect(bar.getByRole("button", { name: "Atrás" })).toBeVisible({ timeout: 30_000 })
    await bar.getByRole("button", { name: "Atrás" }).click()
    await expect(page).not.toHaveURL(/leccion=/)
    await page.goto("/inicio")
    await expect(page.getByText(/Te queda esta quincena|Te sobra/).first()).toBeVisible({ timeout: 30_000 })
    await page.evaluate(() => scrollTo(0, 400))
    await page.waitForTimeout(400)
    await page.screenshot({ path: `tests/.out/f14-nativo-${info.project.name}.png` })
  } else {
    expect(cls).not.toMatch(/\btouch\b/)
    await expect(page.locator("header.mobile-topbar")).toBeHidden()
    // Tablet (iPad vertical): el menú lateral queda en íconos.
    await page.setViewportSize({ width: 820, height: 1180 })
    await expect(page.locator('[data-slot="sidebar"][data-state="collapsed"]')).toBeVisible({ timeout: 10_000 })
    await shot(page, "f14-nativo-tablet", info.project.name)
    await page.setViewportSize({ width: 1366, height: 900 })
    await expect(page.locator('[data-slot="sidebar"][data-state="expanded"]')).toBeVisible({ timeout: 10_000 })
  }
  expect(errs, errs.join("\n")).toEqual([])
})

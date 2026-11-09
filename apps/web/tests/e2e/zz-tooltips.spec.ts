import { expect, test } from "@playwright/test"
import { login } from "./helpers"

/**
 * La flecha del tooltip (components/ui/tooltip.tsx). Antes era un cuadrado girado 45°: si la burbuja cambiaba de
 * color se veía el rombo completo encima. Ahora es un triángulo de verdad del mismo color que la burbuja y pegado
 * a ella. Esta prueba lo comprueba en claro y en oscuro, y deja la captura en tests/.out.
 */
test("tooltip: la flecha es un triángulo del color de la burbuja", async ({ page }, info) => {
  test.setTimeout(180_000)
  await login(page)

  for (const tema of ["light", "dark"] as const) {
    await page.evaluate((t) => localStorage.setItem("theme", t), tema)
    await page.goto("/gastos")
    await page.getByRole("button", { name: "Registrar gasto" }).first().click()
    const ayuda = page.getByRole("button", { name: /^Ayuda/ }).first()
    await ayuda.waitFor({ timeout: 30_000 })
    await ayuda.hover()

    const tip = page.locator("[data-slot=tooltip-content]").first()
    await expect(tip).toBeVisible()
    await page.waitForTimeout(500)

    const m = await tip.evaluate((el) => {
      const svg = el.querySelector("svg")!
      const path = svg.querySelector("path")!
      const r = svg.getBoundingClientRect()
      const b = el.getBoundingClientRect()
      return {
        side: el.getAttribute("data-side"),
        burbuja: getComputedStyle(el).backgroundColor,
        flecha: getComputedStyle(path).fill,
        ancho: r.width,
        alto: r.height,
        viewBox: svg.getAttribute("viewBox"),
        hueco: r.top - b.bottom, // < 0: la flecha nace dentro de la burbuja, sin línea entre las dos
      }
    })

    expect(m.flecha).toBe(m.burbuja) // mismo token de color: nunca un rombo de otro color encima
    expect(m.viewBox).toBe("0 0 14 7") // el viewBox propio le gana al de Radix (si no, el triángulo saldría cortado)
    expect(Math.round(m.ancho)).toBe(14)
    expect(Math.round(m.alto)).toBe(7)
    if (m.side === "top") expect(m.hueco).toBeLessThanOrEqual(0)

    const caja = (await ayuda.boundingBox())!
    await page.screenshot({
      path: `tests/.out/tooltip-${tema}-${info.project.name}.png`,
      clip: {
        x: Math.max(0, caja.x - 200),
        y: Math.max(0, caja.y - 140),
        width: Math.min(420, page.viewportSize()!.width),
        height: 200,
      },
    })
  }

  await page.evaluate(() => localStorage.setItem("theme", "light"))
})

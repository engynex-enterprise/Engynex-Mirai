import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

test("dashboard: KPIs, gráficas principales, decisiones y periodo", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/dashboard")
  await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible()

  // KPIs de arriba: el periodo y la salud de tu plata.
  for (const k of ["Entra", "Sale", "Ahorras", "Patrimonio", "Lo que debes", "Compromisos fijos", "Meses de colchón"])
    await expect(page.locator("#main").getByText(k, { exact: true }).first()).toBeVisible()

  // Secciones y gráficas principales (recharts llega después de pintar).
  for (const h of ["Decisiones: lo que te conviene hacer", "Entra y sale mes a mes", "¿En qué se va la plata?", "Lo que sale, por módulo", "Tu patrimonio en el tiempo",
    "Tus deudas y cuándo terminan", "Tus compromisos fijos", "Capacidad de ahorro y colchón", "Próximos 30 días", "Impuestos que vienen", "Tus metas"])
    await expect(page.getByRole("heading", { name: h })).toBeVisible()
  const meses = page.getByRole("img", { name: /Gráfica de lo que entra, lo que sale/ })
  await expect(meses).toBeVisible()
  await expect(meses.locator("svg.recharts-surface").first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole("img", { name: /Patrimonio de los últimos/ })).toBeVisible()
  await shot(page, "dashboard", info.project.name)

  // Cambiar el periodo: queda en la dirección para compartirla o volver.
  await page.getByRole("radio", { name: "Últimos 12 meses" }).click()
  await expect(page).toHaveURL(/periodo=12m/)
  await expect(page.getByText(/^En los últimos 12 meses$/)).toBeVisible()
  await page.getByRole("radio", { name: "Mes pasado" }).click()
  await expect(page).toHaveURL(/periodo=mes-pasado/)

  // Cada decisión lleva a su sección.
  const dec = page.getByTestId("decisiones")
  const links = dec.getByRole("link")
  if (await links.count()) expect(await links.first().getAttribute("href")).toMatch(/^\//)

  // Cómo funciona abre la ayuda de esta pantalla.
  await page.getByRole("button", { name: "Cómo funciona" }).click()
  await expect(page.getByText("Tus números en gráficas para decidir", { exact: false }).last()).toBeVisible()
  await page.keyboard.press("Escape")

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await shot(page, "dashboard-mes-pasado", info.project.name)
  expect(errs, errs.join("\n")).toEqual([])
})

test("dashboard: se llega desde el Balance", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/balance")
  await page.getByRole("link", { name: "Ver gráficas" }).click()
  await expect(page).toHaveURL(/\/dashboard/)
  await expect(page.getByRole("heading", { name: "Entra y sale mes a mes" })).toBeVisible()
  await shot(page, "dashboard-desde-balance", info.project.name)
  expect(errs, errs.join("\n")).toEqual([])
})

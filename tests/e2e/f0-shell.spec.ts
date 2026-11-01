import { expect, test, type Page } from "@playwright/test"
import { QA, setQaWelcome } from "./qa"

const errors = (page: Page) => {
  const list: string[] = []
  page.on("pageerror", (e) => list.push(e.message))
  page.on("console", (m) => m.type() === "error" && !/favicon|404|Failed to load resource/.test(m.text()) && list.push(m.text()))
  return list
}

test.describe.configure({ mode: "serial" })

test("protege rutas y pide login", async ({ page }) => {
  await page.goto("/gastos")
  await expect(page).toHaveURL(/\/login\?next=%2Fgastos/)
  await expect(page.getByRole("heading", { name: "Hola de nuevo" })).toBeVisible()
  await page.screenshot({ path: `tests/.out/login-${test.info().project.name}.png`, fullPage: true })
})

test("registro muestra medidor y exige aceptar la política", async ({ page }) => {
  await page.goto("/registro")
  await page.getByLabel("Contraseña", { exact: true }).fill("abc")
  await expect(page.getByText("Muy débil").or(page.getByText("Débil"))).toBeVisible()
  await page.getByRole("button", { name: "Crear mi cuenta" }).click()
  await expect(page.getByText("Debes aceptar para crear tu cuenta")).toBeVisible()
  await page.screenshot({ path: `tests/.out/registro-${test.info().project.name}.png`, fullPage: true })
})

test("login → bienvenida → shell con menú, Ctrl K y Agregar", async ({ page }) => {
  const errs = errors(page)
  await page.goto("/login")
  await page.getByLabel("Correo").fill(QA.email)
  await page.getByLabel("Contraseña", { exact: true }).fill(QA.password)
  await page.getByRole("button", { name: "Entrar" }).click()
  const welcome = page.getByRole("heading", { name: "¡Bienvenido a Mirai!" })
  await expect(welcome.or(page.getByRole("button", { name: "Cómo funciona" }))).toBeVisible({ timeout: 20_000 })
  if (await welcome.isVisible()) {
    await expect(page.getByLabel("¿Cómo te llamas?")).toHaveValue(QA.nombre)
    await page.screenshot({ path: `tests/.out/bienvenida-${test.info().project.name}.png`, fullPage: true })
    await page.getByRole("button", { name: "Empezar" }).click()
    await page.waitForURL(/\/puesta/)
  }
  // Modal de bienvenida (una sola vez): se ve, se cierra y no vuelve a salir
  await setQaWelcome(false)
  await page.goto("/inicio")
  const modal = page.getByRole("dialog", { name: /Bienvenido a Mirai, / })
  await expect(modal).toBeVisible({ timeout: 20_000 })
  await expect(modal.getByText("Tus datos, seguros y privados")).toBeVisible()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `tests/.out/bienvenida-modal-${test.info().project.name}.png` })
  await modal.getByRole("button", { name: "Cerrar" }).click()
  await expect(modal).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await expect(page.getByRole("dialog", { name: /Bienvenido a Mirai, / })).toHaveCount(0)
  await expect(page.getByText("Sincronizado en vivo").or(page.getByRole("button", { name: "Menú", exact: true }))).toBeVisible({ timeout: 15_000 })
  await page.screenshot({ path: `tests/.out/inicio-${test.info().project.name}.png`, fullPage: true })

  await page.keyboard.press("Control+k")
  await expect(page.getByPlaceholder("Buscar secciones, contactos, préstamos…")).toBeVisible()
  await page.keyboard.type("hormiga")
  await page.screenshot({ path: `tests/.out/buscar-${test.info().project.name}.png` })
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(/\/gastos/)

  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.keyboard.press("n")
  await expect(page.getByText("¿Qué quieres agregar?")).toBeVisible()
  await page.screenshot({ path: `tests/.out/agregar-${test.info().project.name}.png` })
  await page.keyboard.press("Escape")

  await page.getByRole("button", { name: "Cómo funciona" }).click()
  await expect(page.getByText(/Cómo funciona: Gastos y hormiga/)).toBeVisible()
  await page.keyboard.press("Escape")

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, "sin scroll horizontal").toBeLessThanOrEqual(0)
  expect(errs, errs.join("\n")).toEqual([])
})

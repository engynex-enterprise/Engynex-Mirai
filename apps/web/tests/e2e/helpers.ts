import { expect, type Page } from "@playwright/test"
import { QA, setQaPlan, setQaWelcome } from "./qa"

/** Entra con el usuario QA (en Premium, salvo que se pida Gratis) y pasa la bienvenida si hace falta. */
export async function login(page: Page, plan: "premium" | "gratis" = "premium", { welcome = false } = {}) {
  await page.goto("/login")
  await page.getByLabel("Correo").fill(QA.email)
  await page.getByLabel("Contraseña", { exact: true }).fill(QA.password)
  await page.getByRole("button", { name: "Entrar" }).click()
  const start = page.getByRole("button", { name: "Empezar" })
  await expect(start.or(page.getByRole("button", { name: "Cómo funciona" }))).toBeVisible({ timeout: 30_000 })
  if (await start.isVisible()) { await start.click(); await page.waitForURL(/puesta/) }
  await setQaPlan(plan)
  await setQaWelcome(!welcome)
  await page.reload()
}

/** Junta errores de página y de consola. */
export function watchErrors(page: Page) {
  const list: string[] = []
  page.on("pageerror", (e) => list.push(e.message))
  page.on("console", (m) => m.type() === "error" && !/favicon|Failed to load resource|React DevTools/.test(m.text()) && list.push(m.text()))
  return list
}

export const shot = (page: Page, name: string, project: string) => page.screenshot({ path: `tests/.out/${name}-${project}.png`, fullPage: true })

/**
 * Crea una entidad (banco o casa de empeño) desde el selector de una deuda. Si ya existía con ese nombre (p. ej. en un
 * reintento), el formulario la escoge sola sin abrir la ventana: así nunca se crean dos iguales.
 */
export async function crearEntidad(page: Page, combo: string | RegExp, nombre: string, crear: RegExp, buscar = "Buscar…") {
  await page.getByRole("combobox", { name: combo }).click()
  await page.getByPlaceholder(buscar).fill(nombre)
  await page.getByRole("option", { name: crear }).first().click()
  const btn = page.getByRole("button", { name: "Crear y usar" })
  if (await btn.waitFor({ timeout: 4000 }).then(() => true, () => false)) {
    await expect(page.getByRole("textbox", { name: "Nombre", exact: true })).toHaveValue(nombre)
    await btn.click()
  }
  await expect(page.getByRole("combobox", { name: combo })).toContainText(nombre)
}

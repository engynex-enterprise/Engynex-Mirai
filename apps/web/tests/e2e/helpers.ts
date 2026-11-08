import { expect, type Page } from "@playwright/test"
import { clearAuthLimits, QA, setQaDefaultBook, setQaPlan, setQaWelcome } from "./qa"

/** Entra con el usuario QA (en Premium, salvo que se pida Gratis) y pasa la bienvenida si hace falta. */
export async function login(page: Page, plan: "premium" | "gratis" = "premium", { welcome = false } = {}) {
  await clearAuthLimits() // Better Auth limita a 5 entradas por minuto por IP
  await setQaDefaultBook()
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
  // "Viewport size changed": el navegador aborta una View Transition cuando la captura fullPage de Playwright cambia el
  // tamaño de la ventana a mitad de la animación. No es un error de Mirai (en el celular pasaría al girarlo, sin efecto).
  page.on("pageerror", (e) => !/Transition was aborted because of invalid state/.test(e.message) && list.push(e.message))
  page.on("console", (m) => m.type() === "error" && !/favicon|Failed to load resource|React DevTools/.test(m.text()) && list.push(m.text()))
  return list
}

/** Captura de página completa en tests/.out/<nombre>-<proyecto>.png. */
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

/**
 * V7-H3: después de dar el permiso de administrador directo en la base. Con todo por la API, la API guarda el contexto
 * de la persona 30 s (CONTEXT_TTL_MS), así que se reintenta hasta que la consola abre. Sin la API abre a la primera.
 */
export async function waitForAdmin(page: Page) {
  await expect(async () => {
    await page.goto("/admin")
    const h1 = page.getByRole("heading", { level: 1 }).first()
    await expect(h1).toBeVisible({ timeout: 15_000 })
    await expect(h1).not.toHaveText("No encontramos esta página", { timeout: 500 })
  }).toPass({ timeout: 75_000, intervals: [3_000] })
}

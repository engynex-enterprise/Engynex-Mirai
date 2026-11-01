import { expect, type Page } from "@playwright/test"
import { QA, setQaPlan } from "./qa"

/** Entra con el usuario QA (en Premium, salvo que se pida Gratis) y pasa la bienvenida si hace falta. */
export async function login(page: Page, plan: "premium" | "gratis" = "premium") {
  await page.goto("/login")
  await page.getByLabel("Correo").fill(QA.email)
  await page.getByLabel("Contraseña", { exact: true }).fill(QA.password)
  await page.getByRole("button", { name: "Entrar" }).click()
  const start = page.getByRole("button", { name: "Empezar" })
  await expect(start.or(page.getByRole("button", { name: "Cómo funciona" }))).toBeVisible({ timeout: 30_000 })
  if (await start.isVisible()) { await start.click(); await page.waitForURL(/puesta/) }
  await setQaPlan(plan)
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

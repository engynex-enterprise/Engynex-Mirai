import { expect, test } from "@playwright/test"
import { login, watchErrors } from "./helpers"

test("correo del banco y Google Calendar piden conectar Google", async ({ page }) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/correo")
  await expect(page.getByText("Conecta tu Gmail")).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole("button", { name: "Conectar con Google" })).toBeVisible()
  await page.goto("/recordatorios")
  await page.getByRole("button", { name: "Google Calendar" }).click()
  await expect(page.getByText(/Conecta tu cuenta de Google/)).toBeVisible({ timeout: 30_000 })
  expect(errs, errs.join("\n")).toEqual([])
})

import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

test("puesta en marcha: progreso, omitir y deshacer", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/puesta")
  await expect(page.getByText("pasos completados")).toBeVisible()
  const step = page.locator("li", { hasText: "Anota tus gastos fijos" })
  const skip = step.getByRole("button", { name: "No tengo gastos fijos" })
  if (await skip.isVisible()) {
    await skip.click()
    await expect(step.getByText("Omitido")).toBeVisible()
    await shot(page, "puesta", info.project.name)
    await step.getByRole("button", { name: "Deshacer" }).click()
    await expect(step.getByText("Omitido")).toHaveCount(0)
  }
  // El menú muestra el avance N/9
  if (info.project.name === "escritorio") await expect(page.getByText(/^\d\/9$/).first()).toBeVisible()
  expect(errs, errs.join("\n")).toEqual([])
})

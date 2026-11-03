import { expect, test } from "@playwright/test"
import { login } from "./helpers"

test("el campo de dinero no pierde dígitos al teclear 4.550.000", async ({ page }) => {
  await login(page)
  await page.goto("/gastos?nuevo=1")
  const valor = page.getByRole("textbox", { name: "Valor" })
  await valor.click()
  await valor.pressSequentially("4550000", { delay: 40 })
  await expect(valor).toHaveValue("4.550.000")
  await valor.blur()
  await expect(valor).toHaveValue("4.550.000")
  await valor.click()
  await valor.press("End")
  await valor.press("Backspace")
  await expect(valor).toHaveValue("455.000")
})

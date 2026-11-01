import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

test("consejero: frase → formulario → análisis, historial y chat que lleva al consejero", async ({ page }, info) => {
  test.setTimeout(240_000)
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/puesta")
  await page.getByRole("button", { name: "Ver un ejemplo" }).click()
  await expect(page.getByText("Datos de ejemplo cargados")).toBeVisible({ timeout: 60_000 })
  await page.waitForURL(/inicio/)

  await page.goto("/consejero")
  await page.getByRole("button", { name: "Comprar un celular de 3 millones a 12 cuotas con la tarjeta" }).click()
  await page.getByRole("button", { name: "Continuar" }).click()
  await expect(page.getByRole("button", { name: "Analizar si me conviene" })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole("textbox", { name: "¿En cuántas cuotas?" })).toHaveValue("12")
  await page.getByRole("button", { name: "Analizar si me conviene" }).click()
  await expect(page.getByText(/Te alcanza|Puedes, pero con cuidado|Mejor no, por ahora/).first()).toBeVisible({ timeout: 90_000 })
  await expect(page.getByText("Los números que importan")).toBeVisible()
  await expect(page.getByText(/Cuota mensual \(12\)/)).toBeVisible()
  await page.getByRole("radio", { name: "Vista financiera" }).click()
  await expect(page.getByText("Deudas / ingreso (DTI)")).toBeVisible()
  await shot(page, "consejero", info.project.name)
  await expect(page.getByText("Consultas anteriores").locator("..").getByText(/celular/i).first()).toBeVisible()

  // Elegir un tipo directo: prestar
  await page.goto("/consejero")
  await page.getByRole("button", { name: "Prestarle dinero a alguien" }).click()
  await page.getByRole("textbox", { name: "¿Qué es?" }).fill("Préstamo a mi primo")
  await page.getByRole("textbox", { name: "¿Cuánto vas a prestar?" }).fill("500000")
  await page.getByRole("button", { name: "Analizar si me conviene" }).click()
  await expect(page.getByText(/Te alcanza|Puedes, pero con cuidado|Mejor no, por ahora/).first()).toBeVisible({ timeout: 90_000 })

  // Chat
  await page.getByRole("button", { name: "Abrir chat del asesor" }).click()
  await expect(page.getByRole("dialog", { name: "Asesor financiero" })).toBeVisible()
  await expect(page.getByText("¿En qué te ayudo hoy?")).toBeVisible()
  await shot(page, "chat", info.project.name)
  await page.getByRole("button", { name: "¿Me conviene sacar una tarjeta de crédito?" }).click()
  await expect(page.getByText(/Consejo antes de gastar|consejero/i).last()).toBeVisible({ timeout: 90_000 })
  await page.waitForURL(/consejero\?desde=chat/, { timeout: 30_000 })
  await expect(page.getByRole("button", { name: "Analizar si me conviene" })).toBeVisible({ timeout: 60_000 })
  expect(errs, errs.join("\n")).toEqual([])
})

import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { setQaPlan } from "./qa"

// Consejero sin formulario: la decisión se escribe en el chat y el análisis sale como tarjeta. Si falta el valor, Mirai
// lo pregunta en la conversación. Se prueba en plan Gratis para que el análisis sea solo con reglas (sin IA).
test.afterAll(async () => { await setQaPlan("premium") })

test("consejero: decisión en el chat → pregunta lo que falta → tarjeta con cifras y vista financiera", async ({ page }, info) => {
  test.setTimeout(240_000)
  const errs = watchErrors(page)
  await login(page, "gratis")
  await page.evaluate(() => { sessionStorage.setItem("mirai-ad-modal", "1") })
  await page.goto("/puesta")
  await page.getByRole("button", { name: "Ver un ejemplo" }).click()
  await expect(page.getByText("Datos de ejemplo cargados")).toBeVisible({ timeout: 60_000 })
  await page.waitForURL(/inicio/)

  await page.goto("/consejero")
  await page.getByRole("button", { name: "Nueva conversación" }).first().click()
  const box = page.getByRole("textbox", { name: "Escribe tu pregunta" })
  const log = page.getByRole("log", { name: "Conversación con Mirai" })

  // Falta el valor: lo pregunta y la respuesta completa el análisis
  await box.fill("¿Me conviene sacar una tarjeta de crédito?")
  await box.press("Enter")
  await expect(log.getByText(/De cuánto es el cupo/)).toBeVisible({ timeout: 30_000 })
  await box.fill("5 millones")
  await box.press("Enter")
  await expect(log.getByTestId("decision-card").last()).toBeVisible({ timeout: 30_000 })
  await expect(log.getByTestId("decision-card").last().getByText("La cuota de manejo cuesta al año")).toBeVisible()

  // Compra a cuotas: cifras propias de este tipo
  await box.fill("¿Me conviene comprar un celular de 3 millones a 12 cuotas?")
  await box.press("Enter")
  const card = log.getByTestId("decision-card").last()
  await expect(card.getByText(/Pagarías cada mes, durante 12 meses/)).toBeVisible({ timeout: 30_000 })
  await expect(card.getByText(/Te alcanza|Puedes, pero con cuidado|Mejor no, por ahora/).first()).toBeVisible()
  await expect(card.getByText("¿Por qué?")).toBeVisible()
  await expect(card.getByText("Qué te recomiendo")).toBeVisible()
  await card.getByRole("button", { name: "Ver detalle financiero" }).click()
  await expect(card.getByText("Deudas / ingreso (DTI)").first()).toBeVisible()
  await shot(page, "consejero", info.project.name)
  expect(errs, errs.join("\n")).toEqual([])
})

import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

// Abonos a una suscripción: el cobro de $50.000 se paga en dos partes. Con el abono, el cobro sigue pendiente con lo
// que falta y la suscripción NO pasa al siguiente cobro; al pagar el resto, sí pasa.
test("suscripción: abonar parte del cobro y pagar lo que falta", async ({ page }, info) => {
  test.setTimeout(150_000)
  const errs = watchErrors(page)
  await login(page)
  const nombre = `Gimnasio QA ${info.project.name} ${Date.now() % 100000}`
  await page.goto("/suscripciones?nuevo=1")
  await page.getByRole("textbox", { name: "Servicio" }).fill(nombre)
  await page.getByRole("textbox", { name: "Valor" }).fill("50000")
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText(`${nombre} guardada`)).toBeVisible({ timeout: 20_000 })

  const row = page.locator("#main li", { hasText: nombre }).first()
  await expect(row).toBeVisible({ timeout: 30_000 })
  const antes = (await row.getByText(/próximo cobro/).first().textContent())!
  const accion = async (label: string) => {
    if (info.project.name === "movil") { await row.getByRole("button", { name: "Más acciones" }).click(); await page.getByRole("menuitem", { name: label }).click() }
    else await row.getByRole("button", { name: label }).click()
  }

  // 1) Abono de $20.000: el cobro sigue pendiente con $30.000 y la fecha del próximo cobro no se mueve.
  await accion(`Registrar un abono a ${nombre}`)
  const dlg = page.getByRole("dialog")
  await dlg.getByRole("textbox", { name: "¿Cuánto pagaste?" }).fill("20000")
  await expect(dlg.getByRole("radio", { name: /Es un abono/ })).toBeChecked()
  await shot(page, "sub-abono", info.project.name)
  await dlg.getByRole("button", { name: "Registrar abono" }).click()
  await expect(page.getByText("Abono registrado").first()).toBeVisible({ timeout: 20_000 })
  await expect(row.getByText(/próximo cobro/).first()).toHaveText(antes)

  // 2) Vuelve a abrir el abono: dice lo que ya abonaste y sugiere lo que falta.
  await accion(`Registrar un abono a ${nombre}`)
  await expect(dlg.getByText(/ya abonaste/i)).toBeVisible({ timeout: 20_000 })
  await expect(dlg.getByRole("textbox", { name: "¿Cuánto pagaste?" })).toHaveValue(/30\.000/)
  await dlg.getByRole("button", { name: "Registrar cobro" }).click()
  await expect(page.getByText("Cobro registrado").first()).toBeVisible({ timeout: 20_000 })
  // Pagado completo: ahora sí pasa al siguiente cobro.
  await expect(row.getByText(/próximo cobro/).first()).not.toHaveText(antes)

  expect(errs, errs.join("\n")).toEqual([])
})

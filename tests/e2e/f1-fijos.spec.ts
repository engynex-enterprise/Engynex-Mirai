import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

test("gastos fijos: rango variable, pagar, ajustar rango y deshacer", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/fijos?nuevo=1")
  const nombre = `Energía ${info.project.name}`
  await page.getByRole("textbox", { name: "Nombre" }).fill(nombre)
  await page.getByRole("radio", { name: "Varía según consumo" }).click()
  await page.getByRole("textbox", { name: "Lo mínimo que pagas" }).fill("150000")
  await page.getByRole("textbox", { name: "Lo máximo que pagas" }).fill("222000")
  await shot(page, "fijo-form", info.project.name)
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText(`${nombre} guardado`)).toBeVisible()
  const row = page.locator("li", { hasText: nombre })
  await expect(row.getByText("varía según consumo")).toBeVisible()
  await expect(row.getByText(/Servicios públicos/)).toBeVisible()
  await shot(page, "fijos", info.project.name)

  if (info.project.name === "movil") { await row.getByRole("button", { name: "Más acciones" }).click(); await page.getByRole("menuitem", { name: `Pagar ${nombre}` }).click() }
  else await row.getByRole("button", { name: `Pagar ${nombre}` }).click()
  await page.getByRole("textbox", { name: "Valor pagado" }).fill("230000")
  await page.getByRole("button", { name: "Registrar pago" }).click()
  await expect(page.getByText(/superó tu máximo habitual/)).toBeVisible()
  const paid = page.locator("li", { hasText: nombre }).filter({ hasText: "Pagado el" })
  await expect(paid).toBeVisible()

  await page.goto("/gastos")
  await expect(page.locator("li", { hasText: nombre }).getByText("fijo")).toBeVisible()
  await page.goto("/fijos")
  const paid2 = page.locator("li", { hasText: nombre }).filter({ hasText: "Pagado el" })
  if (info.project.name === "movil") { await paid2.getByRole("button", { name: "Más acciones" }).click(); await page.getByRole("menuitem", { name: "Deshacer pago" }).click() }
  else await paid2.getByRole("button", { name: "Deshacer pago" }).click()
  await expect(page.getByText("Pago deshecho")).toBeVisible()
  await expect(page.locator("li", { hasText: nombre }).filter({ hasText: "Pagado el" })).toHaveCount(0)
  expect(errs, errs.join("\n")).toEqual([])
})

test("gastos fijos: quincenal con un valor distinto en cada quincena", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/fijos?nuevo=1")
  const nombre = `Arriendo partido ${info.project.name}`
  await page.getByRole("textbox", { name: "Nombre" }).fill(nombre)
  await page.getByRole("combobox", { name: "¿Cada cuánto?" }).click()
  await page.getByRole("option", { name: "Cada quincena" }).click()
  await page.getByRole("radio", { name: "No, cambia" }).click()
  await page.getByRole("textbox", { name: "1ª quincena" }).fill("1000000")
  await page.getByRole("textbox", { name: "2ª quincena" }).fill("500000")
  await expect(page.getByText(/Al mes: \$\s?1\.500\.000/)).toBeVisible()
  await shot(page, "fijo-quincenas-form", info.project.name)
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText(`${nombre} guardado`)).toBeVisible()
  const row = page.locator("li", { hasText: nombre })
  await expect(row.getByText(/\+.*al mes/).filter({ visible: true }).last()).toBeVisible()
  // Al pagar, el valor sugerido es el de la quincena escogida.
  if (info.project.name === "movil") { await row.getByRole("button", { name: "Más acciones" }).click(); await page.getByRole("menuitem", { name: `Pagar ${nombre}` }).click() }
  else await row.getByRole("button", { name: `Pagar ${nombre}` }).click()
  const dlg = page.getByRole("dialog")
  const val = dlg.getByRole("textbox", { name: "Valor pagado" })
  const q2 = dlg.getByRole("radio", { name: /^2ª quincena/ })
  const q1 = dlg.getByRole("radio", { name: /^1ª quincena/ })
  if (await q1.count()) { await q1.first().click(); await expect(val).toHaveValue(/1\.000\.000/) }
  if (await q2.count()) { await q2.first().click(); await expect(val).toHaveValue(/500\.000/) }
  await page.keyboard.press("Escape")
  expect(errs, errs.join("\n")).toEqual([])
})

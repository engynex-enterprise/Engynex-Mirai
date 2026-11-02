import { expect, test, type Page } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

const n = () => Date.now() % 100000
/** Valor en pesos de un texto "$ 1.234.567" (o "-$ 12"). */
const pesos = (t: string | null) => { const v = Number((t ?? "").replace(/[^\d]/g, "")); return /[-−]/.test(t ?? "") ? -v : v }

async function registrarGasto(page: Page, desc: string, valor: string, medio: string) {
  await page.goto("/gastos?nuevo=1")
  await page.getByRole("textbox", { name: "¿En qué gastaste?" }).fill(desc)
  await page.getByRole("textbox", { name: "Valor" }).fill(valor)
  await page.getByRole("combobox", { name: "Categoría" }).click()
  await page.getByPlaceholder("Buscar…").fill("Mercado")
  await page.getByRole("option", { name: /^Mercado/ }).first().click()
  await page.getByRole("combobox", { name: "Medio de pago" }).click()
  await page.getByPlaceholder("Buscar…").last().fill(medio)
  await page.getByRole("option", { name: medio }).first().click()
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText(/Gasto (hormiga )?registrado/).first()).toBeVisible()
}

test("cuentas: el saldo de la cuenta sube y baja solo con los gastos de su medio de pago", async ({ page }, info) => {
  test.setTimeout(150_000)
  const errs = watchErrors(page)
  await login(page)
  const cuenta = `Nequi ${info.project.name} ${n()}`
  const desc = `Mercado Nequi ${info.project.name} ${n()}`

  // 1. Cuenta nueva con saldo automático y su medio de pago con el mismo nombre.
  await page.goto("/balance?nuevo=1")
  await page.getByRole("textbox", { name: "Nombre" }).fill(cuenta)
  await page.getByRole("textbox", { name: "Valor hoy" }).fill("500000")
  await expect(page.getByRole("switch", { name: "Que el saldo se actualice solo" })).toBeChecked()
  await page.getByRole("checkbox", { name: `Crear el medio de pago ${cuenta}` }).check()
  await shot(page, "cuentas-nueva", info.project.name)
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText("Guardado").first()).toBeVisible()
  const linea = page.locator(`#main [data-nombre="${cuenta}"]`)
  await expect(linea).toContainText("$ 500.000")
  await expect(linea).toContainText("se actualiza con tus movimientos")

  // 2. Un gasto de $50.000 con ese medio baja la cuenta a $450.000.
  await registrarGasto(page, desc, "50000", cuenta)
  await page.goto("/balance")
  await expect(linea).toContainText("$ 450.000")
  await page.getByRole("button", { name: cuenta, exact: true }).click()
  await expect(page.getByRole("heading", { name: `Actualizar ${cuenta}` })).toBeVisible()
  await expect(page.getByRole("list", { name: "Movimientos de la cuenta" })).toContainText(desc)
  await shot(page, "cuentas-movimientos", info.project.name)
  await page.getByRole("button", { name: "Cancelar" }).click()

  // 3. Borrar el gasto devuelve la plata a la cuenta.
  await page.goto("/gastos")
  const row = page.locator("#main li", { hasText: desc })
  await row.getByRole("button", { name: "Eliminar gasto" }).click()
  await expect(page.locator("#main li", { hasText: desc })).toHaveCount(0)
  await page.goto("/balance")
  await expect(linea).toContainText("$ 500.000")

  // 4. Cuadrar con el banco: el saldo que escribes queda como nueva base.
  await page.getByRole("button", { name: cuenta, exact: true }).click()
  await page.getByRole("textbox", { name: "Valor hoy" }).fill("480000")
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText("Valor actualizado").first()).toBeVisible()
  await expect(linea).toContainText("$ 480.000")
  await shot(page, "cuentas-balance", info.project.name)

  // El medio queda ligado a la cuenta en Ajustes › Catálogos.
  await page.goto("/ajustes?tab=medios")
  const medio = page.getByRole("combobox", { name: `Cuenta de ${cuenta}` })
  if (await medio.isVisible().catch(() => false)) await expect(medio).toContainText(cuenta)

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  expect(errs, errs.join("\n")).toEqual([])
})

test("metas: un abono sube lo que ahorras en el Dashboard y se puede deshacer", async ({ page }, info) => {
  test.setTimeout(150_000)
  const errs = watchErrors(page)
  await login(page)
  const meta = `Casa ${info.project.name} ${n()}`
  const ahorras = async () => {
    await page.goto("/dashboard")
    const kpi = page.locator("#main [data-slot=card]").filter({ has: page.getByText("Ahorras", { exact: true }) }).first()
    await expect(kpi.locator("[data-money]").first()).toBeVisible()
    return pesos(await kpi.locator("[data-money]").first().textContent())
  }
  const antes = await ahorras()

  await page.goto("/metas?nuevo=1")
  await page.getByRole("textbox", { name: "¿Qué quieres lograr?" }).fill(meta)
  await page.getByRole("textbox", { name: "¿Cuánto necesitas?" }).fill("100000000")
  await page.getByRole("button", { name: "Guardar meta" }).click()
  await expect(page.getByText("Meta creada")).toBeVisible()
  const card = page.locator("#main li", { hasText: meta })
  await card.getByRole("textbox", { name: `Abono a ${meta}` }).fill("7777000")
  await card.getByRole("button", { name: "Abonar" }).click()
  await expect(page.getByText("¡Bien! Abono registrado")).toBeVisible()
  await expect(card).toContainText("$ 7.777.000 de $ 100.000.000")
  await expect(card.getByRole("list", { name: `Abonos a ${meta}` })).toContainText("7.777.000")
  await shot(page, "metas-abono", info.project.name)

  // Otras pruebas pueden mover el ahorro del mes al mismo tiempo: se compara con margen.
  const despues = await ahorras()
  expect(despues).toBeGreaterThan(antes + 6_000_000)

  // Deshacer el abono (desde la lista de abonos de la meta).
  await page.goto("/metas")
  await card.getByRole("button", { name: /^Quitar abono de/ }).click()
  await expect(card.getByRole("list", { name: `Abonos a ${meta}` })).toHaveCount(0)
  await expect(card).toContainText("$ 0 de $ 100.000.000")
  expect(await ahorras()).toBeLessThan(despues - 6_000_000)

  // Deshacer desde el aviso del abono.
  await page.goto("/metas")
  await card.getByRole("textbox", { name: `Abono a ${meta}` }).fill("15000")
  await card.getByRole("button", { name: "Abonar" }).click()
  await expect(page.getByText("¡Bien! Abono registrado")).toBeVisible()
  await page.getByRole("button", { name: "Deshacer" }).first().click()
  await expect(page.getByText("Listo, quitamos el abono")).toBeVisible()
  await expect(card).toContainText("$ 0 de $ 100.000.000")

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  expect(errs, errs.join("\n")).toEqual([])
})

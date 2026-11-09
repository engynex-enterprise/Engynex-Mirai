import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

test("ingresos: salario bruto con descuentos de nómina", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/ingresos?nuevo=1")
  const concepto = `Salario ${info.project.name}`
  // Primer paso: SOLO los tipos de ingreso, agrupados por familia. Nada de campos ni de botón Guardar.
  await expect(page.getByRole("heading", { name: "¿Qué tipo de ingreso es?" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Guardar" })).toHaveCount(0)
  await expect(page.getByRole("textbox", { name: "Concepto" })).toHaveCount(0)
  await expect(page.getByRole("radio", { name: "Salario", exact: true })).not.toBeChecked()
  await expect(page.getByRole("radio", { name: "Horas extras y recargos" })).toBeVisible()
  await expect(page.getByRole("radio", { name: "Pensión" })).toBeVisible()
  await shot(page, "ingreso-tipos", info.project.name)
  await page.getByRole("radio", { name: "Salario", exact: true }).click()
  // Con el tipo escogido aparecen sus campos; Guardar sigue inactivo hasta que haya un valor.
  await expect(page.getByRole("button", { name: "Guardar" })).toBeDisabled()
  await page.getByRole("textbox", { name: "Concepto" }).fill(concepto)
  await expect(page.getByRole("textbox", { name: /¿Cuánto/ })).toHaveCount(0)
  await page.getByRole("radio", { name: "Sí, me descuentan" }).click()
  await page.getByRole("textbox", { name: /¿Cuánto ganas al mes\?/ }).fill("9500000")
  // El detalle de descuentos queda plegado; el resumen de la derecha ya muestra cada uno.
  await expect(page.getByRole("switch", { name: "Salud" })).toHaveCount(0)
  await expect(page.getByText("− Salud")).toBeVisible()
  await expect(page.getByText("− Pensión")).toBeVisible()
  await page.getByRole("radio", { name: "Cada quincena" }).click()
  await expect(page.getByRole("textbox", { name: "1ª quincena" })).toHaveValue("4.750.000")
  await expect(page.getByRole("button", { name: "Guardar" })).toBeEnabled()
  await shot(page, "ingreso-form", info.project.name)
  // "Más detalle" cambia la ventana a la vista completa; Atrás vuelve al formulario con lo escrito.
  await page.getByRole("button", { name: /Más detalle/ }).click()
  await expect(page.getByRole("heading", { name: "Detalle del ingreso" })).toBeVisible()
  await expect(page.getByText("Lo que te llega a la cuenta", { exact: true })).toBeVisible()
  await expect(page.getByText("Próximas fechas de pago")).toBeVisible()
  await shot(page, "ingreso-detalle", info.project.name)
  await page.getByRole("button", { name: "Atrás" }).click()
  await expect(page.getByRole("textbox", { name: "Concepto" })).toHaveValue(concepto)
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText(/1ª quincena te llegan .* y 2ª quincena .*descuentos del mes/)).toBeVisible()
  const row = page.locator("#main li", { hasText: concepto }).first()
  await expect(row.getByText("neto")).toBeVisible()
  await expect(row.getByText(/^Bruto \$/)).toBeVisible()
  // Las tarjetas de arriba se arman con las frecuencias reales: con un salario quincenal salen las dos quincenas.
  await expect(page.getByText("Te llega al mes").first()).toBeVisible()
  await expect(page.getByText(/^De .* antes de descuentos/).first()).toBeVisible()
  await expect(page.getByText(/1ª quincena \(1–\d+\)/).first()).toBeVisible()
  await expect(page.getByText(/2ª quincena \(\d+–fin\)/).first()).toBeVisible()
  await shot(page, "ingresos", info.project.name)
  expect(errs, errs.join("\n")).toEqual([])
})

test("ingresos flexibles: comprobante de nómina real, bono por quincena, valores distintos y pago diario", async ({ page }, info) => {
  const errs = watchErrors(page)
  const p = info.project.name
  await login(page)
  const nuevo = async (tipo: string, concepto: string, desc: "Sí, me descuentan" | "No, me llega completo") => {
    await page.goto("/ingresos?nuevo=1")
    await page.getByRole("radio", { name: tipo }).click()
    await page.getByRole("textbox", { name: "Concepto" }).fill(concepto)
    await page.getByRole("radio", { name: desc }).click()
  }
  const row = (t: string) => page.locator("#main li", { hasText: t })
  const resumen = page.getByTestId("ingreso-resumen")

  // Sueldo $9.175.000, retención por procedimiento 2 (4,38 %) y todos los descuentos en la 2ª quincena.
  await nuevo("Salario", `Nómina ${p}`, "Sí, me descuentan")
  await page.getByRole("textbox", { name: /¿Cuánto ganas al mes\?/ }).fill("9175000")
  await page.getByRole("button", { name: /Ajustar descuentos/ }).click()
  await expect(page.getByRole("button", { name: /¿Te descuentan algo más\?/ })).toBeVisible()
  await page.getByRole("radio", { name: "Procedimiento 2 (% fijo)" }).click()
  await page.getByRole("textbox", { name: "Porcentaje de retención" }).fill("4,38")
  await page.getByRole("radio", { name: "Cada quincena" }).click()
  await expect(page.getByRole("textbox", { name: "1ª quincena" })).toHaveValue("4.587.500")
  await expect(page.getByRole("textbox", { name: "2ª quincena" })).toHaveValue("4.587.500")
  await page.getByRole("radio", { name: "Todo en la 2ª quincena" }).click()
  await expect(resumen).toContainText(/\$\s?1\.099\.800/)
  await shot(page, "ingreso-quincenas-form", p)
  await page.getByRole("button", { name: /Más detalle/ }).click()
  const detalle = page.getByTestId("ingreso-detalle")
  await expect(detalle).toContainText(/\$\s?4\.587\.500/)
  await expect(detalle).toContainText(/\$\s?3\.487\.700/)
  await page.getByRole("button", { name: "Volver" }).click()
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText(/1ª quincena te llegan \$\s?4\.587\.500 y 2ª quincena \$\s?3\.487\.700/)).toBeVisible()
  await expect(row(`Nómina ${p}`).getByText(/1ª quincena \$\s?4\.587\.500 · 2ª quincena \$\s?3\.487\.700 · descuentos en la 2ª/)).toBeVisible()

  // Apoyo de conectividad: $60.000 al mes, $30.000 en cada quincena y sin descuentos.
  await nuevo("Bono o auxilio", `Conectividad ${p}`, "No, me llega completo")
  await page.getByRole("textbox", { name: "¿Cuánto recibes al mes?" }).fill("60000")
  await page.getByRole("radio", { name: "Cada quincena" }).click()
  await expect(page.getByRole("textbox", { name: "1ª quincena" })).toHaveValue("30.000")
  await page.getByRole("button", { name: "Guardar" }).click()
  // La lista muestra siempre el valor del mes y, debajo, cuánto es cada pago.
  await expect(row(`Conectividad ${p}`).getByText(/^\$\s?60\.000$/).filter({ visible: true }).first()).toBeVisible()
  await expect(row(`Conectividad ${p}`).getByText(/al mes · \$\s?30\.000 cada quincena/).filter({ visible: true }).first()).toBeVisible()

  // Auxilio que cambia: $200.000 en la 1ª y $50.000 en la 2ª, con días propios (las cajitas se ajustan a mano).
  await nuevo("Bono o auxilio", `Auxilio ${p}`, "No, me llega completo")
  await page.getByRole("textbox", { name: "¿Cuánto recibes al mes?" }).fill("250000")
  await page.getByRole("radio", { name: "Cada quincena" }).click()
  await page.getByRole("textbox", { name: "1ª quincena" }).fill("200000")
  await page.getByRole("textbox", { name: "2ª quincena" }).fill("50000")
  await page.getByRole("spinbutton", { name: "Día de pago 1ª quincena" }).fill("5")
  await page.getByRole("spinbutton", { name: "Día de pago 2ª quincena" }).fill("20")
  await expect(page.getByRole("textbox", { name: "¿Cuánto recibes al mes?" })).toHaveValue("250.000")
  await page.getByRole("button", { name: "Guardar" }).click()
  const aux = row(`Auxilio ${p}`)
  await expect(aux.getByText("Cada quincena (5 y 20)", { exact: false })).toBeVisible()
  await expect(aux.getByText(/1ª quincena \$\s?200\.000 · 2ª quincena \$\s?50\.000/)).toBeVisible()

  // Pago diario: $2.200.000 al mes en 22 días = $100.000 por día.
  await nuevo("Otro ingreso", `Jornal ${p}`, "No, me llega completo")
  await page.getByRole("textbox", { name: "¿Cuánto recibes al mes?" }).fill("2200000")
  await page.getByRole("radio", { name: "Cada día" }).click()
  await page.getByRole("spinbutton", { name: "¿Cuántos días te pagan al mes?" }).fill("22")
  await expect(page.getByRole("textbox", { name: "Cada día" })).toHaveValue("100.000")
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(row(`Jornal ${p}`).getByText("Cada día (22 días al mes)", { exact: false })).toBeVisible()
  await expect(row(`Jornal ${p}`).getByText(/^\$\s?2\.200\.000$/).filter({ visible: true }).first()).toBeVisible()

  // Al editar se entra directo al formulario, con el tipo ya escogido y el reparto que tenía.
  await aux.click()
  const dlg = page.getByRole("dialog")
  await expect(dlg.getByText("Bono o auxilio").first()).toBeVisible()
  await expect(page.getByRole("textbox", { name: "1ª quincena" })).toHaveValue("200.000")
  // "Cambiar" vuelve a la lista de tipos, con el suyo marcado; al tocarlo se regresa al formulario.
  await dlg.getByRole("button", { name: "Cambiar" }).click()
  await expect(page.getByRole("radio", { name: "Bono o auxilio" })).toBeChecked()
  await page.getByRole("radio", { name: "Bono o auxilio" }).click()
  await expect(page.getByRole("textbox", { name: "1ª quincena" })).toHaveValue("200.000")
  await page.getByRole("button", { name: "Cancelar" }).click()
  await shot(page, "ingresos-quincenas", p)
  expect(errs, errs.join("\n")).toEqual([])
})

test("ajustes de nómina: procedimiento de retención por defecto y tabla del fondo de solidaridad", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/ajustes?tab=finanzas")
  await expect(page.getByText("Nómina (descuentos de empleados)")).toBeVisible()
  await expect(page.getByRole("spinbutton", { name: "Porcentaje, fila 1" })).toHaveValue("1")
  await page.getByRole("combobox").filter({ hasText: "Procedimiento 1 (tabla)" }).click()
  await page.getByRole("option", { name: "Procedimiento 2 (% fijo)" }).click()
  const pct = page.getByRole("spinbutton", { name: "Porcentaje del procedimiento 2" })
  await pct.fill("4.38")
  await pct.blur()
  await shot(page, "ajustes-nomina", info.project.name)
  // Un ingreso nuevo de salario ya trae el procedimiento 2 con ese porcentaje.
  await page.goto("/ingresos?nuevo=1")
  await expect(page.getByRole("heading", { name: "¿Qué tipo de ingreso es?" })).toBeVisible({ timeout: 20_000 })
  await page.getByRole("radio", { name: "Salario", exact: true }).click()
  await page.getByRole("radio", { name: "Sí, me descuentan" }).click()
  await page.getByRole("textbox", { name: /¿Cuánto ganas al mes\?/ }).fill("9175000")
  await expect(page.getByTestId("ingreso-resumen")).toContainText(/\$\s?274\.000/)
  await page.getByRole("button", { name: "Cancelar" }).click()
  // Se deja como estaba.
  await page.goto("/ajustes?tab=finanzas")
  await page.getByRole("combobox").filter({ hasText: "Procedimiento 2 (% fijo)" }).click()
  await page.getByRole("option", { name: "Procedimiento 1 (tabla)" }).click()
  await expect(page.getByRole("spinbutton", { name: "Porcentaje del procedimiento 2" })).toHaveCount(0)
  expect(errs, errs.join("\n")).toEqual([])
})

// Ingresos extra: la plata que llega una sola vez (una venta, un regalo). Antes solo se veía en el Balance y no había
// dónde corregirla; ahora tiene su lista en Ingresos.
test("ingresos extra: agregar, ver en la lista, editar y eliminar", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  const desc = `Venta bici ${info.project.name} ${Date.now() % 100000}`
  await page.goto("/ingresos")
  await expect(page.getByText("Ingresos extra", { exact: true }).first()).toBeVisible({ timeout: 30_000 })
  await page.getByRole("button", { name: "Agregar ingreso extra" }).first().click()
  const dlg = page.getByRole("dialog")
  await dlg.getByRole("textbox", { name: "¿De qué fue?" }).fill(desc)
  await dlg.getByRole("textbox", { name: "¿Cuánto recibiste?" }).fill("350000")
  await shot(page, "ingreso-extra-form", info.project.name)
  await dlg.getByRole("button", { name: "Agregar ingreso extra" }).click()
  await expect(page.getByText("Ingreso extra agregado").first()).toBeVisible({ timeout: 20_000 })
  const row = page.locator("#main li", { hasText: desc }).filter({ visible: true }).first()
  await expect(row.getByText(/\$\s?350\.000/).filter({ visible: true }).first()).toBeVisible()
  await expect(page.getByText(/Este mes llevas .* en ingresos extra/)).toBeVisible()

  // Editar: cambia el valor y la lista lo refleja.
  await row.click()
  await dlg.getByRole("textbox", { name: "¿Cuánto recibiste?" }).fill("400000")
  await dlg.getByRole("button", { name: "Guardar cambios" }).click()
  await expect(page.getByText("Ingreso extra actualizado").first()).toBeVisible({ timeout: 20_000 })
  await expect(page.locator("#main li", { hasText: desc }).filter({ visible: true }).first().getByText(/\$\s?400\.000/).filter({ visible: true }).first()).toBeVisible()
  await shot(page, "ingresos-extra", info.project.name)

  // Eliminar
  const fila = page.locator("#main li", { hasText: desc }).filter({ visible: true }).first()
  if (info.project.name === "movil") { await fila.getByRole("button", { name: "Más acciones" }).click(); await page.getByRole("menuitem", { name: `Eliminar ${desc}` }).click() }
  else await fila.getByRole("button", { name: `Eliminar ${desc}` }).click()
  await expect(page.getByText("Ingreso extra eliminado").first()).toBeVisible({ timeout: 20_000 })
  expect(errs, errs.join("\n")).toEqual([])
})

import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

test("ingresos: salario bruto con descuentos de nómina", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/ingresos?nuevo=1")
  const concepto = `Salario ${info.project.name}`
  // Paso a paso: nada viene marcado y cada pregunta aparece al responder la anterior.
  await expect(page.getByRole("radio", { name: "Salario" })).not.toBeChecked()
  // Guardar empieza inactivo: se activa cuando el formulario está completo.
  await expect(page.getByRole("button", { name: "Guardar" })).toBeDisabled()
  await expect(page.getByRole("textbox", { name: "Concepto" })).toHaveCount(0)
  await page.getByRole("radio", { name: "Salario" }).click()
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
  const row = page.locator("li", { hasText: concepto })
  await expect(row.getByText("neto")).toBeVisible()
  await expect(row.getByText(/^Bruto \$/)).toBeVisible()
  await expect(page.getByText("Ingreso mensual")).toBeVisible()
  // La tarjeta muestra lo que llega (con descuentos) y el valor antes de descuentos.
  await expect(page.getByText("con descuentos", { exact: true })).toBeVisible()
  await expect(page.getByText(/^Sin descuentos/).filter({ visible: true }).first()).toBeVisible()
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
  const row = (t: string) => page.locator("li", { hasText: t })
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
  await expect(row(`Conectividad ${p}`).getByText(/^\$\s?30\.000$/).filter({ visible: true }).first()).toBeVisible()

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

  // Al editar, el formulario recuerda el tipo y el reparto.
  await aux.click()
  await expect(page.getByRole("radio", { name: "Bono o auxilio" })).toBeChecked()
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
  await page.getByRole("radio", { name: "Salario" }).click()
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

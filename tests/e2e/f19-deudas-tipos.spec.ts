import { expect, test, type Page } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

// Registrar una deuda según su tipo: cada tipo muestra solo sus campos, con sus propias palabras, y el resumen de la
// derecha (al final en el celular) se arma en vivo. Corre en escritorio (1366 px) y en móvil (400 px).

const resumen = (page: Page) => page.getByTestId("loan-resumen")

test("deuda con el banco: entidad, cuota mensual, plazo, resumen y detalle de cuotas", async ({ page }, info) => {
  test.setTimeout(120_000)
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/le-debo?nuevo=1")
  // Paso 1: nada viene marcado; el resumen espera el tipo y el botón está inactivo.
  await expect(resumen(page)).toContainText("Escoge el tipo de deuda para empezar.")
  await expect(page.getByRole("button", { name: "Registrar deuda" })).toBeDisabled()
  await expect(page.getByRole("radio", { name: "Banco, cooperativa o financiera" })).toHaveAttribute("aria-checked", "false")
  await page.getByRole("radio", { name: "Banco, cooperativa o financiera" }).click()
  // Solo los campos del banco: nada de objeto en garantía ni datos de una persona.
  await expect(page.getByRole("textbox", { name: "¿Qué objeto dejaste?" })).toHaveCount(0)
  await expect(page.getByRole("textbox", { name: "Nombre completo" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Leer con foto" })).toBeVisible()
  const banco = `Cooperativa QA ${info.project.name}`
  await page.getByRole("combobox", { name: /banco o entidad/i }).click()
  await page.getByPlaceholder("Buscar…").fill(banco)
  await page.getByRole("option", { name: /Crear banco o entidad/ }).first().click()
  await expect(page.getByRole("textbox", { name: "Nombre", exact: true })).toHaveValue(banco)
  await page.getByRole("button", { name: "Crear y usar" }).click()
  await expect(page.getByRole("combobox", { name: /banco o entidad/i })).toContainText(banco)
  await page.getByRole("radio", { name: "Vehículo" }).click()
  await expect(page.getByRole("spinbutton", { name: "Plazo en meses" })).toHaveValue("60")
  await page.getByRole("textbox", { name: "¿Cuánto te prestaron?" }).fill("20000000")
  await page.getByRole("radio", { name: /Sé la cuota/ }).click()
  await page.getByRole("textbox", { name: "Cuota mensual" }).fill("520000")
  await page.getByRole("spinbutton", { name: "Plazo en meses" }).fill("48")
  // El resumen muestra la cuota, las fechas, los intereses y la tasa frente a la usura.
  await expect(resumen(page)).toContainText("Cooperativa QA")
  await expect(resumen(page)).toContainText("Primer pago")
  await expect(resumen(page)).toContainText("Último pago")
  await expect(resumen(page)).toContainText("PAGARÁS EN TOTAL")
  await expect(page.getByTestId("loan-usura")).toContainText(/E\.A\./)
  await expect(page.getByRole("button", { name: "Registrar deuda" })).toBeEnabled()
  await shot(page, "deuda-banco-form", info.project.name)
  // "Más detalle" abre la tabla completa en la misma ventana; Atrás vuelve con lo escrito.
  await page.getByRole("button", { name: /Más detalle/ }).click()
  await expect(page.getByRole("heading", { name: "Detalle de la deuda" })).toBeVisible()
  await expect(page.getByTestId("loan-detalle")).toContainText("Las 48 cuotas")
  await expect(page.getByTestId("loan-detalle")).toContainText("En palabras")
  await shot(page, "deuda-banco-detalle", info.project.name)
  await page.getByRole("button", { name: "Atrás" }).click()
  await expect(page.getByRole("textbox", { name: "Cuota mensual" })).toHaveValue("520.000")
  await page.getByRole("button", { name: "Registrar deuda" }).click()
  await expect(page.getByText("Deuda registrada.")).toBeVisible()
  await expect(page.getByRole("heading", { name: banco })).toBeVisible()
  await expect(page.getByTestId("loan-titulo")).toHaveText(`Crédito con ${banco}`)
  // Filtro por tipo en la lista.
  await page.getByRole("button", { name: "Filtros" }).first().click()
  await page.getByRole("checkbox", { name: "Banco, cooperativa o financiera" }).click()
  await page.keyboard.press("Escape")
  await expect(page.getByTestId("loan-tipo").filter({ hasText: "Crédito" }).first()).toBeVisible()
  expect(errs, errs.join("\n")).toEqual([])
})

test("fiado: tienda nueva, valor de la compra fiada, una sola fecha y sin intereses", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/le-debo?nuevo=1")
  await page.getByRole("radio", { name: "Fiado en una tienda o negocio" }).click()
  // Textos propios del fiado: nada de "¿cuánto te prestaron?".
  await expect(page.getByRole("textbox", { name: "¿Cuánto te prestaron?" })).toHaveCount(0)
  await expect(page.getByRole("spinbutton", { name: /cuotas/ })).toHaveCount(0)
  await expect(page.getByRole("radio", { name: "En una sola fecha" })).toHaveAttribute("aria-checked", "true")
  await expect(page.getByRole("radio", { name: "No, solo lo que compré" })).toHaveAttribute("aria-checked", "true")
  const tienda = `Tienda Don Pepe ${info.project.name}`
  await page.getByRole("combobox", { name: /Tienda o negocio/ }).click()
  await page.getByPlaceholder("Buscar o escribir un proveedor…").fill(tienda)
  await page.getByRole("option", { name: /Agregar proveedor/ }).first().click()
  await expect(page.getByRole("combobox", { name: /Tienda o negocio/ })).toContainText(tienda)
  await page.getByRole("textbox", { name: "¿Cuánto fue lo que te fiaron?" }).fill("85000")
  await page.getByRole("textbox", { name: "¿Qué compraste?" }).fill("Mercado de la semana")
  await expect(resumen(page)).toContainText("Valor fiado")
  await expect(resumen(page)).toContainText("Sin intereses")
  await shot(page, "deuda-fiado-form", info.project.name)
  await page.getByRole("button", { name: "Registrar fiado" }).click()
  await expect(page.getByText("Fiado registrado.")).toBeVisible()
  await expect(page.getByTestId("loan-titulo")).toHaveText(`Fiado en ${tienda}`)
  await expect(page.getByRole("link", { name: new RegExp(`Proveedor: ${tienda}`) })).toBeVisible()
  expect(errs, errs.join("\n")).toEqual([])
})

test("préstamo de una persona: alguien nuevo, cuotas sin intereses y nota del acuerdo", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/le-debo?nuevo=1")
  await page.getByRole("radio", { name: "Préstamo de una persona" }).click()
  await expect(page.getByRole("button", { name: "Leer con foto" })).toHaveCount(0)
  const nombre = `Tía Marta ${info.project.name}`
  await page.getByRole("radio", { name: "Alguien nuevo" }).click()
  await page.getByRole("textbox", { name: "Nombre completo" }).fill(nombre)
  await page.getByRole("textbox", { name: "¿Cuánto te prestó?" }).fill("600000")
  await expect(page.getByRole("radio", { name: "En cuotas" })).toHaveAttribute("aria-checked", "true")
  await page.getByRole("radio", { name: "3", exact: true }).click()
  // Sin intereses por defecto: no hay campos de tasa.
  await expect(page.getByRole("textbox", { name: "Interés mensual (%)" })).toHaveCount(0)
  await page.getByRole("textbox", { name: "Nota del acuerdo (opcional)" }).fill("Le pago cuando me llegue la prima")
  await expect(page.getByText("Descargar el acuerdo de pago en PDF al guardar")).toBeVisible()
  await expect(resumen(page)).toContainText(nombre)
  await expect(resumen(page)).toContainText("Sin intereses")
  // En el celular el resumen va al final del formulario.
  if (info.project.name === "movil") {
    const nota = await page.getByRole("textbox", { name: "Nota del acuerdo (opcional)" }).boundingBox()
    const res = await resumen(page).boundingBox()
    expect(res!.y).toBeGreaterThan(nota!.y)
  }
  await shot(page, "deuda-persona-form", info.project.name)
  await page.getByRole("button", { name: "Registrar deuda" }).click()
  await expect(page.getByText("Deuda registrada.")).toBeVisible()
  await expect(page.getByRole("heading", { name: nombre })).toBeVisible()
  await expect(page.getByText("Le pago cuando me llegue la prima")).toBeVisible()
  await expect(page.getByText("0 de 3 cuotas")).toBeVisible()
  expect(errs, errs.join("\n")).toEqual([])
})

test("cambiar de tipo cambia los campos y el botón", async ({ page }) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/le-debo?nuevo=1")
  await page.getByRole("radio", { name: "Empeño" }).click()
  await expect(page.getByRole("textbox", { name: "¿Qué objeto dejaste?" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Registrar empeño" })).toBeDisabled()
  await page.getByRole("radio", { name: "Compra a cuotas en un almacén" }).click()
  await expect(page.getByRole("textbox", { name: "¿Qué objeto dejaste?" })).toHaveCount(0)
  await expect(page.getByRole("textbox", { name: "Cuota inicial (opcional)" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Registrar compra" })).toBeDisabled()
  // El gota a gota muestra el aviso de riesgo (no se promueve).
  await page.getByRole("radio", { name: "Gota a gota o prestamista" }).click()
  await expect(page.getByText("Ten mucho cuidado con este préstamo")).toBeVisible()
  await page.getByRole("textbox", { name: "¿Cuánto te prestaron?" }).fill("500000")
  await page.getByRole("textbox", { name: "¿Cuánto pagas cada día?" }).fill("25000")
  await expect(page.getByTestId("loan-usura")).toContainText("Supera la tasa de usura")
  expect(errs, errs.join("\n")).toEqual([])
})

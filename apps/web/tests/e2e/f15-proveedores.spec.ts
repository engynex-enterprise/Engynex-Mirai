import { expect, test, type Page } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

// Fila de la tabla de proveedores: <tr> en escritorio y tarjeta <li> en el celular (DataTable dibuja una sola versión).
const fila = (page: Page, nombre: string) => page.getByTestId("data-table").locator("tr, li").filter({ hasText: nombre })

// Cierra el detalle. El primer Escape puede cerrar solo un tooltip abierto; en el celular el Drawer (sin botón Cerrar)
// sigue en el DOM mientras termina su animación: se espera a que se vaya antes de insistir.
async function cerrar(page: Page) {
  await page.keyboard.press("Escape")
  const dlg = page.getByRole("dialog")
  await expect(dlg).toHaveCount(0, { timeout: 3_000 }).catch(async () => {
    const x = dlg.getByRole("button", { name: "Cerrar" })
    if (await x.count()) await x.last().click()
    else await page.keyboard.press("Escape")
  })
  await expect(dlg).toHaveCount(0)
}

async function accion(page: Page, nombre: string, item: string) {
  const row = fila(page, nombre).first()
  await row.scrollIntoViewIfNeeded()
  await row.getByRole("button", { name: "Más acciones" }).click()
  await page.getByRole("menuitem", { name: item }).click()
}

test("proveedores: crear desde el módulo, editar y eliminar con Deshacer", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  const nombre = `Inmobiliaria QA ${info.project.name} ${Date.now() % 1e6}`
  await page.goto("/proveedores")
  await expect(page.getByRole("heading", { name: "Proveedores", level: 1, exact: true })).toBeVisible()
  await page.getByRole("button", { name: "Agregar proveedor" }).first().click()
  const dlg = page.getByRole("dialog")
  await dlg.getByRole("textbox", { name: /Nombre del proveedor/ }).fill(nombre)
  // El tipo se sugiere solo por el nombre ("Inmobiliaria" → Arriendo y administración).
  await expect(dlg.getByRole("combobox", { name: /Tipo/ })).toContainText("Arriendo y administración")
  await dlg.getByRole("textbox", { name: /Número de contrato o de cliente/ }).fill("998877")
  await shot(page, "proveedor-form", info.project.name)
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText("Proveedor agregado").first()).toBeVisible()
  await expect(fila(page, nombre).first()).toBeVisible()
  await expect(fila(page, nombre).first().getByText(/Ref\. 998877/)).toBeVisible()
  await shot(page, "proveedores", info.project.name)

  // Editar: teléfono
  await accion(page, nombre, "Editar")
  await page.getByRole("dialog").getByRole("textbox", { name: /Teléfono/ }).fill("6015551234")
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText("Proveedor actualizado").first()).toBeVisible()
  // La columna Contacto viene oculta: el teléfono (con formato) está en el detalle › Datos.
  await fila(page, nombre).first().getByRole("button", { name: nombre, exact: true }).click()
  await page.getByRole("dialog").getByRole("tab", { name: "Datos" }).click()
  await expect(page.getByRole("dialog").getByText("(601) 555 1234")).toBeVisible()
  await cerrar(page)

  // Eliminar con Deshacer
  await accion(page, nombre, "Eliminar")
  await expect(fila(page, nombre)).toHaveCount(0)
  await page.getByRole("button", { name: "Deshacer" }).click()
  await expect(fila(page, nombre).first()).toBeVisible()

  // Limpieza
  await accion(page, nombre, "Eliminar")
  await expect(fila(page, nombre)).toHaveCount(0)
  expect(errs, errs.join("\n")).toEqual([])
})

test("proveedores: crear desde el selector dentro de Gasto fijo y verlo en el módulo", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  const sufijo = `${info.project.name} ${Date.now() % 1e6}`
  const prov = `Empresa de energía QA ${sufijo}`
  const nombre = `Energía con proveedor ${sufijo}`
  await page.goto("/fijos?nuevo=1")
  const dlg = page.getByRole("dialog")
  await dlg.getByRole("textbox", { name: "Nombre" }).fill(nombre)
  await dlg.getByRole("textbox", { name: "Valor" }).fill("180000")

  // «¿A quién le pagas?» › Negocio o empresa: el proveedor se elige de una lista; si no existe, se agrega desde el
  // mismo selector (id f-prov: su nombre accesible cambia con lo elegido).
  await dlg.getByRole("radio", { name: "Negocio o empresa" }).click()
  await dlg.locator("#f-prov").click()
  await page.getByPlaceholder("Buscar o escribir un proveedor…").fill(prov)
  await page.getByRole("option", { name: `Agregar proveedor “${prov}”` }).click()
  await expect(page.getByText("Proveedor agregado").first()).toBeVisible()
  await expect(dlg.locator("#f-prov")).toContainText(prov)
  // Su tipo (servicios públicos) sugiere la categoría del gasto fijo.
  await expect(dlg.getByRole("combobox", { name: "Categoría" })).toContainText("Servicios públicos")
  await shot(page, "fijo-con-proveedor", info.project.name)
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText(`${nombre} guardado`)).toBeVisible()
  // La lista de gastos fijos sigue mostrando el nombre del proveedor (columna de texto sincronizada).
  await expect(page.locator("#main li", { hasText: nombre }).getByText(prov)).toBeVisible()

  // Al volver a abrir el formulario, el proveedor ya está elegido (no se escribe otra vez).
  const li = page.locator("#main li", { hasText: nombre }).first()
  if (info.project.name === "movil") { await li.getByRole("button", { name: "Más acciones" }).click(); await page.getByRole("menuitem", { name: `Editar ${nombre}` }).click() }
  else await li.getByRole("button", { name: `Editar ${nombre}` }).click()
  // Al editarlo, «¿A quién le pagas?» abre en Negocio o empresa con el proveedor elegido.
  await expect(page.getByRole("dialog").getByRole("radio", { name: "Negocio o empresa" })).toHaveAttribute("aria-checked", "true")
  await expect(page.getByRole("dialog").locator("#f-prov")).toContainText(prov)
  await page.keyboard.press("Escape")

  await page.goto("/proveedores")
  const row = fila(page, prov).first()
  await expect(row).toBeVisible()
  // Por defecto solo se ven Proveedor, Próximo pago, Le debes / Te debe y Estado: el gasto fijo sale como próximo pago.
  await expect(row.getByText(/180\.000/).first()).toBeVisible()
  await shot(page, "proveedores-uso", info.project.name)

  // Limpieza: el gasto fijo y el proveedor
  await page.goto("/fijos")
  const fijo = page.locator("#main li", { hasText: nombre }).first()
  await fijo.scrollIntoViewIfNeeded()
  if (info.project.name === "movil") { await fijo.getByRole("button", { name: "Más acciones" }).click(); await page.getByRole("menuitem", { name: /Eliminar/ }).click() }
  else await fijo.getByRole("button", { name: `Eliminar ${nombre}` }).click()
  await expect(page.locator("#main li", { hasText: nombre })).toHaveCount(0)
  await page.goto("/proveedores")
  await accion(page, prov, "Eliminar")
  await expect(fila(page, prov)).toHaveCount(0)
  expect(errs, errs.join("\n")).toEqual([])
})

test("proveedores: pestaña en Ajustes y menú", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/ajustes?tab=proveedores")
  await expect(page.getByRole("heading", { name: "Proveedores", level: 2, exact: true })).toBeVisible()
  await expect(page.getByTestId("data-table")).toBeVisible()
  await expect(page.getByRole("link", { name: "Abrir la sección Proveedores" })).toBeVisible()
  await shot(page, "ajustes-proveedores", info.project.name)
  expect(errs, errs.join("\n")).toEqual([])
})

test("proveedores: medio de pago preferido, próximo pago, detalle y deuda enlazada con Le debo", async ({ page }, info) => {
  test.setTimeout(120_000)
  const errs = watchErrors(page)
  await login(page)
  const sufijo = `${info.project.name} ${Date.now() % 1e6}`
  const prov = `Almacén QA ${sufijo}`
  const fijo = `Cuota almacén ${sufijo}`

  // Proveedor con medio de pago preferido
  await page.goto("/proveedores")
  await page.getByRole("button", { name: "Agregar proveedor" }).first().click()
  const dlg = page.getByRole("dialog")
  await dlg.getByRole("textbox", { name: /Nombre del proveedor/ }).fill(prov)
  await dlg.getByRole("combobox", { name: /Medio de pago preferido/ }).click()
  await page.getByRole("option", { name: /^Transferencia/ }).click()
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText("Proveedor agregado").first()).toBeVisible()
  // El medio preferido (columna oculta por defecto) se ve en el detalle › Datos.
  await fila(page, prov).first().getByRole("button", { name: prov, exact: true }).click()
  await page.getByRole("dialog").getByRole("tab", { name: "Datos" }).click()
  await expect(page.getByRole("dialog").getByText("Transferencia").first()).toBeVisible()
  await cerrar(page)

  // Gasto fijo con ese proveedor: sugiere su medio de pago y aparece como próximo pago
  await page.goto("/fijos?nuevo=1")
  const f = page.getByRole("dialog")
  await f.getByRole("textbox", { name: "Nombre" }).fill(fijo)
  await f.getByRole("textbox", { name: "Valor" }).fill("90000")
  await f.getByRole("radio", { name: "Negocio o empresa" }).click()
  await f.locator("#f-prov").click()
  await page.getByPlaceholder("Buscar o escribir un proveedor…").fill(prov)
  await page.getByRole("option", { name: new RegExp(prov) }).first().click()
  await expect(f.getByRole("combobox", { name: /Medio de pago|¿Con qué/ }).first()).toContainText("Transferencia")
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText(`${fijo} guardado`)).toBeVisible()
  await page.goto("/proveedores")
  await expect(fila(page, prov).first().getByText(/90\.000/).first()).toBeVisible()

  // Detalle del proveedor: contacto, enlazados y botón para registrar una deuda
  // Tocar el nombre del proveedor abre su detalle.
  await fila(page, prov).first().getByRole("button", { name: prov, exact: true }).click()
  const det = page.getByRole("dialog")
  await expect(det.getByRole("heading", { name: /Gastos fijos/ })).toBeVisible()
  await expect(det.getByRole("link", { name: new RegExp(fijo) })).toBeVisible()
  await shot(page, "proveedor-detalle", info.project.name)
  await det.getByRole("link", { name: "Registrar una deuda con este proveedor" }).click()
  await expect(page).toHaveURL(/\/le-debo\?nuevo=1&prov=/)
  const loan = page.getByRole("dialog")
  // Desde un proveedor, la deuda se abre como fiado: la tienda o negocio ya escogido y un solo pago en una fecha.
  await expect(loan.getByRole("radio", { name: "Fiado en una tienda o negocio" })).toHaveAttribute("aria-checked", "true")
  await expect(loan.getByRole("combobox", { name: /Tienda o negocio/ })).toContainText(prov)
  await expect(loan.getByRole("radio", { name: "En una sola fecha" })).toHaveAttribute("aria-checked", "true")
  await loan.getByRole("textbox", { name: "¿Cuánto fue lo que te fiaron?" }).fill("300000")
  await page.getByRole("button", { name: "Registrar fiado" }).click()
  await expect(page.getByText("Fiado registrado.")).toBeVisible()
  await expect(page.getByRole("link", { name: new RegExp(`Proveedor: ${prov}`) })).toBeVisible()

  // De vuelta en Proveedores: "Le debes" con el saldo y filtro "Le debes"
  await page.goto("/proveedores")
  await expect(fila(page, prov).first().getByText(/Le debes/).first()).toBeVisible()
  await page.getByRole("button", { name: "Filtros" }).click()
  await page.getByRole("checkbox", { name: "Le debes" }).click()
  await page.keyboard.press("Escape")
  await expect(fila(page, prov).first()).toBeVisible()
  await shot(page, "proveedores-deudas", info.project.name)
  expect(errs, errs.join("\n")).toEqual([])
})

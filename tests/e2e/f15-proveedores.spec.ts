import { expect, test, type Page } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

// Fila de la tabla de proveedores: <tr> en escritorio y tarjeta <li> en el celular (DataTable dibuja una sola versión).
const fila = (page: Page, nombre: string) => page.getByTestId("data-table").locator("tr, li").filter({ hasText: nombre })

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
  await expect(fila(page, nombre).first().getByText("6015551234")).toBeVisible()

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

  // El proveedor se elige de una lista; si no existe, se agrega desde el mismo selector.
  await dlg.getByRole("combobox", { name: "Proveedor" }).click()
  await page.getByPlaceholder("Buscar o escribir un proveedor…").fill(prov)
  await page.getByRole("option", { name: `Agregar proveedor “${prov}”` }).click()
  await expect(page.getByText("Proveedor agregado").first()).toBeVisible()
  await expect(dlg.getByRole("combobox", { name: "Proveedor" })).toContainText(prov)
  // Su tipo (servicios públicos) sugiere la categoría del gasto fijo.
  await expect(dlg.getByRole("combobox", { name: "Categoría" })).toContainText("Servicios públicos")
  await shot(page, "fijo-con-proveedor", info.project.name)
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText(`${nombre} guardado`)).toBeVisible()
  // La lista de gastos fijos sigue mostrando el nombre del proveedor (columna de texto sincronizada).
  await expect(page.locator("li", { hasText: nombre }).getByText(prov)).toBeVisible()

  // Al volver a abrir el formulario, el proveedor ya está elegido (no se escribe otra vez).
  const li = page.locator("li", { hasText: nombre }).first()
  if (info.project.name === "movil") { await li.getByRole("button", { name: "Más acciones" }).click(); await page.getByRole("menuitem", { name: `Editar ${nombre}` }).click() }
  else await li.getByRole("button", { name: `Editar ${nombre}` }).click()
  await expect(page.getByRole("dialog").getByRole("combobox", { name: "Proveedor" })).toContainText(prov)
  await page.keyboard.press("Escape")

  await page.goto("/proveedores")
  const row = fila(page, prov).first()
  await expect(row).toBeVisible()
  await expect(row.getByText("1 gasto fijo")).toBeVisible()
  await expect(row.getByText(/180\.000/).first()).toBeVisible()
  await shot(page, "proveedores-uso", info.project.name)

  // Limpieza: el gasto fijo y el proveedor
  await page.goto("/fijos")
  const fijo = page.locator("li", { hasText: nombre }).first()
  await fijo.scrollIntoViewIfNeeded()
  if (info.project.name === "movil") { await fijo.getByRole("button", { name: "Más acciones" }).click(); await page.getByRole("menuitem", { name: /Eliminar/ }).click() }
  else await fijo.getByRole("button", { name: `Eliminar ${nombre}` }).click()
  await expect(page.locator("li", { hasText: nombre })).toHaveCount(0)
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

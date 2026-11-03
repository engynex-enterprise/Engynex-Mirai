import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

test("me deben: préstamo con interés, pagos previos, registrar y deshacer pago", async ({ page }, info) => {
  test.setTimeout(120_000)
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/me-deben?nuevo=1")
  const nombre = `Carlos ${info.project.name}`
  // Paso 1: el tipo de préstamo (nada viene marcado y el botón empieza inactivo).
  await expect(page.getByTestId("loan-resumen")).toContainText("Escoge el tipo de préstamo para empezar.")
  await expect(page.getByRole("button", { name: "Registrar préstamo" })).toBeDisabled()
  await page.getByRole("radio", { name: "Le presté a una persona" }).click()
  await page.getByRole("radio", { name: "Alguien nuevo" }).click()
  await page.getByRole("textbox", { name: "Nombre completo" }).fill(nombre)
  await page.getByRole("textbox", { name: "¿Cuánto le prestaste?" }).fill("1000000")
  await page.getByRole("radio", { name: "6", exact: true }).click()
  await page.getByRole("radio", { name: /Sí, sé el porcentaje/ }).click()
  await page.getByRole("textbox", { name: "Interés mensual (%)" }).fill("2")
  await expect(page.getByText(/cada mes/).first()).toBeVisible()
  await expect(page.getByTestId("loan-usura")).toContainText(/≈ .* E\.A\./)
  await page.getByRole("radio", { name: "Ya se pagaron algunas cuotas" }).click()
  await page.getByRole("spinbutton", { name: "¿Cuántas cuotas ya se pagaron?" }).fill("2")
  await expect(page.getByText(/Así quedará registrado/)).toBeVisible()
  await shot(page, "prestamo-form", info.project.name)
  // Cruzar los 768 px con la ventana abierta (girar el celular, achicar la ventana) no borra lo escrito.
  const vp = page.viewportSize()!
  await page.setViewportSize({ width: vp.width > 767 ? 600 : 1000, height: vp.height })
  await page.waitForTimeout(300)
  await page.setViewportSize(vp)
  await expect(page.getByRole("textbox", { name: "¿Cuánto le prestaste?" })).toHaveValue("1.000.000")
  await expect(page.getByRole("textbox", { name: "Nombre completo" })).toHaveValue(nombre)
  await page.getByRole("button", { name: "Registrar préstamo" }).click()
  await expect(page.getByText("Préstamo registrado.")).toBeVisible()
  await expect(page.getByRole("heading", { name: nombre })).toBeVisible()
  await expect(page.getByText("2 de 6 cuotas")).toBeVisible()
  await shot(page, "prestamo-detalle", info.project.name)

  await page.getByRole("button", { name: "Registrar pago" }).first().click()
  await page.getByRole("dialog").getByRole("button", { name: "Registrar pago" }).click()
  await expect(page.getByText("Cuota registrada")).toBeVisible()
  await expect(page.getByText("3 de 6 cuotas")).toBeVisible()
  await page.getByRole("tab", { name: "Pagos recibidos" }).click()
  // En el celular la barra inferior y los avisos pueden quedar encima del botón: se pulsa directo.
  await page.getByRole("tabpanel").getByRole("button", { name: "Deshacer" }).first().dispatchEvent("click")
  await expect(page.getByText("2 de 6 cuotas")).toBeVisible()
  expect(errs, errs.join("\n")).toEqual([])
})

test("le debo: registrar empeño con objeto y fecha límite", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/le-debo")
  // Ya no hay un botón aparte de Empeño: es un tipo más dentro de Nueva deuda.
  await expect(page.getByRole("button", { name: "Registrar empeño" })).toHaveCount(0)
  await page.getByRole("button", { name: "Nueva deuda" }).first().click()
  await page.getByRole("radio", { name: "Empeño" }).click()
  // La casa de empeño siempre es una entidad (nunca un nombre suelto): se crea ahí mismo y queda para la próxima vez.
  await expect(page.getByText("Queda en Contactos › Bancos y entidades.")).toBeVisible()
  const casa = `Compraventa ${info.project.name}`
  await page.getByRole("combobox", { name: "Casa de empeño o compraventa" }).click()
  await page.getByPlaceholder("Buscar o escribir el nombre…").fill(casa)
  await expect(page.getByRole("option", { name: /Usar el nombre/ })).toHaveCount(0)
  await page.getByRole("option", { name: /Crear casa de empeño/ }).click()
  // La ventana arranca con el nombre escrito y el tipo "Casa de empeño" (en un reintento ya existe y se escoge sola).
  const crear = page.getByRole("button", { name: "Crear y usar" })
  if (await crear.waitFor({ timeout: 4000 }).then(() => true, () => false)) {
    await expect(page.getByRole("heading", { name: "Nueva casa de empeño" })).toBeVisible()
    await expect(page.getByRole("textbox", { name: "Nombre", exact: true })).toHaveValue(casa)
    await expect(page.getByRole("combobox", { name: "Tipo de entidad" })).toContainText("Casa de empeño")
    await crear.click()
  }
  await expect(page.getByRole("combobox", { name: "Casa de empeño o compraventa" })).toContainText(casa)
  await page.getByRole("textbox", { name: "¿Qué objeto dejaste?" }).fill("Cadena de oro")
  await page.getByRole("textbox", { name: "¿En cuánto lo avaluaron?" }).fill("900000")
  await page.getByRole("textbox", { name: "¿Cuánto te prestaron sobre el objeto?" }).fill("500000")
  // El interés habitual ya viene escrito; se cambia por el de la boleta.
  await expect(page.getByRole("textbox", { name: "Interés mensual (%)" })).toHaveValue("4")
  await page.getByRole("textbox", { name: "Interés mensual (%)" }).fill("5")
  await expect(page.getByText("Si no pagas a tiempo puedes perder el objeto").first()).toBeVisible()
  const resumen = page.getByTestId("loan-resumen")
  await expect(resumen).toContainText("Cadena de oro")
  await expect(resumen).toContainText("Fecha límite")
  await shot(page, "empeno-form", info.project.name)
  await page.getByRole("button", { name: "Registrar empeño" }).click()
  await expect(page.getByText("Empeño registrado.")).toBeVisible()
  await expect(page.getByRole("heading", { name: casa })).toBeVisible()
  await expect(page.getByText(/Objeto empeñado: Cadena de oro/)).toBeVisible()
  await expect(page.getByTestId("loan-titulo")).toHaveText("Empeño: Cadena de oro")
  await shot(page, "empeno", info.project.name)
  expect(errs, errs.join("\n")).toEqual([])
})

test("le debo: los enlaces de antes (?empeno=1) abren el tipo Empeño", async ({ page }) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/le-debo?nuevo=1&empeno=1")
  await expect(page.getByRole("radio", { name: "Empeño" })).toHaveAttribute("aria-checked", "true")
  await expect(page.getByRole("textbox", { name: "¿Qué objeto dejaste?" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Registrar empeño" })).toBeDisabled()
  expect(errs, errs.join("\n")).toEqual([])
})

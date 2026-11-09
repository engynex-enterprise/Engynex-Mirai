import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

test("balance: agregar cuenta, patrimonio y quincenas", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/balance?nuevo=activo")
  const nombre = `Ahorros ${info.project.name} ${Date.now() % 100000}`
  await page.getByRole("textbox", { name: "Nombre" }).fill(nombre)
  await page.getByRole("textbox", { name: "Valor hoy" }).fill("12400000")
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText(nombre)).toBeVisible()
  await expect(page.getByText("Patrimonio", { exact: true }).first()).toBeVisible()
  await expect(page.getByText("Lo que tengo", { exact: true }).first()).toBeVisible()
  await expect(page.getByRole("heading", { name: "Tu mes" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "¿Dónde está tu plata?" })).toBeVisible()
  // La cuenta T es la del periodo (lo que entra contra lo que se paga); el patrimonio va en su propia tarjeta.
  await expect(page.getByRole("heading", { name: /^Cuenta T de / })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Tu patrimonio hoy" })).toBeVisible()
  await expect(page.getByText("Lo que se paga", { exact: true })).toBeVisible()
  // Tu mes separa lo que sale de lo que ahorras.
  await expect(page.getByText("Ahorras", { exact: true }).first()).toBeVisible()

  // Actualizar el saldo de la cuenta tocando su nombre
  await page.getByRole("button", { name: nombre, exact: true }).click()
  await expect(page.getByRole("heading", { name: `Actualizar ${nombre}` })).toBeVisible()
  await page.getByRole("textbox", { name: "Valor hoy" }).fill("11900000")
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText("Valor actualizado")).toBeVisible()
  await expect(page.locator("#main").getByText("$ 11.900.000").first()).toBeVisible()
  await shot(page, "balance", info.project.name)

  // Exportar a Excel (CSV)
  const dl = page.waitForEvent("download")
  await page.getByRole("button", { name: "Exportar" }).click()
  expect((await dl).suggestedFilename()).toMatch(/^balance-.*\.csv$/)

  // El selector se arma con las frecuencias del libro: la QA cobra quincenal, así que están las dos quincenas.
  await expect(page.getByRole("radio", { name: "Mes completo" })).toBeVisible()
  await page.getByRole("radio", { name: "1ª quincena" }).click()
  await expect(page.getByText("Disponible del periodo")).toBeVisible()
  // Depende de los datos del usuario QA: o hay salidas (fijos, suscripciones, gasto por gastar) o el aviso de vacío.
  await expect(page.getByText("Salidas", { exact: true })).toBeVisible()
  await expect(page.getByText(/Te sobra|Te falta/).first()).toBeVisible()
  await shot(page, "quincena", info.project.name)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  expect(errs, errs.join("\n")).toEqual([])
})

test("balance: el gasto registrado en Gastos se ve en el Balance", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  const desc = `Ferretería ${info.project.name} ${Date.now() % 100000}`
  await page.goto("/gastos?nuevo=1")
  await page.getByRole("textbox", { name: "¿En qué gastaste?" }).fill(desc)
  await page.getByRole("textbox", { name: "Valor" }).fill("37000")
  await page.getByRole("combobox", { name: "Categoría" }).click()
  await page.getByPlaceholder("Buscar…").fill("Mercado")
  await page.getByRole("option", { name: /^Mercado/ }).first().click()
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText(/Gasto (hormiga )?registrado/).first()).toBeVisible()

  await page.goto("/balance")
  await expect(page.getByText("Gastos registrados:")).toBeVisible()
  await expect(page.getByText(/^en \d+ gastos?$/)).toBeVisible()

  await page.getByRole("radio", { name: "Mes completo" }).click()
  const fila = page.locator("#main").getByText(desc)
  await expect(fila).toBeVisible()
  await expect(page.getByText(/Incluye .* de \d+ gastos?/)).toBeVisible()
  await shot(page, "balance-mes-gasto", info.project.name)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  expect(errs, errs.join("\n")).toEqual([])
})

test("balance: entradas y salidas de todos los módulos, por periodo, módulo y estado", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/balance?tab=mes")
  await expect(page.getByText("Disponible del periodo")).toBeVisible()
  for (const k of ["Entra", "Sale", "Ahorras"]) await expect(page.locator("#main").getByText(k, { exact: true }).first()).toBeVisible()
  await expect(page.getByText("Entradas", { exact: true })).toBeVisible()
  await expect(page.getByText("Salidas", { exact: true })).toBeVisible()

  // Filtro por estado y por módulo (la lista de módulos sale de lo que hay en el periodo).
  await page.getByRole("radio", { name: "Pendiente" }).click()
  await expect(page.getByRole("radio", { name: "Pendiente" })).toHaveAttribute("data-state", "on")
  await page.getByRole("radio", { name: "Todo" }).click()
  await page.getByRole("combobox", { name: "Módulo" }).click()
  await expect(page.getByRole("option", { name: "Todos los módulos" })).toBeVisible()
  await page.keyboard.press("Escape")

  // Explicación en palabras simples.
  await page.getByText("¿Cómo se calcula? (en palabras simples)").click()
  await expect(page.getByText("Nada se cuenta dos veces", { exact: false })).toBeVisible()
  await shot(page, "balance-flujo-mes", info.project.name)

  // Año completo, con navegación de año en año.
  await page.getByRole("radio", { name: "Año" }).click()
  await expect(page.getByText(/^Año \d{4}$/)).toBeVisible()
  await page.getByRole("button", { name: "Periodo anterior" }).click()
  await expect(page.getByText(`Año ${new Date().getFullYear() - 1}`)).toBeVisible()
  await shot(page, "balance-flujo-anio", info.project.name)

  // Exportar el periodo con módulo, categoría y estado.
  const dl = page.waitForEvent("download")
  await page.getByRole("button", { name: "Exportar" }).click()
  expect((await dl).suggestedFilename()).toMatch(/^balance-ano-\d{4}-.*\.csv$/)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  expect(errs, errs.join("\n")).toEqual([])
})


import { expect, test, type Page } from "@playwright/test"
import { crearEntidad, login, shot, watchErrors } from "./helpers"
import { admin } from "./qa"

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
  await expect(page.getByText(/Queda en Contactos › Personas › Bancos y entidades/)).toBeVisible()
  await crearEntidad(page, /banco o entidad/i, banco, /Crear banco o entidad/)
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
  // La fecha del préstamo y desde cuándo se empieza a pagar van por separado; el aviso dice dónde caen las cuotas.
  await expect(page.getByText("¿Desde cuándo empiezas a pagar?")).toBeVisible()
  await expect(page.getByText(/3 cuotas, una cada mes: la primera el .* y la última el/)).toBeVisible()
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
  await page.getByRole("tab", { name: "Datos" }).click()
  await expect(page.getByText("Primera cuota")).toBeVisible()
  expect(errs, errs.join("\n")).toEqual([])
})

test("préstamo de una persona con intereses: valor fijo en cada cuota o en total, o porcentaje en total, ajustable", async ({ page }, info) => {
  test.setTimeout(120_000)
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/le-debo?nuevo=1")
  await page.getByRole("radio", { name: "Préstamo de una persona" }).click()
  const nombre = `Don Hernán ${info.project.name} ${Date.now() % 100000}`
  await page.getByRole("radio", { name: "Alguien nuevo" }).click()
  await page.getByRole("textbox", { name: "Nombre completo" }).fill(nombre)
  await page.getByRole("textbox", { name: "¿Cuánto te prestó?" }).fill("1000000")
  await page.getByRole("radio", { name: "6", exact: true }).click()

  // Valor fijo en cada cuota: $ 50.000 de intereses en cada una de las 6 → cuota de $ 216.667 y 5 % mensual.
  await page.getByRole("radio", { name: /Sí, un valor fijo/ }).click()
  await expect(page.getByRole("radio", { name: "En cada cuota" })).toHaveAttribute("aria-checked", "true")
  await page.getByRole("textbox", { name: "Intereses en cada cuota" }).fill("50000")
  await expect(resumen(page)).toContainText(/216\.667/)
  await expect(page.getByTestId("loan-usura").first()).toContainText(/5(,00)? % mensual/)
  await shot(page, "deuda-persona-valor-fijo", info.project.name)

  // En total: $ 120.000 entre las 6 cuotas → se pagan $ 1.120.000.
  await page.getByRole("radio", { name: "En total" }).click()
  await page.getByRole("textbox", { name: "Intereses en total" }).fill("120000")
  await expect(resumen(page)).toContainText(/1\.120\.000/)

  // Porcentaje en total: «me devuelves el 10 % más» → $ 100.000 de intereses, $ 1.100.000 en total.
  await page.getByRole("radio", { name: /Sí, un porcentaje/ }).click()
  await page.getByRole("radio", { name: "En total" }).click()
  await page.getByRole("textbox", { name: "Interés en total (%)" }).fill("10")
  await expect(page.getByText(/= \$\s?100\.000 de intereses/)).toBeVisible()
  await expect(resumen(page)).toContainText(/1\.100\.000/)
  // Con el porcentaje en total no se pregunta el sistema de la cuota (el interés va igual en cada una).
  await expect(page.getByText("¿Cómo se calcula la cuota?")).toHaveCount(0)

  // Se ajusta y se guarda: vuelve a valor fijo en cada cuota.
  await page.getByRole("radio", { name: /Sí, un valor fijo/ }).click()
  await page.getByRole("radio", { name: "En cada cuota" }).click()
  await page.getByRole("textbox", { name: /Intereses en/ }).fill("50000")
  await expect(resumen(page)).toContainText(/216\.667/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.getByRole("button", { name: "Registrar deuda" }).click()
  await expect(page.getByText("Deuda registrada.")).toBeVisible()
  await expect(page.getByRole("heading", { name: nombre })).toBeVisible()
  await expect(page.getByText(/216\.667/).first()).toBeVisible()
  expect(errs, errs.join("\n")).toEqual([])
})

test("préstamo de una persona en una sola fecha: interés del plazo en sus días, usura real y ciclos del interés", async ({ page }) => {
  test.setTimeout(120_000)
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/le-debo?nuevo=1")
  await page.getByRole("radio", { name: "Préstamo de una persona" }).click()
  await page.getByRole("radio", { name: "Alguien nuevo" }).click()
  await page.getByRole("textbox", { name: "Nombre completo" }).fill("Vecino QA")
  await page.getByRole("textbox", { name: "¿Cuánto te prestó?" }).fill("150000")
  await page.getByRole("radio", { name: "En una sola fecha" }).click()
  // Valor fijo: con un solo pago no hay «en cada cuota»; se paga $ 160.004 → $ 10.004 de intereses en 30 días.
  await page.getByRole("radio", { name: /Sí, un valor fijo/ }).click()
  await expect(page.getByRole("radio", { name: "En cada cuota" })).toHaveCount(0)
  await expect(page.getByRole("radio", { name: "En total" })).toHaveAttribute("aria-checked", "true")
  await page.getByRole("textbox", { name: "Intereses en total" }).fill("10004")
  await expect(resumen(page)).toContainText(/160\.004/)
  const usura = page.getByTestId("loan-usura").first()
  // Se muestra lo pactado en sus días (no una proyección mensual sin contexto) y la usura con la E.A. real del plazo.
  await expect(usura).toContainText(/6,67 % en 30 días/)
  await expect(usura).toContainText(/lo máximo legal serían unos \$\s?[\d.]+ de intereses/)
  // Otros ciclos: un porcentaje al día.
  await page.getByRole("radio", { name: /Sí, un porcentaje/ }).click()
  await page.getByRole("radio", { name: "Al día" }).click()
  await page.getByRole("textbox", { name: "Interés diario (%)" }).fill("0,05")
  await expect(usura).toContainText(/en 30 días/)
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
  // El gota a gota muestra el aviso de riesgo (no se promueve) y quien presta es un contacto (basta el apodo).
  await page.getByRole("radio", { name: "Gota a gota o prestamista" }).click()
  await expect(page.getByText("Ten mucho cuidado con este préstamo")).toBeVisible()
  await page.getByRole("radio", { name: "Alguien nuevo" }).click()
  await expect(page.getByRole("textbox", { name: "Nombre o apodo" })).toHaveAttribute("placeholder", "Ej. Don Jaime")
  await expect(page.getByRole("textbox", { name: "Número de documento" })).toHaveCount(0)
  await expect(page.getByText(/Basta con el nombre o como le dicen.*Queda en Contactos/)).toBeVisible()
  await page.getByRole("textbox", { name: "¿Cuánto te prestaron?" }).fill("500000")
  await page.getByRole("textbox", { name: "¿Cuánto pagas cada día?" }).fill("25000")
  await expect(page.getByTestId("loan-usura")).toContainText("Supera la tasa de usura")
  expect(errs, errs.join("\n")).toEqual([])
})

test("empeño en la misma compraventa: la segunda vez se escoge la que ya existe y no se repite", async ({ page }, info) => {
  test.setTimeout(120_000)
  const errs = watchErrors(page)
  await login(page)
  const casa = `Compraventa La Repetida ${info.project.name}`
  const combo = "Casa de empeño o compraventa"
  const buscar = "Buscar o escribir el nombre…"
  const empeno = async (obj: string) => {
    await page.getByRole("textbox", { name: "¿Qué objeto dejaste?" }).fill(obj)
    await page.getByRole("textbox", { name: "¿Cuánto te prestaron sobre el objeto?" }).fill("300000")
    await page.getByRole("button", { name: "Registrar empeño" }).click()
    await expect(page.getByText("Empeño registrado.")).toBeVisible()
    await expect(page.getByTestId("loan-titulo")).toHaveText(`Empeño: ${obj}`)
  }
  // Primer empeño: la compraventa se crea como entidad (tipo Casa de empeño).
  await page.goto("/le-debo?nuevo=1&empeno=1")
  await crearEntidad(page, combo, casa, /Crear casa de empeño/, buscar)
  await empeno("Anillo")
  // Segundo empeño: al escribir el nombre (con otras mayúsculas) aparece la que ya existe…
  await page.goto("/le-debo?nuevo=1&empeno=1")
  await page.getByRole("combobox", { name: combo }).click()
  await page.getByPlaceholder(buscar).fill(casa.toUpperCase())
  await expect(page.getByRole("option", { name: new RegExp(`^${casa}`) }).first()).toBeVisible()
  // …y aunque toque "Crear", se usa la existente en vez de crear otra.
  await page.getByRole("option", { name: /Crear casa de empeño/ }).click()
  await expect(page.getByText(`Ya tenías “${casa}”: la usamos`)).toBeVisible()
  await expect(page.getByRole("button", { name: "Crear y usar" })).toHaveCount(0)
  await expect(page.getByRole("combobox", { name: combo })).toContainText(casa)
  await empeno("Reloj")
  // En Contactos › Bancos y entidades queda una sola, con sus deudas.
  await page.goto("/personas?tab=entidades")
  await expect(page.getByRole("tab", { name: /Bancos y entidades/ })).toHaveAttribute("aria-selected", "true")
  await expect(page.getByRole("link", { name: "Ver en Proveedores" })).toBeVisible()
  await page.getByPlaceholder("Buscar por nombre o NIT").fill(casa)
  const cards = page.locator("[id^=e-]", { hasText: casa })
  await expect(cards).toHaveCount(1)
  await expect(cards).toContainText("Casa de empeño")
  await expect(cards).toContainText(/\d+ deudas/)
  await shot(page, "contactos-entidades", info.project.name)
  expect(errs, errs.join("\n")).toEqual([])
})

test("empeño con refrendo mes a mes: un Apple Watch por $ 450.000 con $ 45.000 de refrendo; lo pagado no baja la deuda", async ({ page }, info) => {
  test.setTimeout(150_000)
  const errs = watchErrors(page)
  await login(page)
  const casa = `Compraventa El Reloj ${info.project.name}`
  const obj = `Apple Watch ${info.project.name} ${Date.now() % 100000}`
  await page.goto("/le-debo?nuevo=1&empeno=1")
  await crearEntidad(page, "Casa de empeño o compraventa", casa, /Crear casa de empeño/, "Buscar o escribir el nombre…")
  await page.getByRole("textbox", { name: "¿Qué objeto dejaste?" }).fill(obj)
  await page.getByRole("textbox", { name: "¿En cuánto lo avaluaron?" }).fill("800000")
  await page.getByRole("textbox", { name: "¿Cuánto te prestaron sobre el objeto?" }).fill("450000")
  // Por defecto, refrendo mes a mes: no se pregunta el plazo.
  await expect(page.getByRole("radio", { name: /Refrendo mes a mes/ })).toHaveAttribute("aria-checked", "true")
  await expect(page.getByRole("textbox", { name: "¿Por cuántos meses?" })).toHaveCount(0)
  await page.getByRole("radio", { name: /Sí, un valor fijo/ }).click()
  await page.getByRole("textbox", { name: "Refrendo de cada mes" }).fill("45000")
  await expect(page.getByText("Equivale al 10 % mensual de lo que te prestaron.")).toBeVisible()
  await expect(page.getByText(/Así funciona el refrendo/)).toBeVisible()
  await shot(page, "empeno-refrendo-form", info.project.name)
  await page.getByRole("button", { name: "Registrar empeño" }).click()
  await expect(page.getByText("Empeño registrado.")).toBeVisible()
  const card = page.getByTestId("empeno-refrendo")
  await expect(card).toContainText(/Refrendo de cada mes: \$\s?45\.000/)
  await expect(card).toContainText(/Para recuperarlo hoy: \$\s?450\.000/)

  // El caso real: empeñado hace 5 meses y con 5 refrendos pagados → $ 225.000 en intereses y sigue debiendo $ 450.000.
  const sb = admin()
  const { data: L } = await sb.from("loans").select("id,book_id").eq("concepto", obj).single()
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date()).split("-").map(Number)
  const f = (k: number) => new Intl.DateTimeFormat("en-CA").format(new Date(y, m - 1 - k, Math.min(d, 28)))
  await sb.from("loans").update({ inicio: f(5) }).eq("id", L!.id)
  await sb.from("loan_payments").insert([4, 3, 2, 1, 0].map((k) => ({ book_id: L!.book_id, loan_id: L!.id, fecha: f(k), tipo: "cuota", valor: 45000 })))
  await page.reload()
  await expect(card).toContainText(/Llevas 5 refrendos: pagaste \$\s?225\.000 en intereses \(50 % de lo que te prestaron\) y sigues debiendo \$\s?450\.000/, { timeout: 30_000 })
  await expect(card).toContainText(/en 5 meses habrás pagado en intereses lo mismo que te prestaron/)
  await expect(card).toContainText(/o \$\s?495\.000 si la casa cobra también el refrendo del mes/)
  await expect(card).toContainText(/Con 3 refrendos más, lo pagado más lo que debes pasará de lo que vale/)
  await expect(card).toContainText(/veces el tope de usura/)
  await expect(card.getByText(/refrendos? atrasados?/)).toHaveCount(0)
  await shot(page, "empeno-refrendo-detalle", info.project.name)
  expect(errs, errs.join("\n")).toEqual([])
})

test("gota a gota: el prestamista queda en Contactos y no se repite", async ({ page }, info) => {
  test.setTimeout(120_000)
  const errs = watchErrors(page)
  await login(page)
  const apodo = `Don Jaime ${info.project.name}`
  await page.goto("/le-debo?nuevo=1&tipo=gota")
  await page.getByRole("radio", { name: "Gota a gota o prestamista" }).click()
  await page.getByRole("radio", { name: "Alguien nuevo" }).click()
  // Sin nombre no se puede guardar.
  await page.getByRole("textbox", { name: "¿Cuánto te prestaron?" }).fill("500000")
  await page.getByRole("textbox", { name: "¿Cuánto pagas cada día?" }).fill("25000")
  await expect(page.getByRole("button", { name: "Registrar deuda" })).toBeDisabled()
  const nombre = page.getByRole("textbox", { name: "Nombre o apodo" })
  await nombre.fill(apodo)
  // Se crea el contacto al guardar (en un reintento, si ya estaba, se usa ese mismo).
  await page.getByRole("button", { name: "Registrar deuda" }).click()
  await expect(page.getByText("Deuda registrada.")).toBeVisible()
  await expect(page.getByTestId("loan-titulo")).toHaveText(`Gota a gota · ${apodo}`)
  // La segunda vez, al escribir el mismo apodo se sugiere el contacto que ya existe.
  await page.goto("/le-debo?nuevo=1&tipo=gota")
  await page.getByRole("radio", { name: "Gota a gota o prestamista" }).click()
  await page.getByRole("radio", { name: "Alguien nuevo" }).click()
  await page.getByRole("textbox", { name: "Nombre o apodo" }).fill(apodo.toLowerCase())
  await expect(page.getByText(`Ya tienes a “${apodo}” en Contactos.`).first()).toBeVisible()
  await page.getByRole("button", { name: "Escogerlo" }).click()
  await expect(page.getByRole("combobox", { name: "Contacto" })).toContainText(apodo)
  await page.keyboard.press("Escape")
  await page.goto("/personas")
  await expect(page.locator("[id^=c-]", { hasText: apodo })).toHaveCount(1)
  expect(errs, errs.join("\n")).toEqual([])
})

test("deudas con la misma entidad: una sola tarjeta en la lista y una pestaña por deuda", async ({ page }, info) => {
  test.setTimeout(150_000)
  const errs = watchErrors(page)
  await login(page)
  const ent = `Banco Agrupado ${info.project.name} ${Date.now() % 1000}`
  for (const [i, [monto, cuota, plazo]] of [["8000000", "300000", "36"], ["2000000", "110000", "24"]].entries()) {
    await page.goto("/le-debo?nuevo=1")
    await page.getByRole("radio", { name: "Banco, cooperativa o financiera" }).click()
    await page.getByRole("combobox", { name: /banco o entidad/i }).click()
    await page.getByPlaceholder("Buscar…").fill(ent)
    if (i === 0) { await page.getByRole("option", { name: /Crear banco o entidad/ }).first().click(); await page.getByRole("button", { name: "Crear y usar" }).click() }
    else await page.getByRole("option", { name: ent }).first().click()
    await page.getByRole("textbox", { name: "¿Cuánto te prestaron?" }).fill(monto)
    await page.getByRole("radio", { name: /Sé la cuota/ }).click()
    await page.getByRole("textbox", { name: "Cuota mensual" }).fill(cuota)
    await page.getByRole("spinbutton", { name: "Plazo en meses" }).fill(plazo)
    await page.getByRole("button", { name: "Registrar deuda" }).click()
    await expect(page.getByText("Deuda registrada.").first()).toBeVisible()
  }
  const lista = page.getByTestId("data-table")
  await expect(lista.locator("li", { hasText: ent })).toHaveCount(1)
  await expect(lista.locator("li", { hasText: ent }).getByTestId("loan-tipo")).toContainText("2 deudas")
  const tabs = page.getByRole("tablist", { name: "Deudas con esta entidad" })
  await expect(tabs.getByRole("tab")).toHaveCount(2)
  await tabs.getByRole("tab").nth(1).click()
  await expect(tabs.getByRole("tab").nth(1)).toHaveAttribute("aria-selected", "true")
  await shot(page, "deudas-agrupadas", info.project.name)
  expect(errs, errs.join("\n")).toEqual([])
})

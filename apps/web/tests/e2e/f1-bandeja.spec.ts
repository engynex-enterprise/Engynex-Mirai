import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { QA, admin } from "./qa"

// Bandeja "Todos los gastos" (/gastos-todos): indicadores con la comparación, el aviso de un gasto registrado dos veces
// (se enlaza con un toque), el detalle de un pago sin salir de la página, pagar varios a la vez, cambiar de mes y
// agrupar. Los cálculos (resumen, ¿te alcanza?, desgloses, plan del pago en lote) están en packages/domain/src/bandeja.test.ts.
test("todos los gastos: dobles, detalle, pagar varios, meses y grupos", async ({ page }, info) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  await login(page)
  const sb = admin()
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const uid = data.users.find((u) => u.email === QA.email)!.id
  const { data: hh } = await sb.from("household_members").select("household_id").eq("user_id", uid).limit(1).single()
  const { data: books } = await sb.from("books").select("id").eq("household_id", hh!.household_id).is("deleted_at", null).order("is_default", { ascending: false }).order("created_at")
  const { data: prof } = await sb.from("profiles").select("last_book_id").eq("id", uid).maybeSingle()
  const bookId = (books?.find((b) => b.id === prof?.last_book_id) ?? books?.[0])!.id
  const s = `${info.project.name === "movil" ? "M" : "E"}${Date.now() % 100000}`
  const luz = `Luz QA ${s}`, agua = `Agua QA ${s}`
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())
  const mes = hoy.slice(0, 7)
  const { data: fijos } = await sb.from("fixed_expenses").insert([
    { book_id: bookId, nombre: luz, valor: 90_000, frec: "mensual", dia: 1, desde: mes, created_by: uid },
    { book_id: bookId, nombre: agua, valor: 40_000, frec: "mensual", dia: 1, desde: mes, created_by: uid },
  ]).select("id, nombre")
  const idDe = (n: string) => fijos!.find((f) => f.nombre === n)!.id
  // El agua también se registró a mano como gasto suelto: cuenta dos veces hasta que se enlace.
  const { data: suelto } = await sb.from("expenses").insert({ book_id: bookId, fecha: hoy, descripcion: agua, valor: 40_000, created_by: uid }).select("id").single()
  try {
    await page.goto("/gastos-todos")
    await expect(page.getByText("Sale en el periodo")).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId("delta-total")).toBeVisible()

    // 1) El gasto suelto se parece al pago del fijo: se enlaza y queda contado una vez.
    const dobles = page.getByTestId("dobles")
    const doble = dobles.locator("li", { hasText: agua })
    await expect(doble).toBeVisible({ timeout: 20_000 })
    await shot(page, "bandeja", info.project.name)
    await doble.getByRole("button", { name: "Es el mismo: enlazar" }).click()
    await expect(page.getByText("Gastos enlazados").first()).toBeVisible({ timeout: 20_000 })
    await expect.poll(async () => (await sb.from("expenses").select("fixed_expense_id").eq("id", suelto!.id).single()).data?.fixed_expense_id).toBe(idDe(agua))

    // 2) Detalle sin salir de la página.
    const buscar = page.getByRole("textbox", { name: "Buscar un gasto" })
    await buscar.fill(luz)
    await page.locator("#main li", { hasText: luz }).first().getByRole("button", { name: new RegExp(luz) }).first().click()
    const det = page.getByTestId("mov-detalle")
    await expect(det).toBeVisible()
    await expect(det.getByText("¿A quién le pagas?")).toBeVisible()
    await expect(det.getByRole("button", { name: "Avisarme" })).toBeVisible()
    await shot(page, "bandeja-detalle", info.project.name)
    await page.keyboard.press("Escape")
    await expect(det).toBeHidden()

    // 3) Pagar varios a la vez: la luz se registra; el agua ya quedó pagada al enlazarla (no sale en "Por pagar").
    await buscar.fill(`QA ${s}`)
    await page.getByRole("button", { name: "Elegir todos" }).click()
    await page.getByRole("button", { name: "Pagar seleccionados" }).click()
    const lote = page.getByRole("dialog")
    await expect(lote.getByTestId("lote-pagar").getByText(luz)).toBeVisible()
    await shot(page, "bandeja-lote", info.project.name)
    await lote.getByRole("button", { name: "Registrar el pago" }).click()
    await expect(page.getByText("Pago registrado").first()).toBeVisible({ timeout: 20_000 })
    await expect.poll(async () => (await sb.from("fixed_expense_payments").select("valor").eq("fixed_expense_id", idDe(luz)).is("deleted_at", null)).data?.length).toBe(1)

    // 4) Cambiar de mes y volver.
    await buscar.fill("")
    await page.getByRole("button", { name: "Periodo anterior" }).click()
    await expect(page.getByRole("button", { name: "Volver a hoy" })).toBeVisible()
    await page.getByRole("button", { name: "Volver a hoy" }).click()
    await expect(page.getByRole("button", { name: "Volver a hoy" })).toBeHidden()

    // 5) Agrupar por tipo de gasto, con el subtotal de cada grupo.
    await page.getByRole("tab", { name: /Todo el periodo/ }).click()
    await page.getByRole("combobox", { name: "Agrupar" }).click()
    await page.getByRole("option", { name: "Por tipo de gasto" }).click()
    await expect(page.locator("#main h3", { hasText: "Gastos fijos" }).first()).toBeVisible()
    await shot(page, "bandeja-grupos", info.project.name)
  } finally {
    const ids = fijos?.map((f) => f.id) ?? []
    await sb.from("expenses").delete().in("fixed_expense_id", ids)
    if (suelto?.id) await sb.from("expenses").delete().eq("id", suelto.id)
    await sb.from("fixed_expense_payments").delete().in("fixed_expense_id", ids)
    await sb.from("fixed_expenses").delete().in("id", ids)
  }
  expect(errs, errs.join("\n")).toEqual([])
})

import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { QA, admin } from "./qa"

// Gasto fijo en dólares, de punta a punta en el navegador: se guarda en USD, la lista lo muestra en USD y su
// equivalente "al mes" en pesos, el diálogo de Pagar propone el valor YA convertido y el gasto que queda en /gastos
// está en pesos. Es el camino donde vivía el error grave de esta rama (se registraba "10" en vez de $40.000).
const TRM_USD = 4000

/** El libro abierto de QA (igual que f4-ajustes-finanzas.spec.ts). */
async function qaBook() {
  const sb = admin()
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const uid = data.users.find((u) => u.email === QA.email)!.id
  const { data: hh } = await sb.from("household_members").select("household_id").eq("user_id", uid).limit(1).single()
  const { data: books } = await sb.from("books").select("id").eq("household_id", hh!.household_id).is("deleted_at", null).order("is_default", { ascending: false }).order("created_at")
  const { data: prof } = await sb.from("profiles").select("last_book_id").eq("id", uid).maybeSingle()
  return { sb, bookId: (books?.find((b) => b.id === prof?.last_book_id) ?? books?.[0])!.id }
}

test("gasto fijo en dólares: se ve en USD y al mes en pesos, y el pago se registra en pesos", async ({ page }, info) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  await login(page)
  const { sb, bookId } = await qaBook()
  const { data: antes } = await sb.from("book_settings").select("trm, trm_auto").eq("book_id", bookId).single()
  const s = Date.now() % 100000
  const nombre = `Nube QA ${info.project.name} ${s}`
  try {
    // La tasa del libro (Ajustes › Finanzas) como si la persona la hubiera guardado: US$ 1 = $4.000.
    await sb.from("book_settings").update({ trm: { ...((antes?.trm ?? {}) as Record<string, number>), USD: TRM_USD }, trm_auto: false }).eq("book_id", bookId)

    await page.goto("/fijos")
    await page.getByRole("button", { name: "Agregar gasto fijo" }).first().click()
    const dlg = page.getByRole("dialog")
    await dlg.getByRole("textbox", { name: "Nombre" }).fill(nombre)
    await dlg.getByRole("combobox", { name: "Moneda" }).click()
    await page.getByRole("option", { name: "Dólares (USD)" }).click()
    await dlg.getByRole("textbox", { name: "Valor", exact: true }).fill("10")

    // El formulario ya dice en cuánto queda al mes con la tasa guardada: US$ 10 × 4.000 = $ 40.000.
    await expect(dlg.getByText(/≈.*40\.000 al mes, con la tasa que tienes guardada/)).toBeVisible()
    await shot(page, "fijo-moneda-form", info.project.name)
    await dlg.getByRole("button", { name: "Guardar" }).click()
    await expect(page.getByText(`${nombre} guardado`)).toBeVisible()
    await expect(page.getByRole("dialog")).toBeHidden()

    // En la lista: el valor en dólares y, en el pie de la tabla filtrada, su equivalente al mes en pesos.
    const tabla = page.locator('[data-testid="data-table"]').filter({ hasText: "Tus gastos fijos" })
    await tabla.getByPlaceholder("Buscar gasto fijo").fill(nombre)
    const fila = tabla.locator("li", { hasText: nombre })
    // `ListRow` pinta el valor dos veces (una para celular y otra para escritorio): se mira solo la que se ve.
    await expect(fila.getByText(/US\$\s*10,00/).filter({ visible: true })).toBeVisible()
    await expect(tabla.locator('span[aria-live="polite"]')).toHaveText(/1 gasto fijo.*suman al mes.*\$\s*40\.000/)
    await shot(page, "fijo-moneda-lista", info.project.name)

    const { data: fijo } = await sb.from("fixed_expenses").select("id, valor, currency").eq("nombre", nombre).single()
    expect(Number(fijo?.valor)).toBe(10)
    expect(fijo?.currency).toBe("USD")

    // Pagar: el diálogo pide el valor EN PESOS y propone el convertido, no los 10 crudos.
    if (info.project.name === "movil") {
      await fila.getByRole("button", { name: "Más acciones" }).click()
      await page.getByRole("menuitem", { name: `Pagar ${nombre}` }).click()
    } else {
      await fila.getByRole("button", { name: `Pagar ${nombre}` }).click()
    }
    const payDlg = page.getByRole("dialog")
    const campo = payDlg.getByRole("textbox", { name: "Valor pagado, en pesos" })
    await expect(campo).toHaveValue("40.000")
    await expect(payDlg.getByText(/Este gasto está en USD.*son .*40\.000/)).toBeVisible()
    await shot(page, "fijo-moneda-pagar", info.project.name)
    await payDlg.getByRole("button", { name: "Registrar pago" }).click()
    await expect(page.getByText(/Pago registrado/i).first()).toBeVisible()

    // El gasto que queda está en pesos (no "10"). Se espera a que PostgREST vea la fila, como f1-fijo-pagar-a.
    await expect.poll(async () => (await sb.from("expenses").select("valor").eq("fixed_expense_id", fijo!.id)).data?.map((e) => Number(e.valor))).toEqual([40_000])

    await page.goto("/gastos")
    const movs = page.locator('[data-testid="data-table"]').filter({ hasText: "Movimientos" })
    await movs.getByPlaceholder("Buscar gasto").fill(nombre)
    const gasto = movs.locator("li", { hasText: nombre })
    await expect(gasto.getByText(/^\$\s*40\.000$/).filter({ visible: true })).toBeVisible()
    await shot(page, "fijo-moneda-gasto", info.project.name)
  } finally {
    const { data: f } = await sb.from("fixed_expenses").select("id").eq("nombre", nombre).limit(1).maybeSingle()
    if (f?.id) {
      await sb.from("expenses").delete().eq("fixed_expense_id", f.id)
      await sb.from("fixed_expense_payments").delete().eq("fixed_expense_id", f.id)
      await sb.from("fixed_expenses").delete().eq("id", f.id)
    }
    await sb.from("book_settings").update({ trm: antes?.trm ?? {}, trm_auto: antes?.trm_auto ?? false }).eq("book_id", bookId)
  }
  expect(errs, errs.join("\n")).toEqual([])
})

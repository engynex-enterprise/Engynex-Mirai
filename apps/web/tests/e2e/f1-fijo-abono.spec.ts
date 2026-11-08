import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { QA, admin } from "./qa"

// Abonos a un gasto fijo (la moto): $70.000 por quincena; se abonan $40.000 → la quincena sigue pendiente con
// "faltan $30.000"; luego se pagan los $30.000 y queda pagada. También "Pagué todo" cuando esta vez costó menos.
test("gasto fijo: abonar parte del periodo y pagar lo que falta", async ({ page }, info) => {
  test.setTimeout(150_000)
  const errs = watchErrors(page)
  await login(page)
  const sb = admin()
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const uid = data.users.find((u) => u.email === QA.email)!.id
  const { data: hh } = await sb.from("household_members").select("household_id").eq("user_id", uid).limit(1).single()
  const { data: books } = await sb.from("books").select("id").eq("household_id", hh!.household_id).is("deleted_at", null).order("is_default", { ascending: false }).order("created_at")
  const { data: prof } = await sb.from("profiles").select("last_book_id").eq("id", uid).maybeSingle()
  const bookId = (books?.find((b) => b.id === prof?.last_book_id) ?? books?.[0])!.id
  const nombre = `Moto QA ${info.project.name} ${Date.now() % 100000}`
  const mes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date()).slice(0, 7)
  const { data: fijo } = await sb.from("fixed_expenses").insert({ book_id: bookId, nombre, valor: 70_000, frec: "quincenal", dia: 15, dia2: 30, desde: mes, created_by: uid }).select("id").single()
  const pagar = async () => {
    await page.goto("/fijos")
    const row = page.locator("#main li", { hasText: nombre }).first()
    await expect(row).toBeVisible({ timeout: 30_000 })
    if (info.project.name === "movil") { await row.getByRole("button", { name: "Más acciones" }).click(); await page.getByRole("menuitem", { name: `Pagar ${nombre}` }).click() }
    else await row.getByRole("button", { name: `Pagar ${nombre}` }).click()
  }
  try {
    // 1) Abono de $40.000 a la quincena
    await pagar()
    const dlg = page.getByRole("dialog")
    await dlg.getByRole("textbox", { name: "Valor pagado" }).fill("40000")
    await expect(dlg.getByRole("radio", { name: /Es un abono/ })).toBeChecked()
    await shot(page, "fijo-abono", info.project.name)
    await dlg.getByRole("button", { name: "Registrar abono" }).click()
    await expect(page.getByText("Abono registrado").first()).toBeVisible({ timeout: 20_000 })
    await expect(page.locator("#main li", { hasText: nombre }).first().getByText(/faltan \$\s?30\.000/)).toBeVisible({ timeout: 20_000 })

    // 2) Se pagan los $30.000 que faltan: el valor sugerido ya es lo que falta
    await pagar()
    await expect(dlg.getByRole("textbox", { name: "Valor pagado" })).toHaveValue(/30\.000/)
    await dlg.getByRole("button", { name: "Registrar pago" }).click()
    await expect(page.getByText("Pago registrado").first()).toBeVisible({ timeout: 20_000 })
    const pagos = await sb.from("fixed_expense_payments").select("valor, cierra, periodo").eq("fixed_expense_id", fijo!.id).is("deleted_at", null).order("created_at")
    expect(pagos.data?.map((p) => [Number(p.valor), p.cierra])).toEqual([[40000, false], [30000, true]])
    await expect(page.locator("#main li", { hasText: nombre }).first().getByText(/faltan \$/)).toHaveCount(0)
  } finally {
    const { data: ps } = await sb.from("fixed_expense_payments").select("expense_id").eq("fixed_expense_id", fijo!.id)
    await sb.from("fixed_expense_payments").delete().eq("fixed_expense_id", fijo!.id)
    const ids = (ps ?? []).map((p) => p.expense_id).filter(Boolean) as string[]
    if (ids.length) await sb.from("expenses").delete().in("id", ids)
    await sb.from("fixed_expenses").delete().eq("id", fijo!.id)
  }
  expect(errs, errs.join("\n")).toEqual([])
})

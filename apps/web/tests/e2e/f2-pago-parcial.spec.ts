import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { QA, admin } from "./qa"

// Me deben › Registrar pago › "Parte de la cuota": $40.000 de una cuota de $100.000 quedan abonados a esa cuota (no
// se pierde ni se va a capital) y la cuota sigue con lo que falta; el historial lo muestra como "Parte de la cuota 1".
test("préstamo: pagar parte de la cuota", async ({ page }, info) => {
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
  const nombre = `Parcial QA ${info.project.name} ${Date.now() % 100000}`
  const { data: contacto } = await sb.from("contacts").insert({ book_id: bookId, nombre, created_by: uid }).select("id").single()
  const { data: loan } = await sb.from("loans").insert({ book_id: bookId, kind: "cobrar", contact_id: contacto!.id, concepto: nombre, monto: 300_000, sistema: "sin", tasa: 0, frec: "mensual", plazo: 3, inicio: new Date().toISOString().slice(0, 10), created_by: uid }).select("id").single()
  try {
    await page.goto(`/me-deben?id=${loan!.id}`)
    await page.getByRole("button", { name: "Registrar pago" }).first().click()
    const dlg = page.getByRole("dialog")
    await dlg.getByRole("radio", { name: /Parte de la cuota/ }).click()
    await dlg.getByRole("textbox", { name: /¿Cuánto pagó de la cuota\?/ }).fill("40000")
    await expect(dlg.getByText(/Se registran \$\s?40\.000 como parte de la cuota/)).toBeVisible()
    await shot(page, "pago-parcial", info.project.name)
    await dlg.getByRole("button", { name: "Registrar pago" }).click()
    await expect(page.getByText("Parte de la cuota registrada")).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(/falta \$\s?60\.000/).first()).toBeVisible()
    await expect.poll(async () => (await sb.from("loan_payments").select("tipo, valor").eq("loan_id", loan!.id)).data).toEqual([{ tipo: "cuota", valor: 40000 }])
    await page.getByRole("tab", { name: /Pagos recibidos/ }).click()
    await expect(page.getByText("Parte de la cuota 1").first()).toBeVisible({ timeout: 20_000 })
  } finally {
    await sb.from("loan_payments").delete().eq("loan_id", loan!.id)
    await sb.from("loans").delete().eq("id", loan!.id)
    await sb.from("contacts").delete().eq("id", contacto!.id)
  }
  expect(errs, errs.join("\n")).toEqual([])
})

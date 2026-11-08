import { expect, test } from "@playwright/test"
import { login, watchErrors } from "./helpers"
import { QA, admin } from "./qa"

// Gastos compartidos: "Para quedar a paz y salvo" › Registrar pago: un abono baja lo que se debe (y no suma en
// "Gastado en total"); el resto sigue pendiente.
test("compartidos: abono entre personas para saldar", async ({ page }, info) => {
  test.setTimeout(120_000)
  const errs = watchErrors(page)
  await login(page)
  const sb = admin()
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const uid = data.users.find((u) => u.email === QA.email)!.id
  const { data: hh } = await sb.from("household_members").select("household_id").eq("user_id", uid).limit(1).single()
  const { data: books } = await sb.from("books").select("id").eq("household_id", hh!.household_id).is("deleted_at", null).order("is_default", { ascending: false }).order("created_at")
  const { data: prof } = await sb.from("profiles").select("last_book_id").eq("id", uid).maybeSingle()
  const bookId = (books?.find((b) => b.id === prof?.last_book_id) ?? books?.[0])!.id
  const nombre = `Viaje QA ${info.project.name} ${Date.now() % 100000}`
  const { data: g } = await sb.from("shared_groups").insert({ book_id: bookId, nombre, personas: ["Ana", "Luis"], created_by: uid, created_at: "2000-01-01T00:00:00Z" }).select("id").single()
  await sb.from("shared_group_expenses").insert({ book_id: bookId, group_id: g!.id, descripcion: "Hotel", valor: 200_000, paga: "Ana", entre: ["Ana", "Luis"], fecha: "2026-11-01", created_by: uid })
  try {
    await page.goto("/compartidos")
    await expect(page.getByText("Luis").first()).toBeVisible({ timeout: 30_000 })
    await page.getByRole("button", { name: "Registrar pago" }).first().click()
    const dlg = page.getByRole("dialog")
    await dlg.getByRole("textbox", { name: "¿Cuánto pagó?" }).fill("40000")
    await expect(dlg.getByText(/le quedará debiendo \$\s?60\.000/)).toBeVisible()
    await dlg.getByRole("button", { name: "Registrar abono" }).click()
    await expect(page.getByText("Abono registrado").first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText("Luis le pagó a Ana").first()).toBeVisible()
    await expect.poll(async () => (await sb.from("shared_group_expenses").select("tipo, valor").eq("group_id", g!.id).eq("tipo", "pago")).data).toEqual([{ tipo: "pago", valor: 40000 }])
  } finally {
    await sb.from("shared_group_expenses").delete().eq("group_id", g!.id)
    await sb.from("shared_groups").delete().eq("id", g!.id)
  }
  expect(errs, errs.join("\n")).toEqual([])
})

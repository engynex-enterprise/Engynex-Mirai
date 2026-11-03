import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { QA, admin } from "./qa"

/** Libro por defecto y usuario de QA (para preparar datos con la clave secreta). */
async function qaBook() {
  const sb = admin()
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const uid = data.users.find((u) => u.email === QA.email)!.id
  const { data: hh } = await sb.from("household_members").select("household_id").eq("user_id", uid).limit(1).single()
  const { data: bk } = await sb.from("books").select("id").eq("household_id", hh!.household_id).is("deleted_at", null).order("is_default", { ascending: false }).order("created_at").limit(1).single()
  return { sb, uid, bookId: bk!.id }
}
const isoDias = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d) }

test("agenda: calendario de pagos (mes/semana/agenda) y calendario fiscal con renta", async ({ page }, info) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/puesta")
  await page.getByRole("button", { name: "Ver un ejemplo" }).click()
  await expect(page.getByText("Datos de ejemplo cargados")).toBeVisible({ timeout: 60_000 })
  await page.waitForURL(/inicio/)
  await page.goto("/recordatorios")
  await expect(page.getByText("Mis calendarios")).toBeVisible({ timeout: 30_000 })
  await page.getByRole("radio", { name: "Mes" }).click()
  await shot(page, "pagos-mes", info.project.name)
  await page.getByRole("radio", { name: "Semana" }).click()
  await page.getByRole("radio", { name: "Agenda" }).click()
  await expect(page.getByText(/Cuota|Arriendo|Salario/).first()).toBeVisible()
  await shot(page, "pagos-agenda", info.project.name)
  await page.goto("/calendario")
  await page.getByRole("textbox", { name: "Últimos 2 dígitos de tu cédula" }).fill("45")
  await expect(page.getByText(/14 de septiembre de 2026|14 septiembre 2026/)).toBeVisible()
  await page.getByRole("button", { name: "Fechas de Colombia" }).click()
  await page.getByRole("checkbox").first().click({ force: true }).catch(() => {})
  await page.keyboard.press("Escape")
  await shot(page, "fiscal", info.project.name)
  expect(errs, errs.join("\n")).toEqual([])
})

test("agenda: un recordatorio de una sola vez del año pasado no aparece en Próximos pagos (el anual sí)", async ({ page }, info) => {
  test.setTimeout(120_000)
  const errs = watchErrors(page)
  await login(page)
  const { sb, uid, bookId } = await qaBook()
  const t = Date.now() % 100000
  const unaVez = `QA una vez ${t}`, anual = `QA anual ${t}`
  // Misma fecha (en 10 días) pero del año pasado: la anual se repite este año; la de una sola vez ya pasó.
  const fecha = `${+isoDias(10).slice(0, 4) - 1}${isoDias(10).slice(4)}`
  await sb.from("calendar_events").insert([
    { book_id: bookId, titulo: unaVez, fecha, tipo: "egreso", monto: 120000, anual: false, created_by: uid },
    { book_id: bookId, titulo: anual, fecha, tipo: "egreso", monto: 130000, anual: true, created_by: uid },
  ])
  try {
    await page.goto("/recordatorios")
    await expect(page.getByText("Mis calendarios")).toBeVisible({ timeout: 30_000 })
    await page.getByRole("radio", { name: "Agenda" }).click()
    await expect(page.getByText(anual).first()).toBeVisible({ timeout: 20_000 })
    await expect(page.getByText(unaVez)).toHaveCount(0)
    await shot(page, "agenda-una-vez", info.project.name)
  } finally {
    await sb.from("calendar_events").delete().eq("book_id", bookId).in("titulo", [unaVez, anual])
  }
  expect(errs, errs.join("\n")).toEqual([])
})

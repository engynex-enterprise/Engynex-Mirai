import { expect, test, type Page } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { QA, admin } from "./qa"
import { LEGAL_VERSION } from "../../lib/legal/version"

// Avisos de los movimientos de la familia (migración 0011_avisos_familia.sql): otra persona del hogar registra gastos
// en el libro que comparten → a QA le llega el aviso en vivo a la campana (sin recargar), varios seguidos se juntan en
// uno, queda en la cola de correo/WhatsApp (family_activity) y, si QA apaga «Movimientos de tu familia» en
// Ajustes › Alertas, ya no le llega nada.

async function qaBook() {
  const sb = admin()
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const uid = data.users.find((u) => u.email === QA.email)!.id
  const { data: hh } = await sb.from("household_members").select("household_id").eq("user_id", uid).limit(1).single()
  const { data: books } = await sb.from("books").select("id").eq("household_id", hh!.household_id).is("deleted_at", null).order("is_default", { ascending: false }).order("created_at")
  const { data: prof } = await sb.from("profiles").select("last_book_id").eq("id", uid).maybeSingle()
  const bk = books?.find((b) => b.id === prof?.last_book_id) ?? books?.[0]
  return { sb, uid, hh: hh!.household_id as string, bookId: bk!.id as string, users: data.users }
}

/** La campana: en escritorio está en el menú lateral; en celular, dentro de «Menú» (barra inferior). */
async function abrirCampana(page: Page) {
  if ((page.viewportSize()?.width ?? 1366) < 768) await page.getByRole("button", { name: "Menú", exact: true }).first().click()
  await page.getByRole("button", { name: "Notificaciones" }).first().click()
  const d = page.getByRole("dialog", { name: "Notificaciones" })
  await expect(d).toBeVisible()
  return d
}

test("familia: los movimientos de otra persona del hogar llegan en vivo a la campana y se apagan en Alertas", async ({ page }, info) => {
  test.setTimeout(150_000)
  const errs = watchErrors(page)
  await login(page)
  const { sb, uid, hh, bookId, users } = await qaBook()
  const email = `qa+familia-${info.project.name}@mirai.test`
  const old = users.find((u) => u.email === email)
  if (old) await sb.auth.admin.deleteUser(old.id)
  const { data: u, error } = await sb.auth.admin.createUser({ email, password: `Qa-${Date.now()}-f!`, email_confirm: true, user_metadata: { nombre: "Andrea Prueba", acepta_version: LEGAL_VERSION } })
  if (error) throw error
  const andrea = u.user.id
  await sb.from("household_members").insert({ household_id: hh, user_id: andrea, role: "editor", access_role: "editor" })
  const s = `${info.project.name} ${Date.now() % 100000}`
  const gasto = (descripcion: string, valor: number) => sb.from("expenses").insert({ book_id: bookId, fecha: new Date().toISOString().slice(0, 10), descripcion, valor, created_by: andrea })
  const familia = () => sb.from("notifications").select("id,titulo,cuerpo").eq("user_id", uid).eq("kind", "familia").like("cuerpo", `%${s}%`)
  try {
    await page.goto("/inicio")
    await expect(page.getByRole("button", { name: "Notificaciones" }).first()).toBeVisible({ timeout: 30_000 })

    // 1) Andrea registra un gasto → a QA le llega el aviso en vivo, sin recargar.
    await gasto(`Mercado ${s}`, 85000)
    const campana = await abrirCampana(page)
    const aviso = campana.locator('[data-kind="familia"]').filter({ hasText: s }).first()
    await expect(aviso).toBeVisible({ timeout: 20_000 })
    await expect(aviso).toContainText("Andrea registró un gasto")
    await expect(aviso).toContainText(/\$\s85\.000/)

    // 2) Dos más seguidos se juntan en el mismo aviso (no tres avisos).
    await gasto(`Gasolina ${s}`, 40000)
    await gasto(`Droguería ${s}`, 23500)
    await expect(aviso).toContainText("Andrea registró 3 movimientos", { timeout: 20_000 })
    expect((await familia()).data).toHaveLength(1)
    await shot(page, "familia-campana", info.project.name)
    // Queda listo para salir por correo o WhatsApp (lo envía el trabajo de cada 5 minutos).
    const { data: cola } = await sb.from("family_activity").select("n,sent_at,actor_id").eq("user_id", uid).eq("book_id", bookId).eq("actor_id", andrea)
    expect(cola).toEqual([{ n: 3, sent_at: null, actor_id: andrea }])
    await page.keyboard.press("Escape")

    // 3) QA apaga «Movimientos de tu familia» → lo siguiente que registre Andrea ya no le llega.
    await page.goto("/ajustes?tab=alertas")
    const fila = page.getByRole("switch", { name: "Movimientos de tu familia" })
    await expect(fila).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole("checkbox", { name: "Movimientos de tu familia por WhatsApp" })).toBeVisible()
    await fila.click()
    await expect(fila).toHaveAttribute("aria-checked", "false")
    await expect.poll(async () => (await sb.from("notification_rules").select("notif").eq("user_id", uid).eq("book_id", bookId).maybeSingle()).data?.notif, { timeout: 15_000 }).toMatchObject({ familia: false })
    await sb.from("family_activity").update({ sent_at: new Date().toISOString() }).eq("user_id", uid).eq("actor_id", andrea)
    await gasto(`Arepas ${s}`, 12000)
    await page.waitForTimeout(1500)
    expect((await familia()).data?.[0]?.cuerpo).not.toContain("Arepas")
    expect((await sb.from("family_activity").select("id").eq("user_id", uid).eq("actor_id", andrea).is("sent_at", null)).data).toHaveLength(0)
    await shot(page, "familia-alertas", info.project.name)
  } finally {
    await sb.from("expenses").delete().eq("book_id", bookId).like("descripcion", `%${s}%`)
    await sb.from("notifications").delete().eq("user_id", uid).eq("kind", "familia")
    await sb.from("notification_rules").update({ notif: null }).eq("user_id", uid).eq("book_id", bookId)
    await sb.auth.admin.deleteUser(andrea).catch(() => {})
  }
  expect(errs, errs.join("\n")).toEqual([])
})

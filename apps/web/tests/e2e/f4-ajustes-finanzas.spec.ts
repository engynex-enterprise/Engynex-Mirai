import { expect, test, type Page } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { QA, admin } from "./qa"

// Ajustes › Finanzas (reparto con plantillas y cuadrar a 100 %, quincenas, fondo, conversor), Valores por defecto
// (sistema de cuotas, vista previa, abrir el formulario, restablecer) y Relaciones (uso por contactos, renombrar con los
// contactos, las que faltan en la lista, quitar con qué hacer con los contactos). Cada prueba deja los ajustes como estaban.
async function qaBook() {
  const sb = admin()
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const uid = data.users.find((u) => u.email === QA.email)!.id
  const { data: hh } = await sb.from("household_members").select("household_id").eq("user_id", uid).limit(1).single()
  const { data: books } = await sb.from("books").select("id").eq("household_id", hh!.household_id).is("deleted_at", null).order("is_default", { ascending: false }).order("created_at")
  const { data: prof } = await sb.from("profiles").select("last_book_id").eq("id", uid).maybeSingle()
  const bk = books?.find((b) => b.id === prof?.last_book_id) ?? books?.[0]
  return { sb, bookId: bk!.id }
}
const settings = async (bookId: string) => (await admin().from("book_settings").select("pct,emerg_meta,defaults,relaciones").eq("book_id", bookId).single()).data!
const blurFill = async (page: Page, name: string, v: string) => { const i = page.getByRole("spinbutton", { name }); await i.fill(v); await i.blur() }

test("finanzas: plantillas de reparto, cuadrar a 100 %, quincenas, fondo y conversor", async ({ page }, info) => {
  test.setTimeout(120_000)
  const errs = watchErrors(page)
  await login(page)
  const { sb, bookId } = await qaBook()
  const antes = await settings(bookId)
  try {
    await page.goto("/ajustes?tab=finanzas")
    await expect(page.getByText("Cómo repartir tu ingreso")).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/Salario mínimo \d{4}/).first()).toBeVisible()
    await expect(page.getByLabel("Quincenas de este mes")).toContainText("1.ª · del 1 al")
    await expect(page.getByText("Conversor")).toBeVisible()

    await page.getByRole("radio", { name: "70 / 20 / 10" }).click()
    await expect.poll(async () => (await settings(bookId)).pct).toEqual({ n: 70, g: 20, a: 10 })
    await expect(page.getByRole("spinbutton", { name: "Porcentaje de necesidades" })).toHaveValue("70")

    await blurFill(page, "Porcentaje de necesidades", "80")
    await expect(page.getByText("Los porcentajes suman 110 %")).toBeVisible()
    await page.getByRole("button", { name: "Cuadrar a 100 %" }).click()
    await expect.poll(async () => (await settings(bookId)).pct).toEqual({ n: 80, g: 20, a: 0 })
    await expect(page.getByText(/Los porcentajes suman/)).toHaveCount(0)

    await page.getByRole("radio", { name: "3 meses" }).click()
    await expect.poll(async () => (await settings(bookId)).emerg_meta).toBe(3)
    await shot(page, "f4-ajustes-finanzas", info.project.name)
  } finally {
    await sb.from("book_settings").update({ pct: antes.pct, emerg_meta: antes.emerg_meta }).eq("book_id", bookId)
  }
  expect(errs, errs.join("\n")).toEqual([])
})

test("valores por defecto: sistema de cuotas, vista previa, abrir el formulario y restablecer", async ({ page }, info) => {
  test.setTimeout(120_000)
  const errs = watchErrors(page)
  await login(page)
  const { sb, bookId } = await qaBook()
  const antes = await settings(bookId)
  try {
    await page.goto("/ajustes?tab=defs")
    await expect(page.getByText("Al crear un gasto fijo")).toBeVisible({ timeout: 30_000 })
    await page.getByRole("radio", { name: "Cuota que va bajando" }).click()
    await expect.poll(async () => ((await settings(bookId)).defaults as { sistema?: string }).sistema).toBe("aleman")
    await page.getByRole("radio", { name: "24", exact: true }).click()
    await expect.poll(async () => ((await settings(bookId)).defaults as { plazo?: number }).plazo).toBe(24)
    await expect(page.getByLabel("Así empieza el formulario").last()).toContainText("24 cuotas")
    await shot(page, "f4-ajustes-defs", info.project.name)

    // El botón abre el formulario real de gasto
    await page.getByRole("button", { name: "Abrir el formulario" }).first().click()
    await expect(page.getByRole("dialog")).toBeVisible()
    await page.getByRole("button", { name: "Cancelar" }).click()
    await expect(page.getByRole("dialog")).toHaveCount(0)

    await page.getByRole("button", { name: "Restablecer todo" }).click()
    await page.getByRole("button", { name: "Restablecer", exact: true }).click()
    await expect.poll(async () => (await settings(bookId)).defaults).toEqual({})
  } finally {
    await sb.from("book_settings").update({ defaults: antes.defaults }).eq("book_id", bookId)
  }
  expect(errs, errs.join("\n")).toEqual([])
})

test("relaciones: uso por contactos, renombrar, agregar las que faltan y quitar", async ({ page }, info) => {
  test.setTimeout(150_000)
  const errs = watchErrors(page)
  await login(page)
  const { sb, bookId } = await qaBook()
  const antes = await settings(bookId)
  const s = Date.now() % 100000
  const rel = `QA Rel ${s}`, rel2 = `QA Vecina ${s}`, fuera = `QA Fuera ${s}`
  const { data: cts, error } = await sb.from("contacts").insert([
    { book_id: bookId, nombre: `QA Contacto A ${s}`, relacion: rel },
    { book_id: bookId, nombre: `QA Contacto B ${s}`, relacion: fuera },
  ]).select("id,relacion")
  expect(error).toBeNull()
  const relDe = async (i: number) => (await sb.from("contacts").select("relacion").eq("id", cts![i].id).single()).data?.relacion
  try {
    await sb.from("book_settings").update({ relaciones: [...antes.relaciones, rel] }).eq("book_id", bookId)
    await page.goto("/ajustes?tab=rels")
    const lista = page.getByRole("list", { name: "Lista de relaciones" })
    await expect(lista.getByRole("textbox", { name: `Nombre de ${rel}` })).toBeVisible({ timeout: 30_000 })
    await expect(lista.getByRole("listitem").filter({ has: page.getByRole("textbox", { name: `Nombre de ${rel}` }) })).toContainText("1 contacto")

    // La que solo está escrita en un contacto se ofrece para agregarla
    await page.getByRole("button", { name: new RegExp(fuera) }).click()
    await expect.poll(async () => (await settings(bookId)).relaciones).toContain(fuera)

    // Renombrar cambia también el contacto
    const caja = lista.getByRole("textbox", { name: `Nombre de ${rel}` })
    await caja.fill(rel2)
    await caja.blur()
    await expect.poll(() => relDe(0), { timeout: 20_000 }).toBe(rel2)
    await expect.poll(async () => (await settings(bookId)).relaciones).toContain(rel2)
    await shot(page, "f4-ajustes-rels", info.project.name)

    // Quitar una relación en uso pregunta qué hacer con los contactos
    await page.getByRole("button", { name: `Quitar ${rel2}` }).click()
    await page.getByRole("radio", { name: "Quitarles la relación" }).click()
    await page.getByRole("button", { name: "Quitar", exact: true }).click()
    await expect.poll(() => relDe(0), { timeout: 20_000 }).toBe("")
    await expect.poll(async () => (await settings(bookId)).relaciones).not.toContain(rel2)
  } finally {
    await sb.from("book_settings").update({ relaciones: antes.relaciones }).eq("book_id", bookId)
    await sb.from("contacts").delete().in("id", cts!.map((c) => c.id))
  }
  expect(errs, errs.join("\n")).toEqual([])
})

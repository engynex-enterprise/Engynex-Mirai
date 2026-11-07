import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { QA, admin } from "./qa"

// Ajustes › Reglas de importación: crear una regla, probarla con una descripción, ver cuántos gastos toca, aplicarla a
// un gasto que ya estaba en otra categoría (con Deshacer) y borrarla.
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

test("reglas de importación: crear, probar, aplicar a gastos anteriores y borrar", async ({ page }, info) => {
  test.setTimeout(150_000)
  const errs = watchErrors(page)
  await login(page)
  const { sb, bookId } = await qaBook()
  const kw = `qaregla${Date.now() % 100000}`
  const { data: cats } = await sb.from("categories").select("id,nombre").eq("book_id", bookId).is("deleted_at", null)
  const mercado = cats!.find((c) => c.nombre === "Mercado")!
  const otra = cats!.find((c) => c.nombre !== "Mercado")!
  // Un gasto que ya existe con la palabra, en otra categoría: la regla lo debe poder pasar a Mercado.
  const { data: g, error } = await sb.from("expenses").insert({ book_id: bookId, fecha: "2026-10-05", descripcion: `COMPRA POS ${kw.toUpperCase()} CALLE 80`, valor: 12_300, category_id: otra.id }).select("id").single()
  expect(error).toBeNull()
  try {
    await page.goto("/ajustes?tab=reglas")
    await expect(page.getByRole("heading", { name: "Reglas de importación" })).toBeVisible({ timeout: 30_000 })

    // Crear: palabra + categoría. Mientras escribe, cuenta los gastos que ya coinciden.
    const nueva = page.getByRole("textbox", { name: /Si contiene/ })
    await nueva.fill(kw)
    await expect(page.getByText("Coincide con 1 gasto que ya registraste")).toBeVisible()
    await page.getByRole("combobox", { name: "Categoría de la regla" }).click()
    await page.getByRole("option", { name: /^Mercado/ }).first().click()
    await page.locator("#main").getByRole("button", { name: "Agregar", exact: true }).click()
    await expect(page.getByRole("textbox", { name: `Palabra ${kw}` })).toBeVisible()

    // Probador: muestra la regla que aplica y su categoría.
    await page.getByRole("textbox", { name: "Prueba una descripción" }).fill(`pago ${kw} bogota`)
    const res = page.getByRole("status").filter({ hasText: kw })
    await expect(res).toContainText("Mercado")
    await page.getByRole("textbox", { name: "Prueba una descripción" }).fill("algo que no existe xyz")
    await expect(page.getByRole("status").filter({ hasText: /Ninguna regla/ })).toBeVisible()

    // Uso y Aplicar: el gasto anterior pasa a Mercado (y Deshacer lo devuelve).
    const fila = page.getByRole("listitem").filter({ has: page.getByRole("textbox", { name: `Palabra ${kw}` }) })
    await expect(fila.getByText("1 gasto")).toBeVisible()
    await shot(page, "ajustes-reglas", info.project.name)
    await fila.getByRole("button", { name: "Aplicar a 1" }).click()
    const dlg = page.getByRole("alertdialog")
    await expect(dlg).toContainText("¿Cambiar la categoría de 1 gasto?")
    await dlg.getByRole("button", { name: "Cambiar categoría" }).click()
    await expect(page.getByText("1 gasto cambió de categoría")).toBeVisible()
    await expect.poll(async () => (await sb.from("expenses").select("category_id,cat_src").eq("id", g!.id).single()).data).toEqual({ category_id: mercado.id, cat_src: "regla" })
    await expect(fila.getByRole("button", { name: "Aplicar a 1" })).toHaveCount(0)

    // Borrar la regla.
    await fila.getByRole("button", { name: `Eliminar regla ${kw}` }).click()
    await expect(page.getByRole("textbox", { name: `Palabra ${kw}` })).toHaveCount(0)
    expect(errs).toEqual([])
  } finally {
    await sb.from("expenses").delete().eq("id", g!.id)
    await sb.from("keyword_rules").delete().eq("book_id", bookId).eq("keyword", kw)
  }
})

// Ajustes › Bancos y entidades: cada banco con su logo (ícono oficial o monograma de la marca) y lo mismo en el selector.
test("bancos y entidades: logos de los bancos en la lista", async ({ page }, info) => {
  test.setTimeout(120_000)
  const errs = watchErrors(page)
  await login(page)
  const { sb, bookId } = await qaBook()
  const nombres = ["Bancolombia", "Nequi", "Davivienda"]
  const { data: ya } = await sb.from("entities").select("nombre").eq("book_id", bookId).is("deleted_at", null)
  const nuevos = nombres.filter((n) => !ya?.some((e) => e.nombre === n))
  const { data: creados } = nuevos.length ? await sb.from("entities").insert(nuevos.map((nombre) => ({ book_id: bookId, nombre, tipo: "Banco" }))).select("id") : { data: [] }
  try {
    await page.goto("/ajustes?tab=ents")
    await expect(page.getByRole("heading", { name: "Bancos y entidades" }).first()).toBeVisible({ timeout: 30_000 })
    for (const n of nombres) await expect(page.getByRole("list", { name: "Entidades" }).getByRole("img", { name: n }).first()).toBeVisible()
    // El ícono oficial de Bancolombia sale de /brands (archivo propio de Mirai, no de un tercero).
    await expect(page.locator('img[src^="/brands/bancolombia"]').first()).toBeVisible()
    await shot(page, "ajustes-entidades", info.project.name)
    expect(errs).toEqual([])
  } finally {
    if (creados?.length) await sb.from("entities").delete().in("id", creados.map((c) => c.id))
  }
})

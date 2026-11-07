import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { QA, admin } from "./qa"

/** Libro por defecto del usuario QA (para preparar datos con la clave secreta). */
async function qaBook() {
  const sb = admin()
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const uid = data.users.find((u) => u.email === QA.email)!.id
  const { data: hh } = await sb.from("household_members").select("household_id").eq("user_id", uid).limit(1).single()
  // El libro que abre la app (regla de buildAppContext: el último libro de la persona y, si no, el predeterminado):
  // otra prueba puede haber dejado activo el «Ejemplo · familia Navarro» (Ver un ejemplo cambia de libro).
  const { data: books } = await sb.from("books").select("id").eq("household_id", hh!.household_id).is("deleted_at", null).order("is_default", { ascending: false }).order("created_at")
  const { data: prof } = await sb.from("profiles").select("last_book_id").eq("id", uid).maybeSingle()
  const bk = books?.find((b) => b.id === prof?.last_book_id) ?? books?.[0]
  return { sb, bookId: bk!.id }
}

test("renta: pestañas, bien, deducción, informe, Excel y portal del contador con notas", async ({ page, context, browser }, info) => {
  test.setTimeout(300_000)
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/puesta")
  await page.getByRole("button", { name: "Ver un ejemplo" }).click()
  await expect(page.getByText("Datos de ejemplo cargados")).toBeVisible({ timeout: 60_000 })
  await page.waitForURL(/inicio/)

  await page.goto("/renta")
  await expect(page.getByText(/debes declarar renta|cerca de los topes|no superas los topes/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText("Tu ruta para declarar")).toBeVisible()
  await shot(page, "renta-resumen", info.project.name)
  await page.getByRole("tab", { name: "¿Debo declarar?" }).click()
  await expect(page.getByText("Patrimonio bruto al 31 de diciembre")).toBeVisible()
  await page.getByRole("tab", { name: "Ingresos" }).click()
  await expect(page.getByText("Salarios, primas y otros pagos laborales")).toBeVisible()

  await page.getByRole("tab", { name: "Bienes" }).click()
  await page.getByRole("button", { name: "Agregar bien" }).click()
  await page.getByRole("textbox", { name: "Nombre" }).fill("Apartamento QA")
  await page.getByRole("textbox", { name: "Costo de compra (costo fiscal)" }).fill("200000000")
  await page.getByRole("textbox", { name: "Avalúo catastral o comercial" }).fill("240000000")
  await page.getByRole("button", { name: "Guardar" }).click()
  await expect(page.getByText("Apartamento QA").first()).toBeVisible({ timeout: 15_000 })

  await page.getByRole("tab", { name: "Deducciones" }).click()
  await expect(page.getByText("Cómo quedan aplicadas")).toBeVisible()
  await page.getByRole("tab", { name: "Dependientes" }).click()
  await expect(page.getByText("¿Cuánto te ahorran?")).toBeVisible()
  await page.getByRole("tab", { name: "Documentos" }).click()
  await page.getByRole("checkbox", { name: /Certificado de ingresos y retenciones/ }).click()
  await expect(page.getByText(/Documentos \(1 de 9\)/)).toBeVisible({ timeout: 15_000 })
  await page.getByRole("tab", { name: "Borrador del impuesto" }).click()
  await expect(page.getByText("= Renta líquida gravable")).toBeVisible()
  await shot(page, "renta-borrador", info.project.name)

  const pdf = page.waitForEvent("download", { timeout: 60_000 })
  await page.getByRole("button", { name: "Informe", exact: true }).click()
  expect((await pdf).suggestedFilename()).toMatch(/^renta-\d{4}\.pdf$/)
  const xls = page.waitForEvent("download", { timeout: 60_000 })
  await page.getByRole("button", { name: "Excel", exact: true }).click()
  expect((await xls).suggestedFilename()).toMatch(/^mirai-renta-\d{4}\.xlsx$/)

  // Contador
  await page.goto("/contador")
  await page.getByRole("textbox", { name: "Nombre de tu contador" }).fill("Marcela QA")
  await page.getByRole("button", { name: "Crear y copiar enlace" }).click()
  await expect(page.getByText("Acceso creado")).toBeVisible({ timeout: 15_000 })
  const url = await page.evaluate(() => navigator.clipboard.readText())
  expect(url).toMatch(/\/contador\/[\w-]{20,}$/)
  await page.getByRole("textbox", { name: "Nota para Marcela" }).first().fill("Hola, ya subí el certificado")
  await page.getByRole("button", { name: "Enviar nota" }).first().click()
  await expect(page.getByText("Hola, ya subí el certificado")).toBeVisible({ timeout: 15_000 })

  const anon = await browser.newContext({ viewport: page.viewportSize() ?? undefined })
  const p2 = await anon.newPage()
  await p2.goto(url.replace(/^https?:\/\/[^/]+/, ""))
  // Dentro de <main>: la barra de título de la app instalada (features/pwa/title-bar.tsx, oculta en el navegador) también dice "· Portal del contador".
  await expect(p2.getByRole("main").getByText("Portal del contador").first()).toBeVisible({ timeout: 30_000 })
  await expect(p2.getByText("Hola, ya subí el certificado")).toBeVisible({ timeout: 20_000 })
  await expect(p2.getByRole("button", { name: "Agregar bien" })).toHaveCount(0)
  await p2.getByRole("textbox", { name: /Nota para/ }).fill("Recibido, gracias")
  await p2.getByRole("button", { name: "Enviar nota" }).click()
  await expect(p2.getByText("Recibido, gracias")).toBeVisible({ timeout: 15_000 })
  await p2.screenshot({ path: `tests/.out/contador-portal-${info.project.name}.png`, fullPage: true })
  await anon.close()

  await page.getByRole("button", { name: "Quitar acceso" }).first().click()
  await expect(page.getByText("Marcela QA ya no puede entrar.")).toBeVisible()
  const anon2 = await browser.newContext()
  const p3 = await anon2.newPage()
  await p3.goto(url.replace(/^https?:\/\/[^/]+/, ""))
  await expect(p3.getByText("No se pudo abrir el acceso")).toBeVisible({ timeout: 30_000 })
  await anon2.close()
  expect(errs, errs.join("\n")).toEqual([])
})

test("renta: gasto marcado como deducible de salud aparece en la depuración y las deudas van al 31 de diciembre", async ({ page }, info) => {
  test.setTimeout(120_000)
  const errs = watchErrors(page)
  await login(page)
  const { sb, bookId } = await qaBook()
  const y = new Date().getFullYear() - 1
  const desc = `Prepagada QA ${info.project.name}`
  // La marca la pone el formulario de gastos (selector "¿Sirve para tu declaración?"); aquí se prepara con la clave secreta.
  await sb.from("expenses").delete().eq("book_id", bookId).eq("descripcion", desc)
  const { data: g, error } = await sb.from("expenses").insert({ book_id: bookId, fecha: `${y}-03-15`, descripcion: desc, valor: 351_000, deducible: "salud" }).select("id").single()
  expect(error?.message ?? null).toBeNull()
  // Que no haya un valor escrito a mano para la prepagada de ese año (si lo hay, manda sobre lo marcado).
  const { data: years } = await sb.from("tax_years").select("id,ded").eq("book_id", bookId).eq("year", y)
  for (const r of years ?? []) { const ded = { ...(r.ded as Record<string, unknown>) }; delete ded.prep; await sb.from("tax_years").update({ ded }).eq("id", r.id) }
  try {
    await page.goto("/renta")
    await expect(page.getByText("Tu ruta para declarar")).toBeVisible({ timeout: 30_000 })
    await page.getByRole("tab", { name: "Deducciones" }).click()
    const row = page.getByTestId("ded-prep")
    await expect(row.getByText("De tus gastos")).toBeVisible({ timeout: 15_000 })
    await expect(row.getByRole("textbox")).toHaveAttribute("placeholder", /351\.000/)
    // "Cómo quedan aplicadas": la medicina prepagada entra con lo marcado.
    await expect(page.getByText("Medicina prepagada", { exact: true }).locator("..")).toContainText(/351\.000/)
    await shot(page, "renta-deducible-salud", info.project.name)
    await page.getByRole("tab", { name: "Deudas" }).click()
    await expect(page.getByText(/Deudas al 31 de diciembre de \d{4}/)).toBeVisible()
  } finally {
    await sb.from("expenses").delete().eq("id", g!.id)
  }
  expect(errs, errs.join("\n")).toEqual([])
})

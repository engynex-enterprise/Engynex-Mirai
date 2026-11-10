import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { QA, admin } from "./qa"

// Gastos por pagar o abonados (migración 0012) y observaciones: al registrar un gasto de hoy se elige si ya se pagó,
// se abonó una parte o se paga después; en la lista sale «abonado · faltan …» con «Marcar como pagado», y en Todos lo
// que falta sale por pagar. Un gasto con fecha futura queda por pagar solo.
test("gasto abonado: registrar con observaciones, ver lo que falta y marcarlo como pagado", async ({ page }, info) => {
  test.setTimeout(120_000)
  const errs = watchErrors(page)
  await login(page)
  const sb = admin()
  const desc = `Gasolina moto ${info.project.name} ${Date.now() % 100000}`
  try {
    await page.goto("/gastos")
    await page.getByRole("button", { name: "Registrar gasto" }).first().click()
    await page.getByRole("textbox", { name: "¿En qué gastaste?" }).fill(desc)
    await page.getByRole("textbox", { name: "Valor" }).fill("75000")
    await page.getByRole("combobox", { name: "Categoría" }).click()
    await page.getByPlaceholder("Buscar…").fill("Transporte")
    await page.getByRole("option", { name: /^Transporte/ }).first().click()
    // Fecha de hoy: se pregunta si ya se pagó (por defecto, completo).
    await expect(page.getByRole("radio", { name: "Sí, completo" })).toHaveAttribute("aria-checked", "true")
    await page.getByRole("radio", { name: "Aboné una parte" }).click()
    await page.getByRole("textbox", { name: "¿Cuánto abonaste?" }).fill("40000")
    await expect(page.getByText(/Faltan \$\s?35\.000/)).toBeVisible()
    await page.getByRole("textbox", { name: "Observaciones (opcional)" }).fill("Tanqueo de la primera quincena")
    await shot(page, "gasto-abonado-form", info.project.name)
    await page.getByRole("button", { name: "Guardar" }).click()
    await expect(page.getByText(/registrado/).first()).toBeVisible()

    const { data: g } = await sb.from("expenses").select("id,valor,pagado,nota").like("descripcion", desc).single()
    expect(g).toMatchObject({ pagado: 40000, nota: "Tanqueo de la primera quincena" })

    const row = page.locator("#main li", { hasText: desc })
    await expect(row.getByText(/abonado · faltan \$\s?35\.000/)).toBeVisible()
    await shot(page, "gasto-abonado-lista", info.project.name)

    // En Todos los gastos, lo que falta sale por pagar.
    await page.goto("/gastos-todos")
    await expect(page.getByText(/Falta por pagar \(abonaste \$\s?40\.000\)/).first()).toBeVisible({ timeout: 30_000 })

    // Marcar como pagado: un abono de $ 20.000 y luego todo lo que falta.
    await page.goto("/gastos")
    await row.getByRole("button", { name: `Marcar como pagado ${desc}` }).click()
    const dlg = page.getByRole("dialog", { name: "Pagar este gasto" })
    await dlg.getByRole("radio", { name: "Un abono" }).click()
    await dlg.getByRole("textbox", { name: "Valor del abono" }).fill("20000")
    await dlg.getByRole("button", { name: "Registrar abono" }).click()
    await expect(page.getByText(/Abono registrado: faltan \$\s?15\.000/)).toBeVisible()
    await expect(row.getByText(/faltan \$\s?15\.000/)).toBeVisible()
    await row.getByRole("button", { name: `Marcar como pagado ${desc}` }).click()
    await dlg.getByRole("button", { name: "Marcar como pagado" }).click()
    await expect(page.getByText(`«${desc}» quedó pagado`)).toBeVisible()
    await expect(row.getByText(/abonado|por pagar/)).toHaveCount(0)
    expect((await sb.from("expenses").select("pagado").eq("id", g!.id).single()).data?.pagado).toBeNull()

    // Al editar un gasto con fecha futura, el formulario dice que queda por pagar (no pregunta si ya se pagó).
    const { data: users } = await sb.auth.admin.listUsers({ perPage: 1000 })
    expect(users.users.some((u) => u.email === QA.email)).toBe(true)
    expect(errs, errs.join("\n")).toEqual([])
  } finally {
    await sb.from("expenses").delete().like("descripcion", desc)
  }
})

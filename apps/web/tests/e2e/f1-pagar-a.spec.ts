import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { admin } from "./qa"

// Registrar gasto › "¿A quién le pagaste?": por defecto nadie (tienda, gasolinera); "Una persona" agrega el contacto y
// queda en el gasto (contact_id); en la lista se ve en "Pagado a". Negocio o empresa sigue usando Proveedores.
test("gasto: a quién le pagaste (nadie, una persona nueva) y Pagado a en la lista", async ({ page }, info) => {
  test.setTimeout(120_000)
  const errs = watchErrors(page)
  await login(page)
  const s = Date.now() % 100000
  const desc = `Aseo casa ${info.project.name} ${s}`, persona = `Rosa QA ${s}`
  const sb = admin()
  try {
    await page.goto("/gastos")
    await page.getByRole("button", { name: "Registrar gasto" }).first().click()
    await page.getByRole("textbox", { name: "¿En qué gastaste?" }).fill(desc)
    await page.getByRole("textbox", { name: "Valor" }).fill("120000")
    const dlg = page.getByRole("dialog")
    await expect(dlg.getByRole("radio", { name: "No hace falta" })).toHaveAttribute("aria-checked", "true")
    await expect(dlg.getByText(/Tienda de barrio, gasolinera/)).toBeVisible()
    await dlg.getByRole("radio", { name: "Una persona" }).click()
    await dlg.getByRole("combobox", { name: "Persona a la que le pagaste" }).click()
    await page.getByPlaceholder("Buscar persona…").fill(persona)
    await page.getByRole("option", { name: new RegExp(`Agregar a.*${persona}`) }).click()
    await expect(page.getByText(`Agregamos a ${persona} a tus contactos`)).toBeVisible()
    await expect(dlg.getByRole("combobox", { name: "Persona a la que le pagaste" })).toContainText(persona)
    await shot(page, "gasto-pagar-a", info.project.name)
    await page.getByRole("button", { name: "Guardar" }).click()
    await expect(page.getByText(/Gasto registrado|Gasto hormiga registrado/).first()).toBeVisible()
    await expect(page.locator("#main li", { hasText: desc }).getByText(persona)).toBeVisible()
    const { data } = await sb.from("expenses").select("contact_id, provider_id").eq("descripcion", desc).single()
    expect(data?.contact_id).toBeTruthy()
    expect(data?.provider_id).toBeNull()
  } finally {
    await sb.from("expenses").delete().eq("descripcion", desc)
    await sb.from("contacts").delete().eq("nombre", persona)
  }
  expect(errs, errs.join("\n")).toEqual([])
})

import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { admin } from "./qa"

// Agregar gasto fijo › "¿A quién le pagas?": una persona nueva queda en Contactos y en el fijo (contact_id).
// Además guarda referencia, moneda, fecha de fin y aviso propio, y al pagarlo el gasto hereda la persona.
test("gasto fijo: a quién le pagas, referencia, fin y aviso propio", async ({ page }, info) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  await login(page)
  const s = Date.now() % 100000
  const nombre = `Arriendo QA ${info.project.name} ${s}`, persona = `Arrendador QA ${s}`
  const sb = admin()
  try {
    await page.goto("/fijos")
    await page.getByRole("button", { name: "Agregar gasto fijo" }).first().click()
    const dlg = page.getByRole("dialog")
    await dlg.getByRole("textbox", { name: "Nombre" }).fill(nombre)
    await dlg.getByRole("textbox", { name: "Valor" }).fill("1500000")

    // A quién le pagas: una persona que todavía no existe.
    await expect(dlg.getByRole("radio", { name: "No hace falta" })).toHaveAttribute("aria-checked", "true")
    await dlg.getByRole("radio", { name: "Una persona" }).click()
    await dlg.getByRole("combobox", { name: "Persona a la que le pagaste" }).click()
    await page.getByPlaceholder("Buscar persona…").fill(persona)
    await page.getByRole("option", { name: new RegExp(`Agregar a.*${persona}`) }).click()
    await expect(page.getByText(`Agregamos a ${persona} a tus contactos`)).toBeVisible()

    // `getByLabel` choca con el botón "Ayuda: …" (aria-label del ícono de ayuda del campo, components/mirai/field.tsx):
    // mejor por rol, como el resto de la prueba.
    await dlg.getByRole("textbox", { name: /Número de cuenta, contrato o referencia/ }).fill("CTR-9001")
    await dlg.getByRole("spinbutton", { name: /Avisarme con/ }).fill("15")
    await shot(page, "fijo-pagar-a", info.project.name)
    await dlg.getByRole("button", { name: "Guardar" }).click()
    await expect(page.getByText(`${nombre} guardado`)).toBeVisible()
    await expect(page.getByRole("dialog")).toBeHidden() // espera a que cierre del todo (el panel inferior tarda en animarse)

    // Quedó en la lista con la persona y la referencia.
    const fila = page.locator("#main li", { hasText: nombre })
    await expect(fila.getByText(persona)).toBeVisible()
    await expect(fila.getByText("ref. CTR-9001")).toBeVisible()
    await shot(page, "fijo-pagar-a-lista", info.project.name)

    const { data } = await sb.from("fixed_expenses").select("id, contact_id, provider_id, referencia, aviso").eq("nombre", nombre).single()
    expect(data?.contact_id).toBeTruthy()
    expect(data?.provider_id).toBeNull()
    expect(data?.referencia).toBe("CTR-9001")
    expect(data?.aviso).toBe(15)

    // Al registrar el pago, el gasto hereda la persona.
    if (info.project.name === "movil") {
      await fila.getByRole("button", { name: "Más acciones" }).click()
      await page.getByRole("menuitem", { name: `Pagar ${nombre}` }).click()
    } else {
      await fila.getByRole("button", { name: `Pagar ${nombre}` }).click()
    }
    const payDlg = page.getByRole("dialog")
    await expect(payDlg.getByText("CTR-9001")).toBeVisible()
    await payDlg.getByRole("button", { name: /^Registrar (pago|abono)$/ }).click()
    await expect(page.getByText(/Pago registrado|pagado/i).first()).toBeVisible()
    await page.waitForTimeout(500) // el toast sale apenas responde la API; dale un respiro a PostgREST para verlo
    const { data: g } = await sb.from("expenses").select("contact_id").eq("fixed_expense_id", data!.id).limit(1).single()
    expect(g?.contact_id).toBe(data?.contact_id)
  } finally {
    const { data: f } = await sb.from("fixed_expenses").select("id").eq("nombre", nombre).limit(1).maybeSingle()
    if (f?.id) {
      await sb.from("expenses").delete().eq("fixed_expense_id", f.id)
      await sb.from("fixed_expense_payments").delete().eq("fixed_expense_id", f.id)
      await sb.from("fixed_expenses").delete().eq("id", f.id)
    }
    await sb.from("contacts").delete().eq("nombre", persona)
  }
  expect(errs, errs.join("\n")).toEqual([])
})

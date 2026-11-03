import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { admin, QA } from "./qa"

/** Deja Perfil › Recibe pagos del usuario QA con un dato guardado en el formato de la 5.4 (lista plana). */
async function seedCobro(cobro: unknown[]) {
  const sb = admin()
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const u = data.users.find((x) => x.email === QA.email)
  if (!u) throw new Error("No existe el usuario QA")
  await sb.from("profiles").update({ cobro: cobro as never }).eq("id", u.id)
  return u.id
}

test("recibe pagos: varias llaves por entidad, principal, copiar, compartir, QR, ordenar y eliminar", async ({ page, context }, info) => {
  test.setTimeout(240_000)
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  const errs = watchErrors(page)
  await login(page)
  // Un medio guardado por la versión 5.4 (sin entidad ni clase): debe verse en su entidad sin perder datos
  const uid = await seedCobro([{ id: "v54-bogota", medio: "otro", detalle: "987654321", tipo: "ahorros", banco: "Banco de Bogotá", titular: "Ana Prueba" }])

  await page.goto("/perfil")
  const cobro = page.locator("#cobro")
  await expect(cobro.getByRole("heading", { name: "Recibe pagos" })).toBeVisible({ timeout: 30_000 })
  await cobro.scrollIntoViewIfNeeded()
  await expect(cobro.getByRole("region", { name: "Banco de Bogotá" }).getByText("987654321")).toBeVisible()

  // 1) Primera llave de Bancolombia: buscar la entidad y detectar el tipo de llave
  await cobro.getByRole("button", { name: "Agregar", exact: true }).click()
  let dlg = page.getByRole("dialog", { name: "Agregar un medio de pago" })
  await dlg.getByRole("combobox", { name: "Buscar entidad" }).fill("bancol")
  await dlg.getByRole("option", { name: "Bancolombia" }).click()
  await dlg.getByRole("textbox", { name: "Tu llave" }).fill("300 111 2233")
  await expect(dlg.getByText("Detectamos:")).toContainText("Celular")
  await dlg.getByRole("button", { name: "Agregar", exact: true }).click()
  const banco = cobro.getByRole("region", { name: "Bancolombia" })
  await expect(banco.getByText("300 111 2233")).toBeVisible()

  // 2) Segunda llave de Bancolombia (alfanumérica, con nombre) desde el + de la entidad; antes, una llave inválida
  await banco.getByRole("button", { name: "Agregar en Bancolombia" }).click()
  dlg = page.getByRole("dialog", { name: "Agregar un medio de pago" })
  await dlg.getByRole("textbox", { name: "Tu llave" }).fill("@ana prueba")
  // Con una llave inválida el botón queda inactivo y el error aparece al salir del campo.
  await expect(dlg.getByRole("button", { name: "Agregar", exact: true })).toBeDisabled()
  await dlg.getByRole("textbox", { name: "Tu llave" }).blur()
  await expect(dlg.getByText(/sin espacios/).first()).toBeVisible()
  await dlg.getByRole("textbox", { name: "Tu llave" }).fill("@anaprueba")
  await expect(dlg.getByText("Detectamos:")).toContainText("Alfanumérica")
  await dlg.getByRole("textbox", { name: "Nombre para reconocerla (opcional)" }).fill("Llave del negocio")
  await dlg.getByRole("button", { name: "Agregar", exact: true }).click()
  await expect(banco.getByText("@anaprueba")).toBeVisible()
  await expect(banco.getByText("Llave del negocio")).toBeVisible()
  await expect(banco.getByText("2 llaves")).toBeVisible()

  // 3) Nequi (número de celular) como principal
  await cobro.getByRole("button", { name: "Agregar", exact: true }).click()
  dlg = page.getByRole("dialog", { name: "Agregar un medio de pago" })
  await dlg.getByRole("button", { name: "Elegir Nequi" }).click()
  await dlg.getByRole("textbox", { name: "Celular" }).fill("3104445566")
  await dlg.getByRole("switch", { name: /Usar como principal/ }).click()
  await dlg.getByRole("button", { name: "Agregar", exact: true }).click()
  const nequi = cobro.getByRole("region", { name: "Nequi" })
  await expect(nequi.getByText("310 444 5566")).toBeVisible()
  await expect(nequi.getByText("Principal")).toBeVisible()
  await expect(cobro.getByText("Principal: Número Nequi de Nequi")).toBeVisible()

  // 4) Cambiar la principal a la llave celular de Bancolombia
  await banco.getByRole("button", { name: "Más opciones de Llave Bre-B · Celular de Bancolombia" }).click()
  await page.getByRole("menuitem", { name: "Marcar como principal" }).click()
  await expect(cobro.getByText("Principal: Llave Bre-B · Celular de Bancolombia")).toBeVisible()
  await expect(nequi.getByText("Principal")).toHaveCount(0)

  // Se guardó en la base con los campos que la 5.4 sabe leer (medio, detalle, banco)
  await expect.poll(async () => {
    const { data } = await admin().from("profiles").select("cobro").eq("id", uid).single()
    return (data?.cobro as { medio: string; entidad: string; principal?: boolean; detalle: string }[]).map((c) => `${c.medio}|${c.entidad}|${c.detalle}|${c.principal ? 1 : 0}`)
  }).toEqual(["otro|banco-bogota|987654321|0", "breb|bancolombia|3001112233|1", "breb|bancolombia|@anaprueba|0", "nequi|nequi|3104445566|0"])

  // 5) Copiar con un toque
  await banco.getByRole("button", { name: "Copiar Llave Bre-B · Celular de Bancolombia" }).click()
  await expect(page.getByText("Llave Bre-B · Celular copiada")).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("3001112233")

  // 6) Compartir: vista previa con la principal o con todas
  await cobro.getByRole("button", { name: "Compartir", exact: true }).click()
  const sh = page.getByRole("dialog", { name: "Compartir tus datos de pago" })
  const preview = sh.getByLabel("Mensaje que se envía")
  await expect(preview).toContainText("• Llave Bre-B (Bancolombia): 300 111 2233")
  await expect(preview).not.toContainText("Nequi")
  await sh.getByRole("radio", { name: /Todas/ }).click()
  await expect(preview).toContainText("• Nequi: 310 444 5566")
  await expect(preview).toContainText("• Banco de Bogotá ahorros: 987654321 (a nombre de Ana Prueba)")
  await expect(sh.getByRole("link", { name: /WhatsApp/ })).toHaveAttribute("href", /wa\.me\/\?text=Para%20pagarle%20a/)
  await sh.getByRole("button", { name: "Copiar mensaje" }).click()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("• Nequi: 310 444 5566")
  await page.keyboard.press("Escape")

  // 7) QR de una sola llave
  await nequi.getByRole("button", { name: "Código QR de Número Nequi de Nequi" }).click()
  await expect(page.getByRole("dialog", { name: "Código QR · Nequi" }).getByText("• Nequi: 310 444 5566")).toBeVisible()
  await page.keyboard.press("Escape")

  // 8) Ocultar y mostrar los números
  await cobro.getByRole("button", { name: "Ocultar números" }).click()
  await expect(banco.getByText("••• ••• 2233")).toBeVisible()
  await cobro.getByRole("button", { name: "Mostrar números" }).click()
  await expect(banco.getByText("300 111 2233")).toBeVisible()

  // 9) Ordenar: Nequi sube por encima de Bancolombia
  await nequi.getByRole("button", { name: "Opciones de Nequi" }).click()
  await page.getByRole("menuitem", { name: "Subir entidad" }).click()
  await expect(cobro.getByRole("region").nth(1)).toHaveAccessibleName("Nequi")

  // 10) Editar el nombre de una llave
  await banco.getByRole("button", { name: "Más opciones de Llave Bre-B · Alfanumérica (@) de Bancolombia" }).click()
  await page.getByRole("menuitem", { name: "Editar" }).click()
  const ed = page.getByRole("dialog", { name: "Editar medio de pago" })
  await ed.getByRole("textbox", { name: "Nombre para reconocerla (opcional)" }).fill("Llave de la tienda")
  await ed.getByRole("button", { name: "Guardar" }).click()
  await expect(banco.getByText("Llave de la tienda")).toBeVisible()

  // 11) Eliminar con Deshacer, y una entidad completa
  await nequi.getByRole("button", { name: "Más opciones de Número Nequi de Nequi" }).click()
  await page.getByRole("menuitem", { name: "Eliminar" }).click()
  await expect(nequi).toHaveCount(0)
  await page.getByRole("button", { name: "Deshacer" }).click()
  await expect(cobro.getByRole("region", { name: "Nequi" }).getByText("310 444 5566")).toBeVisible()
  await shot(page, "recibe-pagos", info.project.name)
  if (info.project.name === "movil") expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await banco.getByRole("button", { name: "Opciones de Bancolombia" }).click()
  await page.getByRole("menuitem", { name: "Eliminar Bancolombia" }).click()
  await expect(banco).toHaveCount(0)
  await page.reload()
  await expect(page.locator("#cobro").getByRole("region", { name: "Nequi" })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator("#cobro").getByRole("region", { name: "Bancolombia" })).toHaveCount(0)

  await seedCobro([])
  expect(errs).toEqual([])
})

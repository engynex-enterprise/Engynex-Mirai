import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { QA, admin } from "./qa"

// Las opiniones de QA avisan a los administradores reales: al final se borran esos avisos y la marca de admin de QA.
async function qaId() {
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 })
  return data.users.find((u) => u.email === QA.email)!.id
}
test.afterAll(async () => {
  const sb = admin()
  const id = await qaId()
  const { data } = await sb.from("feedback").select("id").eq("user_id", id)
  if (data?.length) await sb.from("notifications").delete().in("dedupe", data.map((f) => `fb-new-${f.id}`))
  await sb.from("feedback").delete().eq("user_id", id)
  await sb.from("platform_admins").delete().eq("user_id", id)
})

test("medios de pago: cambiar solo el ícono guarda sin error", async ({ page }) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/ajustes?tab=medios")
  const row = page.locator("li", { has: page.getByRole("textbox", { name: "Nombre de Efectivo" }) })
  await expect(row).toBeVisible({ timeout: 30_000 })
  const target = /Billetera/.test(await row.getByRole("combobox").innerText()) ? "Efectivo" : "Billetera"
  await row.getByRole("combobox").click()
  await page.getByPlaceholder("Buscar…").fill(target)
  await page.getByRole("option", { name: new RegExp(target) }).click()
  await expect(row.getByRole("combobox")).toHaveText(new RegExp(target))
  await page.waitForTimeout(1200)
  await expect(page.getByText("No se pudo guardar")).toHaveCount(0)
  await page.reload()
  await expect(page.locator("li", { has: page.getByRole("textbox", { name: "Nombre de Efectivo" }) }).getByRole("combobox")).toHaveText(new RegExp(target), { timeout: 30_000 })
  expect(errs).toEqual([])
})

test("opiniones: calificar, reportar un error y recibir respuesta del administrador", async ({ page }, info) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  const tag = `QA ${info.project.name} ${Date.now() % 100000}`
  await login(page)

  // Sin ser administrador, el panel no existe ni aparece en el menú.
  await page.goto("/admin")
  await expect(page.getByText("No encontramos esta página")).toBeVisible({ timeout: 30_000 })

  await page.goto("/opiniones")
  await expect(page.getByRole("heading", { name: "Tu opinión", level: 1 })).toBeVisible({ timeout: 30_000 })
  await page.getByRole("button", { name: "Enviar una opinión" }).first().click()
  const dlg = page.getByRole("dialog")
  await expect(dlg.getByText("¿Qué tan útil es Mirai para ti?")).toBeVisible()
  await dlg.getByRole("radio", { name: /5 estrellas/ }).click()
  await expect(dlg.getByText("Excelente")).toBeVisible()
  await dlg.getByRole("textbox").fill(`Me encanta la quincena (${tag})`)
  await shot(page, "opiniones-calificar", info.project.name)
  await dlg.getByRole("button", { name: "Enviar" }).click()
  await expect(page.getByText("¡Gracias! Recibimos tu opinión")).toBeVisible()
  await expect(page.getByText(`Me encanta la quincena (${tag})`)).toBeVisible()
  await expect(page.locator("#main").getByText("Recibido").first()).toBeVisible()

  // Reportar un error desde el atajo
  await page.getByRole("button", { name: /Algo no funciona/ }).click()
  await expect(page.getByRole("dialog").getByRole("radio", { name: /Algo no funciona/ })).toBeChecked()
  // Sin mensaje, Enviar queda inactivo y explica qué falta.
  await expect(page.getByRole("dialog").getByRole("button", { name: "Enviar" })).toBeDisabled()
  await expect(page.getByRole("dialog").getByText("Cuéntanos un poco más")).toBeVisible()
  await page.getByRole("dialog").getByRole("textbox").fill(`El botón de guardar no responde (${tag})`)
  await page.getByRole("dialog").getByRole("button", { name: "Enviar" }).click()
  await expect(page.getByText(`El botón de guardar no responde (${tag})`)).toBeVisible()
  await shot(page, "opiniones-lista", info.project.name)

  // Como administrador: ve el panel, la opinión y responde.
  await admin().from("platform_admins").upsert({ user_id: await qaId() })
  await page.goto("/admin/usuarios")
  await expect(page.getByRole("heading", { name: "Usuarios", level: 1 })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(QA.email).first()).toBeVisible({ timeout: 20_000 })
  await page.goto("/admin/opiniones")
  const item = page.locator("[data-slot=card]", { hasText: `El botón de guardar no responde (${tag})` })
  await expect(item).toBeVisible({ timeout: 20_000 })
  await item.getByRole("textbox").fill(`Gracias, ya lo estamos revisando (${tag})`)
  await item.getByRole("button", { name: "Responder" }).click()
  await expect(page.getByText("Respuesta enviada")).toBeVisible()
  await shot(page, "admin-opiniones", info.project.name)

  await page.goto("/opiniones")
  await expect(page.getByText(`Gracias, ya lo estamos revisando (${tag})`)).toBeVisible({ timeout: 30_000 })
  await expect(page.locator("#main").getByText("En revisión").first()).toBeVisible()
  expect(errs).toEqual([])
})

import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { QA, admin } from "./qa"

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
  return { sb, uid, bookId: bk!.id }
}

test("ajustes: pestañas, catálogos, finanzas, alertas, IA, hogar y datos", async ({ page }, info) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  const mobile = info.project.name.includes("movil")
  await login(page)
  const tab = async (id: string) => { await page.goto(`/ajustes?tab=${id}`) }

  await tab("general")
  await expect(page.getByText("Pantalla de inicio")).toBeVisible({ timeout: 30_000 })
  if (!mobile) {
    await page.getByRole("textbox", { name: "Buscar ajuste" }).fill("tasas")
    await expect(page.getByRole("button", { name: "Finanzas" })).toBeVisible()
    await page.getByRole("button", { name: "Finanzas" }).click()
  } else await tab("finanzas")
  await expect(page.getByText("Tasa de usura (% E.A.)")).toBeVisible()
  await shot(page, "ajustes-finanzas", info.project.name)

  // Catálogos: crear y borrar una categoría
  await tab("cats")
  const name = `QA cat ${Date.now() % 10000}`
  await page.getByRole("textbox", { name: /Nueva categoría/ }).fill(name)
  await page.locator("#main").getByRole("button", { name: "Agregar" }).click()
  await expect(page.getByRole("textbox", { name: `Nombre de ${name}` })).toBeVisible()
  await page.getByRole("button", { name: `Eliminar ${name}` }).click()
  await expect(page.getByText("Categoría eliminada")).toBeVisible()

  await tab("rels")
  await expect(page.getByRole("button", { name: "Quitar Familiar" })).toBeVisible()

  await tab("alertas")
  await expect(page.getByText("¿Qué te avisamos y por dónde?")).toBeVisible()
  await expect(page.getByRole("checkbox", { name: "Pagos por vencer y vencidos por En la app" })).toBeChecked()
  // Los canales son preferencia de cada persona; los servicios los configura el administrador (sin enlace a Integraciones).
  await expect(page.getByRole("switch", { name: "Enviar resumen por WhatsApp" })).toBeVisible()
  await expect(page.getByRole("switch", { name: "Enviar resumen por correo" })).toBeVisible()
  await expect(page.getByRole("link", { name: "Ir a Integraciones" })).toHaveCount(0)
  await shot(page, "ajustes-alertas", info.project.name)

  // Integraciones del hogar = solo IA (el enlace viejo abre Inteligencia artificial).
  await tab("integraciones")
  await expect(page.getByRole("switch", { name: "Usar inteligencia artificial" })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText("TRM del día")).toHaveCount(0)
  await expect(page.getByRole("switch", { name: "Activar Telegram" })).toHaveCount(0)
  await expect(page.getByRole("switch", { name: "Activar WhatsApp Cloud API" })).toHaveCount(0)
  await shot(page, "ajustes-integraciones", info.project.name)
  // El modelo de IA se escoge de la lista del proveedor (OpenRouter la publica sin clave).
  const card = (n: string) => page.locator("[data-slot=card]", { hasText: n })
  await card("OpenRouter").getByRole("button", { name: "Configurar" }).click()
  const dlg = page.getByRole("dialog")
  await expect(dlg.getByText(/modelos? disponibles? en tu cuenta/)).toBeVisible({ timeout: 20000 })
  await dlg.getByRole("combobox", { name: "Modelo" }).click()
  await page.getByPlaceholder("Buscar modelo…").fill("free")
  await expect(page.getByRole("option").first()).toBeVisible()
  await shot(page, "ajustes-integraciones-modelos", info.project.name)
  await page.keyboard.press("Escape")
  await dlg.getByRole("button", { name: "Cancelar" }).click()
  // Sin clave guardada, Gemini pide la clave antes de mostrar modelos.
  await card("Google Gemini").getByRole("button", { name: "Configurar" }).click()
  await expect(page.getByRole("dialog").getByText("Cuando pegues la clave, aquí aparecen los modelos que puedes usar.")).toBeVisible()
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click()

  await tab("ia")
  await expect(page.getByRole("switch", { name: "Usar inteligencia artificial" })).toBeVisible()
  await expect(page.getByText("Orden de los proveedores")).toBeVisible()

  await tab("hogar")
  await expect(page.getByRole("heading", { name: "¿Quiénes hacen parte de tu hogar?" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Agregar persona" })).toBeVisible()
  await expect(page.getByText("(tú)")).toBeVisible()

  await tab("respaldo")
  // Recién cargada (compilación de producción), el botón puede verse antes de que React lo active: se reintenta.
  await expect(async () => {
    await page.getByRole("button", { name: "Crear respaldo ahora" }).click()
    await expect(page.getByText("Respaldo guardado")).toBeVisible({ timeout: 8_000 })
  }).toPass({ timeout: 45_000 })
  await expect(page.getByText("Manual ·").first()).toBeVisible()
  await expect(page.getByText("Historial de cambios")).toBeVisible()
  await shot(page, "ajustes-datos", info.project.name)

  await tab("seguridad")
  await expect(page.getByText(/dos pasos/i).first()).toBeVisible()
  expect(errs, errs.join("\n")).toEqual([])
})

/** La campana: en escritorio está en el menú lateral; en celular, dentro de «Menú» (barra inferior). */
async function abrirCampana(page: import("@playwright/test").Page) {
  const bell = page.getByRole("button", { name: "Notificaciones" }).first()
  if (!(await bell.isVisible())) await page.getByRole("button", { name: "Menú" }).first().click()
  await bell.click()
}

test("alertas: el aviso que la persona apaga no llega a la campana (y al encenderlo sí)", async ({ page }, info) => {
  test.setTimeout(150_000)
  const errs = watchErrors(page)
  await login(page)
  const { sb, uid, bookId } = await qaBook()
  const nombre = `QA Arriendo ${Date.now() % 100000}`
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())
  const en2 = new Date(`${hoy}T12:00:00`); en2.setDate(en2.getDate() + 2)
  const pagos = page.getByRole("switch", { name: "Pagos por vencer y vencidos" })
  const enCampana = async () => (await sb.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", uid).like("titulo", `%${nombre}%`)).count ?? 0
  try {
    // 1) Apagado (solo para esta persona) → abrir Mirai no crea el aviso
    await page.goto("/ajustes?tab=alertas")
    await expect(pagos).toBeVisible({ timeout: 30_000 })
    if ((await pagos.getAttribute("aria-checked")) === "true") { await pagos.click(); await expect(pagos).toHaveAttribute("aria-checked", "false") }
    await expect.poll(async () => (await sb.from("notification_rules").select("notif").eq("user_id", uid).eq("book_id", bookId).maybeSingle()).data?.notif, { timeout: 15_000 }).toMatchObject({ pagos: false })
    await sb.from("fixed_expenses").insert({ book_id: bookId, nombre, valor: 900000, frec: "mensual", dia: en2.getDate(), inicio: hoy, created_by: uid })
    await page.goto("/inicio")
    await page.waitForTimeout(7000) // los avisos de la app se actualizan ~2,5 s después de abrir
    expect(await enCampana()).toBe(0)
    await abrirCampana(page)
    // Solo dentro de la campana (el nombre sí sale en Inicio, en Próximos pagos).
    const campana = page.getByRole("dialog", { name: "Notificaciones" })
    await expect(campana).toBeVisible()
    await expect(campana.getByText(nombre)).toHaveCount(0)
    await shot(page, "alertas-apagado-campana", info.project.name)

    // 2) Encendido → el aviso aparece en la campana
    await page.goto("/ajustes?tab=alertas")
    await pagos.click()
    await expect(pagos).toHaveAttribute("aria-checked", "true")
    await page.goto("/inicio")
    await expect.poll(enCampana, { timeout: 30_000 }).toBeGreaterThan(0)
    await page.reload()
    await abrirCampana(page)
    await expect(page.locator('[data-kind="pago"]').filter({ hasText: nombre }).first()).toBeVisible({ timeout: 20_000 })
  } finally {
    await sb.from("fixed_expenses").delete().eq("book_id", bookId).eq("nombre", nombre)
    await sb.from("notifications").delete().eq("user_id", uid).like("titulo", `%${nombre}%`)
    await sb.from("notification_rules").update({ notif: null }).eq("user_id", uid).eq("book_id", bookId)
  }
  expect(errs, errs.join("\n")).toEqual([])
})

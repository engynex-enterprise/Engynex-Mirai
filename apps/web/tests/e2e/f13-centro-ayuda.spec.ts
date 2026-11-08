import { expect, test, type Page } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { completarLeccion } from "./academia"
import { QA, admin } from "./qa"

// Los casos de soporte y opiniones de QA avisan a los administradores reales: al final se borran (con sus avisos).
const TAG = `QA ayuda ${Date.now() % 100000}`
test.afterAll(async () => {
  const sb = admin()
  const { data: us } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const id = us.users.find((u) => u.email === QA.email)?.id
  if (!id) return
  const { data } = await sb.from("feedback").select("id").eq("user_id", id).ilike("mensaje", `%${TAG}%`)
  if (data?.length) {
    await sb.from("notifications").delete().in("dedupe", data.map((f) => `fb-new-${f.id}`))
    await sb.from("feedback").delete().in("id", data.map((f) => f.id))
  }
})

const centroDe = (page: Page) => page.getByRole("dialog", { name: "Centro de ayuda" })

/** Sin scroll horizontal ni en la página ni dentro del panel. */
async function sinScrollHorizontal(page: Page) {
  const doc = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(doc, "sin scroll horizontal en la página").toBeLessThanOrEqual(0)
  const panel = await centroDe(page).evaluate((el) => { const s = el.querySelector<HTMLElement>(".overflow-y-auto"); return s ? s.scrollWidth - s.clientWidth : 0 })
  expect(panel, "sin scroll horizontal en el panel").toBeLessThanOrEqual(0)
}

test("centro de ayuda: portada, ayuda de la página, búsqueda, glosario, novedades, preguntas, guías y soporte", async ({ page }, info) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/gastos")
  await expect(page.getByRole("button", { name: "Cómo funciona" })).toBeVisible({ timeout: 30_000 })

  // Atajo "?" → portada con la ayuda contextual de la página actual
  const centro = centroDe(page)
  const buscar = centro.getByRole("textbox", { name: "Buscar en el Centro de ayuda" })
  // Recién cargada (compilación de producción) el atajo puede llegar antes de que React lo escuche: se reintenta.
  await expect(async () => {
    if (!(await centro.count())) await page.locator("body").press("?")
    await expect(buscar).toBeVisible({ timeout: 3_000 })
  }).toPass({ timeout: 20_000 })
  await expect(centro.getByText("Cómo funciona: Gastos y hormiga")).toBeVisible()
  await expect(centro.getByRole("button", { name: /^Preguntas frecuentes/ })).toBeVisible()
  await page.waitForTimeout(300)
  await shot(page, "centro-ayuda", info.project.name)
  await sinScrollHorizontal(page)

  // Ayuda para esta página → detalle con pasos y relacionados; Atrás vuelve a la portada
  await centro.getByRole("button", { name: /Cómo funciona: Gastos y hormiga/ }).click()
  await expect(centro.getByRole("heading", { name: "Gastos y hormiga" })).toBeVisible()
  await centro.getByRole("button", { name: "Atrás" }).click()

  // Búsqueda global → término del glosario (marcado como referencia)
  await buscar.fill("uvt")
  await expect(centro.getByText(/resultados para “uvt”/)).toBeVisible()
  await centro.getByRole("button", { name: /^UVT/ }).first().click()
  await expect(centro.getByRole("heading", { name: "UVT", exact: true })).toBeVisible()
  await expect(centro.getByText("Unidad de Valor Tributario")).toBeVisible()
  await expect(centro.getByText("Referencia", { exact: true })).toBeVisible()
  await shot(page, "centro-ayuda-glosario", info.project.name)
  await centro.getByRole("button", { name: "Atrás" }).click()
  await centro.getByRole("button", { name: "Borrar la búsqueda" }).click()
  await centro.getByRole("textbox", { name: "Buscar en el Centro de ayuda" }).fill("palabraquenoexiste")
  await expect(centro.getByText(/No encontramos “palabraquenoexiste”/)).toBeVisible()
  await centro.getByRole("button", { name: "Borrar la búsqueda" }).click()

  // Novedades: contador, marcar todas como leídas y filtro por tipo
  await centro.getByRole("button", { name: /^Novedades/ }).click()
  const marcar = centro.getByRole("button", { name: "Marcar todas como leídas" })
  const alDia = centro.getByText(/Estás al día/)
  await expect(marcar.or(alDia)).toBeVisible({ timeout: 15_000 })
  if (await marcar.isVisible()) await marcar.click()
  await expect(alDia).toBeVisible()
  await centro.getByRole("radio", { name: /^Corrección/ }).click()
  await expect(centro.getByRole("radio", { name: /^Corrección/ })).toHaveAttribute("aria-checked", "true")
  await centro.getByRole("button", { name: "Atrás" }).click()

  // Preguntas frecuentes: búsqueda, acordeón y "¿Te sirvió?"
  await centro.getByRole("button", { name: /^Preguntas frecuentes/ }).click()
  await centro.getByRole("textbox", { name: "Buscar en preguntas frecuentes" }).fill("contador")
  await expect(centro.getByRole("button", { name: "¿Cómo le doy acceso a mi contador?" })).toBeVisible()
  await expect(centro.getByText(/quitarle el acceso cuando quieras/)).toBeVisible()
  await centro.getByRole("button", { name: "Sí", exact: true }).first().click()
  await expect(centro.getByText("¡Gracias por contarnos!").first()).toBeVisible()
  await centro.getByRole("button", { name: "Atrás" }).click()

  // Guías paso a paso: marcar pasos
  await centro.getByRole("button", { name: /^Guías paso a paso/ }).click()
  await centro.getByRole("button", { name: /Registrar tu nómina con descuentos/ }).click()
  await expect(centro.getByRole("heading", { name: "Registrar tu nómina con descuentos" })).toBeVisible()
  const paso = centro.getByRole("checkbox").first()
  await paso.click()
  await expect(paso).toHaveAttribute("aria-checked", "true")
  await sinScrollHorizontal(page)
  // Portada directa desde dos niveles adentro
  await centro.getByRole("button", { name: "Volver a la portada del Centro de ayuda" }).click()

  // Atajos y estado del servicio
  await centro.getByRole("button", { name: /^Atajos de teclado/ }).click()
  await expect(centro.getByText("Abrir el Centro de ayuda")).toBeVisible()
  await centro.getByRole("button", { name: "Atrás" }).click()
  await centro.getByRole("button", { name: /^Estado del servicio/ }).click()
  await expect(centro.getByText(/Funcionando · respondió en \d+ ms/)).toBeVisible({ timeout: 20_000 })
  await centro.getByRole("button", { name: "Atrás" }).click()

  // Contactar soporte: crea un caso con número y aparece en "Tus casos"
  await centro.getByRole("button", { name: /^Contactar soporte/ }).click()
  await centro.getByRole("radio", { name: "Mis datos o respaldos" }).click()
  // Sin asunto ni detalle, "Enviar caso" queda inactivo y explica qué falta.
  await expect(centro.getByRole("button", { name: "Enviar caso" })).toBeDisabled()
  await expect(centro.getByText(/Escribe un asunto corto/)).toBeVisible()
  await centro.getByRole("textbox", { name: "Asunto" }).fill(`No encuentro mi respaldo (${TAG})`)
  await centro.getByRole("textbox", { name: "Cuéntanos qué pasa" }).fill(`Busqué en Ajustes y no aparece el respaldo de ayer (${TAG})`)
  await expect(centro.getByRole("switch", { name: "Incluir la página donde estás" })).toBeChecked()
  await centro.getByRole("button", { name: "Enviar caso" }).click()
  await expect(centro.getByText(/Recibimos tu caso #[0-9A-F]{6}/)).toBeVisible()
  await expect(centro.getByText(new RegExp(`Caso #[0-9A-F]{6} · No encuentro mi respaldo \\(${TAG}\\)`))).toBeVisible()
  await shot(page, "centro-ayuda-soporte", info.project.name)

  await centro.getByRole("button", { name: "Cerrar el Centro de ayuda" }).click()
  await expect(centro).toHaveCount(0)
  expect(errs, errs.join("\n")).toEqual([])
})

test("centro de ayuda: se abre desde el menú y desde el buscador (Ctrl K)", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/inicio")
  await expect(page.getByRole("button", { name: "Cómo funciona" })).toBeVisible({ timeout: 30_000 })
  if (info.project.name === "movil") await page.getByRole("button", { name: "Menú", exact: true }).click()
  // El Centro de ayuda se abre desde el menú de usuario (abajo del panel lateral).
  await page.locator('[data-tour="user"]').click()
  await page.getByRole("menuitem", { name: "Centro de ayuda" }).click()
  const centro = centroDe(page)
  await expect(centro.getByRole("textbox", { name: "Buscar en el Centro de ayuda" })).toBeVisible()
  await centro.getByRole("button", { name: "Cerrar el Centro de ayuda" }).click()
  await expect(centro).toHaveCount(0)

  await page.keyboard.press("Control+k")
  await page.keyboard.type("glosario")
  await page.getByRole("option", { name: /Glosario financiero/ }).click()
  await expect(centro.getByRole("textbox", { name: "Buscar en el glosario" })).toBeVisible()
  await centro.getByRole("textbox", { name: "Buscar en el glosario" }).fill("cesantías")
  await centro.getByRole("button", { name: /^Cesantías/ }).first().click()
  await expect(centro.getByText(/14 de febrero/)).toBeVisible()
  await sinScrollHorizontal(page)
  await page.keyboard.press("Escape")
  await expect(centro).toHaveCount(0)
  expect(errs, errs.join("\n")).toEqual([])
})

test("academia por niveles con insignias y tu opinión con elogio sin la página", async ({ page }, info) => {
  test.setTimeout(120_000)
  const errs = watchErrors(page)
  await login(page)

  await page.goto("/academia")
  await expect(page.getByRole("heading", { name: "Nivel básico" })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole("heading", { name: "Nivel intermedio" })).toBeVisible()
  await expect(page.getByRole("list", { name: "Insignias" })).toBeVisible()
  await page.getByRole("button", { name: /Los gastos hormiga/ }).click()
  await completarLeccion(page, "$3.650.000")
  await page.getByRole("button", { name: "Academia", exact: true }).click()
  await expect(page.getByText(/\d+ de \d+ lecciones/).first()).toBeVisible()
  await shot(page, "academia", info.project.name)

  await page.goto("/opiniones")
  await expect(page.getByRole("heading", { name: "Tu opinión", level: 1 })).toBeVisible({ timeout: 30_000 })
  await page.getByRole("button", { name: /Un elogio/ }).click()
  const fb = page.getByRole("dialog", { name: "Tu opinión sobre Mirai" })
  await expect(fb.getByRole("radio", { name: "Un elogio" })).toBeChecked()
  await fb.getByRole("textbox").fill(`Me encanta el Centro de ayuda (${TAG})`)
  await fb.getByRole("switch", { name: "Incluir la página donde estás" }).click()
  await fb.getByRole("button", { name: "Enviar" }).click()
  await expect(page.getByText("¡Gracias! Recibimos tu opinión")).toBeVisible()
  const item = page.locator("[data-slot=card]", { hasText: `Me encanta el Centro de ayuda (${TAG})` })
  await expect(item).toBeVisible()
  await expect(item.getByText(/Desde \/opiniones/)).toHaveCount(0)
  await page.getByRole("radio", { name: /^Sin resolver/ }).click()
  await expect(item).toBeVisible()
  await shot(page, "opiniones-filtro", info.project.name)
  expect(errs, errs.join("\n")).toEqual([])
})

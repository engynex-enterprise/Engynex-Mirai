import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { QA, admin } from "./qa"

// Campaña de prueba con un anuncio en cada ubicación; se borra al final y se restauran los ajustes.
let campId = ""
let prev: Record<string, unknown> | null = null
async function qaId() { const { data } = await admin().auth.admin.listUsers({ perPage: 1000 }); return data.users.find((u) => u.email === QA.email)!.id }

test.beforeAll(async () => {
  const sb = admin()
  prev = (await sb.from("platform_settings").select("anuncios_accion_cada,anuncios_modal_horas,anuncios_ticker").single()).data
  await sb.from("platform_settings").update({ anuncios_accion_cada: 1, anuncios_modal_horas: 1, anuncios_ticker: true }).eq("id", true)
  const { data: c } = await sb.from("ad_campaigns").insert({ nombre: "Campaña QA", anunciante: "Aliado QA", estado: "activa", frecuencia_max: 50, prioridad: 100 }).select("id").single()
  campId = c!.id
  const base = { campaign_id: campId, anunciante: "Aliado QA", url: "/planes", cta: "Ver más", activo: true, prioridad: 100, texto: "", media: {} }
  const { error } = await sb.from("ads").insert([
    { ...base, titulo: "Ticker QA", texto: "Ahorra más con Mirai", formato: "texto", ubicaciones: ["ticker"] },
    { ...base, titulo: "Historia QA", formato: "historia", ubicaciones: ["historia"], media: { color: "#3F7A1E" } },
    { ...base, titulo: "Consejero QA", texto: "Un aliado para tus metas", formato: "imagen", ubicaciones: ["consejero"] },
    { ...base, titulo: "Ventana QA", texto: "Bienvenido de nuevo", formato: "modal", ubicaciones: ["modal"] },
    { ...base, titulo: "Accion QA", texto: "Después de registrar", formato: "imagen", ubicaciones: ["accion"] },
  ])
  if (error) throw new Error(error.message)
})
test.afterAll(async () => {
  const sb = admin()
  if (campId) await sb.from("ad_campaigns").delete().eq("id", campId)
  if (prev) await sb.from("platform_settings").update(prev).eq("id", true)
  await sb.from("platform_admins").delete().eq("user_id", await qaId())
})

test("anuncios: barra, historia, consejero, ventana al entrar, después de una acción y métricas", async ({ page }, info) => {
  test.setTimeout(240_000)
  const errs = watchErrors(page)
  await login(page, "gratis")
  // La ventana al entrar sale una vez por sesión: se limpia solo antes de la primera visita a Inicio.
  await page.evaluate(() => { sessionStorage.removeItem("mirai-ad-modal"); localStorage.removeItem("mirai-ad-modal-at"); sessionStorage.removeItem("mirai-ticker-off") })
  await page.goto("/inicio")
  // Ventana al entrar
  const modal = page.getByTestId("ad-modal")
  await expect(modal).toBeVisible({ timeout: 30_000 })
  await expect(modal.getByText("Ventana QA").first()).toBeVisible()
  await shot(page, "anuncio-ventana", info.project.name)
  await modal.getByRole("button", { name: "Cerrar" }).last().click()
  await expect(modal).toHaveCount(0)
  // Barra en movimiento, historia y junto al consejero
  await expect(page.getByTestId("ad-ticker").getByText("Ticker QA").first()).toBeVisible()
  await expect(page.getByTestId("ad-historia").getByText("Historia QA")).toBeVisible()
  await expect(page.getByTestId("ad-consejero").getByText("Consejero QA")).toBeVisible({ timeout: 20_000 })
  await shot(page, "anuncios-inicio", info.project.name)
  // Después de una acción (registrar un deseo cuenta como acción)
  await page.goto("/deseos")
  await page.getByRole("button", { name: "Agregar deseo" }).first().click()
  await page.getByRole("dialog").getByLabel("Qué es").fill(`Deseo anuncio ${info.project.name}`)
  await page.getByRole("dialog").getByRole("button", { name: "Agregar" }).click()
  const after = page.getByTestId("ad-accion")
  await expect(after.getByText("Accion QA").first()).toBeVisible({ timeout: 20_000 })
  await shot(page, "anuncio-accion", info.project.name)
  await expect(page.getByTestId("ad-modal")).toHaveCount(0)
  await after.getByRole("button", { name: "Cerrar" }).last().click()
  await expect(after).toHaveCount(0)

  // Métricas en la consola
  await admin().from("platform_admins").upsert({ user_id: await qaId() })
  await page.goto("/admin/anuncios")
  await expect(page.getByRole("heading", { name: "Anuncios", level: 1 })).toBeVisible({ timeout: 30_000 })
  const row = page.getByTestId("data-table").locator("tr, li", { hasText: "Campaña QA" }).first()
  await expect(row).toBeVisible({ timeout: 20_000 })
  await expect.poll(async () => { await page.reload(); return (await page.getByTestId("data-table").locator("tr, li", { hasText: "Campaña QA" }).first().innerText()).match(/\d+ personas/)?.[0] ?? "" }, { timeout: 30_000 }).not.toBe("0 personas")
  await page.getByRole("radio", { name: "Métricas" }).click()
  await expect(page.getByText("Por ubicación")).toBeVisible()
  await shot(page, "anuncios-metricas", info.project.name)
  expect(errs).toEqual([])
})

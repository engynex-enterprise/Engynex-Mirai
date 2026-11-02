import { expect, test, type Page } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { QA, admin } from "./qa"

const PLANTILLA = "Celebra cuando cumples una meta"
const TITULO = "¡Meta QA cumplida!"

/** Borra las copias que crea la prueba (deja las automatizaciones por defecto del libro de QA). */
async function limpiar() {
  const sb = admin()
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const uid = data.users.find((u) => u.email === QA.email)?.id
  if (!uid) return
  const { data: hh } = await sb.from("household_members").select("household_id").eq("user_id", uid)
  const { data: books } = await sb.from("books").select("id").in("household_id", (hh ?? []).map((h) => h.household_id))
  const ids = (books ?? []).map((b) => b.id)
  if (ids.length) await sb.from("automations").delete().in("book_id", ids).is("plantilla", null).eq("nombre", PLANTILLA)
}
test.beforeAll(limpiar)
test.afterAll(limpiar)

const movil = (name: string) => name === "movil"

async function abrirEditorDesdePlantilla(page: Page) {
  await page.getByRole("radio", { name: "Plantillas" }).click()
  await page.getByRole("button", { name: `Usar plantilla ${PLANTILLA}` }).click()
  await page.waitForURL(/\/automatizaciones\/[0-9a-f-]{36}$/, { timeout: 30_000 })
}

test("automatizaciones: por defecto, plantilla, editar, probar, activar y pausar", async ({ page }, info) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  await login(page)

  // 1) El módulo deja creadas las automatizaciones por defecto
  await page.goto("/automatizaciones")
  await expect(page.getByRole("heading", { name: "Automatizaciones", level: 1 })).toBeVisible({ timeout: 30_000 })
  for (const n of ["Aviso cuando un gasto supera $200.000", "Recordatorio 3 días antes de cada pago", "Alerta de presupuesto al 80 %", "Resumen semanal los lunes", "Gasto hormiga: avísame y márcalo"])
    await expect(page.getByText(n).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole("switch", { name: /Pausar Aviso cuando un gasto supera/ }).first()).toBeVisible()
  await shot(page, "automatizaciones-lista", info.project.name)

  // 2) Crear una desde la galería de plantillas → abre el editor
  await abrirEditorDesdePlantilla(page)
  await expect(page.getByRole("textbox", { name: "Nombre de la automatización" })).toHaveValue(PLANTILLA, { timeout: 30_000 })

  // 3) Editar el paso "Enviar un aviso"
  if (movil(info.project.name)) {
    await page.getByRole("button", { name: "Editar paso: Enviar un aviso" }).click()
    const dlg = page.getByRole("dialog")
    await dlg.getByLabel("Título").fill(TITULO)
    await dlg.getByRole("button", { name: "Guardar" }).click()
    await expect(page.getByText(TITULO).first()).toBeVisible()
    await page.getByRole("radio", { name: "Diagrama" }).click()
    await expect(page.getByTestId("lienzo")).toBeVisible()
    await page.getByRole("radio", { name: "Pasos" }).click()
  } else {
    await expect(page.getByTestId("lienzo")).toBeVisible()
    await expect(page.getByRole("button", { name: "Agregar paso: Si el monto…" })).toBeVisible()
    await page.getByTestId("paso-aviso").click()
    const panel = page.getByTestId("propiedades")
    await panel.getByLabel("Título").fill(TITULO)
    await expect(page.getByTestId("paso-aviso")).toContainText(TITULO)
    await page.getByRole("button", { name: "Ordenar el diagrama" }).click()
    await page.getByRole("button", { name: "Deshacer" }).click()
    await page.getByRole("button", { name: "Rehacer" }).click()
    await page.getByRole("button", { name: /^Guardar/ }).click()
  }
  await expect(page.getByText("Cambios guardados").first()).toBeVisible()
  await shot(page, "automatizaciones-editor", info.project.name)

  // 4) Probar (simulación sin efectos) y ver el recorrido
  await page.getByRole("button", { name: "Probar", exact: true }).click()
  const prueba = page.getByTestId("prueba")
  await prueba.getByRole("button", { name: "Probar ahora" }).click()
  await expect(prueba.getByText("Recorrido")).toBeVisible({ timeout: 30_000 })
  await expect(prueba.getByText(/Enviaría el aviso/).first()).toBeVisible()
  await shot(page, "automatizaciones-prueba", info.project.name)
  if (movil(info.project.name)) await page.keyboard.press("Escape")

  // 5) Activar y pausar
  await page.getByRole("switch", { name: "Activar automatización" }).click()
  await expect(page.getByRole("switch", { name: "Pausar automatización" })).toBeChecked({ timeout: 15_000 })
  await page.getByRole("switch", { name: "Pausar automatización" }).click()
  await expect(page.getByRole("switch", { name: "Activar automatización" })).not.toBeChecked({ timeout: 15_000 })

  // 6) Vuelve a la lista: la copia aparece pausada; sin scroll horizontal en el celular
  await page.goto("/automatizaciones")
  await expect(page.getByText(PLANTILLA).first()).toBeVisible({ timeout: 30_000 })
  if (movil(info.project.name)) {
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(ancho).toBeLessThanOrEqual(0)
  }
  expect(errs).toEqual([])
})

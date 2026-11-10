import { expect, test } from "@playwright/test"
import { login, shot, watchErrors, waitForAdmin } from "./helpers"
import { QA, admin } from "./qa"

// Consola › Datos de referencia: la usura de cada mes. Si datos.gov.co falla, el administrador la carga a mano con su
// resolución y se aplica a los libros en automático. Se usa un mes lejano (enero de 2031) para no tocar la tasa real.
const MES = "2031-01"
async function qaId() {
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 })
  return data.users.find((u) => u.email === QA.email)!.id
}
test.afterAll(async () => {
  const sb = admin()
  await sb.from("ref_usury_rate").delete().eq("desde", `${MES}-01`)
  await sb.from("platform_admins").delete().eq("user_id", await qaId())
})

test("datos de referencia: ver la usura vigente, cargar un mes a mano desde el interés bancario corriente y borrarlo", async ({ page }, info) => {
  test.setTimeout(150_000)
  const errs = watchErrors(page)
  await login(page)
  await admin().from("platform_admins").upsert({ user_id: await qaId() })
  await waitForAdmin(page)
  await page.goto("/admin/referencias")
  await expect(page.getByRole("heading", { name: "Datos de referencia", level: 1 })).toBeVisible({ timeout: 30_000 })
  // La de noviembre de 2026 (migración 0013) es la vigente, con su fuente.
  await expect(page.getByText("Usura vigente hoy")).toBeVisible()
  await expect(page.getByText(/Resolución 1707 de 2026/).first()).toBeVisible()

  await page.getByRole("button", { name: "Cargar un mes" }).first().click()
  const dlg = page.getByRole("dialog", { name: "Cargar la usura de un mes" })
  await dlg.getByLabel("Mes").fill(MES)
  await dlg.getByRole("radio", { name: "El interés bancario corriente" }).click()
  await dlg.getByRole("textbox", { name: "Interés bancario corriente E.A. (%)" }).fill("20")
  await expect(dlg.getByText(/= 30(,00)? % E\.A\./)).toBeVisible()
  await dlg.getByRole("textbox", { name: "Fuente" }).fill("Superintendencia Financiera, resolución de prueba QA")
  await shot(page, "admin-usura-cargar", info.project.name)
  await dlg.getByRole("button", { name: "Guardar y aplicar" }).click()
  await expect(page.getByText(/Usura guardada/).first()).toBeVisible()
  const fila = page.locator("tr, li", { hasText: "enero de 2031" }).first()
  await expect(fila).toBeVisible()
  await expect(fila.getByText("Próxima")).toBeVisible()
  await expect(fila).toContainText(/30(,00)? %/)
  expect((await admin().from("ref_usury_rate").select("tasa_ea,fuente").eq("desde", `${MES}-01`).single()).data).toMatchObject({ tasa_ea: 30, fuente: "Superintendencia Financiera, resolución de prueba QA" })
  await shot(page, "admin-usura", info.project.name)

  await fila.getByRole("button", { name: "Más acciones" }).click()
  await page.getByRole("menuitem", { name: "Borrar" }).click()
  await page.getByRole("button", { name: "Borrar" }).last().click()
  await expect(page.getByText("Usura del mes borrada.")).toBeVisible()
  await expect(page.locator("tr, li", { hasText: "enero de 2031" })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  expect(errs, errs.join("\n")).toEqual([])
})

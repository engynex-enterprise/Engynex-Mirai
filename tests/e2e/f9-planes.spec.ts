import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { QA, admin, setQaPlan } from "./qa"

// Las demás pruebas usan QA en Premium: al terminar se deja así.
test.afterAll(async () => {
  await setQaPlan("premium")
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 })
  const id = data.users.find((u) => u.email === QA.email)?.id
  if (id) await admin().from("platform_admins").delete().eq("user_id", id)
})

test("plan gratis: secciones Premium bloqueadas, planes y Mi plan", async ({ page }, info) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  await login(page, "gratis")

  // Sección Premium: invitación en lugar del contenido
  await page.goto("/consejero")
  await expect(page.getByText("Inteligencia artificial es parte de Mirai Premium")).toBeVisible({ timeout: 30_000 })
  await shot(page, "planes-paywall", info.project.name)
  await page.goto("/renta")
  await expect(page.getByText("Impuestos y contador es parte de Mirai Premium")).toBeVisible({ timeout: 30_000 })

  // Página de planes: precios y pagos (sin pasarelas configuradas en local)
  await page.getByRole("link", { name: "Ver planes" }).click()
  await expect(page.getByRole("heading", { name: "Planes de Mirai", level: 1 })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId("plan-premium").getByText("$149.000")).toBeVisible()
  await page.getByRole("radio", { name: "Mensual" }).click()
  await expect(page.getByTestId("plan-premium").getByText("$14.900")).toBeVisible()
  await expect(page.getByRole("button", { name: /Pagar con tarjeta/ })).toBeVisible()
  await shot(page, "planes", info.project.name)

  // Mi plan
  await page.goto("/ajustes?tab=plan")
  await expect(page.getByText("Mirai Gratis")).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole("link", { name: "Pásate a Premium" })).toBeVisible()

  // Con Premium (cortesía) se desbloquea
  await setQaPlan("premium")
  await page.goto("/ajustes?tab=plan")
  await expect(page.getByText("Mirai Premium", { exact: true })).toBeVisible({ timeout: 30_000 })
  await page.goto("/consejero")
  await expect(page.getByText("es parte de Mirai Premium")).toHaveCount(0)
  expect(errs).toEqual([])
})

test("panel: regalar Premium, ingresos y planes", async ({ page }, info) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  await login(page, "gratis")
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 })
  await admin().from("platform_admins").upsert({ user_id: data.users.find((u) => u.email === QA.email)!.id })

  await page.goto("/admin?tab=ingresos")
  await expect(page.getByText("Ingreso mensual recurrente")).toBeVisible({ timeout: 30_000 })
  await page.goto("/admin?tab=planes")
  await expect(page.getByText("Precio de Premium")).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/hogares sin integrantes/)).toBeVisible()
  await shot(page, "admin-planes", info.project.name)

  await page.goto("/admin?tab=clientes")
  await page.getByRole("textbox", { name: "Buscar clientes" }).fill(QA.email)
  await page.getByRole("button", { name: /Regalar Premium a/ }).first().click()
  await page.getByRole("dialog").getByRole("button", { name: "Regalar" }).click()
  await expect(page.getByText("Premium regalado")).toBeVisible()
  await expect(page.locator("tr", { hasText: QA.email }).getByText("Premium")).toBeVisible({ timeout: 20_000 })
  expect(errs).toEqual([])
})

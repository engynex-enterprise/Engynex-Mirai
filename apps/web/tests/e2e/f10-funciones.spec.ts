import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { completarLeccion } from "./academia"
import { QA, admin } from "./qa"

const REF = { email: "qa.referido@mirai.test", password: `${QA.password}-ref`, nombre: "Rita Referida" }

async function borrarReferido() {
  const sb = admin()
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const u = data.users.find((x) => x.email === REF.email)
  if (!u) return
  const { data: hh } = await sb.from("household_members").select("household_id").eq("user_id", u.id)
  if (hh?.length) await sb.from("households").delete().in("id", hh.map((h) => h.household_id))
  await sb.auth.admin.deleteUser(u.id)
}
test.afterAll(borrarReferido)

test("calculadoras, lista de deseos, academia y patrimonio", async ({ page }, info) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  await login(page)

  await page.goto("/calculadoras")
  await expect(page.getByText("Recibes al vencimiento")).toBeVisible({ timeout: 30_000 })
  await page.getByRole("radio", { name: "Crédito" }).click()
  await expect(page.getByText("Cuota mensual")).toBeVisible()
  await shot(page, "calculadoras", info.project.name)

  await page.goto("/deseos")
  await page.getByRole("button", { name: "Agregar deseo" }).first().click()
  const dlg = page.getByRole("dialog")
  await dlg.getByLabel("Qué es").fill("Audífonos QA")
  await dlg.getByLabel("Cuánto cuesta").fill("250000")
  await dlg.getByRole("button", { name: "Agregar" }).click()
  await expect(page.getByText("Audífonos QA").first()).toBeVisible()
  await expect(page.getByText("Faltan 30 días").first()).toBeVisible()
  await page.getByRole("button", { name: "Ya no lo quiero" }).first().click()
  await page.getByRole("radio", { name: "Descartados" }).click()
  await expect(page.getByText("Audífonos QA").first()).toBeVisible()
  await shot(page, "deseos", info.project.name)

  await page.goto("/academia")
  await page.getByRole("button", { name: /El presupuesto 50\/30\/20/ }).click()
  await completarLeccion(page, "$400.000")
  await page.getByRole("button", { name: "Academia", exact: true }).click()
  await expect(page.getByText(/\d+ de \d+ lecciones/)).toBeVisible()
  await expect(page.getByRole("button", { name: /Completada El presupuesto 50\/30\/20/ })).toBeVisible()
  await shot(page, "academia", info.project.name)

  await page.goto("/balance")
  await expect(page.getByText("Tu patrimonio mes a mes")).toBeVisible({ timeout: 30_000 })
  expect(errs).toEqual([])
})

test("referidos: quien invita y quien llega reciben el premio", async ({ browser }, info) => {
  test.skip(info.project.name !== "escritorio", "El flujo con una cuenta nueva se prueba una vez")
  test.setTimeout(180_000)
  await borrarReferido()
  const page = await browser.newPage()
  await login(page)
  await page.goto("/referidos")
  const codigo = (await page.locator("p.font-mono").first().innerText()).trim()
  expect(codigo).toMatch(/^[A-Z0-9]{8}$/)
  await expect(page.getByRole("textbox", { name: "Tu enlace de invitación" })).toHaveValue(new RegExp(`/registro\\?ref=${codigo}$`))
  await shot(page, "referidos", info.project.name)

  // La persona invitada se registra (con el código en sus datos) y crea su hogar
  const sb = admin()
  const { data: nu, error } = await sb.auth.admin.createUser({ email: REF.email, password: REF.password, email_confirm: true, user_metadata: { nombre: REF.nombre, ref: codigo, acepta_version: "2026-11-01" } })
  expect(error).toBeNull()
  const p2 = await browser.newPage()
  await p2.goto("/login")
  await p2.getByLabel("Correo").fill(REF.email)
  await p2.getByLabel("Contraseña", { exact: true }).fill(REF.password)
  await p2.getByRole("button", { name: "Entrar" }).click()
  await p2.getByRole("button", { name: "Empezar" }).click()
  await p2.waitForURL(/puesta/, { timeout: 30_000 })

  await expect.poll(async () => (await sb.from("referrals").select("estado").eq("referred", nu.user!.id).maybeSingle()).data?.estado, { timeout: 20_000 }).toBe("recompensado")
  const { data: hh } = await sb.from("household_members").select("household_id").eq("user_id", nu.user!.id)
  const { data: plan } = await sb.rpc("household_plan", { h: hh![0].household_id })
  expect(plan).toBe("premium")
  await page.reload()
  await expect(page.getByText(/Rita/).first()).toBeVisible({ timeout: 20_000 })
  // Limpieza del premio de QA (no debe quedar Premium extra para otras pruebas)
  const { data: qa } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const qaId = qa.users.find((u) => u.email === QA.email)!.id
  await sb.from("referrals").delete().eq("referrer", qaId)
  const { data: qh } = await sb.from("household_members").select("household_id").eq("user_id", qaId)
  await sb.from("plan_subscriptions").delete().in("household_id", (qh ?? []).map((h) => h.household_id)).eq("nota", "Referido")
})

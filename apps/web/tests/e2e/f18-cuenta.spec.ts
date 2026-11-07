import { expect, test, type Browser, type Page, type TestInfo } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { admin, QA } from "./qa"

// Tu cuenta: Perfil › Cuentas conectadas (formas de entrar, cambiar correo hasta "pendiente", cambiar cuenta de
// Google con selección de cuenta), Ajustes › Tu cuenta (hogares, sesiones, actividad) y pasar el hogar con una
// persona de prueba que rechaza y luego acepta. Todo con correos @mirai.test: Mirai no los envía de verdad.

async function qaInfo() {
  const sb = admin()
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const qa = data.users.find((u) => u.email === QA.email)!
  const { data: m } = await sb.from("household_members").select("household_id,households(nombre)").eq("user_id", qa.id).eq("access_role", "owner").limit(1).single()
  return { qaId: qa.id, householdId: m!.household_id, hogar: (m!.households as unknown as { nombre: string }).nombre }
}

/** Persona de prueba con cuenta (creada con la API de administración) que ya es del hogar de QA. */
async function addReceiver(householdId: string, nombre: string, email: string, password: string) {
  const sb = admin()
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const old = users.users.find((u) => u.email === email)
  if (old) await sb.auth.admin.deleteUser(old.id)
  const { data: u, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nombre } })
  if (error) throw error
  await sb.from("household_members").insert({ household_id: householdId, user_id: u.user.id, role: "editor", access_role: "editor" })
  await sb.from("user_preferences").upsert({ user_id: u.user.id, extra: { welcome_seen: new Date().toISOString(), helpHidden: [] }, tour_done: true })
  return u.user.id
}

/** Deja todo como estaba: QA dueño de su hogar, sin solicitudes pendientes y sin la persona de prueba. */
async function cleanup(householdId: string, qaId: string, receiverId: string | null) {
  const sb = admin()
  await sb.from("household_transfers").delete().eq("household_id", householdId)
  await sb.from("household_members").update({ access_role: "owner" }).eq("household_id", householdId).eq("user_id", qaId)
  if (receiverId) await sb.auth.admin.deleteUser(receiverId)
}

async function loginAs(browser: Browser, use: TestInfo["project"]["use"], email: string, password: string) {
  const { baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId } = use
  const ctx = await browser.newContext({ baseURL, viewport, userAgent, deviceScaleFactor, isMobile, hasTouch, locale, timezoneId })
  const page = await ctx.newPage()
  await page.goto("/login")
  await page.getByLabel("Correo").fill(email)
  await page.getByLabel("Contraseña", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Entrar" }).click()
  await page.waitForURL(/\/(inicio|puesta|bienvenida)/, { timeout: 30_000 })
  return { ctx, page }
}

const card = (page: Page) => page.locator("#cuentas")
const ROLE_ADMIN = "Administra"

test("perfil: cuentas conectadas, método único, cambiar correo hasta pendiente y cambiar cuenta de Google", async ({ page }, info) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  const n = `${info.project.name}-${Date.now() % 10000}`
  const nuevo = `qa+nuevo-${n}@mirai.test`
  await login(page)

  await page.goto("/perfil#cuentas")
  await expect(page.getByRole("heading", { name: "Cuentas conectadas" })).toBeVisible({ timeout: 30_000 })
  await card(page).scrollIntoViewIfNeeded()
  await expect(card(page).getByText("Correo de tu cuenta")).toBeVisible()
  await expect(card(page).getByText(QA.email).first()).toBeVisible()

  // QA solo entra con correo y contraseña: Quitar está desactivado y explica por qué
  const pw = card(page).locator('[data-method="password"]')
  await expect(pw.getByText("Correo y contraseña")).toBeVisible()
  await expect(pw.getByRole("button", { name: "Quitar Correo y contraseña" })).toBeDisabled()
  await expect(pw.getByText("Es tu única forma de entrar: agrega otra antes de quitarla.")).toBeVisible()
  await expect(card(page).locator('[data-method="magic"]').getByText("Disponible")).toBeVisible()

  // Agregar otra forma de entrar → Google con selección de cuenta (se intercepta la ventana de Google)
  await page.route(/accounts\.google\.com/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>Google (prueba)</title><p>Google</p>" }))
  await card(page).getByRole("button", { name: "Agregar otra forma de entrar" }).click()
  await expect(page.getByRole("menuitem", { name: /Conectar mi cuenta de Google/ })).toBeVisible()
  const googleReq = page.waitForRequest(/accounts\.google\.com/, { timeout: 30_000 })
  await page.getByRole("menuitem", { name: /Conectar mi cuenta de Google/ }).click()
  const req = await googleReq
  expect(req.url()).toContain("prompt=select_account")
  await page.unroute(/accounts\.google\.com/)

  // Volver de Google con una cuenta que ya es de otra persona: mensaje claro
  await page.goto("/perfil?cuentas=ya_existe#cuentas")
  await expect(page.getByText("Esa cuenta de Google ya es de otra persona en Mirai")).toBeVisible({ timeout: 30_000 })
  await expect(page).not.toHaveURL(/cuentas=ya_existe/)

  // Cambiar el correo: queda pendiente de confirmar (correo de prueba, no se envía)
  await card(page).getByRole("button", { name: "Cambiar correo" }).click()
  const dlg = page.getByRole("dialog", { name: "Cambiar el correo de tu cuenta" })
  await expect(dlg).toBeVisible()
  await expect(dlg.getByText("Por seguridad también te llega uno a tu correo actual")).toBeVisible()
  await dlg.getByLabel("Correo nuevo").fill(QA.email.toUpperCase())
  await expect(dlg.getByText("Ese ya es el correo de tu cuenta.")).toBeVisible()
  await dlg.getByLabel("Correo nuevo").fill(nuevo)
  await dlg.getByRole("button", { name: "Enviar enlace de confirmación" }).click()
  await expect(page.getByText(/Correo de prueba: no se envió de verdad/)).toBeVisible({ timeout: 30_000 })
  const pend = card(page).getByTestId("correo-pendiente")
  await expect(pend.getByText("Pendiente de confirmar")).toBeVisible()
  await expect(pend.getByText(nuevo)).toBeVisible()
  await shot(page, "cuenta-perfil", info.project.name)

  // Sigue entrando con el correo de siempre y puede cancelar
  await pend.getByRole("button", { name: "Cancelar el cambio" }).click()
  await expect(page.getByText("Cancelamos el cambio de correo. Los enlaces que te llegaron ya no sirven.")).toBeVisible()
  await expect(card(page).getByTestId("correo-pendiente")).toHaveCount(0)

  // Ajustes › Tu cuenta: enlace a la tarjeta, hogares, sesiones y actividad
  await page.goto("/ajustes?tab=cuenta")
  await expect(page.getByRole("heading", { name: "Tus hogares" })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole("link", { name: /Cambiar correo o cuentas/ })).toHaveAttribute("href", "/perfil#cuentas")
  await expect(page.getByText("Aquí estás").first()).toBeVisible()
  await expect(page.getByText(`Pediste cambiar tu correo a ${nuevo}`)).toBeVisible()
  await expect(page.getByText(`Cancelaste el cambio de correo a ${nuevo}`)).toBeVisible()
  await shot(page, "cuenta-ajustes", info.project.name)
  expect(errs).toEqual([])
})

test("pasar el hogar: la otra persona rechaza y luego acepta", async ({ page, browser }, info) => {
  test.setTimeout(300_000)
  const errs = watchErrors(page)
  await login(page)
  const { qaId, householdId, hogar } = await qaInfo()
  const nombre = `Laura ${info.project.name}`
  const email = `qa+receptor-${info.project.name}@mirai.test`
  const password = `Qa-${Date.now()}-Receptor!`
  let receiverId: string | null = null
  try {
    receiverId = await addReceiver(householdId, nombre, email, password)

    const pedir = async () => {
      await page.goto("/ajustes?tab=hogar")
      const d = page.getByRole("dialog", { name: "Pasar el hogar a otra persona" })
      // Un clic antes de que React tome la página (con la API en el mismo origen carga muy rápido) se pierde: se reintenta.
      await expect(async () => {
        if (!(await d.isVisible())) await page.getByRole("button", { name: "Pasar el hogar" }).click()
        await expect(d).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 30_000 })
      await d.getByRole("radio", { name: new RegExp(nombre) }).click()
      await expect(d.getByRole("radio", { name: /Administra/ })).toBeChecked()
      await expect(d.getByText(/Tú quedas como Administra/)).toBeVisible()
      await d.getByLabel(/escribe el nombre del hogar/).fill("otro nombre")
      await expect(d.getByRole("button", { name: "Pasar el hogar" })).toBeDisabled()
      await d.getByLabel(/escribe el nombre del hogar/).fill(hogar.toLowerCase())
      await d.getByRole("button", { name: "Pasar el hogar" }).click()
      const a = page.getByRole("alertdialog", { name: `¿Pasarle el hogar a ${nombre}?` })
      await expect(a).toBeVisible()
      await a.getByRole("button", { name: "Sí, pasarle el hogar" }).click()
      await expect(page.getByText(/Listo: le enviamos a .* un aviso en Mirai \(correo de prueba: no se envió\)/)).toBeVisible({ timeout: 30_000 })
      await expect(page.locator('[data-transfer="saliente"]').getByText("Esperando respuesta")).toBeVisible()
    }

    // 1) Pide y la persona rechaza (desde Ajustes › Tu cuenta)
    await pedir()
    await shot(page, "cuenta-pasar-hogar", info.project.name)
    const r = await loginAs(browser, info.project.use, email, password)
    await r.page.goto("/ajustes?tab=cuenta")
    const entrante = r.page.locator('[data-transfer="entrante"]')
    await expect(entrante.getByText(new RegExp(`quiere pasarte el hogar`))).toBeVisible({ timeout: 30_000 })
    await entrante.getByRole("button", { name: "Rechazar" }).click()
    await r.page.getByRole("alertdialog", { name: "¿Rechazar la solicitud?" }).getByRole("button", { name: "Rechazar" }).click()
    await expect(r.page.getByText("Rechazaste la solicitud. Todo sigue igual en el hogar.")).toBeVisible({ timeout: 30_000 })
    await page.goto("/ajustes?tab=hogar")
    await expect(page.locator('[data-transfer="saliente"]')).toHaveCount(0)
    await expect(page.getByRole("button", { name: "Pasar el hogar" })).toBeVisible()

    // 2) Pide de nuevo y la persona acepta (en escritorio desde la campana; en el celular desde Tu cuenta)
    await pedir()
    if (info.project.name === "escritorio") {
      await r.page.goto("/inicio")
      await r.page.getByRole("button", { name: "Notificaciones" }).first().click()
      const aviso = r.page.locator('[data-kind="hogar"]').filter({ hasText: "quiere pasarte el hogar" }).first()
      await expect(aviso).toBeVisible({ timeout: 30_000 })
      await aviso.getByRole("button", { name: "Aceptar" }).click()
    } else {
      await r.page.goto("/ajustes?tab=cuenta")
      await r.page.locator('[data-transfer="entrante"]').getByRole("button", { name: "Aceptar" }).click()
      await r.page.getByRole("alertdialog").getByRole("button", { name: "Aceptar" }).click()
    }
    await expect(r.page.getByText("¡Listo! Ahora eres el dueño del hogar.", { exact: false })).toBeVisible({ timeout: 30_000 })
    await r.ctx.close()

    // QA queda como Administra y le llega el aviso
    await page.goto("/ajustes?tab=hogar")
    await expect(page.getByText(ROLE_ADMIN).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole("button", { name: "Pasar el hogar" })).toHaveCount(0)
    const { data: aviso } = await admin().from("notifications").select("titulo").eq("user_id", qaId).like("dedupe", "transfer-res:%").order("created_at", { ascending: false }).limit(1).single()
    expect(aviso?.titulo).toMatch(/aceptó/)
    expect(errs).toEqual([])
  } finally {
    await cleanup(householdId, qaId, receiverId)
  }
})


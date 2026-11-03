import { expect, test, type Page } from "@playwright/test"
import { QA, admin, setQaWelcome } from "./qa"
import { login } from "./helpers"

const errors = (page: Page) => {
  const list: string[] = []
  page.on("pageerror", (e) => list.push(e.message))
  page.on("console", (m) => m.type() === "error" && !/favicon|404|Failed to load resource/.test(m.text()) && list.push(m.text()))
  return list
}

test.describe.configure({ mode: "serial" })

test("protege rutas y pide login", async ({ page }) => {
  await page.goto("/gastos")
  await expect(page).toHaveURL(/\/login\?next=%2Fgastos/)
  await expect(page.getByRole("heading", { name: "Hola de nuevo" })).toBeVisible()
  await page.screenshot({ path: `tests/.out/login-${test.info().project.name}.png`, fullPage: true })
})

test("registro muestra medidor y exige aceptar la política", async ({ page }) => {
  await page.goto("/registro")
  await page.getByLabel("Contraseña", { exact: true }).fill("abc")
  await expect(page.getByText("Muy débil").or(page.getByText("Débil"))).toBeVisible()
  // El botón queda inactivo hasta que todo esté bien (contraseña segura y política aceptada).
  await expect(page.getByRole("button", { name: "Crear mi cuenta" })).toBeDisabled()
  await expect(page.getByText("Debes aceptar para crear tu cuenta")).toBeVisible()
  await page.screenshot({ path: `tests/.out/registro-${test.info().project.name}.png`, fullPage: true })
})

test("login → bienvenida → shell con menú, Ctrl K y Agregar", async ({ page }) => {
  const errs = errors(page)
  // Este usuario puede quedar en el plan Gratis: que la ventana de anuncio (campañas reales de la consola) no tape la prueba.
  await page.addInitScript(() => { try { sessionStorage.setItem("mirai-ad-modal", "1") } catch {} })
  await page.goto("/login")
  await page.getByLabel("Correo").fill(QA.email)
  await page.getByLabel("Contraseña", { exact: true }).fill(QA.password)
  await page.getByRole("button", { name: "Entrar" }).click()
  const welcome = page.getByRole("heading", { name: "¡Bienvenido a Mirai!" })
  await expect(welcome.or(page.getByRole("button", { name: "Cómo funciona" }))).toBeVisible({ timeout: 20_000 })
  if (await welcome.isVisible()) {
    await expect(page.getByLabel("¿Cómo te llamas?")).toHaveValue(QA.nombre)
    await page.screenshot({ path: `tests/.out/bienvenida-${test.info().project.name}.png`, fullPage: true })
    await page.getByRole("button", { name: "Empezar" }).click()
    await page.waitForURL(/\/puesta/)
  }
  // Modal de bienvenida (una sola vez): se ve, se cierra y no vuelve a salir
  await setQaWelcome(false)
  await page.goto("/inicio")
  const modal = page.getByRole("dialog", { name: /Bienvenido a Mirai, / })
  await expect(modal).toBeVisible({ timeout: 20_000 })
  await expect(modal.getByText("Tus datos, seguros y privados")).toBeVisible()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `tests/.out/bienvenida-modal-${test.info().project.name}.png` })
  await modal.getByRole("button", { name: "Cerrar" }).click()
  await expect(modal).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await expect(page.getByRole("dialog", { name: /Bienvenido a Mirai, / })).toHaveCount(0)
  await expect(page.getByText("Sincronizado en vivo").or(page.getByRole("button", { name: "Menú", exact: true }))).toBeVisible({ timeout: 15_000 })
  await page.screenshot({ path: `tests/.out/inicio-${test.info().project.name}.png`, fullPage: true })

  await page.keyboard.press("Control+k")
  await expect(page.getByPlaceholder("Buscar secciones, contactos, préstamos…")).toBeVisible()
  await page.keyboard.type("hormiga")
  await page.screenshot({ path: `tests/.out/buscar-${test.info().project.name}.png` })
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(/\/gastos/)

  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.keyboard.press("n")
  await expect(page.getByText("¿Qué quieres agregar?")).toBeVisible()
  await page.screenshot({ path: `tests/.out/agregar-${test.info().project.name}.png` })
  await page.keyboard.press("Escape")

  // "Cómo funciona" abre el Centro de ayuda en la ayuda de esta página; Atrás lleva a la portada.
  await page.getByRole("button", { name: "Cómo funciona" }).click()
  const centro = page.getByRole("dialog", { name: "Centro de ayuda" })
  await expect(centro.getByRole("heading", { name: "Gastos y hormiga" })).toBeVisible()
  await centro.getByRole("button", { name: "Atrás" }).click()
  await expect(centro.getByRole("textbox", { name: "Buscar en el Centro de ayuda" })).toBeVisible()
  await expect(centro.getByText("Cómo funciona: Gastos y hormiga")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(centro).toHaveCount(0)

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, "sin scroll horizontal").toBeLessThanOrEqual(0)
  expect(errs, errs.join("\n")).toEqual([])
})

test("⌘K encuentra un proveedor y una meta; Agregar → Suscripción abre el formulario", async ({ page }, info) => {
  test.setTimeout(120_000)
  const errs = errors(page)
  await login(page)
  const sb = admin()
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const uid = data.users.find((u) => u.email === QA.email)!.id
  const { data: hh } = await sb.from("household_members").select("household_id").eq("user_id", uid).limit(1).single()
  const { data: bk } = await sb.from("books").select("id").eq("household_id", hh!.household_id).is("deleted_at", null).order("is_default", { ascending: false }).order("created_at").limit(1).single()
  const bookId = bk!.id, tag = info.project.name.replace(/\W+/g, "")
  const prov = `Ferretería Buscador ${tag}`, meta = `Viaje Buscador ${tag}`
  await sb.from("providers").delete().eq("book_id", bookId).eq("nombre", prov)
  await sb.from("goals").delete().eq("book_id", bookId).eq("nombre", meta)
  const { data: p } = await sb.from("providers").insert({ book_id: bookId, nombre: prov, tipo: "comercio" }).select("id").single()
  const { data: g } = await sb.from("goals").insert({ book_id: bookId, nombre: meta, objetivo: 3_000_000, ahorrado: 0 }).select("id").single()
  try {
    await page.goto("/inicio")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 })
    await page.keyboard.press("Control+k")
    const input = page.getByPlaceholder("Buscar secciones, contactos, préstamos…")
    await expect(input).toBeVisible()
    await input.fill(prov)
    const opt = page.getByRole("option", { name: new RegExp(prov) })
    await expect(opt).toBeVisible({ timeout: 15_000 })
    await page.screenshot({ path: `tests/.out/buscar-proveedor-${info.project.name}.png` })
    await opt.click()
    await expect(page).toHaveURL(new RegExp(`/proveedores\\?id=${p!.id}`))

    await page.keyboard.press("Escape")
    await page.keyboard.press("Control+k")
    await input.fill(meta)
    await page.getByRole("option", { name: new RegExp(meta) }).click()
    await expect(page).toHaveURL(/\/metas/)

    // Agregar (tecla N) → Suscripción abre "Nueva suscripción".
    await expect(page.getByRole("dialog")).toHaveCount(0)
    await page.keyboard.press("n")
    const add = page.getByRole("dialog", { name: "¿Qué quieres agregar?" })
    await expect(add).toBeVisible()
    await expect(add.getByRole("button", { name: /Compra con tarjeta/ })).toBeVisible()
    await expect(add.getByRole("button", { name: /Proveedor/ })).toBeVisible()
    await page.screenshot({ path: `tests/.out/agregar-grupos-${info.project.name}.png` })
    await add.getByRole("button", { name: /Suscripción/ }).click()
    await expect(page).toHaveURL(/\/suscripciones\?nuevo=1/)
    await expect(page.getByRole("dialog", { name: "Nueva suscripción" })).toBeVisible({ timeout: 15_000 })
  } finally {
    await sb.from("providers").delete().eq("id", p!.id)
    await sb.from("goals").delete().eq("id", g!.id)
  }
  expect(errs, errs.join("\n")).toEqual([])
})

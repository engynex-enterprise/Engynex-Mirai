import { createHash, randomBytes } from "node:crypto"
import { expect, test } from "@playwright/test"
import { login, shot, watchErrors, waitForAdmin } from "./helpers"
import { QA, admin, setQaPlan } from "./qa"

// Las demás pruebas usan QA en Premium: al terminar se deja así.
test.afterAll(async () => {
  await admin().from("plan_subscriptions").delete().eq("plan", "plan-qa")
  await admin().from("plans").delete().eq("id", "plan-qa")
  await setQaPlan("premium")
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 })
  const id = data.users.find((u) => u.email === QA.email)?.id
  if (id) await admin().from("platform_admins").delete().eq("user_id", id)
})

/** household_plan da Premium al hogar de un administrador de la plataforma: las pruebas de la consola (más arriba) dejan
 *  a QA como administrador hasta el afterAll. Las del plan Gratis que van después lo quitan antes de entrar. */
async function sinAdmin() {
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 })
  const id = data.users.find((u) => u.email === QA.email)?.id
  if (id) await admin().from("platform_admins").delete().eq("user_id", id)
}

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
  await expect(page.getByTestId("plan-premium").getByRole("button", { name: /Pagar con tarjeta/ })).toBeVisible()
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

test("consola: entrar desde el perfil, crear un plan, asignarlo y ver pagos", async ({ page }, info) => {
  test.setTimeout(240_000)
  const errs = watchErrors(page)
  await login(page, "gratis")
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 })
  await admin().from("platform_admins").upsert({ user_id: data.users.find((u) => u.email === QA.email)!.id })
  await waitForAdmin(page)
  await admin().from("plans").delete().eq("id", "plan-qa")

  // Entrada: opción Admin en el menú de perfil
  await page.goto("/inicio")
  const mobile = info.project.name.includes("movil")
  if (mobile) await page.getByRole("button", { name: "Menú" }).click()
  await page.locator("[data-tour=user]").click()
  await page.getByRole("menuitem", { name: "Admin" }).click()
  await expect(page.getByRole("heading", { name: "Resumen", level: 1 })).toBeVisible({ timeout: 30_000 })
  await shot(page, "consola-resumen", info.project.name)
  // Selector de modo: Usuario ↔ Admin
  if (!mobile) {
    await page.getByRole("radio", { name: "Usuario" }).click()
    await expect(page).toHaveURL(/\/inicio/)
    await page.getByRole("radio", { name: "Admin" }).click()
    await expect(page.getByRole("heading", { name: "Resumen", level: 1 })).toBeVisible({ timeout: 30_000 })
    await page.getByRole("button", { name: /Minimizar o expandir el menú/ }).first().click()
    await shot(page, "consola-minimizada", info.project.name)
    await page.getByRole("button", { name: /Minimizar o expandir el menú/ }).first().click()
  }

  // Crear un plan
  await page.goto("/admin/planes")
  await page.getByRole("button", { name: "Nuevo plan" }).click()
  const dlg = page.getByRole("dialog")
  await dlg.getByLabel("Nombre").fill("Plan QA")
  await dlg.getByRole("checkbox", { name: "Inteligencia artificial" }).click()
  await dlg.getByRole("button", { name: "Guardar plan" }).click()
  await expect(page.getByText("Plan guardado")).toBeVisible()
  await expect(page.getByRole("heading", { name: "Plan QA" })).toBeVisible()
  await shot(page, "consola-planes", info.project.name)

  // Asignarlo desde la ficha del usuario
  await page.goto("/admin/usuarios")
  await page.getByRole("textbox", { name: "Buscar por nombre, correo u hogar" }).fill(QA.email)
  await shot(page, "consola-usuarios", info.project.name)
  await page.locator("#main").getByRole("link", { name: QA.nombre }).first().click()
  await expect(page.getByRole("heading", { name: QA.nombre, level: 1 })).toBeVisible({ timeout: 30_000 })
  await page.getByRole("button", { name: "Asignar plan" }).first().click()
  await page.getByRole("dialog").getByRole("combobox").first().click()
  await page.getByRole("option", { name: "Plan QA" }).click()
  await page.getByRole("dialog").getByRole("button", { name: "Asignar" }).click()
  await expect(page.getByText("Plan asignado")).toBeVisible()
  await shot(page, "consola-usuario", info.project.name)

  // Pagos y auditoría
  await page.goto("/admin/pagos")
  await expect(page.getByText("Ingreso mensual recurrente")).toBeVisible({ timeout: 30_000 })
  await page.goto("/admin/auditoria")
  await expect(page.getByText("asignar plan").first()).toBeVisible({ timeout: 30_000 })
  await admin().from("plan_subscriptions").delete().eq("plan", "plan-qa")
  await admin().from("plans").delete().eq("id", "plan-qa")
  expect(errs).toEqual([])
})

/** Guarda la fila global de una integración para restaurarla al final (pruebas y producción comparten la base). */
async function keepGlobal(kind: string) {
  const { data } = await admin().from("platform_integrations").select("*").eq("kind", kind).maybeSingle()
  return async () => { if (data) await admin().from("platform_integrations").upsert(data); else await admin().from("platform_integrations").delete().eq("kind", kind) }
}

test("consola: la IA global activa por defecto llega a los hogares", async ({ page }, info) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  await login(page)
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 })
  await admin().from("platform_admins").upsert({ user_id: data.users.find((u) => u.email === QA.email)!.id })
  await waitForAdmin(page)
  const restore = await keepGlobal("ai_gateway")
  try {
    await page.goto("/admin/integraciones")
    const card = page.locator("[data-slot=card]", { hasText: "Vercel AI Gateway" })
    await card.getByRole("button", { name: "Configurar" }).click()
    await page.getByRole("dialog").getByRole("radio", { name: /Activa por defecto/ }).click()
    await page.getByRole("dialog").getByRole("button", { name: "Guardar" }).click()
    await expect(page.getByText("Integración global guardada")).toBeVisible()
    await shot(page, "consola-integraciones", info.project.name)
    // El enlace viejo de Integraciones abre Ajustes › Inteligencia artificial (lo único que configura el hogar).
    await page.goto("/ajustes?tab=integraciones")
    const mine = page.locator("[data-slot=card]", { hasText: "Vercel AI Gateway" })
    await expect(mine.getByText("Incluida por Mirai")).toBeVisible({ timeout: 30_000 })
    await expect(mine.getByRole("switch")).toBeChecked()
  } finally {
    await restore()
  }
  expect(errs).toEqual([])
})

test("consola: correo, WhatsApp y datos solo los configura el administrador", async ({ page }, info) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  await login(page)
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 })
  await admin().from("platform_admins").upsert({ user_id: data.users.find((u) => u.email === QA.email)!.id })
  await waitForAdmin(page)
  const restore = await keepGlobal("festivos")
  try {
    await page.goto("/admin/integraciones")
    // Las que no son IA solo se apagan o se activan (sin modos por hogar).
    const card = page.locator("[data-slot=card]", { hasText: "Festivos de Colombia" })
    await card.getByRole("button", { name: "Configurar" }).click()
    const dlg = page.getByRole("dialog")
    await expect(dlg.getByRole("radio", { name: /Activa por defecto/ })).toHaveCount(0)
    await dlg.getByRole("radio", { name: /^Apagada/ }).click()
    await dlg.getByRole("button", { name: "Guardar" }).click()
    await expect(page.getByText("Integración global guardada")).toBeVisible()
    await expect(card.getByText("Apagada", { exact: true })).toBeVisible()
    await card.getByRole("button", { name: "Configurar" }).click()
    await dlg.getByRole("radio", { name: /^Activa/ }).click()
    await dlg.getByRole("button", { name: "Guardar" }).click()
    await expect(card.getByText("Activa", { exact: true })).toBeVisible({ timeout: 20_000 })
    // WhatsApp y correo tienen "Enviar prueba" cuando hay datos guardados (no se envía nada aquí).
    const wa = page.locator("[data-slot=card]", { hasText: "WhatsApp Cloud API" })
    await expect(wa.getByRole("button", { name: "Configurar" })).toBeVisible()
    await shot(page, "consola-integraciones-admin", info.project.name)

    // Registro de envíos
    await page.goto("/admin/envios")
    // El título de la página (el primer texto igual puede ser el del menú lateral, oculto en ese momento).
    await expect(page.getByRole("heading", { name: "Registro de envíos", level: 1 })).toBeVisible({ timeout: 30_000 })
    await shot(page, "consola-envios", info.project.name)

    // El hogar ya no ve correo, WhatsApp, Telegram ni datos: solo la IA.
    await page.goto("/ajustes?tab=ia")
    await expect(page.getByText("Google Gemini").first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText("WhatsApp Cloud API")).toHaveCount(0)
    await expect(page.getByText("Festivos de Colombia")).toHaveCount(0)
    await expect(page.getByRole("switch", { name: "Activar Telegram" })).toHaveCount(0)
  } finally {
    await restore()
  }
  expect(errs).toEqual([])
})

test("consola: Google AdSense se configura en integraciones globales y publica ads.txt", async ({ page, request }, info) => {
  test.skip(info.project.name !== "escritorio", "Configuración global: una vez basta")
  test.setTimeout(180_000)
  await login(page)
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 })
  await admin().from("platform_admins").upsert({ user_id: data.users.find((u) => u.email === QA.email)!.id })
  await waitForAdmin(page)
  const restore = await keepGlobal("adsense")
  try {
    await page.goto("/admin/integraciones")
    const card = page.locator("[data-slot=card]", { hasText: "Google AdSense" })
    await card.getByRole("button", { name: "Configurar" }).click()
    const dlg = page.getByRole("dialog")
    await dlg.getByRole("radio", { name: /^Activa/ }).click()
    await dlg.getByRole("textbox", { name: "Id de cliente (ca-pub-…)" }).fill("pub-mal")
    await dlg.getByRole("textbox", { name: "Id del bloque de anuncios" }).fill("1234567890")
    await dlg.getByRole("button", { name: "Guardar" }).click()
    await expect(page.getByText("El id de cliente debe verse así")).toBeVisible()
    await dlg.getByRole("textbox", { name: "Id de cliente (ca-pub-…)" }).fill("ca-pub-1234567890123456")
    await dlg.getByRole("button", { name: "Guardar" }).click()
    await expect(page.getByText("Integración global guardada")).toBeVisible()
    expect(await (await request.get("/ads.txt")).text()).toContain("google.com, pub-1234567890123456, DIRECT")
    await page.goto("/admin/anuncios")
    await page.getByRole("radio", { name: "Ajustes" }).click()
    await expect(page.getByText(/Activo \(ca-pub-1234567890123456\)/)).toBeVisible({ timeout: 30_000 })
    await page.goto("/ajustes?tab=ia")
    await expect(page.getByText("Google Gemini").first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText("Google AdSense")).toHaveCount(0)
  } finally {
    await restore()
  }
})

test("página pública: qué es Mirai y planes con precio", async ({ page }, info) => {
  const errs = watchErrors(page)
  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Tus finanzas en orden, sin saber de finanzas.", level: 1 })).toBeVisible({ timeout: 30_000 })
  await expect(page.locator("#planes").getByText("$14.900")).toBeVisible({ timeout: 20_000 })
  await shot(page, "landing", info.project.name)
  await page.getByRole("link", { name: /Crear cuenta gratis/ }).first().click()
  await expect(page).toHaveURL(/registro/)
  expect(errs).toEqual([])
})

test("contador: con el plan Gratis un enlace que ya existía queda no disponible (también en el servidor)", async ({ page }, info) => {
  test.setTimeout(120_000)
  const errs = watchErrors(page)
  await sinAdmin()
  await login(page, "gratis")
  const sb = admin()
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const uid = data.users.find((u) => u.email === QA.email)!.id
  const { data: hh } = await sb.from("household_members").select("household_id").eq("user_id", uid).limit(1).single()
  const { data: bk } = await sb.from("books").select("id").eq("household_id", hh!.household_id).is("deleted_at", null).order("created_at").limit(1).single()
  // Un acceso creado cuando el hogar era Premium (la app ya no deja crearlo en Gratis).
  const token = randomBytes(24).toString("base64url")
  const { data: share } = await sb.from("accountant_shares").insert({ book_id: bk!.id, label: `Contador QA ${info.project.name}`, email: "", perms: "renta", token_hash: createHash("sha256").update(token).digest("hex"), created_by: uid }).select("id").single()
  try {
    await page.goto(`/contador/${token}`)
    await expect(page.getByRole("heading", { name: "Acceso no disponible por ahora" })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/ya no incluye el acceso para su contador/)).toBeVisible()
    await shot(page, "contador-no-disponible", info.project.name)
    // Con Premium, el mismo enlace vuelve a abrir el portal.
    await setQaPlan("premium")
    await page.goto(`/contador/${token}`)
    await expect(page.getByText(/^Notas con /).first()).toBeVisible({ timeout: 30_000 })
  } finally {
    await sb.from("accountant_shares").delete().eq("id", share!.id)
    await setQaPlan("premium")
  }
  expect(errs).toEqual([])
})

test("plan gratis: el respaldo de la versión 4 se puede traer en Importar", async ({ page }) => {
  test.setTimeout(120_000)
  await sinAdmin()
  await login(page, "gratis")
  await page.goto("/importar")
  await expect(page.getByText("Automatización bancaria es parte de Mirai Premium")).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId("respaldo-v4")).toBeVisible()
  await expect(page.getByText("Subir respaldo (.json)")).toBeVisible()
  await setQaPlan("premium")
})

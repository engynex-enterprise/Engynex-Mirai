import { expect, test, type Page } from "@playwright/test"
import { login, watchErrors } from "./helpers"
import { QA, admin, setQaPlan } from "./qa"
import { LEGAL_VERSION } from "../../lib/legal/version"

// Chat de Mirai: burbuja → sugerencias al azar → respuesta instantánea (quickAnswer, sin IA) → pantalla completa en
// /consejero con la misma conversación → historial: renombrar y eliminar con Deshacer. Escritorio y móvil.
// La prueba con IA real solo corre con E2E_AI=1 (gasta créditos del proveedor configurado).

test.afterAll(async () => { await setQaPlan("premium") })

const shotTo = (page: Page, name: string, project: string, full = false) => page.screenshot({ path: `tests/.out/${name}-${project}.png`, fullPage: full })

/** Abre el historial (en celular es un panel lateral) y devuelve el contenedor de la lista. */
async function history(page: Page, mobile: boolean) {
  if (mobile) {
    await page.getByRole("button", { name: "Historial", exact: true }).click()
    const sheet = page.getByRole("dialog", { name: "Tus conversaciones" })
    await expect(sheet).toBeVisible()
    return sheet
  }
  return page.getByRole("complementary", { name: "Historial" })
}

test("chat: burbuja, sugerencias, respuesta con tus datos, pantalla completa e historial", async ({ page }, info) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  const mobile = info.project.name.includes("movil")
  await login(page)
  await page.goto("/inicio")
  await page.waitForLoadState("networkidle").catch(() => {})
  await page.waitForTimeout(1800) // la burbuja vuelve si la página se desplazó al cargar

  // Burbuja → ventana (en celular, panel inferior)
  await page.getByRole("button", { name: /Pregúntale a Mirai/ }).click()
  const chat = page.getByRole("dialog", { name: "Chat con Mirai" })
  await expect(chat).toBeVisible()
  await chat.getByRole("button", { name: "Nueva conversación" }).click()
  const cards = chat.getByTestId("sugerencia")
  await expect(cards).toHaveCount(4, { timeout: 30_000 })
  await expect(chat.getByText(/Buenos días|Buenas tardes|Buenas noches/)).toBeVisible()
  await shotTo(page, "chat-burbuja", info.project.name)

  // "Otras ideas" baraja las sugerencias
  const before = (await cards.allInnerTexts()).join("|")
  let changed = false
  for (let i = 0; i < 4 && !changed; i++) {
    await chat.getByRole("button", { name: "Otras ideas" }).click()
    await page.waitForTimeout(250)
    changed = (await cards.allInnerTexts()).join("|") !== before
  }
  expect(changed).toBe(true)
  await expect(cards).toHaveCount(4)

  // Pregunta que responde Mirai con los datos del libro (sin IA)
  const box = chat.getByRole("textbox", { name: "Escribe tu pregunta" })
  await box.fill("¿Cuánto gasté este mes?")
  await box.press("Enter")
  await expect(chat.getByText(/Este mes llevas/).first()).toBeVisible({ timeout: 30_000 })
  await expect(chat.getByText("Calculado con tus datos").first()).toBeVisible()
  await expect(chat.getByRole("button", { name: "Copiar" }).first()).toBeVisible()
  await expect(chat.getByRole("button", { name: "Buena respuesta" })).toBeVisible()
  await chat.getByRole("button", { name: "Buena respuesta" }).click()
  await expect(chat.getByRole("button", { name: "Buena respuesta" })).toHaveAttribute("aria-pressed", "true")
  await expect(chat.getByLabel("Preguntas sugeridas").getByRole("button").first()).toBeVisible()
  await shotTo(page, "chat-respuesta", info.project.name)

  // Pantalla completa: misma conversación en /consejero, sin burbuja
  await chat.getByRole("button", { name: "Abrir en pantalla completa" }).click()
  await page.waitForURL(/\/consejero\?c=[0-9a-f-]{36}/, { timeout: 30_000 })
  await expect(page.getByRole("heading", { name: "Consejero", level: 1 })).toBeVisible()
  const log = page.getByRole("log", { name: "Conversación con Mirai" })
  await expect(log.getByText(/Este mes llevas/).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole("button", { name: /Pregúntale a Mirai/ })).toHaveCount(0)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  await shotTo(page, "consejero-chat", info.project.name)

  // Historial: renombrar desde el menú ⋯ (en línea: Enter guarda)
  const name = `Chat QA ${info.project.name} ${Date.now() % 100000}`
  let list = await history(page, mobile)
  await expect(list.getByText("Hoy", { exact: true })).toBeVisible()
  await list.getByRole("button", { name: "Opciones de Cuánto gasté este mes" }).first().click()
  await page.getByRole("menuitem", { name: "Renombrar" }).click()
  const input = page.getByRole("textbox", { name: "Nuevo nombre de la conversación" })
  await input.fill(name)
  await input.press("Enter")
  await expect(page.getByText("Conversación renombrada").first()).toBeVisible()
  const row = list.getByRole("button", { name, exact: true })
  await expect(row).toBeVisible()
  if (!mobile) await expect(page.getByRole("main").getByText(name).first()).toBeVisible()
  const closeToasts = async () => { for (const b of await page.getByRole("region", { name: /Notifications/ }).getByRole("button", { name: "Cerrar" }).all()) await b.click({ timeout: 1500 }).catch(() => {}) }

  // Fijar: pasa al grupo "Fijadas"
  await list.getByRole("button", { name: `Opciones de ${name}` }).click()
  await page.getByRole("menuitem", { name: "Fijar arriba" }).click()
  await expect(list.getByRole("group", { name: "Fijadas" }).getByRole("button", { name, exact: true })).toBeVisible()
  await shotTo(page, "consejero-historial", info.project.name)
  await closeToasts()

  // Archivar (en escritorio con clic derecho) → vista Archivadas → Desarchivar
  if (mobile) { await list.getByRole("button", { name: `Opciones de ${name}` }).click({ timeout: 10_000 }) }
  else await row.click({ button: "right", timeout: 10_000 })
  await page.getByRole("menuitem", { name: "Archivar" }).click({ timeout: 10_000 })
  await expect(page.getByText("Conversación archivada").first()).toBeVisible()
  await expect(list.getByRole("button", { name, exact: true })).toHaveCount(0)
  await list.getByRole("button", { name: /^Archivadas/ }).click()
  await expect(list.getByRole("button", { name, exact: true })).toBeVisible()
  await shotTo(page, "consejero-archivadas", info.project.name)
  await list.getByRole("button", { name: `Opciones de ${name}` }).click()
  await page.getByRole("menuitem", { name: "Desarchivar" }).click()
  await expect(page.getByText("Conversación desarchivada").first()).toBeVisible()
  await list.getByRole("button", { name: "Volver a tus conversaciones" }).click()
  await expect(list.getByRole("button", { name, exact: true })).toBeVisible()
  await closeToasts()

  // Eliminar: confirmación y luego Deshacer
  await list.getByRole("button", { name: `Opciones de ${name}` }).click()
  await page.getByRole("menuitem", { name: "Eliminar" }).click()
  const confirm = page.getByRole("alertdialog", { name: "¿Eliminar esta conversación?" })
  await expect(confirm).toBeVisible()
  await shotTo(page, "consejero-eliminar", info.project.name)
  await confirm.getByRole("button", { name: "Eliminar" }).click()
  await expect(page.getByText("Conversación eliminada").first()).toBeVisible()
  await expect(list.getByRole("button", { name, exact: true })).toHaveCount(0)
  if (mobile) await page.keyboard.press("Escape")
  await page.getByRole("status").filter({ hasText: "Conversación eliminada" }).getByRole("button", { name: "Deshacer" }).click()
  await expect(page.getByText("Listo, la recuperamos").first()).toBeVisible()
  // En celular los avisos salen arriba y tapan el botón Historial: se cierran.
  if (mobile) await closeToasts()
  list = await history(page, mobile)
  await expect(list.getByRole("button", { name, exact: true })).toBeVisible({ timeout: 15_000 })

  // Buscar en el historial
  await list.getByRole("textbox", { name: "Buscar en tus conversaciones" }).fill("zzzz no existe")
  await expect(list.getByText("No encontramos conversaciones con esa búsqueda.")).toBeVisible()
  await list.getByRole("textbox", { name: "Buscar en tus conversaciones" }).fill(name.slice(0, 12))
  await expect(list.getByRole("button", { name, exact: true })).toBeVisible()
  expect(errs, errs.join("\n")).toEqual([])
})

test("chat plan gratis: respuestas con tus datos, registrar un gasto con confirmación e invitación a Premium", async ({ page }, info) => {
  test.setTimeout(150_000)
  const errs = watchErrors(page)
  await login(page, "gratis")
  // La ventana de anuncio al entrar (plan gratis) ya se vio en esta sesión: no tapa el chat.
  await page.evaluate(() => { sessionStorage.setItem("mirai-ad-modal", "1") })
  // Datos de ejemplo (ingresos, gastos, deudas) para que el análisis tenga números.
  await page.goto("/puesta")
  await page.getByRole("button", { name: "Ver un ejemplo" }).click()
  await expect(page.getByText("Datos de ejemplo cargados")).toBeVisible({ timeout: 60_000 })
  await page.waitForURL(/inicio/)
  await page.goto("/consejero")
  await expect(page.getByText("Inteligencia artificial es parte de Mirai Premium")).toBeVisible({ timeout: 30_000 })
  await page.getByRole("button", { name: "Nueva conversación" }).first().click()
  await expect(page.getByTestId("sugerencia")).toHaveCount(4, { timeout: 30_000 })
  const box = page.getByRole("textbox", { name: "Escribe tu pregunta" })
  const log = page.getByRole("log", { name: "Conversación con Mirai" })

  // Registrar con una frase → tarjeta → Confirmar
  await box.fill("Registra un gasto de 15 mil en almuerzo")
  await box.press("Enter")
  const card = log.getByTestId("confirm-card").last()
  await expect(card.getByText("¿Registro este gasto?")).toBeVisible({ timeout: 30_000 })
  await expect(card.getByText("Almuerzo")).toBeVisible()
  await card.getByRole("button", { name: "Confirmar" }).click()
  await expect(page.getByText("Gasto registrado").first()).toBeVisible({ timeout: 20_000 })
  await expect(card.getByText("Guardado en tu libro")).toBeVisible()

  // Decisión sin formulario: respuesta en palabras + tarjeta dinámica (gasto mensual), sin IA
  await box.fill("Quiero darle a mi mujer para sus cosas 100 mil al mes")
  await box.press("Enter")
  const dc = log.getByTestId("decision-card").last()
  await expect(dc).toBeVisible({ timeout: 30_000 })
  await expect(log.getByText(/darle a tu mujer para sus cosas/i).last()).toBeVisible()
  await expect(dc.getByText("Equivale cada mes a")).toBeVisible()
  await expect(dc.getByText("En un año suma")).toBeVisible()
  await expect(dc.getByText(/disponible/i)).toHaveCount(0)
  await expect(dc.getByText("Qué te recomiendo")).toBeVisible()
  await dc.getByRole("button", { name: /¿Qué significa\? En un año suma/ }).click()
  await expect(page.getByText(/por 12 meses/)).toBeVisible()
  await page.keyboard.press("Escape")
  // La tarjeta puede volver a dibujarse al terminar de llegar la respuesta: si se suelta, captura la página.
  await dc.screenshot({ path: `tests/.out/consejero-tarjeta-${info.project.name}.png` }).catch(() => shotTo(page, "consejero-tarjeta", info.project.name))
  await dc.getByRole("button", { name: "Ver detalle financiero" }).click()
  await expect(dc.getByText("Deudas / ingreso (DTI)").first()).toBeVisible()
  expect(await dc.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(4)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)

  // Algo que necesita IA → invitación amable
  await box.fill("Explícame qué es la UVT")
  await box.press("Enter")
  await expect(log.getByText(/es parte de Mirai Premium/).last()).toBeVisible({ timeout: 30_000 })
  await expect(log.getByRole("link", { name: "Conoce Premium" }).last()).toBeVisible()
  await shotTo(page, "consejero-gratis", info.project.name)
  expect(errs, errs.join("\n")).toEqual([])
})

test("chat en todos los módulos (sin IA): préstamo en Me deben y cuota del carro con confirmación", async ({ page }, info) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  await login(page, "gratis")
  await page.evaluate(() => { sessionStorage.setItem("mirai-ad-modal", "1") })
  // Libro de ejemplo (familia Navarro): tiene el "Crédito de vehículo" en Le debo.
  await page.goto("/puesta")
  await page.getByRole("button", { name: "Ver un ejemplo" }).click()
  await expect(page.getByText("Datos de ejemplo cargados")).toBeVisible({ timeout: 60_000 })
  await page.waitForURL(/inicio/)
  await page.goto("/consejero")
  await page.getByRole("button", { name: "Nueva conversación" }).first().click()
  const box = page.getByRole("textbox", { name: "Escribe tu pregunta" })
  const log = page.getByRole("log", { name: "Conversación con Mirai" })
  // Sin números: el chat reconoce nombres de personas (con apellido distinto en cada corrida).
  const juan = `Juan ${info.project.name.includes("movil") ? "Móvil" : "Escritorio"} ${["Pérez", "Gómez", "Ruiz", "Díaz", "Rojas", "Castro"][Date.now() % 6]}`

  // "Le presté 200 mil a Juan a 3 meses" → tarjeta → Confirmar → aparece en Me deben
  await box.fill(`Le presté 200 mil a ${juan} a 3 meses`)
  await box.press("Enter")
  const card = log.locator('[data-testid="confirm-card"][data-tipo="prestamo"]').last()
  await expect(card.getByText("¿Registro este préstamo?")).toBeVisible({ timeout: 30_000 })
  await expect(card.getByText(juan)).toBeVisible()
  await expect(card.getByText(/3 cuotas mensuales/)).toBeVisible()
  await shotTo(page, "chat-prestamo", info.project.name)
  await card.getByRole("button", { name: "Confirmar" }).click()
  await expect(page.getByText("Préstamo registrado").first()).toBeVisible({ timeout: 20_000 })
  await expect(card.getByText("Guardado en tu libro")).toBeVisible()
  await expect(card.getByRole("link", { name: /Ver en Me deben/ })).toBeVisible()

  // "Pagué la cuota del carro" → la cuota del Crédito de vehículo (sinónimos) → Confirmar
  await box.fill("Pagué la cuota del carro")
  await box.press("Enter")
  const cuota = log.locator('[data-testid="confirm-card"][data-tipo="pago_cuota"]').last()
  await expect(cuota.getByText("¿Registro este pago?")).toBeVisible({ timeout: 30_000 })
  await expect(cuota.getByText(/Crédito de vehículo/)).toBeVisible()
  await expect(cuota.getByText("Queda debiendo")).toBeVisible()
  await cuota.getByRole("button", { name: "Confirmar" }).click()
  await expect(page.getByText("Pago registrado").first()).toBeVisible({ timeout: 20_000 })
  await expect(cuota.getByText("Guardado en tu libro")).toBeVisible()
  await shotTo(page, "chat-cuota", info.project.name)

  // El préstamo quedó en Me deben
  await page.goto("/me-deben")
  await expect(page.getByText(juan).first()).toBeVisible({ timeout: 30_000 })
  expect(errs, errs.join("\n")).toEqual([])
})

test("chat con el rol Registra sus gastos: confirma su gasto pero no un préstamo", async ({ page }, info) => {
  test.setTimeout(150_000)
  const errs = watchErrors(page)
  const sb = admin()
  const email = `qa+registra-${info.project.name}@mirai.test`
  const password = `Qa-${Date.now()}-r!`
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const old = users.users.find((u) => u.email === email)
  if (old) await sb.auth.admin.deleteUser(old.id)
  const qa = users.users.find((u) => u.email === QA.email)!
  const { data: hh } = await sb.from("household_members").select("household_id").eq("user_id", qa.id).limit(1).single()
  const { data: u, error } = await sb.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nombre: "Hijo Prueba", acepta_version: LEGAL_VERSION } })
  if (error) throw error
  await sb.from("household_members").insert({ household_id: hh!.household_id, user_id: u.user.id, role: "viewer", access_role: "registra" })
  await sb.from("user_preferences").upsert({ user_id: u.user.id, extra: { welcome_seen: new Date().toISOString() } })
  await setQaPlan("gratis") // sin IA: la categoría sale de las reglas y no se gastan créditos
  try {
    await page.goto("/login")
    await page.getByLabel("Correo").fill(email)
    await page.getByLabel("Contraseña", { exact: true }).fill(password)
    await page.getByRole("button", { name: "Entrar" }).click()
    await page.waitForURL(/inicio|puesta|consejero/, { timeout: 30_000 })
    await page.evaluate(() => { sessionStorage.setItem("mirai-ad-modal", "1") })
    await page.goto("/consejero")
    await page.getByRole("button", { name: "Nueva conversación" }).first().click()
    const box = page.getByRole("textbox", { name: "Escribe tu pregunta" })
    const log = page.getByRole("log", { name: "Conversación con Mirai" })

    await box.fill("Registra un gasto de 15 mil en almuerzo")
    await box.press("Enter")
    const card = log.locator('[data-testid="confirm-card"][data-tipo="gasto"]').last()
    await expect(card.getByText("¿Registro este gasto?")).toBeVisible({ timeout: 30_000 })
    await card.getByRole("button", { name: "Confirmar" }).click()
    await expect(page.getByText("Gasto registrado").first()).toBeVisible({ timeout: 20_000 })
    await expect(card.getByText("Guardado en tu libro")).toBeVisible()

    await box.fill("Le presté 200 mil a Juan a 3 meses")
    await box.press("Enter")
    await expect(log.getByText(/Registra sus gastos/).last()).toBeVisible({ timeout: 30_000 })
    await expect(log.locator('[data-testid="confirm-card"][data-tipo="prestamo"]')).toHaveCount(0)
    await shotTo(page, "chat-registra", info.project.name)
    expect(errs, errs.join("\n")).toEqual([])
  } finally {
    await sb.auth.admin.deleteUser(u.user.id).catch(() => {})
  }
})

test("chat con IA real: respuesta en streaming y detener", async ({ page }, info) => {
  test.skip(!process.env.E2E_AI, "Solo con E2E_AI=1: llama al proveedor de IA configurado")
  test.setTimeout(150_000)
  await login(page)
  await page.goto("/consejero")
  await page.getByRole("button", { name: "Nueva conversación" }).click()
  const box = page.getByRole("textbox", { name: "Escribe tu pregunta" })
  await box.fill("Explícame la regla 50/30/20 con mis números en una tabla")
  await box.press("Enter")
  await expect(page.getByRole("button", { name: "Detener respuesta" })).toBeVisible()
  await expect(page.getByRole("log").locator("table, li").first()).toBeVisible({ timeout: 90_000 })
  await expect(page.getByRole("button", { name: "Enviar" })).toBeVisible({ timeout: 90_000 })
  await shotTo(page, "consejero-ia", info.project.name)
})

test("las páginas cargan con el chat montado (y el chat abre en ellas)", async ({ page }) => {
  test.setTimeout(120_000)
  const errs = watchErrors(page)
  await login(page)
  for (const r of ["/fijos", "/gastos"]) {
    await page.goto(r)
    await expect(page.locator("#main h1").first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText("Algo salió mal")).toHaveCount(0)
    await page.waitForTimeout(1800)
    await page.getByRole("button", { name: /Pregúntale a Mirai/ }).click()
    const chat = page.getByRole("dialog", { name: "Chat con Mirai" })
    await expect(chat.getByRole("textbox", { name: "Escribe tu pregunta" })).toBeVisible()
    await chat.getByRole("button", { name: "Cerrar chat" }).click()
    await expect(page.getByText("Algo salió mal")).toHaveCount(0)
  }
  expect(errs, errs.join("\n")).toEqual([])
})

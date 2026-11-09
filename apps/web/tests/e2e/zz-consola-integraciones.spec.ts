// Consola › Integraciones globales: que el panel quede dividido por quién configura cada integración, que cada
// tarjeta diga qué es, para qué sirve y cuánto cuesta. Antes la tarjeta solo mostraba el nombre y el estado.
import { expect, test, type Page } from "@playwright/test"
import { login, shot, waitForAdmin, watchErrors } from "./helpers"
import { QA, admin } from "./qa"

/** La tarjeta de una integración por su título (el nombre también aparece en la descripción de su categoría). */
const tarjeta = (dentro: ReturnType<Page["getByRole"]>, n: string) => dentro.locator("p.font-semibold", { hasText: n })

async function qaId() {
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 })
  return data.users.find((u) => u.email === QA.email)!.id
}

// Las demás pruebas usan QA sin consola: al terminar se deja como estaba.
test.afterAll(async () => {
  await admin().from("platform_admins").delete().eq("user_id", await qaId())
})

test("consola › integraciones: dos bloques, costo y para qué sirve", async ({ page }, info) => {
  test.setTimeout(180_000)
  const errs = watchErrors(page)
  await admin().from("platform_admins").upsert({ user_id: await qaId() })
  await login(page)
  await waitForAdmin(page)
  await page.goto("/admin/integraciones")

  // ── Los dos bloques, con su conteo. 30 integraciones en total: 24 del sistema y 6 que el hogar puede poner.
  const sistema = page.getByRole("region", { name: "Del sistema" })
  const hogar = page.getByRole("region", { name: "Del hogar" })
  await expect(sistema.getByRole("heading", { name: /Del sistema/ })).toBeVisible({ timeout: 30_000 })
  await expect(sistema.getByText("24 integraciones")).toBeVisible()
  await expect(hogar.getByText("6 integraciones")).toBeVisible()

  // Cada bloque explica a quién le aplica, que es lo que antes había que adivinar leyendo el recuadro de arriba.
  await expect(sistema.getByText(/aplican a toda la plataforma/)).toBeVisible()
  await expect(hogar.getByText(/Tú decides cómo recibe la de Mirai/)).toBeVisible()

  // ── Cada integración cae en el bloque que le toca.
  await expect(tarjeta(sistema, "TRM del día")).toBeVisible() // datos financieros: solo el administrador
  await expect(tarjeta(sistema, "Google Vertex AI")).toBeVisible() // IA de la plataforma: también del administrador
  await expect(tarjeta(hogar, "Google Gemini")).toBeVisible() // IA con clave del hogar
  await expect(tarjeta(hogar, "TRM del día")).toHaveCount(0)

  // ── Las categorías siguen adentro de cada bloque.
  await expect(sistema.getByRole("heading", { name: "Datos financieros" })).toBeVisible()
  await expect(sistema.getByRole("heading", { name: "Avisos" })).toBeVisible()

  // ── Qué es + para qué sirve en las 30, y el badge de costo.
  await expect(page.getByText("Para qué sirve:")).toHaveCount(30)
  await expect(page.getByText("Convierte a pesos tus cuentas, gastos, fijos y suscripciones en dólares", { exact: false })).toBeVisible()
  // Gratis (TRM, festivos…), Plan gratis (Gemini, CoinGecko…) y De pago (WhatsApp, Bedrock…): las tres aparecen.
  for (const costo of ["Gratis", "Plan gratis", "De pago"]) {
    await expect(page.getByText(costo, { exact: true }).first()).toBeVisible()
  }

  // La búsqueda mira también las descripciones: "dólares" solo aparece en los textos de la TRM y el cambio de monedas
  // (ninguno de los dos lo lleva en el nombre, así que antes esta búsqueda no encontraba nada).
  await page.getByPlaceholder("Buscar integración").fill("dólares")
  await expect(page.getByText("Para qué sirve:")).toHaveCount(2)
  await expect(tarjeta(sistema, "TRM del día")).toBeVisible()
  await expect(tarjeta(sistema, "Cambio de monedas")).toBeVisible()
  await page.getByPlaceholder("Buscar integración").fill("")
  await expect(page.getByText("Para qué sirve:")).toHaveCount(30)

  await shot(page, "consola-integraciones-bloques", info.project.name)
  expect(errs).toEqual([])
})

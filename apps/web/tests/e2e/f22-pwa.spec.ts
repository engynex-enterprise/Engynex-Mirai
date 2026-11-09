import { expect, test, type Page } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"

// Mirai como app instalada (docs/PWA.md): manifest, accesos directos, service worker, sin conexión, compartir y enlaces.

type Manifest = {
  id: string; start_url: string; display: string; icons: { src: string; sizes: string; purpose?: string }[]
  shortcuts: { name: string; url: string; icons: { src: string }[] }[]; screenshots: { src: string; form_factor: string }[]
  share_target: { action: string; method: string }
}

test("manifest válido, público y con sus imágenes", async ({ request }) => {
  const r = await request.get("/manifest.webmanifest")
  expect(r.status()).toBe(200)
  const m = (await r.json()) as Manifest
  expect(m.id).toBe("/inicio")
  expect(m.display).toBe("standalone")
  expect(m.start_url).toContain("/inicio")
  expect(m.shortcuts.length).toBeGreaterThanOrEqual(5)
  expect(m.screenshots.some((s) => s.form_factor === "wide") && m.screenshots.some((s) => s.form_factor === "narrow")).toBe(true)
  // Íconos, accesos directos y capturas cargan sin entrar (no quedan detrás del login).
  const srcs = [...m.icons.map((i) => i.src), ...m.shortcuts.flatMap((s) => s.icons.map((i) => i.src)), ...m.screenshots.map((s) => s.src), "/pwa/apple-touch-icon.png"]
  for (const src of srcs) {
    const res = await request.get(src, { maxRedirects: 0 })
    expect(res.status(), src).toBe(200)
    expect(res.headers()["content-type"], src).toContain("image/png")
  }
})

test("service worker y página offline sin entrar, con cabeceras correctas", async ({ request }) => {
  const sw = await request.get("/sw.js", { maxRedirects: 0 })
  expect(sw.status()).toBe(200)
  expect(sw.headers()["content-type"]).toContain("javascript")
  expect(sw.headers()["cache-control"]).toContain("no-cache")
  expect(sw.headers()["service-worker-allowed"]).toBe("/")
  const off = await request.get("/offline.html", { maxRedirects: 0 })
  expect(off.status()).toBe(200)
  expect(await off.text()).toContain("Estás sin conexión")
})

test("compartir sin service worker y enlaces web+mirai llevan al formulario", async ({ request }) => {
  const r = await request.post("/compartir", { multipart: { title: "Mercado D1", text: "Total $86.400" }, maxRedirects: 0 })
  expect(r.status()).toBe(303)
  expect(r.headers().location).toMatch(/\/gastos\?nuevo=1&compartido=texto&desc=Mercado\+D1&valor=86400$/)
  const a = await request.get(`/abrir?u=${encodeURIComponent("web+mirai://prestamo")}`, { maxRedirects: 0 })
  expect(a.status()).toBe(303)
  expect(a.headers().location).toMatch(/\/me-deben\?nuevo=1$/)
  const bad = await request.get(`/abrir?u=${encodeURIComponent("https://malo.com")}`, { maxRedirects: 0 })
  expect(bad.headers().location).toMatch(/\/inicio$/)
})

test("cada acceso directo abre su formulario", async ({ page, request }, info) => {
  const errs = watchErrors(page)
  const m = (await (await request.get("/manifest.webmanifest")).json()) as Manifest
  await login(page)
  const expected: Record<string, RegExp> = {
    "/gastos?nuevo=1": /Registrar gasto/,
    "/ingresos?nuevo=1": /Agregar ingreso/,
    "/le-debo?nuevo=1": /deuda/i,
    "/me-deben?nuevo=1": /préstamo|me deben|prestaste/i,
    "/calendario?nuevo=1": /Nueva fecha importante/,
  }
  for (const s of m.shortcuts.filter((x) => expected[x.url])) {
    await page.goto(s.url)
    const dlg = page.getByRole("dialog")
    await expect(dlg, s.name).toBeVisible({ timeout: 20_000 })
    await expect(dlg.getByRole("heading").first(), s.name).toHaveText(expected[s.url]!)
    if (s.url.startsWith("/gastos")) await shot(page, "pwa-atajo-gasto", info.project.name)
    await page.keyboard.press("Escape")
  }
  // Abrir con la marca de la app instalada: la marca se quita de la dirección.
  await page.goto("/inicio?source=pwa")
  await expect(page).toHaveURL(/\/inicio$/)
  expect(errs).toEqual([])
})

test("texto compartido llega al formulario de gasto", async ({ page }) => {
  await login(page)
  await page.goto("/gastos?nuevo=1&compartido=texto&desc=Taxi%20al%20aeropuerto&valor=38000")
  const dlg = page.getByRole("dialog")
  await expect(dlg.getByRole("textbox", { name: /En qué gastaste/ })).toHaveValue("Taxi al aeropuerto")
  await expect(page).not.toHaveURL(/compartido=/)
})

test("service worker registrado y página sin conexión", async ({ page, context }, info) => {
  await login(page)
  await page.goto("/inicio")
  // En producción (next start) Mirai registra /sw.js para todo el sitio.
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
  expect(scope).toMatch(/\/$/)
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  // Sin internet: la navegación muestra la página offline de Mirai (no la del navegador).
  await context.setOffline(true)
  await page.goto("/balance").catch(() => {})
  await expect(page.getByRole("heading", { name: "Estás sin conexión" })).toBeVisible()
  await shot(page, "pwa-offline", info.project.name)
  await context.setOffline(false)
  // Vuelve sola al recuperar la conexión.
  await expect(page.getByRole("heading", { name: "Estás sin conexión" })).toBeHidden({ timeout: 20_000 })
})

test("Ajustes › Mirai como app y entrada en el menú de perfil", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/ajustes?tab=app")
  await expect(page.getByRole("heading", { name: "Instalar Mirai" })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Accesos directos" })).toBeVisible()
  await expect(page.getByText("Registrar gasto", { exact: true })).toBeVisible()
  await shot(page, "pwa-ajustes", info.project.name)
  // Ver cómo instalar abre las instrucciones (Playwright no instala de verdad).
  const btn = page.getByRole("button", { name: /Instalar Mirai|Ver cómo instalar/ })
  if (await btn.isVisible()) {
    await btn.click()
    const dlg = page.getByRole("dialog", { name: "Instalar Mirai" })
    if (await dlg.isVisible().catch(() => false)) { await expect(dlg).toContainText("Mirai"); await page.keyboard.press("Escape") }
  }
  expect(errs).toEqual([])
})

/** Avisa que este navegador puede instalar la app (Chromium de las pruebas no manda `beforeinstallprompt` solo). */
async function ofrecerInstalar(page: Page) {
  await page.evaluate(() => {
    const w = window as Window & { __instalarPedido?: boolean }
    w.__instalarPedido = false
    const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
    e.prompt = async () => { w.__instalarPedido = true }
    e.userChoice = Promise.resolve({ outcome: "dismissed" })
    dispatchEvent(e)
  })
}

const limpiarInstalar = (page: Page) => page.evaluate(() => { sessionStorage.removeItem("mirai-instalar-sesion"); localStorage.removeItem("mirai-instalar-descartado") })

test("el modal de instalar sale al entrar: instalar después y no ver más este mensaje", async ({ page }, info) => {
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/inicio")
  await limpiarInstalar(page)
  const dlg = page.getByTestId("instalar-modal")
  // El aviso del navegador puede llegar antes de que la app monte su escucha: se reintenta.
  await expect(async () => { await ofrecerInstalar(page); await expect(dlg).toBeVisible({ timeout: 5_000 }) }).toPass({ timeout: 30_000 })
  await expect(dlg.getByRole("heading")).toContainText("Instala Mirai")
  await shot(page, "pwa-instalar-modal", info.project.name)

  // Instalar después: se cierra y no vuelve a salir hasta la próxima vez que entre.
  await dlg.getByRole("button", { name: "Instalar después" }).click()
  await expect(dlg).toBeHidden()
  await page.reload()
  await expect(page.getByRole("button", { name: "Cómo funciona" })).toBeVisible({ timeout: 30_000 })
  await ofrecerInstalar(page)
  await expect(dlg).toBeHidden({ timeout: 8_000 })

  // Al entrar de nuevo (sesión nueva) vuelve a salir; con "No ver más este mensaje" queda apagado en este navegador.
  await page.evaluate(() => sessionStorage.removeItem("mirai-instalar-sesion"))
  await page.reload()
  await expect(async () => { await ofrecerInstalar(page); await expect(dlg).toBeVisible({ timeout: 5_000 }) }).toPass({ timeout: 30_000 })
  await dlg.getByRole("button", { name: "No ver más este mensaje" }).click()
  await expect(dlg).toBeHidden()
  expect(await page.evaluate(() => !!localStorage.getItem("mirai-instalar-descartado"))).toBe(true)
  await page.evaluate(() => sessionStorage.removeItem("mirai-instalar-sesion"))
  await page.reload()
  await expect(page.getByRole("button", { name: "Cómo funciona" })).toBeVisible({ timeout: 30_000 })
  await ofrecerInstalar(page)
  await expect(dlg).toBeHidden({ timeout: 8_000 })

  // Instalar ahora: le pide al navegador su diálogo de instalación.
  await limpiarInstalar(page)
  await page.reload()
  await expect(async () => { await ofrecerInstalar(page); await expect(dlg).toBeVisible({ timeout: 5_000 }) }).toPass({ timeout: 30_000 })
  await dlg.getByRole("button", { name: "Instalar ahora" }).click()
  await expect(dlg).toBeHidden()
  await expect.poll(() => page.evaluate(() => (window as Window & { __instalarPedido?: boolean }).__instalarPedido)).toBe(true)
  await limpiarInstalar(page)
  expect(errs).toEqual([])
})

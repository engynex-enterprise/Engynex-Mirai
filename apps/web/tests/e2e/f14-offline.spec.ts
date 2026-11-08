import { expect, test, type Page } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { QA, admin } from "./qa"

// Mirai sin conexión: la sección que ya se abrió se vuelve a abrir sin internet con sus datos (service worker + datos
// guardados en el dispositivo), un cambio hecho sin conexión queda en la cola y se envía solo al volver el internet, y
// una sección que no se ha guardado muestra la página "Sin conexión" con las que sí se pueden abrir.
async function qaBook() {
  const sb = admin()
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const uid = data.users.find((u) => u.email === QA.email)!.id
  const { data: hh } = await sb.from("household_members").select("household_id").eq("user_id", uid).limit(1).single()
  const { data: books } = await sb.from("books").select("id").eq("household_id", hh!.household_id).is("deleted_at", null).order("is_default", { ascending: false }).order("created_at")
  const { data: prof } = await sb.from("profiles").select("last_book_id").eq("id", uid).maybeSingle()
  return { sb, bookId: (books?.find((b) => b.id === prof?.last_book_id) ?? books?.[0])!.id }
}

const swListo = (page: Page) => expect.poll(() => page.evaluate(() => !!navigator.serviceWorker?.controller), { timeout: 30_000 }).toBe(true)
/** Espera a que la app guarde los datos en el dispositivo (IndexedDB "mirai-offline" › kv › persist-at). */
const datosGuardados = (page: Page) => expect.poll(() => page.evaluate(() => new Promise<boolean>((res) => {
  const r = indexedDB.open("mirai-offline")
  r.onsuccess = () => {
    const db = r.result
    if (!db.objectStoreNames.contains("kv")) { db.close(); return res(false) }
    const g = db.transaction("kv").objectStore("kv").get("persist-at")
    g.onsuccess = () => { db.close(); res(!!g.result) }
    g.onerror = () => { db.close(); res(false) }
  }
  r.onerror = () => res(false)
})), { timeout: 20_000 }).toBe(true)

test("sin conexión: abrir lo guardado, registrar en la cola y enviar al volver el internet", async ({ page, context }, info) => {
  test.setTimeout(150_000)
  const errs = watchErrors(page)
  await login(page)
  const { sb, bookId } = await qaBook()
  const kw = `qaoffline${Date.now() % 100000}`
  try {
    // Con internet: se abre la sección (queda guardada) y se espera a que los datos queden en el dispositivo.
    await page.goto("/ajustes?tab=reglas")
    await swListo(page)
    await page.reload()
    await expect(page.getByPlaceholder(/Si contiene/)).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(3500)
    await datosGuardados(page)

    // Sin internet: la misma sección abre desde el dispositivo, con la franja "Sin conexión".
    await context.setOffline(true)
    await page.reload()
    await expect(page.getByText(/Sin conexión · ves lo último guardado/)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByPlaceholder(/Si contiene/)).toBeVisible()

    // Un cambio sin conexión: queda en la cola del dispositivo.
    await page.getByPlaceholder(/Si contiene/).fill(kw)
    await page.getByRole("combobox", { name: "Categoría de la regla" }).click()
    await page.getByRole("option", { name: /^Mercado/ }).first().click()
    await page.locator("#main").getByRole("button", { name: "Agregar", exact: true }).click()
    await expect(page.getByText("Guardado en este dispositivo").first()).toBeVisible()
    await expect(page.getByText(/1 por enviar/)).toBeVisible()
    await shot(page, "f14-offline", info.project.name)

    // Una sección que no se ha abierto: la página "Sin conexión" ofrece las guardadas.
    await page.goto("/retos").catch(() => undefined)
    await expect(page.getByRole("heading", { name: "Estás sin conexión" })).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Secciones guardadas" })).toBeVisible()
    await page.goBack().catch(() => undefined)

    // Vuelve el internet: el cambio se envía solo y queda en la base.
    await context.setOffline(false)
    await expect.poll(async () => (await sb.from("keyword_rules").select("id").eq("book_id", bookId).eq("keyword", kw).is("deleted_at", null)).data?.length ?? 0, { timeout: 30_000 }).toBe(1)
  } finally {
    await context.setOffline(false)
    await sb.from("keyword_rules").delete().eq("book_id", bookId).eq("keyword", kw)
  }
  // Sin conexión el navegador registra fallos de red al pedir datos: no son errores de Mirai.
  expect(errs.filter((e) => !/Failed to fetch|NetworkError|ERR_INTERNET_DISCONNECTED|Load failed|conexión/i.test(e)), errs.join("\n")).toEqual([])
})

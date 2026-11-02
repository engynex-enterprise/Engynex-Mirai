import { expect, test } from "@playwright/test"
import { login, watchErrors } from "./helpers"

// Barrido de calidad: con los datos de ejemplo recorre cada sección y cada pestaña de Ajustes buscando errores
// visibles de formato o de lógica (NaN, undefined, fechas inválidas, montos rotos, scroll horizontal, errores de consola).
const RUTAS = ["puesta", "inicio", "consejero", "balance", "balance?tab=q1", "balance?tab=q2", "balance?tab=mes", "ingresos", "gastos", "fijos", "tarjetas", "suscripciones", "proveedores", "correo", "importar",
  "me-deben", "le-debo", "contactos", "estrategia", "presupuesto", "flujo", "metas", "retos", "logros", "primas", "familia", "mesadas", "compartidos",
  "inversiones", "renta", "calendario", "contador", "recordatorios", "indicadores", "reportes", "novedades", "faq", "manual", "perfil",
  ...["general", "apariencia", "privacidad", "seguridad", "hogar", "ia", "integraciones", "alertas", "finanzas", "defs", "cats", "ings", "ents", "medios", "proveedores", "rels", "reglas", "respaldo"].map((t) => `ajustes?tab=${t}`)]

const MALO = [/\bNaN\b/, /\bundefined\b/, /Invalid Date/, /\[object Object\]/, /\$\s*-?\s*NaN/, /Infinity/, /\bnull\b(?! *\))/]

test("barrido de todas las secciones con datos de ejemplo", async ({ page }, info) => {
  test.setTimeout(600_000)
  const errs = watchErrors(page)
  await login(page)
  await page.goto("/puesta")
  await page.getByRole("button", { name: "Ver un ejemplo" }).click()
  await expect(page.getByText("Datos de ejemplo cargados")).toBeVisible({ timeout: 60_000 })
  await page.waitForURL(/inicio/)
  const problemas: string[] = []
  for (const r of RUTAS) {
    const antes = errs.length
    await page.goto(`/${r}`)
    await expect(page.locator("#main h1").first()).toBeVisible({ timeout: 30_000 })
    await page.waitForLoadState("networkidle").catch(() => {})
    await page.waitForTimeout(600)
    const texto = await page.locator("#main").innerText()
    for (const re of MALO) {
      const m = texto.match(re)
      if (m) problemas.push(`${r}: "${texto.slice(Math.max(0, m.index! - 40), m.index! + 40).replace(/\s+/g, " ")}"`)
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (overflow > 1) problemas.push(`${r}: scroll horizontal de ${overflow}px`)
    if (errs.length > antes) problemas.push(`${r}: ${errs.slice(antes).join(" | ").slice(0, 300)}`)
    if (await page.getByText("Algo salió mal").isVisible().catch(() => false)) problemas.push(`${r}: pantalla de error`)
  }
  console.log(`[${info.project.name}] problemas:\n` + (problemas.join("\n") || "ninguno"))
  expect(problemas, problemas.join("\n")).toEqual([])
})

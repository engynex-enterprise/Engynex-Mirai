import { expect, test } from "@playwright/test"
import { API_MODE, login, watchErrors } from "./helpers"

// v6 F2-H-8: confirma en qué modo corre la batería, para que una corrida `api-on` no pase "en verde" sin haber usado
// la API (o una `api-off` la use sin querer). Con E2E_API=on la web debe pedir el libro a la API (snapshot y CRUD) y
// no a Supabase; con E2E_API=off (lo de hoy) ninguna petición sale hacia la API.
const API_URL = process.env.E2E_API_URL ?? "http://localhost:8080"
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""

test("modo de la batería: la fuente de los datos es la esperada", async ({ page }) => {
  const errors = watchErrors(page)
  const api: string[] = []
  const rest: string[] = []
  page.on("request", (r) => {
    const u = r.url()
    if (u.startsWith(API_URL) || /\/v1\/books\//.test(new URL(u).pathname)) api.push(u)
    else if (SUPABASE && u.startsWith(`${SUPABASE}/rest/v1/`)) rest.push(new URL(u).pathname)
  })
  await login(page)
  await page.goto("/")
  await expect(page.getByRole("button", { name: "Cómo funciona" })).toBeVisible({ timeout: 30_000 })
  await page.waitForLoadState("networkidle")

  if (API_MODE === "on") {
    expect(api.some((u) => /\/v1\/books\/[^/]+\/snapshot/.test(u)), "Inicio pidió el libro a la API (snapshot)").toBe(true)
    // Lo que todavía va directo a PostgREST (perfil, ajustes, anuncios, lecturas sin interruptor) queda anotado en el
    // reporte para ir cerrándolo (docs/arquitectura/v6-f2h-encendido.md › Qué falta).
    test.info().annotations.push({ type: "directo a Supabase", description: [...new Set(rest)].sort().join(", ") || "nada" })
  } else {
    expect(api, "api-off: ninguna petición a la API").toEqual([])
  }
  expect(errors).toEqual([])
})

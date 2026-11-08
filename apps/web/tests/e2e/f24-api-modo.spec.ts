import { expect, test } from "@playwright/test"
import { login, watchErrors } from "./helpers"

// La web pide los datos a la API (/v1 en el mismo origen, o E2E_API_URL) y nunca a un PostgREST/Supabase directo: el
// libro de Inicio llega por GET /v1/books/:b/snapshot.
const API_URL = process.env.E2E_API_URL ?? "http://localhost:8080"

test("la fuente de los datos es la API", async ({ page }) => {
  const errors = watchErrors(page)
  const api: string[] = []
  const rest: string[] = []
  page.on("request", (r) => {
    const u = r.url()
    const path = new URL(u).pathname
    if (u.startsWith(API_URL) || /^\/v1\//.test(path)) api.push(u)
    else if (/\/rest\/v1\/|\/auth\/v1\//.test(path)) rest.push(path)
  })
  await login(page)
  await page.goto("/")
  await expect(page.getByRole("button", { name: "Cómo funciona" })).toBeVisible({ timeout: 30_000 })
  await page.waitForLoadState("networkidle")
  expect(api.some((u) => /\/v1\/books\/[^/]+\/snapshot/.test(u)), "Inicio pidió el libro a la API (snapshot)").toBe(true)
  expect([...new Set(rest)], "ninguna petición directa a PostgREST o a Supabase Auth").toEqual([])
  expect(errors).toEqual([])
})

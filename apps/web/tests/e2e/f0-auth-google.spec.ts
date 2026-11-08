import { expect, test } from "@playwright/test"
import { shot } from "./helpers"

// Auth propio (v7): un regreso de Google que no sirve (estado vencido, o el mismo regreso dos veces) vuelve al login de
// Mirai con el aviso en español, no a la página de error en inglés de Better Auth.
test("Google: un regreso inválido vuelve al login con el aviso en español", async ({ page }) => {
  await page.goto("/api/auth/callback/google?state=estado-que-no-existe&code=x")
  await expect(page).toHaveURL(/\/login\?error=google/)
  await expect(page.getByText("No pudimos entrar con Google")).toBeVisible()
  await expect(page.getByText("Something went wrong")).toHaveCount(0)
})

// "Continuar con Google" abre una ventana flotante: la pestaña de Mirai no se va, y si Google falla la ventana se cierra
// y la persona sigue en la pantalla de entrada con el aviso.
test("Google: se abre en una ventana flotante y un error vuelve a la pantalla de entrada", async ({ page, context }, info) => {
  // Google no se visita de verdad: su página se reemplaza por una de prueba.
  await context.route(/accounts\.google\.com/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<title>Google (prueba)</title><p>Google</p>" }))
  await page.goto("/login")
  await expect(page.getByRole("heading", { name: "Hola de nuevo" })).toBeVisible()
  await shot(page, "login", info.project.name)
  const [ventana] = await Promise.all([context.waitForEvent("page"), page.getByRole("button", { name: "Continuar con Google" }).click()])
  await expect(ventana).toHaveURL(/accounts\.google\.com/, { timeout: 15_000 })
  await expect(page).toHaveURL(/\/login/) // la pestaña de Mirai no se movió
  await expect(page.getByRole("button", { name: "Esperando a Google…" })).toBeVisible()
  // Google vuelve con error: la ventana avisa y se cierra; Mirai muestra el aviso y deja intentar de nuevo.
  await ventana.goto("/auth/google?error=google")
  await ventana.waitForEvent("close", { timeout: 10_000 })
  await expect(page.getByText("No pudimos entrar con Google").first()).toBeVisible()
  await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeEnabled()
})

import { expect, test } from "@playwright/test"
import { MIRAI_AUTH } from "./qa"

// Auth propio (v7): un regreso de Google que no sirve (estado vencido, o el mismo regreso dos veces por un doble clic)
// vuelve al login de Mirai con el aviso en español, no a la página de error en inglés de Better Auth.
test("Google: un regreso inválido vuelve al login con el aviso en español", async ({ page }) => {
  test.skip(!MIRAI_AUTH, "Solo con AUTH_PROVIDER=mirai (con Supabase el regreso lo maneja /auth/callback)")
  await page.goto("/api/auth/callback/google?state=estado-que-no-existe&code=x")
  await expect(page).toHaveURL(/\/login\?error=google/)
  await expect(page.getByText("No pudimos entrar con Google")).toBeVisible()
  await expect(page.getByText("Something went wrong")).toHaveCount(0)
})

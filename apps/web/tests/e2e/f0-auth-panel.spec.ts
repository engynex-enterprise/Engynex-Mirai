import { expect, test } from "@playwright/test"
import { shot, watchErrors } from "./helpers"

// Panel izquierdo de las pantallas de acceso (components/auth/auth-aside.tsx): cambia según sea entrar, registrarse o
// recuperar la clave. En celular no se muestra (solo el formulario) y nada se corre en horizontal.
test("acceso: el panel izquierdo se adapta a entrar, registro y recuperar", async ({ page }, info) => {
  test.setTimeout(90_000)
  const errs = watchErrors(page)
  const movil = info.project.name.includes("movil")
  const casos = [
    { ruta: "/login", v: "login", titulo: "Tu plata, justo donde la dejaste." },
    { ruta: "/registro", v: "registro", titulo: "En pocos minutos sabes cuánto te queda cada quincena." },
    { ruta: "/recuperar", v: "recuperar", titulo: "Tranquilo: tu información sigue segura." },
  ]
  for (const c of casos) {
    await page.goto(c.ruta)
    const panel = page.getByTestId("auth-aside")
    if (movil) await expect(panel).toBeHidden({ timeout: 30_000 })
    else {
      await expect(panel).toHaveAttribute("data-variante", c.v, { timeout: 30_000 })
      await expect(panel.getByRole("heading", { name: c.titulo })).toBeVisible()
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    await shot(page, `acceso-${c.v}`, info.project.name)
  }
  if (!movil) {
    // Del login al registro sin recargar: el panel cambia con la página.
    await page.goto("/login")
    await page.getByRole("link", { name: "Crea una gratis" }).click()
    await expect(page.getByTestId("auth-aside")).toHaveAttribute("data-variante", "registro", { timeout: 15_000 })
    await expect(page.getByText("Incluido en el plan gratis")).toBeVisible()
  }
  expect(errs, errs.join("\n")).toEqual([])
})

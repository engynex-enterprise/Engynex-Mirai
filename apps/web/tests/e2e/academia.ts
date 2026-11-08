import { expect, type Page } from "@playwright/test"

/** Recorre una lección abierta en el reproductor de la Academia: portada, ideas, repaso (con la respuesta) y resultado. */
export async function completarLeccion(page: Page, respuesta: string) {
  const sig = page.getByRole("button", { name: /^(Empezar|Siguiente)$/ })
  await expect(page.getByText(/Paso \d+ de \d+/)).toBeVisible({ timeout: 30_000 })
  // Avanza hasta el repaso
  for (let k = 0; k < 10 && !(await page.getByRole("radiogroup", { name: "Respuesta" }).isVisible()); k++) await sig.click()
  await page.getByRole("radio", { name: respuesta }).click()
  await expect(page.getByText(/¡Correcto!/)).toBeVisible()
  await page.getByRole("button", { name: "Terminar lección" }).click()
  await expect(page.getByRole("heading", { name: "¡Lección completada!" })).toBeVisible()
}

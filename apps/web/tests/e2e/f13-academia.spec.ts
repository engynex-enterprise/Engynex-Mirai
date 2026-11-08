import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { QA, admin } from "./qa"

// Academia estilo e-learning: ruta por módulos, reproductor paso a paso (teclado y retomar donde ibas), apuntes que se
// guardan en la cuenta, evaluación del nivel y certificado. El avance de QA se deja como estaba.
test("academia e-learning: reproductor, retomar, apuntes, evaluación y certificado", async ({ page }, info) => {
  test.setTimeout(150_000)
  const errs = watchErrors(page)
  await login(page)
  const sb = admin()
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const uid = data.users.find((u) => u.email === QA.email)!.id
  const extra = async () => ((await sb.from("user_preferences").select("extra").eq("user_id", uid).single()).data?.extra ?? {}) as Record<string, unknown>
  const antes = await extra()
  const limpio = { ...antes, academia: [], academia_log: {}, academia_notas: {}, academia_eval: {} }
  await sb.from("user_preferences").update({ extra: limpio }).eq("user_id", uid)
  try {
    await page.goto("/academia")
    await expect(page.getByRole("heading", { name: "Nivel básico" })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText("Módulo 1")).toBeVisible()
    await expect(page.getByText("Termina las lecciones del nivel para desbloquearla.").first()).toBeVisible()

    // Empezar desde la tarjeta de la ruta: abre el reproductor en la primera lección
    await page.getByRole("button", { name: "Empezar", exact: true }).first().click()
    await expect(page).toHaveURL(/leccion=presupuesto/)
    await expect(page.getByText("Paso 1 de 6")).toBeVisible()
    await expect(page.getByText("Lo que vas a aprender")).toBeVisible()
    await page.keyboard.press("ArrowRight")
    await expect(page.getByText("Idea 1 de 3")).toBeVisible()

    // Apuntes: se guardan en la cuenta
    await page.getByLabel("Mis apuntes").fill("Separar el 20 % apenas llegue el sueldo")
    await page.getByLabel("Mis apuntes").blur()
    await expect.poll(async () => ((await extra()).academia_notas as Record<string, string>)?.presupuesto).toBe("Separar el 20 % apenas llegue el sueldo")
    await shot(page, "f13-academia-leccion", info.project.name)

    // Salir a mitad: la ruta muestra en qué paso quedó y al volver sigue ahí
    await page.getByRole("button", { name: "Academia", exact: true }).click()
    await expect(page.getByText("Paso 2 de 6").first()).toBeVisible()
    await page.getByRole("button", { name: /El presupuesto 50\/30\/20/ }).click()
    await expect(page.getByText("Idea 1 de 3")).toBeVisible()
    await page.getByRole("button", { name: "Academia", exact: true }).click()
    await expect(page).not.toHaveURL(/leccion=/)

    // Con el nivel básico terminado se desbloquea la evaluación
    await sb.from("user_preferences").update({ extra: { ...limpio, academia: ["presupuesto", "emergencia", "hormiga"], academia_log: { presupuesto: "2026-11-08" } } }).eq("user_id", uid)
    await page.goto("/academia")
    await expect(page.getByText("Puntos")).toBeVisible({ timeout: 30_000 })
    await page.getByRole("button", { name: "Hacer la evaluación" }).first().click()
    const dlg = page.getByRole("dialog")
    for (const r of ["$400.000", "Las vacaciones de fin de año", "$3.650.000"]) {
      await dlg.getByRole("radio", { name: r }).click()
      await dlg.getByRole("button", { name: /^(Siguiente|Ver resultado)$/ }).click()
    }
    await expect(dlg.getByText("¡Aprobaste!")).toBeVisible()
    await expect.poll(async () => ((await extra()).academia_eval as Record<string, { pct: number }>)?.basico?.pct).toBe(100)
    await dlg.getByRole("button", { name: "Ver certificado" }).click()
    await expect(page.getByTestId("cert-nombre")).toBeVisible()
    await shot(page, "f13-academia-certificado", info.project.name)
    await page.getByRole("button", { name: "Cerrar", exact: true }).first().click()
    await expect(page.getByText("Aprobada con 100 %.")).toBeVisible()
    await shot(page, "f13-academia", info.project.name)
  } finally {
    await sb.from("user_preferences").update({ extra: antes }).eq("user_id", uid)
  }
  expect(errs, errs.join("\n")).toEqual([])
})

import { expect, test } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { QA, admin } from "./qa"

// Sonido de los avisos (lib/sound.ts): el AudioContext del navegador se reemplaza por uno que cuenta los tonos.
// Ajustes › Alertas › "Sonido de los avisos": Probar suena; una notificación nueva en la campana (tiempo real) suena;
// apagado, no suena.
test("sonido de los avisos: probar, notificación nueva en la campana y apagado", async ({ page }, info) => {
  test.setTimeout(120_000)
  const errs = watchErrors(page)
  await page.addInitScript(() => {
    const w = window as unknown as { __tonos: number; AudioContext: unknown }
    w.__tonos = 0
    class FakeAC {
      currentTime = 0
      destination = {}
      state = "suspended"
      resume() { this.state = "running"; return Promise.resolve() }
      createGain() { return { gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (x: unknown) => x } }
      createOscillator() { return { type: "", frequency: { value: 0 }, connect: (x: unknown) => x, start: () => { w.__tonos++ }, stop() {} } }
    }
    w.AudioContext = FakeAC
  })
  await login(page)
  const tonos = () => page.evaluate(() => (window as unknown as { __tonos: number }).__tonos)
  const sb = admin()
  const { data } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const uid = data.users.find((u) => u.email === QA.email)!.id
  const titulo = `QA sonido ${Date.now() % 100000}`
  try {
    await page.goto("/ajustes?tab=alertas")
    const sw = page.getByRole("switch", { name: "Sonido de los avisos" })
    await expect(sw).toBeVisible({ timeout: 30_000 })
    await expect(sw).toHaveAttribute("aria-checked", "true") // prendido por defecto
    await page.getByRole("button", { name: "Probar", exact: true }).click()
    await expect.poll(tonos).toBeGreaterThan(0)
    await shot(page, "f4-sonido", info.project.name)

    // Notificación nueva por tiempo real → suena la campanita
    const antes = await tonos()
    await page.waitForTimeout(500)
    await sb.from("notifications").insert({ user_id: uid, kind: "sistema", titulo, cuerpo: "Prueba de sonido" }).then(({ error }) => expect(error).toBeNull())
    await expect.poll(tonos, { timeout: 20_000 }).toBeGreaterThan(antes)

    // Apagado: se guarda en el dispositivo y una notificación nueva ya no suena
    await sw.click()
    await expect(sw).toHaveAttribute("aria-checked", "false")
    expect(await page.evaluate(() => localStorage.getItem("mirai-sonido"))).toBe("0")
    const callado = await tonos()
    await sb.from("notifications").insert({ user_id: uid, kind: "sistema", titulo: `${titulo} 2`, cuerpo: "Prueba de sonido" }).then(({ error }) => expect(error).toBeNull())
    await page.waitForTimeout(4000)
    expect(await tonos()).toBe(callado)
    await sw.click()
    await expect(sw).toHaveAttribute("aria-checked", "true")
  } finally {
    await sb.from("notifications").delete().eq("user_id", uid).like("titulo", `${titulo}%`)
  }
  expect(errs).toEqual([])
})

import { expect, test, type Page } from "@playwright/test"
import { login, shot, watchErrors } from "./helpers"
import { admin, QA } from "./qa"

// Tu hogar (Ajustes › Hogar): integrante sin cuenta, invitación por correo sin duplicados, cambio de rol y cancelar.
// Los correos van a @mirai.test (dominio reservado): Mirai no los envía de verdad (isTestEmail) y marca "Correo de prueba".

/** Persona con cuenta agregada directamente al hogar de QA (para probar el cambio de rol). Devuelve su id. */
async function addMember(nombre: string, email: string) {
  const sb = admin()
  const { data: users } = await sb.auth.admin.listUsers({ perPage: 1000 })
  const old = users.users.find((u) => u.email === email)
  if (old) await sb.auth.admin.deleteUser(old.id)
  const qa = users.users.find((u) => u.email === QA.email)!
  const { data: hh } = await sb.from("household_members").select("household_id").eq("user_id", qa.id).limit(1).single()
  const { data: u, error } = await sb.auth.admin.createUser({ email, password: `Qa-${Date.now()}-x!`, email_confirm: true, user_metadata: { nombre } })
  if (error) throw error
  await sb.from("household_members").insert({ household_id: hh!.household_id, user_id: u.user.id, role: "editor", access_role: "editor" })
  return u.user.id
}

const row = (page: Page, nombre: string) => page.locator(`[data-person="${nombre}"]`)
const options = async (page: Page, nombre: string) => {
  const b = page.getByRole("button", { name: `Opciones de ${nombre}` })
  await b.scrollIntoViewIfNeeded()
  await b.click()
}

test("hogar: integrante sin cuenta, invitar sin duplicados, cambiar rol y cancelar", async ({ page }, info) => {
  test.setTimeout(240_000)
  const errs = watchErrors(page)
  const n = `${info.project.name}-${Date.now() % 10000}`
  const hijo = `Tomás ${n}`
  const invitado = `Invitado ${n}`
  const correo = `qa+invitado-${n}@mirai.test`
  const miembro = `Miembro ${n}`
  await login(page)
  const miembroId = await addMember(miembro, `qa+miembro-${info.project.name}@mirai.test`)

  await page.goto("/ajustes?tab=hogar")
  await expect(page.getByRole("heading", { name: "¿Quiénes hacen parte de tu hogar?" })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText("(tú)")).toBeVisible()
  await expect(row(page, miembro).getByText("Es parte del hogar")).toBeVisible()

  // 1) Integrante sin cuenta
  await page.getByRole("button", { name: "Agregar persona" }).click()
  await page.getByRole("radio", { name: "Solo agregarla al hogar" }).click()
  await page.getByRole("button", { name: "Continuar" }).click()
  await page.getByRole("textbox", { name: "Nombre" }).fill(hijo)
  await page.getByRole("button", { name: "Agregar", exact: true }).click()
  await expect(page.getByText(`${hijo} ya hace parte de tu hogar.`)).toBeVisible()
  await expect(row(page, hijo).getByText("No tiene cuenta (solo para registrar a quién corresponde)")).toBeVisible()

  // El mismo nombre pide confirmación
  await page.getByRole("button", { name: "Agregar persona" }).click()
  await page.getByRole("radio", { name: "Solo agregarla al hogar" }).click()
  await page.getByRole("button", { name: "Continuar" }).click()
  await page.getByRole("textbox", { name: "Nombre" }).fill(hijo.toUpperCase())
  await page.getByRole("button", { name: "Agregar", exact: true }).click()
  await expect(page.getByText("¿Es otra persona?")).toBeVisible()
  await page.getByRole("button", { name: "Cancelar" }).click()
  await expect(page.locator(`[data-person="${hijo.toUpperCase()}"]`)).toHaveCount(0)

  // 2) Invitar por correo
  await page.getByRole("button", { name: "Agregar persona" }).click()
  await page.getByRole("button", { name: "Continuar" }).click() // "Invitarla para que use Mirai" viene elegido
  // «¿Cómo le mandamos la invitación?»: Correo viene elegido; el campo es el mismo para correo o celular (inv-dest).
  await expect(page.getByRole("radio", { name: "Correo" })).toHaveAttribute("aria-checked", "true")
  await page.locator("#inv-dest").fill(correo)
  await page.getByRole("textbox", { name: "Nombre" }).fill(invitado)
  await page.getByRole("radio", { name: "Solo mira" }).click()
  await page.getByRole("button", { name: "Enviar invitación" }).click()
  const listo = page.getByRole("dialog", { name: "Invitación enviada" })
  await expect(listo).toBeVisible({ timeout: 30_000 })
  await expect(listo.getByText("Correo de prueba (no se envió)")).toBeVisible()
  await expect(listo.getByRole("link", { name: "Enviar desde mi WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=/)
  await expect(listo.getByRole("button", { name: "Copiar enlace" })).toBeVisible()
  await shot(page, "hogar-invitacion", info.project.name)
  await listo.getByRole("button", { name: "Listo" }).click()
  await expect(row(page, invitado).getByText(/Invitación enviada/)).toBeVisible()
  await expect(row(page, invitado).getByText("Solo mira")).toBeVisible()

  // 3) El mismo correo (con mayúsculas y espacios) no se repite: ofrece reenviar, con límite de 10 minutos
  await page.getByRole("button", { name: "Agregar persona" }).click()
  await page.getByRole("button", { name: "Continuar" }).click()
  await page.locator("#inv-dest").fill(`  ${correo.toUpperCase()} `)
  await page.getByRole("button", { name: "Enviar invitación" }).click()
  await expect(page.getByText("Ya la invitaste")).toBeVisible()
  await expect(page.getByText(new RegExp(`Ya invitaste a ${invitado}`))).toBeVisible()
  await page.getByRole("button", { name: "Reenviar invitación" }).click()
  await expect(page.getByText(/Acabas de enviarla\. Espera \d+ minutos?/)).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.locator(`[data-person="${invitado}"]`)).toHaveCount(1)

  // 4) Cambiar el rol de una persona con cuenta (con confirmación)
  await options(page, miembro)
  await page.getByRole("menuitem", { name: "Cambiar rol" }).click()
  await page.getByRole("radio", { name: "Registra sus gastos" }).click()
  await page.getByRole("button", { name: "Guardar rol" }).click()
  await expect(page.getByRole("alertdialog", { name: `¿Cambiar el rol de ${miembro}?` })).toBeVisible()
  await page.getByRole("button", { name: "Cambiar rol" }).click()
  await expect(page.getByText("Rol actualizado: Registra sus gastos.")).toBeVisible()
  await expect(row(page, miembro).getByText("Registra sus gastos")).toBeVisible()

  // La tabla comparativa de roles
  await page.getByRole("button", { name: "¿Qué puede hacer cada rol?" }).last().click()
  await expect(page.getByText("Cambiar o pagar el plan").filter({ visible: true }).first()).toBeVisible()

  // 5) Cancelar la invitación
  await options(page, invitado)
  await page.getByRole("menuitem", { name: "Cancelar invitación" }).click()
  await page.getByRole("button", { name: "Cancelar invitación" }).click()
  await expect(page.getByText("Invitación cancelada. El enlace ya no sirve.")).toBeVisible()
  await expect(page.locator(`[data-person="${invitado}"]`)).toHaveCount(0)
  await shot(page, "hogar", info.project.name)

  // Limpieza: quitar al integrante sin cuenta y a la persona de prueba
  await options(page, hijo)
  await page.getByRole("menuitem", { name: "Quitar del hogar" }).click()
  await page.getByRole("button", { name: "Quitar", exact: true }).click()
  await expect(page.getByText(`${hijo} ya no está en el hogar`)).toBeVisible()
  await admin().auth.admin.deleteUser(miembroId)
  expect(errs).toEqual([])
})

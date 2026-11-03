// Batería de V7-A (docs/arquitectura/v7-gcp-total.md §4): flujos del auth propio contra Postgres 17 en Docker.
// Registro con aceptación legal, verificar correo, enlace mágico sin crear cuenta, recuperar clave, sesiones,
// suspender y límites de intentos. (TOTP, Google, cambio de correo y migración en sus propios archivos.)
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { BetterAuthVerifier } from "../../src/core/auth/better-auth.verifier"
import { BetterAuthIdentityAdmin } from "../../src/modules/auth/better-auth.identity-admin"
import { hasPg } from "./pg"
import { BASE, harness, type Harness } from "./harness"
import pino from "pino"

const PW = "Clave-Segura-2026!"
const LEGAL = "2026-11-01.2"

describe.skipIf(!hasPg)("auth propio: registro, entrar, enlace, recuperar y sesiones", () => {
  let h: Harness
  beforeAll(async () => {
    h = await harness("flows")
  })
  afterAll(async () => h?.close())

  async function registered(email: string, nombre = "Ana Pérez") {
    const b = h.browser()
    const r = await b.post("/sign-up/email", { email, password: PW, name: nombre, nombre, acepta_version: LEGAL })
    expect(r.status, JSON.stringify(r.json)).toBe(200)
    const v = await b.get(h.mail.lastUrl(email, "verificar_correo").replace(BASE, `${BASE}`))
    expect(v.status).toBe(302)
    return b
  }

  it("registro: exige aceptar los términos (Ley 1581) y respeta registro_abierto()", async () => {
    const b = h.browser()
    const sin = await b.post("/sign-up/email", { email: "sin@ejemplo.co", password: PW, name: "Sin", nombre: "Sin Acepta" })
    expect(sin.status).toBe(400)
    expect(sin.json.code).toBe("MIRAI_ACEPTA_LEGAL")
    await h.t.sql("update public.platform_settings set registro_abierto = false")
    const cerrado = await b.post("/sign-up/email", { email: "cerrado@ejemplo.co", password: PW, name: "C", nombre: "Cerrado", acepta_version: LEGAL })
    expect(cerrado.status).toBe(403)
    expect(cerrado.json.code).toBe("MIRAI_REGISTRO_CERRADO")
    await h.t.sql("update public.platform_settings set registro_abierto = true")
    const corta = await b.post("/sign-up/email", { email: "corta@ejemplo.co", password: "corta", name: "C", nombre: "Corta", acepta_version: LEGAL })
    expect(corta.json.code).toBe("PASSWORD_TOO_SHORT")
    const { rows } = await h.t.sql("select count(*)::int n from auth.users")
    expect(rows[0].n).toBe(0)
  })

  it("registro → correo de verificación en español → el enlace confirma, abre sesión y va a /bienvenida", async () => {
    const b = h.browser()
    const r = await b.post("/sign-up/email", { email: "Maria@Ejemplo.co", password: PW, name: "María", nombre: "María Gómez", acepta_version: LEGAL, ref: "ABC123" }, { cookie: "" })
    expect(r.status).toBe(200)
    expect(b.hasSession()).toBe(false) // requireEmailVerification: sin sesión hasta confirmar
    const sent = h.mail.sent.at(-1)!
    expect(sent.mail.kind).toBe("verificar_correo")
    expect(sent.mail.subject).toBe("Confirma tu correo para empezar en Mirai")
    expect(sent.mail.html).toContain("Hola, María")
    // Entrar antes de confirmar: EMAIL_NOT_VERIFIED (y se reenvía el enlace).
    const antes = await h.browser().post("/sign-in/email", { email: "maria@ejemplo.co", password: PW })
    expect(antes.status).toBe(403)
    expect(antes.json.code).toBe("EMAIL_NOT_VERIFIED")
    const url = new URL(h.mail.lastUrl("maria@ejemplo.co", "verificar_correo"))
    url.searchParams.set("callbackURL", "/bienvenida")
    const v = await b.get(url.toString())
    expect(v.status).toBe(302)
    expect(v.location).toBe("/bienvenida")
    expect(b.hasSession()).toBe(true)
    const { rows } = await h.t.sql("select email_verified, email_confirmed_at, raw_user_meta_data->>'ref' ref from auth.users where email = 'maria@ejemplo.co'")
    expect(rows[0]).toMatchObject({ email_verified: true, ref: "ABC123" })
    expect(rows[0].email_confirmed_at).not.toBeNull()
  })

  it("entrar con correo y contraseña; error en español si no coincide", async () => {
    await registered("luis@ejemplo.co", "Luis")
    const mal = await h.browser().post("/sign-in/email", { email: "luis@ejemplo.co", password: "otra-clave-mala" })
    expect(mal.status).toBe(401)
    expect(mal.json.code).toBe("INVALID_EMAIL_OR_PASSWORD")
    const b = h.browser()
    const ok = await b.post("/sign-in/email", { email: "LUIS@ejemplo.co", password: PW })
    expect(ok.status).toBe(200)
    expect(b.hasSession()).toBe(true)
    const s = await b.session()
    expect(s?.user?.email).toBe("luis@ejemplo.co")
  })

  it("enlace mágico: sin cuenta no envía nada (y responde igual); con cuenta entra con amr=magiclink", async () => {
    h.mail.clear()
    const nadie = await h.browser().post("/sign-in/magic-link", { email: "nadie@ejemplo.co", callbackURL: "/inicio" })
    expect(nadie.status).toBe(200)
    expect(h.mail.sent).toHaveLength(0)
    const { rows } = await h.t.sql("select count(*)::int n from auth.users where email = 'nadie@ejemplo.co'")
    expect(rows[0].n).toBe(0)

    await registered("eva@ejemplo.co", "Eva")
    const b = h.browser()
    await b.post("/sign-in/magic-link", { email: "eva@ejemplo.co", callbackURL: "/inicio" })
    const m = h.mail.sent.at(-1)!
    expect(m.mail.kind).toBe("enlace_entrar")
    expect(m.mail.subject).toBe("Tu enlace para entrar a Mirai")
    const v = await b.get(h.mail.lastUrl("eva@ejemplo.co", "enlace_entrar"))
    expect(v.status).toBe(302)
    expect(v.location).toBe(`${BASE}/inicio`)
    expect((await b.session())?.session?.amr).toBe("magiclink")
    // Un solo uso.
    const otra = await h.browser().get(h.mail.lastUrl("eva@ejemplo.co", "enlace_entrar"))
    expect(otra.location).toMatch(/error=/)
  })

  it("recuperar clave: enlace → /actualizar-clave?token → clave nueva; cierra las demás sesiones", async () => {
    const vieja = await registered("rosa@ejemplo.co", "Rosa")
    expect(vieja.hasSession()).toBe(true)
    const b = h.browser()
    const r = await b.post("/request-password-reset", { email: "rosa@ejemplo.co", redirectTo: "/actualizar-clave" })
    expect(r.status).toBe(200)
    const link = h.mail.lastUrl("rosa@ejemplo.co", "recuperar_clave")
    const g = await b.get(link)
    expect(g.status).toBe(302)
    const token = new URL(g.location!, BASE).searchParams.get("token")
    expect(new URL(g.location!, BASE).pathname).toBe("/actualizar-clave")
    const reset = await b.post("/reset-password", { token, newPassword: "Otra-Clave-Nueva-9" })
    expect(reset.status).toBe(200)
    expect(await vieja.session()).toBeNull()
    expect((await h.browser().post("/sign-in/email", { email: "rosa@ejemplo.co", password: PW })).status).toBe(401)
    expect((await h.browser().post("/sign-in/email", { email: "rosa@ejemplo.co", password: "Otra-Clave-Nueva-9" })).status).toBe(200)
    // Sin cuenta: misma respuesta, sin correo.
    h.mail.clear()
    expect((await h.browser().post("/request-password-reset", { email: "nadie2@ejemplo.co", redirectTo: "/actualizar-clave" })).status).toBe(200)
    expect(h.mail.sent).toHaveLength(0)
  })

  it("sesiones: listar, cerrar una, cerrar las otras y cerrar todas; cambiar la clave", async () => {
    const a = await registered("pepe@ejemplo.co", "Pepe")
    const b = h.browser()
    const c = h.browser()
    await b.post("/sign-in/email", { email: "pepe@ejemplo.co", password: PW })
    await c.post("/sign-in/email", { email: "pepe@ejemplo.co", password: PW })
    const list = await a.get("/list-sessions")
    expect((list.json as unknown as unknown[]).length).toBe(3)
    const cTok = (await c.session())!.session!.token
    expect((await a.post("/revoke-session", { token: cTok })).status).toBe(200)
    expect(await c.session()).toBeNull()
    expect((await a.post("/revoke-other-sessions", {})).status).toBe(200)
    expect(await b.session()).toBeNull()
    expect(await a.session()).not.toBeNull()
    const cambio = await a.post("/change-password", { currentPassword: PW, newPassword: "Clave-Cambiada-77", revokeOtherSessions: true })
    expect(cambio.status).toBe(200)
    expect((await a.post("/revoke-sessions", {})).status).toBe(200)
    expect(await a.session()).toBeNull()
  })

  it("claims para la RLS: sub, role, email, session_id, aal y amr con fecha (verificador de la cadena)", async () => {
    const b = await registered("claims@ejemplo.co", "Claims")
    const s = (await b.session())!
    const v = new BetterAuthVerifier(h.svc)
    const byBearer = await v.verify(s.session!.token)
    expect(byBearer.claims).toMatchObject({ sub: s.user!.id, role: "authenticated", email: "claims@ejemplo.co", session_id: s.session!.id, aal: "aal1" })
    expect(Array.isArray(byBearer.claims.amr)).toBe(true)
    const byCookie = await v.verify("x", { fromCookie: true, cookie: b.cookie })
    expect(byCookie.id).toBe(s.user!.id)
    await expect(v.verify("token-que-no-existe")).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
  })

  it("suspender: cierra sesiones, avisa por correo y no deja entrar (mensaje en español)", async () => {
    const b = await registered("susp@ejemplo.co", "Susana")
    const id = (await b.session())!.user!.id
    const admin = new BetterAuthIdentityAdmin(h.svc, pino({ level: "silent" }))
    expect(await admin.setBanned(id, true)).toBeNull()
    expect(h.mail.sent.at(-1)!.mail.kind).toBe("cuenta_suspendida")
    const { rows } = await h.t.sql("select count(*)::int n from auth.sessions where user_id = $1", [id])
    expect(rows[0].n).toBe(0)
    const r = await h.browser().post("/sign-in/email", { email: "susp@ejemplo.co", password: PW })
    expect(r.status).toBe(403)
    expect(r.json.code).toBe("MIRAI_CUENTA_SUSPENDIDA")
    expect((await admin.getUser(id))?.banned_until).toBeTruthy()
    await admin.setBanned(id, false)
    expect((await h.browser().post("/sign-in/email", { email: "susp@ejemplo.co", password: PW })).status).toBe(200)
  })

  it("consola: enlace de recuperación sin enviar correo e invitación con cuenta sin clave", async () => {
    await registered("olvido@ejemplo.co", "Olvido")
    h.mail.clear()
    const admin = new BetterAuthIdentityAdmin(h.svc, pino({ level: "silent" }))
    const r = await admin.recoveryLink("olvido@ejemplo.co", "/actualizar-clave")
    expect(r.link).toMatch(/\/api\/auth\/reset-password\//)
    expect(h.mail.sent).toHaveLength(0)
    expect(await admin.inviteUser("nueva@ejemplo.co", { nombre: "Nueva" }, "/bienvenida")).toBeNull()
    const inv = h.mail.sent.at(-1)!
    expect(inv.mail.kind).toBe("invitacion")
    const b = h.browser()
    const v = await b.get(h.mail.lastUrl("nueva@ejemplo.co", "invitacion"))
    expect(v.location).toBe(`${BASE}/bienvenida`)
    expect(b.hasSession()).toBe(true)
    const { rows } = await h.t.sql("select nombre from public.profiles p join auth.users u on u.id = p.id where u.email = 'nueva@ejemplo.co'")
    expect(rows[0].nombre).toBe("Nueva")
    expect((await admin.listUsers()).length).toBeGreaterThan(3)
  })

  it("límites de intentos: el sexto intento de entrar en un minuto responde 429", async () => {
    const b = h.browser()
    const codes: number[] = []
    for (let i = 0; i < 6; i++) codes.push((await b.post("/sign-in/email", { email: "fuerza@ejemplo.co", password: `mala-${i}-clave` })).status)
    expect(codes.slice(0, 5).every((c) => c === 401)).toBe(true)
    expect(codes[5]).toBe(429)
  })
})

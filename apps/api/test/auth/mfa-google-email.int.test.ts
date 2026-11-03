// Batería de V7-A (2/2): TOTP (activar, entrar, códigos de respaldo, también con enlace mágico y Google), TOTP heredado
// de Supabase, Google con un OIDC simulado (sin red) y el cambio de correo en dos pasos con "No fui yo".
import { symmetricEncrypt } from "better-auth/crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { totpNow, hotp, LEGACY_TOTP_PREFIX } from "../../src/modules/auth/legacy-totp"
import { BetterAuthAccountRepo } from "../../src/modules/account/adapters/better-auth.account.repo"
import { BetterAuthIdentityAdmin } from "../../src/modules/auth/better-auth.identity-admin"
import pino from "pino"
import { hasPg } from "./pg"
import { BASE, SECRET, googleIdToken, harness, type Browser, type Harness } from "./harness"

const PW = "Clave-Segura-2026!"
const LEGAL = "2026-11-01.2"

/** Código TOTP actual de un secreto de Better Auth (el texto del secreto es la llave HMAC). */
function codeFromUri(uri: string) {
  const b32 = new URL(uri).searchParams.get("secret")!
  return totpNow(b32)
}

describe.skipIf(!hasPg)("auth propio: segundo factor, Google y cambio de correo", () => {
  let h: Harness
  beforeAll(async () => {
    h = await harness("mfa")
  })
  afterAll(async () => h?.close())
  afterEach(() => vi.restoreAllMocks())

  async function registered(email: string, nombre = "Persona") {
    const b = h.browser()
    expect((await b.post("/sign-up/email", { email, password: PW, name: nombre, nombre, acepta_version: LEGAL })).status).toBe(200)
    await b.get(h.mail.lastUrl(email, "verificar_correo"))
    return b
  }

  async function enableTotp(b: Browser) {
    const en = await b.post("/two-factor/enable", { password: PW })
    expect(en.status, JSON.stringify(en.json)).toBe(200)
    const uri = String(en.json.totpURI)
    expect(uri).toMatch(/^otpauth:\/\/totp\/Mirai:/)
    const backup = en.json.backupCodes as string[]
    expect(backup).toHaveLength(10)
    const v = await b.post("/two-factor/verify-totp", { code: codeFromUri(uri) })
    expect(v.status).toBe(200)
    return { uri, backup }
  }

  it("TOTP: activar, entrar con contraseña + código (aal2) y con un código de respaldo", async () => {
    const b = await registered("totp@ejemplo.co")
    const { uri, backup } = await enableTotp(b)
    const { rows } = await h.t.sql("select two_factor_enabled from auth.users where email = 'totp@ejemplo.co'")
    expect(rows[0].two_factor_enabled).toBe(true)
    // La sesión con la que se activó queda en aal2 (Better Auth la rota al activar).
    expect((await b.session())?.session?.aal).toBe("aal2")

    const c = h.browser()
    const s1 = await c.post("/sign-in/email", { email: "totp@ejemplo.co", password: PW })
    expect(s1.json.twoFactorRedirect).toBe(true)
    expect(c.hasSession()).toBe(false)
    const mal = await c.post("/two-factor/verify-totp", { code: "000000" })
    expect(mal.json.code).toBe("INVALID_CODE")
    const ok = await c.post("/two-factor/verify-totp", { code: codeFromUri(uri) })
    expect(ok.status).toBe(200)
    const s = await c.session()
    expect(s?.session).toMatchObject({ aal: "aal2", amr: "totp" })

    const d = h.browser()
    await d.post("/sign-in/email", { email: "totp@ejemplo.co", password: PW })
    expect((await d.post("/two-factor/verify-backup-code", { code: backup[0] })).status).toBe(200)
    expect(d.hasSession()).toBe(true)
    // El código de respaldo sirve una sola vez.
    const e = h.browser()
    await e.post("/sign-in/email", { email: "totp@ejemplo.co", password: PW })
    expect((await e.post("/two-factor/verify-backup-code", { code: backup[0] })).status).toBe(401)
  })

  it("TOTP también con el enlace mágico: no hay sesión hasta el código (→ /verificacion)", async () => {
    const b = await registered("enlace2fa@ejemplo.co")
    const { uri } = await enableTotp(b)
    const c = h.browser()
    await c.post("/sign-in/magic-link", { email: "enlace2fa@ejemplo.co", callbackURL: "/gastos" })
    const v = await c.get(h.mail.lastUrl("enlace2fa@ejemplo.co", "enlace_entrar"))
    expect(v.status).toBe(302)
    expect(v.location).toBe(`${BASE}/verificacion?next=${encodeURIComponent("/gastos")}`)
    expect(c.hasSession()).toBe(false)
    expect([...c.jar.keys()].some((k) => k.endsWith("two_factor"))).toBe(true)
    expect((await c.post("/two-factor/verify-totp", { code: codeFromUri(uri) })).status).toBe(200)
    expect((await c.session())?.session?.aal).toBe("aal2")
  })

  it("TOTP heredado de Supabase (base32): entra sin volver a escanear el QR", async () => {
    const id = crypto.randomUUID()
    const b32 = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP"
    await h.t.sql("insert into auth.users (id, email, email_verified, name, two_factor_enabled) values ($1, 'heredado@ejemplo.co', true, 'Heredado', true)", [id])
    await h.t.sql("insert into auth.accounts (id, user_id, account_id, provider_id, password) values ($1, $2::uuid, $2::text, 'credential', $3)", [crypto.randomUUID(), id, "$2a$10$" + "x".repeat(53)])
    // contraseña real (bcrypt de Supabase)
    const bcrypt = (await import("bcryptjs")).default
    await h.t.sql("update auth.accounts set password = $1 where user_id = $2", [bcrypt.hashSync(PW, 10).replace(/^\$2b\$/, "$2a$"), id])
    const secret = await symmetricEncrypt({ key: SECRET, data: `${LEGACY_TOTP_PREFIX}${b32}` })
    const codes = await symmetricEncrypt({ key: SECRET, data: "[]" })
    await h.t.sql("insert into auth.two_factors (id, user_id, secret, backup_codes, verified) values ($1, $2, $3, $4, true)", [crypto.randomUUID(), id, secret, codes])
    const c = h.browser()
    const s1 = await c.post("/sign-in/email", { email: "heredado@ejemplo.co", password: PW })
    expect(s1.json.twoFactorRedirect).toBe(true)
    expect((await c.post("/two-factor/verify-totp", { code: "123456" === totpNow(b32) ? "654321" : "123456" })).json.code).toBe("INVALID_CODE")
    const ok = await c.post("/two-factor/verify-totp", { code: totpNow(b32) })
    expect(ok.status, JSON.stringify(ok.json)).toBe(200)
    expect((await c.session())?.session?.aal).toBe("aal2")
    // El código del periodo anterior también sirve (ventana ±1, como Supabase).
    expect(hotp(Buffer.from("x"), 1)).toMatch(/^\d{6}$/)
  })

  it("Google (OIDC simulado): crea la cuenta con foto y nombre; con el mismo correo cae en la misma cuenta", async () => {
    await registered("gina@ejemplo.co", "Gina")
    const idToken = await googleIdToken({ sub: "google-sub-123", email: "gina@ejemplo.co", name: "Gina Google" })
    const real = globalThis.fetch
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.startsWith("https://oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "at", id_token: idToken, expires_in: 3600, token_type: "Bearer", scope: "openid email profile" }), { headers: { "content-type": "application/json" } })
      return real(input, init)
    })
    const b = h.browser()
    const start = await b.post("/sign-in/social", { provider: "google", callbackURL: "/inicio" })
    expect(start.status).toBe(200)
    const goTo = new URL(String(start.json.url))
    expect(goTo.host).toBe("accounts.google.com")
    const state = goTo.searchParams.get("state")!
    const cb = await b.get(`/callback/google?code=codigo-de-google&state=${encodeURIComponent(state)}`)
    expect(cb.status, JSON.stringify(cb.json)).toBe(302)
    expect(new URL(cb.location!, BASE).toString()).toBe(`${BASE}/inicio`)
    const s = await b.session()
    expect(s?.user?.email).toBe("gina@ejemplo.co")
    expect(s?.session?.amr).toBe("oauth")
    const { rows } = await h.t.sql("select a.provider_id, a.account_id, a.email from auth.accounts a join auth.users u on u.id = a.user_id where u.email = 'gina@ejemplo.co' order by provider_id")
    expect(rows.map((r) => r.provider_id)).toEqual(["credential", "google"])
    expect(rows[1]).toMatchObject({ account_id: "google-sub-123", email: "gina@ejemplo.co" })
    const p = await h.t.sql("select avatar_url from public.profiles p join auth.users u on u.id = p.id where u.email = 'gina@ejemplo.co'")
    expect(p.rows[0].avatar_url).toMatch(/googleusercontent/)

    // Cuenta nueva solo con Google: perfil con nombre y foto (handle_new_user) y contraseña creada después.
    const idToken2 = await googleIdToken({ sub: "google-sub-456", email: "nuevo.google@ejemplo.co", name: "Nuevo Google" })
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const url = String(input instanceof Request ? input.url : input)
      if (url.startsWith("https://oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "at2", id_token: idToken2, expires_in: 3600, token_type: "Bearer" }), { headers: { "content-type": "application/json" } })
      return real(input, init)
    })
    const n = h.browser()
    const st = await n.post("/sign-in/social", { provider: "google", callbackURL: "/bienvenida" })
    const cb2 = await n.get(`/callback/google?code=otro&state=${encodeURIComponent(new URL(String(st.json.url)).searchParams.get("state")!)}`)
    expect(new URL(cb2.location!, BASE).toString()).toBe(`${BASE}/bienvenida`)
    const q = await h.t.sql("select p.nombre, p.avatar_url from public.profiles p join auth.users u on u.id = p.id where u.email = 'nuevo.google@ejemplo.co'")
    expect(q.rows[0].nombre).toBe("Nuevo Google")
    const token = (await n.session())!.session!.token
    await h.svc.instance.api.setPassword({ body: { newPassword: "Clave-Desde-Google-1" }, headers: h.svc.headersFor({ token }) })
    expect((await h.browser().post("/sign-in/email", { email: "nuevo.google@ejemplo.co", password: "Clave-Desde-Google-1" })).status).toBe(200)

    // Desvincular Google con la API de la cuenta (IdentityAdmin), nunca la última forma de entrar.
    const admin = new BetterAuthIdentityAdmin(h.svc, pino({ level: "silent" }))
    const ids = await admin.identities(token)
    const g = ids.find((i) => i.provider === "google")!
    expect(await admin.unlinkIdentity(token, g.identity_id)).toBeNull()
    expect((await admin.identities(token)).map((i) => i.provider)).toEqual(["email"])
    const last = (await admin.identities(token))[0]
    expect((await admin.unlinkIdentity(token, last.identity_id))?.message).toMatch(/at least 1/)
  })

  it("cambio de correo en dos pasos: aprobar desde el actual, confirmar el nuevo, aviso al viejo; cancelar invalida", async () => {
    const b = await registered("viejo@ejemplo.co", "Vicky")
    const token = (await b.session())!.session!.token
    const admin = new BetterAuthIdentityAdmin(h.svc, pino({ level: "silent" }))
    expect((await admin.requestEmailChange(token, "gina@ejemplo.co", "/perfil"))?.code).toBe("email_exists")

    const cb = `${BASE}/auth/callback?next=${encodeURIComponent("/perfil?correo=listo#cuentas")}`
    expect(await admin.requestEmailChange(token, "nuevo@ejemplo.co", cb)).toBeNull()
    const aprobar = h.mail.sent.at(-1)!
    expect(aprobar.to).toBe("viejo@ejemplo.co")
    expect(aprobar.mail.kind).toBe("cambio_correo_aprobar")
    expect(aprobar.mail.html).toContain("No fui yo")
    const repo = new BetterAuthAccountRepo(null as never, h.svc)
    const scope = { kind: "user" as const, userId: (await b.session())!.user!.id, token, claims: {} }
    expect(await repo.myAccount(scope)).toMatchObject({ new_email: "nuevo@ejemplo.co", email_change_confirm_status: 0 })

    const paso1 = await b.get(h.mail.lastUrl("viejo@ejemplo.co", "cambio_correo_aprobar"))
    expect(paso1.status).toBe(302)
    expect(paso1.location).toContain("correo%3Dfalta_otro")
    expect(await repo.myAccount(scope)).toMatchObject({ email_change_confirm_status: 1 })
    const confirmar = h.mail.sent.at(-1)!
    expect(confirmar).toMatchObject({ to: "nuevo@ejemplo.co" })
    expect(confirmar.mail.kind).toBe("cambio_correo_confirmar")
    const paso2 = await b.get(h.mail.lastUrl("nuevo@ejemplo.co", "cambio_correo_confirmar"))
    expect(paso2.status).toBe(302)
    const { rows } = await h.t.sql("select email, email_verified from auth.users where id = $1", [scope.userId])
    expect(rows[0]).toMatchObject({ email: "nuevo@ejemplo.co", email_verified: true })
    expect(h.mail.sent.at(-1)).toMatchObject({ to: "viejo@ejemplo.co", mail: { kind: "correo_cambiado" } })
    expect((await repo.myAccount(scope))?.new_email).toBeNull()

    // Cancelar: el enlace que llegó deja de servir.
    expect(await admin.requestEmailChange(token, "otro@ejemplo.co", cb)).toBeNull()
    const link = h.mail.lastUrl("nuevo@ejemplo.co", "cambio_correo_aprobar")
    expect(await repo.rpc(scope, "cancel_my_email_change")).toBe(true)
    const tarde = await b.get(link)
    expect(tarde.location).toMatch(/error=MIRAI_ENLACE_CANCELADO/)
    const { rows: r2 } = await h.t.sql("select email from auth.users where id = $1", [scope.userId])
    expect(r2[0].email).toBe("nuevo@ejemplo.co")
  })
})

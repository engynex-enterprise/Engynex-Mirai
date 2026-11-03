// Migración de usuarios Supabase → auth propio (§3.1.7), sin conectarse a Supabase: la prueba GENERA un archivo de
// exportación de ejemplo (la misma forma que SUPABASE_EXPORT_SQL) con hashes bcrypt reales, Google, TOTP legible e
// ilegible, una cuenta suspendida, una anónima y una borrada; lo importa con el CLI y entra con cada tipo de cuenta.
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import bcrypt from "bcryptjs"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { totpNow } from "../../src/modules/auth/legacy-totp"
import { runAuthMigrate } from "../../src/modules/auth/migrate/cli"
import { planImport } from "../../src/modules/auth/migrate/supabase-export"
import { hasPg } from "./pg"
import { BASE, SECRET, googleIdToken, harness, type Harness } from "./harness"

const B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
const id = () => crypto.randomUUID()
const U = { clave: id(), google: id(), ambos: id(), totp: id(), totpMalo: id(), susp: id(), anon: id(), borrado: id(), sinCorreo: id() }

/** Exportación de ejemplo con la forma de SUPABASE_EXPORT_SQL (hashes $2a$10$ como los de GoTrue). */
function sampleExport() {
  const h = (p: string) => bcrypt.hashSync(p, 10).replace(/^\$2b\$/, "$2a$")
  const t = "2026-01-15T10:00:00.000Z"
  const user = (uid: string, email: string | null, extra: Record<string, unknown> = {}) => ({
    id: uid, email, encrypted_password: null, email_confirmed_at: t, created_at: t, updated_at: t, last_sign_in_at: t,
    raw_user_meta_data: { nombre: `Persona ${email?.split("@")[0]}`, acepta_version: "2026-11-01.2" }, raw_app_meta_data: { provider: "email" }, banned_until: null, is_anonymous: false, deleted_at: null, ...extra,
  })
  return {
    exported_at: t,
    users: [
      user(U.clave, "Clave@Ejemplo.co", { encrypted_password: h("Clave-De-Supabase-1") }),
      user(U.google, "solo.google@ejemplo.co", { raw_user_meta_data: { full_name: "Solo Google", avatar_url: "https://lh3.googleusercontent.com/a/x" } }),
      user(U.ambos, "ambos@ejemplo.co", { encrypted_password: h("Clave-De-Ambos-2") }),
      user(U.totp, "totp@ejemplo.co", { encrypted_password: h("Clave-Con-Totp-3") }),
      user(U.totpMalo, "totp.malo@ejemplo.co", { encrypted_password: h("Clave-Totp-Malo-4") }),
      user(U.susp, "susp@ejemplo.co", { encrypted_password: h("Clave-Susp-5"), banned_until: "2126-01-01T00:00:00Z" }),
      user(U.anon, null, { is_anonymous: true }),
      user(U.borrado, "borrado@ejemplo.co", { deleted_at: t }),
      user(U.sinCorreo, null),
    ],
    identities: [
      { id: id(), user_id: U.clave, provider: "email", provider_id: U.clave, identity_data: { email: "clave@ejemplo.co" }, created_at: t, updated_at: t, last_sign_in_at: t },
      { id: id(), user_id: U.google, provider: "google", provider_id: "1122334455", identity_data: { email: "solo.google@ejemplo.co", picture: "https://lh3.googleusercontent.com/a/x" }, created_at: t, updated_at: t, last_sign_in_at: t },
      { id: id(), user_id: U.ambos, provider: "google", provider_id: "5566778899", identity_data: { email: "ambos.gmail@gmail.com" }, created_at: t, updated_at: t, last_sign_in_at: t },
      { id: id(), user_id: U.ambos, provider: "email", provider_id: U.ambos, identity_data: { email: "ambos@ejemplo.co" }, created_at: t, updated_at: t, last_sign_in_at: t },
    ],
    mfa_factors: [
      { id: id(), user_id: U.totp, factor_type: "totp", status: "verified", secret: B32, friendly_name: "Mirai 2026-01-15", created_at: t },
      { id: id(), user_id: U.totpMalo, factor_type: "totp", status: "verified", secret: "enc:v1:QWxndW5vIGNpZnJhZG8=", friendly_name: null, created_at: t },
      { id: id(), user_id: U.clave, factor_type: "totp", status: "unverified", secret: B32, friendly_name: null, created_at: t },
    ],
  }
}

describe.skipIf(!hasPg)("migración de usuarios desde la exportación de Supabase", () => {
  let h: Harness
  let file: string
  beforeAll(async () => {
    h = await harness("migra")
    file = join(mkdtempSync(join(tmpdir(), "mirai-auth-export-")), "auth-export.json")
    writeFileSync(file, JSON.stringify(sampleExport()), { mode: 0o600 })
  })
  afterAll(async () => h?.close())

  it("el plan cuenta lo que se migra y lo que se omite (sin imprimir correos ni hashes)", async () => {
    const plan = await planImport(sampleExport(), SECRET, Date.parse("2026-11-02T00:00:00Z"))
    expect(plan.report).toEqual({ usuarios: 6, conClave: 5, google: 2, totpMigrados: 1, totpReactivar: 1, suspendidos: 1, omitidos: { anonimos: 1, sinCorreo: 1, borrados: 1, claveNoBcrypt: 0, proveedorOtro: 0 } })
    const out: string[] = []
    expect(await runAuthMigrate(["--in", file, "--dry-run"], { env: { BETTER_AUTH_SECRET: SECRET }, out: (s) => out.push(s) })).toBe(0)
    expect(out.join("\n")).not.toMatch(/@|\$2a\$/)
  })

  it("importa con el CLI (idempotente), mismos UUID, y cada tipo de cuenta entra", async () => {
    const out: string[] = []
    const env = { BETTER_AUTH_SECRET: SECRET, AUTH_DATABASE_URL: h.t.url }
    expect(await runAuthMigrate(["--in", file], { env, out: (s) => out.push(s) })).toBe(0)
    expect(await runAuthMigrate(["--in", file], { env, out: (s) => out.push(s) })).toBe(0) // segunda pasada (ventana del corte)
    const { rows } = await h.t.sql("select id, email, email_verified, name, banned, two_factor_enabled, mfa_reactivar from auth.users order by email")
    expect(rows).toHaveLength(6)
    expect(rows.find((r) => r.id === U.clave)).toMatchObject({ email: "clave@ejemplo.co", email_verified: true, name: "Persona Clave" })
    expect(rows.find((r) => r.id === U.google)?.name).toBe("Solo Google")
    expect(rows.find((r) => r.id === U.totp)).toMatchObject({ two_factor_enabled: true, mfa_reactivar: false })
    expect(rows.find((r) => r.id === U.totpMalo)).toMatchObject({ two_factor_enabled: false, mfa_reactivar: true })
    expect(rows.find((r) => r.id === U.susp)?.banned).toBe(true)
    // Los triggers de usuario no corrieron: `public` llega con la restauración, no se duplica.
    expect((await h.t.sql("select count(*)::int n from public.profiles")).rows[0].n).toBe(0)

    // 1) Clave de Supabase tal cual.
    const a = h.browser()
    expect((await a.post("/sign-in/email", { email: "clave@ejemplo.co", password: "Clave-De-Supabase-1" })).status).toBe(200)
    expect((await a.session())?.user?.id).toBe(U.clave)
    // 2) TOTP de Supabase (legible): contraseña + código con el mismo secreto.
    const b = h.browser()
    expect((await b.post("/sign-in/email", { email: "totp@ejemplo.co", password: "Clave-Con-Totp-3" })).json.twoFactorRedirect).toBe(true)
    expect((await b.post("/two-factor/verify-totp", { code: totpNow(B32) })).status).toBe(200)
    // 3) TOTP ilegible: entra con la clave y la API le pide activarlo otra vez (mfa_reactivar).
    const c = h.browser()
    expect((await c.post("/sign-in/email", { email: "totp.malo@ejemplo.co", password: "Clave-Totp-Malo-4" })).status).toBe(200)
    expect(((await c.session())?.user as { mfa_reactivar?: boolean } | undefined)?.mfa_reactivar).toBe(true)
    // Re-enrolamiento: activa de nuevo (QR nuevo) y la marca se limpia.
    const en = await c.post("/two-factor/enable", { password: "Clave-Totp-Malo-4" })
    const b32 = new URL(String(en.json.totpURI)).searchParams.get("secret")!
    expect((await c.post("/two-factor/verify-totp", { code: totpNow(b32) })).status).toBe(200)
    expect((await h.t.sql("select mfa_reactivar, two_factor_enabled from auth.users where id = $1", [U.totpMalo])).rows[0]).toEqual({ mfa_reactivar: false, two_factor_enabled: true })
    // 4) Suspendida: sigue suspendida.
    expect((await h.browser().post("/sign-in/email", { email: "susp@ejemplo.co", password: "Clave-Susp-5" })).json.code).toBe("MIRAI_CUENTA_SUSPENDIDA")
    // 5) Google: el mismo `sub` cae en la misma cuenta aunque el correo de Google sea otro.
    const idToken = await googleIdToken({ sub: "5566778899", email: "ambos.gmail@gmail.com" })
    const real = globalThis.fetch
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) =>
      String(input instanceof Request ? input.url : input).startsWith("https://oauth2.googleapis.com/token")
        ? new Response(JSON.stringify({ access_token: "at", id_token: idToken, expires_in: 3600, token_type: "Bearer" }), { headers: { "content-type": "application/json" } })
        : real(input, init),
    )
    const g = h.browser()
    const st = await g.post("/sign-in/social", { provider: "google", callbackURL: "/inicio" })
    const cb = await g.get(`/callback/google?code=x&state=${encodeURIComponent(new URL(String(st.json.url)).searchParams.get("state")!)}`)
    expect(new URL(cb.location!, BASE).pathname).toBe("/inicio")
    expect((await g.session())?.user?.id).toBe(U.ambos)
    vi.restoreAllMocks()
    expect((await h.t.sql("select count(*)::int n from auth.users")).rows[0].n).toBe(6)
  })
})

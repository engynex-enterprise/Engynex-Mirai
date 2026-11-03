// Pruebas sin base del auth propio (corren siempre en `pnpm test`; las de Postgres están en test/auth).
import bcrypt from "bcryptjs"
import { describe, expect, it } from "vitest"
import { authErrorMessage, AUTH_ERRORS } from "@mirai/contracts/modules/auth"
import { changeEmailApproveMail, magicLinkMail, resetPasswordMail, verifyEmailMail } from "@mirai/services/mail/auth/templates"
import { claimsOf, sessionCookieToken } from "../../core/auth/better-auth.verifier"
import { isJwt, TokenChain } from "../../core/auth/chain.verifier"
import { TokenVerifier, type AuthUser } from "../../core/auth/token-verifier"
import { amrOf, isBanned } from "./auth.config"
import { loadAuthEnv } from "./auth.env"
import { base32Decode, isBase32Secret, totpNow, verifyLegacyTotp } from "./legacy-totp"
import { hashPassword, isBcrypt, verifyPassword } from "./password"

describe("contraseñas (bcrypt de Supabase)", () => {
  it("verifica $2a$/$2b$/$2y$ y guarda con costo 12", async () => {
    const h10 = bcrypt.hashSync("Clave-Uno-2026", 10)
    for (const p of ["$2a$", "$2b$", "$2y$"]) expect(await verifyPassword({ hash: h10.replace(/^\$2[aby]\$/, p), password: "Clave-Uno-2026" })).toBe(true)
    expect(await verifyPassword({ hash: h10, password: "otra" })).toBe(false)
    const h = await hashPassword("Clave-Dos-2026")
    expect(h).toMatch(/^\$2[ab]\$12\$/)
    expect(isBcrypt(h)).toBe(true)
    expect(await verifyPassword({ hash: "basura", password: "x" })).toBe(false)
  })
})

describe("TOTP heredado de Supabase (RFC 6238)", () => {
  // Vector de la RFC: secreto ASCII "12345678901234567890", T = 59 s → 94287082 (8 dígitos) → 287082 (6).
  const B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"
  it("decodifica base32 y genera el código del vector de la RFC", () => {
    expect(base32Decode(B32).toString()).toBe("12345678901234567890")
    expect(totpNow(B32, 59_000)).toBe("287082")
    expect(verifyLegacyTotp(B32, "287082", 59_000)).toBe(true)
    expect(verifyLegacyTotp(B32, "287082", 59_000 + 30_000)).toBe(true) // ventana ±1
    expect(verifyLegacyTotp(B32, "287082", 59_000 + 90_000)).toBe(false)
    expect(verifyLegacyTotp(B32, "12345", 59_000)).toBe(false)
    expect(isBase32Secret(B32)).toBe(true)
    expect(isBase32Secret("enc:v1:abc")).toBe(false)
  })
})

describe("sesión: cookie, claims y cadena de verificadores", () => {
  it("lee la cookie de sesión (con y sin __Secure-)", () => {
    expect(sessionCookieToken("a=1; __Secure-mirai.session_token=abc.d%2Bef; b=2")).toBe("abc.d+ef")
    expect(sessionCookieToken("mirai.session_token=xyz.123")).toBe("xyz.123")
    expect(sessionCookieToken("sb-access-token=eyJ")).toBeNull()
  })
  it("claims con la forma de Supabase", () => {
    const c = claimsOf({ user: { id: "u1", email: "a@b.co", name: "A", emailVerified: true, twoFactorEnabled: false, banned: false, mfaReactivar: false }, session: { id: "s1", token: "t", aal: "aal2", amr: "totp", createdAt: new Date(1_000_000), expiresAt: new Date(9_000_000) } })
    expect(c).toMatchObject({ sub: "u1", role: "authenticated", email: "a@b.co", session_id: "s1", aal: "aal2", amr: [{ method: "totp", timestamp: 1000 }] })
  })
  it("un JWT va a Supabase y lo demás (o la cookie) a Better Auth", async () => {
    const fake = (name: string) => new (class extends TokenVerifier {
      async verify(token: string) { return { id: name, token } as unknown as AuthUser }
      async ready() { return { ok: true } }
    })()
    const chain = new TokenChain(fake("supabase"), fake("mirai"))
    expect(isJwt("a.b.c")).toBe(true)
    expect((await chain.verify("a.b.c")).id).toBe("supabase")
    expect((await chain.verify("token.firma")).id).toBe("mirai")
    expect((await chain.verify("a.b.c", { fromCookie: true, cookie: "x" })).id).toBe("mirai")
    await expect(new TokenChain(fake("supabase"), null).verify("token.firma")).rejects.toMatchObject({ code: "UNAUTHENTICATED" })
  })
})

describe("reglas del auth propio", () => {
  it("amr según la ruta y suspensión con o sin fecha", () => {
    expect(amrOf("/sign-in/email")).toBe("password")
    expect(amrOf("/magic-link/verify")).toBe("magiclink")
    expect(amrOf("/callback/:id")).toBe("oauth")
    expect(amrOf("/two-factor/verify-totp")).toBe("totp")
    expect(isBanned({ banned: true, ban_expires: null })).toBe(true)
    expect(isBanned({ banned: true, ban_expires: new Date(Date.now() - 1000) })).toBe(false)
    expect(isBanned({ banned: false, ban_expires: null })).toBe(false)
  })
  it("variables: supabase por defecto; mirai exige secreto y base (sin mostrar valores)", () => {
    expect(loadAuthEnv({}).provider).toBe("supabase")
    expect(() => loadAuthEnv({ AUTH_PROVIDER: "mirai" })).toThrow(/BETTER_AUTH_SECRET/)
    expect(() => loadAuthEnv({ AUTH_PROVIDER: "mirai", BETTER_AUTH_SECRET: "x".repeat(40), MIRAI_ENV: "produccion", DATABASE_URL: "postgres://x" })).toThrow(/BETTER_AUTH_URL/)
    const v = loadAuthEnv({ AUTH_PROVIDER: "mirai", BETTER_AUTH_SECRET: "x".repeat(40), DATABASE_URL: "postgres://x", BETTER_AUTH_URL: "https://mirai.engynex.com/" })
    expect(v).toMatchObject({ enabled: true, baseURL: "https://mirai.engynex.com", secureCookies: true, mailDriver: "log" })
  })
  it("errores de Better Auth en español", () => {
    expect(authErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD" })).toBe("El correo o la contraseña no coinciden.")
    expect(authErrorMessage({ code: "RARO", status: 429 })).toMatch(/demasiados intentos/)
    expect(Object.values(AUTH_ERRORS).every((m) => /^[A-ZÁÉÍÓÚ¿]/.test(m))).toBe(true)
  })
  it("correos en español con el enlace y su duración", () => {
    expect(verifyEmailMail({ url: "https://m/x", nombre: "Ana Pérez" }).html).toContain("Hola, Ana")
    expect(magicLinkMail({ url: "https://m/y", expiresIn: 3600 }).text).toContain("1 hora")
    expect(resetPasswordMail({ url: "https://m/z" }).subject).toBe("Crea una contraseña nueva para Mirai")
    const c = changeEmailApproveMail({ url: "https://m/a", newEmail: "n@x.co", cancelUrl: "https://m/c" })
    expect(c.html).toContain("No fui yo")
    expect(verifyEmailMail({ url: 'https://m/"><script>', nombre: "<b>" }).html).not.toContain("<script>")
  })
})

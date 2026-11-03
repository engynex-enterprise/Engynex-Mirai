// Better Auth de Mirai (v7, V7-A; docs/arquitectura/v7-gcp-total.md §3.1.2–3.1.4). Corre dentro de la API, sobre la
// misma Postgres, con las tablas en el esquema `auth` (sql/auth-schema.sql) y los mismos UUID de Supabase.
//
// Spike (2026-11-02, better-auth 1.7.10): el adaptador Kysely acepta `schemaName: "auth"` (usa `withSchema` por dentro);
// se usa así. Plan B si una versión futura lo quita: un pg.Pool con `options: "-c search_path=auth,public"`
// (authDbPool en auth-db.ts lo deja listo con AUTH_DB_SEARCH_PATH=1).
import { randomUUID } from "node:crypto"
import { betterAuth, type BetterAuthOptions } from "better-auth"
import { APIError } from "better-auth/api"
import { bearer, captcha, magicLink, twoFactor } from "better-auth/plugins"
import { decodeJwt } from "jose"
import { sql } from "kysely"
import { PASSWORD_MAX, PASSWORD_MIN } from "@mirai/contracts/modules/auth"
import { authDb, type AuthKysely } from "./auth-db"
import type { AuthEnvValues } from "./auth.env"
import { EMAIL_CHANGE_ID, miraiGate, type PendingEmailChange } from "./mirai-gate.plugin"
import { hashPassword, verifyPassword } from "./password"

/** Correos que pide Better Auth; MiraiAuthService los arma con las plantillas de @mirai/services y los envía. */
export type AuthDelivery =
  | { kind: "verify"; to: string; url: string; userId: string; nombre: string | null }
  | { kind: "magic"; to: string; url: string; userId: string | null; nombre: string | null }
  | { kind: "reset"; to: string; url: string; userId: string; nombre: string | null }
  | { kind: "change-approve"; to: string; url: string; userId: string; nombre: string | null; newEmail: string }
  | { kind: "change-confirm"; to: string; url: string; userId: string; nombre: string | null; newEmail: string }
  | { kind: "changed"; to: string; userId: string; nombre: string | null; newEmail: string }

export type AuthDeps = {
  env: AuthEnvValues
  db: AuthKysely
  deliver: (m: AuthDelivery) => Promise<void>
  registroAbierto: () => Promise<boolean>
}

export const SESSION_DAYS = 60
export const MAGIC_LINK_S = 3600
export const VERIFY_EMAIL_S = 86_400
export const RESET_S = 3600

/** Cómo entró (amr de Supabase) según la ruta que abrió la sesión. */
export function amrOf(path: string | undefined): string {
  if (!path) return "password"
  if (path.startsWith("/two-factor/")) return "totp"
  if (path === "/magic-link/verify") return "magiclink"
  if (path.startsWith("/callback/") || path.startsWith("/oauth2/")) return "oauth"
  if (path === "/verify-email" || path === "/reset-password") return "otp"
  return "password"
}

type UserRow = { id: string; email: string; name: string; emailVerified: boolean; banned?: boolean | null; ban_expires?: Date | string | null; raw_user_meta_data?: Record<string, unknown> | null }
const nameOf = (u: { name?: string | null }) => (u.name && u.name.trim()) || null

export function isBanned(u: Pick<UserRow, "banned" | "ban_expires">, now = Date.now()) {
  if (!u.banned) return false
  return !u.ban_expires || new Date(u.ban_expires).getTime() > now
}

/** Lee la cookie `mirai_ref` (referidos: sirve también si se registra con Google). */
function refFromCookie(headers: Headers | undefined): string | undefined {
  const m = /(?:^|;\s*)mirai_ref=([A-Z0-9]{6,12})(?:;|$)/.exec(headers?.get("cookie") ?? "")
  return m?.[1]
}

export function buildAuthOptions(deps: AuthDeps) {
  const { env } = deps
  const options = {
    appName: "Mirai",
    baseURL: env.baseURL,
    basePath: "/api/auth",
    secret: env.secret,
    trustedOrigins: env.trustedOrigins,
    database: { db: deps.db, type: "postgres", schemaName: "auth" },
    telemetry: { enabled: false },
    advanced: {
      cookiePrefix: "mirai",
      useSecureCookies: env.secureCookies,
      database: { generateId: () => randomUUID() },
      // Cloud Run / ALB / Front Door ponen la IP real en x-forwarded-for (y Fastify tiene trustProxy).
      ipAddress: { ipAddressHeaders: ["x-forwarded-for", "x-real-ip"] },
    },
    user: {
      modelName: "users",
      fields: { emailVerified: "email_verified", createdAt: "created_at", updatedAt: "updated_at" },
      additionalFields: {
        raw_user_meta_data: { type: "json", required: false, input: false, returned: false },
        banned: { type: "boolean", required: false, input: false, defaultValue: false },
        ban_expires: { type: "date", required: false, input: false },
        mfa_reactivar: { type: "boolean", required: false, input: false, defaultValue: false },
      },
      changeEmail: {
        enabled: true,
        // Dos pasos (spike: existe en 1.7): primero se aprueba desde el correo ACTUAL y luego se confirma el nuevo.
        sendChangeEmailConfirmation: async ({ user, newEmail, url }: { user: { id: string; email: string; name: string }; newEmail: string; url: string }) => {
          const pending: PendingEmailChange = { newEmail: newEmail.toLowerCase(), step: 0, sentAt: new Date().toISOString() }
          await setPending(deps.db, user.id, pending)
          await deps.deliver({ kind: "change-approve", to: user.email, url, userId: user.id, nombre: nameOf(user), newEmail })
        },
      },
    },
    session: {
      modelName: "sessions",
      fields: { userId: "user_id", expiresAt: "expires_at", ipAddress: "ip_address", userAgent: "user_agent", createdAt: "created_at", updatedAt: "updated_at" },
      expiresIn: SESSION_DAYS * 86_400,
      updateAge: 86_400,
      freshAge: env.freshMin * 60,
      // Caché firmada de 5 min: no se lee la base en cada petición. Cerrar una sesión tarda hasta 5 min en otros equipos.
      cookieCache: { enabled: true, maxAge: 300 },
      additionalFields: {
        aal: { type: "string", required: false, input: false, defaultValue: "aal1" },
        amr: { type: "string", required: false, input: false },
      },
    },
    account: {
      modelName: "accounts",
      fields: {
        userId: "user_id", accountId: "account_id", providerId: "provider_id", accessToken: "access_token", refreshToken: "refresh_token", idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at", refreshTokenExpiresAt: "refresh_token_expires_at", createdAt: "created_at", updatedAt: "updated_at",
      },
      // Entrar con Google con el mismo correo cae en la misma cuenta (como Supabase con identidades vinculadas).
      accountLinking: { enabled: true, trustedProviders: ["google"], allowDifferentEmails: true },
    },
    verification: {
      modelName: "verifications",
      fields: { expiresAt: "expires_at", createdAt: "created_at", updatedAt: "updated_at" },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: PASSWORD_MIN,
      maxPasswordLength: PASSWORD_MAX,
      password: { hash: hashPassword, verify: verifyPassword },
      resetPasswordTokenExpiresIn: RESET_S,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }: { user: UserRow; url: string }) => {
        await deps.deliver({ kind: "reset", to: user.email, url, userId: user.id, nombre: nameOf(user) })
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
      expiresIn: VERIFY_EMAIL_S,
      sendVerificationEmail: async ({ user, url }: { user: UserRow; url: string }) => {
        // El paso 2 del cambio de correo también llega aquí, con el correo NUEVO en `user.email`.
        const p = await getPending(deps.db, user.id)
        if (p && p.newEmail === user.email.toLowerCase()) return deps.deliver({ kind: "change-confirm", to: user.email, url, userId: user.id, nombre: nameOf(user), newEmail: user.email })
        await deps.deliver({ kind: "verify", to: user.email, url, userId: user.id, nombre: nameOf(user) })
      },
    },
    socialProviders: env.google ? { google: { clientId: env.google.clientId, clientSecret: env.google.clientSecret, prompt: "select_account" as const } } : {},
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "rate_limits",
      fields: { lastRequest: "last_request" },
      window: 60,
      max: 100,
      // Límites de intentos por IP (además de los de la API y Cloud Armor/WAF).
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 3600, max: 10 },
        "/sign-in/magic-link": { window: 60, max: 3 },
        "/request-password-reset": { window: 60, max: 3 },
        "/send-verification-email": { window: 60, max: 3 },
        "/change-email": { window: 3600, max: 5 },
        "/two-factor/verify-totp": { window: 60, max: 10 },
        "/two-factor/verify-backup-code": { window: 60, max: 5 },
        "/change-password": { window: 60, max: 5 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // Metadatos que lee handle_new_user() (perfil, preferencias, consentimientos e invitaciones): igual que Supabase.
          before: async (user: { name: string; image?: string | null } & Record<string, unknown>, ctx: { body?: Record<string, unknown>; headers?: Headers } | null) => {
            const b = ctx?.body ?? {}
            const prev = (user.raw_user_meta_data as Record<string, unknown> | undefined) ?? {}
            const nombre: string | undefined = String(b.nombre ?? user.name ?? "").trim() || undefined
            const ref = (typeof b.ref === "string" && /^[A-Z0-9]{6,12}$/.test(b.ref) ? b.ref : undefined) ?? refFromCookie(ctx?.headers)
            const meta = {
              ...prev,
              ...(nombre ? { nombre, full_name: nombre } : {}),
              ...(typeof b.acepta_version === "string" ? { acepta_version: b.acepta_version, acepta_at: new Date().toISOString() } : {}),
              ...(ref ? { ref } : {}),
              ...(user.image ? { avatar_url: user.image } : {}),
            }
            return { data: { ...user, name: nombre ?? user.name ?? "", raw_user_meta_data: meta as Record<string, unknown> } }
          },
        },
      },
      account: {
        create: {
          // Google: el correo de la cuenta (Perfil › Cuentas conectadas) y la foto si aún no tiene (como /auth/callback).
          after: async (account: Record<string, unknown>) => {
            if (account.providerId !== "google" || typeof account.idToken !== "string") return
            const claims = decodeJwt(account.idToken)
            const email = typeof claims.email === "string" ? claims.email.toLowerCase() : null
            const pic = typeof claims.picture === "string" ? claims.picture : null
            if (email) await authDb(deps.db).updateTable("accounts").set({ email }).where("id", "=", String(account.id)).execute()
            if (pic) await sql`update public.profiles set avatar_url = ${pic} where id = ${String(account.userId)}::uuid and coalesce(avatar_url, '') = ''`.execute(deps.db).catch(() => undefined)
          },
        },
      },
      session: {
        create: {
          before: async (session: Record<string, unknown>, ctx: { path?: string } | null) => {
            const u = await authDb(deps.db).selectFrom("users").select(["banned", "ban_expires"]).where("id", "=", String(session.userId)).executeTakeFirst()
            if (u && isBanned(u)) throw APIError.from("FORBIDDEN", { code: "MIRAI_CUENTA_SUSPENDIDA", message: "Cuenta suspendida" })
            const amr = amrOf(ctx?.path)
            // Activó (o re-activó) el segundo factor: ya no hay que pedirle que lo active otra vez.
            if (amr === "totp") await authDb(deps.db).updateTable("users").set({ mfa_reactivar: false }).where("id", "=", String(session.userId)).where("mfa_reactivar", "=", true).execute()
            return { data: { ...session, aal: amr === "totp" ? "aal2" : "aal1", amr } }
          },
        },
      },
    },
    plugins: [
      magicLink({
        disableSignUp: true,
        expiresIn: MAGIC_LINK_S,
        // Sin cuenta no se envía nada (y la respuesta es la misma: no se revela si el correo existe).
        sendMagicLink: async ({ email, url }: { email: string; url: string }) => {
          const u = await authDb(deps.db).selectFrom("users").select(["id", "name"]).where("email", "=", email.toLowerCase()).executeTakeFirst()
          if (!u) return
          await deps.deliver({ kind: "magic", to: email, url, userId: u.id, nombre: nameOf(u) })
        },
      }),
      twoFactor({
        issuer: "Mirai",
        // Quien entró solo con Google (sin contraseña) también puede activarlo; quien tiene contraseña la escribe.
        allowPasswordless: true,
        schema: {
          user: { fields: { twoFactorEnabled: "two_factor_enabled" } },
          twoFactor: { modelName: "two_factors", fields: { userId: "user_id", backupCodes: "backup_codes", failedVerificationCount: "failed_verification_count", lockedUntil: "locked_until" } },
        },
        backupCodeOptions: { amount: 10, length: 10 },
      }),
      // `Authorization: Bearer <token de sesión>` para el SSR de Next, pruebas y clientes nativos (sin cookies).
      bearer(),
      miraiGate({
        webBase: env.baseURL,
        registroAbierto: deps.registroAbierto,
        emailChanged: async ({ userId, oldEmail, newEmail, nombre }) => deps.deliver({ kind: "changed", to: oldEmail, userId, nombre, newEmail }),
      }),
      ...(env.turnstileSecret
        ? [captcha({ provider: "cloudflare-turnstile", secretKey: env.turnstileSecret, endpoints: ["/sign-up/email", "/sign-in/email", "/sign-in/magic-link", "/request-password-reset"] })]
        : []),
    ],
  } satisfies BetterAuthOptions
  return options
}

export function createMiraiAuth(deps: AuthDeps) {
  return betterAuth(buildAuthOptions(deps))
}
export type MiraiAuth = ReturnType<typeof createMiraiAuth>

// ── Cambio de correo pendiente (auth.verifications) ──

async function setPending(db: AuthKysely, userId: string, p: PendingEmailChange) {
  const t = authDb(db)
  await t.deleteFrom("verifications").where("identifier", "=", EMAIL_CHANGE_ID(userId)).execute()
  await t.insertInto("verifications").values({ id: randomUUID(), identifier: EMAIL_CHANGE_ID(userId), value: JSON.stringify(p), expires_at: new Date(Date.now() + VERIFY_EMAIL_S * 1000) }).execute()
}

export async function getPending(db: AuthKysely, userId: string): Promise<(PendingEmailChange & { createdAt: Date }) | null> {
  const r = await authDb(db).selectFrom("verifications").select(["value", "created_at", "expires_at"]).where("identifier", "=", EMAIL_CHANGE_ID(userId)).executeTakeFirst()
  if (!r || new Date(r.expires_at).getTime() < Date.now()) return null
  try {
    return { ...(JSON.parse(r.value) as PendingEmailChange), createdAt: new Date(r.created_at) }
  } catch {
    return null
  }
}

export async function clearPending(db: AuthKysely, userId: string): Promise<boolean> {
  const r = await authDb(db).deleteFrom("verifications").where("identifier", "=", EMAIL_CHANGE_ID(userId)).executeTakeFirst()
  return Number(r.numDeletedRows ?? 0) > 0
}

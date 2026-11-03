// Plugin de Better Auth con las reglas de Mirai que la librería no trae (V7-A):
//
// 1. Registro: `registro_abierto()` y aceptación legal obligatoria (Ley 1581) antes de crear la cuenta.
// 2. Segundo factor también para el enlace mágico, Google y la verificación de correo: el plugin twoFactor solo lo pide
//    en /sign-in/email. Aquí, si la persona tiene TOTP, la sesión recién creada se cambia por el mismo reto de dos
//    factores (cookie firmada `two_factor`) y se la manda a /verificacion. Así nunca hay una sesión sin el segundo
//    factor (en Supabase existía en aal1 y la web la frenaba).
// 3. TOTP heredado de Supabase (`supabase-b32:`): se verifica con la llave base32 (legacy-totp.ts).
// 4. Cambio de correo cancelable: los enlaces de Better Auth son JWT sin estado; guardamos el cambio pendiente en
//    auth.verifications (`mirai-email-change:<userId>`) y un enlace sin pendiente (cancelado) ya no sirve.
// 5. Cuentas suspendidas: no se abre ninguna sesión (databaseHooks en auth.config.ts) y aquí se responde en español.
import { APIError, createAuthMiddleware } from "better-auth/api"
import { deleteSessionCookie, expireCookie, setSessionCookie } from "better-auth/cookies"
import { generateRandomString, symmetricDecrypt } from "better-auth/crypto"
import type { BetterAuthPlugin } from "better-auth"
import { jwtVerify } from "jose"
import { SignUpExtra } from "@mirai/contracts/modules/auth"
import { LEGACY_TOTP_PREFIX, verifyLegacyTotp } from "./legacy-totp"

export const EMAIL_CHANGE_ID = (userId: string) => `mirai-email-change:${userId}`
export type PendingEmailChange = { newEmail: string; step: 0 | 1; sentAt: string }

export type GateDeps = {
  /** Origen de la web (pantalla /verificacion). */
  webBase: string
  registroAbierto: () => Promise<boolean>
  /** Aviso al correo viejo cuando termina un cambio de correo. */
  emailChanged: (o: { userId: string; oldEmail: string; newEmail: string; nombre: string | null }) => Promise<void>
}

const fail = (status: "BAD_REQUEST" | "FORBIDDEN" | "UNAUTHORIZED", code: string, message: string) => APIError.from(status, { code, message })

/** Rutas que abren sesión sin pasar por el reto de dos factores del plugin twoFactor. */
const GATED = new Set(["/magic-link/verify", "/callback/:id", "/verify-email", "/oauth2/callback/:providerId"])

type Ctx = Parameters<Parameters<typeof createAuthMiddleware>[0]>[0]

function locationOf(returned: unknown): string | null {
  const h = (returned as { headers?: Headers } | null)?.headers
  return h instanceof Headers ? h.get("location") : null
}

/** Convierte la sesión recién creada en un reto de dos factores (igual que twoFactor en /sign-in/email). */
async function toTwoFactorChallenge(ctx: Ctx, deps: GateDeps) {
  const data = ctx.context.newSession
  if (!data || !(data.user as { twoFactorEnabled?: boolean }).twoFactorEnabled) return
  const next = (() => {
    const loc = locationOf(ctx.context.returned)
    if (!loc) return "/inicio"
    try {
      const u = new URL(loc, deps.webBase)
      return u.origin === new URL(deps.webBase).origin ? `${u.pathname}${u.search}${u.hash}` : "/inicio"
    } catch {
      return "/inicio"
    }
  })()
  deleteSessionCookie(ctx, true)
  await ctx.context.internalAdapter.deleteSession(data.session.token)
  ctx.context.setNewSession(null)
  const maxAge = 600
  const cookie = ctx.context.createAuthCookie("two_factor", { maxAge })
  const identifier = `2fa-${generateRandomString(20)}`
  const expiresAt = new Date(Date.now() + maxAge * 1000)
  await ctx.context.internalAdapter.createVerificationValue({ value: data.user.id, identifier, expiresAt })
  await ctx.context.internalAdapter.createVerificationValue({ value: "0", identifier: `2fa-attempts-${identifier}`, expiresAt })
  await ctx.setSignedCookie(cookie.name, identifier, ctx.context.secret, cookie.attributes)
  throw ctx.redirect(`${deps.webBase}/verificacion?next=${encodeURIComponent(next)}`)
}

/** /two-factor/verify-totp con un secreto heredado de Supabase (solo en el reto de entrada, sin sesión). */
async function legacyTotp(ctx: Ctx) {
  const cookie = ctx.context.createAuthCookie("two_factor")
  const id = await ctx.getSignedCookie(cookie.name, ctx.context.secret)
  if (!id) return
  const pending = await ctx.context.internalAdapter.findVerificationValue(id)
  if (!pending) return
  const tf = (await ctx.context.adapter.findOne({ model: "twoFactor", where: [{ field: "userId", value: pending.value }] })) as { id: string; secret: string } | null
  if (!tf) return
  let secret: string
  try {
    secret = await symmetricDecrypt({ key: ctx.context.secretConfig, data: tf.secret })
  } catch {
    return
  }
  if (!secret.startsWith(LEGACY_TOTP_PREFIX)) return // secreto nuevo de Better Auth: lo verifica el plugin twoFactor
  const code = String((ctx.body as { code?: unknown } | undefined)?.code ?? "")
  const attemptsId = `2fa-attempts-${id}`
  const attempts = Number((await ctx.context.internalAdapter.findVerificationValue(attemptsId))?.value ?? 0)
  if (attempts >= 5) {
    await ctx.context.internalAdapter.deleteVerificationByIdentifier(id)
    expireCookie(ctx, cookie)
    throw fail("BAD_REQUEST", "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE", "Too many attempts")
  }
  if (!verifyLegacyTotp(secret.slice(LEGACY_TOTP_PREFIX.length), code)) {
    await ctx.context.internalAdapter.deleteVerificationByIdentifier(attemptsId)
    await ctx.context.internalAdapter.createVerificationValue({ identifier: attemptsId, value: String(attempts + 1), expiresAt: pending.expiresAt })
    throw fail("UNAUTHORIZED", "INVALID_CODE", "Invalid code")
  }
  const consumed = await ctx.context.internalAdapter.consumeVerificationValue(id)
  if (!consumed || consumed.value !== pending.value) throw fail("UNAUTHORIZED", "INVALID_TWO_FACTOR_COOKIE", "Invalid two factor cookie")
  const user = await ctx.context.internalAdapter.findUserById(consumed.value)
  if (!user) throw fail("UNAUTHORIZED", "INVALID_TWO_FACTOR_COOKIE", "Invalid two factor cookie")
  const dontRemember = await ctx.getSignedCookie(ctx.context.authCookies.dontRememberToken.name, ctx.context.secret)
  const session = await ctx.context.internalAdapter.createSession(user.id, !!dontRemember)
  if (!session) throw fail("UNAUTHORIZED", "FAILED_TO_CREATE_SESSION", "Failed to create session")
  await setSessionCookie(ctx, { session, user })
  expireCookie(ctx, cookie)
  return ctx.json({ token: session.token, user: { id: user.id, email: user.email, name: user.name, emailVerified: user.emailVerified } })
}

/** Lee el JWT de /verify-email (sin validarlo del todo: eso lo hace Better Auth después). */
async function emailToken(ctx: Ctx): Promise<{ email: string; updateTo?: string; requestType?: string; iat?: number } | null> {
  const token = String((ctx.query as { token?: unknown } | undefined)?.token ?? "")
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(ctx.context.secret), { algorithms: ["HS256"] })
    return payload as { email: string; updateTo?: string; requestType?: string; iat?: number }
  } catch {
    return null
  }
}

async function pendingChange(ctx: Ctx, userId: string): Promise<{ row: { createdAt: Date; value: string; expiresAt: Date }; data: PendingEmailChange } | null> {
  const row = await ctx.context.internalAdapter.findVerificationValue(EMAIL_CHANGE_ID(userId))
  if (!row || row.expiresAt < new Date()) return null
  try {
    return { row, data: JSON.parse(row.value) as PendingEmailChange }
  } catch {
    return null
  }
}

export function miraiGate(deps: GateDeps) {
  return {
    id: "mirai-gate" as const,
    hooks: {
      before: [
        {
          matcher: (c) => c.path === "/sign-up/email",
          handler: createAuthMiddleware(async (ctx) => {
            if (!(await deps.registroAbierto())) throw fail("FORBIDDEN", "MIRAI_REGISTRO_CERRADO", "Registro cerrado")
            const b = (ctx.body ?? {}) as Record<string, unknown>
            const extra = SignUpExtra.safeParse({ nombre: b.nombre ?? b.name, acepta_version: b.acepta_version, ref: b.ref || undefined })
            if (!extra.success) {
              const legal = extra.error.issues.some((i) => i.path[0] === "acepta_version")
              throw legal ? fail("BAD_REQUEST", "MIRAI_ACEPTA_LEGAL", "Debe aceptar") : fail("BAD_REQUEST", "VALIDATION_ERROR", extra.error.issues[0]?.message ?? "Datos inválidos")
            }
          }),
        },
        {
          matcher: (c) => c.path === "/two-factor/verify-totp",
          handler: createAuthMiddleware(async (ctx) => legacyTotp(ctx)),
        },
        {
          // Un enlace de cambio de correo solo sirve si el cambio sigue pendiente (no se canceló ni se pidió otro).
          matcher: (c) => c.path === "/verify-email",
          handler: createAuthMiddleware(async (ctx) => {
            const t = await emailToken(ctx)
            if (!t?.updateTo) return
            const found = await ctx.context.internalAdapter.findUserByEmail(t.email)
            if (!found) return
            const p = await pendingChange(ctx, found.user.id)
            const ok = p && p.data.newEmail === t.updateTo.toLowerCase() && (t.iat ?? 0) * 1000 >= p.row.createdAt.getTime() - 5_000
            if (ok) return
            const cb = (ctx.query as { callbackURL?: string } | undefined)?.callbackURL
            if (cb) throw ctx.redirect(`${new URL(cb, deps.webBase).toString()}${cb.includes("?") ? "&" : "?"}error=MIRAI_ENLACE_CANCELADO`)
            throw fail("BAD_REQUEST", "MIRAI_ENLACE_CANCELADO", "Cambio cancelado")
          }),
        },
      ],
      after: [
        {
          matcher: (c) => GATED.has(c.path ?? ""),
          handler: createAuthMiddleware(async (ctx) => toTwoFactorChallenge(ctx, deps)),
        },
        {
          // Avance del cambio de correo: aprobado desde el correo viejo (step 1) o terminado (se borra y se avisa).
          matcher: (c) => c.path === "/verify-email",
          handler: createAuthMiddleware(async (ctx) => {
            const t = await emailToken(ctx)
            if (!t?.updateTo) return
            const loc = locationOf(ctx.context.returned) ?? ""
            if (/[?&]error=/.test(loc)) return
            if (t.requestType === "change-email-confirmation") {
              const u = await ctx.context.internalAdapter.findUserByEmail(t.email)
              const p = u && (await pendingChange(ctx, u.user.id))
              if (u && p) {
                await ctx.context.internalAdapter.deleteVerificationByIdentifier(EMAIL_CHANGE_ID(u.user.id))
                await ctx.context.internalAdapter.createVerificationValue({ identifier: EMAIL_CHANGE_ID(u.user.id), value: JSON.stringify({ ...p.data, step: 1 }), expiresAt: p.row.expiresAt })
              }
              // Falta el segundo enlace (al correo nuevo): la web lo muestra igual que con Supabase.
              if (/correo(=|%3D)listo/i.test(loc)) throw ctx.redirect(loc.replace(/correo(=|%3D)listo/i, (_m, eq: string) => `correo${eq}falta_otro`))
              return
            }
            if (t.requestType === "change-email-verification") {
              const u = await ctx.context.internalAdapter.findUserByEmail(t.updateTo)
              if (!u) return
              await ctx.context.internalAdapter.deleteVerificationByIdentifier(EMAIL_CHANGE_ID(u.user.id))
              await deps.emailChanged({ userId: u.user.id, oldEmail: t.email, newEmail: t.updateTo, nombre: u.user.name || null }).catch(() => undefined)
            }
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin
}

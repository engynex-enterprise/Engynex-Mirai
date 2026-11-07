// Flujos de auth con AUTH_PROVIDER=mirai (Better Auth). Cada pantalla los usa SOLO si isMiraiAuth(); con `supabase`
// el código de siempre sigue intacto. Devuelven { ok, msg } con mensajes en español (AUTH_ERRORS de @mirai/contracts).
import { authErrorMessage } from "@mirai/contracts/modules/auth"
import { LEGAL_VERSION } from "@/lib/legal/version"

const client = async () => (await import("./client")).authClient()
type BaErr = { code?: string; message?: string; status?: number } | null | undefined
export type Done = { ok: true } | { ok: false; msg: string; code?: string }
const fail = (e: BaErr): Done => ({ ok: false, msg: authErrorMessage(e), code: e?.code })
const captchaHeaders = (token?: string) => (token ? { headers: { "x-captcha-response": token } } : undefined)

export type SignInResult = Done & { twoFactor?: boolean; reactivar?: boolean }

export async function signInPassword(o: { email: string; password: string; remember: boolean; captcha?: string }): Promise<SignInResult> {
  const c = await client()
  const { data, error } = await c.signIn.email({ email: o.email, password: o.password, rememberMe: o.remember }, captchaHeaders(o.captcha))
  if (error) return fail(error)
  const d = data as { twoFactorRedirect?: boolean; user?: { mfa_reactivar?: boolean } } | null
  return { ok: true, twoFactor: !!d?.twoFactorRedirect, reactivar: !!d?.user?.mfa_reactivar }
}

/** Enlace mágico sin crear cuenta (si el correo no tiene cuenta no se envía nada y la respuesta es la misma). */
export async function sendMagicLink(o: { email: string; next: string; captcha?: string }): Promise<Done> {
  const c = await client()
  const { error } = await c.signIn.magicLink({ email: o.email, callbackURL: o.next, errorCallbackURL: "/login?error=enlace" }, captchaHeaders(o.captcha))
  return error ? fail(error) : { ok: true }
}

export async function signInGoogle(next: string): Promise<Done> {
  const c = await client()
  const { error } = await c.signIn.social({ provider: "google", callbackURL: next, errorCallbackURL: "/login?error=google" })
  return error ? fail(error) : { ok: true }
}

/**
 * Dirección de Google para la ventana flotante (sin redirigir esta pestaña). Google vuelve a /auth/google, que avisa a
 * la pestaña de Mirai (BroadcastChannel) y se cierra. Better Auth guarda el `state` en la cookie de este mismo origen.
 */
export async function googleAuthUrl(): Promise<{ ok: true; url: string } | { ok: false; msg: string }> {
  const c = await client()
  const { data, error } = await c.signIn.social({ provider: "google", callbackURL: "/auth/google?listo=1", errorCallbackURL: "/auth/google?error=google", disableRedirect: true })
  if (error) return fail(error) as { ok: false; msg: string }
  const url = (data as { url?: string } | null)?.url
  return url ? { ok: true, url } : { ok: false, msg: "Google no respondió. Intenta de nuevo." }
}

export async function signUp(o: { nombre: string; email: string; password: string; ref?: string | null; captcha?: string }): Promise<Done> {
  const c = await client()
  const body = { email: o.email, password: o.password, name: o.nombre, nombre: o.nombre, acepta_version: LEGAL_VERSION, ...(o.ref ? { ref: o.ref } : {}), callbackURL: "/bienvenida" }
  const { error } = await c.signUp.email(body as Parameters<typeof c.signUp.email>[0], captchaHeaders(o.captcha))
  return error ? fail(error) : { ok: true }
}

/** Configuración pública (registro abierto, Google, captcha). La sirve app/auth/config/route.ts. */
export async function authConfig(): Promise<{ registroAbierto: boolean; google: boolean; captcha: boolean }> {
  try {
    const r = await fetch("/auth/config", { cache: "no-store" })
    if (r.ok) return await r.json()
  } catch { /* sin red: se asume abierto */ }
  return { registroAbierto: true, google: true, captcha: false }
}

export async function verifyTotp(code: string, trustDevice = false): Promise<Done> {
  const c = await client()
  const { error } = await c.twoFactor.verifyTotp({ code, trustDevice })
  return error ? fail(error) : { ok: true }
}

export async function verifyBackupCode(code: string): Promise<Done> {
  const c = await client()
  const { error } = await c.twoFactor.verifyBackupCode({ code })
  return error ? fail(error) : { ok: true }
}

export async function requestPasswordReset(email: string): Promise<Done> {
  const c = await client()
  const { error } = await c.requestPasswordReset({ email, redirectTo: "/actualizar-clave" })
  return error ? fail(error) : { ok: true }
}

export async function resetPassword(token: string, newPassword: string): Promise<Done> {
  const c = await client()
  const { error } = await c.resetPassword({ token, newPassword })
  return error ? fail(error) : { ok: true }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<Done> {
  const c = await client()
  const { error } = await c.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })
  return error ? fail(error) : { ok: true }
}

export async function signOut(): Promise<void> {
  const c = await client()
  await c.signOut().catch(() => undefined)
}

export async function signOutOthers(): Promise<Done> {
  const c = await client()
  const { error } = await c.revokeOtherSessions()
  return error ? fail(error) : { ok: true }
}

export type MiraiUser = { id: string; email: string; twoFactorEnabled?: boolean; mfa_reactivar?: boolean; image?: string | null }

export async function currentUser(): Promise<MiraiUser | null> {
  const c = await client()
  const { data } = await c.getSession({ query: { disableCookieCache: true } })
  return (data?.user as MiraiUser | undefined) ?? null
}

export async function mfaEnable(password?: string): Promise<(Done & { uri?: string; secret?: string; backupCodes?: string[] })> {
  const c = await client()
  const { data, error } = await c.twoFactor.enable(password ? { password } : ({} as { password: string }))
  if (error) return fail(error)
  const uri = (data as { totpURI?: string }).totpURI ?? ""
  return { ok: true, uri, secret: uri ? (new URL(uri).searchParams.get("secret") ?? "") : "", backupCodes: (data as { backupCodes?: string[] }).backupCodes ?? [] }
}

export async function mfaDisable(password?: string): Promise<Done> {
  const c = await client()
  const { error } = await c.twoFactor.disable(password ? { password } : ({} as { password: string }))
  return error ? fail(error) : { ok: true }
}

export async function newBackupCodes(password?: string): Promise<Done & { codes?: string[] }> {
  const c = await client()
  const { data, error } = await c.twoFactor.generateBackupCodes(password ? { password } : ({} as { password: string }))
  return error ? fail(error) : { ok: true, codes: (data as { backupCodes?: string[] }).backupCodes ?? [] }
}

export async function linkGoogle(callbackURL: string): Promise<Done> {
  const c = await client()
  const { error } = await c.linkSocial({ provider: "google", callbackURL, errorCallbackURL: `${callbackURL.split("#")[0]}${callbackURL.includes("?") ? "&" : "?"}cuentas=error#cuentas` })
  return error ? fail(error) : { ok: true }
}

/** Formas de entrar (como getUserIdentities de Supabase: provider + identity_data). */
export async function identities(): Promise<{ provider: string; identity_data: Record<string, unknown> }[]> {
  const c = await client()
  const { data } = await c.listAccounts()
  const user = await currentUser()
  return ((data ?? []) as { providerId: string }[]).map((a) => ({ provider: a.providerId === "credential" ? "email" : a.providerId, identity_data: a.providerId === "google" && user?.image ? { avatar_url: user.image } : {} }))
}

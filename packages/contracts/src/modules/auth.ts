// Módulo `auth` (v7, frentes V7-0/V7-A; docs/arquitectura/v7-gcp-total.md §3.1). Dueño: V7-A.
//
// Dos partes:
// 1. Lo que monta Better Auth en la API bajo `/api/auth/*` (mismo origen que la web, cookie httpOnly). No es ts-rest:
//    lo usa `better-auth/client` desde la web. Las rutas están en AUTH_ROUTES (para el balanceador, la CSP y las pruebas).
// 2. Lo que Better Auth no trae y es de Mirai (este contrato ts-rest): configuración pública de la pantalla de entrar,
//    consentimientos (Ley 1581), crear contraseña si entró con Google, estado del segundo factor (re-enrolar) y las
//    sesiones de una persona desde la consola.
// Los mensajes de error de Better Auth se traducen con AUTH_ERRORS (español de Colombia, tuteo).
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ApiError, ApiOk, COMMON_ERRORS, Uuid } from "../common"

export const meta = { id: "auth", owner: "V7-A" } as const

export const AUTH_ERRORS_HTTP = { ...COMMON_ERRORS, 409: ApiError, 502: ApiError, 503: ApiError } as const

/** Proveedor de identidad activo (interruptor de tiempo de ejecución, §3.1.5). `supabase` = como hoy. */
export const AuthProvider = z.enum(["supabase", "mirai"])
export type AuthProvider = z.infer<typeof AuthProvider>

/** Prefijo donde Better Auth monta su handler (mismo origen que la web: el balanceador lo enruta a la API). */
export const AUTH_BASE_PATH = "/api/auth"

/** Nombre de la cookie de sesión (prefijo `mirai`; en https Better Auth le antepone `__Secure-`). */
export const AUTH_COOKIE = "mirai.session_token"
export const AUTH_COOKIE_SECURE = `__Secure-${AUTH_COOKIE}`

/** Rutas de Better Auth que usa Mirai (relativas a AUTH_BASE_PATH). Cualquier otra responde 404 en la API. */
export const AUTH_ROUTES = {
  signUpEmail: "/sign-up/email",
  signInEmail: "/sign-in/email",
  signInSocial: "/sign-in/social",
  callbackGoogle: "/callback/google",
  signInMagicLink: "/sign-in/magic-link",
  verifyMagicLink: "/magic-link/verify",
  verifyEmail: "/verify-email",
  sendVerificationEmail: "/send-verification-email",
  requestPasswordReset: "/request-password-reset",
  resetPassword: "/reset-password",
  changePassword: "/change-password",
  changeEmail: "/change-email",
  getSession: "/get-session",
  signOut: "/sign-out",
  listSessions: "/list-sessions",
  revokeSession: "/revoke-session",
  revokeOtherSessions: "/revoke-other-sessions",
  revokeSessions: "/revoke-sessions",
  listAccounts: "/list-accounts",
  linkSocial: "/link-social",
  unlinkAccount: "/unlink-account",
  twoFactorEnable: "/two-factor/enable",
  twoFactorDisable: "/two-factor/disable",
  twoFactorVerifyTotp: "/two-factor/verify-totp",
  twoFactorVerifyBackup: "/two-factor/verify-backup-code",
  twoFactorBackupCodes: "/two-factor/generate-backup-codes",
} as const

/**
 * Códigos de Better Auth (`error.code`) → mensaje para la persona. Lo que no esté aquí muestra AUTH_FALLBACK.
 * Los de Mirai (MIRAI_*) los lanza el plugin `mirai-gate` de la API.
 */
export const AUTH_ERRORS: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "El correo o la contraseña no coinciden.",
  INVALID_EMAIL: "Escribe un correo válido.",
  INVALID_PASSWORD: "La contraseña no es correcta.",
  EMAIL_NOT_VERIFIED: "Aún no confirmas tu correo. Revisa tu bandeja de entrada: te reenviamos el enlace.",
  USER_ALREADY_EXISTS: "Ya existe una cuenta con ese correo. Entra o recupera tu contraseña.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: "Ya existe una cuenta con ese correo. Entra o recupera tu contraseña.",
  PASSWORD_TOO_SHORT: "La contraseña es muy corta: usa al menos 10 caracteres.",
  PASSWORD_TOO_LONG: "La contraseña es demasiado larga (máximo 128 caracteres).",
  USER_NOT_FOUND: "No encontramos esa cuenta.",
  INVALID_TOKEN: "El enlace no es válido o ya venció. Pide uno nuevo.",
  TOKEN_EXPIRED: "El enlace venció. Pide uno nuevo.",
  SESSION_EXPIRED: "Por seguridad, vuelve a entrar y repite el cambio.",
  FAILED_TO_CREATE_USER: "No pudimos crear tu cuenta. Intenta de nuevo en un momento.",
  FAILED_TO_CREATE_SESSION: "No pudimos abrir tu sesión. Intenta de nuevo.",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "Aún no tienes contraseña. Créala en Perfil › Cuentas conectadas.",
  PASSWORD_ALREADY_SET: "Ya tienes una contraseña. Cámbiala en vez de crear otra.",
  USER_ALREADY_HAS_PASSWORD: "Ya tienes una contraseña. Cámbiala en vez de crear otra.",
  SESSION_NOT_FRESH: "Por seguridad, vuelve a entrar y repite el cambio.",
  LINKED_ACCOUNT_ALREADY_EXISTS: "Esa cuenta de Google ya está conectada a otra cuenta de Mirai.",
  EMAIL_ALREADY_VERIFIED: "Tu correo ya está confirmado. Entra normalmente.",
  MISSING_RESPONSE: "Espera un momento: estamos verificando que no eres un robot.",
  SOCIAL_ACCOUNT_ALREADY_LINKED: "Esa cuenta de Google ya está conectada a otra cuenta de Mirai.",
  ACCOUNT_NOT_FOUND: "Esa forma de entrar ya no está conectada.",
  FAILED_TO_UNLINK_LAST_ACCOUNT: "Es tu única forma de entrar. Agrega otra antes de quitarla.",
  EMAIL_CAN_NOT_BE_UPDATED: "No pudimos cambiar el correo.",
  CHANGE_EMAIL_DISABLED: "El cambio de correo no está disponible.",
  INVALID_CODE: "El código no es válido. Revisa la hora de tu celular y vuelve a intentar.",
  INVALID_TWO_FACTOR_COOKIE: "Tu verificación venció. Vuelve a entrar.",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "Hiciste demasiados intentos. Vuelve a entrar para pedir otro código.",
  ACCOUNT_TEMPORARILY_LOCKED: "Por seguridad bloqueamos la verificación unos minutos. Intenta más tarde.",
  TWO_FACTOR_NOT_ENABLED: "La verificación en dos pasos no está activada.",
  BACKUP_CODES_NOT_ENABLED: "No tienes códigos de respaldo.",
  INVALID_BACKUP_CODE: "Ese código de respaldo no es válido o ya lo usaste.",
  TOO_MANY_REQUESTS: "Hiciste demasiados intentos. Espera un minuto y vuelve a intentar.",
  VERIFICATION_FAILED: "No pudimos verificar que no eres un robot. Recarga la página e intenta de nuevo.",
  INVALID_ORIGIN: "Abre Mirai desde su dirección oficial e intenta de nuevo.",
  MIRAI_REGISTRO_CERRADO: "El registro está cerrado por ahora. Vuelve pronto.",
  MIRAI_ACEPTA_LEGAL: "Debes aceptar los Términos y la Política de privacidad para crear tu cuenta.",
  MIRAI_CUENTA_SUSPENDIDA: "Tu cuenta está suspendida. Escríbenos si crees que es un error.",
  MIRAI_ENLACE_CANCELADO: "Cancelaste ese cambio de correo: el enlace ya no sirve.",
  MIRAI_SIN_CUENTA: "No hay una cuenta con ese correo. Crea una gratis.",
}
export const AUTH_FALLBACK = "Algo salió mal. Intenta de nuevo en un momento."

/** Mensaje en español para un error de Better Auth ({ code, message, status }). */
export function authErrorMessage(e: { code?: string | null; message?: string | null; status?: number } | null | undefined): string {
  if (!e) return AUTH_FALLBACK
  if (e.code && AUTH_ERRORS[e.code]) return AUTH_ERRORS[e.code]
  if (e.status === 429) return AUTH_ERRORS.TOO_MANY_REQUESTS
  return AUTH_FALLBACK
}

/** Reglas de la contraseña (las mismas de la web: password-meter). */
export const PASSWORD_MIN = 10
export const PASSWORD_MAX = 128

/** Datos extra del registro (Ley 1581: `acepta_version` es obligatorio; `ref` = código de referido). */
export const SignUpExtra = z.object({
  nombre: z.string().trim().min(2, "Escribe tu nombre").max(120),
  acepta_version: z.string().regex(/^\d{4}-\d{2}-\d{2}(\.\d+)?$/, "Debes aceptar los Términos y la Política de privacidad"),
  ref: z.string().regex(/^[A-Z0-9]{6,12}$/).optional(),
})
export type SignUpExtra = z.infer<typeof SignUpExtra>

export const AuthConfig = z.object({
  provider: AuthProvider,
  /** platform_settings.registro_abierto (pantalla "El registro está cerrado"). */
  registroAbierto: z.boolean(),
  google: z.boolean(),
  /** Hay Turnstile: la web manda `x-captcha-response`. */
  captcha: z.boolean(),
  passwordMin: z.number(),
})
export type AuthConfig = z.infer<typeof AuthConfig>

export const Consent = z.object({ document: z.string(), version: z.string(), accepted_at: z.string() })
export const Consents = z.object({ /** Última versión aceptada de los términos ("" si nunca). */ version: z.string(), items: z.array(Consent) })
export type Consents = z.infer<typeof Consents>
export const AcceptConsent = z.object({ version: z.string().regex(/^\d{4}-\d{2}-\d{2}(\.\d+)?$/, "Versión inválida") })

export const SetPassword = z.object({ newPassword: z.string().min(PASSWORD_MIN, "La contraseña es muy corta: usa al menos 10 caracteres").max(PASSWORD_MAX) })

/** Segundo factor de la persona. `reactivar`: su TOTP de Supabase no se pudo migrar y debe activarlo otra vez. */
export const MfaStatus = z.object({ enabled: z.boolean(), reactivar: z.boolean(), backupCodes: z.boolean(), aal: z.enum(["aal1", "aal2"]) })
export type MfaStatus = z.infer<typeof MfaStatus>

export const AdminSession = z.object({ id: z.string(), created_at: z.string(), last_active: z.string().nullable(), user_agent: z.string().nullable(), ip: z.string().nullable(), aal: z.string().nullable(), expires_at: z.string() })
export type AdminSession = z.infer<typeof AdminSession>

const Msg = z.object({ msg: z.string() })
const c = initContract()
export const authContract = c.router(
  {
    config: { method: "GET", path: "/v1/auth/config", responses: { ...AUTH_ERRORS_HTTP, 200: AuthConfig }, summary: "Pública: proveedor activo, registro abierto, Google y captcha" },
    consents: { method: "GET", path: "/v1/me/consents", responses: { ...AUTH_ERRORS_HTTP, 200: Consents }, summary: "Tus aceptaciones de los Términos y la Política (Ley 1581)" },
    acceptConsent: { method: "POST", path: "/v1/me/consents", body: AcceptConsent, responses: { ...AUTH_ERRORS_HTTP, 200: ApiOk(Msg) }, summary: "Acepta una versión nueva de los Términos y la Política" },
    setPassword: { method: "POST", path: "/v1/auth/password", body: SetPassword, responses: { ...AUTH_ERRORS_HTTP, 200: ApiOk(Msg) }, summary: "Crea tu contraseña si entraste solo con Google (409 si ya tienes)" },
    mfa: { method: "GET", path: "/v1/auth/mfa", responses: { ...AUTH_ERRORS_HTTP, 200: MfaStatus }, summary: "Estado de tu verificación en dos pasos" },
    adminSessions: { method: "GET", path: "/v1/admin/users/:userId/sessions", pathParams: z.object({ userId: Uuid }), responses: { ...AUTH_ERRORS_HTTP, 200: z.array(AdminSession) }, summary: "Consola: sesiones abiertas de una persona" },
    adminRevokeSessions: { method: "DELETE", path: "/v1/admin/users/:userId/sessions", pathParams: z.object({ userId: Uuid }), body: c.noBody(), responses: { ...AUTH_ERRORS_HTTP, 200: ApiOk(Msg.extend({ cerradas: z.number() })) }, summary: "Consola: cierra todas las sesiones de una persona" },
  },
  { strictStatusCodes: true },
)

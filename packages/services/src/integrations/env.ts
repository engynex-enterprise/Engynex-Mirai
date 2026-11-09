// Integraciones que el DESPLIEGUE enciende con sus variables de entorno (Dokploy › Environment), sin que nadie entre a
// la consola: correo, WhatsApp y Telegram. Así los avisos, las invitaciones y los correos de la cuenta (verificación,
// recuperación de clave, enlace mágico) funcionan para todos los hogares desde el primer arranque, igual que la IA con
// AI_GATEWAY_API_KEY.
//
// Reglas:
// - Solo las que configura el administrador (nunca la IA del hogar): la IA se resuelve aparte, con sus propios modos.
// - Si falta un dato obligatorio (la clave, el remitente, el número), la integración NO se enciende: es preferible el
//   mensaje "no hay correo activo" a un envío que falla en silencio.
// - Lo que se guarde en consola › Integraciones globales manda sobre estas variables (ver getGlobalIntegration).
// Puro: recibe cómo leer las variables, así se prueba sin tocar process.env.

export type EnvIntegration = { config: Record<string, unknown>; secrets: Record<string, string> }
export type EnvReader = (name: string) => string | undefined

/** Valor limpio de una variable, o undefined si está vacía (Dokploy deja "" cuando no la llenas). */
const val = (read: EnvReader, name: string) => {
  const v = read(name)?.trim()
  return v || undefined
}

/** Remitente común de todos los proveedores de correo: MAIL_FROM, o el de los correos de la cuenta. */
const from = (read: EnvReader) => val(read, "MAIL_FROM") ?? val(read, "AUTH_MAIL_FROM")
const fromName = (read: EnvReader) => val(read, "MAIL_FROM_NAME") ?? "Mirai"

/** Correo por API (Resend, Brevo, SendGrid): una clave y un remitente. */
const mailApi = (keyVar: string) => (read: EnvReader): EnvIntegration | null => {
  const apiKey = val(read, keyVar)
  const f = from(read)
  if (!apiKey || !f) return null
  return { config: { from: f, fromName: fromName(read) }, secrets: { apiKey } }
}

const si = (v: string | undefined, def: boolean) => (v === undefined ? def : !/^(0|false|no)$/i.test(v))

const BUILDERS: Record<string, (read: EnvReader) => EnvIntegration | null> = {
  email_resend: mailApi("RESEND_API_KEY"),
  email_brevo: mailApi("BREVO_API_KEY"),
  email_sendgrid: mailApi("SENDGRID_API_KEY"),

  email_gmail: (read) => {
    const user = val(read, "GMAIL_USER")
    const pass = val(read, "GMAIL_APP_PASSWORD")
    if (!user || !pass) return null
    return { config: { user, fromName: fromName(read) }, secrets: { pass } }
  },

  email_smtp: (read) => {
    const host = val(read, "SMTP_HOST")
    const user = val(read, "SMTP_USER")
    const pass = val(read, "SMTP_PASS")
    const f = from(read)
    if (!host || !user || !pass || !f) return null
    return {
      config: { host, port: Number(val(read, "SMTP_PORT") ?? 465) || 465, secure: si(val(read, "SMTP_SECURE"), true), user, from: f, fromName: fromName(read) },
      secrets: { pass },
    }
  },

  whatsapp: (read) => {
    const token = val(read, "WHATSAPP_TOKEN")
    const phoneId = val(read, "WHATSAPP_PHONE_ID")
    if (!token || !phoneId) return null
    const wabaId = val(read, "WHATSAPP_WABA_ID")
    return {
      config: { phoneId, ...(wabaId ? { wabaId } : {}), template: val(read, "WHATSAPP_TEMPLATE") ?? "mirai_resumen", lang: val(read, "WHATSAPP_LANG") ?? "es_CO" },
      secrets: { token },
    }
  },

  telegram: (read) => {
    const botToken = val(read, "TELEGRAM_BOT_TOKEN")
    if (!botToken) return null
    const botName = val(read, "TELEGRAM_BOT_NAME")
    return { config: botName ? { botName } : {}, secrets: { botToken } }
  },
}

/** Integraciones que se pueden encender con variables del despliegue. */
export const ENV_INTEGRATION_KINDS = Object.keys(BUILDERS)

/** Todas las variables que lee este archivo (para el compose, el .env.example y la ayuda de la consola). */
export const ENV_INTEGRATION_VARS = [
  "MAIL_FROM", "MAIL_FROM_NAME", "AUTH_MAIL_FROM",
  "RESEND_API_KEY", "BREVO_API_KEY", "SENDGRID_API_KEY",
  "GMAIL_USER", "GMAIL_APP_PASSWORD",
  "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS",
  "WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID", "WHATSAPP_WABA_ID", "WHATSAPP_TEMPLATE", "WHATSAPP_LANG",
  "TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_NAME",
] as const

/**
 * Combina lo del despliegue con lo guardado en la consola: lo guardado manda campo a campo, y lo que quedó vacío sale
 * de las variables del servidor. Así el administrador puede cambiar solo el remitente sin volver a pegar la clave.
 */
export function mergeEnv<T extends Record<string, unknown>>(env: T | undefined, guardado: T | undefined): T {
  const out = { ...(env ?? {}) } as Record<string, unknown>
  for (const [k, v] of Object.entries(guardado ?? {})) if (v !== undefined && v !== null && v !== "") out[k] = v
  return out as T
}

/**
 * Configuración y secretos de una integración tomados de las variables del despliegue, o null si no están completos.
 * `read` es rt().env en la API (lista blanca de ServicesEnv) y un objeto fijo en las pruebas.
 */
export function integrationFromEnv(kind: string, read: EnvReader): EnvIntegration | null {
  return BUILDERS[kind]?.(read) ?? null
}

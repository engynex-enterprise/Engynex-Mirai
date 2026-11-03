// Variables del auth propio (v7, V7-A). Se validan aparte del esquema del núcleo (core/config, frente V7-F) para no
// pisar archivos compartidos; el patrón es el mismo: zod, mensajes que nombran la variable y nunca su valor.
//
//   AUTH_PROVIDER         supabase (por defecto: todo como hoy) | mirai (Better Auth en /api/auth/*)
//   BETTER_AUTH_SECRET    Secret Manager. 32+ caracteres. Firma cookies y cifra los secretos TOTP. NUNCA cambiarla.
//   BETTER_AUTH_URL       origen público de la web (mismo origen: el balanceador manda /api/auth/* a la API)
//   AUTH_DATABASE_URL     Postgres con el esquema `auth` (si falta, DATABASE_URL)
//   AUTH_TRUSTED_ORIGINS  orígenes de la web (coma; si falta, WEB_ORIGINS)
//   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET   "Entrar con Google" (el cliente OAuth de siempre)
//   TURNSTILE_SECRET_KEY  Cloudflare Turnstile (si falta, sin captcha)
//   AUTH_MAIL_DRIVER      services (proveedor de la plataforma) | log (local: escribe el enlace en el log) | memory
//   AUTH_MAIL_FROM        remitente (no-responder@mirai.engynex.com)
//   AUTH_SUPPORT_URL      enlace "escríbenos" de los correos
import { Injectable } from "@nestjs/common"
import { z } from "zod"

const list = z
  .string()
  .optional()
  .transform((v) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean))
const opt = z.string().trim().min(1).optional()

export const AuthEnvSchema = z
  .object({
    MIRAI_ENV: z.enum(["local", "pruebas", "produccion"]).default("local"),
    AUTH_PROVIDER: z.enum(["supabase", "mirai"]).default("supabase"),
    BETTER_AUTH_SECRET: opt,
    BETTER_AUTH_URL: z.url({ error: "Debe ser una URL (https://…)" }).optional(),
    AUTH_DATABASE_URL: opt,
    DATABASE_URL: opt,
    AUTH_TRUSTED_ORIGINS: list,
    WEB_ORIGINS: list,
    GOOGLE_CLIENT_ID: opt,
    GOOGLE_CLIENT_SECRET: opt,
    TURNSTILE_SECRET_KEY: opt,
    AUTH_MAIL_DRIVER: z.enum(["services", "log", "memory"]).optional(),
    AUTH_MAIL_FROM: z.string().default("no-responder@mirai.engynex.com"),
    AUTH_SUPPORT_URL: z.string().default("https://mirai.engynex.com/ayuda"),
    /** Minutos de "entraste hace poco" (quitar métodos, cambiar correo). */
    AUTH_FRESH_MIN: z.coerce.number().int().min(1).default(60),
  })
  .transform((e, ctx) => {
    const on = e.AUTH_PROVIDER === "mirai"
    const remote = e.MIRAI_ENV !== "local"
    const need = (cond: unknown, path: string, message: string) => {
      if (!cond) ctx.addIssue({ code: "custom", path: [path], message })
    }
    const dbUrl = e.AUTH_DATABASE_URL ?? e.DATABASE_URL
    if (on) {
      need(e.BETTER_AUTH_SECRET && e.BETTER_AUTH_SECRET.length >= 32, "BETTER_AUTH_SECRET", "AUTH_PROVIDER=mirai necesita BETTER_AUTH_SECRET (32+ caracteres, Secret Manager)")
      need(dbUrl, "AUTH_DATABASE_URL", "AUTH_PROVIDER=mirai necesita AUTH_DATABASE_URL o DATABASE_URL")
      if (remote) need(e.BETTER_AUTH_URL, "BETTER_AUTH_URL", "AUTH_PROVIDER=mirai necesita BETTER_AUTH_URL (origen público de la web)")
    }
    const baseURL = (e.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "")
    const origins = e.AUTH_TRUSTED_ORIGINS.length ? e.AUTH_TRUSTED_ORIGINS : e.WEB_ORIGINS.length ? e.WEB_ORIGINS : [baseURL]
    return {
      env: e.MIRAI_ENV,
      provider: e.AUTH_PROVIDER,
      enabled: on,
      secret: e.BETTER_AUTH_SECRET ?? "",
      baseURL,
      /** Cookies `__Secure-` y Secure solo en https. */
      secureCookies: baseURL.startsWith("https://"),
      dbUrl: dbUrl ?? "",
      trustedOrigins: [...new Set([baseURL, ...origins])],
      google: e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET ? { clientId: e.GOOGLE_CLIENT_ID, clientSecret: e.GOOGLE_CLIENT_SECRET } : null,
      turnstileSecret: e.TURNSTILE_SECRET_KEY ?? null,
      mailDriver: e.AUTH_MAIL_DRIVER ?? (remote ? "services" : "log"),
      mailFrom: e.AUTH_MAIL_FROM,
      supportUrl: e.AUTH_SUPPORT_URL,
      freshMin: e.AUTH_FRESH_MIN,
    }
  })

export type AuthEnvValues = z.output<typeof AuthEnvSchema>

/** Lee y valida las variables. Lanza con la lista de problemas (solo nombres de variables). */
export function loadAuthEnv(env: NodeJS.ProcessEnv = process.env): AuthEnvValues {
  const r = AuthEnvSchema.safeParse(env)
  if (!r.success) throw new Error(`Configuración inválida del auth:\n${r.error.issues.map((i) => `  - ${i.path.join(".") || "(entorno)"}: ${i.message}`).join("\n")}`)
  return r.data
}

/** Proveedor inyectable (las pruebas lo cambian con `useValue`). */
@Injectable()
export class AuthEnv {
  readonly values: AuthEnvValues
  constructor() {
    this.values = loadAuthEnv()
  }
}

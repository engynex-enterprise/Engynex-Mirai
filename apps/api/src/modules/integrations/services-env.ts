// Variables de F2-E (avisos, integraciones, Google y trabajos), validadas con zod al arrancar el módulo. Se leen aparte
// del esquema del núcleo (core/config) para no tocar un archivo compartido: los nombres coinciden con los de la web y
// con los que define Terraform (infra/terraform/stack/services.tf). Nunca se registran sus valores.
import { z } from "zod"
import { AI_PLATFORM_ENV } from "@mirai/ai/providers/env"
import { ENV_INTEGRATION_VARS } from "@mirai/services/integrations/env"

/** Vacío = sin definir (Terraform pone "" cuando falta un valor público). */
const blank = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v)
const opt = z.preprocess(blank, z.string().trim().optional())
const url = z.preprocess(blank, z.url({ error: "Debe ser una URL (https://…)" }).optional())
const bool = (def: boolean) =>
  z
    .enum(["1", "0", "true", "false", "si", "no", ""])
    .optional()
    .transform((v) => (v === undefined || v === "" ? def : v === "1" || v === "true" || v === "si"))

export const ServicesEnvSchema = z
  .object({
    MIRAI_ENV: z.enum(["local", "pruebas", "produccion"]).default("local"),
    PORT: z.coerce.number().int().default(8080),
    /** Dirección de la web (enlaces de correos, avisos y regreso de Google). */
    SITE_URL: url,
    NEXT_PUBLIC_SITE_URL: url,
    /** Dirección pública de esta API (callback de Google). Terraform: API_PUBLIC_URL; núcleo: API_BASE_URL. */
    API_PUBLIC_URL: url,
    API_BASE_URL: url,
    GOOGLE_CLIENT_ID: opt,
    /** Secret Manager. */
    GOOGLE_CLIENT_SECRET: opt,
    /** Secret Manager. Llave HMAC del `state` de OAuth (32+ caracteres). */
    GOOGLE_OAUTH_STATE_KEY: z.preprocess(blank, z.string().min(32, "GOOGLE_OAUTH_STATE_KEY debe tener al menos 32 caracteres").optional()),
    VAPID_PUBLIC_KEY: opt,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: opt,
    /** Secret Manager. */
    VAPID_PRIVATE_KEY: opt,
    VAPID_SUBJECT: opt,
    /** Secret Manager. Habilita el AI Gateway sin configurarlo en la consola (envReady del registro). */
    AI_GATEWAY_API_KEY: opt,
    /** ¿El tick encola también las tareas diarias (6 y 9 a. m.)? Apágalo si Cloud Scheduler ya las llama aparte. */
    TICK_DAILY_TASKS: bool(true),
    /** ¿Encolar automations/book/:b después de cada escritura de la API (outbox)? */
    AUTOMATIONS_OUTBOX: bool(true),
    /** IA de la plataforma (V7-P): AI_PLATFORM_PROVIDER y credenciales de Vertex, Bedrock y Azure (packages/ai/src/providers/env.ts). */
    ...(Object.fromEntries(AI_PLATFORM_ENV.map((k) => [k, opt])) as Record<(typeof AI_PLATFORM_ENV)[number], typeof opt>),
    /**
     * Correo, WhatsApp y Telegram del despliegue (packages/services/src/integrations/env.ts): con ellas los avisos y
     * los correos de la cuenta quedan ACTIVOS para todos los hogares sin pasar por consola › Integraciones globales.
     */
    ...(Object.fromEntries(ENV_INTEGRATION_VARS.map((k) => [k, opt])) as Record<(typeof ENV_INTEGRATION_VARS)[number], typeof opt>),
  })
  .transform((e) => {
    const site = (e.SITE_URL ?? e.NEXT_PUBLIC_SITE_URL ?? (e.MIRAI_ENV === "produccion" ? "https://mirai.engynex.com" : e.MIRAI_ENV === "pruebas" ? "https://engynex-mirai-pruebas.vercel.app" : "http://localhost:3000")).replace(/\/+$/, "")
    const publicSite = /^https:\/\//.test(site) && !/localhost|127\.0\.0\.1/.test(site) ? site : "https://mirai.engynex.com"
    const vars: Record<string, string | undefined> = {
      GOOGLE_CLIENT_ID: e.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: e.GOOGLE_CLIENT_SECRET,
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: e.VAPID_PUBLIC_KEY ?? e.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY: e.VAPID_PRIVATE_KEY,
      VAPID_SUBJECT: e.VAPID_SUBJECT,
      AI_GATEWAY_API_KEY: e.AI_GATEWAY_API_KEY,
      ...Object.fromEntries(AI_PLATFORM_ENV.map((k) => [k, e[k]])),
      ...Object.fromEntries(ENV_INTEGRATION_VARS.map((k) => [k, e[k]])),
    }
    return {
      siteUrl: site,
      publicSiteUrl: publicSite,
      apiPublicUrl: (e.API_PUBLIC_URL ?? e.API_BASE_URL ?? `http://localhost:${e.PORT}`).replace(/\/+$/, ""),
      googleStateKey: e.GOOGLE_OAUTH_STATE_KEY,
      tickDailyTasks: e.TICK_DAILY_TASKS,
      automationsOutbox: e.AUTOMATIONS_OUTBOX,
      /** Lo que @mirai/services pide con rt().env(nombre), con los nombres de la web. */
      vars,
    }
  })

export type ServicesEnvValues = z.output<typeof ServicesEnvSchema>

/** Configuración de F2-E inyectable (CoreModule no la conoce). En las pruebas se reemplaza con valores fijos. */
export abstract class ServicesEnv {
  abstract readonly values: ServicesEnvValues
}

/** Lee y valida process.env. Lanza con el nombre de la variable (nunca su valor). */
export function loadServicesEnv(env: NodeJS.ProcessEnv = process.env): ServicesEnvValues {
  const r = ServicesEnvSchema.safeParse(env)
  if (!r.success) throw new Error(`Configuración inválida de avisos e integraciones: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`)
  return r.data
}

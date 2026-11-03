// Contexto de ejecución de @mirai/services. Cada app lo configura UNA vez al cargar:
// - apps/web/lib/services.ts: supabaseAdmin(), process.env, @/lib/crypto, siteUrl() y loadBookData de la web;
// - apps/api (IntegrationsModule): el cliente de SystemScope, la configuración validada y CryptoService.
// Así el mismo código de avisos, integraciones y Google corre en Next y en la API, y las pruebas lo cambian por dobles.
// Solo servidor (lo que importa este archivo puede tocar la clave secreta).
import type { DbClient } from "@mirai/db"
import type { LoadedBook } from "@mirai/domain/book-data"

/**
 * Cliente de datos con permisos del servidor (salta RLS): `.from()` / `.rpc()` de PostgREST. En la web es
 * supabaseAdmin() (SupabaseClient); en la API, el SystemScope de SupabaseJsFactory o el PostgREST interno (v7, V7-D).
 */
export type Db = DbClient

/** Lo que necesita una automatización con un nodo de IA (lib/ai/run.ts de la web; F2-F lo lleva a la API). */
export type AiTextInput = { householdId: string; bookId: string; userId: string | null; feature: string; system: string; prompt: string; maxOutputTokens?: number }

export type ServicesRuntime = {
  /** Cliente con la clave secreta (cron, integraciones, avisos). En la API: SystemScope con su `reason`. */
  admin: () => Db
  /** AES-256-GCM de @mirai/crypto (mismo formato v1 en la web y en la API). */
  encrypt: (plain: string) => string
  decrypt: (blob: string) => string
  /** Variables de entorno con los nombres de la web (NEXT_PUBLIC_VAPID_PUBLIC_KEY, GOOGLE_CLIENT_ID…). */
  env: (name: string) => string | undefined
  /** Dirección de Mirai para los enlaces de correos y avisos (sin "/" final). */
  siteUrl: () => string
  /** Dirección pública https (lo que descargan servicios externos, como Meta). */
  publicSiteUrl: () => string
  /** El libro en la forma de @mirai/domain (lib/book-data.ts de la web o ./book-data de este paquete). */
  loadBook: (db: Db, bookId: string) => Promise<LoadedBook>
  /** IA para el nodo "Consejo de la IA" de las automatizaciones. Sin ella, ese nodo falla con un mensaje claro. */
  aiText?: (o: AiTextInput) => Promise<{ text: string }>
}

let current: ServicesRuntime | null = null

/** La configura cada app al cargar (y las pruebas, con dobles). */
export function configureServices(r: ServicesRuntime) {
  current = r
}

/** ¿Ya se configuró? (la API lo revisa en /readyz y en las pruebas). */
export const servicesConfigured = () => current !== null

/** El contexto vigente. Lanza si la app olvidó configurarlo (error de programación, no de la persona). */
export function rt(): ServicesRuntime {
  if (!current) throw new Error("@mirai/services sin configurar: llama a configureServices() al arrancar")
  return current
}

/**
 * Error con un mensaje para la persona (español, tuteo): una condición que no se cumple ("Primero vincula tu chat de
 * Telegram."). La web lo muestra tal cual; la API lo responde como 400 VALIDATION con ese texto.
 */
export class ServiceError extends Error {
  constructor(msg: string, readonly code: "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "ROLE_DENIED" | "PLAN_REQUIRED" = "VALIDATION") {
    super(msg)
    this.name = "ServiceError"
  }
}

// Arma las variables de entorno de Mirai para Dokploy o Coolify (infra/servidor/docker-compose.yml) SIN imprimir ningún valor.
//
//   node infra/servidor/variables.mjs mirai.engynex.com
//
// - Secretos nuevos (contraseñas de la base, PostgREST, MinIO, Better Auth, state de Google): se generan UNA vez y se
//   guardan en ~/.mirai/servidor-<dominio>.secretos (permisos 600, fuera del repositorio). Las siguientes corridas los
//   reutilizan: BETTER_AUTH_SECRET y las contraseñas de la base NUNCA deben cambiar.
// - Los que ya existen (ENCRYPTION_KEY, CRON_SECRET, Google, push) salen de la .env.local de la raíz: deben ser
//   idénticos a los de producción (ENCRYPTION_KEY descifra las integraciones guardadas).
// - WEB_BUILD_ENV_B64: los NEXT_PUBLIC_* del navegador en base64 (argumento de compilación de la web).
// Resultado: ~/.mirai/servidor-<dominio>.env → en Dokploy › Environment (o Coolify › Developer view) pega su contenido
// y guarda. AI_GATEWAY_API_KEY y las de pagos se agregan a mano en el panel (no se copian aquí).
import { randomBytes } from "node:crypto"
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..")
const dominio = (process.argv[2] ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "")
if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dominio)) {
  console.error("Uso: node infra/servidor/variables.mjs <dominio>   (p. ej. mirai.engynex.com)")
  process.exit(1)
}

const dir = join(homedir(), ".mirai")
mkdirSync(dir, { recursive: true, mode: 0o700 })
const secretosFile = join(dir, `servidor-${dominio}.secretos`)
const salida = join(dir, `servidor-${dominio}.env`)

// [ \t] y no \s: con \s una variable vacía (`X=`) se tragaba la línea siguiente como su valor.
const parse = (text) => Object.fromEntries([...text.matchAll(/^[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*["']?([^"'\r\n]*)["']?[ \t]*$/gm)].map((m) => [m[1], m[2].trim()]))
// Solo letras y números: van dentro de URLs postgres:// sin escapar.
const clave = (n = 32) => randomBytes(n * 2).toString("base64").replace(/[^A-Za-z0-9]/g, "").slice(0, n)

const previos = existsSync(secretosFile) ? parse(readFileSync(secretosFile, "utf8")) : {}
const nuevos = {
  POSTGRES_PASSWORD: previos.POSTGRES_PASSWORD || clave(32),
  MIRAI_APP_PASSWORD: previos.MIRAI_APP_PASSWORD || clave(32),
  MIRAI_AUTHENTICATOR_PASSWORD: previos.MIRAI_AUTHENTICATOR_PASSWORD || clave(32),
  POSTGREST_JWT_SECRET: previos.POSTGREST_JWT_SECRET || clave(48),
  MINIO_PASSWORD: previos.MINIO_PASSWORD || clave(32),
  BETTER_AUTH_SECRET: previos.BETTER_AUTH_SECRET || clave(48),
  GOOGLE_OAUTH_STATE_KEY: previos.GOOGLE_OAUTH_STATE_KEY || clave(48),
}
writeFileSync(secretosFile, Object.entries(nuevos).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 })
chmodSync(secretosFile, 0o600)

const local = existsSync(join(ROOT, ".env.local")) ? parse(readFileSync(join(ROOT, ".env.local"), "utf8")) : {}
// Avisos de la plataforma (correo, WhatsApp, Telegram): con ellas quedan activos para todos los hogares al desplegar.
const AVISOS = ["MAIL_FROM", "MAIL_FROM_NAME", "AUTH_MAIL_FROM", "RESEND_API_KEY", "BREVO_API_KEY", "SENDGRID_API_KEY", "GMAIL_USER", "GMAIL_APP_PASSWORD", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID", "WHATSAPP_WABA_ID", "WHATSAPP_TEMPLATE", "WHATSAPP_LANG", "TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_NAME"]
const copiar = ["ENCRYPTION_KEY", "CRON_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "TURNSTILE_SECRET_KEY", "AI_GATEWAY_CF_TOKEN", ...AVISOS]
const desdeLocal = Object.fromEntries(copiar.filter((k) => local[k]).map((k) => [k, local[k]]))
if (local.NEXT_PUBLIC_VAPID_PUBLIC_KEY) desdeLocal.VAPID_PUBLIC_KEY = local.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const faltan = ["ENCRYPTION_KEY", "CRON_SECRET"].filter((k) => !desdeLocal[k])
// Archivos en Cloudflare R2 (u otro S3) si .env.local tiene R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY y
// R2_PUBLIC_URL. Sin ellas, el compose usa SeaweedFS del mismo servidor. S3_PUBLIC_ENDPOINT vacía: los enlaces firmados
// salen con el endpoint de R2 (el navegador sube y descarga directo; los buckets necesitan CORS para el dominio).
const r2 = ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_PUBLIC_URL"].every((k) => local[k])
  ? { S3_ENDPOINT: local.R2_ENDPOINT, S3_REGION: "auto", S3_ACCESS_KEY_ID: local.R2_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY: local.R2_SECRET_ACCESS_KEY, S3_PUBLIC_ENDPOINT: "", PUBLIC_FILES_URL: local.R2_PUBLIC_URL.replace(/\/+$/, "") }
  : {}

// NEXT_PUBLIC_* del navegador: los propios de este despliegue + los demás de .env.local (Turnstile, Wompi, AdSense…),
// nunca los de Supabase ni el sitio de otro ambiente.
const publicos = {
  NEXT_PUBLIC_SITE_URL: `https://${dominio}`,
  // Sin NEXT_PUBLIC_REALTIME_URL: el tiempo real va por el MISMO dominio (/socket.io → servicio realtime en el panel).
  // Un subdominio de dos niveles (rt.mirai.engynex.com) no lo cubre el certificado gratis de Cloudflare (*.engynex.com).
}
for (const [k, v] of Object.entries(local))
  if (k.startsWith("NEXT_PUBLIC_") && !(k in publicos) && !/SUPABASE|SITE_URL|API_URL|REALTIME|LIVE_SOURCE/.test(k) && v) publicos[k] = v
const buildB64 = Buffer.from(Object.entries(publicos).map(([k, v]) => `${k}=${v}`).join("\n") + "\n").toString("base64")

// Gemini por el AI Gateway "mirai" de Cloudflare (sin guardar mensajes ni caché; solo uso, costos y límite).
const ia = local.CLOUDFLARE_ACCOUNT_ID ? { AI_GEMINI_BASE_URL: `https://gateway.ai.cloudflare.com/v1/${local.CLOUDFLARE_ACCOUNT_ID}/mirai/google-ai-studio/v1beta` } : {}
const todo = { MIRAI_DOMINIO: dominio, ...nuevos, ...desdeLocal, ...r2, ...ia, WEB_BUILD_ENV_B64: buildB64 }
writeFileSync(salida, Object.entries(todo).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 })
chmodSync(salida, 0o600)

console.log(`✓ Variables del servidor para ${dominio}: ${salida} (permisos 600; ningún valor se imprime)`)
console.log(`  Generadas una vez (se reutilizan): ${Object.keys(nuevos).join(", ")} → ${secretosFile}`)
console.log(`  Desde .env.local: ${Object.keys(desdeLocal).join(", ") || "ninguna"}`)
console.log(`  Archivos: ${Object.keys(r2).length ? "Cloudflare R2 (" + new URL(r2.S3_ENDPOINT).host + ")" : "SeaweedFS del servidor"}`)
console.log(`  Navegador (WEB_BUILD_ENV_B64): ${Object.keys(publicos).join(", ")}`)
const avisos = AVISOS.filter((k) => desdeLocal[k])
console.log(`  Avisos (correo, WhatsApp, Telegram): ${avisos.length ? avisos.join(", ") : "ninguno — sin esto Mirai no envía correos (README › Correo y WhatsApp)"}`)
if (faltan.length) console.log(`! Faltan en .env.local: ${faltan.join(", ")} (cópialas de producción antes de desplegar)`)
console.log("  A mano en el panel: AI_GATEWAY_API_KEY y las de Mercado Pago y Wompi (si las usas).")

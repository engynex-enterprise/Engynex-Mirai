// Arma las variables de entorno de Mirai en Coolify (infra/coolify/docker-compose.yml) SIN imprimir ningún valor.
//
//   node infra/coolify/variables.mjs mirai.engynex.com
//
// - Secretos nuevos (contraseñas de la base, PostgREST, MinIO, Better Auth, state de Google): se generan UNA vez y se
//   guardan en ~/.mirai/coolify-<dominio>.secretos (permisos 600, fuera del repositorio). Las siguientes corridas los
//   reutilizan: BETTER_AUTH_SECRET y las contraseñas de la base NUNCA deben cambiar.
// - Los que ya existen (ENCRYPTION_KEY, CRON_SECRET, Google, push) salen de la .env.local de la raíz: deben ser
//   idénticos a los de producción (ENCRYPTION_KEY descifra las integraciones guardadas).
// - WEB_BUILD_ENV_B64: los NEXT_PUBLIC_* del navegador en base64 (argumento de compilación de la web).
// Resultado: ~/.mirai/coolify-<dominio>.env → en Coolify › el recurso › Environment Variables › "Developer view",
// pega su contenido y guarda. AI_GATEWAY_API_KEY y las de pagos se agregan a mano en Coolify (no se copian aquí).
import { randomBytes } from "node:crypto"
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..")
const dominio = (process.argv[2] ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "")
if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dominio)) {
  console.error("Uso: node infra/coolify/variables.mjs <dominio>   (p. ej. mirai.engynex.com)")
  process.exit(1)
}

const dir = join(homedir(), ".mirai")
mkdirSync(dir, { recursive: true, mode: 0o700 })
const secretosFile = join(dir, `coolify-${dominio}.secretos`)
const salida = join(dir, `coolify-${dominio}.env`)

const parse = (text) => Object.fromEntries([...text.matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*["']?([^"'\r\n]*)["']?\s*$/gm)].map((m) => [m[1], m[2].trim()]))
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
const copiar = ["ENCRYPTION_KEY", "CRON_SECRET", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"]
const desdeLocal = Object.fromEntries(copiar.filter((k) => local[k]).map((k) => [k, local[k]]))
if (local.NEXT_PUBLIC_VAPID_PUBLIC_KEY) desdeLocal.VAPID_PUBLIC_KEY = local.NEXT_PUBLIC_VAPID_PUBLIC_KEY
const faltan = ["ENCRYPTION_KEY", "CRON_SECRET"].filter((k) => !desdeLocal[k])

// NEXT_PUBLIC_* del navegador: los propios de este despliegue + los demás de .env.local (Turnstile, Wompi, AdSense…),
// nunca los de Supabase ni el sitio de otro ambiente.
const publicos = {
  NEXT_PUBLIC_SITE_URL: `https://${dominio}`,
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:9",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sin-supabase-no-se-usa",
  NEXT_PUBLIC_LIVE_SOURCE: "gateway",
  NEXT_PUBLIC_REALTIME_URL: `https://rt.${dominio}`,
}
for (const [k, v] of Object.entries(local))
  if (k.startsWith("NEXT_PUBLIC_") && !(k in publicos) && !/SUPABASE|SITE_URL|API_URL|REALTIME|LIVE_SOURCE/.test(k) && v) publicos[k] = v
const buildB64 = Buffer.from(Object.entries(publicos).map(([k, v]) => `${k}=${v}`).join("\n") + "\n").toString("base64")

const todo = { MIRAI_DOMINIO: dominio, ...nuevos, ...desdeLocal, WEB_BUILD_ENV_B64: buildB64 }
writeFileSync(salida, Object.entries(todo).map(([k, v]) => `${k}=${v}`).join("\n") + "\n", { mode: 0o600 })
chmodSync(salida, 0o600)

console.log(`✓ Variables de Coolify para ${dominio}: ${salida} (permisos 600; ningún valor se imprime)`)
console.log(`  Generadas una vez (se reutilizan): ${Object.keys(nuevos).join(", ")} → ${secretosFile}`)
console.log(`  Desde .env.local: ${Object.keys(desdeLocal).join(", ") || "ninguna"}`)
console.log(`  Navegador (WEB_BUILD_ENV_B64): ${Object.keys(publicos).join(", ")}`)
if (faltan.length) console.log(`! Faltan en .env.local: ${faltan.join(", ")} (cópialas de producción antes de desplegar)`)
console.log("  A mano en Coolify: AI_GATEWAY_API_KEY, TURNSTILE_SECRET_KEY y las de Mercado Pago y Wompi (si las usas).")

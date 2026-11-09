#!/usr/bin/env node
// E2E de Playwright contra el stack LOCAL (nunca contra producción). Guía: infra/local/README.md.
//
//   pnpm e2e:local                         toda la batería (escritorio 1366 px + móvil 400 px)
//   pnpm e2e:local -- f1-gastos            un archivo (o cualquier argumento de `playwright test`)
//   pnpm e2e:local -- --project=escritorio
//   pnpm e2e:local --no-build              reusa la última compilación local (.next-local) y dist/ de la API
//   pnpm e2e:local --keep                  deja web, API y gateway corriendo al terminar (para mirar a mano)
//   pnpm e2e:local --build-only            solo compila API y web con variables locales (sin Playwright)
//   pnpm e2e:local --dev                   la web con `next dev` (sin compilar): errores de React completos (p. ej. hidratación)
//   pnpm e2e:local --serve                 levanta todo SIN Playwright y con una cuenta de demo (pnpm local:serve)
//
// Igual que producción: auth propio (Better Auth en la API, cookie del mismo origen) y TODO por la API sobre la base
// DESTINO (Postgres 17 + PostgREST interno + MinIO), DB_ADAPTER=postgrest, OBJECT_STORE=s3 y el gateway con la cookie.
// El "Supabase local" de infra/local queda APAGADO y toda URL de Supabase que la API todavía pide apunta a un puerto
// muerto: si algo intentara hablarle a Supabase, falla y se ve. (`--auth=mirai` y `--sin-supabase` se aceptan y no
// cambian nada: son el comportamiento de siempre.)
//
// Qué levanta: Docker (infra/local: Postgres 17 con las migraciones, PostgREST, Redis, MinIO), la API (MODE=api) y el
// gateway (MODE=realtime, pg_notify) en :55080/:55081 y la web (`next start`, compilada en .next-local) en :55300.
// Usuario QA local (lo crea global-setup registrándose por la API).
//
// Salvaguardas (se revisan ANTES de correr cualquier cosa):
//   1. Ninguna variable de .env.local llega a los procesos: cada nombre que tenga se pone vacío o con su valor local
//      (Next, Node y Playwright no pisan una variable ya definida), así un secreto nuevo tampoco se cuela.
//   2. Todo URL del entorno final apunta a localhost; si aparece *.supabase.co o el host real de .env.local, se aborta.
//   3. Después de compilar, el bundle del navegador no puede contener el host de Supabase de .env.local (ni ninguno real).
//   Los valores de .env.local nunca se imprimen.
import { spawn, spawnSync } from "node:child_process"
import { createWriteStream } from "node:fs"
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { LOCAL, localKeys, ROOT, up } from "./stack.mjs"

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
// El modo `--auth=supabase` (web con Supabase Auth) ya no existe: la web solo sabe hablar con la API.
if (argv.some((a) => a.startsWith("--auth=") && a !== "--auth=mirai")) throw new Error("La web ya no tiene modo Supabase: corre pnpm e2e:local sin --auth")
const NO_BUILD = has("--no-build")
const KEEP = has("--keep")
const DEV = has("--dev")
const BUILD_ONLY = has("--build-only")
// --serve: levanta todo (base, API, tiempo real, web) y lo deja corriendo SIN Playwright, con una cuenta de demo.
const SERVE = has("--serve")
// La API todavía pide variables de Supabase al arrancar: van a un puerto muerto (si algo le hablara, falla y se ve).
const DEAD = "http://localhost:9"
const passthrough = argv.filter((a) => !["--api", "--no-build", "--keep", "--build-only", "--dev", "--serve", "--sin-supabase"].includes(a) && !a.startsWith("--auth=") && a !== "--")

const WEB_PORT = new URL(LOCAL.webUrl).port
const API_PORT = new URL(LOCAL.apiUrl).port
const RT_PORT = new URL(LOCAL.realtimeUrl).port
const DIST = ".next-local"
const QA_EMAIL = "qa.e2e@mirai.test"
// Clave del usuario QA en Docker local (no es la de ningún ambiente).
const QA_PASSWORD = "Mirai-QA-local-2026"
// Cuenta para usar la app a mano con --serve (solo Docker local).
const DEMO = { email: "demo@mirai.local", password: "Mirai-demo-local-2026", nombre: "Demo Mirai" }
// 32 bytes en base64, solo local (cifra integraciones de prueba en la base de Docker).
const LOCAL_ENCRYPTION_KEY = Buffer.alloc(32, 0x4d).toString("base64")
// Avisos de la plataforma (correo, WhatsApp, Telegram): solo con --serve y solo si están en .env.local.
const AVISOS_ENV = ["MAIL_FROM", "MAIL_FROM_NAME", "AUTH_MAIL_FROM", "RESEND_API_KEY", "BREVO_API_KEY", "SENDGRID_API_KEY", "GMAIL_USER", "GMAIL_APP_PASSWORD", "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID", "WHATSAPP_WABA_ID", "WHATSAPP_TEMPLATE", "WHATSAPP_LANG", "TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_NAME"]

/** Nombres (sin valores) de .env.local, y los hosts reales para la salvaguarda (no se imprimen). */
function realEnvFile() {
  const f = join(ROOT, ".env.local")
  if (!existsSync(f)) return { names: [], forbidden: [] }
  const text = readFileSync(f, "utf8")
  const names = [...text.matchAll(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)].map((m) => m[1])
  const forbidden = []
  for (const m of text.matchAll(/^\s*(?:export\s+)?(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_DB_URL|NEXT_PUBLIC_SITE_URL)\s*=\s*["']?([^"'\s#]+)/gm)) {
    try {
      const h = new URL(m[2].replace(/^postgres(ql)?:/, "http:")).hostname
      if (h && !["localhost", "127.0.0.1"].includes(h)) forbidden.push(h)
    } catch {
      /* valor raro: se ignora */
    }
  }
  return { names: [...new Set(names)], forbidden: [...new Set(forbidden)] }
}

async function buildEnv() {
  const keys = await localKeys()
  const real = realEnvFile()
  const env = {}
  // 1. Todo lo de .env.local, vacío (bloquea que Next/Node/Playwright lo carguen desde el archivo).
  for (const n of real.names) env[n] = ""
  // Variables que traiga la terminal y que apunten a la nube: fuera.
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(SUPABASE_|NEXT_PUBLIC_|MIRAI_API|E2E_|VERCEL|DATABASE_URL|REDIS_URL|POSTGREST_|AI_GATEWAY|UPSTASH)/.test(k)))
  const local = {
    MIRAI_ENV: "local",
    NEXT_TELEMETRY_DISABLED: "1",
    // Web (navegador y servidor de Next): solo necesita la API y su propio origen.
    NEXT_PUBLIC_SITE_URL: LOCAL.webUrl,
    NEXT_PUBLIC_REALTIME_URL: LOCAL.realtimeUrl,
    MIRAI_API_URL: LOCAL.apiUrl,
    MIRAI_NEXT_DIST_DIR: DIST,
    // API y gateway
    ENCRYPTION_KEY: LOCAL_ENCRYPTION_KEY,
    CRON_SECRET: "mirai-local-cron",
    SUPABASE_URL: DEAD,
    SUPABASE_PUBLISHABLE_KEY: keys.anon,
    SUPABASE_JWT_SECRET: LOCAL.jwtSecret,
    AUTH_ISSUER: `${DEAD}/auth/v1`,
    AUTH_JWKS_URL: `${DEAD}/auth/v1/.well-known/jwks.json`,
    WEB_ORIGINS: LOCAL.webUrl,
    REDIS_URL: LOCAL.redisUrl,
    LOG_LEVEL: "warn",
    // V7-H3: la batería navega mucho más rápido que una persona con el mismo usuario QA; con todo por la API las
    // 300 peticiones/min por persona de producción dan 429 a mitad de una prueba.
    RATE_LIMIT_DEFAULT_PER_MIN: "5000",
    // Las pruebas cambian el plan y el permiso de administrador directo en la base: sin la caché de 30 s del contexto.
    MIRAI_CONTEXT_TTL_MS: "0",
    // Playwright
    E2E_BASE_URL: LOCAL.webUrl,
    E2E_QA_EMAIL: QA_EMAIL,
    E2E_QA_PASSWORD: QA_PASSWORD,
    E2E_API_URL: LOCAL.apiUrl,
    ...miraiEnv(keys),
    ...(SERVE ? { ...realGoogle(), ...realAvisos() } : {}),
  }
  const all = { ...base, ...env, ...local }
  assertLocal(all, real.forbidden)
  // La API no necesita los vacíos (corre en una carpeta sin .env.local; su esquema zod rechaza "" en varias variables).
  const api = { ...base, ...local }
  assertLocal(api, real.forbidden)
  return { all, api, forbidden: real.forbidden }
}

/**
 * --serve: "Entrar con Google" con un cliente OAuth real de .env.local: GOOGLE_LOCAL_CLIENT_ID/SECRET (solo local) o, si
 * no está, GOOGLE_CLIENT_ID/SECRET. Nunca se imprimen.
 * En Google Cloud › Credenciales › ese cliente hay que autorizar el origen http://localhost:55300 y la URI de
 * redirección http://localhost:55300/api/auth/callback/google. Las pruebas siguen con el cliente de mentira.
 */
function realGoogle() {
  const val = envLocal()
  if (!val) return {}
  // Primero el cliente propio de local (GOOGLE_LOCAL_*); si no hay, el de siempre.
  const id = val("GOOGLE_LOCAL_CLIENT_ID") || val("GOOGLE_CLIENT_ID")
  const secret = val("GOOGLE_LOCAL_CLIENT_ID") ? val("GOOGLE_LOCAL_CLIENT_SECRET") : val("GOOGLE_CLIENT_SECRET")
  // Conectar Gmail y Calendar (Correo, Agenda) también necesita la llave con que la API firma el `state` de OAuth.
  // Si .env.local no la trae, una fija de solo este computador (no protege nada fuera de Docker local).
  const state = val("GOOGLE_OAUTH_STATE_KEY") || "mirai-local-solo-docker-google-oauth-state-0001"
  return id && secret ? { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret, GOOGLE_OAUTH_STATE_KEY: state } : {}
}

/**
 * Cómo leer un valor de la .env.local real (sin imprimirlo). null si no existe el archivo.
 * [ \t] y no \s, como infra/servidor/variables.mjs: con \s una variable vacía (`X=`) se traga la línea siguiente.
 */
function envLocal() {
  const f = join(ROOT, ".env.local")
  if (!existsSync(f)) return null
  const text = readFileSync(f, "utf8")
  return (k) => text.match(new RegExp(`^[ \\t]*(?:export[ \\t]+)?${k}[ \\t]*=[ \\t]*["']?([^"'\\r\\n]*)["']?[ \\t]*$`, "m"))?.[1]?.trim()
}

/**
 * --serve: correo, WhatsApp y Telegram REALES de .env.local para probar los avisos antes de desplegar (las mismas
 * variables del servidor, infra/servidor/README.md › Correo y WhatsApp). Ojo: con esto los correos SALEN de verdad.
 * Las pruebas (sin --serve) nunca las reciben: el correo de auth queda en AUTH_MAIL_DRIVER=log y no hay proveedor.
 */
function realAvisos() {
  const val = envLocal()
  if (!val) return {}
  const out = {}
  for (const k of AVISOS_ENV) {
    const v = val(k)
    if (v) out[k] = v
  }
  // Sin proveedor completo no se pasa nada (evita dejar media configuración y un error raro al enviar).
  const hayCorreo = out.RESEND_API_KEY || out.BREVO_API_KEY || out.SENDGRID_API_KEY || (out.GMAIL_USER && out.GMAIL_APP_PASSWORD) || (out.SMTP_HOST && out.SMTP_USER && out.SMTP_PASS)
  if (hayCorreo && !out.MAIL_FROM && !out.AUTH_MAIL_FROM) out.MAIL_FROM = "onboarding@resend.dev"
  return out
}

/** La API entra como `mirai_app` (NOINHERIT), igual que en el servidor (infra/servidor): un permiso que falte en
 *  producción falla aquí también. Las pruebas (E2E_DB_URL) siguen con el superusuario para preparar datos. */
const APP_DB_URL = LOCAL.dbUrl.replace("postgres:mirai-local@", "mirai_app:mirai-local-app@")

/**
 * La API con Better Auth sobre la base DESTINO local (esquema `auth` de 0003_auth_better), datos por el PostgREST
 * interno, archivos en MinIO y el gateway escuchando la base destino. La web pide todo a la API (getAppContext → /v1/me
 * con la cookie). Las pruebas crean usuarios por /api/auth (qa.ts). Valores solo de Docker local.
 */
function miraiEnv(keys) {
  return {
    AUTH_PROVIDER: "mirai",
    BETTER_AUTH_SECRET: "mirai-local-solo-docker-better-auth-secret-0000000001",
    BETTER_AUTH_URL: LOCAL.webUrl,
    AUTH_DATABASE_URL: APP_DB_URL,
    AUTH_MAIL_DRIVER: "log",
    // Cliente de Google de mentira: Better Auth arma el enlace a accounts.google.com (las pruebas lo interceptan).
    GOOGLE_CLIENT_ID: "mirai-local-e2e.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "mirai-local-e2e",
    DB_ADAPTER: "postgrest",
    DATABASE_URL: APP_DB_URL,
    POSTGREST_URL: LOCAL.postgrestUrl,
    POSTGREST_JWT_SECRET: LOCAL.jwtSecret,
    REALTIME_DATABASE_URL: APP_DB_URL,
    OBJECT_STORE: "s3",
    STORAGE_BUCKET_PRIVATE: LOCAL.s3.buckets[0],
    STORAGE_BUCKET_BACKUPS: LOCAL.s3.buckets[1],
    STORAGE_BUCKET_PUBLIC: LOCAL.s3.buckets[2],
    S3_ENDPOINT: LOCAL.s3.endpoint,
    S3_FORCE_PATH_STYLE: "1",
    S3_REGION: "us-east-1",
    AWS_ACCESS_KEY_ID: LOCAL.s3.accessKey,
    AWS_SECRET_ACCESS_KEY: LOCAL.s3.secretKey,
    PUBLIC_FILES_URL: `${LOCAL.s3.endpoint}/${LOCAL.s3.buckets[2]}`,
    // Playwright (tests/e2e/qa.ts): base destino y su PostgREST con la llave service_role local.
    E2E_DB_URL: LOCAL.dbUrl,
    E2E_POSTGREST_URL: LOCAL.postgrestUrl,
    E2E_SERVICE_KEY: keys.service,
  }
}

/** Salvaguarda 2: ningún valor del entorno final apunta afuera de este computador. */
function assertLocal(env, forbidden) {
  const bad = []
  for (const [k, v] of Object.entries(env)) {
    if (!v || typeof v !== "string") continue
    if (/supabase\.(co|com)/i.test(v) || forbidden.some((h) => v.includes(h))) bad.push(k)
    for (const m of v.matchAll(/\b(?:https?|wss?|postgres(?:ql)?|redis):\/\/(?:[^@/\s]*@)?([^/:\s]+)/g)) {
      if (!["localhost", "127.0.0.1", "host.docker.internal"].includes(m[1]) && /^(NEXT_PUBLIC_|SUPABASE|DATABASE|REDIS|POSTGREST|MIRAI_API|E2E_|AUTH_|REALTIME)/.test(k)) bad.push(k)
    }
  }
  if (bad.length) throw new Error(`Abortado: estas variables no apuntan al stack local: ${[...new Set(bad)].join(", ")}`)
}

/** Salvaguarda 3: el JavaScript del navegador no conoce el host real. */
function assertBundle(forbidden) {
  const dir = join(ROOT, "apps/web", DIST, "static")
  if (!existsSync(dir) || !forbidden.length) return
  const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]))
  for (const f of walk(dir).filter((x) => x.endsWith(".js"))) {
    const s = readFileSync(f, "utf8")
    if (forbidden.some((h) => s.includes(h)) || /[a-z0-9]{20}\.supabase\.co/.test(s)) throw new Error("Abortado: la compilación local contiene el host de Supabase real. Vuelve a compilar.")
  }
}

const run = (cmd, args, env, cwd = ROOT) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd, env })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} salió con ${r.status}`)
}

const children = []
function start(name, cmd, args, env, cwd = ROOT) {
  // Grupo de procesos propio: al terminar se cierra el grupo entero (pnpm → next start no deja huérfanos).
  const p = spawn(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], detached: true })
  const tail = []
  // Registro completo de cada proceso en infra/local/.run/logs/<nombre>.log (para revisar una falla de la E2E).
  mkdirSync(join(ROOT, "infra/local/.run/logs"), { recursive: true })
  const file = createWriteStream(join(ROOT, "infra/local/.run/logs", `${name}.log`))
  const keep = (d) => {
    file.write(d)
    tail.push(...String(d).split("\n").filter(Boolean))
    if (tail.length > 40) tail.splice(0, tail.length - 40)
  }
  p.stdout.on("data", keep)
  p.stderr.on("data", keep)
  p.on("exit", (code) => code && code !== 0 && !p.killedByUs && console.error(`✗ ${name} terminó (${code}):\n${tail.join("\n")}`))
  children.push(p)
  return p
}

async function waitHttp(name, url, ms = 120_000) {
  const end = Date.now() + ms
  while (Date.now() < end) {
    try {
      const r = await fetch(url)
      if (r.status < 500) return
    } catch {
      /* todavía no */
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`${name} no respondió en ${url}`)
}

function portBusy(port) {
  return spawnSync("lsof", ["-ti", `tcp:${port}`, "-sTCP:LISTEN"]).stdout.toString().trim().length > 0
}

function stopAll() {
  for (const p of children) {
    p.killedByUs = true
    try {
      process.kill(-p.pid, "SIGTERM")
    } catch {
      p.kill("SIGTERM")
    }
  }
}

/** Cuenta de demo para --serve: se registra como cualquier persona (POST /api/auth/sign-up/email) y se confirma el correo. */
async function demoAccount() {
  const r = await fetch(`${LOCAL.apiUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: LOCAL.webUrl },
    body: JSON.stringify({ email: DEMO.email, password: DEMO.password, name: DEMO.nombre, nombre: DEMO.nombre, acepta_version: "2026-11-01.2", callbackURL: "/bienvenida" }),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }))
  if (!r.ok && r.status !== 422) console.warn(`  (no se pudo crear la cuenta demo: ${r.status} ${(await r.text()).slice(0, 120)})`)
  const { query } = await import("./stack.mjs")
  await query(LOCAL.dbUrl, "update auth.users set email_verified = true, email_confirmed_at = coalesce(email_confirmed_at, now()) where lower(email) = lower($1)", [DEMO.email])
}

async function main() {
  const { all: env, api: apiEnv, forbidden } = await buildEnv()
  // apps/api/src/main.ts lee .env.local de la carpeta actual o de ../../: aquí no hay ninguno.
  const RUN = join(ROOT, "infra/local/.run/api")
  mkdirSync(RUN, { recursive: true })
  for (const port of [WEB_PORT, API_PORT, RT_PORT]) if (portBusy(port)) throw new Error(`El puerto ${port} está ocupado (¿otra corrida con --keep?). Ciérrala: lsof -ti tcp:${port} | xargs kill`)
  console.log("▶ Docker: Postgres 17 + PostgREST + Redis + MinIO (Supabase local APAGADO)")
  // Apaga el "Supabase local" si quedó encendido (pnpm local:up --supa); los datos se conservan en sus volúmenes.
  const supa = spawnSync("docker", ["ps", "-q", "--filter", "name=^mirai-local-supa-"], { encoding: "utf8" }).stdout.trim().split(/\s+/).filter(Boolean)
  if (supa.length) spawnSync("docker", ["stop", ...supa], { stdio: "ignore" })
  await up({ supa: false })

  if (!NO_BUILD) {
    console.log("▶ Compilando la API y la web (.next-local) con variables locales")
    run("pnpm", ["--filter", "api", "build"], apiEnv)
    if (!DEV) {
      run("pnpm", ["--filter", "web", "build"], env)
      writeFileSync(join(ROOT, "apps/web", DIST, "mirai-local.json"), JSON.stringify({ api: LOCAL.apiUrl, at: new Date().toISOString() }))
    }
  } else if (!DEV && !existsSync(join(ROOT, "apps/web", DIST, "mirai-local.json"))) throw new Error("No hay compilación local: corre sin --no-build")
  // En --dev el bundle se arma al vuelo: la salvaguarda 2 (URLs del entorno solo a localhost) sigue aplicando.
  if (!DEV) assertBundle(forbidden)
  if (BUILD_ONLY) {
    console.log("✓ API y web compiladas con variables locales")
    return
  }

  console.log("▶ API :%s, gateway :%s, web :%s", API_PORT, RT_PORT, WEB_PORT)
  const main = join(ROOT, "apps/api/dist/main.js")
  start("API", "node", ["--enable-source-maps", main], { ...apiEnv, MODE: "api", PORT: API_PORT }, RUN)
  start("gateway", "node", ["--enable-source-maps", main], { ...apiEnv, MODE: "realtime", PORT: RT_PORT, REALTIME_PG_LISTEN: "1" }, RUN)
  start("web", "pnpm", ["exec", "next", DEV ? "dev" : "start", "-p", WEB_PORT], env, join(ROOT, "apps/web"))
  await waitHttp("API", `${LOCAL.apiUrl}/healthz`)
  await waitHttp("gateway", `${LOCAL.realtimeUrl}/healthz`)
  await waitHttp("web", `${LOCAL.webUrl}/login`, 180_000)

  if (SERVE) {
    await demoAccount()
    console.log(`\n✓ Mirai corriendo en este computador (Ctrl+C para cerrar todo)`)
    console.log(`  App:            ${LOCAL.webUrl}`)
    console.log(`  API:            ${LOCAL.apiUrl}  (tiempo real ${LOCAL.realtimeUrl})`)
    console.log(`  Base de datos:  ${LOCAL.dbUrl.replace(/:[^:@/]+@/, ":•••@")}`)
    console.log(`  Archivos:       consola de MinIO http://localhost:55901`)
    console.log(`  Correos:        los de registro y recuperar clave quedan en infra/local/.run/logs/API.log (con su enlace)`)
    console.log(`  Google:         ${realGoogle().GOOGLE_CLIENT_ID ? `cliente real de .env.local (autoriza http://localhost:55300/api/auth/callback/google y, para Gmail y Calendar, http://localhost:${API_PORT}/v1/google/callback)` : "sin cliente real: usa correo y clave"}`)
    console.log(`  Cuenta demo:    ${DEMO.email} / ${DEMO.password}`)
    console.log(`  Registros:      infra/local/.run/logs/{API,gateway,web}.log`)
    return
  }
  console.log(`▶ Playwright contra ${LOCAL.webUrl} (todo por la API, auth propio)`)
  const r = spawnSync("pnpm", ["exec", "playwright", "test", ...passthrough], { stdio: "inherit", cwd: join(ROOT, "apps/web"), env })
  if (!KEEP) stopAll()
  else console.log(`… sigue corriendo: web ${LOCAL.webUrl} · API ${LOCAL.apiUrl} · correo de prueba http://localhost:55025 (Ctrl+C para cerrar)`)
  if (!KEEP) process.exit(r.status ?? 1)
}

process.on("SIGINT", () => {
  stopAll()
  process.exit(130)
})
main().catch((e) => {
  console.error(`✗ ${e.message}`)
  stopAll()
  process.exit(1)
})

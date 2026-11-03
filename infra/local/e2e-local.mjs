#!/usr/bin/env node
// E2E de Playwright contra el stack LOCAL (nunca contra la base compartida de Supabase). Guía: infra/local/README.md.
//
//   pnpm e2e:local                         toda la batería (escritorio 1366 px + móvil 400 px)
//   pnpm e2e:local -- f1-gastos            un archivo (o cualquier argumento de `playwright test`)
//   pnpm e2e:local -- --project=escritorio
//   pnpm e2e:local --api                   modo api-on: la web le habla a la API local (MIRAI_API_ROLLOUT=all)
//   pnpm e2e:local --no-build              reusa la última compilación local (.next-local) y dist/ de la API
//   pnpm e2e:local --keep                  deja web, API y gateway corriendo al terminar (para mirar a mano)
//   pnpm e2e:local --build-only            solo compila API y web con variables locales (sin Playwright)
//
// Qué levanta: Docker (infra/local: Supabase local = GoTrue + PostgREST + storage-api sobre Postgres 17 con las 56
// migraciones, Redis, MinIO), la API (MODE=api) y el gateway (MODE=realtime, pg_notify) en :55080/:55081 y la web
// (`next start`, compilada en .next-local) en :55300. Usuario QA local (lo crea global-setup con la clave local).
//
// Salvaguardas (se revisan ANTES de correr cualquier cosa):
//   1. Ninguna variable de .env.local llega a los procesos: cada nombre que tenga se pone vacío o con su valor local
//      (Next, Node y Playwright no pisan una variable ya definida), así un secreto nuevo tampoco se cuela.
//   2. Todo URL del entorno final apunta a localhost; si aparece *.supabase.co o el host real de .env.local, se aborta.
//   3. Después de compilar, el bundle del navegador no puede contener el host de Supabase de .env.local.
//   Los valores de .env.local nunca se imprimen.
import { spawn, spawnSync } from "node:child_process"
import { createWriteStream } from "node:fs"
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { LOCAL, localKeys, ROOT, up } from "./stack.mjs"

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)
const API_ON = has("--api")
const NO_BUILD = has("--no-build")
const KEEP = has("--keep")
const BUILD_ONLY = has("--build-only")
const DB_ADAPTER = argv.find((a) => a.startsWith("--db-adapter="))?.split("=")[1] ?? "supabase"
const passthrough = argv.filter((a) => !["--api", "--no-build", "--keep", "--build-only"].includes(a) && !a.startsWith("--db-adapter=") && a !== "--")

const WEB_PORT = new URL(LOCAL.webUrl).port
const API_PORT = new URL(LOCAL.apiUrl).port
const RT_PORT = new URL(LOCAL.realtimeUrl).port
const DIST = ".next-local"
const QA_EMAIL = "qa.e2e@mirai.test"
// Clave del usuario QA en Docker local (no es la de ningún ambiente).
const QA_PASSWORD = "Mirai-QA-local-2026"
// 32 bytes en base64, solo local (cifra integraciones de prueba en la base de Docker).
const LOCAL_ENCRYPTION_KEY = Buffer.alloc(32, 0x4d).toString("base64")

/** Nombres (sin valores) de .env.local, y el host de Supabase real para la salvaguarda (no se imprime). */
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
    // Web (navegador y servidor de Next)
    NEXT_PUBLIC_SUPABASE_URL: LOCAL.supaUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: keys.anon,
    SUPABASE_SECRET_KEY: keys.service,
    NEXT_PUBLIC_SITE_URL: LOCAL.webUrl,
    NEXT_PUBLIC_LIVE_SOURCE: "gateway",
    NEXT_PUBLIC_REALTIME_URL: LOCAL.realtimeUrl,
    ENCRYPTION_KEY: LOCAL_ENCRYPTION_KEY,
    CRON_SECRET: "mirai-local-cron",
    MIRAI_NEXT_DIST_DIR: DIST,
    // API y gateway
    SUPABASE_URL: LOCAL.supaUrl,
    SUPABASE_PUBLISHABLE_KEY: keys.anon,
    SUPABASE_JWT_SECRET: LOCAL.jwtSecret,
    AUTH_ISSUER: `${LOCAL.supaUrl}/auth/v1`,
    AUTH_JWKS_URL: `${LOCAL.supaUrl}/auth/v1/.well-known/jwks.json`,
    WEB_ORIGINS: LOCAL.webUrl,
    DB_ADAPTER,
    DATABASE_URL: LOCAL.supaDbUrl,
    POSTGREST_URL: `${LOCAL.supaUrl}/rest/v1`,
    POSTGREST_JWT_SECRET: LOCAL.jwtSecret,
    REDIS_URL: LOCAL.redisUrl,
    REALTIME_DATABASE_URL: LOCAL.supaDbUrl,
    LOG_LEVEL: "warn",
    // Playwright
    E2E_BASE_URL: LOCAL.webUrl,
    E2E_QA_EMAIL: QA_EMAIL,
    E2E_QA_PASSWORD: QA_PASSWORD,
    E2E_API: API_ON ? "on" : "off",
    E2E_API_URL: LOCAL.apiUrl,
    ...(API_ON ? { MIRAI_API_ROLLOUT: "all", MIRAI_API_URL: LOCAL.apiUrl } : { MIRAI_API_ROLLOUT: "off" }),
  }
  const all = { ...base, ...env, ...local }
  assertLocal(all, real.forbidden)
  // La API no necesita los vacíos (corre en una carpeta sin .env.local; su esquema zod rechaza "" en varias variables).
  const api = { ...base, ...local }
  assertLocal(api, real.forbidden)
  return { all, api, forbidden: real.forbidden }
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

async function main() {
  const { all: env, api: apiEnv, forbidden } = await buildEnv()
  // apps/api/src/main.ts lee .env.local de la carpeta actual o de ../../: aquí no hay ninguno.
  const RUN = join(ROOT, "infra/local/.run/api")
  mkdirSync(RUN, { recursive: true })
  for (const port of [WEB_PORT, API_PORT, RT_PORT]) if (portBusy(port)) throw new Error(`El puerto ${port} está ocupado (¿otra corrida con --keep?). Ciérrala: lsof -ti tcp:${port} | xargs kill`)
  console.log("▶ Docker: Supabase local + Postgres 17 + Redis + MinIO")
  await up({ supa: true })

  if (!NO_BUILD) {
    console.log("▶ Compilando la API y la web (.next-local) con variables locales")
    run("pnpm", ["--filter", "api", "build"], apiEnv)
    run("pnpm", ["--filter", "web", "build"], env)
    writeFileSync(join(ROOT, "apps/web", DIST, "mirai-local.json"), JSON.stringify({ supabase: LOCAL.supaUrl, at: new Date().toISOString() }))
  } else if (!existsSync(join(ROOT, "apps/web", DIST, "mirai-local.json"))) throw new Error("No hay compilación local: corre sin --no-build")
  assertBundle(forbidden)
  if (BUILD_ONLY) {
    console.log("✓ API y web compiladas con variables locales (sin tocar Supabase)")
    return
  }

  console.log("▶ API :%s, gateway :%s, web :%s", API_PORT, RT_PORT, WEB_PORT)
  const main = join(ROOT, "apps/api/dist/main.js")
  start("API", "node", ["--enable-source-maps", main], { ...apiEnv, MODE: "api", PORT: API_PORT }, RUN)
  start("gateway", "node", ["--enable-source-maps", main], { ...apiEnv, MODE: "realtime", PORT: RT_PORT, REALTIME_PG_LISTEN: "1" }, RUN)
  start("web", "pnpm", ["exec", "next", "start", "-p", WEB_PORT], env, join(ROOT, "apps/web"))
  await waitHttp("API", `${LOCAL.apiUrl}/healthz`)
  await waitHttp("gateway", `${LOCAL.realtimeUrl}/healthz`)
  await waitHttp("web", `${LOCAL.webUrl}/login`, 180_000)

  console.log(`▶ Playwright contra ${LOCAL.webUrl} (modo api-${API_ON ? "on" : "off"})`)
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

#!/usr/bin/env node
// Orquestador del arnés local de Mirai v7 (infra/local/docker-compose.yml). Guía: infra/local/README.md.
//
//   node infra/local/stack.mjs up            base destino (db + PostgREST + Redis + MinIO + GCS), esquema db/postgres/*
//   node infra/local/stack.mjs up --supa     + "Supabase local" (GoTrue, PostgREST, storage-api, gateway) con las 56 migraciones
//   node infra/local/stack.mjs reset [--supa] borra los volúmenes y vuelve a crear todo
//   node infra/local/stack.mjs down          apaga (conserva los datos)
//   node infra/local/stack.mjs test          pruebas de la API contra Docker (RLS, PostgREST, tiempo real, migración)
//   node infra/local/stack.mjs env           variables locales (sin secretos reales) para correr algo a mano
//
// NUNCA lee .env.local ni se conecta a Supabase: todo es 127.0.0.1 y contenedores. Los valores de aquí son solo de
// Docker local (no son secretos de ningún ambiente).
import { execFileSync, spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..")
const COMPOSE = join(ROOT, "infra/local/docker-compose.yml")
const requireApi = createRequire(join(ROOT, "apps/api/package.json"))
const requireDb = createRequire(join(ROOT, "packages/db/package.json"))

/** Valores locales (solo Docker). */
export const LOCAL = {
  jwtSecret: process.env.MIRAI_LOCAL_JWT_SECRET ?? "mirai-local-solo-docker-jwt-secret-000000001",
  dbUrl: "postgres://postgres:mirai-local@localhost:55432/mirai",
  dbAdminUrl: "postgres://postgres:mirai-local@localhost:55432/postgres",
  supaDbUrl: "postgres://postgres:mirai-local@localhost:55434/mirai",
  supaUrl: "http://localhost:55421",
  postgrestUrl: "http://localhost:55430",
  redisUrl: "redis://localhost:55379",
  s3: { endpoint: "http://localhost:55900", accessKey: "mirai", secretKey: "mirai-local-minio", buckets: ["mirai-local-private", "mirai-local-backups", "mirai-local-public"] },
  gcsUrl: "http://localhost:55443",
  webUrl: process.env.MIRAI_LOCAL_WEB_URL ?? "http://localhost:55300",
  apiUrl: "http://localhost:55080",
  realtimeUrl: "http://localhost:55081",
}

/** Llaves anon / service_role de Supabase local (JWT HS256 con el secreto local, como las "legacy" de Supabase). */
export async function localKeys() {
  const { SignJWT } = await import(requireApi.resolve("jose"))
  const key = new TextEncoder().encode(LOCAL.jwtSecret)
  // Fechas fijas: la llave sale idéntica en cada llamada (storage-api compara la llave de servicio tal cual, y Docker
  // no recrea los contenedores si el entorno no cambia).
  const sign = (role) => new SignJWT({ role, iss: "supabase-local" }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuedAt(1767225600).setExpirationTime(2082758400).sign(key)
  return { anon: await sign("anon"), service: await sign("service_role") }
}

const sh = (cmd, args, o = {}) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT, ...o })
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 3).join(" ")}… salió con ${r.status}`)
}

export async function compose(args, extraEnv = {}) {
  const keys = await localKeys()
  sh("docker", ["compose", "-f", COMPOSE, ...args], { env: { ...process.env, MIRAI_LOCAL_JWT_SECRET: LOCAL.jwtSecret, MIRAI_LOCAL_ANON_KEY: keys.anon, MIRAI_LOCAL_SERVICE_KEY: keys.service, ...extraEnv } })
}

async function waitFor(name, fn, ms = 90_000) {
  const end = Date.now() + ms
  let last
  while (Date.now() < end) {
    try {
      if (await fn()) return
    } catch (e) {
      last = e
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error(`${name} no respondió a tiempo${last ? ` (${last.message})` : ""}`)
}

async function pgReady(url) {
  const pg = requireDb("pg")
  const c = new pg.Client({ connectionString: url })
  await c.connect()
  try {
    return (await c.query("select 1 as ok")).rows[0].ok === 1
  } finally {
    await c.end()
  }
}

async function query(url, sql, params) {
  const pg = requireDb("pg")
  const c = new pg.Client({ connectionString: url })
  await c.connect()
  try {
    return (await c.query(sql, params)).rows
  } finally {
    await c.end()
  }
}

const dbTool = (args) => sh("node", [join(ROOT, "packages/db/scripts/db-destino.mjs"), ...args])

/** Base destino: compat + Better Auth + línea base + datos iniciales + overrides (solo si está vacía). */
async function prepareDestino() {
  await waitFor("Postgres destino", () => pgReady(LOCAL.dbAdminUrl))
  const done = await query(LOCAL.dbUrl, "select to_regclass('public._mirai_migrations') is not null as ok").catch(() => [{ ok: false }])
  const base = done[0].ok ? await query(LOCAL.dbUrl, "select count(*)::int as n from public._mirai_migrations where name = 'v7/0001_baseline.sql'") : [{ n: 0 }]
  if (base[0].n === 0) dbTool(["destino", "--url", LOCAL.dbUrl])
  else console.log("✓ base destino ya preparada")
  await compose(["restart", "postgrest"])
}

/** Supabase local: GoTrue y storage-api crean auth/storage; luego compat + shim + 56 migraciones + triggers en vivo. */
async function prepareSupa() {
  await waitFor("Postgres de Supabase local", () => pgReady(LOCAL.supaDbUrl.replace("/mirai", "/postgres")))
  await waitFor("GoTrue", async () => (await fetch(`${LOCAL.supaUrl}/auth/v1/health`)).ok, 120_000)
  await waitFor("storage-api", async () => (await query(LOCAL.supaDbUrl, "select to_regclass('storage.objects') is not null as ok"))[0].ok, 120_000)
  // Lo que en Supabase trae su imagen de Postgres: los roles de la API pueden usar las tablas de storage (la RLS filtra).
  await query(LOCAL.supaDbUrl, "grant usage on schema storage to anon, authenticated, service_role; grant all on all tables in schema storage to anon, authenticated, service_role; grant all on all sequences in schema storage to anon, authenticated, service_role")
  dbTool(["historia", "--url", LOCAL.supaDbUrl, "--live"])
  await compose(["restart", "supa-rest", "supa-storage"])
  await waitFor("PostgREST de Supabase local", async () => (await fetch(`${LOCAL.supaUrl}/rest/v1/`, { headers: { apikey: (await localKeys()).anon } })).status < 500)
}

export async function up({ supa = false } = {}) {
  await compose(["up", "-d", "--wait", "db", "redis", "minio", "gcs"])
  await compose(["up", "-d", "postgrest", "minio-init"])
  await prepareDestino()
  if (supa) {
    await compose(["--profile", "supa", "up", "-d", "supa-db", "supa-mail"])
    await compose(["--profile", "supa", "up", "-d", "supa-auth", "supa-storage", "supa-rest", "supa-gateway"])
    await prepareSupa()
  }
  console.log("✓ arnés local listo")
}

export async function testEnv() {
  return {
    MIRAI_PG_TEST_URL: LOCAL.dbUrl,
    MIRAI_PGRST_TEST_URL: LOCAL.postgrestUrl,
    MIRAI_PGRST_TEST_SECRET: LOCAL.jwtSecret,
    MIRAI_REDIS_TEST_URL: LOCAL.redisUrl,
  }
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  const supa = rest.includes("--supa")
  if (cmd === "up") await up({ supa })
  else if (cmd === "down") await compose(["--profile", "supa", "stop"])
  else if (cmd === "reset") {
    await compose(["--profile", "supa", "down", "-v", "--remove-orphans"])
    await up({ supa })
  } else if (cmd === "test") {
    await up({ supa: false })
    sh("pnpm", ["--filter", "api", "exec", "vitest", "run", "test/pg"], { env: { ...process.env, ...(await testEnv()) } })
  } else if (cmd === "env") {
    const keys = await localKeys()
    const env = { ...(await testEnv()), SUPABASE_LOCAL_URL: LOCAL.supaUrl, SUPABASE_LOCAL_ANON_KEY: keys.anon, SUPABASE_LOCAL_SERVICE_KEY: keys.service }
    for (const [k, v] of Object.entries(env)) console.log(`export ${k}=${JSON.stringify(v)}`)
  } else {
    console.error("Uso: node infra/local/stack.mjs <up|down|reset|test|env> [--supa]")
    process.exitCode = 1
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(`✗ ${e.message}`)
    process.exit(1)
  })
}

export { execFileSync, query, waitFor }

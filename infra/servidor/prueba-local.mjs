// Prueba local del despliegue de Coolify (infra/servidor/docker-compose.yml + docker-compose.local.yml): compila las
// imágenes de producción, prepara la base vacía con db-destino y revisa de punta a punta que la cuenta se cree, entre
// y lea /v1/me con MIRAI_ENV=produccion. No imprime secretos.
//   node infra/servidor/prueba-local.mjs [--no-build] [--down]
import { execFileSync, spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..")
const DOM = "prueba.local"
const ENV_FILE = join(homedir(), ".mirai", `servidor-${DOM}.env`)
const SECRETOS = join(homedir(), ".mirai", `servidor-${DOM}.secretos`)
const has = (f) => process.argv.includes(f)
const compose = (args, opts = {}) =>
  execFileSync("docker", ["compose", "-p", "mirai-cprueba", "--env-file", ENV_FILE, "-f", "infra/servidor/docker-compose.yml", "-f", "infra/servidor/docker-compose.local.yml", ...args], { cwd: ROOT, stdio: "inherit", ...opts })
const parse = (f) => Object.fromEntries([...readFileSync(f, "utf8").matchAll(/^([A-Z_0-9]+)=(.*)$/gm)].map((m) => [m[1], m[2]]))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const WEB = "http://localhost:56300"

if (has("--down")) {
  compose(["down", "-v"])
  process.exit(0)
}

execFileSync("node", ["infra/servidor/variables.mjs", DOM], { cwd: ROOT, stdio: "inherit" })
// La web del navegador apunta a localhost (no a https://prueba.local).
const env = parse(ENV_FILE)
const publicos = Buffer.from(env.WEB_BUILD_ENV_B64, "base64").toString("utf8")
  .replace(/^NEXT_PUBLIC_SITE_URL=.*$/m, `NEXT_PUBLIC_SITE_URL=${WEB}`)
  .replace(/^NEXT_PUBLIC_REALTIME_URL=.*$/m, "NEXT_PUBLIC_REALTIME_URL=http://localhost:56081")
const b64 = Buffer.from(publicos).toString("base64")
const text = readFileSync(ENV_FILE, "utf8").replace(/^WEB_BUILD_ENV_B64=.*$/m, `WEB_BUILD_ENV_B64=${b64}`)
execFileSync("sh", ["-c", `umask 077; cat > "${ENV_FILE}"`], { input: text })

console.log("▶ Base, PostgREST, Redis y MinIO")
compose(["up", "-d", "--wait", "db", "redis", "minio"])
compose(["up", "-d", "minio-init", "postgrest"]) // minio y minio-init: perfil seaweedfs (se encienden por nombre)
const s = parse(SECRETOS)
const url = `postgres://postgres:${s.POSTGRES_PASSWORD}@localhost:56432/mirai`
const listo = spawnSync("docker", ["exec", "mirai-cprueba-db-1", "psql", "-U", "postgres", "-d", "mirai", "-Atc", "select to_regclass('public._mirai_migrations') is not null"], { encoding: "utf8" }).stdout.trim()
if (listo !== "t") {
  console.log("▶ Esquema de la base (db-destino destino)")
  execFileSync("node", ["packages/db/scripts/db-destino.mjs", "destino", "--url", url], { cwd: ROOT, stdio: "inherit", env: { ...process.env, MIRAI_APP_PASSWORD: s.MIRAI_APP_PASSWORD, MIRAI_AUTHENTICATOR_PASSWORD: s.MIRAI_AUTHENTICATOR_PASSWORD } })
  compose(["restart", "postgrest"])
}

console.log(has("--no-build") ? "▶ Servicios (sin recompilar)" : "▶ Compilando y arrancando API, tiempo real y web (tarda)")
compose(["up", "-d", ...(has("--no-build") ? [] : ["--build"]), "api", "realtime", "web", "cron", "db-backup"])

const espera = async (nombre, u, ms = 240_000) => {
  const fin = Date.now() + ms
  while (Date.now() < fin) {
    try { if ((await fetch(u)).status < 500) return console.log(`✓ ${nombre}`) } catch {}
    await sleep(2000)
  }
  throw new Error(`${nombre} no respondió (${u})`)
}
await espera("web /login", `${WEB}/login`)
await espera("tiempo real", "http://localhost:56081/healthz")

// De punta a punta: registro → correo confirmado → entrada → /v1/me, todo por la web (mismo origen).
const email = "prueba.coolify@mirai.local", password = "Prueba-Coolify-2026!"
const h = { "content-type": "application/json", origin: WEB }
const r1 = await fetch(`${WEB}/api/auth/sign-up/email`, { method: "POST", headers: h, body: JSON.stringify({ email, password, name: "Prueba Coolify", nombre: "Prueba Coolify", acepta_version: "2026-11-01.2", callbackURL: "/bienvenida" }) })
console.log(`  registro: ${r1.status}`)
execFileSync("docker", ["exec", "mirai-cprueba-db-1", "psql", "-U", "postgres", "-d", "mirai", "-qAtc", `update auth.users set email_verified = true, email_confirmed_at = coalesce(email_confirmed_at, now()) where email = '${email}'`])
const r2 = await fetch(`${WEB}/api/auth/sign-in/email`, { method: "POST", headers: h, body: JSON.stringify({ email, password }) })
const cookie = r2.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ")
console.log(`  entrada: ${r2.status} ${cookie.includes("session_token") ? "(con sesión)" : "(SIN sesión)"}`)
const r3 = await fetch(`${WEB}/v1/me`, { headers: { cookie, origin: WEB } })
console.log(`  /v1/me: ${r3.status}`)
const r4 = await fetch(`${WEB}/inicio`, { headers: { cookie }, redirect: "manual" })
console.log(`  /inicio: ${r4.status} ${r4.headers.get("location") ?? ""}`)
const ok = r2.ok && r3.ok
console.log(ok ? `\n✓ El despliegue de Coolify funciona en modo producción: ${WEB} (${email} / ${password})` : "\n✗ Algo falló: docker compose -p mirai-cprueba logs api web")
process.exit(ok ? 0 : 1)

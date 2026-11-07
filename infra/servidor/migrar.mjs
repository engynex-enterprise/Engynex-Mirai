// Aplica el esquema (db/postgres: compat + auth + línea base + overrides + 0004_* en adelante) a la base del VPS, por
// un túnel SSH que abre y cierra solo. Idempotente: lo ya aplicado queda registrado y se salta.
//
//   pnpm db:migrate:vps                     → mirai.engynex.com (root@ssh.engynex.com, llave ~/.ssh/mirai_vps)
//   pnpm db:migrate:vps -- --dominio otro.com --ssh root@1.2.3.4 --no-seed
//   pnpm db:migrate:vps -- --pendientes     → solo lista lo que falta aplicar (no cambia nada)
//
// Las contraseñas salen de ~/.mirai/servidor-<dominio>.secretos (variables.mjs) y nunca se imprimen.
// Antes de aplicar, el servicio db-backup del VPS ya guarda una copia diaria; para una copia en el momento:
//   ssh root@ssh.engynex.com 'docker exec $(docker ps -qf name=mirai-tnhl6d-db-1) pg_dump -U postgres -Fc mirai' > copia.dump
import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import { createConnection } from "node:net"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..")
const args = process.argv.slice(2)
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d }
const dominio = opt("--dominio", "mirai.engynex.com")
const destinoSsh = opt("--ssh", "root@ssh.engynex.com")
const llave = opt("--llave", join(homedir(), ".ssh/mirai_vps"))
const puerto = Number(opt("--puerto", "56432"))

const secretos = Object.fromEntries(
  readFileSync(join(homedir(), `.mirai/servidor-${dominio}.secretos`), "utf8")
    .split("\n").map((l) => l.match(/^\s*([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
)
for (const k of ["POSTGRES_PASSWORD", "MIRAI_APP_PASSWORD", "MIRAI_AUTHENTICATOR_PASSWORD"]) if (!secretos[k]) throw new Error(`Falta ${k} en ~/.mirai/servidor-${dominio}.secretos`)

const listo = () => new Promise((ok) => { const s = createConnection(puerto, "127.0.0.1"); s.once("connect", () => { s.destroy(); ok(true) }); s.once("error", () => ok(false)) })
if (await listo()) throw new Error(`El puerto ${puerto} ya está en uso (¿otro túnel abierto?). Ciérralo o usa --puerto.`)

console.log(`▶ Túnel a la base de ${dominio} (${destinoSsh} → localhost:${puerto})`)
const tunel = spawn("ssh", ["-i", llave, "-o", "ExitOnForwardFailure=yes", "-o", "BatchMode=yes", "-N", "-L", `${puerto}:127.0.0.1:5432`, destinoSsh], { stdio: ["ignore", "inherit", "inherit"] })
const cerrar = () => { try { tunel.kill() } catch {} }
process.on("exit", cerrar)
let ok = false
for (let i = 0; i < 40 && !ok; i++) { await new Promise((r) => setTimeout(r, 250)); ok = await listo() }
if (!ok) { cerrar(); throw new Error("No abrió el túnel SSH (¿llave, red o firewall?)") }

const url = `postgres://postgres:${encodeURIComponent(secretos.POSTGRES_PASSWORD)}@localhost:${puerto}/mirai`
if (args.includes("--pendientes")) {
  // Solo lectura: lo registrado en _mirai_migrations contra los archivos de db/postgres (0004_* en adelante se aplican
  // una vez; 0000/0003/0002 son idempotentes y se vuelven a pasar siempre).
  const pg = (await import("node:module")).createRequire(join(ROOT, "packages/db/package.json"))("pg")
  const c = new pg.Client({ connectionString: url })
  await c.connect()
  const hechos = new Set((await c.query("select name from public._mirai_migrations").catch(() => ({ rows: [] }))).rows.map((r) => r.name))
  await c.end()
  const { readdirSync } = await import("node:fs")
  const faltan = ["0001_baseline.sql", ...readdirSync(join(ROOT, "db/postgres")).filter((f) => /^\d{4}_.+\.sql$/.test(f) && f >= "0004").sort()].filter((f) => !hechos.has(`v7/${f}`))
  console.log(faltan.length ? `Faltan: ${faltan.join(", ")}` : "✓ No falta ninguna migración (0004_* en adelante).")
  cerrar()
  process.exit(0)
}
const code = await new Promise((ok) => {
  const p = spawn("node", [join(ROOT, "packages/db/scripts/db-destino.mjs"), "destino", "--url", url, ...(args.includes("--no-seed") ? ["--no-seed"] : [])], {
    cwd: ROOT, stdio: "inherit",
    env: { ...process.env, MIRAI_APP_PASSWORD: secretos.MIRAI_APP_PASSWORD, MIRAI_AUTHENTICATOR_PASSWORD: secretos.MIRAI_AUTHENTICATOR_PASSWORD },
  })
  p.on("exit", ok)
})
cerrar()
if (code === 0) console.log("✓ Esquema al día. Si cambió algo que la API cachea, reinicia la API en Dokploy (o despliega).")
process.exit(code ?? 1)

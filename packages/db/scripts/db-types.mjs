// Regenera src/database.types.ts desde la base (SUPABASE_DB_URL de la .env.local de la raíz).
// Uso: pnpm db:types (desde la raíz o desde packages/db). Después: pnpm typecheck.
import { execFileSync } from "node:child_process"
import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, "../../..")
try { process.loadEnvFile?.(join(ROOT, ".env.local")) } catch { /* sin archivo: se usa la variable del entorno */ }
const url = process.env.SUPABASE_DB_URL
if (!url) { console.error("Falta SUPABASE_DB_URL en la .env.local de la raíz"); process.exit(1) }
const out = execFileSync("supabase", ["gen", "types", "typescript", "--db-url", url, "--schema", "public"], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"], maxBuffer: 64 * 1024 * 1024 })
writeFileSync(join(HERE, "../src/database.types.ts"), out)
console.log("packages/db/src/database.types.ts listo")

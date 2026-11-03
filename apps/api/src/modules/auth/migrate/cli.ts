// CLI de la migración de usuarios (V7-A → la usa V7-J en el ensayo y en la ventana del corte B).
//
//   pnpm --filter api build
//   AUTH_DATABASE_URL=postgres://… BETTER_AUTH_SECRET=… node apps/api/dist/auth-migrate.js --in auth-export.json [--dry-run] [--con-triggers]
//
// Lee la exportación de Supabase (SUPABASE_EXPORT_SQL, de solo lectura) desde un archivo; NO se conecta a Supabase.
// Imprime solo conteos (nunca correos, hashes ni secretos). Sale con código 1 si los conteos de la base no cuadran.
import { readFileSync } from "node:fs"
import { createAuthKysely } from "../auth-db"
import { countAuth, importUsers } from "./import-users"
import { planImport } from "./supabase-export"

export type CliIo = { env: NodeJS.ProcessEnv; out: (s: string) => void; read?: (p: string) => string }

export async function runAuthMigrate(argv: string[], io: CliIo): Promise<number> {
  const arg = (name: string) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const file = arg("--in")
  const dry = argv.includes("--dry-run")
  const secret = io.env.BETTER_AUTH_SECRET ?? ""
  const url = io.env.AUTH_DATABASE_URL ?? io.env.DATABASE_URL ?? ""
  if (!file) return io.out("Falta --in <archivo de exportación de Supabase>"), 2
  if (secret.length < 32) return io.out("Falta BETTER_AUTH_SECRET (32+ caracteres): cifra los TOTP migrados"), 2
  if (!dry && !url) return io.out("Falta AUTH_DATABASE_URL (o DATABASE_URL) de la Postgres destino"), 2

  const raw = JSON.parse((io.read ?? ((p) => readFileSync(p, "utf8")))(file))
  const plan = await planImport(raw, secret)
  io.out(`Plan: ${JSON.stringify(plan.report)}`)
  if (dry) return 0

  const { db } = createAuthKysely(url, { max: 2 })
  try {
    const before = await countAuth(db)
    const r = await importUsers(db, plan, { triggers: argv.includes("--con-triggers") })
    const after = await countAuth(db)
    io.out(`Importado: ${JSON.stringify(r)} · Base antes: ${JSON.stringify(before)} · después: ${JSON.stringify(after)}`)
    // En una base nueva los conteos deben ser iguales al plan; en una segunda pasada, al menos iguales.
    const ok = after.usuarios >= plan.report.usuarios && after.con_clave >= plan.report.conClave && after.google >= plan.report.google && after.totp >= plan.report.totpMigrados
    if (!ok) io.out("Los conteos de la base no cuadran con el plan: revisa antes de seguir")
    return ok ? 0 : 1
  } finally {
    await db.destroy()
  }
}

// Ejecutable (dist/auth-migrate.js). En las pruebas se importa `runAuthMigrate` sin correr esto.
if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  runAuthMigrate(process.argv.slice(2), { env: process.env, out: (s) => process.stdout.write(`${s}\n`) }).then(
    (code) => process.exit(code),
    (e) => {
      process.stderr.write(`La migración falló: ${(e as Error).message}\n`)
      process.exit(1)
    },
  )
}

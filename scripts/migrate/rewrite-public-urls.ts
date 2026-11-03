// v7 · V7-J · Envoltorio de rewrite-public-urls.sql.
//
//   node --experimental-strip-types scripts/migrate/rewrite-public-urls.ts --destino <url> \
//        --de https://<ref>.supabase.co/storage/v1/object/public/ --a https://files.mirai.engynex.com/ [--aplicar]
//
// Sin --aplicar solo cuenta (simulación). Con --aplicar cambia todo en UNA transacción y vuelve a contar: debe quedar 0.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { checkDestino, connect, flag, label, log, opt, ROOT, type Client } from "./lib.ts"

export async function rewritePublicUrls(c: Client, de: string, a: string, aplicar: boolean) {
  await c.query(readFileSync(join(ROOT, "scripts/migrate/rewrite-public-urls.sql"), "utf8"))
  await c.query("begin")
  try {
    // Reescribir una URL no es un cambio de la persona: sin triggers de auditoría ni de "actualizado" si se puede.
    await c.query("savepoint r")
    await c.query("set local session_replication_role = replica").then(() => c.query("release savepoint r"), () => c.query("rollback to savepoint r"))
    const found = (await c.query<{ tabla: string; columna: string; filas: string }>("select * from pg_temp.mirai_rewrite_public_urls($1, $2, $3)", [de, a, aplicar])).rows
    const left = aplicar ? (await c.query("select * from pg_temp.mirai_rewrite_public_urls($1, $2, false)", [de, a])).rows : []
    if (left.length) throw new Error(`Quedaron URL viejas en ${left.map((r) => `${r.tabla}.${r.columna}`).join(", ")}`)
    await c.query(aplicar ? "commit" : "rollback")
    return found.map((r) => ({ ...r, filas: Number(r.filas) }))
  } catch (e) {
    await c.query("rollback").catch(() => {})
    throw e
  }
}

async function main() {
  const destino = checkDestino(opt("--destino", "MIGRATE_DESTINO_URL"))
  const de = opt("--de")
  const a = opt("--a")
  if (!de || !a) throw new Error("Faltan --de <prefijo viejo> y --a <prefijo nuevo>")
  const c = await connect(destino, "rewrite")
  try {
    const r = await rewritePublicUrls(c, de, a, flag("--aplicar"))
    log(`${flag("--aplicar") ? "Reescritas" : "Por reescribir (simulación)"} en ${label(destino)}: ${r.reduce((s, x) => s + x.filas, 0)} filas`)
    for (const x of r) log(`  ${x.tabla}.${x.columna}: ${x.filas}`)
  } finally {
    await c.end()
  }
}

if (process.argv[1]?.endsWith("rewrite-public-urls.ts")) await main()

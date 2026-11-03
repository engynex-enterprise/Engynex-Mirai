// Genera components/mirai/icon-registry.ts con SOLO los íconos Lucide que usa Mirai (por nombre kebab-case).
// Busca nombres en el código y en los datos de la v4. Uso: node scripts/gen-icons.mjs
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import * as L from "lucide-react"

const toPascal = (n) => n.replace(/(^|-)([a-z0-9])/g, (_, __, c) => c.toUpperCase())
const names = new Set(Object.keys(JSON.parse(readFileSync("lib/data/legacy-icons.json", "utf8"))))
const walk = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|json)$/.test(f) ? [p] : [] })
// packages/domain (roles, catálogo de automatizaciones…) también nombra íconos: antes vivía en lib/domain.
for (const f of [...walk("app"), ...walk("components"), ...walk("features"), ...walk("lib"), ...walk("../../packages/domain/src")]) {
  if (f.endsWith("icon-registry.ts") || f.includes("database.types")) continue
  for (const m of readFileSync(f, "utf8").matchAll(/["'`]([a-z][a-z0-9]*(?:-[a-z0-9]+)*)["'`]/g)) names.add(m[1])
}
const NOT_ICONS = new Set(["icon", "icons", "lucide", "default"])
const found = [...names].filter((n) => { if (NOT_ICONS.has(n)) return false; const p = toPascal(n); return /^[A-Z]/.test(p) && typeof L[p] === "object" && L[p]?.$$typeof }).sort()
const imports = found.map((n) => toPascal(n))
writeFileSync("components/mirai/icon-registry.ts",
`// Generado por scripts/gen-icons.mjs — no editar a mano. Solo los íconos que usa Mirai.
import { ${[...new Set(imports)].join(", ")} } from "lucide-react"
import type { LucideProps } from "lucide-react"

export const ICONS: Record<string, React.ComponentType<LucideProps>> = {
${found.map((n) => `  "${n}": ${toPascal(n)},`).join("\n")}
}
`)
console.log(found.length, "íconos")

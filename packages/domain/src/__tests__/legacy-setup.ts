// globalSetup de Vitest: compila el bundle de la v4 (legacy/dist/app.check.js, ignorado por git) UNA sola vez, antes
// de lanzar los procesos de prueba. Sin esto, en un checkout limpio (CI) cada archivo de pruebas lo compilaba a la vez
// y alguno lo leía a medio escribir ("sample is not defined" en la paridad con la v4).
import { existsSync } from "node:fs"
import { execSync } from "node:child_process"
import path from "node:path"

export default function setup() {
  const root = path.resolve(__dirname, "../../../..")
  if (!existsSync(path.join(root, "legacy/dist/app.check.js"))) execSync("python3 build.py", { cwd: path.join(root, "legacy"), stdio: "ignore" })
}

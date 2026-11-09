// Dónde está la raíz del monorepo, sin importar desde dónde se llame la consola.
import { existsSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/** packages/cli/src/datos → la raíz está cuatro niveles arriba. */
export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..")

export const ruta = (...partes: string[]) => join(RAIZ, ...partes)

export const existe = (...partes: string[]) => existsSync(ruta(...partes))

/** Lee un archivo del repositorio; devuelve null si no está (nunca lanza). */
export function leer(...partes: string[]): string | null {
  try {
    return readFileSync(ruta(...partes), "utf8")
  } catch {
    return null
  }
}

/** Lee un JSON del repositorio; null si no está o está roto. */
export function leerJson<T = Record<string, unknown>>(...partes: string[]): T | null {
  const txt = leer(...partes)
  if (!txt) return null
  try {
    return JSON.parse(txt) as T
  } catch {
    return null
  }
}

export type PaqueteJson = {
  name?: string
  version?: string
  description?: string
  scripts?: Record<string, string>
  engines?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

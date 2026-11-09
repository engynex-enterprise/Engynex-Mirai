// Las pruebas: correrlas y ver qué pasó organizado, en vez del chorro de texto.
import { readdirSync, statSync } from "node:fs"
import { correr } from "./ejecutar.ts"
import { ruta } from "./raiz.ts"
import type { Estado } from "./tipos.ts"

export type Suite = { id: string; titulo: string; detalle: string; cmd: string; args: string[]; tarda: string }

export const SUITES: Suite[] = [
  { id: "unitarias", titulo: "Cálculos (Vitest)", detalle: "Dominio, contratos, web, API y la consola.", cmd: "pnpm", args: ["test"], tarda: "1 a 3 minutos" },
  { id: "dominio", titulo: "Solo el dominio", detalle: "Los cálculos de plata, comparados con la versión 4.", cmd: "pnpm", args: ["--filter", "@mirai/domain", "test"], tarda: "menos de 1 minuto" },
  { id: "e2e", titulo: "Pantalla (Playwright)", detalle: "Escritorio 1366 px y celular 400 px contra el stack local.", cmd: "pnpm", args: ["e2e:local"], tarda: "10 a 20 minutos" },
  { id: "lint", titulo: "Estilo (ESLint)", detalle: "Tiene que quedar en cero errores.", cmd: "pnpm", args: ["lint"], tarda: "1 a 2 minutos" },
  { id: "tipos", titulo: "Tipos (TypeScript)", detalle: "La web y cada paquete.", cmd: "pnpm", args: ["typecheck"], tarda: "1 a 3 minutos" },
]

export type ResultadoPrueba = { estado: Estado; titulo: string; archivo?: string; mensaje?: string }
export type Resumen = { pasaron: number; fallaron: number; saltadas: number; archivos: number; ms?: number; fallas: ResultadoPrueba[] }

/** Lee la salida de Vitest o Playwright y saca lo que importa. Nada de adivinar: si no entiende, lo dice. */
export function leerSalida(lineas: string[]): Resumen | null {
  const texto = lineas.join("\n")
  // Vitest: "Tests  43 passed (43)" · "Test Files  4 passed (4)"
  const pruebas = /Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(\d+)\s+passed(?:\s*\|\s*(\d+)\s+skipped)?/.exec(texto)
  const archivos = /Test Files\s+(?:(\d+)\s+failed\s*\|\s*)?(\d+)\s+passed/.exec(texto)
  // Playwright: "3 failed", "28 passed (2.1m)"
  const pw = /(\d+)\s+passed\s*\(([\dhms.]+)\)/.exec(texto)
  const pwFallaron = /(\d+)\s+failed/.exec(texto)
  if (!pruebas && !pw) return null

  const fallas: ResultadoPrueba[] = []
  for (const l of lineas) {
    // Vitest marca las que fallan con × y Playwright con ✘ / "1) ruta:línea"
    const v = /^\s*[×✗]\s+(.+?)(?:\s+\d+ms)?$/.exec(l)
    if (v) fallas.push({ estado: "error", titulo: v[1].trim() })
    const p = /^\s*\d+\)\s+(\S+?):(\d+):\d+\s+›\s+(.+)$/.exec(l)
    if (p) fallas.push({ estado: "error", titulo: p[3].trim(), archivo: `${p[1]}:${p[2]}` })
  }
  return {
    pasaron: Number(pruebas?.[2] ?? pw?.[1] ?? 0),
    fallaron: Number(pruebas?.[1] ?? pwFallaron?.[1] ?? 0),
    saltadas: Number(pruebas?.[3] ?? 0),
    archivos: Number(archivos?.[2] ?? 0),
    fallas: fallas.slice(0, 40),
  }
}

export type Captura = { archivo: string; nombre: string; cuando: number; tamano: number }

/** Las capturas que dejó la última batería de Playwright. */
export function capturas(): Captura[] {
  const base = ruta("apps/web/tests/.out")
  try {
    return readdirSync(base)
      .filter((f) => /\.(png|jpe?g)$/i.test(f))
      .map((f) => {
        const s = statSync(`${base}/${f}`)
        return {
          archivo: `${base}/${f}`,
          // "f03-gastos-movil.png" → "f03 gastos movil"
          nombre: f.replace(/\.(png|jpe?g)$/i, "").replace(/[-_]/g, " "),
          cuando: s.mtimeMs,
          tamano: s.size,
        }
      })
      .sort((a, b) => b.cuando - a.cuando)
  } catch {
    return []
  }
}

/** Cuándo se corrió la batería por última vez, según las capturas. */
export function ultimaCorrida(): Date | null {
  const c = capturas()
  return c.length ? new Date(c[0].cuando) : null
}

/** Correr una suite y entregar ya interpretado el resultado (para el modo --json y para la web). */
export async function correrSuite(id: string): Promise<{ ok: boolean; resumen: Resumen | null; salida: string[] }> {
  const s = SUITES.find((x) => x.id === id)
  if (!s) return { ok: false, resumen: null, salida: ["No conozco esa batería."] }
  const r = await correr(s.cmd, s.args, { ms: 30 * 60 * 1000 })
  const salida = [...r.out.split("\n"), ...r.err.split("\n")].filter(Boolean)
  return { ok: r.ok, resumen: leerSalida(salida), salida }
}

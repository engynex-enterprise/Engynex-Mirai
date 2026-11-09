// Los endpoints de /v1, leídos del contrato de verdad (@mirai/contracts/api): nada escrito a mano.
import { apiContract } from "@mirai/contracts/api"

export type Endpoint = {
  id: string
  modulo: string
  metodo: string
  ruta: string
  resumen: string
  /** Nombres de los parámetros de la ruta (:bookId, :id…). */
  parametros: string[]
  /** true si cambia algo (POST, PUT, PATCH, DELETE). */
  escribe: boolean
}

type Nodo = { method?: string; path?: string; summary?: string; description?: string } | Record<string, unknown>

const esRuta = (n: Nodo): n is { method: string; path: string; summary?: string; description?: string } =>
  typeof n === "object" && n !== null && typeof (n as { path?: unknown }).path === "string" && typeof (n as { method?: unknown }).method === "string"

/** Recorre el contrato (que es un árbol de módulos) y saca cada ruta. */
export function endpoints(): Endpoint[] {
  const out: Endpoint[] = []
  const recorrer = (nodo: Record<string, unknown>, modulo: string) => {
    for (const [clave, valor] of Object.entries(nodo)) {
      if (!valor || typeof valor !== "object") continue
      if (esRuta(valor as Nodo)) {
        const r = valor as { method: string; path: string; summary?: string; description?: string }
        const resumen = (r.summary ?? r.description ?? "").split("\n")[0].trim()
        out.push({
          id: `${modulo}.${clave}`,
          modulo: modulo || "general",
          metodo: r.method,
          ruta: r.path,
          resumen,
          parametros: [...r.path.matchAll(/:([a-zA-Z]+)/g)].map((m) => m[1]),
          escribe: r.method !== "GET",
        })
      } else {
        recorrer(valor as Record<string, unknown>, modulo || clave)
      }
    }
  }
  recorrer(apiContract as unknown as Record<string, unknown>, "")
  return out.sort((a, b) => a.modulo.localeCompare(b.modulo) || a.ruta.localeCompare(b.ruta))
}

/** Agrupados por módulo, para pintarlos. */
export function porModulo(): { modulo: string; endpoints: Endpoint[] }[] {
  const mapa = new Map<string, Endpoint[]>()
  for (const e of endpoints()) mapa.set(e.modulo, [...(mapa.get(e.modulo) ?? []), e])
  return [...mapa.entries()].map(([modulo, eps]) => ({ modulo, endpoints: eps })).sort((a, b) => a.modulo.localeCompare(b.modulo))
}

/** Llama un endpoint contra el ambiente local (solo lectura por defecto). */
export async function probar(ruta: string, metodo = "GET", base = "http://localhost:55080"): Promise<{ codigo: number | null; ms: number; cuerpo: string }> {
  const inicio = Date.now()
  try {
    const r = await fetch(base + ruta, { method: metodo, signal: AbortSignal.timeout(10000) })
    const texto = await r.text()
    return { codigo: r.status, ms: Date.now() - inicio, cuerpo: texto.slice(0, 4000) }
  } catch (e) {
    return { codigo: null, ms: Date.now() - inicio, cuerpo: e instanceof Error ? e.message : "no pude llamarlo" }
  }
}

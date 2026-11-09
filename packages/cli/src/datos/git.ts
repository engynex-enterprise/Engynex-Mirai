// Qué cambiaste, agrupado por paquete, con su diff. Solo mirar: esta consola no hace commit ni push.
import { correr } from "./ejecutar.ts"
import { PAQUETES } from "./contenido.ts"

export type Cambio = { estado: string; etiqueta: string; ruta: string; paquete: string }
export type GrupoCambios = { paquete: string; detalle: string; cambios: Cambio[] }

const ETIQUETAS: Record<string, string> = {
  M: "cambiado",
  A: "nuevo",
  D: "borrado",
  R: "renombrado",
  C: "copiado",
  "?": "sin seguir",
  "!": "ignorado",
  U: "en conflicto",
}

/** A qué paquete del monorepo pertenece un archivo. */
export function paqueteDe(ruta: string): string {
  const m = /^(apps|packages)\/([^/]+)\//.exec(ruta)
  if (m) return `${m[1]}/${m[2]}`
  const raiz = ruta.split("/")[0]
  return ruta.includes("/") ? raiz : "(raíz)"
}

/** Los cambios sin commitear, agrupados por paquete. */
export async function cambios(): Promise<GrupoCambios[]> {
  const r = await correr("git", ["status", "--porcelain=v1"], { ms: 8000 })
  if (!r.ok) return []
  const todos: Cambio[] = r.out
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const marca = l.slice(0, 2).trim()
      const ruta = l.slice(3).trim()
      const letra = marca.replace("?", "?")[0] ?? "M"
      return { estado: marca, etiqueta: ETIQUETAS[letra] ?? "cambiado", ruta, paquete: paqueteDe(ruta) }
    })
  const grupos = new Map<string, Cambio[]>()
  for (const c of todos) grupos.set(c.paquete, [...(grupos.get(c.paquete) ?? []), c])
  const nombrePaquete = (carpeta: string) => {
    const corto = carpeta.split("/").pop() ?? carpeta
    return PAQUETES[`@mirai/${corto}`] ?? PAQUETES[corto] ?? ""
  }
  return [...grupos.entries()]
    .map(([paquete, cs]) => ({ paquete, detalle: nombrePaquete(paquete), cambios: cs.sort((a, b) => a.ruta.localeCompare(b.ruta)) }))
    .sort((a, b) => b.cambios.length - a.cambios.length)
}

/** El diff de un archivo (o de todo, si no se pasa ruta). Recortado para no ahogar la pantalla. */
export async function diff(ruta?: string, lineas = 400): Promise<string[]> {
  const args = ["diff", "--no-color", "--", ...(ruta ? [ruta] : [])]
  const r = await correr("git", args, { ms: 10000 })
  let texto = r.out
  if (!texto && ruta) {
    // Un archivo nuevo no está en el diff: se muestra su contenido como si todo fuera agregado.
    const nuevo = await correr("git", ["diff", "--no-index", "--no-color", "/dev/null", ruta], { ms: 10000 })
    texto = nuevo.out
  }
  return texto.split("\n").slice(0, lineas)
}

export type Commit = { hash: string; cuando: string; autor: string; mensaje: string }

/** Los últimos commits. */
export async function commits(cuantos = 15): Promise<Commit[]> {
  const r = await correr("git", ["log", `-${cuantos}`, "--date=relative", "--pretty=%h\t%ad\t%an\t%s"], { ms: 8000 })
  if (!r.ok) return []
  return r.out
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [hash, cuando, autor, ...resto] = l.split("\t")
      return { hash, cuando, autor, mensaje: resto.join("\t") }
    })
}

/** Rama, remoto y qué falta por subir o bajar. */
export async function situacion(): Promise<{ rama: string; sinSubir: number; sinBajar: number; sinGuardar: number }> {
  const [rama, arriba, abajo, estado] = await Promise.all([
    correr("git", ["rev-parse", "--abbrev-ref", "HEAD"], { ms: 4000 }),
    correr("git", ["rev-list", "--count", "@{u}..HEAD"], { ms: 5000 }),
    correr("git", ["rev-list", "--count", "HEAD..@{u}"], { ms: 5000 }),
    correr("git", ["status", "--porcelain"], { ms: 8000 }),
  ])
  return {
    rama: rama.out || "?",
    sinSubir: Number(arriba.out) || 0,
    sinBajar: Number(abajo.out) || 0,
    sinGuardar: estado.out.split("\n").filter(Boolean).length,
  }
}

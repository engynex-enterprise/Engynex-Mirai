// Cuánto se está gastando cada contenedor: CPU, memoria y disco. Para cuando el computador se pone lento.
import { correr } from "./ejecutar.ts"
import type { Estado } from "./tipos.ts"

export type Uso = {
  nombre: string
  proyecto: string
  /** 0 a 1 (puede pasar de 1: son varios núcleos). */
  cpu: number
  /** Megabytes. */
  memoria: number
  memoriaTope: number
  /** 0 a 1. */
  memoriaFraccion: number
  red: string
  disco: string
  estado: Estado
}

const aMb = (txt: string): number => {
  const m = /([\d.]+)\s*([KMGT]i?B)/i.exec(txt)
  if (!m) return 0
  const n = Number(m[1])
  const u = m[2].toUpperCase()
  if (u.startsWith("K")) return n / 1024
  if (u.startsWith("G")) return n * 1024
  if (u.startsWith("T")) return n * 1024 * 1024
  return n
}

/** `docker stats` de una sola pasada, ya interpretado. */
export async function usoContenedores(): Promise<Uso[]> {
  const r = await correr("docker", ["stats", "--no-stream", "--format", "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"], { ms: 15000 })
  if (!r.ok) return []
  return r.out
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [nombre, cpuTxt, mem, red, disco] = l.split("\t")
      const [usada, tope] = (mem ?? "").split("/")
      const memoria = aMb(usada ?? "")
      const memoriaTope = aMb(tope ?? "")
      const cpu = Number((cpuTxt ?? "").replace("%", "")) / 100
      const fraccion = memoriaTope ? memoria / memoriaTope : 0
      return {
        nombre,
        proyecto: nombre.replace(/-[^-]+-\d+$/, ""),
        cpu,
        memoria,
        memoriaTope,
        memoriaFraccion: fraccion,
        red: (red ?? "").trim(),
        disco: (disco ?? "").trim(),
        estado: (fraccion >= 0.9 || cpu >= 2 ? "error" : fraccion >= 0.75 || cpu >= 1 ? "aviso" : "ok") as Estado,
      }
    })
    .filter((u) => /^mirai-/.test(u.nombre))
    .sort((a, b) => b.cpu - a.cpu)
}

export type Disco = { total: string; usado: string; libre: string; fraccion: number; estado: Estado }

/** Cuánto disco se están comiendo las imágenes y los volúmenes de Docker. */
export async function discoDocker(): Promise<{ titulo: string; tamano: string; recuperable: string }[]> {
  const r = await correr("docker", ["system", "df", "--format", "{{.Type}}\t{{.Size}}\t{{.Reclaimable}}"], { ms: 15000 })
  if (!r.ok) return []
  const nombres: Record<string, string> = { Images: "Imágenes", Containers: "Contenedores", "Local Volumes": "Volúmenes (los datos)", "Build Cache": "Caché de compilación" }
  return r.out
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [tipo, tamano, recuperable] = l.split("\t")
      return { titulo: nombres[tipo] ?? tipo, tamano, recuperable }
    })
}

/** El disco de este computador. */
export async function discoEquipo(): Promise<Disco | null> {
  const r = await correr("df", ["-h", "/"], { ms: 4000 })
  if (!r.ok) return null
  const p = r.out.split("\n").pop()?.split(/\s+/) ?? []
  if (p.length < 5) return null
  const fraccion = Number(p[4].replace("%", "")) / 100
  return { total: p[1], usado: p[2], libre: p[3], fraccion, estado: fraccion >= 0.9 ? "error" : fraccion >= 0.75 ? "aviso" : "ok" }
}

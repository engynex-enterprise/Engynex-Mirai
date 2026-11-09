// Los registros (logs) de los contenedores, en vivo. Sirve igual para los de aquí y para los del VPS.
import { spawn } from "node:child_process"
import { EventEmitter } from "node:events"
import { SERVICIOS } from "./contenido.ts"
import { correr } from "./ejecutar.ts"
import { DESTINO_SSH, LLAVE_SSH } from "./salud-vps.ts"
import { taparSecretos } from "./secretos.ts"

export type Contenedor = {
  nombre: string
  servicio: string
  proyecto: string
  imagen: string
  estado: string
  arriba: boolean
  /** Qué hace, en español. */
  detalle: string
}

/** Los contenedores de Mirai que hay en este computador. */
export async function contenedores(): Promise<Contenedor[]> {
  const r = await correr(
    "docker",
    ["ps", "-a", "--format", '{{.Names}}\t{{.Label "com.docker.compose.service"}}\t{{.Label "com.docker.compose.project"}}\t{{.Image}}\t{{.Status}}'],
    { ms: 8000 },
  )
  if (!r.ok) return []
  return r.out
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      const [nombre, servicio, proyecto, imagen, estado] = l.split("\t")
      return { nombre, servicio: servicio || nombre, proyecto, imagen, estado, arriba: estado?.startsWith("Up") ?? false, detalle: SERVICIOS[servicio] ?? "" }
    })
    .filter((c) => /^mirai-/.test(c.proyecto ?? "") || /^mirai-/.test(c.nombre))
    .sort((a, b) => (a.proyecto + a.servicio).localeCompare(b.proyecto + b.servicio))
}

export type Seguimiento = {
  id: string
  objetivo: string
  lineas: { t: number; texto: string }[]
  eventos: EventEmitter
  cerrar: () => void
}

const TOPE = 1000
const abiertos = new Map<string, Seguimiento>()

export const verSeguimiento = (id: string) => abiertos.get(id)

/**
 * Sigue los registros de un contenedor. `docker logs -f` nunca termina: se cierra a mano.
 * Todo pasa por taparSecretos: un log puede escupir una URL de base con contraseña.
 */
export function seguirRegistros(contenedor: string, opciones: { lineas?: number; vps?: boolean } = {}): Seguimiento {
  const id = `log-${contenedor}-${Date.now().toString(36)}`
  const cola = String(opciones.lineas ?? 200)
  const args = opciones.vps
    ? ["-i", LLAVE_SSH, "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", DESTINO_SSH, `docker logs -f --tail ${cola} ${contenedor}`]
    : ["logs", "-f", "--tail", cola, contenedor]
  const p = spawn(opciones.vps ? "ssh" : "docker", args, { env: process.env })

  const seg: Seguimiento = {
    id,
    objetivo: contenedor,
    lineas: [],
    eventos: new EventEmitter(),
    cerrar: () => {
      p.kill("SIGTERM")
      abiertos.delete(id)
    },
  }
  const agregar = (buf: Buffer) => {
    for (const texto of taparSecretos(buf.toString()).split("\n")) {
      if (!texto.trim()) continue
      const linea = { t: Date.now(), texto: texto.replace(/\r/g, "") }
      seg.lineas.push(linea)
      if (seg.lineas.length > TOPE) seg.lineas.splice(0, seg.lineas.length - TOPE)
      seg.eventos.emit("linea", linea)
    }
  }
  p.stdout?.on("data", agregar)
  p.stderr?.on("data", agregar)
  p.on("close", () => {
    seg.eventos.emit("fin")
    abiertos.delete(id)
  })
  abiertos.set(id, seg)
  return seg
}

/** Cierra todos los seguimientos abiertos (al salir de la consola). */
export function cerrarRegistros() {
  for (const s of [...abiertos.values()]) s.cerrar()
}

/** Un vistazo rápido sin seguir: las últimas N líneas. */
export async function ultimasLineas(contenedor: string, lineas = 60): Promise<string[]> {
  const r = await correr("docker", ["logs", "--tail", String(lineas), contenedor], { ms: 10000 })
  return [...r.out.split("\n"), ...r.err.split("\n")].filter(Boolean)
}

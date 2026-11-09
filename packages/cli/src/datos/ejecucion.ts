// Correr un comando y seguir su salida en vivo. Lo usan las dos caras: la TUI lo pinta en un panel y la
// web lo manda por SSE. Una sola implementación para que las dos muestren exactamente lo mismo.
import { type ChildProcess, spawn } from "node:child_process"
import { EventEmitter } from "node:events"
import { type Comando, COMANDOS } from "./comandos.ts"
import { RAIZ } from "./raiz.ts"
import { taparSecretos } from "./secretos.ts"

export type Linea = { t: number; texto: string; err: boolean }
export type EstadoEjecucion = "corriendo" | "terminado" | "cortado"

export type Ejecucion = {
  id: string
  comando: Comando
  estado: EstadoEjecucion
  code: number | null
  lineas: Linea[]
  inicio: number
  fin?: number
  eventos: EventEmitter
}

const ejecuciones = new Map<string, Ejecucion>()
const procesos = new Map<string, ChildProcess>()

/** Cuántas líneas se guardan en memoria por ejecución (una compilación larga escupe miles). */
const TOPE_LINEAS = 2000

export const buscarComando = (id: string): Comando | undefined => COMANDOS.find((c) => c.id === id)

export const verEjecucion = (id: string) => ejecuciones.get(id)

export const ejecucionesVivas = () => [...ejecuciones.values()].filter((e) => e.estado === "corriendo")

/**
 * Lanza un comando del catálogo. Los de riesgo alto exigen la palabra de confirmación: la revisión está
 * AQUÍ, no en la pantalla, para que valga igual desde la terminal y desde el navegador.
 */
export function lanzar(idComando: string, confirmacion?: string): { ok: true; ejecucion: Ejecucion } | { ok: false; msg: string } {
  const comando = buscarComando(idComando)
  if (!comando) return { ok: false, msg: "No conozco ese comando." }
  if (comando.riesgo === "alto" && confirmacion !== comando.confirmacion) {
    return { ok: false, msg: `Para esto hay que escribir ${comando.confirmacion}.` }
  }
  if (ejecucionesVivas().some((e) => e.comando.id === idComando)) {
    return { ok: false, msg: "Ese comando ya está corriendo." }
  }
  const id = `${idComando}-${Date.now().toString(36)}`
  const ejecucion: Ejecucion = { id, comando, estado: "corriendo", code: null, lineas: [], inicio: Date.now(), eventos: new EventEmitter() }
  ejecuciones.set(id, ejecucion)

  const agregar = (texto: string, err: boolean) => {
    for (const t of taparSecretos(texto).split("\n")) {
      if (!t.trim() && ejecucion.lineas.length === 0) continue
      const linea: Linea = { t: Date.now(), texto: t.replace(/\r/g, ""), err }
      ejecucion.lineas.push(linea)
      if (ejecucion.lineas.length > TOPE_LINEAS) ejecucion.lineas.splice(0, ejecucion.lineas.length - TOPE_LINEAS)
      ejecucion.eventos.emit("linea", linea)
    }
  }

  let p: ChildProcess
  try {
    p = spawn(comando.cmd, comando.args, { cwd: RAIZ, env: { ...process.env, FORCE_COLOR: "0" } })
  } catch {
    ejecucion.estado = "terminado"
    ejecucion.code = null
    agregar(`No pude correr ${comando.cmd}.`, true)
    return { ok: true, ejecucion }
  }
  procesos.set(id, p)
  p.stdout?.on("data", (d: Buffer) => agregar(d.toString(), false))
  p.stderr?.on("data", (d: Buffer) => agregar(d.toString(), true))
  p.on("error", (e) => agregar(`Error: ${e.message}`, true))
  p.on("close", (code) => {
    procesos.delete(id)
    ejecucion.code = code
    ejecucion.fin = Date.now()
    if (ejecucion.estado !== "cortado") ejecucion.estado = "terminado"
    ejecucion.eventos.emit("fin", ejecucion)
  })
  return { ok: true, ejecucion }
}

/** Corta un comando sin tumbar la consola. */
export function cortar(id: string): boolean {
  const p = procesos.get(id)
  const e = ejecuciones.get(id)
  if (!p || !e) return false
  e.estado = "cortado"
  p.kill("SIGTERM")
  // Si no se muere por las buenas, a los 3 segundos va en serio.
  setTimeout(() => {
    if (procesos.has(id)) p.kill("SIGKILL")
  }, 3000)
  return true
}

/** Corta todo lo que esté corriendo (al salir de la consola). */
export function cortarTodo() {
  for (const id of procesos.keys()) cortar(id)
}

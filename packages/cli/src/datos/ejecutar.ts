// Correr procesos sin que la consola se cuelgue nunca: todo con tiempo límite y sin shell.
import { spawn } from "node:child_process"
import { RAIZ } from "./raiz.ts"
import { taparSecretos } from "./secretos.ts"

export type Salida = { ok: boolean; code: number | null; out: string; err: string; ms: number; expiro: boolean }

/**
 * Corre un comando y espera a que termine. Nunca lanza: los errores vienen en el resultado.
 * Sin `shell: true` a propósito (nada de inyección por un nombre de archivo raro).
 */
export function correr(cmd: string, args: string[], opciones: { ms?: number; cwd?: string } = {}): Promise<Salida> {
  const limite = opciones.ms ?? 3000
  const inicio = Date.now()
  return new Promise((resolver) => {
    let out = ""
    let err = ""
    let expiro = false
    let p: ReturnType<typeof spawn>
    try {
      p = spawn(cmd, args, { cwd: opciones.cwd ?? RAIZ, env: process.env })
    } catch {
      return resolver({ ok: false, code: null, out: "", err: `No pude correr ${cmd}`, ms: 0, expiro: false })
    }
    const reloj = setTimeout(() => {
      expiro = true
      p.kill("SIGKILL")
    }, limite)
    p.stdout?.on("data", (d: Buffer) => (out += d.toString()))
    p.stderr?.on("data", (d: Buffer) => (err += d.toString()))
    p.on("error", () => {
      clearTimeout(reloj)
      resolver({ ok: false, code: null, out, err: err || `No encontré ${cmd}`, ms: Date.now() - inicio, expiro })
    })
    p.on("close", (code) => {
      clearTimeout(reloj)
      resolver({
        ok: code === 0 && !expiro,
        code,
        out: taparSecretos(out.trim()),
        err: taparSecretos(err.trim()),
        ms: Date.now() - inicio,
        expiro,
      })
    })
  })
}

/** ¿Existe este programa en el PATH? */
export async function hay(cmd: string): Promise<boolean> {
  const r = await correr("which", [cmd], { ms: 1500 })
  return r.ok && r.out.length > 0
}

/** Un GET con tiempo límite; devuelve el código HTTP y cuánto tardó. */
export async function pedir(url: string, ms = 5000): Promise<{ codigo: number | null; ms: number; error?: string }> {
  const inicio = Date.now()
  const corte = AbortSignal.timeout(ms)
  try {
    const r = await fetch(url, { signal: corte, redirect: "manual" })
    return { codigo: r.status, ms: Date.now() - inicio }
  } catch (e) {
    const err = e as Error
    return { codigo: null, ms: Date.now() - inicio, error: err.name === "TimeoutError" ? "no respondió a tiempo" : "no pude conectar" }
  }
}

/** ¿Hay algo escuchando en este puerto de este computador? */
export async function puertoOcupado(puerto: number, ms = 1200): Promise<boolean> {
  const { createConnection } = await import("node:net")
  return new Promise((resolver) => {
    const s = createConnection({ port: puerto, host: "127.0.0.1" })
    const fin = (r: boolean) => {
      s.destroy()
      resolver(r)
    }
    s.setTimeout(ms, () => fin(false))
    s.once("connect", () => fin(true))
    s.once("error", () => fin(false))
  })
}

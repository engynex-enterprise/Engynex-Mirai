// La prueba que impide que las dos caras de la consola se desincronicen, y la que protege el servidor.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { panel } from "../datos/index.ts"
import { abrirWeb } from "./servidor.ts"

let base: string
let token: string
let apagar: () => void

beforeAll(async () => {
  // Puerto alto y al azar para no chocar con una consola abierta de verdad.
  const puerto = 4900 + Math.floor(Math.random() * 90)
  const original = console.log
  let impreso = ""
  console.log = (...a: unknown[]) => (impreso += a.join(" "))
  const corriendo = abrirWeb({ puerto, abrir: false })
  // abrirWeb no termina hasta que se apaga: se espera a que el enlace aparezca.
  await new Promise<void>((listo) => {
    const mirar = setInterval(() => {
      if (impreso.includes("?t=")) {
        clearInterval(mirar)
        listo()
      }
    }, 20)
  })
  console.log = original
  base = `http://127.0.0.1:${puerto}`
  token = /\?t=([a-f0-9]+)/.exec(impreso)![1]
  apagar = () => process.emit("SIGTERM")
  void corriendo
}, 20000)

afterAll(() => apagar?.())

const con = (ruta: string, init?: RequestInit) => fetch(base + ruta, { ...init, headers: { "x-mirai-token": token, ...(init?.headers ?? {}) } })

describe("el servidor de la consola web", () => {
  it("sirve la página y sus archivos sin pedir token", async () => {
    for (const r of ["/", "/estilo.css", "/consola.js", "/mirai-logo.svg"]) {
      expect((await fetch(base + r)).status, r).toBe(200)
    }
  })

  it("sin token no entrega ninguna información del proyecto", async () => {
    expect((await fetch(`${base}/api/paneles`)).status).toBe(401)
    expect((await fetch(`${base}/api/panel/stack`)).status).toBe(401)
  })

  it("con un token equivocado tampoco", async () => {
    const r = await fetch(`${base}/api/panel/stack`, { headers: { "x-mirai-token": "0".repeat(32) } })
    expect(r.status).toBe(401)
  })

  it("rechaza una petición que venga de otra página", async () => {
    const r = await con("/api/paneles", { headers: { origin: "https://otra-cosa.com" } })
    expect(r.status).toBe(403)
  })

  it("sirve exactamente lo mismo que la terminal", async () => {
    // Si esta prueba falla, una cara está mostrando algo que la otra no.
    for (const id of ["stack", "infra", "arquitectura"] as const) {
      const web = await (await con(`/api/panel/${id}`)).json()
      const terminal = await panel(id)
      expect(web, id).toEqual(JSON.parse(JSON.stringify(terminal)))
    }
  })

  it("un panel que no existe da 404", async () => {
    expect((await con("/api/panel/inventado")).status).toBe(404)
  })

  it("un comando de riesgo alto NO corre sin la confirmación", async () => {
    const r = await con("/api/comandos/local-reset", { method: "POST", body: JSON.stringify({}), headers: { "content-type": "application/json" } })
    expect(r.status).toBe(400)
    expect(((await r.json()) as { error: string }).error).toContain("BORRAR")
  })

  it("tampoco corre con una confirmación equivocada", async () => {
    const r = await con("/api/comandos/migrar-vps", { method: "POST", body: JSON.stringify({ confirmacion: "sí" }), headers: { "content-type": "application/json" } })
    expect(r.status).toBe(400)
  })

  it("un comando que no existe no se lanza", async () => {
    const r = await con("/api/comandos/rm-rf", { method: "POST", body: JSON.stringify({}), headers: { "content-type": "application/json" } })
    expect(r.status).toBe(400)
  })

  it("no filtra secretos en lo que sirve", async () => {
    const texto = await (await con("/api/panel/infra")).text()
    expect(texto).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/)
    expect(texto).not.toMatch(/postgres:\/\/[^"]*:[^"@]+@/)
  })
})

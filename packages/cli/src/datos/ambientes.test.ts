import { describe, expect, it } from "vitest"
import { AMBIENTES, estadoAmbientes } from "./ambientes.ts"
import { COMANDOS } from "./comandos.ts"

describe("ambientes", () => {
  it("son los tres que se pueden levantar aquí", () => {
    expect(AMBIENTES.map((a) => a.id)).toEqual(["desarrollo", "produccion", "servicios"])
  })

  it("ninguno comparte puertos con otro: se pueden tener los tres a la vez", () => {
    const vistos = new Map<number, string>()
    for (const a of AMBIENTES) {
      for (const p of a.puertos) {
        // Los servicios sí comparten con desarrollo a propósito (dev usa el mismo stack de Docker).
        const choca = vistos.get(p.puerto)
        if (choca && !(choca === "desarrollo" && a.id === "servicios") && !(choca === "servicios" && a.id === "desarrollo")) {
          throw new Error(`${a.id} y ${choca} se pelean el puerto ${p.puerto}`)
        }
        vistos.set(p.puerto, a.id)
      }
    }
    // Producción local nunca pisa los puertos de desarrollo (55xxx vs 56xxx).
    const dev = AMBIENTES.find((a) => a.id === "desarrollo")!.puertos.map((p) => p.puerto)
    const prod = AMBIENTES.find((a) => a.id === "produccion")!.puertos.map((p) => p.puerto)
    expect(prod.filter((p) => dev.includes(p))).toEqual([])
  })

  it("cada uno explica para qué es, cuándo usarlo y cuánto tarda", () => {
    for (const a of AMBIENTES) {
      expect(a.detalle.length, a.id).toBeGreaterThan(20)
      expect(a.cuando.length, a.id).toBeGreaterThan(10)
      expect(a.tarda.length, a.id).toBeGreaterThan(5)
      expect(a.puertos.length, a.id).toBeGreaterThan(0)
    }
  })

  it("cada ambiente tiene su comando de levantar en el catálogo", () => {
    for (const a of AMBIENTES) {
      expect(COMANDOS.find((c) => c.id === `prender-${a.id}`), a.id).toBeTruthy()
      if (a.apagar) expect(COMANDOS.find((c) => c.id === `apagar-${a.id}`), a.id).toBeTruthy()
    }
  })

  it("dice cuál está arriba mirando los puertos de verdad", async () => {
    const estados = await estadoAmbientes()
    expect(estados).toHaveLength(3)
    for (const e of estados) {
      expect(["ok", "aviso", "apagado"]).toContain(e.estado)
      expect(e.puertos).toHaveLength(e.ambiente.puertos.length)
      expect(e.resumen.length).toBeGreaterThan(0)
      // El puerto de entrada manda: si está libre, el ambiente está abajo aunque queden restos.
      if (!e.puertos[0].ocupado) expect(e.estado).toBe("apagado")
    }
  }, 30000)
})

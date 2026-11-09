// El registro es lo que la gente lee en la consola y en Ajustes: cada integración tiene que decir QUÉ ES (`d`) y
// PARA QUÉ SIRVE en Mirai (`para`). Estas pruebas evitan que entre una integración sin explicar, o con una promesa
// que la app no cumple (el caso de los festivos: decía "corre las fechas al siguiente día hábil" y nadie lo hacía).
import { describe, expect, it } from "vitest"
import { CATS, INTEGRATIONS, type IntegrationDef } from "./registry"

const kinds = INTEGRATIONS.map((i) => i.kind)
const cada = (f: (def: IntegrationDef) => void) => INTEGRATIONS.forEach((def) => f(def))

describe("registro de integraciones", () => {
  it("no repite kinds", () => {
    expect(new Set(kinds).size).toBe(kinds.length)
  })

  it("cada integración pertenece a una categoría conocida", () => {
    cada((def) => expect(Object.keys(CATS), def.kind).toContain(def.cat))
  })

  describe("qué es (d)", () => {
    it("está en todas y es una frase de verdad", () => {
      cada((def) => {
        expect(def.d.trim(), `${def.kind}: sin descripción`).not.toBe("")
        expect(def.d.trim().length, `${def.kind}: descripción muy corta`).toBeGreaterThanOrEqual(25)
        expect(def.d.trim(), `${def.kind}: la descripción debe terminar en punto`).toMatch(/[.!?)]$/)
      })
    })
  })

  describe("para qué sirve (para)", () => {
    it("está en todas", () => {
      cada((def) => {
        expect(def.para?.trim(), `${def.kind}: falta "para qué sirve"`).toBeTruthy()
        expect(def.para.trim().length, `${def.kind}: "para qué sirve" muy corto`).toBeGreaterThanOrEqual(40)
      })
    })

    it("explica algo distinto de lo que ya dice la descripción", () => {
      cada((def) => expect(def.para.trim(), `${def.kind}: "para qué sirve" repite la descripción`).not.toBe(def.d.trim()))
    })

    it("no se repite entre integraciones (cada una hace lo suyo)", () => {
      const textos = INTEGRATIONS.map((i) => i.para.trim().toLowerCase())
      const repetidos = textos.filter((t, i) => textos.indexOf(t) !== i)
      expect(repetidos, `textos repetidos: ${repetidos.join(" · ")}`).toEqual([])
    })

    it("es una frase terminada, no un fragmento", () => {
      cada((def) => expect(def.para.trim(), `${def.kind}: debe terminar en punto`).toMatch(/[.!?)]$/))
    })

    it("habla de tú, no de usted ni en impersonal de manual", () => {
      cada((def) => expect(def.para, `${def.kind}: no uses "usted"`).not.toMatch(/\busted(es)?\b/i))
    })

    it("no deja el nombre del campo técnico suelto", () => {
      cada((def) => expect(def.para, `${def.kind}: no pegues nombres de variables en el texto`).not.toMatch(/[A-Z_]{4,}_[A-Z_]{2,}/))
    })
  })

  describe("las de datos financieros dicen dónde se ve el efecto", () => {
    const DATOS = INTEGRATIONS.filter((i) => i.cat === "datos")

    it("son las seis que esperamos", () => {
      expect(DATOS.map((i) => i.kind)).toEqual(["trm", "usura", "festivos", "fx", "coingecko", "stocks"])
    })

    it("cada una nombra una pantalla o un dato concreto de Mirai", () => {
      // Sin esto vuelven las promesas vagas ("datos al día") que no se pueden comprobar en la app.
      const PANTALLAS = /gasto|fij|ingreso|suscripci|cuenta|inversi|préstamo|prestamo|tarjeta|agenda|calendario|balance|ajustes|aviso|recordatorio|nómina|nomina|pago/i
      DATOS.forEach((def) => expect(def.para, `${def.kind}: no dice dónde se nota`).toMatch(PANTALLAS))
    })

    it("dice qué pasa si se apaga", () => {
      DATOS.forEach((def) => expect(def.para, `${def.kind}: no dice qué pasa si la apagas`).toMatch(/si la apagas|si se apaga|sin ella/i))
    })
  })
})

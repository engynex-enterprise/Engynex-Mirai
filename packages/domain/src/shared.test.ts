import { describe, expect, it } from "vitest"
import { legacyCall } from "./__tests__/adapt"
import { loadLegacy } from "./__tests__/legacy"
import { balancesGrupo } from "./shared"

const L = loadLegacy("2026-10-31")

const GRUPOS = [
  { nombre: "viaje parejo", personas: ["Ana", "Beto", "Caro"], gastos: [{ valor: 900000, paga: "Ana" }, { valor: 300000, paga: "Beto" }, { valor: 150000, paga: "Caro" }] },
  { nombre: "dividido entre algunos", personas: ["Ana", "Beto", "Caro", "Dani"], gastos: [{ valor: 100000, paga: "Ana", entre: ["Ana", "Beto"] }, { valor: 333333, paga: "Dani", entre: [] }, { valor: 50000, paga: "Caro", entre: ["Dani"] }] },
  { nombre: "pagó alguien de fuera", personas: ["Ana", "Beto"], gastos: [{ valor: 120000, paga: "Tío", entre: ["Ana", "Beto"] }] },
  { nombre: "a paz y salvo", personas: ["Ana", "Beto"], gastos: [{ valor: 100, paga: "Ana" }, { valor: 100, paga: "Beto" }] },
  { nombre: "sin gastos", personas: ["Ana", "Beto"], gastos: [] },
]

describe("balancesGrupo = v4", () => {
  for (const g of GRUPOS)
    it(g.nombre, () => {
      const v5 = balancesGrupo(g.personas, g.gastos)
      const v4 = legacyCall(L, "balancesGrupo", { personas: g.personas, gastos: g.gastos })
      expect(Object.keys(v5.b)).toEqual(Object.keys(v4.b))
      for (const k of Object.keys(v4.b)) expect(v5.b[k]).toBeCloseTo(v4.b[k], 9)
      expect(v5.tr.length).toBe(v4.tr.length)
      v5.tr.forEach((t, i) => {
        expect([t.de, t.a]).toEqual([v4.tr[i].de, v4.tr[i].a])
        expect(t.v).toBeCloseTo(v4.tr[i].v, 9)
      })
    })
  it("las transferencias saldan las cuentas", () => {
    const { b, tr } = balancesGrupo(GRUPOS[0].personas, GRUPOS[0].gastos)
    for (const t of tr) {
      b[t.de] += t.v
      b[t.a] -= t.v
    }
    for (const v of Object.values(b)) expect(Math.abs(v)).toBeLessThan(1)
  })
})

import { describe, expect, it } from "vitest"
import { expectClose, fixedOf, legacyCall, scenario } from "./__tests__/adapt"
import { fijoMensual, fijoPeriods, fijoProxIso, fijoStatus } from "./fixed"

const HOY = "2026-10-31"

// Gastos fijos de prueba en forma v4 (cada uno ejercita una frecuencia o caso borde).
const FIJOS = [
  { id: "m31", nombre: "Mensual día 31", cat: "Vivienda", valor: 100000, frec: "mensual", dia: 31, desde: "2026-01", pagos: [{ per: "2026-09", fecha: "2026-09-30", valor: 100000 }] },
  { id: "q", nombre: "Quincenal", cat: "Otros", valor: 50000, frec: "quincenal", dia: 10, dia2: 31, desde: "2026-08", pagos: [{ per: "2026-10-Q1", fecha: "2026-10-10", valor: 50000 }] },
  { id: "qdef", nombre: "Quincenal sin días", cat: "Otros", valor: 50000, frec: "quincenal", dia: 20, desde: "2026-08", pagos: [] },
  { id: "b", nombre: "Bimestral", cat: "Servicios públicos", valor: 142000, frec: "bimestral", dia: 20, desde: "2026-07", pagos: [] },
  { id: "t", nombre: "Trimestral", cat: "Otros", valor: 300000, frec: "trimestral", dia: 5, desde: "2025-12", pagos: [{ per: "2026-09", fecha: "2026-09-05", valor: 310000 }] },
  { id: "s", nombre: "Semestral", cat: "Otros", valor: 600000, frec: "semestral", dia: 15, desde: "2026-04", pagos: [] },
  { id: "a", nombre: "Anual (SOAT)", cat: "Transporte", valor: 1050000, frec: "anual", dia: 29, mes: 2, desde: "2026-01", pagos: [] },
  { id: "u", nombre: "Único", cat: "Otros", valor: 900000, frec: "unico", dia: 1, fecha: "2026-12-24", desde: "2026-10", pagos: [] },
  { id: "ini", nombre: "Con inicio", cat: "Ahorro", valor: 200000, frec: "quincenal", dia: 15, dia2: 30, desde: "2026-10", inicio: "2026-10-20", pagos: [] },
  { id: "fut", nombre: "Desde el futuro", cat: "Otros", valor: 80000, frec: "mensual", dia: 3, desde: "2027-02", pagos: [] },
]

describe("fijoPeriods = v4 (24 meses × cada frecuencia)", () => {
  const sc = scenario(HOY)
  for (const f of FIJOS)
    it(f.nombre, () => {
      const v5 = fixedOf(sc.S, f)
      for (let k = 0; k < 24; k++) {
        const y = 2026 + Math.floor((k + 0) / 12)
        const m = k % 12
        expect(fijoPeriods(v5, y, m, HOY), `${f.id} ${y}-${m + 1}`).toEqual(legacyCall(sc.L, "fijoPeriods", f, y, m))
      }
    })
})

describe("fijoStatus, fijoProxIso y fijoMensual = v4", () => {
  for (const hoy of ["2026-10-31", "2026-02-28", "2026-12-24", "2027-01-01"]) {
    const sc = scenario(hoy)
    for (const f of FIJOS)
      it(`${hoy} · ${f.nombre}`, () => {
        const v5 = fixedOf(sc.S, f)
        const st = fijoStatus(v5, hoy)
        const v4 = legacyCall(sc.L, "fijoStatus", f)
        const norm = (p: { per: string; due: string; pago?: { per?: string; periodo?: string; fecha: string; valor: number } }) => ({ per: p.per, due: p.due, pagado: p.pago ? p.pago.fecha : null })
        expect(st.periods.map(norm)).toEqual(v4.periods.map(norm))
        expect(st.venc.map(norm)).toEqual(v4.venc.map(norm))
        expect(st.prox && norm(st.prox)).toEqual(v4.prox && norm(v4.prox))
        expect(st.mensual).toBeCloseTo(v4.mensual, 9)
        expect(fijoProxIso(v5, hoy)).toBe(sc.L.call("fijoProxIso", sc.L.ev(`JSON.parse(${JSON.stringify(JSON.stringify(f))})`)))
        expect(fijoMensual(v5)).toBeCloseTo(sc.L.call("fijoMensual", f), 9)
      })
    it(`${hoy} · fijos del ejemplo`, () => {
      sc.book.fixedExpenses.forEach((f, ix) => {
        const v4 = sc.plain(`fijoStatus(S.fijos[${ix}])`)
        expectClose(
          fijoStatus(f, hoy).periods.map((p) => ({ per: p.per, due: p.due })),
          v4.periods.map((p: { per: string; due: string }) => ({ per: p.per, due: p.due })),
        )
      })
    })
  }
  it("fijoProxIso sin fijo → hoy + 10", () => expect(fijoProxIso(null, HOY)).toBe("2026-11-10"))
})

import { describe, expect, it } from "vitest"
import { expectClose } from "./__tests__/adapt"
import { loadLegacy } from "./__tests__/legacy"
import { compraEstado, cortesDesde } from "./cards"
import { parseDate } from "./dates"

const L = loadLegacy("2026-10-31")
const J = (o: unknown) => `JSON.parse(${JSON.stringify(JSON.stringify(o))})`

const TARJETAS = [{ corte: 25, tasa: 2.1 }, { corte: 31, tasa: 1.9 }, { corte: 1, tasa: 0 }, { corte: 0, tasa: 2.5 }]
const COMPRAS = [
  { fecha: "2026-01-31", valor: 1200000, cuotas: 6 },
  { fecha: "2026-02-25", valor: 500000, cuotas: 1 },
  { fecha: "2026-02-28", valor: 2400000, cuotas: 36 },
  { fecha: "2026-10-30", valor: 300000, cuotas: 3, pagada: true },
  { fecha: "2026-06-15", valor: 800000, cuotas: 0 },
]
const HASTAS = ["2026-01-31", "2026-03-01", "2026-10-31", "2027-12-31", "2030-01-01"]

describe("compras con tarjeta = compraEstado()/cortesDesde() de la v4", () => {
  for (const t of TARJETAS)
    for (const c of COMPRAS)
      it(`corte ${t.corte} · tasa ${t.tasa} · ${c.fecha} · ${c.cuotas} cuotas${c.pagada ? " · pagada" : ""}`, () => {
        for (const h of HASTAS) {
          expect(cortesDesde(t, c.fecha, parseDate(h))).toBe(L.ev(`cortesDesde(${J(t)},'${c.fecha}',parse('${h}'))`))
          expectClose(compraEstado(t, c, h), L.plain(L.ev(`compraEstado(${J(t)},${J(c)},parse('${h}'))`)))
        }
      })
})

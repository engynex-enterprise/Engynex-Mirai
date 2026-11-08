import { describe, expect, it } from "vitest"
import { expectClose } from "./__tests__/adapt"
import { loadLegacy } from "./__tests__/legacy"
import { ajusteTarjeta, compraEstado, cortesDesde, deudaTarjeta, pagosTarjetaEntre, tarjetaCuotaMes, tarjetaFlujoMes, tarjetaPagoMes, tarjetasDeuda } from "./cards"
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

describe("compras con tarjeta: cortes, cuotas e intereses = v4 (compraEstado/cortesDesde)", () => {
  for (const t of TARJETAS)
    for (const c of COMPRAS)
      it(`corte ${t.corte} · tasa ${t.tasa} · ${c.fecha} · ${c.cuotas} cuotas${c.pagada ? " · pagada" : ""}`, () => {
        for (const h of HASTAS) {
          expect(cortesDesde(t, c.fecha, parseDate(h))).toBe(L.ev(`cortesDesde(${J(t)},'${c.fecha}',parse('${h}'))`))
          // La v4 bajaba el saldo el día del corte; ahora baja en la fecha de pago (k = pagadas). Lo facturado (fact) es lo
          // que la v4 llamaba k, y la cuota, el número de cuotas y los intereses son iguales.
          const e = compraEstado(t, c, h), v4 = L.plain(L.ev(`compraEstado(${J(t)},${J(c)},parse('${h}'))`))
          expectClose({ cuota: e.cuota, n: e.n, fact: e.fact, int: e.int }, { cuota: v4.cuota, n: v4.n, fact: v4.k, int: v4.int })
        }
      })
})

describe("pagos reales de la tarjeta (card_payments)", () => {
  // Compra de $1.200.000 a 6 cuotas sin interés el 5 de octubre; corte el 25 → cuota de $200.000 desde el corte de octubre.
  const base = { id: "t1", nombre: "Visa", corte: 25, pago: 10, tasa: 0, purchases: [{ id: "p1", fecha: "2026-10-05", valor: 1200000, cuotas: 6 }] }
  const HOY = "2026-11-05"
  const conPagos = (payments: { fecha: string; valor: number; tipo?: string }[]) => ({ ...base, payments })

  it("sin pagos registrados: el pago del mes es la cuota y la deuda baja en la fecha de pago (10 de nov.)", () => {
    expect(tarjetaPagoMes(base, HOY)).toBe(tarjetaCuotaMes(base, HOY))
    expect(deudaTarjeta(base, HOY)).toBe(compraEstado(base, base.purchases[0], HOY).saldo)
    expect(tarjetasDeuda([base], HOY)).toBe(1200000) // el 5 de nov. aún no vence la primera cuota
    expect(tarjetasDeuda([base], "2026-11-10")).toBe(1000000)
  })

  it("pagar la cuota del mes: el pago del mes queda en cero y la deuda no cambia", () => {
    const t = conPagos([{ fecha: "2026-11-03", valor: 200000, tipo: "minimo" }])
    expect(tarjetaCuotaMes(t, HOY)).toBe(200000)
    expect(tarjetaPagoMes(t, HOY)).toBe(0)
    expect(deudaTarjeta(t, HOY)).toBe(1000000)
    expect(tarjetaPagoMes(t, HOY, 1)).toBe(200000)
  })

  it("pagar de más baja la deuda; pagar de menos la sube y deja el resto del mes por pagar", () => {
    const mas = conPagos([{ fecha: "2026-11-03", valor: 500000 }])
    expect(ajusteTarjeta(mas, HOY)).toBe(500000) // antes de la fecha límite (10 de nov.) el abono baja la deuda completo
    expect(deudaTarjeta(mas, HOY)).toBe(700000)
    expect(tarjetaPagoMes(mas, HOY)).toBe(0)
    const menos = conPagos([{ fecha: "2026-11-03", valor: 50000 }])
    expect(deudaTarjeta(menos, HOY)).toBe(1150000)
    expect(tarjetaPagoMes(menos, HOY)).toBe(150000)
  })

  it("un abono grande deja la deuda en cero y no hay más cuotas que pagar", () => {
    const t = conPagos([{ fecha: "2026-11-03", valor: 1400000 }])
    expect(deudaTarjeta(t, HOY)).toBe(0)
    expect(tarjetaPagoMes(t, HOY, 1)).toBe(0)
  })

  it("el pago total (que marca las compras pagadas) reinicia la cuenta: no resta otra vez", () => {
    const t = { ...base, purchases: [{ ...base.purchases[0], pagada: true }, { id: "p2", fecha: "2026-11-04", valor: 300000, cuotas: 1 }], payments: [{ fecha: "2026-11-02", valor: 1200000, tipo: "total" }] }
    expect(ajusteTarjeta(t, HOY)).toBe(0)
    expect(deudaTarjeta(t, HOY)).toBe(300000)
  })

  it("lee también los pagos en `pagos` (como los deja lib/book-data.ts) e ignora los borrados", () => {
    const t = { ...base, pagos: [{ fecha: "2026-11-03", valor: 500000 }, { fecha: "2026-11-04", valor: 900000, deleted_at: "2026-11-04T10:00:00Z" }] }
    expect(deudaTarjeta(t, HOY)).toBe(700000)
  })

  it("en el flujo del mes salen los pagos reales; si no hay, la estimación", () => {
    const t = conPagos([{ fecha: "2026-11-03", valor: 250000 }])
    const nov = tarjetaFlujoMes(t, 2026, 10, HOY)
    expect(nov.pagos.map((p) => p.valor)).toEqual([250000])
    expect(nov.estimado).toBe(0)
    const dic = tarjetaFlujoMes(t, 2026, 11, HOY)
    expect(dic.pagos).toEqual([])
    expect(dic.estimado).toBe(200000)
  })

  it("pagosTarjetaEntre: el enganche para el saldo de cuentas, con la tarjeta y el medio", () => {
    const t = conPagos([{ fecha: "2026-11-03", valor: 250000 }, { fecha: "2026-12-03", valor: 200000 }]) as never
    expect(pagosTarjetaEntre([{ ...(t as object), payments: [{ fecha: "2026-11-03", valor: 250000, payment_method_id: "m1" }] } as never], "2026-11-01", "2026-11-30")).toEqual([{ fecha: "2026-11-03", valor: 250000, payment_method_id: "m1", card_id: "t1" }])
    expect(pagosTarjetaEntre([t], "2026-12-01", "2026-12-31")).toHaveLength(1)
  })
})

describe("el pago del mes es la factura del corte (no depende del día en que se mire)", () => {
  // Corte el 25, pago el 10. Compra de $600.000 a 3 cuotas sin interés el 1 de octubre: se paga el 10 de nov., dic. y ene.
  const t = { corte: 25, pago: 10, tasa: 0, purchases: [{ id: "a", fecha: "2026-10-01", valor: 600000, cuotas: 3 }] }
  for (const hoy of ["2026-10-02", "2026-11-10", "2026-11-28"])
    it(`mirando el ${hoy}`, () => {
      const base = new Date(hoy + "T12:00:00")
      const mes = (y: number, m: number) => tarjetaCuotaMes(t, hoy, (y - base.getFullYear()) * 12 + (m - base.getMonth()))
      expect(mes(2026, 9)).toBe(0) // octubre: aún no hay corte
      expect(mes(2026, 10)).toBe(200000)
      expect(mes(2026, 11)).toBe(200000)
      expect(mes(2027, 0)).toBe(200000)
      expect(mes(2027, 1)).toBe(0)
    })

  it("compras del 8 de nov.: se pagan desde el 10 de dic. y la deuda no baja sola antes", () => {
    const c = { corte: 25, pago: 10, tasa: 0, purchases: [{ id: "x", fecha: "2026-11-08", valor: 1200000, cuotas: 3 }, { id: "y", fecha: "2026-11-08", valor: 300000, cuotas: 1 }] }
    expect(tarjetaCuotaMes(c, "2026-11-08")).toBe(0)
    expect(tarjetaCuotaMes(c, "2026-11-26", 1)).toBe(400000 + 300000)
    expect(tarjetasDeuda([c], "2026-11-26")).toBe(1500000)
    expect(tarjetasDeuda([c], "2026-12-10")).toBe(800000)
  })

  it("corte antes del pago en el mismo mes (corte 5, pago 20)", () => {
    const c = { corte: 5, pago: 20, tasa: 0, purchases: [{ id: "z", fecha: "2026-11-01", valor: 100000, cuotas: 1 }] }
    expect(tarjetaCuotaMes(c, "2026-11-02")).toBe(100000)
    expect(tarjetasDeuda([c], "2026-11-19")).toBe(100000)
    expect(tarjetasDeuda([c], "2026-11-20")).toBe(0)
  })
})

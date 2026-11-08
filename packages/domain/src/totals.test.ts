import { describe, expect, it } from "vitest"
import { expectClose, scenario } from "./__tests__/adapt"
import { HOYS, RICO } from "./__tests__/fixtures"
import { compraEstado, tarjetaPagoMes, tarjetasDeuda } from "./cards"
import { inv } from "./investments"
import { subMensual, subOcc, subsMes } from "./subscriptions"
import { parseDate } from "./dates"
import {
  cuotasMes, fijosMes, gastosBasicos, gastoVariableReal, hormigas, ingresoMensual, liquidez, totales, variableMes,
} from "./totals"

for (const hoy of HOYS)
  describe(`totales del libro = v4 · hoy ${hoy}`, () => {
    const base = scenario(hoy)
    const rico = scenario(hoy).mutate(RICO)
    for (const [nombre, sc] of [["sample", base], ["sample + extras", rico]] as const) {
      const b = sc.book
      const trm = b.settings.trm
      it(`${nombre}: ingresos, fijos, suscripciones, cuotas y presupuesto variable`, () => {
        expect(ingresoMensual(b.incomes, trm)).toBeCloseTo(sc.ev("ingresoMensual()"), 6)
        expect(fijosMes(b.fixedExpenses)).toBeCloseTo(sc.ev("fijosMes()"), 6)
        expect(subsMes(b.subscriptions, trm)).toBeCloseTo(sc.ev("subsMes()"), 6)
        b.subscriptions.forEach((s, i) => expect(subMensual(s, trm)).toBeCloseTo(sc.ev(`subMensual(S.suscripciones[${i}])`), 6))
        expect(cuotasMes(b.loans, "pagar", hoy)).toBeCloseTo(sc.ev("cuotasMes('pagar')"), 6)
        expect(cuotasMes(b.loans, "cobrar", hoy)).toBeCloseTo(sc.ev("cuotasMes('cobrar')"), 6)
        expect(variableMes(b.categories, b.fixedExpenses)).toBe(sc.ev("variableMes()"))
        expect(gastoVariableReal(b.expenses, b.categories, b.fixedExpenses, hoy)).toBeCloseTo(sc.ev("gastoVariableReal()"), 6)
        expect(gastosBasicos(b, hoy)).toBeCloseTo(sc.ev("gastosBasicos()"), 6)
      })
      it(`${nombre}: liquidez, inversiones y balance`, () => {
        expect(liquidez(b.assets, b.investments, trm, hoy)).toBeCloseTo(sc.ev("liquidez()"), 6)
        b.investments.forEach((x, i) => expectClose(inv(x, hoy), sc.plain(`inv(S.inversiones[${i}])`)))
        expectClose(totales(b, hoy), sc.plain("totales()"))
      })
      it(`${nombre}: gastos hormiga`, () => {
        const h = hormigas(b, hoy)
        const v4 = sc.plain("hormigas()")
        expect(h.mes.map((g) => g.id)).toEqual(v4.mes.map((g: { id: string }) => g.id))
        // Lo registrado es igual a la v4. La proyección ya no es la lineal de la v4 (inflaba lo de pocos días): proyectarMes.
        expectClose({ totalMes: h.totalMes, meses: h.meses }, { totalMes: v4.totalMes, meses: v4.meses })
        expect(h.proy).toBeGreaterThanOrEqual(h.totalMes)
        // porCat: la v4 usa el nombre de la categoría y la v5 el id.
        const porNombre = Object.fromEntries(Object.entries(h.porCat).map(([id, v]) => [b.categories.find((c) => c.id === id)?.nombre ?? "", v]))
        for (const [cat, v] of Object.entries(v4.porCat as Record<string, { n: number; v: number }>)) expectClose(porNombre[b.categories.find((c) => c.nombre.toLowerCase() === cat.toLowerCase())?.nombre ?? ""], v)
      })
      it(`${nombre}: tarjetas de crédito`, () => {
        expect(tarjetasDeuda(b.creditCards, hoy)).toBeCloseTo(sc.ev("tarjetasDeuda()"), 6)
        b.creditCards.forEach((t, i) => {
          for (const off of [0, 1, 3, 11]) expect(tarjetaPagoMes(t, hoy, off)).toBeCloseTo(sc.ev(`tarjetaPagoMes(S.tarjetas[${i}],${off})`), 6)
          t.purchases.forEach((c, j) => expectClose(compraEstado(t, c, hoy), sc.plain(`compraEstado(S.tarjetas[${i}],S.tarjetas[${i}].compras[${j}])`)))
        })
      })
      it(`${nombre}: ocurrencias de suscripciones`, () => {
        b.subscriptions.forEach((s, i) => {
          const a = "2026-09-01"
          const z = "2027-12-31"
          const v5 = subOcc(s, parseDate(a), parseDate(z)).map((d) => d.toISOString())
          const v4 = sc.ev(`subOcc(S.suscripciones[${i}],parse('${a}'),parse('${z}')).map(d=>d.toISOString())`)
          expect(v5).toEqual(Array.from(v4 as string[]))
        })
      })
    }
  })

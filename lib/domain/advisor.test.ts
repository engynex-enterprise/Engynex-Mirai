import { describe, expect, it } from "vitest"
import { expectClose, scenario } from "./__tests__/adapt"
import { HOYS, RICO } from "./__tests__/fixtures"
import { asAnalyze, localInterp, moneyIn, type AdvisorInput } from "./advisor"

const FRASES = [
  "Quiero sacar una tarjeta de crédito, me aprueban un cupo de 5 millones",
  "Comprar un celular de 3 millones a 12 cuotas con la tarjeta",
  "Prestarle 2 millones a mi hermano y que me pague en 6 meses",
  "Pedir un crédito de libre inversión de 15 millones a 36 meses al 1,8%",
  "Mudarme a un arriendo de 2.300.000 al mes",
  "Meter 10 millones en un CDT a 6 meses",
  "Abonar 500 mil a la deuda del banco",
  "Empeñar el reloj por 800 lucas",
  "Prestar 300k a Camilo",
  "Comprar una nevera de 1.800.000",
]

describe("moneyIn / localInterp = v4", () => {
  const sc = scenario(HOYS[0])
  // La v4 normaliza con FN(), que convierte "." en espacio: "2.300.000" no se reconocía (ver NOTAS.md).
  for (const f of FRASES.filter((x) => !/\d\.\d{3}/.test(x)))
    it(f, () => {
      expectClose(moneyIn(f).map((x) => x.v), sc.plain(`moneyIn(${JSON.stringify(f)}).map(x=>x.v)`))
      expectClose(localInterp(f), sc.plain(`localInterp(${JSON.stringify(f)})`))
    })
})

describe("moneyIn con separador de miles (corrección sobre la v4)", () => {
  it("2.300.000 y 1.800.000", () => {
    expect(moneyIn("Mudarme a un arriendo de 2.300.000 al mes").map((x) => x.v)).toEqual([2300000])
    expect(localInterp("Comprar una nevera de 1.800.000")).toMatchObject({ tipo: "comprar", valor: 1800000, forma: "contado" })
    expect(localInterp("Mudarme a un arriendo de 2.300.000 al mes")).toMatchObject({ tipo: "fijo", valor: 2300000 })
  })
})

const CASOS: AdvisorInput[] = [
  { tipo: "comprar", desc: "Nevera", valor: 1800000, forma: "contado" },
  { tipo: "comprar", desc: "Celular", valor: 3000000, forma: "cuotas", cuotas: 12, modoInt: "tasa", tasa: 2 },
  { tipo: "comprar", desc: "TV", valor: 2000000, forma: "cuotas", cuotas: 6, modoInt: "cuota", cuotaV: 380000 },
  { tipo: "comprar", desc: "Moto", valor: 9000000, forma: "cuotas", cuotas: 24, modoInt: "no" },
  { tipo: "credito", desc: "Libre inversión", valor: 15000000, cuotas: 36, modoInt: "tasa", tasa: 1.8, seguros: 40000 },
  { tipo: "credito", desc: "Vivienda", valor: 90000000, cuotas: 120, modoInt: "tasa", tasa: 1.1 },
  { tipo: "prestar", desc: "Hermano", valor: 2000000, cuotas: 6, modoInt: "no" },
  { tipo: "fijo", desc: "Arriendo", valor: 2300000, reemplaza: 1500000 },
  { tipo: "fijo", desc: "Gimnasio", valor: 120000 },
  { tipo: "tarjeta", desc: "Visa", valor: 5000000, manejo: 30000, uso: 900000, pagoModo: "cuotas", cuotas: 6, tasa: 2.1 },
  { tipo: "tarjeta", desc: "Master", valor: 3000000, manejo: 0, pagoModo: "total" },
  { tipo: "invertir", desc: "CDT", valor: 10000000, ea: 11, dias: 180 },
  { tipo: "invertir", desc: "CDT grande", valor: 900000000, ea: 9 },
  { tipo: "empeno", desc: "Reloj", valor: 800000, tasa: 5, cuotas: 4 },
]

for (const hoy of HOYS.slice(0, 2))
  for (const estricto of ["prudente", "equilibrado", "flexible"])
    describe(`asAnalyze = v4 · ${hoy} · ${estricto}`, () => {
      const sc = scenario(hoy).mutate(RICO + `S.cfg.estricto='${estricto}';`)
      const usura = sc.S.cfg.usura
      const casos = [...CASOS, { tipo: "abonar", desc: "Abono", valor: 500000, loanId: sc.S.pagar[0]?.id } as AdvisorInput, { tipo: "prestar", desc: "Contacto", valor: 400000, cuotas: 2, modoInt: "no", contactoId: sc.S.cobrar[0]?.contactoId } as AdvisorInput]
      for (const d of casos)
        it(`${d.tipo} · ${d.desc}`, () => {
          const v4 = sc.plain(`(()=>{const a=asAnalyze(${JSON.stringify(d)});return {v:a.v,R:a.R,m:a.m,X:a.X}})()`)
          const v5 = asAnalyze(sc.book, d, { estricto, usura }, hoy)
          expect(v5.v).toBe(v4.v)
          expect(v5.R).toEqual(v4.R)
          expectClose(v5.X, v4.X)
          const { hist: h5, ...m5 } = v5.m
          const { hist: h4, ...m4 } = v4.m
          expectClose(m5, m4)
          expectClose(h5 ? { n: h5.n, mora: h5.mora, saldo: h5.saldo } : null, h4 ? { n: h4.n, mora: h4.mora, saldo: h4.saldo } : null)
        })
    })

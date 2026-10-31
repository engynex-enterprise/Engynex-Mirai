import { describe, expect, it } from "vitest"
import { rulesOf, scenario } from "./__tests__/adapt"
import { parseCSV, pdate, pnum } from "./csv"

const HOY = "2026-10-31"
const sc = scenario(HOY)
const rules = rulesOf(sc.S)
const catName = (id: string | null) => (id ? sc.book.categories.find((c) => c.id === id)!.nombre : "Otros")

describe("pnum y pdate = v4", () => {
  it.each(["-245.300,00", "4.750.000,00", "1,234.56", "1.234", "1.234.567", "12,5", "1,234", "1234.5", "-9.800", "$ 38.900", "", "abc", "1.5", "2.000,5"])("pnum(%s)", (s) => {
    const v4 = sc.ev(`pnum(${JSON.stringify(s)})`)
    if (Number.isNaN(v4)) expect(pnum(s)).toBeNaN()
    else expect(pnum(s)).toBe(v4)
  })
  it.each(["2026-10-31", "2026/1/5", "31/10/2026", "5-1-26", "05.01.2026", "10/31", "hoy", " 2026-10-31 "])("pdate(%s)", (s) => expect(pdate(s)).toBe(sc.ev(`pdate(${JSON.stringify(s)})`)))
})

const ARCHIVOS: Record<string, string> = {
  "extracto de ejemplo de la v4": "",
  "coma, con comillas y créditos": 'Fecha,Concepto,Monto\n2026-10-01,"UBER, viaje",-17400\n2026-10-02,PAGO NOMINA,4750000\n2026-10-03,"RAPPI ""PIZZA""",-38900\n',
  "tabulador, sin negativos": "Date\tDescripción\tAmount\n01/10/2026\tNetflix\t44900\n02/10/2026\tTerpel\t160000\nmala\tfila\tx\n",
  "sin encabezado": "01/10/2026;Juan Valdez;-9.800,00\n02/10/2026;Carulla;-120.500,00\n",
  "sin columnas reconocibles": "a;b;c\n1;2;3\n",
  vacío: "\n\n",
}

describe("parseCSV = v4", () => {
  for (const [nombre, txt0] of Object.entries(ARCHIVOS))
    it(nombre, () => {
      const txt = txt0 || sc.ev("SAMPLE_CSV")
      const v4 = sc.plain(`parseCSV(${JSON.stringify(txt)})`)
      const v5 = parseCSV(txt, rules)
      if (v4.err) return void expect(v5.err).toBe(v4.err)
      expect(v5.skipped).toBe(v4.skipped)
      expect(v5.rows!.map((r) => ({ fecha: r.fecha, desc: r.descripcion, valor: r.valor, cat: catName(r.category_id), incl: r.incl }))).toEqual(v4.rows)
    })
})

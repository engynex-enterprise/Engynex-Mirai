import { describe, expect, it } from "vitest"
import { loadLegacy } from "./__tests__/legacy"
import { addBiz, addMonths, days, fdate, iso, mkey, parseDate, proxDia, relTime, todayBogota } from "./dates"
import { conv, fmtMoneyInput, formatCompact, formatCOP, formatCurrency, parseMoney, parseNum, pct } from "./money"

const HOY = "2026-10-31"
const L = loadLegacy(HOY)

describe("dinero = v4", () => {
  const vals = [0, 1, -1, 999, 1000, 1234.5, -1234.5, 999999, 1e6, 1234567.89, -987654321, 0.4, 0.5, NaN]
  it.each(vals)("formatCOP / formatCompact (%d)", (v) => {
    expect(formatCOP(v)).toBe(L.call("$", v))
    if (!Number.isNaN(v)) expect(formatCompact(v)).toBe(L.call("$k", v))
  })
  it("formatCOP con texto o vacío", () => {
    expect(formatCOP("1500")).toBe(L.call("$", "1500"))
    expect(formatCOP(null)).toBe(L.call("$", null))
  })
  it.each([[2500, "USD"], [99.99, "USD"], [1500000, "COP"], [10, undefined]])("formatCurrency(%d, %s)", (v, m) => expect(formatCurrency(v, m)).toBe(L.call("fx", v, m)))
  it.each([[0.256, 1], [0.3, 0], [1.5, 2], [Infinity, 1]])("pct(%d, %d)", (v, d) => expect(pct(v, d)).toBe(L.call("pct", v, d)))
  it.each(["1.234.567", "1.234,56", "$ 25.000", "-3.500", "12,5", "abc", "", "  1.000.000,00 "])("parseMoney(%s)", (s) => expect(parseMoney(s)).toBe(L.call("parseMoney", s)))
  it.each(["2,5", "3.75", "", "x"])("parseNum(%s)", (s) => expect(parseNum(s)).toBe(L.call("parseNum", s)))
  it.each([[1234567, false], [1234.567, true], ["", false], [null, false], ["abc", false]])("fmtMoneyInput(%s, %s)", (v, d) => expect(fmtMoneyInput(v as number, d)).toBe(L.call("fmtMoneyInput", v, d)))
  it("conv con TRM (moneda sin tasa → 0)", () => {
    expect(conv(2500, "USD", { USD: 4100 })).toBe(10250000)
    expect(conv(10, "COP", {})).toBe(10)
    expect(conv(10, "GBP", { USD: 4100 })).toBe(0)
  })
})

describe("fechas = v4", () => {
  const fechas = ["2026-01-31", "2024-02-29", "2026-03-31", "2026-12-15", "2026-10-31"]
  it.each(fechas)("addMonths(%s, n)", (f) => {
    for (const n of [-13, -1, 1, 2, 12, 25]) expect(iso(addMonths(parseDate(f), n))).toBe(L.ev(`iso(addMonths(parse('${f}'),${n}))`))
  })
  it.each(fechas)("fdate / mkey / addBiz (%s)", (f) => {
    expect(fdate(parseDate(f))).toBe(L.ev(`fdate(parse('${f}'))`))
    expect(mkey(parseDate(f))).toBe(L.ev(`mkey(parse('${f}'))`))
    expect(iso(addBiz(parseDate(f), 9))).toBe(L.ev(`iso(addBiz(parse('${f}'),9))`))
  })
  it.each(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-12", "2026-09-01"])("relTime(%s)", (f) => expect(relTime(parseDate(f), HOY)).toBe(L.ev(`relTime(parse('${f}'))`)))
  it.each([1, 15, 30, 31])("proxDia(%d)", (d) => expect(iso(proxDia(d, HOY))).toBe(L.ev(`iso(proxDia(${d}))`)))
  it("days redondea", () => expect(days(parseDate("2026-03-01"), parseDate("2026-04-01"))).toBe(31))
  it("parseDate vacío usa el valor por defecto", () => {
    expect(iso(parseDate("", HOY))).toBe(HOY)
    expect(() => parseDate("")).toThrow()
  })
  it("todayBogota usa la hora de Colombia", () => {
    expect(todayBogota(new Date("2026-11-01T03:00:00Z"))).toBe("2026-10-31") // 10 p. m. en Bogotá
    expect(todayBogota(new Date("2026-11-01T06:00:00Z"))).toBe("2026-11-01")
  })
})

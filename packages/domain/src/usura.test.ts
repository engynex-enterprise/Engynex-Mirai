import { describe, expect, it } from "vitest"
import { estadoUsura, mesUsura, usuraDesdeIbc, usuraVigente } from "./usura"

const OCT = { desde: "2026-10-01", hasta: "2026-10-31", tasa_ea: 28.12 }
const NOV = { desde: "2026-11-01", hasta: "2026-11-30", tasa_ea: 28.34, fuente: "Superintendencia Financiera, Resolución 1707 de 2026" }
const DIC = { desde: "2026-12-01", hasta: "2026-12-31", tasa_ea: 28.5 }

describe("usura por mes", () => {
  it("rige la más reciente que ya empezó: la de diciembre, publicada antes, no cuenta en noviembre", () => {
    expect(usuraVigente([OCT, NOV, DIC], "2026-11-10")).toBe(NOV)
    expect(usuraVigente([OCT, NOV, DIC], "2026-12-01")).toBe(DIC)
    expect(usuraVigente([NOV], "2026-10-15")).toBeNull()
  })
  it("noviembre de 2026: interés bancario corriente 18,89 % × 1,5 = 28,34 % E.A.; un mes va del 1 al último día", () => {
    expect(usuraDesdeIbc(18.89)).toBe(28.34)
    expect(mesUsura("2026-11")).toEqual({ desde: "2026-11-01", hasta: "2026-11-30" })
    expect(mesUsura("2028-02")).toEqual({ desde: "2028-02-01", hasta: "2028-02-29" })
  })
  it("alertas: sin tasa, vencida (la fuente se cayó y empezó otro mes) y falta la del mes siguiente al final del mes", () => {
    expect(estadoUsura([], "2026-11-10").alerta).toBe("sin-tasa")
    expect(estadoUsura([OCT, NOV], "2026-12-02")).toMatchObject({ alerta: "vencida", vigente: NOV })
    expect(estadoUsura([OCT, NOV], "2026-11-29")).toMatchObject({ alerta: "falta-siguiente", siguiente: "2026-12" })
    expect(estadoUsura([OCT, NOV, DIC], "2026-11-29").alerta).toBeNull()
    expect(estadoUsura([OCT, NOV], "2026-11-10").alerta).toBeNull()
  })
})

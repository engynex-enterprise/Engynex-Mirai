import { describe, expect, it } from "vitest"
import { detectSubs } from "./subscriptions"

const g = (descripcion: string, valor: number, fecha: string, extra = {}) => ({ descripcion, valor, fecha, ...extra })

describe("detectSubs (v4)", () => {
  it("detecta cobros repetidos en 3+ meses con valor estable", () => {
    const r = detectSubs([g("Spotify", 16900, "2026-08-03"), g("Spotify", 16900, "2026-09-03"), g("spotify ", 17500, "2026-10-03")], [])
    expect(r).toEqual([{ desc: "Spotify", valor: 16900, meses: 3, category_id: null }])
  })
  it("ignora valores que varían más del 15 %, pocos meses, fijos y ya registradas", () => {
    expect(detectSubs([g("Mercado", 100000, "2026-08-01"), g("Mercado", 300000, "2026-09-01"), g("Mercado", 150000, "2026-10-01")], [])).toEqual([])
    expect(detectSubs([g("Gym", 1, "2026-09-01"), g("Gym", 1, "2026-10-01")], [])).toEqual([])
    expect(detectSubs([1, 2, 3].map((m) => g("Arriendo", 9, `2026-0${m}-01`, { fixed_expense_id: "f" })), [])).toEqual([])
    expect(detectSubs([7, 8, 9].map((m) => g("Netflix", 44900, `2026-0${m}-01`)), [{ nombre: "Netflix" }])).toEqual([])
  })
  it("descarta compras muy frecuentes (más de 1,5 por mes)", () => {
    expect(detectSubs([7, 7, 8, 8, 9, 9].map((m, i) => g("Tinto", 5000, `2026-0${m}-0${(i % 2) + 1}`)), [])).toEqual([])
  })
})

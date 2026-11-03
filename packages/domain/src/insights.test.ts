import { describe, expect, it } from "vitest"
import { insights } from "./insights"

const cat = (id: string | null | undefined) => ({ m: "Mercado", r: "Restaurantes", t: "Transporte" })[id ?? ""] ?? "Otros"
const e = (fecha: string, valor: number, category_id: string, descripcion = "x") => ({ fecha, valor, category_id, descripcion })

describe("hallazgos", () => {
  it("detecta la categoría que más sube y la que más baja frente al mismo corte del mes pasado", () => {
    const list = [e("2026-10-05", 100_000, "r"), e("2026-11-05", 300_000, "r"), e("2026-10-06", 400_000, "m"), e("2026-11-06", 200_000, "m"), e("2026-10-28", 999_999, "r")]
    const r = insights(list, cat, "2026-11-10")
    expect(r[0]).toMatchObject({ tipo: "sube", titulo: "Restaurantes subió 200 %" })
    expect(r.find((x) => x.tipo === "baja")?.titulo).toBe("Gastas menos en Mercado")
  })
  it("marca un gasto inusual frente al promedio de 90 días", () => {
    const hist = [e("2026-09-10", 20_000, "t"), e("2026-09-20", 25_000, "t"), e("2026-10-05", 22_000, "t"), e("2026-10-15", 18_000, "t")]
    const r = insights([...hist, e("2026-11-03", 180_000, "t", "Taxi aeropuerto")], cat, "2026-11-10")
    expect(r.find((x) => x.tipo === "inusual")?.titulo).toBe("Gasto fuera de lo normal: Taxi aeropuerto")
  })
  it("encuentra el día de la semana con más gasto cuando hay datos suficientes", () => {
    const sabados = ["2026-09-05", "2026-09-12", "2026-09-19", "2026-09-26", "2026-10-03", "2026-10-10", "2026-10-17", "2026-10-24"].map((f) => e(f, 100_000, "r"))
    const otros = ["2026-09-07", "2026-09-08", "2026-09-09", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-21", "2026-09-22"].map((f) => e(f, 10_000, "m"))
    const r = insights([...sabados, ...otros], cat, "2026-11-01")
    expect(r.find((x) => x.tipo === "dia")?.titulo).toBe("Los sábados son tu día de más gasto")
  })
  it("sin datos no inventa hallazgos", () => {
    expect(insights([], cat, "2026-11-10")).toEqual([])
  })
})

import { describe, expect, it } from "vitest"
import { catId, expectClose, scenario } from "./__tests__/adapt"
import { RICO } from "./__tests__/fixtures"
import { retoEstado, RETOS_T, type ChallengeIn } from "./challenges"

const HOY = "2026-10-31"
const sc = scenario(HOY).mutate(RICO)
const ctx = { expenses: sc.book.expenses, categories: sc.book.categories, umbral: sc.book.settings.umbral }

// Retos en forma v4 (con `cat` por nombre); la v5 guarda `category_id`.
const RETOS = [
  { k: "domis", tipo: "sin_cat", cat: "Domicilios", dias: 30, inicio: "2026-10-30", marcas: [] }, // se rompe? depende de los gastos de ejemplo
  { k: "domis", tipo: "sin_cat", cat: "Domicilios", dias: 30, inicio: "2026-11-01", marcas: [] },
  { k: "rest", tipo: "sin_cat", cat: "Restaurantes", dias: 30, inicio: "2026-09-01", marcas: [] },
  { k: "rest", tipo: "sin_cat", cat: "Viajes", dias: 30, inicio: "2026-09-01", marcas: [] }, // cumplido
  { k: "rest", tipo: "sin_cat", cat: "Viajes", dias: 30, inicio: "2026-10-20", marcas: [] }, // en curso
  { k: "hormiga", tipo: "sin_hormiga", dias: 7, inicio: "2026-10-28", marcas: [] },
  { k: "52", tipo: "semanas", dias: 364, base: 5000, inicio: "2026-08-01", marcas: [1, 2, 3, 5] },
  { k: "52", tipo: "semanas", dias: 364, base: 5000, inicio: "2025-08-01", marcas: Array.from({ length: 52 }, (_, i) => i + 1) },
  { k: "diario", tipo: "diario", dias: 30, base: 10000, inicio: "2026-10-10", marcas: [1, 2, 3] },
]

describe("retoEstado = v4", () => {
  RETOS.forEach((r, i) =>
    it(`${i}: ${r.tipo} ${r.cat ?? ""} desde ${r.inicio}`, () => {
      const v5in: ChallengeIn = { tipo: r.tipo, category_id: r.cat ? catId(sc.S, r.cat) : null, dias: r.dias, base: r.base ?? 0, inicio: r.inicio, marcas: r.marcas }
      const v5 = retoEstado(v5in, ctx, HOY)
      const v4 = sc.plain(`retoEstado(${JSON.stringify(r)})`)
      expectClose({ prog: v5.prog, ok: v5.ok, txt: v5.txt, ahorro: v5.ahorro, fallo: v5.fallo?.id }, { prog: v4.prog, ok: v4.ok, txt: v4.txt, ahorro: v4.ahorro, fallo: v4.fallo?.id })
    }),
  )
  it("el reto de las 52 semanas completo ahorra $ 6.890.000", () => {
    expect(retoEstado({ tipo: "semanas", dias: 364, base: 5000, inicio: "2025-08-01", marcas: Array.from({ length: 52 }, (_, i) => i + 1) }, ctx, HOY).ahorro).toBe(6890000)
  })
  it("plantillas iguales a RETOS_T de la v4", () => expect(RETOS_T).toEqual(sc.plain("RETOS_T")))
})

import { describe, expect, it } from "vitest"
import { APROBAR, LECCIONES, certificados, leccionesDe, minutosAprendidos, notaEvaluacion, pasosDe, preguntasNivel, puntos, racha } from "./academia"

describe("academia e-learning", () => {
  it("pasos: portada, una idea por pantalla, repaso y resultado", () => {
    const l = LECCIONES[0]
    const p = pasosDe(l)
    expect(p[0]).toEqual({ tipo: "intro" })
    expect(p.filter((x) => x.tipo === "punto")).toHaveLength(l.puntos.length)
    expect(p.at(-2)).toEqual({ tipo: "repaso" })
    expect(p.at(-1)).toEqual({ tipo: "fin" })
  })

  it("puntos y minutos", () => {
    const basico = leccionesDe("basico").map((l) => l.id)
    expect(puntos([])).toBe(0)
    expect(puntos(basico)).toBe(basico.length * 10)
    expect(puntos(basico, { basico: { pct: 100, fecha: "2026-11-08" } })).toBe(basico.length * 10 + 30)
    expect(puntos(basico, { basico: { pct: APROBAR - 1, fecha: "2026-11-08" } })).toBe(basico.length * 10)
    expect(puntos(["no-existe"])).toBe(0)
    expect(minutosAprendidos(["presupuesto", "hormiga"])).toBe(5)
  })

  it("racha de días seguidos", () => {
    expect(racha({}, "2026-11-08")).toEqual({ actual: 0, mejor: 0 })
    expect(racha({ a: "2026-11-06", b: "2026-11-07", c: "2026-11-08" }, "2026-11-08")).toEqual({ actual: 3, mejor: 3 })
    expect(racha({ a: "2026-11-06", b: "2026-11-07" }, "2026-11-08").actual).toBe(2) // ayer: sigue viva
    expect(racha({ a: "2026-11-01", b: "2026-11-02", c: "2026-11-03", d: "2026-11-05" }, "2026-11-08")).toEqual({ actual: 0, mejor: 3 })
    expect(racha({ a: "2026-11-08", b: "2026-11-08T10:00:00Z" }, "2026-11-08")).toEqual({ actual: 1, mejor: 1 })
  })

  it("evaluación del nivel y certificados", () => {
    const ps = preguntasNivel("basico")
    expect(ps.length).toBe(leccionesDe("basico").length)
    expect(notaEvaluacion("basico", ps.map((p) => p.correcta))).toBe(100)
    expect(notaEvaluacion("basico", ps.map(() => null))).toBe(0)
    const todas = LECCIONES.map((l) => l.id)
    expect(certificados(todas, {}).niveles).toEqual([])
    const ok = { pct: 100, fecha: "2026-11-08" }
    expect(certificados(leccionesDe("basico").map((l) => l.id), { basico: ok }).niveles).toEqual(["basico"])
    expect(certificados(todas, { basico: ok, intermedio: ok, avanzado: ok }).completa).toBe(true)
  })
})

import { describe, expect, it } from "vitest"
import { scenario } from "./__tests__/adapt"
import { metaDef, metaEstado, METAS, parseMetaCfg } from "./meta"

const HOY = "2026-10-31"

describe("meta financiera principal", () => {
  it("sin meta no hay estado; con título suelto muestra que falta ponerle número", () => {
    const sc = scenario(HOY)
    expect(metaEstado(null, "", sc.book, HOY)).toBeNull()
    const e = metaEstado(null, "Comprar casa", sc.book, HOY)!
    expect(e.titulo).toBe("Comprar casa")
    expect(e.objetivo).toBe(0)
    expect(e.resumen).toMatch(/Ponle un monto/)
  })

  it("meta de ahorro: avance, lo que falta y cuánto al mes", () => {
    const sc = scenario(HOY)
    const g = sc.book.goals[0]
    const e = metaEstado({ tipo: "casa", goal_id: g?.id ?? null, monto: 40_000_000, fecha: "2027-10-31" }, "Comprar casa", sc.book, HOY)!
    expect(e.objetivo).toBe(40_000_000)
    expect(e.llevas).toBe(g ? Number(g.ahorrado) : 0)
    expect(e.falta).toBe(40_000_000 - e.llevas)
    expect(e.meses).toBe(12)
    expect(e.mensual).toBeCloseTo(e.falta / 12, 6)
    expect(e.progreso).toBeCloseTo(e.llevas / 40_000_000, 6)
    expect(e.lograda).toBe(false)
  })

  it("meta lograda cuando se llega al objetivo", () => {
    const sc = scenario(HOY)
    const e = metaEstado({ tipo: "otro", monto: 100 }, "Mi meta", { ...sc.book, goals: [{ id: "g1", nombre: "x", objetivo: 100, ahorrado: 100, fecha: null, icon: "target" } as never] }, HOY)
    const e2 = metaEstado({ tipo: "otro", monto: 100, goal_id: "g1" }, "Mi meta", { ...sc.book, goals: [{ id: "g1", nombre: "x", objetivo: 100, ahorrado: 100, fecha: null, icon: "target" } as never] }, HOY)!
    expect(e).not.toBeNull()
    expect(e2.lograda).toBe(true)
    expect(e2.resumen).toMatch(/Lograste/)
    expect(e2.pasos.find((p) => p.id === "listo")?.ok).toBe(true)
  })

  it("salir de deudas mide lo que ya pagaste desde la base", () => {
    const sc = scenario(HOY)
    const base = 10_000_000
    const e = metaEstado({ tipo: "deudas", base }, "", sc.book, HOY)!
    expect(e.objetivo).toBe(base)
    expect(e.llevas).toBeGreaterThanOrEqual(0)
    expect(e.falta + e.llevas).toBeCloseTo(base, 6)
    expect(e.def.icon).toBe("trending-down")
  })

  it("el fondo de emergencia saca su objetivo de los gastos básicos", () => {
    const sc = scenario(HOY)
    const e = metaEstado({ tipo: "fondo" }, "", sc.book, HOY)!
    expect(e.objetivo).toBeGreaterThan(0)
    expect(e.pasos.some((p) => p.id === "completo")).toBe(true)
    expect(e.siguiente?.id ?? "completo").toBeTruthy()
  })

  it("los pasos que no son automáticos se marcan a mano", () => {
    const sc = scenario(HOY)
    const e = metaEstado({ tipo: "viaje", monto: 5_000_000, pasos: { presu: true } }, "Viaje a San Andrés", sc.book, HOY)!
    expect(e.pasos.find((p) => p.id === "presu")?.ok).toBe(true)
    expect(e.pasos.find((p) => p.id === "meta")?.ok).toBe(false)
  })

  it("parseMetaCfg limpia lo que venga de la base", () => {
    expect(parseMetaCfg(null)).toBeNull()
    expect(parseMetaCfg({ tipo: "inventado" })).toBeNull()
    expect(parseMetaCfg({ tipo: "casa", monto: "x", fecha: "ayer", pasos: { a: true, b: false } })).toEqual({
      tipo: "casa", monto: null, fecha: null, goal_id: null, base: null, creada: null, pasos: { a: true },
    })
  })

  it("cada meta del catálogo tiene pasos y el tipo desconocido cae en «otra meta»", () => {
    expect(METAS.every((m) => m.pasos.length >= 3)).toBe(true)
    expect(metaDef("inventado" as never).tipo).toBe("otro")
  })
})

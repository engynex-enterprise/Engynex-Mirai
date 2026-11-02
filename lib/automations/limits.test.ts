import { describe, expect, it } from "vitest"
import { FREE_PLAN, toPlanInfo } from "@/lib/plans"
import { activeLimit, canActivate, runnable } from "./limits"

const plan = (id: string, limites: unknown, funciones: string[] = []) => toPlanInfo({ id, nombre: id, funciones, limites, precio_mes: id === "gratis" ? 0 : 10_000 })

describe("activeLimit: una sola regla con la base (plan_automation_limit)", () => {
  it("Gratis con su límite en la tabla plans", () => {
    expect(activeLimit(plan("gratis", { libros: 1, personas: 2, automatizaciones: 3 }))).toBe(3)
  })
  it("sin dato en la tabla = sin límite (también Gratis si el administrador lo quita)", () => {
    expect(activeLimit(plan("premium", {}, ["ia", "banco", "impuestos", "familia"]))).toBeNull()
    expect(activeLimit(plan("gratis", { libros: 1 }))).toBeNull()
  })
  it("plan personalizado de la consola: con límite propio o sin límite", () => {
    // Antes la app lo tomaba como ilimitado y la base aplicaba el de Gratis (error críptico al activar).
    const negocio = plan("bussiness", { libros: 3, personas: 10, automatizaciones: 10 }, ["ia", "impuestos"])
    expect(activeLimit(negocio)).toBe(10)
    expect(canActivate(negocio, 9)).toBe(true)
    expect(canActivate(negocio, 10)).toBe(false)
    expect(activeLimit(plan("bussiness", { libros: 3, personas: 10 }))).toBeNull()
    expect(canActivate(plan("bussiness", { libros: 3 }), 500)).toBe(true)
  })
  it("cero es un límite real y lo que no es número no cuenta", () => {
    expect(activeLimit(plan("basico", { automatizaciones: 0 }))).toBe(0)
    expect(canActivate(plan("basico", { automatizaciones: 0 }), 0)).toBe(false)
    expect(activeLimit(plan("raro", { automatizaciones: "5" }))).toBeNull()
    expect(activeLimit(plan("raro", { automatizaciones: -1 }))).toBeNull()
    expect(activeLimit(plan("raro", { automatizaciones: 4.7 }))).toBe(4)
  })
  it("plan que no está en la tabla: el respaldo de Gratis (3), igual que la base", () => {
    expect(activeLimit(toPlanInfo(null))).toBe(3)
    expect(activeLimit(FREE_PLAN)).toBe(3)
  })
})

describe("runnable: al bajar de plan solo corren las primeras N", () => {
  const autos = [
    { id: "c", created_at: "2026-10-03T00:00:00Z" },
    { id: "a", created_at: "2026-10-01T00:00:00Z" },
    { id: "d", created_at: "2026-10-04T00:00:00Z" },
    { id: "b", created_at: "2026-10-02T00:00:00Z" },
  ]
  it("en Gratis (3) quedan las tres más antiguas", () => {
    expect(runnable(plan("gratis", { automatizaciones: 3 }), autos).map((a) => a.id)).toEqual(["a", "b", "c"])
  })
  it("sin límite o dentro del límite corren todas", () => {
    expect(runnable(plan("premium", {}), autos)).toHaveLength(4)
    expect(runnable(plan("gratis", { automatizaciones: 5 }), autos)).toHaveLength(4)
  })
})

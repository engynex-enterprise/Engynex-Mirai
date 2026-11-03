import { describe, expect, it } from "vitest"
import { gastoDeCobro, type GastoCobro } from "./subscriptions"

const NETFLIX = { id: "s1", nombre: "Netflix", provider_id: null }
const g = (o: Partial<GastoCobro> & { id: string }): GastoCobro => ({ fecha: "2026-11-05", descripcion: "Netflix", ...o })

describe("gastoDeCobro: emparejar el cobro de una suscripción con su gasto", () => {
  it("prefiere el gasto enlazado por subscription_id aunque tenga otro nombre", () => {
    const gastos = [g({ id: "a", descripcion: "Netflix" }), g({ id: "b", descripcion: "Pago streaming", subscription_id: "s1", sub_proximo: "2026-11-05" })]
    const usados = new Set<string>()
    expect(gastoDeCobro(NETFLIX, gastos, "2026-11", usados)?.id).toBe("b")
    expect(usados.has("b")).toBe(true)
  })

  it("el enlazado cuenta en el mes del cobro que pagó (sub_proximo), no en el día en que se registró", () => {
    const gastos = [g({ id: "b", fecha: "2026-10-30", subscription_id: "s1", sub_proximo: "2026-11-02" })]
    expect(gastoDeCobro(NETFLIX, gastos, "2026-10", new Set())).toBeUndefined()
    expect(gastoDeCobro(NETFLIX, gastos, "2026-11", new Set())?.id).toBe("b")
  })

  it("sin enlace, respaldo por nombre (sin tildes ni mayúsculas) o por proveedor en el mismo mes", () => {
    expect(gastoDeCobro(NETFLIX, [g({ id: "a", descripcion: "  NETFLIX " })], "2026-11", new Set())?.id).toBe("a")
    expect(gastoDeCobro({ ...NETFLIX, provider_id: "p-claro" }, [g({ id: "c", descripcion: "Claro hogar", provider_id: "p-claro" })], "2026-11", new Set())?.id).toBe("c")
    expect(gastoDeCobro(NETFLIX, [g({ id: "a", fecha: "2026-10-05" })], "2026-11", new Set())).toBeUndefined()
  })

  it("un gasto enlazado a otra suscripción nunca se empareja por nombre, y uno ya usado no se repite", () => {
    expect(gastoDeCobro(NETFLIX, [g({ id: "x", subscription_id: "otra" })], "2026-11", new Set())).toBeUndefined()
    expect(gastoDeCobro(NETFLIX, [g({ id: "a" })], "2026-11", new Set(["a"]))).toBeUndefined()
  })

  it("respeta el filtro (p. ej. gastos que ya salen por otro lado)", () => {
    expect(gastoDeCobro(NETFLIX, [g({ id: "a" })], "2026-11", new Set(), () => false)).toBeUndefined()
  })
})

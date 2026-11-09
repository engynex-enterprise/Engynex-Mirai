import { describe, expect, it } from "vitest"
import { normProv } from "./proveedores"
import { providerDebts, providerMonthly, providerNextPayments, suggestLoanProvider } from "./proveedor-pagos"

const HOY = "2026-11-02"
const fijo = (o: Record<string, unknown>) => ({ id: "f", nombre: "Arriendo", valor: 1000000, frec: "mensual", dia: 5, desde: "2026-10", inicio: "2026-10-01", payments: [], ...o }) as never

describe("providerNextPayments", () => {
  it("toma el próximo periodo sin pagar de un gasto fijo", () => {
    const m = providerNextPayments([fijo({ provider_id: "p1", payments: [{ periodo: "2026-10", fecha: "2026-10-05", valor: 1000000 }] })], [], HOY, {})
    expect(m.get("p1")).toMatchObject({ fecha: "2026-11-05", valor: 1000000, origen: "fijo", vencido: false })
  })
  it("un periodo vencido va primero y queda marcado", () => {
    const m = providerNextPayments([fijo({ provider_id: "p1" })], [], HOY, {})
    expect(m.get("p1")).toMatchObject({ fecha: "2026-10-05", vencido: true })
  })
  it("entre gasto fijo y suscripción gana la fecha más cercana; convierte la moneda", () => {
    const m = providerNextPayments(
      [fijo({ provider_id: "p1", payments: [{ periodo: "2026-10", fecha: "2026-10-05", valor: 1, cierra: true }] })],
      [{ id: "s", nombre: "Nube", provider_id: "p1", valor: 10, currency: "USD", proximo: "2026-11-03", activa: true }], HOY, { USD: 4000 })
    expect(m.get("p1")).toMatchObject({ fecha: "2026-11-03", valor: 40000, origen: "suscripcion", nombre: "Nube" })
  })
  it("un gasto fijo en USD sale convertido, igual que la suscripción", () => {
    const m = providerNextPayments([fijo({ provider_id: "p1", valor: 10, currency: "USD" })], [], HOY, { USD: 4000 })
    expect(m.get("p1")).toMatchObject({ valor: 40_000, origen: "fijo" })
    // Sin tasa guardada no se inventa una cifra (como `conv`).
    expect(providerNextPayments([fijo({ provider_id: "p1", valor: 10, currency: "USD" })], [], HOY, {}).get("p1")).toMatchObject({ valor: 0 })
  })
  it("ignora suscripciones pausadas, sin fecha y registros sin proveedor", () => {
    const m = providerNextPayments([fijo({})], [{ id: "s", nombre: "X", provider_id: "p2", valor: 1, proximo: "2026-11-10", activa: false }, { id: "t", nombre: "Y", provider_id: "p3", valor: 1, proximo: null }], HOY, {})
    expect(m.size).toBe(0)
  })
})

describe("providerDebts", () => {
  const base = { monto: 1200000, sistema: "sin", tasa: 0, frec: "mensual", plazo: 12, inicio: "2026-06-01", extra: 0, payments: [] }
  it("suma lo que le debes y lo que te debe por separado", () => {
    const m = providerDebts([
      { ...base, id: "a", kind: "pagar", provider_id: "p1" },
      { ...base, id: "b", kind: "cobrar", provider_id: "p1", monto: 600000, plazo: 6, inicio: "2026-11-01" },
      { ...base, id: "c", kind: "pagar", provider_id: null },
    ] as never, HOY)
    const d = m.get("p1")!
    expect(d.debes).toBe(1200000)
    expect(d.teDebe).toBe(600000)
    expect(d.loans).toHaveLength(2)
    expect(m.size).toBe(1)
  })
  it("marca mora con cuotas vencidas y la próxima cuota es la vencida más antigua", () => {
    const d = providerDebts([{ ...base, id: "a", kind: "pagar", provider_id: "p1" }] as never, HOY).get("p1")!
    expect(d.mora).toBe(true)
    expect(d.next?.fecha.slice(0, 7)).toBe("2026-07")
    expect(d.next?.valor).toBeCloseTo(100000, 0)
  })
  it("un préstamo saldado no deja próxima cuota ni mora", () => {
    const pays = Array.from({ length: 12 }, (_, j) => ({ id: "q" + j, fecha: "2026-06-15", tipo: "cuota", valor: 0 }))
    const d = providerDebts([{ ...base, id: "a", kind: "pagar", provider_id: "p1", payments: pays }] as never, HOY).get("p1")!
    expect(d.debes).toBe(0)
    expect(d.next).toBeNull()
    expect(d.mora).toBe(false)
  })
})

describe("providerMonthly y suggestLoanProvider", () => {
  it("suma lo pagado por mes en los últimos 12 meses", () => {
    const r = providerMonthly([{ provider_id: "p1", valor: 100, fecha: "2026-11-01" }, { provider_id: "p1", valor: 50, fecha: "2026-11-20" }, { provider_id: "p1", valor: 9, fecha: "2025-01-01" }, { provider_id: "p2", valor: 7, fecha: "2026-11-01" }], "p1", HOY)
    expect(r).toHaveLength(12)
    expect(r[0].mes).toBe("2025-12")
    expect(r.at(-1)).toEqual({ mes: "2026-11", valor: 150 })
  })
  it("sugiere el proveedor con el mismo nombre normalizado", () => {
    const ps = [{ id: "1", nombre: "Bancolombia S.A." }, { id: "2", nombre: "Claro" }]
    expect(suggestLoanProvider("bancolombia sa", ps, normProv)?.id).toBe("1")
    expect(suggestLoanProvider("", ps, normProv)).toBeUndefined()
  })
})


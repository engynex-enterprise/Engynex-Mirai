import { describe, expect, it } from "vitest"
import { findContact, findEntity } from "./registros"

describe("findEntity", () => {
  const ents = [
    { id: "1", nombre: "Compraventa La 14", nit: "" },
    { id: "2", nombre: "Bancolombia S.A.", nit: "890903938" },
  ]
  it("reconoce el mismo nombre escrito distinto (mayúsculas, tildes, puntos, espacios)", () => {
    expect(findEntity(ents, { nombre: "  compraventa   la 14 " })?.id).toBe("1")
    expect(findEntity(ents, { nombre: "COMPRAVENTA LA 14" })?.id).toBe("1")
    expect(findEntity(ents, { nombre: "Bancolombia SA" })?.id).toBe("2")
  })
  it("reconoce el NIT aunque el nombre sea otro", () => {
    expect(findEntity(ents, { nombre: "Banco de Colombia", nit: "890.903.938" })?.id).toBe("2")
  })
  it("no inventa coincidencias", () => {
    expect(findEntity(ents, { nombre: "Compraventa La 15" })).toBeUndefined()
    expect(findEntity(ents, { nombre: "" })).toBeUndefined()
  })
})

describe("findContact", () => {
  const cts = [
    { id: "1", nombre: "Don Jaime", doc: "" },
    { id: "2", nombre: "Ana Pérez", doc: "1020304050" },
  ]
  it("reconoce el mismo nombre (sin tildes ni mayúsculas)", () => {
    expect(findContact(cts, { nombre: "don jaime" })?.id).toBe("1")
    expect(findContact(cts, { nombre: "ANA PEREZ" })?.id).toBe("2")
  })
  it("reconoce el documento", () => {
    expect(findContact(cts, { nombre: "Ana María", doc: "1.020.304.050" })?.id).toBe("2")
  })
  it("mismo nombre con otra cédula es otra persona", () => {
    expect(findContact(cts, { nombre: "Ana Pérez", doc: "999999999" })).toBeUndefined()
    expect(findContact(cts, { nombre: "Don Jaime", doc: "123456789" })?.id).toBe("1")
  })
})

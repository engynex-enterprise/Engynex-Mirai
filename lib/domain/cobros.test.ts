import { describe, expect, it } from "vitest"
import { BRANDS } from "@/lib/brands"
import {
  agrupar, cobroTexto, detectarLlave, ENTIDADES, enmascarar, entidadPorNombre, etiqueta, limpiarLlave, marcarPrincipal, mostrar,
  moverEntidad, moverItem, normalizarCobros, paraCopiar, principalDe, validarCuenta, validarEnlace, validarLlave, type Cobro,
} from "./cobros"

const llave = (id: string, entidad: string, detalle: string, extra: Partial<Cobro> = {}): Cobro => ({ id, medio: "breb", entidad, clase: "llave", detalle, ...extra })
const cuenta = (id: string, entidad: string, detalle: string, extra: Partial<Cobro> = {}): Cobro => ({ id, medio: entidad, entidad, clase: "cuenta", detalle, ...extra })

describe("detectarLlave", () => {
  it("reconoce el tipo de llave Bre-B mientras se escribe", () => {
    expect(detectarLlave("")).toBeNull()
    expect(detectarLlave("@alberto")).toBe("alfanumerica")
    expect(detectarLlave("ana@gmail.com")).toBe("correo")
    expect(detectarLlave("300 123 4567")).toBe("celular")
    expect(detectarLlave("+57 300 123 4567")).toBe("celular")
    expect(detectarLlave("300")).toBe("celular")
    expect(detectarLlave("1.020.345.678")).toBe("cedula")
    expect(detectarLlave("52123456")).toBe("cedula")
    expect(detectarLlave("30012345678")).toBe("cedula")
  })
})

describe("validarLlave", () => {
  it("valida cada tipo con mensajes en español", () => {
    expect(validarLlave("celular", "300 123 4567")).toBeNull()
    expect(validarLlave("celular", "+57 3001234567")).toBeNull()
    expect(validarLlave("celular", "2001234567")).toMatch(/empezar por 3/)
    expect(validarLlave("celular", "300123")).toMatch(/10 dígitos/)
    expect(validarLlave("cedula", "1.020.345.678")).toBeNull()
    expect(validarLlave("cedula", "12a45")).toMatch(/solo números/)
    expect(validarLlave("correo", "ana@gmail.com")).toBeNull()
    expect(validarLlave("correo", "ana@gmail")).toMatch(/correo válido/)
    expect(validarLlave("alfanumerica", "@ana.perez")).toBeNull()
    expect(validarLlave("alfanumerica", "ana")).toMatch(/empieza por @/)
    expect(validarLlave("alfanumerica", "@a b")).toMatch(/sin espacios/)
    expect(validarLlave("comercio", "0012345678")).toBeNull()
    expect(validarLlave("comercio", "ABC")).toMatch(/solo números/)
    expect(validarLlave("celular", "  ")).toBe("Escribe tu llave")
  })
  it("guarda la llave limpia", () => {
    expect(limpiarLlave("celular", "+57 300 123 4567")).toBe("3001234567")
    expect(limpiarLlave("cedula", "1.020.345.678")).toBe("1020345678")
    expect(limpiarLlave("correo", " Ana@Gmail.com ")).toBe("ana@gmail.com")
    expect(limpiarLlave("alfanumerica", " @Ana ")).toBe("@Ana")
  })
})

describe("validarCuenta y validarEnlace", () => {
  it("cuentas: solo dígitos y longitud razonable; billeteras: celular", () => {
    expect(validarCuenta("123-456789-01")).toBeNull()
    expect(validarCuenta("12345")).toMatch(/entre 6 y 20/)
    expect(validarCuenta("123456789012345678901")).toMatch(/entre 6 y 20/)
    expect(validarCuenta("12AB5678")).toMatch(/solo números/)
    expect(validarCuenta("")).toBe("Escribe el número de cuenta")
    expect(validarCuenta("3001234567", true)).toBeNull()
    expect(validarCuenta("123456", true)).toMatch(/empezar por 3/)
    expect(validarEnlace("https://pagos.ejemplo.co/abc")).toBeNull()
    expect(validarEnlace("pagos.ejemplo.co")).toMatch(/https/)
  })
})

describe("enmascarar, mostrar y copiar", () => {
  it("oculta todo menos el final", () => {
    expect(enmascarar(llave("1", "bancolombia", "3001234567"))).toBe("••• ••• 4567")
    expect(enmascarar(llave("2", "bancolombia", "ana.perez@gmail.com"))).toBe("an•••@gmail.com")
    expect(enmascarar(llave("3", "nequi", "@anaperez"))).toBe("@an•••")
    expect(enmascarar(cuenta("4", "bancolombia", "123-456789-01"))).toBe("•••• 8901")
    expect(enmascarar(cuenta("5", "nequi", "3001234567"))).toBe("••• ••• 4567")
  })
  it("muestra con formato y copia lo que pide la app del banco", () => {
    expect(mostrar(llave("1", "bancolombia", "3001234567"))).toBe("300 123 4567")
    expect(mostrar(llave("2", "bancolombia", "1020345678", { llave: "cedula" }))).toBe("1.020.345.678")
    expect(paraCopiar(llave("2", "bancolombia", "1020345678", { llave: "cedula" }))).toBe("1020345678")
    expect(paraCopiar(cuenta("4", "bancolombia", "123-456789-01"))).toBe("12345678901")
    expect(paraCopiar(llave("3", "nequi", "@anaperez"))).toBe("@anaperez")
    expect(etiqueta(cuenta("5", "nequi", "3001234567"))).toBe("Número Nequi")
    expect(etiqueta(cuenta("6", "davivienda", "0012345678", { tipo: "corriente" }))).toBe("Cuenta corriente")
    expect(etiqueta(llave("7", "davivienda", "@ana"))).toBe("Llave Bre-B · Alfanumérica (@)")
  })
})

describe("cobroTexto", () => {
  const items = normalizarCobros([
    llave("a", "bancolombia", "3001234567"),
    cuenta("b", "bancolombia", "123-456789-01", { tipo: "ahorros", titular: "Ana Pérez", doc_tipo: "CC", doc: "1020345678" }),
    cuenta("c", "nequi", "3109876543", { principal: true }),
    llave("d", "breb", "@ana"),
  ])
  it("arma el texto con todas o solo con la principal", () => {
    expect(cobroTexto("Ana", items)).toBe([
      "Para pagarle a Ana:",
      "• Llave Bre-B (Bancolombia): 300 123 4567",
      "• Bancolombia ahorros: 123-456789-01 (a nombre de Ana Pérez, CC 1.020.345.678)",
      "• Nequi: 310 987 6543",
      "• Llave Bre-B: @ana",
    ].join("\n"))
    expect(cobroTexto("Ana", items, "principal")).toBe("Para pagarle a Ana:\n• Nequi: 310 987 6543")
    expect(cobroTexto("Ana", items, "principal", "Me puedes pagar aquí:")).toBe("Me puedes pagar aquí:\n• Nequi: 310 987 6543")
    expect(cobroTexto("Ana", [], "principal")).toBe("Para pagarle a Ana:")
  })
})

describe("normalizarCobros (compatibilidad con la 5.4)", () => {
  it("convierte la lista plana de la 5.4 sin perder datos", () => {
    const v54 = [
      { id: "1", medio: "breb", detalle: "@alberto" },
      { id: "2", medio: "nequi", detalle: "3001234567" },
      { id: "3", medio: "bancolombia", detalle: "123-456789-01", tipo: "corriente", titular: "Alberto" },
      { id: "4", medio: "otro", detalle: "987654321", tipo: "ahorros", banco: "Banco de Bogotá", titular: "Alberto" },
      { id: "5", medio: "otro", detalle: "111222333", banco: "Banco Inventado" },
    ]
    const out = normalizarCobros(v54)
    expect(out.map((c) => [c.entidad, c.clase])).toEqual([["breb", "llave"], ["nequi", "cuenta"], ["bancolombia", "cuenta"], ["banco-bogota", "cuenta"], ["otro", "cuenta"]])
    expect(out[0].llave).toBe("alfanumerica")
    expect(out[0].principal).toBe(true)
    expect(out.filter((c) => c.principal)).toHaveLength(1)
    expect(out[2]).toMatchObject({ detalle: "123-456789-01", tipo: "corriente", titular: "Alberto", medio: "bancolombia" })
    expect(out[3]).toMatchObject({ medio: "otro", banco: "Banco de Bogotá", titular: "Alberto" })
    expect(out[4]).toMatchObject({ medio: "otro", banco: "Banco Inventado" })
    expect(out.map((c) => c.id)).toEqual(["1", "2", "3", "4", "5"])
  })
  it("deja campos que la 5.4 sabe leer y es idempotente", () => {
    const out = normalizarCobros([llave("a", "davivienda", "ana@gmail.com"), cuenta("b", "movii", "3001234567"), cuenta("c", "itau", "1234567", { tipo: "ahorros" })])
    expect(out[0]).toMatchObject({ medio: "breb", llave: "correo" })
    // MOVii e Itaú no existían en la 5.4: van como "otro" con el nombre en banco
    expect(out[1]).toMatchObject({ medio: "otro", banco: "MOVii", entidad: "movii" })
    expect(out[1].tipo).toBeUndefined()
    expect(out[2]).toMatchObject({ medio: "otro", banco: "Itaú", entidad: "itau", tipo: "ahorros" })
    expect(normalizarCobros(out)).toEqual(out)
  })
  it("descarta basura e ids repetidos", () => {
    expect(normalizarCobros(null)).toEqual([])
    expect(normalizarCobros({ a: 1 })).toEqual([])
    const out = normalizarCobros([null, { id: "x", medio: "nequi", detalle: "" }, { id: "x", medio: "nequi", detalle: "3001234567" }, { id: "x", medio: "daviplata", detalle: "3001234568" }])
    expect(out).toHaveLength(2)
    expect(new Set(out.map((c) => c.id)).size).toBe(2)
  })
})

describe("agrupar, ordenar y principal", () => {
  const base = normalizarCobros([llave("a", "bancolombia", "3001234567"), cuenta("n", "nequi", "3109876543"), llave("b", "bancolombia", "@ana")])
  it("agrupa por entidad en el orden en que aparece", () => {
    const g = agrupar(base)
    expect(g.map((x) => x.entidad)).toEqual(["bancolombia", "nequi"])
    expect(g[0].items.map((c) => c.id)).toEqual(["a", "b"])
  })
  it("sube y baja llaves dentro de su entidad y entidades completas", () => {
    expect(moverItem(base, "b", -1).map((c) => c.id)).toEqual(["b", "a", "n"])
    expect(moverItem(base, "a", -1)).toBe(base)
    expect(moverEntidad(base, "nequi", -1).map((c) => c.id)).toEqual(["n", "a", "b"])
    expect(moverEntidad(base, "nequi", 1)).toBe(base)
  })
  it("solo hay una principal", () => {
    const p = marcarPrincipal(base, "n")
    expect(principalDe(p)?.id).toBe("n")
    expect(p.filter((c) => c.principal)).toHaveLength(1)
    expect(principalDe([])).toBeNull()
  })
  it("encuentra la entidad por su nombre", () => {
    expect(entidadPorNombre("banco de bogota")).toBe("banco-bogota")
    expect(entidadPorNombre("Scotiabank")).toBe("colpatria")
    expect(entidadPorNombre("Banco Inventado")).toBeNull()
  })
})

describe("logos", () => {
  it("cada entidad con marca tiene su logo o monograma en lib/brands", () => {
    for (const e of ENTIDADES) if (e.brand) expect(BRANDS[e.brand], e.k).toBeDefined()
  })
})

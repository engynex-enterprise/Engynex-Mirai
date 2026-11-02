import { describe, expect, it } from "vitest"
import { categoriaSugerida, cleanProvName, dedupeNames, findProvider, normProv, providerUsage, sugerenciasPendientes, tipoSugerido } from "./proveedores"

describe("normProv", () => {
  it("ignora mayúsculas, tildes, puntos, comas y espacios de más", () => {
    expect(normProv("  ENEL  ")).toBe("enel")
    expect(normProv("Empresa de Energía")).toBe("empresa de energia")
    expect(normProv("Acueducto   de\tBogotá")).toBe("acueducto de bogota")
    expect(normProv("Sr. César")).toBe(normProv("sr cesar"))
    expect(normProv("Claro S.A.S.")).toBe("claro sas")
    expect(normProv("Inmobiliaria, Ltda")).toBe("inmobiliaria ltda")
  })
  it("conserva la ñ (no es una tilde)", () => {
    expect(normProv("Compañía")).toBe("compañia")
    expect(normProv("Compañía")).not.toBe(normProv("Compania"))
  })
  it("vacío para nulos y espacios", () => {
    expect(normProv(null)).toBe("")
    expect(normProv("   ")).toBe("")
  })
})

describe("deduplicación", () => {
  it("dedupeNames deja una sola forma por nombre (la primera que aparece)", () => {
    expect(dedupeNames(["Enel", "ENEL ", " enel", "EPM", "", null, "Épm", "Claro  Hogar"])).toEqual(["Enel", "EPM", "Claro Hogar"])
  })
  it("findProvider encuentra aunque esté escrito distinto", () => {
    const list = [{ id: "1", nombre: "Acueducto de Bogotá" }, { id: "2", nombre: "Claro" }]
    expect(findProvider(list, "ACUEDUCTO DE BOGOTA")?.id).toBe("1")
    expect(findProvider(list, " claro ")?.id).toBe("2")
    expect(findProvider(list, "Movistar")).toBeUndefined()
    expect(findProvider(list, "  ")).toBeUndefined()
  })
  it("cleanProvName limpia espacios y corta a 120", () => {
    expect(cleanProvName("  Gas   Natural ")).toBe("Gas Natural")
    expect(cleanProvName("x".repeat(200))).toHaveLength(120)
  })
  it("las sugerencias de Colombia excluyen las que ya están en el libro", () => {
    const pend = sugerenciasPendientes([{ nombre: "epm" }, { nombre: "CLARO" }])
    expect(pend.some((s) => s.nombre === "EPM")).toBe(false)
    expect(pend.some((s) => s.nombre === "Claro")).toBe(false)
    expect(pend.some((s) => s.nombre === "Enel")).toBe(true)
  })
})

describe("tipoSugerido", () => {
  it.each([
    ["Acueducto", "servicios"], ["Empresa de energía", "servicios"], ["Vanti", "servicios"], ["EPM", "servicios"],
    ["Operador", "telecom"], ["Claro Hogar", "telecom"], ["Internet fibra", "telecom"],
    ["Inmobiliaria", "vivienda"], ["Conjunto Los Pinos", "vivienda"], ["Administración edificio", "vivienda"],
    ["Colegio", "educacion"], ["Sanitas", "salud"], ["Nueva EPS", "salud"], ["Aseguradora", "seguros"], ["SOAT", "seguros"],
    ["Netflix", "suscripciones"], ["Éxito", "comercio"], ["Sr. Cesar", "otro"], ["Vanessa", "otro"], ["Gasolina Terpel", "transporte"],
  ])("%s → %s", (n, t) => expect(tipoSugerido(n)).toBe(t))
})

describe("categoriaSugerida", () => {
  const cats = [
    { id: "viv", nombre: "Vivienda" }, { id: "ser", nombre: "Servicios públicos" }, { id: "sal", nombre: "Salud" },
    { id: "sus", nombre: "Suscripciones" }, { id: "mer", nombre: "Mercado" },
  ]
  it("usa la categoría por defecto del proveedor si existe", () => {
    expect(categoriaSugerida({ category_id: "sal", tipo: "servicios" }, cats)).toBe("sal")
  })
  it("si la categoría ya no existe, usa la del tipo", () => {
    expect(categoriaSugerida({ category_id: "borrada", tipo: "servicios" }, cats)).toBe("ser")
  })
  it("por tipo: internet → Servicios públicos, arriendo → Vivienda", () => {
    expect(categoriaSugerida({ tipo: "telecom" }, cats)).toBe("ser")
    expect(categoriaSugerida({ tipo: "vivienda" }, cats)).toBe("viv")
    expect(categoriaSugerida({ tipo: "comercio" }, cats)).toBe("mer")
  })
  it("null cuando el tipo no tiene categoría o el libro no la tiene", () => {
    expect(categoriaSugerida({ tipo: "seguros" }, cats)).toBeNull()
    expect(categoriaSugerida({ tipo: "otro" }, cats)).toBeNull()
    expect(categoriaSugerida({ tipo: "educacion" }, cats)).toBeNull()
    expect(categoriaSugerida(null, cats)).toBeNull()
  })
})

describe("providerUsage", () => {
  it("cuenta registros y suma lo que se paga al mes", () => {
    const u = providerUsage({
      fixed: [
        { provider_id: "a", frec: "mensual", valor: 100000 },
        { provider_id: "a", frec: "bimestral", valor: 60000 },
        { provider_id: "b", frec: "quincenal", valor: 50000 },
        { provider_id: null, frec: "mensual", valor: 999 },
      ],
      subs: [
        { provider_id: "a", valor: 120000, ciclo: "anual", comparte: 2, activa: true },
        { provider_id: "a", valor: 30000, ciclo: "mensual", activa: false },
      ],
      expenses: [
        { provider_id: "a", valor: 100000, fecha: "2026-11-02" },
        { provider_id: "a", valor: 90000, fecha: "2026-10-02" },
      ],
    }, {}, "2026-11")
    expect(u.get("a")).toEqual({ fijos: 2, suscripciones: 2, gastos: 2, mensual: 100000 + 30000 + 5000, pagadoMes: 100000 })
    expect(u.get("b")).toEqual({ fijos: 1, suscripciones: 0, gastos: 0, mensual: 100000, pagadoMes: 0 })
    expect(u.has("null")).toBe(false)
  })
})

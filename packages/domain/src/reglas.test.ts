import { describe, expect, it } from "vitest"
import { classify } from "./csv"
import { localCat, matchRule } from "./hormiga"
import { palabraSugerida, reglasDeCorrecciones, sugerirReglas, usoReglas } from "./reglas"

const R = [
  { id: "r1", keyword: "uber", category_id: "transporte" },
  { id: "r2", keyword: "uber eats", category_id: "domicilios" },
  { id: "r3", keyword: "Éxito", category_id: "mercado" },
  { id: "r4", keyword: "exito", category_id: "mercado" },
]

describe("matchRule", () => {
  it("gana la palabra más específica, sin importar el orden", () => {
    expect(matchRule("UBER EATS *PEDIDO", R)?.id).toBe("r2")
    expect(matchRule("UBER *TRIP", R)?.id).toBe("r1")
  })
  it("no distingue mayúsculas ni tildes", () => {
    expect(matchRule("COMPRA ALMACENES EXITO", R)?.id).toBe("r3")
  })
  it("sin coincidencia → undefined", () => {
    expect(matchRule("Arriendo", R)).toBeUndefined()
  })
  it("classify y localCat usan la misma regla", () => {
    expect(classify("uber eats", R)).toBe("domicilios")
    const cats = [{ id: "domicilios", nombre: "Domicilios", grupo: "g" }, { id: "transporte", nombre: "Transporte", grupo: "n" }] as never
    expect(localCat("Uber Eats almuerzo", { rules: R, expenses: [], categories: cats })).toEqual({ category_id: "domicilios", src: "regla" })
  })
  it("localCat salta una regla cuya categoría ya no existe", () => {
    const cats = [{ id: "transporte", nombre: "Transporte", grupo: "n" }] as never
    expect(localCat("uber eats", { rules: R, expenses: [], categories: cats })).toEqual({ category_id: "transporte", src: "regla" })
  })
})

describe("palabraSugerida", () => {
  it.each([
    ["COMPRA POS EXITO CALLE 80 #123", "exito"],
    ["JUAN VALDEZ CAFE", "juan valdez"],
    ["NETFLIX.COM", "netflix"],
    ["PAGO PSE CLARO COLOMBIA", "claro"],
    ["D1 CALLE 45", "d1"],
    ["Rappi Colombia SAS", "rappi"],
    ["123456 789", null],
  ])("%s → %s", (d, k) => expect(palabraSugerida(d)).toBe(k))
})

describe("usoReglas", () => {
  const G = [
    { id: "g1", descripcion: "UBER EATS", category_id: "domicilios" },
    { id: "g2", descripcion: "UBER TRIP", category_id: "otros" },
    { id: "g3", descripcion: "Uber", category_id: "transporte" },
    { id: "g4", descripcion: "Exito", category_id: null },
  ]
  const u = usoReglas(R, G)
  it("cada gasto cuenta solo para la regla que gana", () => {
    expect(u.get("r1")).toMatchObject({ total: 2, distintos: ["g2"] })
    expect(u.get("r2")).toMatchObject({ total: 1, distintos: [] })
  })
  it("marca las reglas más específicas y las repetidas", () => {
    expect(u.get("r1")!.masEspecificas).toEqual(["uber eats"])
    expect(u.get("r3")!.repetida).toBe(true)
    expect(u.get("r4")!.repetida).toBe(true)
    expect(u.get("r2")!.repetida).toBe(false)
  })
  it("un gasto sin categoría cuenta como distinto", () => {
    expect(u.get("r3")!.distintos).toEqual(["g4"])
  })
})

describe("sugerirReglas", () => {
  const G = [
    { descripcion: "COMPRA CARULLA 93", category_id: "mercado" },
    { descripcion: "CARULLA EXPRESS", category_id: "mercado" },
    { descripcion: "carulla", category_id: "mercado" },
    { descripcion: "FARMATODO CL 80", category_id: "salud" },
    { descripcion: "FARMATODO", category_id: "mercado" },
    { descripcion: "UBER TRIP", category_id: "transporte" },
    { descripcion: "UBER TRIP", category_id: "transporte" },
    { descripcion: "Spotify", category_id: null },
    { descripcion: "Spotify", category_id: null },
  ]
  it("propone comercios frecuentes con categoría estable que no cubre ninguna regla", () => {
    expect(sugerirReglas(G, [{ keyword: "uber" }])).toEqual([{ keyword: "carulla", category_id: "mercado", veces: 3 }])
  })
  it("sin reglas, también propone los que ya cubriría una regla", () => {
    expect(sugerirReglas(G, []).map((s) => s.keyword)).toEqual(["carulla", "uber"])
  })
})

describe("reglasDeCorrecciones", () => {
  it("una regla por comercio corregido, sin repetir las existentes", () => {
    const filas = [
      { descripcion: "COMPRA FARMATODO 12", category_id: "salud" },
      { descripcion: "FARMATODO CL 80", category_id: "salud" },
      { descripcion: "UBER TRIP", category_id: "transporte" },
      { descripcion: "UBER EATS", category_id: "transporte" },
      { descripcion: "NETFLIX.COM", category_id: "subs" },
      { descripcion: "SIN CATEGORIA", category_id: null },
    ]
    expect(reglasDeCorrecciones(filas, [{ keyword: "uber", category_id: "transporte" }, { keyword: "uber eats", category_id: "domicilios" }, { keyword: "Netflix", category_id: "otros" }]))
      .toEqual([{ keyword: "farmatodo", category_id: "salud" }])
  })
})

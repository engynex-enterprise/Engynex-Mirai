import { describe, expect, it } from "vitest"
import { normAddr, parseAddr } from "./geo"

describe("normAddr", () => {
  it("formato colombiano", () => {
    expect(normAddr("calle 80 numero 15 - 20 apto 301")).toBe("Cl 80 # 15-20 Apto 301")
    expect(normAddr("carrera 7 # 72-41 interior 2")).toBe("Cra 7 # 72-41 Int 2")
    expect(normAddr("avenida carrera 68 no. 5-30")).toBe("Av. Cra 68 # 5-30")
  })
})

describe("parseAddr", () => {
  it("ciudad después del número", () => {
    const r = parseAddr("calle 80 numero 15-20 apto 301 Chía")!
    expect(r.cityName).toBe("Chía")
    expect(r.depto).toBe("Cundinamarca")
    expect(r.dir).toBe("Cl 80 # 15-20 Apto 301")
  })
  it("barrio explícito y Bogotá D.C.", () => {
    const r = parseAddr("Cra 7 # 72-41 barrio Chapinero Bogotá D.C.")!
    expect(r.cityName).toBe("Bogotá")
    expect(r.barrio).toBe("Chapinero")
    expect(r.dir).toBe("Cra 7 # 72-41")
  })
  it("zona sin ciudad infiere la ciudad (Cedritos → Bogotá)", () => {
    const r = parseAddr("Cl 147 # 12-30 Cedritos")!
    expect(r.cityName).toBe("Bogotá")
    expect(r.barrio).toBe("Cedritos")
  })
  it("texto corto → null", () => expect(parseAddr("cl")).toBeNull())
})

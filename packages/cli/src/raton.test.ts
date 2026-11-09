import { describe, expect, it } from "vitest"
import { parsearRaton, zonaDeClic } from "./raton.ts"

describe("ratón en la terminal", () => {
  it("entiende un clic del botón izquierdo al soltar", () => {
    expect(parsearRaton("\x1b[<0;14;9m")).toEqual({ tipo: "clic", x: 14, y: 9 })
  })

  it("no dispara dos veces: ignora el botón al presionar", () => {
    expect(parsearRaton("\x1b[<0;14;9M")).toBeNull()
  })

  it("entiende la rueda", () => {
    expect(parsearRaton("\x1b[<64;5;5M")?.tipo).toBe("rueda-arriba")
    expect(parsearRaton("\x1b[<65;5;5M")?.tipo).toBe("rueda-abajo")
  })

  it("ignora lo que no es ratón (una tecla cualquiera)", () => {
    expect(parsearRaton("j")).toBeNull()
    expect(parsearRaton("\x1b[A")).toBeNull()
  })
})

describe("zonas de clic", () => {
  const zonas = [
    { id: "menu:salud", fila: 8 },
    { id: "menu:stack", fila: 9 },
    { id: "bloque", fila: 12, alto: 3 },
  ]

  it("encuentra la fila exacta", () => {
    expect(zonaDeClic(8, zonas)).toBe("menu:salud")
    expect(zonaDeClic(9, zonas)).toBe("menu:stack")
  })

  it("respeta el alto de una zona de varias filas", () => {
    expect(zonaDeClic(12, zonas)).toBe("bloque")
    expect(zonaDeClic(14, zonas)).toBe("bloque")
    expect(zonaDeClic(15, zonas)).toBeNull()
  })

  it("un clic fuera de todo no selecciona nada", () => {
    expect(zonaDeClic(1, zonas)).toBeNull()
    expect(zonaDeClic(99, zonas)).toBeNull()
  })
})

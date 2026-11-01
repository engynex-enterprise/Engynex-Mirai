import { describe, expect, it } from "vitest"
import { numLetras } from "./num-letras"

describe("numLetras", () => {
  it.each([
    [0, "Cero"], [1, "Uno"], [15, "Quince"], [21, "Veintiuno"], [100, "Cien"], [101, "Ciento uno"], [999, "Novecientos noventa y nueve"],
    [1000, "Mil"], [21000, "Veintiún mil"], [100000, "Cien mil"], [245300, "Doscientos cuarenta y cinco mil trescientos"],
    [1000000, "Un millón"], [2400000, "Dos millones cuatrocientos mil"], [21000000, "Veintiún millones"], [30000000, "Treinta millones"],
    [1750905, "Un millón setecientos cincuenta mil novecientos cinco"],
  ])("%i → %s", (n, s) => expect(numLetras(n)).toBe(s))
})

import { describe, it } from "vitest"
import { expectClose, scenario } from "./__tests__/adapt"
import { HOYS, RICO } from "./__tests__/fixtures"
import { quincena, type QuincenaWhich } from "./quincena"

const MESES: [number, number][] = [[2026, 9], [2026, 10], [2026, 11], [2027, 1], [2026, 2]]

for (const hoy of HOYS.slice(0, 3))
  describe(`quincena() = v4 · hoy ${hoy}`, () => {
    for (const corte of [15, 10, 27, 0, 40]) {
      const sc = scenario(hoy).mutate(RICO + `S.cfg.corteQ=${corte};`)
      for (const [y, m] of MESES)
        for (const which of ["q1", "q2", "mes"] as QuincenaWhich[])
          it(`corte ${corte} · ${y}-${m + 1} · ${which}`, () => {
            expectClose(quincena(sc.book, y, m, which, hoy), sc.plain(`quincena(${y},${m},'${which}')`))
          })
    }
  })

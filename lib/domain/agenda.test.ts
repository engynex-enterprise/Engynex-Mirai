import { describe, expect, it } from "vitest"
import { expectClose, scenario } from "./__tests__/adapt"
import { HOYS, RICO } from "./__tests__/fixtures"
import { agenda, notifs } from "./agenda"

for (const hoy of HOYS)
  describe(`agenda() y notifs() = v4 · hoy ${hoy}`, () => {
    const sc = scenario(hoy).mutate(RICO)
    it("agenda", () => {
      const v4 = sc.plain("agenda()")
      const v5 = agenda(sc.book, hoy)
      expect(v5.length).toBe(v4.length)
      expectClose(v5, v4)
    })
    it("notifs (todas activas, incluye empeños)", () => {
      // `_rawNotifs` = notifs() de b_core envuelto por j_loans (empeños), antes del filtro por canal de l_ajustes.
      expectClose(notifs(sc.book, hoy), sc.plain("_rawNotifs()"))
    })
    it("notifs con alertas desactivadas y alerta de presupuesto al 50 %", () => {
      const s2 = scenario(hoy).mutate(RICO + "S.cfg.notif.pagos=false;S.cfg.notif.metas=false;S.cfg.alertaPres=50;S.cfg.anticipo=10;")
      expectClose(notifs(s2.book, hoy), s2.plain("_rawNotifs()"))
    })
  })

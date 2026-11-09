import { describe, expect, it } from "vitest"
import { expectClose, scenario } from "./__tests__/adapt"
import { HOYS, RICO } from "./__tests__/fixtures"
import { agenda, avisoOn, conFechasDian, fechasDian, mesadaToca, miSaldoGrupo, notifs, type Notif } from "./agenda"
import { flujo } from "./cashflow"
import { nextOcc } from "./dates"
import type { BookData } from "./types"

/**
 * Lo que la v5 cambia a propósito frente a la v4 se deja por fuera de la comparación:
 * - avisos nuevos: tarjetas (t:), mesadas (ms:), compartidos (sg:) y fechas de ingreso como "te llega" (c:cal:);
 * - inversiones y metas llevan la fecha en el id (para que un vencimiento nuevo vuelva a avisar).
 * En el lado de la v4 se quitan los eventos de ingreso del calendario (allá salían como "Pago… ten listos").
 * - el aviso de gastos hormiga (h:): la proyección ya no es la lineal de la v4 (proyectarMes; ver proyeccion.test.ts).
 */
const V5_ONLY = /^(t|ms|sg|h):|^c:cal:/
const v5Comparable = (N: Notif[]) => N.filter((n) => !V5_ONLY.test(n.id)).map((n) => (/^(i|m):/.test(n.id) ? { ...n, id: n.id.split(":").slice(0, 2).join(":") } : n))
const v4Comparable = (N: Notif[], b: BookData) => {
  const ingreso = new Set(b.calendarEvents.filter((c) => c.tipo === "ingreso").map((c) => c.id))
  return N.filter((n) => !(n.id.startsWith("p:cal:") && ingreso.has(n.id.split(":")[2])) && !n.id.startsWith("h:"))
}

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
      expectClose(v5Comparable(notifs(sc.book, hoy)), v4Comparable(sc.plain("_rawNotifs()"), sc.book))
    })
    it("notifs con alertas desactivadas y alerta de presupuesto al 50 %", () => {
      const s2 = scenario(hoy).mutate(RICO + "S.cfg.notif.pagos=false;S.cfg.notif.metas=false;S.cfg.alertaPres=50;S.cfg.anticipo=10;")
      expectClose(v5Comparable(notifs(s2.book, hoy)), v4Comparable(s2.plain("_rawNotifs()"), s2.book))
    })
  })

// ── Casos propios de la v5 ──────────────────────────────────────────────────────────────────────────────────────

function libro(extra: Partial<BookData> = {}): BookData {
  return {
    settings: { umbral: 25000, limite: 200000, trm: {}, emerg_meta: 6, anticipo: 5, corte_q: 15, alerta_pres: 80 },
    categories: [], incomes: [], extraIncomes: [], expenses: [], fixedExpenses: [], subscriptions: [], loans: [], creditCards: [],
    assets: [], liabilities: [], investments: [], goals: [], calendarEvents: [], contacts: [], entities: [],
    ...extra,
  }
}
const HOY = "2026-11-02"

describe("avisoOn: un tipo sin dato está encendido", () => {
  it("igual que el interruptor de Ajustes › Alertas", () => {
    expect(avisoOn(undefined, "pagos")).toBe(true)
    expect(avisoOn({}, "cobros")).toBe(true)
    expect(avisoOn({ pagos: false }, "pagos")).toBe(false)
    expect(avisoOn({ pagos: true }, "pagos")).toBe(true)
  })
  it("un libro sin la clave sí avisa (antes no avisaba)", () => {
    const b = libro({ fixedExpenses: [{ id: "f1", nombre: "Arriendo", valor: 1500000, frec: "mensual", dia: 4, category_id: null, payments: [] } as never] })
    expect(notifs(b, HOY).some((n) => n.id.startsWith("p:fijo:f1"))).toBe(true)
  })
  it("los interruptores de la persona mandan sobre los del libro", () => {
    const b = libro({ settings: { ...libro().settings, notif: { pagos: true } }, fixedExpenses: [{ id: "f1", nombre: "Arriendo", valor: 1500000, frec: "mensual", dia: 4, category_id: null, payments: [] } as never] })
    expect(notifs(b, HOY, { notif: { pagos: false } }).some((n) => n.id.startsWith("p:"))).toBe(false)
  })
})

describe("calendario: recordatorios de una sola vez", () => {
  const ev = (o: Partial<BookData["calendarEvents"][number]>) => ({ id: "e1", titulo: "Renovar pasaporte", fecha: "2025-11-10", tipo: "egreso", monto: 200000, ...o })
  it("nextOcc: anual se repite y de una sola vez no", () => {
    expect(nextOcc({ fecha: "2025-11-10" }, HOY, 0)).toBe("2026-11-10")
    expect(nextOcc({ fecha: "2025-11-10", anual: false }, HOY, 0)).toBe("2025-11-10")
    expect(nextOcc({ fecha: "2026-11-01" }, HOY, 1)).toBe("2026-11-01")
    expect(nextOcc({ fecha: "2026-11-01" }, HOY, 0)).toBe("2027-11-01")
  })
  it("un recordatorio de una sola vez del año pasado no aparece en la agenda ni en los avisos", () => {
    const b = libro({ calendarEvents: [ev({ anual: false })] })
    expect(agenda(b, HOY)).toHaveLength(0)
    expect(notifs(b, HOY)).toHaveLength(0)
  })
  it("el mismo evento anual sí aparece (como en la v4)", () => {
    expect(agenda(libro({ calendarEvents: [ev({})] }), HOY).map((x) => x.fecha)).toEqual(["2026-11-10"])
  })
  it("de una sola vez dentro de los próximos días sí avisa", () => {
    const b = libro({ calendarEvents: [ev({ fecha: "2026-11-05", anual: false })] })
    expect(notifs(b, HOY).map((n) => n.id)).toEqual(["p:cal:e1:2026-11-05"])
  })
  it("flujo de caja: el de una sola vez solo cuenta en su mes y año", () => {
    const b = libro({ calendarEvents: [ev({ fecha: "2026-12-10", anual: false, monto: 300000 })] })
    const f = flujo(b, HOY)
    expect(f[1].det.fij).toBe(300000)
    expect(f.filter((m) => m.det.fij > 0)).toHaveLength(1)
    const pasado = libro({ calendarEvents: [ev({ fecha: "2025-12-10", anual: false, monto: 300000 })] })
    expect(flujo(pasado, HOY).every((m) => m.det.fij === 0)).toBe(true)
  })
})

describe("eventos de ingreso del calendario (prima, cesantías)", () => {
  const prima = { id: "p1", titulo: "Prima de servicios (2º semestre)", fecha: "2026-11-05", tipo: "ingreso", monto: 900000 }
  it("salen como 'te llega' bajo cobros y no como pago", () => {
    const N = notifs(libro({ calendarEvents: [prima] }), HOY)
    expect(N).toHaveLength(1)
    expect(N[0].id).toBe("c:cal:p1:2026-11-05")
    expect(N[0].t).toMatch(/te llega prima/)
    expect(N[0].b).toMatch(/Te deben pagar cerca de/)
    expect(N[0].b).not.toMatch(/Ten listos/)
  })
  it("respetan el interruptor de cobros", () => {
    expect(notifs(libro({ calendarEvents: [prima] }), HOY, { notif: { cobros: false } })).toHaveLength(0)
  })
})

describe("tarjetas: corte y uso del cupo", () => {
  const tarjeta = (o: Partial<BookData["creditCards"][number]> = {}) => ({ id: "c1", nombre: "Visa", corte: 3, pago: 18, tasa: 2, cupo: 1000000, purchases: [{ id: "x", fecha: "2026-10-20", valor: 400000, cuotas: 1 }], ...o })
  it("avisa el corte de mañana si la tarjeta tiene deuda", () => {
    const N = notifs(libro({ creditCards: [tarjeta()] }), HOY)
    const c = N.find((n) => n.id.startsWith("t:corte:"))
    expect(c?.id).toBe("t:corte:c1:2026-11-03")
    expect(c?.t).toMatch(/Mañana: corte de tu tarjeta Visa/)
  })
  it("sin deuda no avisa el corte", () => {
    expect(notifs(libro({ creditCards: [tarjeta({ purchases: [] })] }), HOY)).toHaveLength(0)
  })
  it("avisa cuando el uso del cupo pasa del 30 % (y sube de nivel en 50 % y 80 %)", () => {
    const N = notifs(libro({ creditCards: [tarjeta({ corte: 20 })] }), HOY)
    expect(N.map((n) => n.id)).toEqual(["t:cupo:c1:2026-11:30"])
    const alto = notifs(libro({ creditCards: [tarjeta({ corte: 20, cupo: 450000 })] }), HOY)
    expect(alto[0].id).toBe("t:cupo:c1:2026-11:80")
    expect(alto[0].lvl).toBe("warn")
    expect(notifs(libro({ creditCards: [tarjeta({ corte: 20, cupo: 2000000 })] }), HOY)).toHaveLength(0)
  })
  it("se apagan con su interruptor", () => {
    expect(notifs(libro({ creditCards: [tarjeta()] }), HOY, { notif: { tarjetas: false } })).toHaveLength(0)
  })
})

describe("fechas DIAN por cédula", () => {
  const filas = [
    { year: 2026, digitos: "78", regimen: "general", fecha: "2026-10-08" },
    { year: 2026, digitos: "05", regimen: "general", fecha: "2026-08-20" },
    { year: 2026, digitos: "05", regimen: "sismo_dec1226", fecha: "2026-11-06" },
  ]
  const regimenes = [{ key: "sismo_dec1226", nombre: "Plazo especial por el sismo", seccionales: ["Cali", "Palmira"] }]
  it("toma la fecha general de los dos últimos dígitos", () => {
    const ev = fechasDian({ digitos: "78", filas })
    expect(ev).toEqual([expect.objectContaining({ id: "dian:2026", fecha: "2026-10-08", anual: false, template_key: "renta_auto" })])
  })
  it("usa el plazo especial solo si la ciudad está en sus seccionales", () => {
    expect(fechasDian({ digitos: "05", filas, regimenes, ciudad: "Bogotá" })[0].fecha).toBe("2026-08-20")
    expect(fechasDian({ digitos: "05", filas, regimenes, ciudad: "Santiago de Cali" })[0].fecha).toBe("2026-11-06")
  })
  it("sin dígitos, o si la renta ya está en el calendario, no agrega nada", () => {
    expect(fechasDian({ digitos: "", filas })).toEqual([])
    expect(fechasDian({ digitos: "78", filas, eventos: [{ template_key: "renta" }] })).toEqual([])
  })
  it("avisa como pago (sin monto) y no se repite el año siguiente", () => {
    const b = conFechasDian(libro(), fechasDian({ digitos: "05", filas, regimenes, ciudad: "Cali" }))
    const N = notifs(b, HOY)
    expect(N.map((n) => n.id)).toEqual(["p:cal:dian:2026:2026-11-06"])
    expect(N[0].b).toMatch(/cédula terminada en 05/)
    expect(notifs(b, "2027-11-02")).toHaveLength(0)
  })
})

describe("mesadas y compartidos", () => {
  it("la mesada toca una semana, una quincena o un mes después de la última", () => {
    expect(mesadaToca({ frec: "semanal", ultima: "2026-10-26" })).toBe("2026-11-02")
    expect(mesadaToca({ frec: "quincenal", ultima: "2026-10-20" })).toBe("2026-11-04")
    expect(mesadaToca({ frec: "mensual", ultima: "2026-10-02" })).toBe("2026-11-02")
    expect(mesadaToca({ frec: "semanal", ultima: null })).toBeNull()
  })
  it("avisa la mesada que toca hoy o está pendiente", () => {
    const N = notifs(libro(), HOY, { extras: { mesadas: [
      { id: "a1", nombre: "Sofía", mesada: 20000, frec: "semanal", ultima: "2026-10-26" },
      { id: "a2", nombre: "Tomás", mesada: 30000, frec: "mensual", ultima: "2026-10-20" },
    ] } })
    expect(N.map((n) => n.id)).toEqual(["ms:a1:2026-11-02"])
    expect(N[0].t).toBe("Hoy toca la mesada de Sofía")
  })
  it("saldo de la persona en un grupo por su primer nombre", () => {
    const gastos = [{ valor: 300000, paga: "Alberto", entre: [] }]
    expect(miSaldoGrupo(["Alberto", "Ana", "Juan"], gastos, "Alberto Navarro")).toBeCloseTo(200000)
    expect(miSaldoGrupo(["Alberto", "Ana", "Juan"], gastos, "Ana")).toBeCloseTo(-100000)
    expect(miSaldoGrupo(["Alberto", "Ana"], gastos, "Pedro")).toBeNull()
  })
  it("avisa lo que te deben o debes en cada grupo", () => {
    const N = notifs(libro(), HOY, { extras: { compartidos: [{ id: "g1", nombre: "Paseo", saldo: 200000 }, { id: "g2", nombre: "Casa", saldo: -50000 }, { id: "g3", nombre: "Cena", saldo: 0.5 }] } })
    expect(N.map((n) => n.id).sort()).toEqual(["sg:g1:2026-11:+", "sg:g2:2026-11:-"])
    expect(notifs(libro(), HOY, { notif: { compartidos: false }, extras: { compartidos: [{ id: "g1", nombre: "Paseo", saldo: 200000 }] } })).toHaveLength(0)
  })
})

describe("ids con fecha (inversiones y metas) e interruptor de empeños", () => {
  it("la meta lleva su fecha en el id", () => {
    const N = notifs(libro({ goals: [{ id: "g1", nombre: "Viaje", objetivo: 1000000, ahorrado: 200000, fecha: "2026-11-20" }] }), HOY)
    expect(N[0].id).toBe("m:g1:2026-11-20")
  })
  it("los empeños tienen su propio interruptor (apagar pagos no los apaga)", () => {
    const L = { id: "L1", kind: "pagar", concepto: "Empeño", monto: 500000, sistema: "simple", tasa: 5, frec: "mensual", plazo: 3, inicio: "2026-10-01", payments: [], prenda: { obj: "Anillo", limite: "2026-11-10" } }
    const b = libro({ loans: [L as never] })
    expect(notifs(b, HOY, { notif: { pagos: false } }).some((n) => n.id.startsWith("pr:"))).toBe(true)
    expect(notifs(b, HOY, { notif: { empenos: false } }).some((n) => n.id.startsWith("pr:"))).toBe(false)
  })
})

describe("aviso propio del gasto fijo", () => {
  // `mes` es 1-indexado (ene = 1): mes 7 = julio, para que el 20 de julio quede a 12 días del 8 de julio.
  const fijo = (extra: object) => ({ id: "f1", nombre: "Predial", valor: 400_000, frec: "anual", dia: 20, mes: 7, desde: "2026-01", payments: [], ...extra })

  it("avisa con los días del gasto aunque el libro diga otra cosa", () => {
    // El libro (`libro()`) avisa 5 días antes; el predial, 15. Faltan 12 días: solo debe avisar el que tiene aviso propio.
    const conPropio = libro({ fixedExpenses: [fijo({ aviso: 15 }) as never] })
    const sinPropio = libro({ fixedExpenses: [fijo({}) as never] })
    const hoy = "2026-07-08"
    expect(notifs(conPropio, hoy).some((n) => n.t.includes("Predial"))).toBe(true)
    expect(notifs(sinPropio, hoy).some((n) => n.t.includes("Predial"))).toBe(false)
  })

  it("agenda marca el aviso del fijo en el ítem", () => {
    const b = libro({ fixedExpenses: [fijo({ aviso: 15 }) as never] })
    expect(agenda(b, "2026-07-08").find((x) => x.k === "fijo")?.aviso).toBe(15)
  })

  it("el estado (st) de la pastilla usa el aviso propio, no el del libro", () => {
    // A 12 días: con aviso propio de 15 ya debe avisar (warn); con el del libro (5) todavía no (ok).
    const conPropio = libro({ fixedExpenses: [fijo({ aviso: 15 }) as never] })
    const sinPropio = libro({ fixedExpenses: [fijo({}) as never] })
    const hoy = "2026-07-08"
    expect(agenda(conPropio, hoy).find((x) => x.k === "fijo")?.st).toBe("warn")
    expect(agenda(sinPropio, hoy).find((x) => x.k === "fijo")?.st).toBe("ok")
  })
})

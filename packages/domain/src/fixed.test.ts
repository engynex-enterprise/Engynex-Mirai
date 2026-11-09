import { describe, expect, it } from "vitest"
import { expectClose, fixedOf, legacyCall, scenario } from "./__tests__/adapt"
import { fijoMensual, fijoPeriods, fijoProxIso, fijoStatus, periodoTexto, sugerirPagoFijo } from "./fixed"

const HOY = "2026-10-31"

// Gastos fijos de prueba en forma v4 (cada uno ejercita una frecuencia o caso borde).
const FIJOS = [
  { id: "m31", nombre: "Mensual día 31", cat: "Vivienda", valor: 100000, frec: "mensual", dia: 31, desde: "2026-01", pagos: [{ per: "2026-09", fecha: "2026-09-30", valor: 100000 }] },
  { id: "q", nombre: "Quincenal", cat: "Otros", valor: 50000, frec: "quincenal", dia: 10, dia2: 31, desde: "2026-08", pagos: [{ per: "2026-10-Q1", fecha: "2026-10-10", valor: 50000 }] },
  { id: "qdef", nombre: "Quincenal sin días", cat: "Otros", valor: 50000, frec: "quincenal", dia: 20, desde: "2026-08", pagos: [] },
  { id: "b", nombre: "Bimestral", cat: "Servicios públicos", valor: 142000, frec: "bimestral", dia: 20, desde: "2026-07", pagos: [] },
  { id: "t", nombre: "Trimestral", cat: "Otros", valor: 300000, frec: "trimestral", dia: 5, desde: "2025-12", pagos: [{ per: "2026-09", fecha: "2026-09-05", valor: 310000 }] },
  { id: "s", nombre: "Semestral", cat: "Otros", valor: 600000, frec: "semestral", dia: 15, desde: "2026-04", pagos: [] },
  { id: "a", nombre: "Anual (SOAT)", cat: "Transporte", valor: 1050000, frec: "anual", dia: 29, mes: 2, desde: "2026-01", pagos: [] },
  { id: "u", nombre: "Único", cat: "Otros", valor: 900000, frec: "unico", dia: 1, fecha: "2026-12-24", desde: "2026-10", pagos: [] },
  { id: "ini", nombre: "Con inicio", cat: "Ahorro", valor: 200000, frec: "quincenal", dia: 15, dia2: 30, desde: "2026-10", inicio: "2026-10-20", pagos: [] },
  { id: "fut", nombre: "Desde el futuro", cat: "Otros", valor: 80000, frec: "mensual", dia: 3, desde: "2027-02", pagos: [] },
]

describe("fijoPeriods = v4 (24 meses × cada frecuencia)", () => {
  const sc = scenario(HOY)
  for (const f of FIJOS)
    it(f.nombre, () => {
      const v5 = fixedOf(sc.S, f)
      for (let k = 0; k < 24; k++) {
        const y = 2026 + Math.floor((k + 0) / 12)
        const m = k % 12
        expect(fijoPeriods(v5, y, m, HOY), `${f.id} ${y}-${m + 1}`).toEqual(legacyCall(sc.L, "fijoPeriods", f, y, m))
      }
    })
})

describe("fijoStatus, fijoProxIso y fijoMensual = v4", () => {
  for (const hoy of ["2026-10-31", "2026-02-28", "2026-12-24", "2027-01-01"]) {
    const sc = scenario(hoy)
    for (const f of FIJOS)
      it(`${hoy} · ${f.nombre}`, () => {
        const v5 = fixedOf(sc.S, f)
        const st = fijoStatus(v5, hoy)
        const v4 = legacyCall(sc.L, "fijoStatus", f)
        const norm = (p: { per: string; due: string; pago?: { per?: string; periodo?: string; fecha: string; valor: number } }) => ({ per: p.per, due: p.due, pagado: p.pago ? p.pago.fecha : null })
        expect(st.periods.map(norm)).toEqual(v4.periods.map(norm))
        expect(st.venc.map(norm)).toEqual(v4.venc.map(norm))
        expect(st.prox && norm(st.prox)).toEqual(v4.prox && norm(v4.prox))
        expect(st.mensual).toBeCloseTo(v4.mensual, 9)
        expect(fijoProxIso(v5, hoy)).toBe(sc.L.call("fijoProxIso", sc.L.ev(`JSON.parse(${JSON.stringify(JSON.stringify(f))})`)))
        expect(fijoMensual(v5)).toBeCloseTo(sc.L.call("fijoMensual", f), 9)
      })
    it(`${hoy} · fijos del ejemplo`, () => {
      sc.book.fixedExpenses.forEach((f, ix) => {
        const v4 = sc.plain(`fijoStatus(S.fijos[${ix}])`)
        expectClose(
          fijoStatus(f, hoy).periods.map((p) => ({ per: p.per, due: p.due })),
          v4.periods.map((p: { per: string; due: string }) => ({ per: p.per, due: p.due })),
        )
      })
    })
  }
  it("fijoProxIso sin fijo → hoy + 10", () => expect(fijoProxIso(null, HOY)).toBe("2026-11-10"))
})

describe("sugerirPagoFijo: un gasto suelto que es el pago de un fijo pendiente", () => {
  const arriendo = { id: "f1", nombre: "Arriendo apartamento", valor: 1500000, frec: "mensual", dia: 5, payments: [] as { periodo: string; fecha: string; valor: number }[] }
  const gasto = { descripcion: "Pago arriendo noviembre", valor: 1500000, fecha: "2026-11-04" }

  it("coincide por palabra del nombre, valor parecido y periodo pendiente cercano", () => {
    expect(sugerirPagoFijo(gasto, [arriendo])).toMatchObject({ per: "2026-11", due: "2026-11-05", valor: 1500000 })
    expect(sugerirPagoFijo({ ...gasto, valor: 1600000 }, [arriendo])?.per).toBe("2026-11")
  })
  it("o por el mismo proveedor aunque el nombre no se parezca", () => {
    expect(sugerirPagoFijo({ ...gasto, descripcion: "Transferencia", provider_id: "p1" }, [{ ...arriendo, provider_id: "p1" }])?.per).toBe("2026-11")
    expect(sugerirPagoFijo({ ...gasto, descripcion: "Transferencia" }, [arriendo])).toBeNull()
  })
  it("si el periodo ya está pagado propone el siguiente cercano; si el valor no se parece, nada", () => {
    const pagado = { ...arriendo, payments: [{ periodo: "2026-11", fecha: "2026-11-03", valor: 1500000 }] }
    expect(sugerirPagoFijo({ ...gasto, fecha: "2026-11-28" }, [pagado])?.per).toBe("2026-12")
    expect(sugerirPagoFijo({ ...gasto, valor: 300000 }, [arriendo])).toBeNull()
  })
  it("nunca para aportes a metas ni para gastos ya enlazados (fijo, tarjeta, préstamo, compartido)", () => {
    expect(sugerirPagoFijo(gasto, [{ ...arriendo, link_type: "meta" }])).toBeNull()
    expect(sugerirPagoFijo({ ...gasto, fixed_expense_id: "f9" }, [arriendo])).toBeNull()
    for (const origen of ["tarjeta", "prestamo", "compartido", "aporte"]) expect(sugerirPagoFijo({ ...gasto, origen }, [arriendo])).toBeNull()
    expect(sugerirPagoFijo({ ...gasto, origen: "correo" }, [arriendo])?.per).toBe("2026-11")
  })
  it("variable: dentro del rango (con margen)", () => {
    const luz = { id: "f2", nombre: "Luz", valor: 100000, frec: "mensual", dia: 20, variable: true, vmin: 80000, vmax: 120000, payments: [] }
    expect(sugerirPagoFijo({ descripcion: "Luz Enel", valor: 130000, fecha: "2026-11-18" }, [luz])?.per).toBe("2026-11")
    expect(sugerirPagoFijo({ descripcion: "Luz Enel", valor: 200000, fecha: "2026-11-18" }, [luz])).toBeNull()
  })
})

describe("periodoTexto", () => {
  it("mes, quincena, año y único", () => {
    expect(periodoTexto("2026-11")).toBe("noviembre")
    expect(periodoTexto("2026-11-Q2")).toBe("la segunda quincena de noviembre")
    expect(periodoTexto("2026")).toBe("2026")
    expect(periodoTexto("U")).toBe("")
  })
})

describe("sugerirPagoFijo con abonos: enlazar el gasto que paga lo que falta", () => {
  // La moto: $70.000 la quincena. Ya abonaste $40.000 y registras un gasto suelto de $30.000.
  const moto = {
    id: "f9", nombre: "Cuota moto", valor: 70000, frec: "mensual", dia: 10,
    payments: [{ id: "p1", periodo: "2026-11", fecha: "2026-11-08", valor: 40000, cierra: false }],
  }
  const resto = { descripcion: "Pago moto", valor: 30000, fecha: "2026-11-10" }

  it("propone el mismo periodo y el valor que falta", () => {
    expect(sugerirPagoFijo(resto, [moto as never])).toMatchObject({ per: "2026-11", valor: 30000, abonado: 40000, completo: true, yaPagado: false })
  })
  it("un abono más pequeño también coincide y no cierra el periodo", () => {
    expect(sugerirPagoFijo({ ...resto, valor: 10000 }, [moto as never])).toBeNull()
    expect(sugerirPagoFijo({ ...resto, valor: 29000 }, [moto as never])).toMatchObject({ valor: 30000, completo: false })
  })
  it("si el periodo quedó cerrado ya no se propone (solo con incluirPagados, para avisar el doble conteo)", () => {
    const cerrado = { ...moto, payments: [{ id: "p1", periodo: "2026-11", fecha: "2026-11-08", valor: 70000, cierra: true }] }
    expect(sugerirPagoFijo({ ...resto, valor: 70000 }, [cerrado as never])?.per).not.toBe("2026-11")
    expect(sugerirPagoFijo({ ...resto, valor: 70000 }, [cerrado as never], resto.fecha, { incluirPagados: true })).toMatchObject({ per: "2026-11", yaPagado: true })
  })
})

describe("hasta: el gasto fijo deja de pedir pagos", () => {
  const base = { id: "f1", nombre: "Plan celular", valor: 60_000, frec: "mensual", dia: 10, desde: "2026-01", payments: [] }

  it("no genera periodos después de la fecha de fin", () => {
    const f = { ...base, hasta: "2026-03-31" }
    expect(fijoPeriods(f, 2026, 2)).toHaveLength(1) // marzo: el día 10 sí entra
    expect(fijoPeriods(f, 2026, 3)).toHaveLength(0) // abril: ya terminó
  })

  it("incluye el periodo que cae justo en la fecha de fin", () => {
    expect(fijoPeriods({ ...base, hasta: "2026-03-10" }, 2026, 2)).toHaveLength(1)
    expect(fijoPeriods({ ...base, hasta: "2026-03-09" }, 2026, 2)).toHaveLength(0)
  })

  it("sin hasta, se comporta igual que siempre", () => {
    expect(fijoPeriods(base, 2026, 3)).toEqual(fijoPeriods({ ...base, hasta: null }, 2026, 3))
  })

  it("fijoMensual da 0 cuando ya terminó y today se pasa", () => {
    const f = { ...base, hasta: "2026-03-31" }
    expect(fijoMensual(f, null, "2026-05-01")).toBe(0)
    expect(fijoMensual(f, null, "2026-03-01")).toBe(60_000)
    expect(fijoMensual(f)).toBe(60_000) // sin today, no cambia nada
  })

  it("fijoStatus de un fijo terminado no deja próximos ni suma al mes", () => {
    const st = fijoStatus({ ...base, hasta: "2026-03-31" }, "2026-06-15")
    expect(st.prox).toBeNull()
    expect(st.mensual).toBe(0)
    // Lo que quedó sin pagar antes de terminar se sigue debiendo.
    expect(st.periods.every((p) => p.due <= "2026-03-31")).toBe(true)
  })
})

describe("fijoStatus: trm convierte mensual igual que fijoMensual (el KPI y la tabla de Fijos no se contradicen)", () => {
  const sub = { id: "netflix", nombre: "Netflix", valor: 10, frec: "mensual", dia: 5, desde: "2026-01", currency: "USD", payments: [] }
  const trm = { USD: 4000, EUR: 4300 }

  it("con trm, mensual sale convertido a pesos", () => {
    expect(fijoStatus(sub, HOY, trm).mensual).toBe(40_000)
  })

  it("sin trm, mensual se queda en la moneda original (igual que siempre)", () => {
    expect(fijoStatus(sub, HOY).mensual).toBe(10)
    expect(fijoStatus(sub, HOY, null).mensual).toBe(10)
  })
})

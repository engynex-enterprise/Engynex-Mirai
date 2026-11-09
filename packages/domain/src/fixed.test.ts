import { describe, expect, it } from "vitest"
import { expectClose, fixedOf, legacyCall, scenario } from "./__tests__/adapt"
import { fijoMensual, fijoPeriods, fijoProxIso, fijoStatus, pagoPeriodo, estadoFijo, faltaEntre, finQuincena, valorPorPago, periodoPagoAlCrear, periodoTexto, primerPeriodo, sugerirPagoFijo } from "./fixed"

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

describe("abonos a un fijo en USD: lo esperado se compara en pesos (los pagos siempre se registran en pesos)", () => {
  const netflix = { id: "netflix", nombre: "Netflix", valor: 10, frec: "mensual", dia: 5, desde: "2026-01", currency: "USD", payments: [] }
  const trm = { USD: 4000 }
  const abono = [{ periodo: "2026-10", fecha: "2026-10-05", valor: 20_000, cierra: false }]

  it("USD 10 a TRM 4.000 esperan $40.000: un abono de $20.000 deja el periodo PARCIAL y faltan $20.000", () => {
    expect(pagoPeriodo(netflix, "2026-10", abono, trm)).toMatchObject({ pagado: 20_000, esperado: 40_000, falta: 20_000, completo: false, parcial: true })
  })

  it("el pago completo en pesos sí cierra el periodo", () => {
    const P = pagoPeriodo(netflix, "2026-10", [{ periodo: "2026-10", fecha: "2026-10-05", valor: 40_000, cierra: false }], trm)
    expect(P).toMatchObject({ pagado: 40_000, falta: 0, completo: true, parcial: false })
  })

  it("fijoStatus con la TRM: el periodo sigue pendiente y lo que falta ya está en pesos", () => {
    const st = fijoStatus({ ...netflix, payments: abono }, HOY, trm)
    expect(st.periods.find((x) => x.per === "2026-10")).toMatchObject({ parcial: true, completo: false, falta: 20_000 })
    expect(st.venc.map((x) => x.per)).toContain("2026-10")
  })

  it("un fijo en pesos se comporta exactamente igual con y sin TRM (paridad con la v4)", () => {
    const moto = { id: "moto", nombre: "Moto", valor: 70_000, frec: "mensual", dia: 5, desde: "2026-01", payments: [] }
    const pagos = [{ periodo: "2026-10", fecha: "2026-10-05", valor: 40_000, cierra: false }]
    expect(pagoPeriodo(moto, "2026-10", pagos, trm)).toEqual(pagoPeriodo(moto, "2026-10", pagos))
    expect(pagoPeriodo(moto, "2026-10", pagos, trm)).toMatchObject({ esperado: 70_000, falta: 30_000, completo: false })
  })
})

describe("«¿Ya lo pagaste este mes?» al crear un gasto fijo", () => {
  // El caso real: el 9 de noviembre se crea "Plan Movil" ($45.000, cada mes el 5) con «Próximo pago: 5 nov» y «Sí, ya lo
  // pagué el 5 nov». Ese pago es el del 5 de noviembre: noviembre no puede salir vencido.
  const movil = { id: "pm", nombre: "Plan Movil", valor: 45_000, frec: "mensual", dia: 5, desde: "2026-11", inicio: "2026-11-05", created_at: "2026-11-09T17:30:13Z", payments: [] as never[] }
  const HOY_PM = "2026-11-09"

  it("el primer periodo que cuida Mirai es el de la fecha de inicio", () => {
    expect(primerPeriodo(movil)).toEqual({ per: "2026-11", due: "2026-11-05" })
  })
  it("si ese primer periodo ya venció, el pago que dijiste que hiciste es el de ese periodo", () => {
    expect(periodoPagoAlCrear(movil, "2026-11-05", HOY_PM)).toBe("2026-11")
  })
  it("si el próximo pago todavía no llega, lo que pagaste este mes fue el periodo anterior (de antes de Mirai)", () => {
    expect(periodoPagoAlCrear({ ...movil, dia: 20, inicio: "2026-11-20" }, "2026-11-03", HOY_PM)).toBe("prev-2026-11")
  })
  it("los pagos ya guardados como «de antes» cuentan para ese primer periodo: noviembre queda pagado, no vencido", () => {
    const f = { ...movil, payments: [{ periodo: "prev-2026-11", fecha: "2026-11-05", valor: 45_000, cierra: true }] }
    expect(pagoPeriodo(f, "2026-11", f.payments)).toMatchObject({ completo: true, pagado: 45_000 })
    const st = fijoStatus(f as never, HOY_PM)
    expect(st.venc).toEqual([])
    expect(st.prox).toMatchObject({ per: "2026-12", due: "2026-12-05" })
  })
  it("con el próximo pago en el futuro, el pago «de antes» no paga ese periodo (sigue pendiente)", () => {
    const f = { ...movil, dia: 20, inicio: "2026-11-20", payments: [{ periodo: "prev-2026-11", fecha: "2026-11-03", valor: 45_000, cierra: true }] }
    expect(pagoPeriodo(f, "2026-11", f.payments).completo).toBe(false)
    expect(fijoStatus(f as never, HOY_PM).prox).toMatchObject({ per: "2026-11", completo: false })
  })
})

describe("estadoFijo: qué etiqueta lleva un gasto fijo y si se puede pagar", () => {
  // Hoy es 9 de noviembre; el aviso del libro es 5 días antes.
  const HOY_E = "2026-11-09"
  const base = { id: "f", nombre: "Plan Movil", valor: 45_000, frec: "mensual", dia: 5, desde: "2026-10", inicio: "2026-10-05", created_at: "2026-10-01T12:00:00Z", payments: [] as { periodo: string; fecha: string; valor: number; cierra?: boolean | null }[] }
  const pago = (periodo: string, fecha: string, valor = 45_000, cierra: boolean | null = true) => ({ periodo, fecha, valor, cierra })
  const E = (f: typeof base, aviso = 5) => estadoFijo(f as never, HOY_E, { anticipo: aviso })

  it("pagado este mes y el próximo es el otro mes: «Pagado», sin botón de pagar", () => {
    const r = E({ ...base, payments: [pago("2026-10", "2026-10-05"), pago("2026-11", "2026-11-05")] })
    expect(r).toMatchObject({ estado: "pagado", porPagar: null, pagadoMes: true })
    expect(r.proximo).toMatchObject({ per: "2026-12", due: "2026-12-05" })
    expect(r.vencidos).toEqual([])
  })
  it("el periodo de este mes ya pasó y no se pagó: vencido, con botón para pagar ese periodo", () => {
    const r = E({ ...base, payments: [pago("2026-10", "2026-10-05")] })
    expect(r).toMatchObject({ estado: "vencido", pagadoMes: false })
    expect(r.porPagar).toMatchObject({ per: "2026-11" })
  })
  it("el pago de este mes todavía no llega: pendiente (o por vencer dentro del aviso), con botón", () => {
    const arriendo = { ...base, nombre: "Arriendo", dia: 15, payments: [pago("2026-10", "2026-10-15")] }
    expect(E(arriendo)).toMatchObject({ estado: "pendiente", porPagar: { per: "2026-11", due: "2026-11-15" } })
    expect(E(arriendo, 7)).toMatchObject({ estado: "pronto" })
  })
  it("ya pagado este mes, pero el siguiente cae dentro de los días de aviso: se puede adelantar", () => {
    const r = estadoFijo({ ...base, payments: [pago("2026-10", "2026-10-05"), pago("2026-11", "2026-11-05")] } as never, "2026-11-28", { anticipo: 10 })
    expect(r).toMatchObject({ estado: "pronto", pagadoMes: true, porPagar: { per: "2026-12" } })
  })
  it("un abono no deja el periodo pagado: sigue con botón y dice cuánto falta", () => {
    const r = E({ ...base, dia: 20, payments: [pago("2026-10", "2026-10-20"), pago("2026-11", "2026-11-03", 20_000, false)] })
    expect(r).toMatchObject({ estado: "pendiente", pagadoMes: false, porPagar: { per: "2026-11", parcial: true, falta: 25_000 } })
  })
  it("quincenal: pagada la 1ª quincena, la 2ª de este mes sigue pendiente", () => {
    const q = { ...base, nombre: "Moto", frec: "quincenal", dia: 5, dia2: 20, payments: [pago("2026-10-Q1", "2026-10-05"), pago("2026-10-Q2", "2026-10-20"), pago("2026-11-Q1", "2026-11-05")] }
    expect(E(q)).toMatchObject({ estado: "pendiente", pagadoMes: false, porPagar: { per: "2026-11-Q2" } })
  })
  it("bimestral sin pago este mes y el próximo lejos: ni pendiente ni botón", () => {
    const agua = { ...base, nombre: "Agua", frec: "bimestral", dia: 15, desde: "2026-10", payments: [pago("2026-10", "2026-10-15")] }
    expect(E(agua)).toMatchObject({ estado: "luego", porPagar: null, pagadoMes: false, proximo: { per: "2026-12" } })
  })
  it("ya terminó (fecha de fin) y todo pagado: terminado, sin botón", () => {
    const r = E({ ...base, hasta: "2026-10-31", payments: [pago("2026-10", "2026-10-05")] } as never)
    expect(r).toMatchObject({ estado: "terminado", porPagar: null, proximo: null })
  })
  it("el pago hecho al crear el fijo (guardado como «de antes») cuenta: no sale vencido ni pide pagar", () => {
    const movil = { ...base, desde: "2026-11", inicio: "2026-11-05", created_at: "2026-11-09T17:30:13Z", payments: [pago("prev-2026-11", "2026-11-05")] }
    expect(E(movil)).toMatchObject({ estado: "pagado", porPagar: null, vencidos: [] })
  })
})

describe("valorPorPago: lo del mes repartido en cada pago", () => {
  it("la gasolina de la moto: $150.000 al mes, cada quincena, son $75.000 por quincena", () => {
    expect(valorPorPago(150_000, "quincenal")).toBe(75_000)
    // Y con $75.000 por quincena, abonar $40.000 a la 1ª deja faltando $35.000 de esa quincena (no del mes).
    expect(pagoPeriodo({ frec: "quincenal", valor: 75_000 }, "2026-11-Q1", [{ periodo: "2026-11-Q1", fecha: "2026-11-15", valor: 40_000, cierra: false }])).toMatchObject({ falta: 35_000, completo: false })
  })
  it("otras frecuencias: cada dos meses se dobla, al año se multiplica por 12; mensual y único no cambian", () => {
    expect(valorPorPago(60_000, "bimestral")).toBe(120_000)
    expect(valorPorPago(50_000, "trimestral")).toBe(150_000)
    expect(valorPorPago(50_000, "anual")).toBe(600_000)
    expect(valorPorPago(80_000, "mensual")).toBe(80_000)
    expect(valorPorPago(80_000, "unico")).toBe(80_000)
  })
})

describe("lo que falta en la quincena y en el mes", () => {
  const moto = { id: "m", nombre: "Gasolina Moto", valor: 75_000, frec: "quincenal", dia: 15, dia2: 30, desde: "2026-11", payments: [{ periodo: "2026-11-Q1", fecha: "2026-11-15", valor: 40_000, cierra: false }] }
  it("fin de la quincena según el corte del libro", () => {
    expect(finQuincena("2026-11-09")).toBe("2026-11-15")
    expect(finQuincena("2026-11-16")).toBe("2026-11-30")
    expect(finQuincena("2026-11-16", 20)).toBe("2026-11-20")
  })
  it("la moto: en esta quincena faltan $35.000; en el mes, $110.000", () => {
    const st = fijoStatus(moto as never, "2026-11-09")
    expect(faltaEntre(st.periods, "2026-11-01", finQuincena("2026-11-09"))).toBe(35_000)
    expect(faltaEntre(st.periods, "2026-11-01", "2026-11-30")).toBe(110_000)
  })
})

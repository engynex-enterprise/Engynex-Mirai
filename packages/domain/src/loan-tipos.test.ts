import { describe, expect, it } from "vitest"
import {
  LOAN_TIPOS, TASA_EMPENO, camposLoan, esTipo, faltantesLoan, loanTipo, loanTitulo, sistemaDe, textosLoan, tipoDefaults, tiposDe,
  type LoanFormState,
} from "./loan-tipos"
import { DIAS_MES, costoDelPlazo, mensualDeEA, previewLoan, tasaMensualAcordada, tasaParaInteres } from "./loans"

const HOY = "2026-11-02"
const base = (s: Partial<LoanFormState>): LoanFormState => ({ tipo: null, kind: "pagar", monto: 0, inicio: HOY, ...s })

describe("tipos que se ofrecen", () => {
  it("Le debo: banco, empeño, fiado, persona, compra a cuotas, gota a gota y otro", () => {
    expect(tiposDe("pagar").map((t) => t.value)).toEqual(["banco", "empeno", "fiado", "persona", "cuotas", "gota", "otro"])
  })
  it("Me deben: le presté a una persona, le fié a un cliente y otro", () => {
    expect(tiposDe("cobrar").map((t) => t.value)).toEqual(["presto", "vendi", "otro"])
  })
  it("solo el gota a gota trae aviso de riesgo, y menciona la usura", () => {
    expect(LOAN_TIPOS.filter((t) => t.riesgo).map((t) => t.value)).toEqual(["gota"])
    expect(LOAN_TIPOS.find((t) => t.value === "gota")!.riesgo).toMatch(/usura/)
  })
  it("esTipo respeta el lado (no hay empeño en Me deben)", () => {
    expect(esTipo("empeno", "pagar")).toBe(true)
    expect(esTipo("empeno", "cobrar")).toBe(false)
    expect(esTipo("otro", "cobrar")).toBe(true)
    expect(esTipo("tarjeta")).toBe(false)
  })
})

describe("deducción del tipo en préstamos de antes (tipo = null)", () => {
  it("usa el tipo guardado si es válido para el lado", () => {
    expect(loanTipo({ tipo: "cuotas", kind: "pagar" })).toBe("cuotas")
    expect(loanTipo({ tipo: "empeno", kind: "cobrar", contact_id: "c" })).toBe("presto")
  })
  it("Le debo: prenda → empeño, fiado → fiado, entidad → banco, contacto → persona, nada → otro", () => {
    expect(loanTipo({ kind: "pagar", prenda: { obj: "Reloj" }, entity_id: "e" })).toBe("empeno")
    expect(loanTipo({ kind: "pagar", fiado: true, contact_id: "c" })).toBe("fiado")
    expect(loanTipo({ kind: "pagar", entity_id: "e" })).toBe("banco")
    expect(loanTipo({ kind: "pagar", contact_id: "c" })).toBe("persona")
    expect(loanTipo({ kind: "pagar" })).toBe("otro")
  })
  it("Me deben: con contacto → le presté a una persona; sin contacto → otro", () => {
    expect(loanTipo({ kind: "cobrar", contact_id: "c", prenda: { obj: "Moto" } })).toBe("presto")
    expect(loanTipo({ kind: "cobrar" })).toBe("otro")
  })
})

describe("valores por defecto", () => {
  it("empeño: sistema americano, interés mensual habitual, 4 meses", () => {
    expect(tipoDefaults("empeno", "pagar")).toMatchObject({ pago: "cuotas", interes: "tasa", sistema: "americano", plazo: 4, tasa: String(TASA_EMPENO) })
  })
  it("fiado y venta fiada: un solo pago y sin intereses", () => {
    expect(tipoDefaults("fiado", "pagar")).toMatchObject({ pago: "unico", interes: "no" })
    expect(tipoDefaults("vendi", "cobrar")).toMatchObject({ pago: "unico", interes: "no" })
  })
  it("banco: cuota mensual conocida; persona: sin intereses; gota a gota: diario de lunes a sábado", () => {
    expect(tipoDefaults("banco", "pagar")).toMatchObject({ interes: "cuota", frec: "mensual", plazo: 36 })
    expect(tipoDefaults("persona", "pagar")).toMatchObject({ interes: "no", pago: "cuotas" })
    expect(tipoDefaults("gota", "pagar")).toMatchObject({ frec: "diariohab", plazo: 30, interes: "cuota" })
  })
  it("respeta los valores de Ajustes donde aplica (persona y otro) sin aceptar pago único como frecuencia", () => {
    expect(tipoDefaults("persona", "pagar", { frec: "quincenal", plazo: 8 })).toMatchObject({ frec: "quincenal", plazo: 8 })
    expect(tipoDefaults("otro", "pagar", { frec: "unico", sistema: "aleman" })).toMatchObject({ frec: "mensual", sistema: "aleman" })
    expect(tipoDefaults("otro", "cobrar").interes).toBe("no")
  })
})

describe("campos visibles por tipo", () => {
  it("banco: entidad, clase de crédito, foto, E.A., seguros y pagos anteriores; sin garantía ni nota", () => {
    const c = camposLoan("banco", "pagar", { interes: "tasa" })
    expect(c).toMatchObject({ quien: "ent", tipoCredito: true, foto: true, ea: true, extra: true, hist: true, prenda: "no", nota: false, pdf: false })
    expect(c.pagos).toEqual(["cuotas"])
    expect(c.intereses).toEqual(["cuota", "tasa"])
  })
  it("empeño: casa de empeño, objeto obligatorio, interés en % o en pesos (refrendo) y siempre «solo intereses» (americano)", () => {
    const c = camposLoan("empeno", "pagar")
    expect(c).toMatchObject({ quien: "casa", ctCorto: false, prenda: "si", concepto: false, sistema: false, frecs: [], foto: false })
    expect(c.intereses).toEqual(["tasa", "valor"])
    expect(sistemaDe("empeno", "tasa", "frances", c)).toBe("americano")
    expect(sistemaDe("empeno", "valor", "frances", c)).toBe("americano")
  })
  it("fiado: tienda (proveedor), una fecha o abonos libres, recargo opcional, sin cuotas ni pagos anteriores", () => {
    const c = camposLoan("fiado", "pagar")
    expect(c).toMatchObject({ quien: "prov", plazo: false, vence: true, hist: false, extra: false, ea: false })
    expect(c.pagos).toEqual(["unico", "libre"])
    expect(c.intereses).toEqual(["no", "tasa"])
  })
  it("persona: contacto, forma de pago, nota y acuerdo en PDF; con cuotas aparecen frecuencia y pagos anteriores", () => {
    expect(camposLoan("persona", "pagar", { pago: "unico" })).toMatchObject({ quien: "ct", vence: true, plazo: false, hist: false, nota: true, pdf: true })
    const c = camposLoan("persona", "pagar", { pago: "cuotas" })
    expect(c).toMatchObject({ plazo: true, vence: false, hist: true })
    expect(c.frecs.length).toBeGreaterThan(1)
    expect(c.intereses).toEqual(["no", "tasa", "valor", "cuota"])
  })
  it("sin cuotas no se ofrece 'sé cuánto es la cuota'", () => {
    expect(camposLoan("persona", "pagar", { pago: "libre" }).intereses).toEqual(["no", "tasa", "valor"])
  })
  it("compra a cuotas: almacén, cuota inicial, seguros y foto de la factura", () => {
    expect(camposLoan("cuotas", "pagar")).toMatchObject({ quien: "prov", inicial: true, extra: true, foto: true, concepto: true })
  })
  it("gota a gota: un contacto (basta el apodo y el celular), frecuencias diarias o semanal, nota", () => {
    const c = camposLoan("gota", "pagar")
    expect(c).toMatchObject({ quien: "ct", ctCorto: true, nota: true, extra: false })
    expect(c.frecs).toEqual(["diariohab", "diario", "semanal"])
  })
  it("Me deben: le presté con garantía opcional; venta fiada sin E.A.; otro con entidad o persona", () => {
    expect(camposLoan("presto", "cobrar")).toMatchObject({ quien: "ct", prenda: "opcional", pdf: true, extra: false })
    expect(camposLoan("vendi", "cobrar", { interes: "tasa" })).toMatchObject({ ea: false, prenda: "no" })
    expect(camposLoan("otro", "cobrar")).toMatchObject({ quien: "libre", prenda: "opcional" })
  })
  it("el sistema se escoge solo con tasa y cuotas; si no, el propio del tipo", () => {
    const c = camposLoan("persona", "pagar", { interes: "tasa", pago: "cuotas" })
    expect(c.sistema).toBe(true)
    expect(sistemaDe("persona", "tasa", "aleman", c)).toBe("aleman")
    expect(sistemaDe("persona", "no", "aleman", c)).toBe("sin")
    expect(sistemaDe("banco", "cuota", "aleman", camposLoan("banco", "pagar"))).toBe("frances")
    expect(sistemaDe("gota", "tasa", "frances", camposLoan("gota", "pagar", { interes: "tasa" }))).toBe("simple")
  })
})

describe("campos obligatorios por tipo", () => {
  it("sin tipo solo pide escoger el tipo", () => {
    expect(faltantesLoan(base({})).map((f) => f.campo)).toEqual(["tipo"])
    expect(faltantesLoan(base({ kind: "cobrar" }))[0].msg).toBe("Escoge el tipo de préstamo")
  })
  it("banco: entidad, valor y cuota (o tasa)", () => {
    expect(faltantesLoan(base({ tipo: "banco", interes: "cuota", plazo: 36 })).map((f) => f.campo)).toEqual(["quien", "monto", "cuota"])
    expect(faltantesLoan(base({ tipo: "banco", entity: "e", monto: 1e6, interes: "cuota", cuota: 50_000, plazo: 36 }))).toEqual([])
    expect(faltantesLoan(base({ tipo: "banco", entity: "e", monto: 1e6, interes: "tasa", plazo: 36 })).map((f) => f.campo)).toEqual(["tasa"])
    expect(faltantesLoan(base({ tipo: "banco", entity: "e", monto: 1e6, interes: "tasa", ea: 24, plazo: 36 }))).toEqual([])
  })
  it("empeño: la casa (siempre una entidad escogida o creada), el objeto, el valor y el interés", () => {
    const st = base({ tipo: "empeno", monto: 500_000, tasa: 4, plazo: 4 })
    expect(faltantesLoan(st).map((f) => f.campo)).toEqual(["quien", "obj"])
    expect(faltantesLoan(st)[0].msg).toBe("Escoge o crea la casa de empeño")
    // Un nombre escrito ya no basta: hay que escoger o crear la entidad (así no se repite la compraventa).
    expect(faltantesLoan({ ...st, nombreNuevo: "Compraventa La 14", obj: "Cadena" }).map((f) => f.campo)).toEqual(["quien"])
    expect(faltantesLoan({ ...st, entity: "e", obj: "Cadena" })).toEqual([])
    expect(faltantesLoan({ ...st, entity: "e", obj: "Cadena", tasa: 0 }).map((f) => f.campo)).toEqual(["tasa"])
  })
  it("fiado: la tienda, el valor y una fecha de pago después de la compra", () => {
    const st = base({ tipo: "fiado", monto: 80_000, pago: "unico", vence: HOY })
    expect(faltantesLoan(st).map((f) => f.campo)).toEqual(["quien", "vence"])
    expect(faltantesLoan({ ...st, prov: "p", vence: "2026-12-02" })).toEqual([])
  })
  it("persona: nombre de alguien nuevo o el contacto escogido", () => {
    const st = base({ tipo: "persona", monto: 300_000, pago: "cuotas", plazo: 3, interes: "no" })
    expect(faltantesLoan({ ...st, quien: "new", nombreNuevo: "  " })[0].msg).toBe("Escribe el nombre de la persona")
    expect(faltantesLoan({ ...st, quien: "ex" })[0].msg).toBe("Escoge el contacto")
    expect(faltantesLoan({ ...st, quien: "new", nombreNuevo: "Ana" })).toEqual([])
  })
  it("compra a cuotas: el almacén y una cuota inicial menor que la compra", () => {
    const st = base({ tipo: "cuotas", prov: "p", monto: 1_200_000, inicial: 1_200_000, interes: "no", plazo: 12 })
    expect(faltantesLoan(st).map((f) => f.campo)).toEqual(["inicial"])
    expect(faltantesLoan({ ...st, inicial: 200_000 })).toEqual([])
  })
  it("gota a gota: quien presta es obligatorio (contacto o apodo nuevo) y la cuota también", () => {
    const st = base({ tipo: "gota", monto: 500_000, interes: "cuota", plazo: 30 })
    expect(faltantesLoan({ ...st, quien: "new" }).map((f) => f.campo)).toEqual(["quien", "cuota"])
    expect(faltantesLoan({ ...st, quien: "new" })[0].msg).toBe("Escribe el nombre o el apodo de quien te prestó")
    expect(faltantesLoan({ ...st, quien: "ex", cuota: 25_000 })[0].msg).toBe("Escoge el contacto")
    expect(faltantesLoan({ ...st, quien: "new", nombreNuevo: "Don Jaime", cuota: 25_000 })).toEqual([])
    expect(faltantesLoan({ ...st, quien: "ex", contact: "c", cuota: 25_000 })).toEqual([])
  })
  it("ningún tipo se guarda sin un registro de quien presta", () => {
    for (const kind of ["pagar", "cobrar"] as const) for (const t of tiposDe(kind)) {
      const st = base({ tipo: t.value, kind, monto: 100_000, pago: "unico", vence: "2026-12-02", interes: "no", plazo: 1, obj: "Reloj", tasa: 4, cuota: 10_000 })
      expect(faltantesLoan(st).map((f) => f.campo), `${kind}/${t.value}`).toContain("quien")
    }
  })
  it("otro en Le debo: con banco o entidad pide la entidad", () => {
    const st = base({ tipo: "otro", monto: 100_000, pago: "cuotas", interes: "no", plazo: 2, quien: "ent" as const })
    expect(faltantesLoan(st)[0].msg).toBe("Escoge el banco o la entidad")
    expect(faltantesLoan({ ...st, entity: "e" })).toEqual([])
  })
})

describe("textos por tipo", () => {
  it("el valor se pregunta con las palabras de cada tipo", () => {
    expect(textosLoan("banco", "pagar").monto).toBe("¿Cuánto te prestaron?")
    expect(textosLoan("empeno", "pagar").monto).toBe("¿Cuánto te prestaron sobre el objeto?")
    expect(textosLoan("fiado", "pagar").monto).toBe("¿Cuánto fue lo que te fiaron?")
    expect(textosLoan("persona", "pagar").monto).toBe("¿Cuánto te prestó?")
    expect(textosLoan("cuotas", "pagar").monto).toBe("Valor de la compra")
    expect(textosLoan("presto", "cobrar").monto).toBe("¿Cuánto le prestaste?")
    expect(textosLoan("vendi", "cobrar").monto).toBe("¿Cuánto te quedó debiendo?")
  })
  it("el botón y el aviso cambian con el tipo", () => {
    expect(textosLoan(null, "pagar").boton).toBe("Registrar deuda")
    expect(textosLoan(null, "cobrar").boton).toBe("Registrar préstamo")
    expect(textosLoan("empeno", "pagar")).toMatchObject({ boton: "Registrar empeño", toast: "Empeño registrado." })
    expect(textosLoan("fiado", "pagar")).toMatchObject({ boton: "Registrar fiado", toast: "Fiado registrado." })
    expect(textosLoan("vendi", "cobrar").boton).toBe("Registrar venta fiada")
  })
  it("la cuota del banco y del gota a gota sigue la frecuencia", () => {
    expect(textosLoan("banco", "pagar", { frec: "mensual" }).cuota).toBe("Cuota mensual")
    expect(textosLoan("banco", "pagar", { frec: "quincenal" }).plazo).toBe("Plazo en quincenas")
    expect(textosLoan("gota", "pagar", { frec: "diariohab" }).cuota).toBe("¿Cuánto pagas cada día?")
  })
  it("la ayuda dice dónde queda guardado quien presta", () => {
    expect(textosLoan("banco", "pagar").quienHint).toMatch(/Contactos › Personas › Bancos y entidades/)
    expect(textosLoan("empeno", "pagar").quienHint).toMatch(/Contactos › Personas › Bancos y entidades/)
    expect(textosLoan("fiado", "pagar").quienHint).toMatch(/Proveedores/)
    expect(textosLoan("cuotas", "pagar").quienHint).toMatch(/Proveedores/)
    expect(textosLoan("persona", "pagar").quienHint).toBe("Queda en Contactos › Personas.")
    expect(textosLoan("gota", "pagar").quienHint).toMatch(/Don Jaime.*Contactos/)
    expect(textosLoan("presto", "cobrar").quienHint).toBe("Queda en Contactos › Personas.")
  })
  it("Me deben habla al revés", () => {
    expect(textosLoan("presto", "cobrar")).toMatchObject({ quien: "¿A quién le prestaste?", vence: "¿Cuándo te paga?" })
    expect(textosLoan("otro", "cobrar").quien).toBe("¿Quién te debe?")
  })
  it("título para la lista y el detalle", () => {
    expect(loanTitulo("fiado", "Tienda Don Pepe", {})).toBe("Fiado en Tienda Don Pepe")
    expect(loanTitulo("empeno", "Compraventa", { prenda: { obj: "reloj" } })).toBe("Empeño: reloj")
    expect(loanTitulo("banco", "Bancolombia", {})).toBe("Crédito con Bancolombia")
    expect(loanTitulo("otro", "Colegio", {})).toBe("Colegio")
  })
})

describe("interés acordado como valor fijo o porcentaje en total (préstamos entre personas)", () => {
  const HOY_P = "2026-11-10"
  it("persona y «le presté» ofrecen porcentaje, valor fijo y cuota; con pago único no hay «sé la cuota»", () => {
    expect(camposLoan("persona", "pagar", { pago: "cuotas" }).intereses).toEqual(["no", "tasa", "valor", "cuota"])
    expect(camposLoan("presto", "cobrar", { pago: "unico" }).intereses).toEqual(["no", "tasa", "valor"])
    expect(sistemaDe("persona", "valor", "frances", camposLoan("persona", "pagar"))).toBe("simple")
  })
  it("$ 50.000 de intereses en cada una de 6 cuotas mensuales sobre $ 1.000.000: cada cuota lleva $ 50.000 de interés", () => {
    const base = { monto: 1_000_000, frec: "mensual", plazo: 6, inicio: "2026-11-01" }
    const t = tasaParaInteres(base, 50_000 * 6, HOY_P)
    expect(t).toBeCloseTo(5, 2)
    const pv = previewLoan({ ...base, sistema: "simple", tasa: t }, HOY_P)
    expect(pv.int).toBeCloseTo(300_000, 0)
    for (const r of pv.plan) expect(r.int).toBeCloseTo(50_000, 0)
    expect(pv.cuota).toBeCloseTo(1_000_000 / 6 + 50_000, 0)
  })
  it("pago único: «me devuelves $ 1.100.000 el 1 de diciembre» = $ 100.000 de interés en total", () => {
    const p = { monto: 1_000_000, frec: "unico", plazo: 1, inicio: "2026-11-01", vence: "2026-12-01" }
    const t = tasaParaInteres(p, 100_000, HOY_P)
    const pv = previewLoan({ ...p, sistema: "simple", tasa: t }, HOY_P)
    expect(pv.total).toBeCloseTo(1_100_000, 0)
    expect(pv.plan).toHaveLength(1)
  })
  it("quincenal: el valor por cuota se respeta aunque la tasa se guarde mensual", () => {
    const base = { monto: 600_000, frec: "quincenal", plazo: 4, inicio: "2026-11-01" }
    const pv = previewLoan({ ...base, sistema: "simple", tasa: tasaParaInteres(base, 20_000 * 4, HOY_P) }, HOY_P)
    for (const r of pv.plan) expect(r.int).toBeCloseTo(20_000, 0)
  })
  it("sin interés o sin monto da 0; y el formulario pide el valor si escogió valor fijo", () => {
    expect(tasaParaInteres({ monto: 1_000_000, frec: "mensual", plazo: 3 }, 0, HOY_P)).toBe(0)
    expect(faltantesLoan({ tipo: "persona", kind: "pagar", quien: "new", nombreNuevo: "Camilo", monto: 500_000, pago: "cuotas", plazo: 3, interes: "valor", inicio: "2026-11-01" }))
      .toContainEqual({ campo: "valorInt", msg: "Escribe el valor de los intereses" })
  })
})

describe("ciclos del interés acordado y costo real de un pago único", () => {
  const H = "2026-11-10"
  const base = { monto: 1_000_000, frec: "mensual", plazo: 6, inicio: "2026-11-01" }
  it("porcentaje por día, semana, quincena, mes o año pasa a mensual (proporcional a los días; el año con E.A.)", () => {
    expect(tasaMensualAcordada({ modo: "pct", ciclo: "mes", v: 3, base }, H)).toBeCloseTo(3, 6)
    expect(tasaMensualAcordada({ modo: "pct", ciclo: "quincena", v: 1.5, base }, H)).toBeCloseTo(3, 6)
    expect(tasaMensualAcordada({ modo: "pct", ciclo: "dia", v: 0.1, base }, H)).toBeCloseTo(3.04375, 5)
    expect(tasaMensualAcordada({ modo: "pct", ciclo: "semana", v: 1, base }, H)).toBeCloseTo(30.4375 / 7, 5)
    expect(tasaMensualAcordada({ modo: "pct", ciclo: "anio", v: 26.82, base }, H)).toBeCloseTo(mensualDeEA(26.82), 8)
  })
  it("valor en pesos: $ 30.000 al mes sobre $ 1.000.000 = 3 % mensual; en total y en cada cuota reproducen el interés", () => {
    expect(tasaMensualAcordada({ modo: "valor", ciclo: "mes", v: 30_000, base }, H)).toBeCloseTo(3, 6)
    const total = tasaMensualAcordada({ modo: "valor", ciclo: "total", v: 120_000, base }, H)
    expect(previewLoan({ ...base, sistema: "simple", tasa: total }, H).int).toBeCloseTo(120_000, 0)
    const cuota = tasaMensualAcordada({ modo: "valor", ciclo: "cuota", v: 20_000, base }, H)
    expect(previewLoan({ ...base, sistema: "simple", tasa: cuota }, H).int).toBeCloseTo(120_000, 0)
  })
  it("una sola cuota con interés mensual: 10 % al mes por 2 meses = $ 200.000", () => {
    const u = { monto: 1_000_000, frec: "unico", plazo: 1, inicio: "2026-11-01", vence: "2027-01-01" }
    const t = tasaMensualAcordada({ modo: "pct", ciclo: "mes", v: 10, base: u }, H)
    expect(previewLoan({ ...u, sistema: "simple", tasa: t }, H).int).toBeCloseTo(1_000_000 * 0.1 * (61 / DIAS_MES), 0)
  })
  it("$ 150.000 que se devuelven en $ 160.004 a los 7 días: 6,67 % del plazo ≈ 29 % al mes, y SÍ supera la usura (26 % E.A.)", () => {
    const c = costoDelPlazo({ monto: 150_000, interes: 10_004, inicio: "2026-11-06", vence: "2026-11-13", usuraEA: 26 })
    expect(c.dias).toBe(7)
    expect(c.pctPlazo).toBeCloseTo(6.669, 3)
    expect(c.mensual).toBeCloseTo(29.0, 1)
    expect(c.supera).toBe(true)
    // Lo máximo legal en 7 días con 26 % E.A.: unos $ 666.
    expect(c.maxLegal!).toBeCloseTo(666, -1)
  })
  it("un pago único dentro de la usura no dispara la alerta: $ 1.000.000 con $ 15.000 a un mes", () => {
    const c = costoDelPlazo({ monto: 1_000_000, interes: 15_000, inicio: "2026-11-01", vence: "2026-12-01", usuraEA: 26 })
    expect(c.supera).toBe(false)
    expect(c.ea).toBeCloseTo(Math.pow(1.015, 365 / 30) - 1, 8)
  })
})

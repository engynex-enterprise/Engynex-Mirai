import { describe, expect, it } from "vitest"
import {
  LOAN_TIPOS, TASA_EMPENO, camposLoan, esTipo, faltantesLoan, loanTipo, loanTitulo, sistemaDe, textosLoan, tipoDefaults, tiposDe,
  type LoanFormState,
} from "./loan-tipos"

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
  it("empeño: casa de empeño, objeto obligatorio, solo tasa y sin escoger sistema (americano)", () => {
    const c = camposLoan("empeno", "pagar")
    expect(c).toMatchObject({ quien: "casa", prenda: "si", concepto: false, sistema: false, frecs: [], foto: false })
    expect(c.intereses).toEqual(["tasa"])
    expect(sistemaDe("empeno", "tasa", "frances", c)).toBe("americano")
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
    expect(c.intereses).toEqual(["no", "tasa", "cuota"])
  })
  it("sin cuotas no se ofrece 'sé cuánto es la cuota'", () => {
    expect(camposLoan("persona", "pagar", { pago: "libre" }).intereses).toEqual(["no", "tasa"])
  })
  it("compra a cuotas: almacén, cuota inicial, seguros y foto de la factura", () => {
    expect(camposLoan("cuotas", "pagar")).toMatchObject({ quien: "prov", inicial: true, extra: true, foto: true, concepto: true })
  })
  it("gota a gota: solo un nombre opcional, frecuencias diarias o semanal, nota", () => {
    const c = camposLoan("gota", "pagar")
    expect(c).toMatchObject({ quien: "nombre", nota: true, extra: false })
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
  it("empeño: la casa (entidad o nombre escrito), el objeto, el valor y el interés", () => {
    const st = base({ tipo: "empeno", monto: 500_000, tasa: 4, plazo: 4 })
    expect(faltantesLoan(st).map((f) => f.campo)).toEqual(["quien", "obj"])
    expect(faltantesLoan({ ...st, acreedor: "Compraventa La 14", obj: "Cadena" })).toEqual([])
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
  it("gota a gota: el nombre es opcional, la cuota no", () => {
    expect(faltantesLoan(base({ tipo: "gota", monto: 500_000, interes: "cuota", plazo: 30 })).map((f) => f.campo)).toEqual(["cuota"])
    expect(faltantesLoan(base({ tipo: "gota", monto: 500_000, interes: "cuota", cuota: 25_000, plazo: 30 }))).toEqual([])
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

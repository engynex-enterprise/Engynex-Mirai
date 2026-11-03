// F2-D-3 … F2-D-9: comandos con reglas de punta a punta. Paridad: cada RPC recibe EXACTAMENTE los argumentos que hoy
// manda el navegador (features/*: pay-fixed-dialog, card-forms, subscriptions-view, goals-view, goal-dialogs,
// asset-form, expense-form, import-view), con el alcance de la persona (UserScope → RLS y x-mirai-enlaces).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { csvExternalIds, parseCSV } from "@mirai/domain/csv"
import { todayBogota } from "@mirai/domain/dates"
import { B_GRATIS, B_PREMIUM, USERS } from "../setup/fixtures"
import { createF2dApp, type F2dApp } from "./app"
import { pgErr, uid } from "./fakes"
import { ID, seedBook } from "./seed"

let t: F2dApp
const today = todayBogota()
const B = `/v1/books/${B_GRATIS}`
const data = <T = Record<string, unknown>>(r: { body: unknown }) => (r.body as { data: T }).data

beforeAll(async () => {
  t = await createF2dApp()
})
afterAll(async () => {
  await t?.close()
})
beforeEach(() => {
  t.fx.store.reset()
  t.fx.classifier.calls.length = 0
  t.fx.classifier.out = null
  t.fx.backups.saved.length = 0
  t.changes.length = 0
  seedBook(t.fx.store, today)
})

describe("POST /expenses (reglas del formulario de gastos)", () => {
  it("categoría por regla, medio por defecto del libro, hormiga en auto sin IA (plan Gratis) y origen manual", async () => {
    const r = await t.call("POST", `${B}/expenses`, "editor", { descripcion: "Compra Exito", valor: 85000 })
    expect(r.status).toBe(200)
    const d = data<{ expense: Record<string, unknown>; categoria: unknown; creado: boolean; hormiga: boolean }>(r)
    expect(d.creado).toBe(true)
    expect(d.categoria).toEqual({ id: ID.mercado, src: "regla" })
    expect(d.expense).toMatchObject({ book_id: B_GRATIS, category_id: ID.mercado, cat_src: "regla", payment_method_id: ID.nequi, hormiga: false, hormiga_src: null, origen: "manual", fecha: today, created_by: USERS.editor })
    expect(t.fx.classifier.calls).toHaveLength(0)
    expect(t.changes[0]).toMatchObject({ table: "expenses", op: "INSERT" })
  })

  it("con Premium e IA prendida, la IA decide la categoría y si es hormiga (con su razón)", async () => {
    t.fx.classifier.out = [{ i: 0, category_id: ID.catPremium, hormiga: true, razon: "Es un antojo diario" }]
    const r = await t.call("POST", `/v1/books/${B_PREMIUM}/expenses`, "owner", { descripcion: "Tinto", valor: 3000 })
    expect(r.status).toBe(200)
    expect(data<{ expense: Record<string, unknown> }>(r).expense).toMatchObject({ category_id: ID.catPremium, cat_src: "ia", hormiga: true, hormiga_src: "ia", hormiga_razon: "Es un antojo diario" })
    expect(t.fx.classifier.calls[0]).toEqual([{ i: 0, descripcion: "Tinto", valor: 3000, veces_mes: 0 }])
  })

  it("categoría a mano y hormiga sí/no a mano mandan sobre la IA", async () => {
    t.fx.classifier.out = [{ i: 0, category_id: null, hormiga: false, razon: "x" }]
    const r = await t.call("POST", `/v1/books/${B_PREMIUM}/expenses`, "owner", { descripcion: "Tinto", valor: 3000, category_id: ID.catPremium, hormiga: "si" })
    expect(data<{ expense: Record<string, unknown> }>(r).expense).toMatchObject({ cat_src: "manual", hormiga: true, hormiga_src: "manual" })
  })

  it("«Imprevistos» con usarFondo paga con el fondo (use_emergency_fund) y devuelve el saldo", async () => {
    t.fx.store.rpcImpl.use_emergency_fund = () => 250000
    const id = uid(700)
    const r = await t.call("POST", `${B}/expenses`, "editor", { id, descripcion: "Llanta", valor: 50000, category_id: ID.imprevistos, usarFondo: true })
    expect(data<{ fondo: unknown }>(r).fondo).toEqual({ saldo: 250000 })
    expect(t.fx.store.rpcs).toEqual([{ fn: "use_emergency_fund", args: { p_expense: id, p_valor: 50000 }, scope: expect.objectContaining({ userId: USERS.editor }) }])
    expect(t.changes.map((c) => c.table)).toEqual(expect.arrayContaining(["expenses", "fund_movements", "emergency_funds"]))
  })

  it("sugiere el gasto fijo pendiente («¿es el pago del arriendo?») sin enlazarlo", async () => {
    const r = await t.call("POST", `${B}/expenses`, "editor", { descripcion: "Pago arriendo", valor: 1200000, fecha: `${today.slice(0, 8)}${String(Math.min(Number(today.slice(8, 10)), 28)).padStart(2, "0")}` })
    expect(data<{ sugerenciaFijo: unknown }>(r).sugerenciaFijo).toMatchObject({ fixed_id: ID.arriendo, nombre: "Arriendo", periodo: today.slice(0, 7), valor: 1200000 })
    expect(t.fx.store.rpcs).toHaveLength(0)
  })

  it("«Registra sus gastos»: crea los suyos, no edita los de otros y no usa el fondo (avisa)", async () => {
    const r = await t.call("POST", `${B}/expenses`, "registra", { descripcion: "Llanta", valor: 50000, category_id: ID.imprevistos, usarFondo: true })
    expect(r.status).toBe(200)
    expect(data<{ avisos: string[]; expense: { created_by: string } }>(r)).toMatchObject({ avisos: [expect.stringMatching(/fondo de emergencia/)], expense: { created_by: USERS.registra } })
    expect((await t.call("POST", `${B}/expenses`, "registra", { id: ID.gastoOwner, descripcion: "X", valor: 1 })).status).toBe(403)
    expect((await t.call("POST", `${B}/expenses`, "viewer", { descripcion: "X", valor: 1 })).status).toBe(403)
  })

  it("valida en español", async () => {
    const r = await t.call("POST", `${B}/expenses`, "editor", { descripcion: " ", valor: -5 })
    expect(r.status).toBe(400)
    expect(r.body).toMatchObject({ code: "VALIDATION", details: { descripcion: "Escribe en qué gastaste", valor: "El valor debe ser mayor que cero" } })
    expect((await t.call("POST", `${B}/expenses`, "editor", { descripcion: "Spa", valor: 1, deducible: "spa" })).status).toBe(400)
    const d = await t.call("POST", `${B}/expenses`, "editor", { descripcion: "Prepagada", valor: 380000, deducible: "salud", category_id: ID.otros })
    expect(data<{ expense: Record<string, unknown> }>(d).expense).toMatchObject({ deducible: "salud", cat_src: "manual" })
  })
})

describe("enlaces de gastos (link-fixed, unlink-fixed, use-fund)", () => {
  it("mismos argumentos que expense-form.tsx; «Registra» no enlaza", async () => {
    const body = { fixedId: ID.arriendo, periodo: "2026-11" }
    expect((await t.call("POST", `${B}/expenses/${ID.gastoOwner}/link-fixed`, "registra", body)).status).toBe(403)
    expect((await t.call("POST", `${B}/expenses/${ID.gastoOwner}/link-fixed`, "editor", body)).status).toBe(200)
    expect((await t.call("POST", `${B}/expenses/${ID.gastoOwner}/unlink-fixed`, "editor")).status).toBe(200)
    expect(t.fx.store.rpcs.map((r) => [r.fn, r.args])).toEqual([
      ["link_expense_fixed", { p_expense: ID.gastoOwner, p_fixed: ID.arriendo, p_periodo: "2026-11" }],
      ["unlink_expense_fixed", { p_expense: ID.gastoOwner }],
    ])
    expect((await t.call("POST", `${B}/expenses/${ID.gastoOwner}/link-fixed`, "editor", { fixedId: ID.arriendo, periodo: "noviembre" })).status).toBe(400)
  })

  it("los errores de la función salen con su texto y el código que corresponde", async () => {
    t.fx.store.rpcImpl.link_expense_fixed = () => { throw pgErr("P0001", "Este gasto ya es el pago de un gasto fijo") }
    const r = await t.call("POST", `${B}/expenses/${ID.gastoOwner}/link-fixed`, "editor", { fixedId: ID.arriendo, periodo: "2026-11" })
    expect(r).toMatchObject({ status: 409, body: { code: "CONFLICT", msg: "Este gasto ya es el pago de un gasto fijo" } })
    t.fx.store.rpcImpl.use_emergency_fund = () => { throw pgErr("P0001", "Sin permiso") }
    expect(await t.call("POST", `${B}/expenses/${ID.gastoOwner}/use-fund`, "editor", {})).toMatchObject({ status: 403, body: { code: "ROLE_DENIED" } })
  })
})

describe("gastos fijos y suscripciones", () => {
  it("pay: mismos argumentos que pay-fixed-dialog (sufijo de quincena) y valor del periodo si no llega", async () => {
    t.fx.store.rpcImpl.pay_fixed_expense = () => ({ ajuste: null, aporte: null })
    const r = await t.call("POST", `${B}/fixed/${ID.arriendo}/pay`, "editor", { periodo: "2026-11-Q1", fecha: "2026-11-05", valor: 600000, payment_method_id: ID.nequi })
    expect(r.status).toBe(200)
    await t.call("POST", `${B}/fixed/${ID.arriendo}/pay`, "editor", { periodo: "2026-12", fecha: "2026-12-05" })
    expect(t.fx.store.rpcs.map((x) => x.args)).toEqual([
      { p_fixed: ID.arriendo, p_periodo: "2026-11-Q1", p_fecha: "2026-11-05", p_valor: 600000, p_medio: ID.nequi, p_desc_suffix: " (1ª quincena)" },
      { p_fixed: ID.arriendo, p_periodo: "2026-12", p_fecha: "2026-12-05", p_valor: 1200000, p_desc_suffix: "" },
    ])
    expect(t.changes.map((c) => c.table)).toEqual(expect.arrayContaining(["fixed_expenses", "fixed_expense_payments", "expenses"]))
  })

  it("periodo ya pagado → 409 con el texto de la base; «Registra» y «Solo mira» → 403", async () => {
    t.fx.store.rpcImpl.pay_fixed_expense = () => { throw pgErr("P0001", "Ese periodo ya está pagado") }
    expect(await t.call("POST", `${B}/fixed/${ID.arriendo}/pay`, "editor", { periodo: "2026-11", fecha: "2026-11-05" })).toMatchObject({ status: 409, body: { msg: "Ese periodo ya está pagado" } })
    expect((await t.call("POST", `${B}/fixed/${ID.arriendo}/pay`, "registra", { periodo: "2026-11", fecha: "2026-11-05" })).status).toBe(403)
    expect((await t.call("POST", `${B}/fixed/${ID.arriendo}/pay`, "viewer", { periodo: "2026-11", fecha: "2026-11-05" })).status).toBe(403)
  })

  it("Idempotency-Key: repetir el pago devuelve la misma respuesta sin volver a llamar la RPC", async () => {
    t.fx.store.rpcImpl.pay_fixed_expense = () => ({ ajuste: null, aporte: null })
    const h = { "idempotency-key": "pago-arriendo-2026-11" }
    const body = { periodo: "2026-11", fecha: "2026-11-05", valor: 1200000 }
    const a = await t.call("POST", `${B}/fixed/${ID.arriendo}/pay`, "editor", body, h)
    const b = await t.call("POST", `${B}/fixed/${ID.arriendo}/pay`, "editor", body, h)
    expect(b.status).toBe(200)
    expect(b.body).toEqual(a.body)
    expect(b.headers["idempotent-replayed"]).toBe("true")
    expect(t.fx.store.rpcs).toHaveLength(1)
    expect((await t.call("POST", `${B}/fixed/${ID.arriendo}/pay`, "editor", { ...body, valor: 1 }, h)).status).toBe(409)
  })

  it("unpay y charge (pay_subscription) con los argumentos de la web", async () => {
    t.fx.store.seed("fixed_expense_payments", [{ id: ID.pagoArriendo, book_id: B_GRATIS, fixed_expense_id: ID.arriendo, periodo: "2026-10", fecha: "2026-10-05", valor: 1200000 }])
    t.fx.store.rpcImpl.pay_subscription = () => ({ expense_id: uid(701), proximo: "2026-12-02" })
    expect((await t.call("DELETE", `${B}/fixed/payments/${ID.pagoArriendo}`, "editor")).status).toBe(200)
    const c = await t.call("POST", `${B}/subscriptions/${ID.sub}/charge`, "editor", { fecha: today, valor: 26900 })
    expect(data(c)).toMatchObject({ expense_id: uid(701), proximo: "2026-12-02" })
    expect(t.fx.store.rpcs.map((x) => [x.fn, x.args])).toEqual([
      ["unpay_fixed_expense", { p_payment: ID.pagoArriendo }],
      ["pay_subscription", { p_sub: ID.sub, p_fecha: today, p_valor: 26900 }],
    ])
  })
})

describe("tarjetas", () => {
  it("compra y pago con los argumentos de card-forms.tsx", async () => {
    t.fx.store.rpcImpl.add_card_purchase = () => ({ purchase_id: uid(710), expense_id: uid(711) })
    t.fx.store.rpcImpl.pay_credit_card = () => ({ payment_id: uid(712) })
    const p = await t.call("POST", `/v1/books/${B_GRATIS}/cards/${ID.tarjeta}/purchases`, "editor", { fecha: today, descripcion: " Nevera ", valor: 2400000, cuotas: 12, category_id: ID.otros })
    expect(data(p)).toMatchObject({ purchase_id: uid(710) })
    await t.call("POST", `${B}/cards/${ID.tarjeta}/payments`, "editor", { valor: 200000, fecha: today, tipo: "minimo", payment_method_id: ID.nequi })
    expect(t.fx.store.rpcs.map((x) => x.args)).toEqual([
      { p_card: ID.tarjeta, p_fecha: today, p_descripcion: "Nevera", p_valor: 2400000, p_cuotas: 12, p_category: ID.otros, p_como_gasto: true },
      { p_card: ID.tarjeta, p_valor: 200000, p_fecha: today, p_tipo: "minimo", p_medio: ID.nequi },
    ])
    expect((await t.call("POST", `${B}/cards/${uid(713)}/payments`, "editor", { valor: 1, fecha: today })).status).toBe(404)
    expect((await t.call("POST", `${B}/cards/${ID.tarjeta}/purchases`, "editor", { fecha: today, descripcion: "X", valor: 1, cuotas: 49 })).status).toBe(400)
  })
})

describe("préstamos", () => {
  const base = { kind: "pagar", monto: 500000, inicio: "2026-10-01", frec: "mensual", plazo: 2 }
  it("empeño con solo el nombre: crea UNA entidad «Casa de empeño» y la segunda vez la reutiliza", async () => {
    const a = await t.call("POST", `${B}/loans`, "editor", { ...base, tipo: "empeno", quien: { acreedor: "Compraventa El Oro" }, prenda: { obj: "Anillo" } })
    expect(a.status).toBe(200)
    const da = data<{ registro: { tabla: string; id: string; creado: boolean }; loan: Record<string, unknown> }>(a)
    expect(da.registro).toMatchObject({ tabla: "entities", creado: true })
    expect(da.loan).toMatchObject({ entity_id: da.registro.id, contact_id: null, acreedor: "Compraventa El Oro", concepto: "Anillo", fiado: false, tipo: "empeno" })
    expect(t.fx.store.all("entities").find((e) => e.id === da.registro.id)).toMatchObject({ tipo: "Casa de empeño" })
    const b = await t.call("POST", `${B}/loans`, "editor", { ...base, tipo: "empeno", quien: { acreedor: "compraventa el oro." } })
    expect(data<{ registro: unknown }>(b).registro).toEqual({ tabla: "entities", id: da.registro.id, nombre: "Compraventa El Oro", creado: false })
  })

  it("persona nueva con el mismo documento que un contacto: lo reutiliza y completa lo que le faltaba", async () => {
    const r = await t.call("POST", `${B}/loans`, "editor", { ...base, kind: "cobrar", tipo: "presto", quien: { nuevo: { tabla: "contacts", nombre: "Juancho", doc: "1.020.304.050", telefono: "3001234567" } } })
    expect(data<{ registro: unknown }>(r).registro).toMatchObject({ tabla: "contacts", id: uid(91), creado: false })
    expect(t.fx.store.all("contacts").find((c) => c.id === uid(91))).toMatchObject({ telefono: "3001234567" })
    expect(t.fx.store.all("contacts")).toHaveLength(1)
  })

  it("banco por NIT y tienda (compra a cuotas) por nombre: no duplica", async () => {
    const e = await t.call("POST", `${B}/loans`, "editor", { ...base, tipo: "banco", quien: { nuevo: { tabla: "entities", nombre: "Bancolombia S.A.", nit: "890.903.938" } } })
    expect(data<{ registro: unknown }>(e).registro).toMatchObject({ id: uid(90), creado: false })
    const p = await t.call("POST", `${B}/loans`, "editor", { ...base, tipo: "cuotas", quien: { acreedor: "ALKOSTO" } })
    expect(data<{ registro: unknown }>(p).registro).toMatchObject({ tabla: "providers", id: uid(92), creado: false })
  })

  it("pago único exige vence; la primera cuota no puede ser antes del préstamo; pagos previos quedan registrados", async () => {
    expect((await t.call("POST", `${B}/loans`, "editor", { ...base, tipo: "fiado", frec: "unico", quien: { contact_id: uid(91) } })).body).toMatchObject({ code: "VALIDATION", details: { vence: "Escribe cuándo se paga" } })
    expect((await t.call("POST", `${B}/loans`, "editor", { ...base, tipo: "persona", primera: "2026-09-01", quien: { contact_id: uid(91) } })).status).toBe(400)
    const r = await t.call("POST", `${B}/loans`, "editor", { ...base, tipo: "fiado", frec: "unico", vence: "2026-12-01", quien: { contact_id: uid(91) }, pagosPrevios: [{ fecha: "2026-10-15", tipo: "abono", valor: 100000 }] })
    expect(data<{ loan: Record<string, unknown>; pagosPrevios: number }>(r)).toMatchObject({ loan: { fiado: true, vence: "2026-12-01", plazo: 1, concepto: "Fiado" }, pagosPrevios: 1 })
    expect(t.fx.store.all("loan_payments")).toEqual([expect.objectContaining({ tipo: "abono", valor: 100000, nota: "Pago anterior a Mirai", created_by: USERS.editor })])
  })

  it("pagar 2 cuotas usa los valores del plan; un abono no pasa del saldo; saldada → 409", async () => {
    const r = await t.call("POST", `${B}/loans/${ID.loan}/payments`, "editor", { cuotas: 2, fecha: today, payment_method_id: ID.nequi })
    expect(data<{ pagos: unknown[]; saldo: number }>(r)).toMatchObject({ pagos: [expect.objectContaining({ tipo: "cuota", valor: 250000 }), expect.objectContaining({ tipo: "cuota", valor: 250000 })], saldo: 500000 })
    const a = await t.call("POST", `${B}/loans/${ID.loan}/payments`, "editor", { abono: 9e6, fecha: today })
    expect(data<{ pagos: Record<string, unknown>[]; saldado: boolean }>(a)).toMatchObject({ pagos: [{ tipo: "abono", valor: 500000, modo: "plazo" }], saldado: true })
    expect((await t.call("POST", `${B}/loans/${ID.loan}/payments`, "editor", { abono: 1000, fecha: today })).status).toBe(409)
  })
})

describe("metas, fondo, cuentas, patrimonio y presupuesto", () => {
  it("goal_contribute, fund_save y fund_use con los argumentos de la web", async () => {
    t.fx.store.rpcImpl.goal_contribute = () => ({ id: uid(720), ahorrado: 150000, objetivo: 2000000 })
    t.fx.store.rpcImpl.fund_save = () => 350000
    t.fx.store.rpcImpl.fund_use = () => ({ cubre: 300000, resto: 50000, saldo: 0 })
    expect(data(await t.call("POST", `${B}/goals/${ID.meta}/contribute`, "editor", { valor: 50000, fecha: today, payment_method_id: ID.nequi }))).toMatchObject({ ahorrado: 150000 })
    expect(data(await t.call("POST", `${B}/fund/save`, "editor", { valor: 50000, fecha: today, nota: "Prima" }))).toEqual({ saldo: 350000 })
    expect(data(await t.call("POST", `${B}/fund/use`, "editor", { descripcion: "Médico", valor: 350000, fecha: today }))).toMatchObject({ cubre: 300000, resto: 50000 })
    expect(t.fx.store.rpcs.map((x) => [x.fn, x.args])).toEqual([
      ["goal_contribute", { p_goal: ID.meta, p_valor: 50000, p_fecha: today, p_medio: ID.nequi }],
      ["fund_save", { p_book: B_GRATIS, p_valor: 50000, p_fecha: today, p_nota: "Prima" }],
      ["fund_use", { p_book: B_GRATIS, p_desc: "Médico", p_valor: 350000, p_fecha: today }],
    ])
    const f = await t.call("PUT", `${B}/fund`, "editor", { activo: false })
    expect(data(f)).toMatchObject({ book_id: B_GRATIS, activo: false, saldo: 300000 })
  })

  it("cuadrar una cuenta (asset_cuadrar) y dejar de cuadrarla", async () => {
    t.fx.store.rpcImpl.asset_cuadrar = (a) => ({ id: a.p_asset, saldo_base: a.p_saldo })
    expect(data(await t.call("POST", `${B}/assets/${ID.cuenta}/reconcile`, "editor", { saldo: 812345 }))).toMatchObject({ saldo_base: 812345 })
    expect(t.fx.store.rpcs[0].args).toEqual({ p_asset: ID.cuenta, p_saldo: 812345 })
    expect(data(await t.call("DELETE", `${B}/assets/${ID.cuenta}/reconcile`, "editor"))).toMatchObject({ saldo_base: null, saldo_fecha: null, saldo_at: null })
  })

  it("foto del patrimonio: una por mes (editar la misma) y nunca de un mes futuro", async () => {
    const mes = today.slice(0, 7)
    await t.call("PUT", `${B}/net-worth/${mes}`, "editor", { activos: 1000, deudas: 400 })
    const r = await t.call("PUT", `${B}/net-worth/${mes}`, "editor", { activos: 2000, deudas: 400 })
    expect(data(r)).toMatchObject({ mes, patrimonio: 1600 })
    expect(t.fx.store.all("net_worth_snapshots")).toHaveLength(1)
    expect((await t.call("PUT", `${B}/net-worth/2999-01`, "editor", { activos: 1, deudas: 0 })).status).toBe(400)
  })

  it("topes del presupuesto (uno y varios; categorías de otro libro → 404)", async () => {
    expect(data(await t.call("PATCH", `${B}/categories/${ID.mercado}/tope`, "editor", { tope: 900000 }))).toMatchObject({ tope: 900000 })
    const v = await t.call("PUT", `${B}/budget/topes`, "editor", { topes: [{ category_id: ID.mercado, tope: 1 }, { category_id: ID.otros, tope: 2 }] })
    expect((data<unknown[]>(v)).length).toBe(2)
    expect((await t.call("PUT", `${B}/budget/topes`, "editor", { topes: [{ category_id: ID.ajena, tope: 1 }] })).status).toBe(404)
    expect((await t.call("PATCH", `${B}/categories/${ID.mercado}/tope`, "registra", { tope: 1 })).status).toBe(403)
  })
})

describe("ingresos y reparto por quincena", () => {
  it("plan quincenal con valores distintos por quincena (sin guardar)", async () => {
    const r = await t.call("POST", `${B}/incomes/plan`, "viewer", { frec: "quincenal", mensual: 3000000, b1: 1000000, b2: 2000000 })
    expect(data(r)).toMatchObject({ mensual: 3000000, pagos: [{ n: "1ª quincena", neto: 1000000 }, { n: "2ª quincena", neto: 2000000 }], valor: 1500000 })
  })

  it("guarda con reparto, crea la categoría del tipo si falta y valor = promedio por pago", async () => {
    const r = await t.call("POST", `${B}/incomes`, "editor", { concepto: "Sueldo", tipo: "salario", frec: "quincenal", mensual: 3000000, b1: 1000000, b2: 2000000, d1: 15, d2: 30 })
    expect(r.status).toBe(200)
    const d = data<{ income: Record<string, unknown>; categoriaCreada: boolean }>(r)
    expect(d.categoriaCreada).toBe(true)
    expect(d.income).toMatchObject({ concepto: "Sueldo", frec: "quincenal", valor: 1500000, bruto: null, deducciones: null, created_by: USERS.editor, reparto: { tipo: "salario", mensual: 3000000, modo: "distinto", b1: 1000000, b2: 2000000, n1: 1000000, n2: 2000000, d1: 15, d2: 30 } })
    expect(t.fx.store.all("income_categories")).toEqual([expect.objectContaining({ nombre: "Salario", id: d.income.category_id })])
    // «Registra sus gastos» guarda los suyos, pero no crea categorías (queda sin categoría).
    const reg = await t.call("POST", `${B}/incomes`, "registra", { concepto: "Mesada", tipo: "bono", frec: "mensual", mensual: 100000 })
    expect(data<{ income: Record<string, unknown> }>(reg).income).toMatchObject({ category_id: null, created_by: USERS.registra })
    expect((await t.call("POST", `${B}/incomes`, "editor", { concepto: "X", frec: "mensual", mensual: 0 })).status).toBe(400)
  })
})

describe("importar extractos (ids estables csv:)", () => {
  const csv = ["Fecha;Descripción;Valor", `${today.slice(8, 10)}/${today.slice(5, 7)}/${today.slice(0, 4)};COMPRA EXITO;-245.300`, `${today.slice(8, 10)}/${today.slice(5, 7)}/${today.slice(0, 4)};TINTO;-3.000`, `${today.slice(8, 10)}/${today.slice(5, 7)}/${today.slice(0, 4)};TINTO;-3.000`, `${today.slice(8, 10)}/${today.slice(5, 7)}/${today.slice(0, 4)};ABONO NOMINA;1.500.000`].join("\n")

  it("preview: mismos ids que la web, categoría por regla, repetidos dentro del archivo con n distinto", async () => {
    const r = await t.call("POST", `${B}/import/statement/preview`, "editor", { csv })
    expect(r.status).toBe(200)
    const rows = (r.body as { rows: Record<string, unknown>[] }).rows
    const want = csvExternalIds(parseCSV(csv, []).rows!)
    expect(rows.map((x) => x.ext)).toEqual(want)
    expect(new Set(want).size).toBe(4)
    expect(rows[0]).toMatchObject({ descripcion: "COMPRA EXITO", valor: 245300, abono: false, category_id: ID.mercado, src: "regla", incl: true, dup: false })
    expect(rows[3]).toMatchObject({ abono: true, category_id: null })
  })

  it("commit con un medio: gastos (origen importar) e ingresos extra; subirlo otra vez no duplica", async () => {
    const filas = [{ i: 0 }, { i: 1, hormiga: true }, { i: 2 }, { i: 3 }]
    const a = await t.call("POST", `${B}/import/statement`, "editor", { csv, fuente: { tipo: "medio", id: ID.nequi }, filas })
    expect(data(a)).toEqual({ gastos: 3, entradas: 1, repetidos: 0, errores: [] })
    const g = t.fx.store.all("expenses").filter((x) => x.origen === "importar")
    expect(g).toHaveLength(3)
    expect(g[1]).toMatchObject({ hormiga: true, hormiga_src: "manual", payment_method_id: ID.nequi, external_id: expect.stringMatching(/^csv:/), created_by: USERS.editor })
    expect(g[0]).toMatchObject({ category_id: ID.mercado, hormiga_src: "regla" })
    expect(t.fx.store.all("extra_incomes")).toEqual([expect.objectContaining({ valor: 1500000, external_id: expect.stringMatching(/^csv:/) })])
    const b = await t.call("POST", `${B}/import/statement`, "editor", { csv, fuente: { tipo: "medio", id: ID.nequi }, filas })
    expect(data(b)).toMatchObject({ gastos: 0, entradas: 0, repetidos: 4 })
    const p = await t.call("POST", `${B}/import/statement/preview`, "editor", { csv })
    expect((p.body as { rows: { dup: boolean }[] }).rows.every((x) => x.dup)).toBe(true)
  })

  it("commit con una tarjeta: compras (add_card_purchase con el csv:) y pagos (pay_credit_card)", async () => {
    await t.call("POST", `${B}/import/statement`, "editor", { csv, fuente: { tipo: "tarjeta", id: ID.tarjeta }, filas: [{ i: 0 }, { i: 3 }] })
    const ids = csvExternalIds(parseCSV(csv, []).rows!)
    expect(t.fx.store.rpcs.map((x) => [x.fn, x.args])).toEqual([
      ["add_card_purchase", { p_card: ID.tarjeta, p_fecha: today, p_descripcion: "COMPRA EXITO", p_valor: 245300, p_cuotas: 1, p_category: ID.mercado, p_como_gasto: true, p_external_id: ids[0] }],
      ["pay_credit_card", { p_card: ID.tarjeta, p_valor: 1500000, p_fecha: today, p_tipo: "otro", p_nota: "Importado: ABONO NOMINA" }],
    ])
  })

  it("errores: archivo sin columnas, fila que no existe, fuente de otro libro", async () => {
    expect((await t.call("POST", `${B}/import/statement/preview`, "editor", { csv: "hola\nmundo" })).status).toBe(400)
    expect((await t.call("POST", `${B}/import/statement`, "editor", { csv, fuente: { tipo: "medio", id: ID.nequi }, filas: [{ i: 9 }] })).status).toBe(400)
    expect((await t.call("POST", `${B}/import/statement`, "editor", { csv, fuente: { tipo: "medio", id: ID.ajena }, filas: [{ i: 0 }] })).status).toBe(404)
    expect((await t.call("POST", `${B}/import/statement/preview`, "registra", { csv })).status).toBe(403)
  })
})

describe("exportar y respaldar el libro (BookDump v5)", () => {
  it("export.json: solo Dueño y Administra; trae la papelera y los ajustes", async () => {
    expect((await t.call("GET", `${B}/export.json`, "editor")).status).toBe(403)
    const r = await t.call("GET", `${B}/export.json`, "admin")
    expect(r.status).toBe(200)
    const d = r.body as { app: string; v: number; book_id: string; household_id: string; settings: Record<string, unknown>; data: Record<string, Record<string, unknown>[]> }
    expect(d).toMatchObject({ app: "mirai", v: 5, book_id: B_GRATIS, settings: { umbral: 25000 } })
    expect(d.data.expenses.map((x) => x.id)).toEqual(expect.arrayContaining([ID.gastoOwner, ID.gastoBorrado]))
    expect(Object.keys(d.data)).toHaveLength(33)
  })

  it("backups: guarda el respaldo manual con quien lo pidió", async () => {
    const r = await t.call("POST", `${B}/backups`, "owner")
    expect(data(r)).toMatchObject({ path: expect.stringMatching(new RegExp(`^${B_GRATIS}/.*-manual\\.json$`)) })
    expect(t.fx.backups.saved[0]).toMatchObject({ bookId: B_GRATIS, tipo: "manual", userId: USERS.owner })
    expect(JSON.parse(t.fx.backups.saved[0].body)).toMatchObject({ app: "mirai", v: 5 })
  })
})

describe("registros sin duplicar (POST …/registros/resolve)", () => {
  it("busca por documento o nombre; crea solo si no existe y el rol lo permite", async () => {
    const a = await t.call("POST", `${B}/registros/resolve`, "registra", { registro: { tabla: "contacts", nombre: "juan perez" }, crear: false })
    expect(data(a)).toMatchObject({ id: uid(91), creado: false })
    expect(data(await t.call("POST", `${B}/registros/resolve`, "registra", { registro: { tabla: "providers", nombre: "D1" }, crear: false }))).toBeNull()
    expect((await t.call("POST", `${B}/registros/resolve`, "registra", { registro: { tabla: "providers", nombre: "D1" } })).status).toBe(403)
    const c = await t.call("POST", `${B}/registros/resolve`, "editor", { registro: { tabla: "providers", nombre: "  Tiendas  D1 " } })
    expect(data(c)).toMatchObject({ tabla: "providers", nombre: "Tiendas D1", creado: true })
  })
})

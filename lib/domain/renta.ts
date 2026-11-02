// Declaración de renta de personas naturales (s_dian.js de Mirai 4.0): ingresos estimados, depuración
// de la cédula general, dependientes, patrimonio y topes para declarar. Todo es un ESTIMADO orientativo.
import { conv } from "./money"
import { inv } from "./investments"
import { loanEngine } from "./loans"
import { fspPct, retEmpleado, smmlvFor, uvtFor } from "./payroll"
import { pagosMes } from "./reparto"
import { toDay } from "./dates"
import type { BookData, DateInput } from "./types"

/** UVT por año gravable (DIAN). 2024: Res. 187/2023 · 2025: Res. 193/2024 · 2026: Res. 238/2025. */
export const UVTD: Record<number, number> = { 2024: 47065, 2025: 49799, 2026: 52374 }

export const BTIP = [
  ["inmueble", "Casa, apartamento o lote", "house"], ["vehiculo", "Carro o moto", "car"], ["cuenta", "Cuenta bancaria o efectivo", "landmark"],
  ["inversion", "CDT, fondo o acciones", "trending-up"], ["cripto", "Criptomonedas", "bitcoin"], ["exterior", "Bien o cuenta en el exterior", "globe"],
  ["cobrar", "Plata que te deben", "hand-coins"], ["otro", "Otro bien", "tag"],
] as const

export const RIK = [
  ["lab", "Salarios, primas y otros pagos laborales", "Del certificado de ingresos y retenciones (formulario 220) de tu empleador."],
  ["hon", "Honorarios o trabajo independiente", "Lo que facturaste o te pagaron por servicios."],
  ["ces", "Cesantías e intereses de cesantías", "Lo que te consignaron en el año."],
  ["arr", "Arriendos que recibiste", "Total del año."],
  ["fin", "Rendimientos financieros", "Intereses de CDT, cuentas y fondos (certificados bancarios)."],
  ["pen", "Pensión", "Si recibes pensión."],
  ["otr", "Otros ingresos", "Lo que no encaja arriba."],
  ["aportes", "Aportes obligatorios a salud y pensión", "Lo que te descontaron (o pagaste como independiente). No pagan impuesto."],
  ["volun", "Aportes voluntarios a pensión", "Certificado del fondo."],
  ["afc", "Ahorro en cuentas AFC o AVC", "Certificado del banco."],
  ["ret", "Retenciones en la fuente que te hicieron", "Suma de los certificados (empleador, bancos). Se restan del impuesto."],
] as const
export type RikKey = (typeof RIK)[number][0]

export const RDK = [
  ["intViv", "Intereses del crédito de vivienda", "Certificado del banco. Tope 1.200 UVT al año.", 1200],
  ["prep", "Medicina prepagada o póliza de salud", "Tope 16 UVT al mes (192 al año).", 192],
  ["gmf", "4×1000 que pagaste (GMF)", "Certificado bancario: se deduce el 50%.", null],
  ["icetex", "Intereses de crédito ICETEX", "Tope 100 UVT al año.", 100],
  ["fe", "Compras con factura electrónica pagadas con tarjeta o transferencia", "Puedes restar el 1% (tope 240 UVT), fuera del límite del 40%.", null],
] as const
export type RdkKey = (typeof RDK)[number][0]

export const RDOCS = [
  ["cir", "Certificado de ingresos y retenciones (formulario 220)", "Te lo da tu empleador entre febrero y marzo."],
  ["banc", "Certificados bancarios con saldos al 31 de diciembre", "Cada banco lo genera en su app o página."],
  ["cdt", "Certificados de rendimientos financieros y retención (CDT, fondos)", "De cada entidad donde tengas inversiones."],
  ["cred", "Certificados de deudas al 31 de diciembre", "Créditos, tarjetas e hipoteca."],
  ["hip", "Certificado de intereses pagados por crédito de vivienda", "Son deducibles: pueden bajar tu impuesto."],
  ["pens", "Certificados de aportes voluntarios a pensión o cuentas AFC", "Pueden ser rentas exentas."],
  ["salud", "Certificado de medicina prepagada o pólizas de salud", "Deducción hasta un tope mensual."],
  ["dep", "Datos de tus dependientes económicos", "Hijos o personas a cargo: dan derecho a una deducción."],
  ["bienes", "Valor de tus bienes (avalúo catastral, vehículo)", "Del impuesto predial y vehicular."],
] as const

export const DEPR = [["hijo", "Hijo o hija"], ["conyuge", "Cónyuge o pareja"], ["padre", "Padre o madre"], ["hermano", "Hermano o hermana"]] as const

export interface RentaMember {
  id: string; nombre: string; rol: string; es_titular?: boolean; nacimiento?: string | null; doc?: string
  dep_de?: string | null; dep_rel?: string | null; estudia?: boolean; sin_ingresos?: boolean; discapacidad?: boolean
}
export interface TaxAssetIn {
  id?: string; asset_id?: string | null; tipo: string; nombre: string; ident?: string; entidad?: string
  costo: number; avaluo: number; valor31: number; member_id?: string | null; pct: number
  predial?: number | null; imp_veh?: number | null; soat?: number | null; fecha_adq?: string | null
}
export interface TaxYearIn { ing: Partial<Record<RikKey, number | string | null>>; ded: Partial<Record<RdkKey, number | string | null>>; docs: Record<string, boolean>; consig: number; consumos: number }

/** Datos que necesita la renta además del libro. Los ingresos deben traer `cat` (nombre del tipo de ingreso) y `bruto`. */
export interface RentaInput {
  book: Omit<BookData, "incomes" | "assets"> & { incomes: (BookData["incomes"][number] & { cat?: string; bruto?: number | null })[]; assets: (BookData["assets"][number] & { id?: string; nombre?: string })[] }
  members: RentaMember[]
  bienes: TaxAssetIn[]
  tax: TaxYearIn | null
  uvtOverrides?: Record<string, number> | null
  smmlvOverrides?: Record<string, number> | null
}

export const uvtY = (y: number, ov?: Record<string, number> | null, today?: DateInput) => +(ov ?? {})[y] || UVTD[y] || uvtFor(toDay(today ?? new Date()).getFullYear(), ov)
export const titularId = (m: RentaMember[]) => (m.find((x) => x.es_titular) ?? m.find((x) => /titular/i.test(x.rol)) ?? m[0])?.id ?? "familia"
const esDe = (memberId: string | null | undefined, mid: string, tit: string) => memberId === mid || (mid === tit && (!memberId || memberId === "familia"))

export function salarioDe(R: RentaInput, mid: string) {
  const tit = titularId(R.members), trm = R.book.settings.trm
  return R.book.incomes.filter((x) => esDe(x.member_id, mid, tit) && /salari/i.test(`${x.cat ?? ""} ${x.concepto}`))
    .reduce((a, x) => a + (+(x.bruto ?? 0) ? +(x.bruto ?? 0) * pagosMes(x) : conv(x.valor, x.currency, trm) * pagosMes(x)), 0)
}

function edad(nac: string | null | undefined, today: DateInput) {
  if (!nac) return null
  const b = new Date(`${nac}T12:00:00`), t = toDay(today)
  let a = t.getFullYear() - b.getFullYear()
  if (t < new Date(t.getFullYear(), b.getMonth(), b.getDate())) a--
  return a
}

/** ¿Cuenta como dependiente? (depInfo de la v4; la edad se calcula a hoy, como en la v4). */
export function depInfo(m: RentaMember, today: DateInput): { rel: string; e: number | null; ok: boolean; why: string } {
  const rel = m.dep_rel || (/hij/i.test(m.rol) ? "hijo" : /c[oó]nyuge|pareja/i.test(m.rol) ? "conyuge" : /padre|madre/i.test(m.rol) ? "padre" : /herman/i.test(m.rol) ? "hermano" : "")
  const e = edad(m.nacimiento, today)
  if (!m.dep_de) return { rel, e, ok: false, why: "No marcado como dependiente" }
  if (rel === "hijo") {
    if (m.discapacidad) return { rel, e, ok: true, why: "Hijo con dependencia por discapacidad" }
    if (e === null) return { rel, e, ok: true, why: "Agrega la fecha de nacimiento para confirmar" }
    if (e < 18) return { rel, e, ok: true, why: `Menor de 18 años (${e})` }
    if (e <= 23 && m.estudia) return { rel, e, ok: true, why: `${e} años y estudia (educación superior o técnica)` }
    return { rel, e, ok: false, why: e <= 23 ? `${e} años: solo cuenta si estudia` : `${e} años: solo cuenta con discapacidad` }
  }
  if (rel === "conyuge" || rel === "padre" || rel === "hermano") {
    const ok = !!m.sin_ingresos || !!m.discapacidad
    return { rel, e, ok, why: ok ? "Sin ingresos mayores a 260 UVT o con discapacidad" : "Cuenta solo si no tuvo ingresos mayores a 260 UVT en el año" }
  }
  return { rel, e, ok: false, why: "Este parentesco no da deducción" }
}
export const depsDe = (members: RentaMember[], mid: string, today: DateInput) => members.filter((m) => m.dep_de === mid && depInfo(m, today).ok)

/** Tabla del artículo 241 del Estatuto Tributario (u en UVT → impuesto en UVT). */
export function tarifa241(u: number) {
  if (u <= 1090) return 0
  if (u <= 1700) return (u - 1090) * 0.19
  if (u <= 4100) return (u - 1700) * 0.28 + 116
  if (u <= 8670) return (u - 4100) * 0.33 + 788
  if (u <= 18970) return (u - 8670) * 0.35 + 2296
  if (u <= 31000) return (u - 18970) * 0.37 + 5901
  return (u - 31000) * 0.39 + 10352
}
export const TRAMOS241: [number, number, number, number][] = [[0, 1090, 0, 0], [1090, 1700, 19, 0], [1700, 4100, 28, 116], [4100, 8670, 33, 788], [8670, 18970, 35, 2296], [18970, 31000, 37, 5901], [31000, Infinity, 39, 10352]]

/** Ingresos estimados con lo registrado en Mirai (rentaAuto de la v4). */
export function rentaAuto(R: RentaInput, mid: string, today: DateInput) {
  const tit = titularId(R.members), trm = R.book.settings.trm, yNow = toDay(today).getFullYear()
  const sal = salarioDe(R, mid)
  const txt = (x: { cat?: string; concepto: string }) => `${x.cat ?? ""} ${x.concepto}`
  const mine = R.book.incomes.filter((x) => esDe(x.member_id, mid, tit))
  const mensual = (x: (typeof mine)[number]) => conv(x.valor, x.currency, trm) * pagosMes(x)
  const by = (re: RegExp) => mine.filter((x) => re.test(txt(x)) && !/salari/i.test(txt(x))).reduce((a, x) => a + mensual(x), 0) * 12
  const hon = by(/honorar|independ|servicio|freelance|contrato/i), arr = by(/arriend/i), pen = by(/pensi[oó]n/i)
  const otr = mine.filter((x) => !/salari|honorar|independ|servicio|freelance|contrato|arriend|pensi[oó]n/i.test(txt(x))).reduce((a, x) => a + mensual(x), 0) * 12
  const fin = mid === tit ? R.book.investments.reduce((a, x) => a + inv(x, today).bruto, 0) : 0
  const retInv = mid === tit ? R.book.investments.reduce((a, x) => a + inv(x, today).ret, 0) : 0
  const lab = sal * 13, ces = sal * 1.12
  const smm = smmlvFor(yNow, R.smmlvOverrides), U0 = uvtFor(yNow, R.uvtOverrides)
  const fsp = sal ? fspPct(sal, smm, R.book.settings.nomina?.fsp) / 100 : 0
  const aportes = sal * 12 * (0.08 + fsp) + hon * 0.4 * 0.285
  let retLab = 0
  try { retLab = sal ? retEmpleado(sal, sal * (0.08 + fsp), U0) * 12 : 0 } catch { retLab = 0 }
  return { lab, hon, ces, arr, fin, pen, otr, aportes: Math.round(aportes), ret: Math.round(retLab + retInv), volun: 0, afc: 0, sal }
}

/** Depuración de la cédula general y el impuesto estimado (calcRenta de la v4). */
/**
 * `deps`: "2023" (por defecto) aplica el Decreto 2231/2023 (art. 1.2.1.20.3 DUR 1625): el mismo dependiente sirve
 * para el 10 % (dentro del límite) y para los 72 UVT (fuera del límite). "v4" reproduce la v4, que elegía entre
 * "10 % con uno y 72 UVT con los demás" o "72 UVT por cada uno" (solo para las pruebas de paridad).
 */
export function calcRenta(R: RentaInput, y: number, mid: string, today: DateInput, opts: { deps?: "2023" | "v4" } = {}) {
  const U = uvtY(y, R.uvtOverrides, today), A = rentaAuto(R, mid, today), T = R.tax ?? { ing: {}, ded: {}, docs: {}, consig: 0, consumos: 0 }
  const g = (k: RikKey) => { const v = T.ing?.[k]; return v !== undefined && v !== "" && v !== null ? +v : (A[k] || 0) }
  const dd = (k: RdkKey) => +(T.ded?.[k] ?? 0) || 0
  const lab = g("lab"), hon = g("hon"), ces = g("ces"), arr = g("arr"), fin = g("fin"), pen = g("pen"), otr = g("otr"), aportes = g("aportes"), volun = g("volun"), afc = g("afc"), ret = g("ret")
  const trabajo = lab + hon + ces, brutos = trabajo + arr + fin + otr + pen
  const RL = Math.max(0, trabajo + arr + fin + otr - aportes)
  const salProm = A.sal || lab / 13, su = salProm / U
  const cesPct = su <= 350 ? 1 : su <= 410 ? 0.9 : su <= 470 ? 0.8 : su <= 530 ? 0.6 : su <= 590 ? 0.4 : su <= 650 ? 0.2 : 0
  const cesEx = ces * cesPct
  const vol = Math.min(volun + afc, 0.3 * (lab + hon), 3800 * U)
  const nD = depsDe(R.members, mid, today).length
  const d10 = nD ? Math.min(0.1 * (lab + hon), 384 * U) : 0
  const opA = d10 + Math.min(Math.max(nD - 1, 0), 4) * 72 * U, opB = Math.min(nD, 4) * 72 * U
  const v4 = opts.deps === "v4"
  const useA = v4 ? !!nD && opA >= opB : !!nD
  const dep10 = useA ? d10 : 0
  const dep72 = nD ? (v4 ? (useA ? Math.min(nD - 1, 4) : Math.min(nD, 4)) : Math.min(nD, 4)) * 72 * U : 0
  const intViv = Math.min(dd("intViv"), 1200 * U), prep = Math.min(dd("prep"), 192 * U), gmf = dd("gmf") * 0.5, icetex = Math.min(dd("icetex"), 100 * U)
  const fe = Math.min(dd("fe") * 0.01, 240 * U)
  const base25 = Math.max(0, trabajo - aportes - (dep10 + intViv + prep + gmf + icetex) - cesEx - vol)
  const r25 = Math.min(base25 * 0.25, 790 * U)
  const sub = cesEx + vol + dep10 + intViv + prep + gmf + icetex + r25, lim = Math.min(0.4 * RL, 1340 * U), apl = Math.min(sub, lim)
  const penGrav = Math.max(0, pen - 12000 * U)
  const RLG = Math.max(0, RL - apl - dep72 - fe) + penGrav
  const imp = Math.round((tarifa241(RLG / U) * U) / 1000) * 1000
  return { U, A, lab, hon, ces, arr, fin, pen, otr, aportes, volun, afc, ret, trabajo, brutos, RL, cesEx, cesPct, vol, nD, dep10, dep72, useA, intViv, prep, gmf, icetex, fe, r25, sub, lim, apl, recorte: sub - apl, RLG, imp, saldo: imp - ret }
}
export type Renta = ReturnType<typeof calcRenta>

export const bValor = (b: TaxAssetIn) => (b.tipo === "inmueble" ? Math.max(+b.costo || 0, +b.avaluo || 0) : +b.valor31 || +b.costo || +b.avaluo || 0)

/** Patrimonio al 31 de diciembre (patrimonio de la v4). */
export function patrimonio(R: RentaInput, mid: string, today: DateInput) {
  const tit = titularId(R.members), es = mid === tit, trm = R.book.settings.trm
  const B = R.bienes.filter((b) => (b.member_id || tit) === mid)
  const linked = new Set(B.map((b) => b.asset_id).filter(Boolean))
  const cuentas = es ? R.book.assets.filter((a) => /^11/.test(a.cod) && !linked.has(a.id)).reduce((s, a) => s + conv(a.valor, a.currency, trm), 0) : 0
  const otrosAct = es ? R.book.assets.filter((a) => !/^11/.test(a.cod) && !linked.has(a.id)).reduce((s, a) => s + conv(a.valor, a.currency, trm), 0) : 0
  const invs = es ? R.book.investments.reduce((s, x) => s + conv(inv(x, today).valor, x.currency, trm), 0) : 0
  const cobr = es ? R.book.loans.filter((L) => L.kind === "cobrar").reduce((s, L) => s + loanEngine(L, today).saldo, 0) : 0
  const bv = B.reduce((s, b) => s + (bValor(b) * (+b.pct || 100)) / 100, 0)
  const deudas = es ? R.book.liabilities.reduce((s, p) => s + conv(p.valor, p.currency, trm), 0) + R.book.loans.filter((L) => L.kind === "pagar").reduce((s, L) => s + loanEngine(L, today).saldo, 0) : 0
  const bruto = cuentas + otrosAct + invs + cobr + bv
  return { cuentas, otrosAct, invs, cobr, bv, bruto, deudas, liquido: bruto - deudas, B }
}

/** ¿Debo declarar? Topes del año (topes de la v4). */
export function topes(R: RentaInput, y: number, mid: string, today: DateInput) {
  const U = uvtY(y, R.uvtOverrides, today), C = calcRenta(R, y, mid, today, { deps: "v4" }), P = patrimonio(R, mid, today), yr = String(y)
  const es = mid === titularId(R.members)
  const gas = es ? R.book.expenses.filter((g) => g.fecha.startsWith(yr)).reduce((a, g) => a + +g.valor, 0) : 0
  const tc = es ? R.book.creditCards.reduce((a, t) => a + (t.purchases || []).filter((c) => c.fecha.startsWith(yr)).reduce((b, c) => b + +c.valor, 0), 0) : 0
  const rows: [string, number, number, string][] = [
    ["Ingresos brutos del año", C.brutos, 1400, "Salario, primas, honorarios, arriendos, rendimientos…"],
    ["Patrimonio bruto al 31 de diciembre", P.bruto, 4500, "Todo lo que tienes: cuentas, inversiones, casa, carro, lo que te deben."],
    ["Compras con tarjeta de crédito", tc, 1400, "Total pagado con tarjetas de crédito en el año."],
    ["Compras y consumos totales", Math.max(gas, +(R.tax?.consumos ?? 0) || 0), 1400, "Todo lo que gastaste en el año."],
    ["Consignaciones y depósitos bancarios", +(R.tax?.consig ?? 0) || 0, 1400, "Todo lo que te entró a tus cuentas en el año."],
  ]
  return rows.map(([l, v, u, d]) => ({ l, v, u, d, tope: u * U, pasa: v >= u * U }))
}

/** Líneas del borrador (rLines de la v4). */
export function rLines(C: Renta): [string, number][] {
  return [
    ["Ingresos brutos", C.brutos], ["− Aportes obligatorios a salud y pensión (no gravados)", -C.aportes], ["= Renta líquida", C.RL],
    ["− Rentas exentas y deducciones (con límite)", -C.apl], ["− Dependientes adicionales (72 UVT)", -C.dep72], ["− 1% compras con factura electrónica", -C.fe],
    ["= Renta líquida gravable", C.RLG], ["Impuesto según la tabla del artículo 241", C.imp], ["− Retenciones en la fuente", -C.ret],
    [C.saldo >= 0 ? "= Saldo estimado a pagar" : "= Saldo estimado a favor", Math.abs(C.saldo)],
  ]
}

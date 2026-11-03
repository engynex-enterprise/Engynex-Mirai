// Lo que el flujo integral necesita y no viaja en el libro: estimados de los impuestos del calendario sin valor
// (predial, vehicular, SOAT, prima… con calEst y la renta con el borrador de la Declaración), mesadas y fondo de
// emergencia. Puro: recibe las filas ya cargadas. Antes vivía en apps/web (features/agenda/fiscal.ts → calEst,
// lib/chat/extras.ts → integralExtras y features/renta/data.ts → rentaInput); la web lo re-exporta y la API (F2-C,
// módulo insights) lo usa para dar las MISMAS cifras del Balance, el Dashboard y el chat.
// Si cambias esto, cambia también features/balance/use-integral.ts de la web (el hook hace lo mismo en el navegador).
import type { BookData } from "./types"
import type { LoadedBook } from "./book-data"
import type { ExtrasIntegral } from "./flujo-integral"
import { esImpuesto } from "./flujo-integral"
import { nextOcc as nextOccDomain } from "./dates"
import { fijoMensual } from "./fixed"
import { smmlvFor } from "./payroll"
import { salarioDesdeIngresos } from "./primas"
import { calcRenta, titularId, type RentaInput, type RentaMember, type TaxAssetIn, type TaxYearIn } from "./renta"

// ── Estimado de una fecha del calendario (calEst de la v4) ─────────────────────────────────────────────────────

export type TaxAsset = { tipo: string; avaluo: number; predial: number | null; imp_veh: number | null; soat: number | null; pct: number }

/** Próxima ocurrencia de una fecha del calendario (tolerancia de 1 día), como features/agenda/fiscal.ts. */
const nextOcc = (c: { fecha: string; anual: boolean | null }, today: string) => nextOccDomain({ fecha: c.fecha, anual: !!c.anual }, today, 1)

/**
 * Estimado de una fecha (calEst de la v4, sin la renta que viene de la Declaración).
 * Devuelve { v, how } o null si no hay cómo estimarla.
 */
export function calEst(c: { titulo: string; template_key?: string | null }, b: BookData, assets: TaxAsset[], smmlv: number, incomeCategories: { id: string; nombre: string }[]) {
  const k = c.template_key ?? ""
  const t = c.titulo.toLowerCase()
  const sal = salarioDesdeIngresos(b.incomes, incomeCategories, b.settings.trm)
  const desc = /descuento/.test(t)
  if (/prima/.test(t) && sal) return { v: sal / 2, how: "Medio salario mensual." }
  if (/intereses.*cesant/.test(t) && sal) return { v: sal * 0.12, how: "12 % de las cesantías (un salario)." }
  if (/cesant/.test(t) && sal) return { v: sal, how: "Un salario mensual por año trabajado." }
  if (/dotaci/.test(t)) return sal && sal <= 2 * smmlv ? { v: 0, how: "Te la entregan en especie (ropa y calzado), no en dinero." } : { v: 0, how: "Solo aplica si ganas hasta 2 salarios mínimos." }
  if (/predial/.test(t)) {
    const inm = assets.filter((a) => a.tipo === "inmueble")
    if (!inm.length) return null
    const v = inm.reduce((a, x) => a + (x.predial ?? x.avaluo * 0.007) * (x.pct / 100), 0)
    return { v: desc ? v * 0.9 : v, how: `Predial registrado o 7 por mil del avalúo${desc ? ", con 10 % de descuento" : ""}.` }
  }
  if (/vehicular/.test(t)) {
    const veh = assets.filter((a) => a.tipo === "vehiculo")
    if (!veh.length) return null
    const v = veh.reduce((a, x) => a + (x.imp_veh ?? x.avaluo * (x.avaluo <= 60e6 ? 0.015 : x.avaluo <= 135e6 ? 0.025 : 0.035)) * (x.pct / 100), 0)
    return { v: desc ? v * 0.9 : v, how: `Impuesto registrado o tarifa de 1,5 %, 2,5 % o 3,5 % del avalúo${desc ? ", con 10 % de descuento" : ""} (aproximación Bogotá).` }
  }
  if (/soat/.test(t)) { const v = assets.filter((a) => a.tipo === "vehiculo").reduce((a, x) => a + (x.soat ?? 0), 0); return v ? { v, how: "Valor de tu póliza registrada." } : null }
  if (/matr/.test(t)) { const f = b.fixedExpenses.find((x) => /coleg|jard|univers|pensi/i.test(x.nombre)); return f ? { v: fijoMensual(f), how: `Una mensualidad de “${f.nombre}”.` } : null }
  if (/arriendo/.test(t)) { const f = b.fixedExpenses.find((x) => /arriendo/i.test(x.nombre)); return f ? { v: f.valor * 0.051, how: "5,1 % (IPC 2025) del canon actual: es lo máximo que puede subir." } : null }
  if (/diciembre/.test(t) && sal) return { v: (sal / 2) * 0.3, how: "30 % de la prima de diciembre." }
  if (k === "renta") return null
  return null
}

// ── Datos de la Declaración de renta (forma de features/renta/data.ts) ─────────────────────────────────────────

export type TaxYearRow = TaxYearIn & { id: string; year: number; member_id: string }
export type TaxAssetRow = TaxAssetIn & { id: string }
export type AttachmentRow = { id: string; doc_key: string | null; year: number | null; nombre: string; size: number; mime: string; path: string; created_at: string }

/** Todo lo que usa la Declaración de renta (sirve para el titular y para el portal del contador). */
export type RentaData = {
  book: Omit<LoadedBook, "incomes" | "assets" | "expenses" | "extraIncomes"> & {
    incomes: (LoadedBook["incomes"][number] & { cat?: string; bruto?: number | null; deducciones?: unknown })[]
    assets: (LoadedBook["assets"][number] & { id: string; nombre: string })[]
    expenses: (LoadedBook["expenses"][number] & { deducible?: string | null; currency?: string | null })[]
    extraIncomes: (LoadedBook["extraIncomes"][number] & { member_id?: string | null; cat?: string; currency?: string | null })[]
  }
  members: (RentaMember & { color?: string })[]
  bienes: TaxAssetRow[]
  years: TaxYearRow[]
  /** Sobrescrituras del libro (Ajustes › Finanzas) y valores oficiales de `ref_uvt`/`ref_smmlv`. */
  settings: { uvt: Record<string, number>; smmlv: Record<string, number>; refUvt?: Record<string, number>; refSmmlv?: Record<string, number> }
  perfil: { nombre: string; digitos: string; doc: string }
  fechas: { year: number; regimen: string; fecha: string }[]
  attachments: AttachmentRow[]
  liabilitiesNamed: { nombre: string; cod: string; valor: number; currency: string }[]
}

/* eslint-disable @typescript-eslint/no-explicit-any -- filas crudas de la base (las tipa quien las carga) */
/** Filas que carga quien arma la Declaración (navegador, servidor de Next o la API). */
export type RentaRows = {
  members: any[]
  incomeCategories: { id: string; nombre: string }[]
  bienes: any[]
  years: any[]
  perfil: { nombre?: string | null; digitos?: string | null; doc?: string | null } | null
  fechas: { year: number; regimen: string; fecha: string }[]
  attachments: AttachmentRow[]
  liabilities: { nombre: string; cod: string; valor: unknown; currency: string }[]
  ref: { uvt: Record<string, number>; smmlv: Record<string, number> }
}

/**
 * Arma los datos de la renta a partir del libro y las filas (la parte pura de loadRentaData): solo deja lo que usa la
 * Declaración (sin gastos fijos, suscripciones, metas, calendario, medios ni movimientos de metas, y los gastos solo
 * con los campos de los topes y los deducibles).
 */
export function rentaDataFrom(book: LoadedBook, r: RentaRows): RentaData {
  const catName = new Map(r.incomeCategories.map((c) => [c.id, c.nombre]))
  const s = book.raw.settings as { uvt?: Record<string, number>; smmlv?: Record<string, number> }
  const n = (v: unknown) => Number(v ?? 0)
  type Raw = Record<string, unknown>
  const renta = {
    ...book, fixedExpenses: [], subscriptions: [], goals: [], calendarEvents: [],
    ...("paymentMethods" in book ? { paymentMethods: [] } : {}), ...("goalMovements" in book ? { goalMovements: [] } : {}),
    incomes: book.incomes.map((x) => ({ ...x, cat: catName.get(x.category_id ?? "") ?? "", bruto: (x as { bruto?: number | null }).bruto ?? null })),
    expenses: book.expenses.map((g) => {
      const raw = g as unknown as Raw
      return { id: g.id, fecha: g.fecha, valor: g.valor, descripcion: g.descripcion, category_id: g.category_id ?? null, member_id: g.member_id ?? null, currency: (raw.currency as string | null) ?? null, deducible: (raw.deducible as string | null) ?? null }
    }),
    extraIncomes: book.extraIncomes.map((x) => {
      const raw = x as unknown as Raw
      return { ...x, member_id: (raw.member_id as string | null) ?? null, currency: (raw.currency as string | null) ?? null, cat: catName.get((raw.category_id as string) ?? "") ?? "" }
    }),
  }
  const digitos = r.perfil?.digitos ?? ""
  return {
    book: renta as unknown as RentaData["book"],
    members: r.members.map((m) => ({ id: m.id, nombre: m.nombre, rol: m.rol, es_titular: m.es_titular, nacimiento: m.nacimiento, doc: m.doc, dep_de: m.dep_de, dep_rel: m.dep_rel, estudia: m.estudia, sin_ingresos: m.sin_ingresos, discapacidad: m.discapacidad, color: m.color })),
    bienes: r.bienes.map((b) => ({ ...b, costo: n(b.costo), avaluo: n(b.avaluo), valor31: n(b.valor31), pct: n(b.pct) || 100, predial: b.predial === null ? null : n(b.predial), imp_veh: b.imp_veh === null ? null : n(b.imp_veh), soat: b.soat === null ? null : n(b.soat) })) as TaxAssetRow[],
    years: r.years.map((y) => ({ id: y.id, year: y.year, member_id: y.member_id, ing: (y.ing ?? {}) as TaxYearIn["ing"], ded: (y.ded ?? {}) as TaxYearIn["ded"], docs: (y.docs ?? {}) as Record<string, boolean>, consig: n(y.consig), consumos: n(y.consumos) })),
    settings: { uvt: s.uvt ?? {}, smmlv: s.smmlv ?? {}, refUvt: r.ref.uvt, refSmmlv: r.ref.smmlv },
    perfil: { nombre: r.perfil?.nombre ?? "", digitos, doc: r.perfil?.doc ?? "" },
    fechas: r.fechas,
    attachments: r.attachments,
    liabilitiesNamed: r.liabilities.map((l) => ({ nombre: l.nombre, cod: l.cod, valor: n(l.valor), currency: l.currency })),
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Entrada para los cálculos de renta.ts. */
export function rentaInput(d: Pick<RentaData, "book" | "members" | "bienes" | "years" | "settings">, y: number, mid: string): RentaInput {
  const t = d.years.find((x) => x.year === y && x.member_id === mid) ?? null
  return { book: d.book, members: d.members, bienes: d.bienes, tax: t, uvtOverrides: d.settings.uvt, smmlvOverrides: d.settings.smmlv, uvtRef: d.settings.refUvt, smmlvRef: d.settings.refSmmlv }
}

// ── Extras del flujo integral ──────────────────────────────────────────────────────────────────────────────────

type Cal = LoadedBook["calendarEvents"][number] & { anual?: boolean | null; template_key?: string | null; cat?: string | null }
export const esRenta = (e: Cal) => e.template_key === "renta" || /declaraci[oó]n de renta/i.test(e.titulo)

/** ¿Hace falta cargar la Declaración para estimar la renta del calendario? */
export const necesitaRenta = (book: LoadedBook) => (book.calendarEvents as Cal[]).some((e) => esRenta(e) && !+e.monto)

export type ExtrasRows = {
  taxAssets: { tipo: string; avaluo: unknown; predial: unknown; imp_veh: unknown; soat: unknown; pct: unknown }[]
  incCats: { id: string; nombre: string }[]
  allowances: { id: string; member_id: string; mesada: unknown; frec: string | null }[]
  movs: { allowance_id: string; fecha: string; valor: unknown }[]
  fondo: { fecha: string; valor: unknown; tipo: string; expense_id: string | null }[]
  members: { id: string; nombre: string }[]
  renta?: Pick<RentaData, "book" | "members" | "bienes" | "years" | "settings"> | null
}

/** Extras del flujo integral con la misma regla de features/balance/use-integral.ts (Balance y Dashboard). */
export function integralExtras(book: LoadedBook, today: string, r: ExtrasRows): ExtrasIntegral {
  const X: ExtrasIntegral = {}
  const smmlv = smmlvFor(+today.slice(0, 4), (book.raw.settings as { smmlv?: Record<string, number> }).smmlv)
  const n = (v: unknown) => (v == null ? null : Number(v))
  const bienes: TaxAsset[] = r.taxAssets.map((a) => ({ tipo: a.tipo, avaluo: Number(a.avaluo), predial: n(a.predial), imp_veh: n(a.imp_veh), soat: n(a.soat), pct: Number(a.pct) || 100 }))
  const est: NonNullable<ExtrasIntegral["estimados"]> = {}
  for (const e of book.calendarEvents as Cal[]) {
    if (e.tipo !== "egreso" || +e.monto > 0 || !esImpuesto(e)) continue
    if (esRenta(e)) {
      if (!r.renta) continue
      const y = +nextOcc({ fecha: e.fecha, anual: !!e.anual }, today).slice(0, 4) - 1, mid = titularId(r.renta.members)
      const C = calcRenta(rentaInput(r.renta, y, mid), y, mid, today)
      if (C.saldo > 0) est[e.id] = { v: C.saldo, how: `con el borrador de tu Declaración ${y}` }
      continue
    }
    const c = calEst(e, book, bienes, smmlv, r.incCats)
    if (c && c.v > 0) est[e.id] = { v: c.v, how: c.how.replace(/\.$/, "").toLowerCase() }
  }
  X.estimados = est
  const nombre = new Map(r.members.map((m) => [m.id, m.nombre]))
  X.mesadas = r.allowances.map((a) => ({
    id: a.id, nombre: nombre.get(a.member_id) ?? "tu hijo", mesada: Number(a.mesada ?? 0), frec: a.frec ?? "semanal",
    movs: r.movs.filter((m) => m.allowance_id === a.id).map((m) => ({ fecha: m.fecha, valor: Number(m.valor) })),
  }))
  X.fondo = r.fondo.map((f) => ({ fecha: f.fecha, valor: Number(f.valor), tipo: f.tipo, expense_id: f.expense_id }))
  return X
}

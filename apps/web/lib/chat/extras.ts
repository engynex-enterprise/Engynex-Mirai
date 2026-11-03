// Lo que el flujo integral necesita y no viaja en el libro (estimados de impuestos, mesadas y fondo de emergencia),
// armado en el servidor para el chat con LA MISMA regla que features/balance/use-integral.ts (Balance y Dashboard).
// Así "¿cuánto me queda?" en el chat da la misma cifra que el Balance. Puro: recibe las filas ya cargadas.
// Si cambias useIntegralExtras, cambia esto también (o lleva los dos a una sola función pura).
import { calcRenta, smmlvFor, titularId } from "@/lib/domain"
import { esImpuesto, type ExtrasIntegral } from "@/lib/domain/flujo-integral"
import type { LoadedBook } from "@/lib/book-data"
import { calEst, nextOcc, type TaxAsset } from "@/features/agenda/fiscal"
import { rentaInput, type RentaData } from "@/features/renta/data"

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
  renta?: RentaData | null
}

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

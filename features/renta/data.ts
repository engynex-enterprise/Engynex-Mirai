import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"
import { loadBookData, type LoadedBook } from "@/lib/book-data"
import type { RentaInput, RentaMember, TaxAssetIn, TaxYearIn } from "@/lib/domain"

export type TaxYearRow = TaxYearIn & { id: string; year: number; member_id: string }
export type TaxAssetRow = TaxAssetIn & { id: string }
export type AttachmentRow = { id: string; doc_key: string | null; year: number | null; nombre: string; size: number; mime: string; path: string; created_at: string }

/** Todo lo que usa la Declaración de renta (sirve para el titular y para el portal del contador). */
export type RentaData = {
  book: Omit<LoadedBook, "incomes" | "assets"> & { incomes: (LoadedBook["incomes"][number] & { cat?: string; bruto?: number | null })[]; assets: (LoadedBook["assets"][number] & { id: string; nombre: string })[] }
  members: (RentaMember & { color?: string })[]
  bienes: TaxAssetRow[]
  years: TaxYearRow[]
  settings: { uvt: Record<string, number>; smmlv: Record<string, number> }
  perfil: { nombre: string; digitos: string; doc: string }
  fechas: { year: number; regimen: string; fecha: string }[]
  attachments: AttachmentRow[]
  liabilitiesNamed: { nombre: string; cod: string; valor: number; currency: string }[]
}

/** Carga los datos de la renta con el cliente que se le pase (navegador con RLS o admin en el portal del contador). */
export async function loadRentaData(sb: SupabaseClient<Database>, bookId: string, ownerId?: string | null): Promise<RentaData> {
  const [book, { data: bk }] = await Promise.all([loadBookData(sb, bookId), sb.from("books").select("household_id,created_by").eq("id", bookId).single()])
  const hh = bk!.household_id
  const owner = ownerId ?? bk!.created_by
  const [mem, cats, bienes, years, prof, att, liab] = await Promise.all([
    sb.from("family_members").select("*").eq("household_id", hh).is("deleted_at", null).order("sort").order("created_at"),
    sb.from("income_categories").select("id,nombre").eq("book_id", bookId),
    sb.from("tax_assets").select("*").eq("book_id", bookId).is("deleted_at", null).order("created_at"),
    sb.from("tax_years").select("*").eq("book_id", bookId).is("deleted_at", null),
    owner ? sb.from("profiles").select("nombre,digitos,doc").eq("id", owner).maybeSingle() : Promise.resolve({ data: null }),
    sb.from("attachments").select("id,doc_key,year,nombre,size,mime,path,created_at").eq("book_id", bookId).is("deleted_at", null).not("doc_key", "is", null).order("created_at"),
    sb.from("liabilities").select("nombre,cod,valor,currency").eq("book_id", bookId).is("deleted_at", null),
  ])
  const digitos = (prof.data as { digitos?: string } | null)?.digitos ?? ""
  const { data: fechas } = /^\d{2}$/.test(digitos) ? await sb.from("ref_renta_calendar").select("year,regimen,fecha").eq("digitos", digitos) : { data: [] }
  const catName = new Map((cats.data ?? []).map((c) => [c.id, c.nombre]))
  const s = book.raw.settings as { uvt?: Record<string, number>; smmlv?: Record<string, number> }
  const n = (v: unknown) => Number(v ?? 0)
  return {
    book: { ...book, incomes: book.incomes.map((x) => ({ ...x, cat: catName.get(x.category_id ?? "") ?? "", bruto: (x as { bruto?: number | null }).bruto ?? null })) } as RentaData["book"],
    members: (mem.data ?? []).map((m) => ({ id: m.id, nombre: m.nombre, rol: m.rol, es_titular: m.es_titular, nacimiento: m.nacimiento, doc: m.doc, dep_de: m.dep_de, dep_rel: m.dep_rel, estudia: m.estudia, sin_ingresos: m.sin_ingresos, discapacidad: m.discapacidad, color: m.color })),
    bienes: (bienes.data ?? []).map((b) => ({ ...b, costo: n(b.costo), avaluo: n(b.avaluo), valor31: n(b.valor31), pct: n(b.pct) || 100, predial: b.predial === null ? null : n(b.predial), imp_veh: b.imp_veh === null ? null : n(b.imp_veh), soat: b.soat === null ? null : n(b.soat) })) as TaxAssetRow[],
    years: (years.data ?? []).map((y) => ({ id: y.id, year: y.year, member_id: y.member_id, ing: (y.ing ?? {}) as TaxYearIn["ing"], ded: (y.ded ?? {}) as TaxYearIn["ded"], docs: (y.docs ?? {}) as Record<string, boolean>, consig: n(y.consig), consumos: n(y.consumos) })),
    settings: { uvt: s.uvt ?? {}, smmlv: s.smmlv ?? {} },
    perfil: { nombre: (prof.data as { nombre?: string } | null)?.nombre ?? "", digitos, doc: (prof.data as { doc?: string } | null)?.doc ?? "" },
    fechas: (fechas ?? []) as RentaData["fechas"],
    attachments: (att.data ?? []) as AttachmentRow[],
    liabilitiesNamed: (liab.data ?? []).map((l) => ({ nombre: l.nombre, cod: l.cod, valor: n(l.valor), currency: l.currency })),
  }
}

/** Entrada para los cálculos de lib/domain/renta. */
export function rentaInput(d: RentaData, y: number, mid: string): RentaInput {
  const t = d.years.find((x) => x.year === y && x.member_id === mid) ?? null
  return { book: d.book, members: d.members, bienes: d.bienes, tax: t, uvtOverrides: d.settings.uvt, smmlvOverrides: d.settings.smmlv }
}

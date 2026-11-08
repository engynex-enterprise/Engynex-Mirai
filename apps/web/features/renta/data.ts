import type { LoadedBook } from "@/lib/book-data"
import type { RentaInput, RentaMember, TaxAssetIn, TaxYearIn } from "@/lib/domain"

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

/** La Declaración en el navegador (titular, Calendario fiscal y el flujo integral): GET /v1/books/:b/renta. */
export async function fetchRentaData(bookId: string): Promise<RentaData> {
  const { browserApi, unwrap } = await import("@/lib/api/client")
  return unwrap(await browserApi().accountantOwner.renta({ params: { bookId } })) as unknown as RentaData
}

/** Entrada para los cálculos de lib/domain/renta. */
export function rentaInput(d: RentaData, y: number, mid: string): RentaInput {
  const t = d.years.find((x) => x.year === y && x.member_id === mid) ?? null
  return { book: d.book, members: d.members, bienes: d.bienes, tax: t, uvtOverrides: d.settings.uvt, smmlvOverrides: d.settings.smmlv, uvtRef: d.settings.refUvt, smmlvRef: d.settings.refSmmlv }
}

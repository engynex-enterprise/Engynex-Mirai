// Adaptador de hoy (PostgREST con el JWT de la persona): las mismas consultas de loadChatBook, loadRentaData y
// useList("net_worth_snapshots") de apps/web.
import { Injectable } from "@nestjs/common"
import type { ExtrasRows } from "@mirai/domain/integral-extras"
import { refPorAnio } from "@mirai/domain/payroll"
import type { SnapshotIn } from "@mirai/domain/vistas"
import type { DbScope } from "../../../core/db/scope"
import { SupabaseJsFactory } from "../../../core/db/supabase-js.factory"
import { DomainError } from "../../../core/errors/domain-error"
import { InsightsRepo, type BookRef, type RentaCalcRows } from "../insights.repository"

type Res<T> = { data: T | null; error: { code?: string; message?: string } | null }
const rows = <T>(r: Res<T[]>): T[] => {
  if (r.error) throw DomainError.fromPg(r.error)
  return r.data ?? []
}

@Injectable()
export class SupabaseJsInsightsRepo extends InsightsRepo {
  constructor(private readonly sb: SupabaseJsFactory) {
    super()
  }

  async extras(scope: DbScope, { bookId, householdId }: BookRef): Promise<Omit<ExtrasRows, "renta">> {
    const sb = this.sb.for(scope)
    const [fondo, taxAssets, incCats, allowances, movs, members] = await Promise.all([
      sb.from("fund_movements").select("fecha,valor,tipo,expense_id").eq("book_id", bookId).is("deleted_at", null),
      sb.from("tax_assets").select("tipo,avaluo,predial,imp_veh,soat,pct").eq("book_id", bookId).is("deleted_at", null),
      sb.from("income_categories").select("id,nombre").eq("book_id", bookId).is("deleted_at", null),
      sb.from("allowances").select("id,member_id,mesada,frec").eq("book_id", bookId).is("deleted_at", null),
      sb.from("allowance_movements").select("allowance_id,fecha,valor").eq("book_id", bookId).is("deleted_at", null),
      sb.from("family_members").select("id,nombre").eq("household_id", householdId).is("deleted_at", null),
    ])
    return { fondo: rows(fondo), taxAssets: rows(taxAssets), incCats: rows(incCats), allowances: rows(allowances), movs: rows(movs), members: rows(members) }
  }

  async renta(scope: DbScope, { bookId, householdId }: BookRef): Promise<RentaCalcRows> {
    const sb = this.sb.for(scope)
    const [mem, cats, bienes, years, u, s] = await Promise.all([
      sb.from("family_members").select("*").eq("household_id", householdId).is("deleted_at", null).order("sort").order("created_at"),
      sb.from("income_categories").select("id,nombre").eq("book_id", bookId),
      sb.from("tax_assets").select("*").eq("book_id", bookId).is("deleted_at", null).order("created_at"),
      sb.from("tax_years").select("*").eq("book_id", bookId).is("deleted_at", null),
      sb.from("ref_uvt").select("year,valor"),
      sb.from("ref_smmlv").select("year,valor"),
    ])
    // Como loadRefData: si las tablas de referencia fallan, los cálculos usan las constantes del código.
    const ref = u.error || s.error ? { uvt: {}, smmlv: {} } : { uvt: refPorAnio(u.data), smmlv: refPorAnio(s.data) }
    return { members: rows(mem), incomeCategories: rows(cats), bienes: rows(bienes), years: rows(years), ref }
  }

  async snapshots(scope: DbScope, bookId: string): Promise<SnapshotIn[]> {
    return rows(await this.sb.for(scope).from("net_worth_snapshots").select("mes,patrimonio").eq("book_id", bookId).is("deleted_at", null))
  }
}

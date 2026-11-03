// Adaptador de hoy (PostgREST). Mismas consultas que la web: Ajustes › Finanzas (TRM y usura más recientes),
// calculadoras (UVT), calendario fiscal (ref_renta_calendar / ref_renta_regimenes) y festivos.
import { Injectable } from "@nestjs/common"
import type { AnioValor, Festivo, RentaFecha, RentaRegimen, Trm, Usura } from "@mirai/contracts/modules/refs"
import type { DbScope } from "../../../../core/db/scope"
import { SupabaseJsFactory } from "../../../../core/db/supabase-js.factory"
import { DomainError } from "../../../../core/errors/domain-error"
import { RefsRepo, type FestivosQ, type RentaCalendarQ } from "../refs.repository"

const ok = <T>({ data, error }: { data: T[] | null; error: { code?: string; message?: string } | null }): T[] => {
  if (error) throw DomainError.fromPg(error)
  return data ?? []
}

@Injectable()
export class SupabaseJsRefsRepo extends RefsRepo {
  constructor(private readonly sb: SupabaseJsFactory) {
    super()
  }

  async porAnio(scope: DbScope, tabla: "ref_uvt" | "ref_smmlv"): Promise<AnioValor[]> {
    return ok(await this.sb.for(scope).from(tabla).select("year,valor,fuente").order("year", { ascending: true }))
  }

  async trm(scope: DbScope, limit: number): Promise<Trm[]> {
    return ok(await this.sb.for(scope).from("ref_trm").select("fecha,valor,fuente").order("fecha", { ascending: false }).limit(limit))
  }

  async usura(scope: DbScope, limit: number): Promise<Usura[]> {
    return ok(await this.sb.for(scope).from("ref_usury_rate").select("desde,hasta,modalidad,tasa_ea").order("desde", { ascending: false }).limit(limit))
  }

  async festivos(scope: DbScope, q: FestivosQ): Promise<Festivo[]> {
    let b = this.sb.for(scope).from("ref_holidays").select("fecha,nombre")
    if (q.year) b = b.gte("fecha", `${q.year}-01-01`).lte("fecha", `${q.year}-12-31`)
    if (q.desde) b = b.gte("fecha", q.desde)
    return ok(await b.order("fecha", { ascending: true }))
  }

  async rentaCalendar(scope: DbScope, q: RentaCalendarQ): Promise<RentaFecha[]> {
    let b = this.sb.for(scope).from("ref_renta_calendar").select("year,digitos,regimen,fecha")
    if (q.digitos) b = b.eq("digitos", q.digitos)
    if (q.year) b = b.eq("year", q.year)
    return ok(await b.order("year", { ascending: false }).order("fecha", { ascending: true }))
  }

  async rentaRegimenes(scope: DbScope): Promise<RentaRegimen[]> {
    return ok(await this.sb.for(scope).from("ref_renta_regimenes").select("key,nombre,descripcion,norma,seccionales").order("key", { ascending: true }))
  }
}

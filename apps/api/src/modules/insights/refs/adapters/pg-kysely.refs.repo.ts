// Adaptador para Cloud SQL (fase 4): las mismas consultas con Kysely dentro de tx().
import { Injectable } from "@nestjs/common"
import type { AnioValor, Festivo, RentaFecha, RentaRegimen, Trm, Usura } from "@mirai/contracts/modules/refs"
import type { DbScope } from "../../../../core/db/scope"
import { PgKyselyFactory } from "../../../../core/db/pg-kysely.factory"
import { RefsRepo, type FestivosQ, type RentaCalendarQ } from "../refs.repository"

@Injectable()
export class PgKyselyRefsRepo extends RefsRepo {
  constructor(private readonly db: PgKyselyFactory) {
    super()
  }

  porAnio(scope: DbScope, tabla: "ref_uvt" | "ref_smmlv"): Promise<AnioValor[]> {
    return this.db.tx(scope, (trx) => trx.selectFrom(tabla).select(["year", "valor", "fuente"]).orderBy("year", "asc").execute())
  }

  trm(scope: DbScope, limit: number): Promise<Trm[]> {
    return this.db.tx(scope, (trx) => trx.selectFrom("ref_trm").select(["fecha", "valor", "fuente"]).orderBy("fecha", "desc").limit(limit).execute())
  }

  usura(scope: DbScope, limit: number): Promise<Usura[]> {
    return this.db.tx(scope, (trx) => trx.selectFrom("ref_usury_rate").select(["desde", "hasta", "modalidad", "tasa_ea"]).orderBy("desde", "desc").limit(limit).execute())
  }

  festivos(scope: DbScope, q: FestivosQ): Promise<Festivo[]> {
    return this.db.tx(scope, (trx) => {
      let b = trx.selectFrom("ref_holidays").select(["fecha", "nombre"])
      if (q.year) b = b.where("fecha", ">=", `${q.year}-01-01`).where("fecha", "<=", `${q.year}-12-31`)
      if (q.desde) b = b.where("fecha", ">=", q.desde)
      return b.orderBy("fecha", "asc").execute()
    })
  }

  rentaCalendar(scope: DbScope, q: RentaCalendarQ): Promise<RentaFecha[]> {
    return this.db.tx(scope, (trx) => {
      let b = trx.selectFrom("ref_renta_calendar").select(["year", "digitos", "regimen", "fecha"])
      if (q.digitos) b = b.where("digitos", "=", q.digitos)
      if (q.year) b = b.where("year", "=", q.year)
      return b.orderBy("year", "desc").orderBy("fecha", "asc").execute()
    })
  }

  rentaRegimenes(scope: DbScope): Promise<RentaRegimen[]> {
    return this.db.tx(scope, (trx) => trx.selectFrom("ref_renta_regimenes").select(["key", "nombre", "descripcion", "norma", "seccionales"]).orderBy("key", "asc").execute())
  }
}

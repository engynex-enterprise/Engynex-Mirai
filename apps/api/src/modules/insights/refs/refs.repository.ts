// Puerto de los datos de referencia (tablas `ref_*`, lectura pública). Con UserScope: la persona autenticada las lee
// como hoy desde el navegador (RLS de lectura pública).
import type { AnioValor, Festivo, RentaFecha, RentaRegimen, Trm, Usura } from "@mirai/contracts/modules/refs"
import type { DbScope } from "../../../core/db/scope"

export type FestivosQ = { year?: number; desde?: string }
export type RentaCalendarQ = { digitos?: string; year?: number }

export abstract class RefsRepo {
  abstract porAnio(scope: DbScope, tabla: "ref_uvt" | "ref_smmlv"): Promise<AnioValor[]>
  abstract trm(scope: DbScope, limit: number): Promise<Trm[]>
  abstract usura(scope: DbScope, limit: number): Promise<Usura[]>
  abstract festivos(scope: DbScope, q: FestivosQ): Promise<Festivo[]>
  abstract rentaCalendar(scope: DbScope, q: RentaCalendarQ): Promise<RentaFecha[]>
  abstract rentaRegimenes(scope: DbScope): Promise<RentaRegimen[]>
}

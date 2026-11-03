import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"
import { refPorAnio } from "@/lib/domain/payroll"

/** Valores oficiales de referencia (tablas `ref_*`, lectura pública) en la forma que reciben `uvtFor`/`smmlvFor`. */
export type RefData = { uvt: Record<string, number>; smmlv: Record<string, number> }

/**
 * Carga la UVT y el SMMLV oficiales. Si la consulta falla, devuelve mapas vacíos: los cálculos usan entonces las
 * constantes del código (que hoy coinciden con las tablas).
 */
export async function loadRefData(sb: SupabaseClient<Database>): Promise<RefData> {
  const [u, s] = await Promise.all([sb.from("ref_uvt").select("year,valor"), sb.from("ref_smmlv").select("year,valor")])
  return { uvt: refPorAnio(u.data), smmlv: refPorAnio(s.data) }
}

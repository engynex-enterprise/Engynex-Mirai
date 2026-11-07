import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/supabase/database.types"
import { refPorAnio } from "@/lib/domain/payroll"
import { apiOn } from "@/lib/api/session"

/** Valores oficiales de referencia (tablas `ref_*`, lectura pública) en la forma que reciben `uvtFor`/`smmlvFor`. */
export type RefData = { uvt: Record<string, number>; smmlv: Record<string, number> }

/**
 * Carga la UVT y el SMMLV oficiales con el cliente que se le pase (rama heredada: navegador con RLS o el portal del
 * contador en el servidor). Si la consulta falla, devuelve mapas vacíos: los cálculos usan entonces las constantes del
 * código (que hoy coinciden con las tablas).
 */
export async function loadRefData(sb: SupabaseClient<Database>): Promise<RefData> {
  const [u, s] = await Promise.all([sb.from("ref_uvt").select("year,valor"), sb.from("ref_smmlv").select("year,valor")])
  return { uvt: refPorAnio(u.data), smmlv: refPorAnio(s.data) }
}

// ── V7-H2: datos de referencia por la API (/v1/refs/*, interruptor `refs`) ─────────────────────────────────────
// Solo en el navegador. Apagado (o en el servidor de Next): las tablas `ref_*` con supabase-js, como siempre. Si la
// API no responde se lee de Supabase (son lecturas públicas).

const api = () => import("@/lib/api/client")
const browserSb = async () => (await import("@/utils/supabase/client")).createClient()
const viaRefs = () => apiOn("refs")

async function withFallback<T>(viaApi: () => Promise<T>, legacy: () => Promise<T>): Promise<T> {
  if (!viaRefs()) return legacy()
  const { readWithFallback } = await import("@/lib/api/book-tables")
  return readWithFallback(viaApi, legacy)
}

/** UVT y SMMLV oficiales (la forma de loadRefData). */
export function fetchRefData(): Promise<RefData> {
  return withFallback(async () => {
    const { browserApi, unwrap } = await api()
    const a = browserApi()
    const [u, s] = await Promise.all([a.refs.uvt(), a.refs.smmlv()])
    return { uvt: refPorAnio(unwrap(u)), smmlv: refPorAnio(unwrap(s)) }
  }, async () => loadRefData(await browserSb()))
}

/** UVT de un año con su fuente (o null). */
export function fetchUvtYear(year: number): Promise<{ valor: number; fuente: string | null } | null> {
  return withFallback(async () => {
    const { browserApi, unwrap } = await api()
    const r = unwrap(await browserApi().refs.uvt()).find((x) => x.year === year)
    return r ? { valor: r.valor, fuente: r.fuente } : null
  }, async () => (await (await browserSb()).from("ref_uvt").select("valor,fuente").eq("year", year).maybeSingle()).data)
}

export type RentaFechaRef = { year: number; digitos: string; regimen: string; fecha: string }
export type RentaRegimenRef = { key: string; nombre: string; descripcion: string; norma: string; seccionales: string[] }

/** Calendario de renta de la DIAN para unos dígitos (todos los años), del año más reciente al más viejo. */
export function fetchRentaCalendar(digitos: string): Promise<RentaFechaRef[]> {
  const norm = (rows: { year: number | string; digitos: string; regimen: string; fecha: string }[]) =>
    rows.map((f) => ({ ...f, year: +f.year, fecha: String(f.fecha).slice(0, 10) })).sort((a, b) => b.year - a.year)
  return withFallback(async () => {
    const { browserApi, unwrap } = await api()
    return norm(unwrap(await browserApi().refs.rentaCalendar({ query: { digitos } })))
  }, async () => norm((await (await browserSb()).from("ref_renta_calendar").select("year,digitos,regimen,fecha").eq("digitos", digitos).order("year", { ascending: false })).data ?? []))
}

/** Regímenes del calendario de renta (plazos especiales por seccional). */
export function fetchRentaRegimenes(): Promise<RentaRegimenRef[]> {
  return withFallback(async () => {
    const { browserApi, unwrap } = await api()
    return unwrap(await browserApi().refs.rentaRegimenes())
  }, async () => ((await (await browserSb()).from("ref_renta_regimenes").select("*")).data ?? []) as RentaRegimenRef[])
}

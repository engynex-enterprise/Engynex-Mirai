// Datos de referencia por la API (/v1/refs/*, lecturas públicas). Solo en el navegador.

const api = () => import("@/lib/api/client")

/** UVT de un año con su fuente (o null). */
export async function fetchUvtYear(year: number): Promise<{ valor: number; fuente: string | null } | null> {
  const { browserApi, unwrap } = await api()
  const r = unwrap(await browserApi().refs.uvt()).find((x) => x.year === year)
  return r ? { valor: r.valor, fuente: r.fuente } : null
}

export type RentaFechaRef = { year: number; digitos: string; regimen: string; fecha: string }
export type RentaRegimenRef = { key: string; nombre: string; descripcion: string; norma: string; seccionales: string[] }

/** Calendario de renta de la DIAN para unos dígitos (todos los años), del año más reciente al más viejo. */
export async function fetchRentaCalendar(digitos: string): Promise<RentaFechaRef[]> {
  const { browserApi, unwrap } = await api()
  return unwrap(await browserApi().refs.rentaCalendar({ query: { digitos } }))
    .map((f) => ({ ...f, year: +f.year, fecha: String(f.fecha).slice(0, 10) }))
    .sort((a, b) => b.year - a.year)
}

/** Regímenes del calendario de renta (plazos especiales por seccional). */
export async function fetchRentaRegimenes(): Promise<RentaRegimenRef[]> {
  const { browserApi, unwrap } = await api()
  return unwrap(await browserApi().refs.rentaRegimenes())
}

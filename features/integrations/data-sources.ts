import "server-only"

/** TRM vigente (Superfinanciera en datos.gov.co, dataset 32sa-8pi3). */
export async function fetchTrm() {
  const r = await fetch("https://www.datos.gov.co/resource/32sa-8pi3.json?$limit=1&$order=vigenciadesde%20DESC", { next: { revalidate: 3600 } }).then((x) => x.json())
  return { valor: Number(r[0].valor), fecha: String(r[0].vigenciadesde).slice(0, 10), hasta: String(r[0].vigenciahasta).slice(0, 10) }
}

/**
 * Tasa de usura = 1,5 × interés bancario corriente de consumo y ordinario (C. de Comercio art. 884;
 * C. Penal art. 305). Fuente: Superfinanciera en datos.gov.co, dataset pare-7x5i.
 */
export async function fetchUsura() {
  const r = await fetch("https://www.datos.gov.co/resource/pare-7x5i.json?$limit=20&$order=vigencia_desde%20DESC", { next: { revalidate: 21600 } }).then((x) => x.json())
  const row = (r as { modalidad: string; interes_bancario_corriente: string; vigencia_desde: string; vigencia_hasta: string }[]).find((x) => /CONSUMO Y ORDINARIO/i.test(x.modalidad))
  if (!row) throw new Error("No encontramos la tasa vigente")
  const ibc = parseFloat(row.interes_bancario_corriente.replace(",", "."))
  return { ibc, usura: ibc * 1.5, desde: row.vigencia_desde.slice(0, 10), hasta: row.vigencia_hasta.slice(0, 10) }
}

/** Festivos de Colombia (Nager.Date). */
export async function fetchFestivos(year: number) {
  const r = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/CO`, { next: { revalidate: 86400 } }).then((x) => x.json())
  return (r as { date: string; localName: string }[]).map((x) => ({ fecha: x.date, nombre: x.localName }))
}

/** Pesos por unidad de USD y EUR (open.er-api.com). */
export async function fetchFx() {
  const r = await fetch("https://open.er-api.com/v6/latest/COP", { next: { revalidate: 3600 } }).then((x) => x.json())
  return { USD: 1 / r.rates.USD, EUR: 1 / r.rates.EUR }
}

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

/**
 * Precio de criptomonedas en la moneda `vs` (cop, usd…) desde CoinGecko. Acepta el id de CoinGecko ("bitcoin") o el
 * símbolo ("btc"). Devuelve { símbolo o id en minúsculas: precio }. La clave demo es opcional.
 */
export async function fetchCryptoPrices(symbols: string[], vs: string, apiKey?: string) {
  const list = [...new Set(symbols.map((s) => s.trim().toLowerCase()).filter(Boolean))]
  if (!list.length) return {} as Record<string, number>
  const headers: Record<string, string> = apiKey ? { "x-cg-demo-api-key": apiKey } : {}
  const get = async (param: "ids" | "symbols") => {
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?${param}=${encodeURIComponent(list.join(","))}&vs_currencies=${encodeURIComponent(vs)}`, { headers, next: { revalidate: 3600 } })
    if (!r.ok) return {} as Record<string, Record<string, number>>
    return (await r.json()) as Record<string, Record<string, number>>
  }
  const [byId, bySym] = await Promise.all([get("ids"), get("symbols")])
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries({ ...bySym, ...byId })) if (Number(v?.[vs]) > 0) out[k.toLowerCase()] = Number(v[vs])
  return out
}

/** Último precio de una acción o ETF (Alpha Vantage GLOBAL_QUOTE o Twelve Data /price), en la moneda de su bolsa. */
export async function fetchStockPrice(symbol: string, provider: string, apiKey: string): Promise<number | null> {
  const s = encodeURIComponent(symbol)
  if (provider === "twelvedata") {
    const r = await fetch(`https://api.twelvedata.com/price?symbol=${s}&apikey=${encodeURIComponent(apiKey)}`, { next: { revalidate: 3600 } }).then((x) => x.json())
    return Number(r?.price) > 0 ? Number(r.price) : null
  }
  const r = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${s}&apikey=${encodeURIComponent(apiKey)}`, { next: { revalidate: 3600 } }).then((x) => x.json())
  const p = Number(r?.["Global Quote"]?.["05. price"])
  return p > 0 ? p : null
}

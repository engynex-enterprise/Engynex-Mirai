// Ciudades de Colombia y lectura de direcciones (i_geo.js de la v4, funciones puras).
import GEO_RAW from "@/lib/data/legacy-geo.json"
import GEO_TOP from "@/lib/data/legacy-geo_top.json"
import GEO_ALIAS from "@/lib/data/legacy-geo_alias.json"
import GEO_ZONAS_RAW from "@/lib/data/legacy-geo_zonas.json"

export type City = { c: string; d: string; v: string }
export const GEO = GEO_RAW as City[]
const ZONAS = Object.fromEntries(Object.entries(GEO_ZONAS_RAW as Record<string, string>).map(([k, v]) => [k, v.split("|")]))

/** Normaliza para comparar: sin tildes, minúsculas, sin puntuación. */
export const FN = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9#\- ]/g, " ").replace(/\s+/g, " ").trim()

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const word = (k: string) => new RegExp(`(^|[^a-z0-9])${esc(k)}(?=$|[^a-z0-9])`, "g")

/** Índice ciudad/alias → ciudad, por longitud descendente (prefiere "Santa Rosa de Cabal" a "Cabal"). */
const GEO_IDX: [string, City][] = [
  ...GEO.map((g) => [FN(g.c), g] as [string, City]),
  ...Object.entries(GEO_ALIAS as Record<string, string>).flatMap(([a, c]) => { const g = GEO.find((x) => x.c === c); return g ? [[FN(a), g] as [string, City]] : [] }),
].sort((a, b) => b[0].length - a[0].length)
const DEPTS = [...new Set(GEO.map((g) => g.d))]
const DEP_IDX = DEPTS.map((d) => [FN(d.replace(/ D\.C\./, "")), d] as [string, string]).sort((a, b) => b[0].length - a[0].length)

/** Opciones de ciudad: primero las principales, luego el resto. */
export function cityOptions() {
  const top = (GEO_TOP as string[]).map((c) => GEO.find((g) => g.c === c)).filter(Boolean) as City[]
  const rest = GEO.filter((g) => !top.includes(g))
  return [...top, ...rest].map((g) => ({ value: g.v, label: g.c, hint: g.d, icon: "map-pin" }))
}
export const geoOf = (v: string | null | undefined) => (v ? GEO.find((g) => g.v === v) ?? GEO.find((g) => g.c === v) : undefined)

const REPL: [RegExp, string][] = [
  [/\b(avenida carrera|av\.? cra|ak)\b\.?/gi, "Av. Cra"],
  [/\b(avenida calle|av\.? cl|ac)\b\.?/gi, "Av. Cl"],
  [/\b(carrera|carerra|cra|kra|kr|crr|cr)\b\.?/gi, "Cra"],
  [/\b(calle|clle|cll|cl)\b\.?/gi, "Cl"],
  [/\b(avenida|avda|av)\b(?!\.?\s*(Cra|Cl)\b)\.?/gi, "Av."],
  [/\b(transversal|trans|tv|tr)\b\.?/gi, "Tv"],
  [/\b(diagonal|diag|dg)\b\.?/gi, "Dg"],
  [/\b(circular|cir)\b\.?/gi, "Cir"],
  [/\b(apartamento|apto|apt|ap)\b\.?/gi, "Apto"],
  [/\b(interior|int)\b\.?/gi, "Int"],
  [/\b(torre|tor)\b\.?/gi, "Torre"],
  [/\b(oficina|of)\b\.?/gi, "Of."],
  [/\s*(\bn[uú]mero\b|\bnro\.?|\bno\.|n°|nº|#)\s*/gi, " # "],
  [/(\d)\s*-\s*(\d)/g, "$1-$2"],
  [/\s+,/g, ","], [/,{2,}/g, ","], [/\s{2,}/g, " "],
]

/** Quita un nombre del texto tolerando tildes y el sufijo "D.C.". */
function removeLoose(text: string, name: string) {
  const body = [...name].map((ch) => { const b = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, ""); return b === ch ? esc(ch) : `[${esc(ch)}${esc(b)}]` }).join("")
  return text.replace(new RegExp(`(^|[^\\p{L}])${body}(\\s*d\\.?\\s*c\\.?)?(?=$|[^\\p{L}])`, "giu"), "$1")
}

/** Dirección al formato colombiano: "calle 80 numero 15-20 apto 301" → "Cl 80 # 15-20 Apto 301". */
export function normAddr(s: string) {
  let r = ` ${s} `
  for (const [re, to] of REPL) r = r.replace(re, to)
  return r.replace(/^[\s,\-]+|[\s,\-]+$/g, "")
}

export type ParsedAddress = { ciudad: string | null; cityName: string | null; depto: string | null; barrio: string | null; dir: string }

/** parseAddr de la v4: separa dirección, barrio, ciudad y departamento. */
export function parseAddr(raw: string): ParsedAddress | null {
  if (!raw || raw.trim().length < 4) return null
  const t = FN(raw.replace(/,/g, " , "))
  const lastDigit = t.search(/\d(?!.*\d)/)
  // Departamento después del último número
  let depto: string | null = null
  let depPos = -1
  for (const [k, d] of DEP_IDX) {
    for (const m of t.matchAll(word(k))) { const pos = m.index! + m[1].length; if (pos > lastDigit) { depto = d; depPos = pos; break } }
    if (depto) break
  }
  // Ciudad con puntaje
  let best: { g: City; score: number; pos: number; k: string } | null = null
  for (const [k, g] of GEO_IDX) {
    for (const m of t.matchAll(word(k))) {
      const pos = m.index! + m[1].length
      const after = pos > lastDigit
      const nearComma = /,\s*$/.test(t.slice(0, pos)) || /^\s*,/.test(t.slice(pos + k.length))
      if (!after && !nearComma) continue
      if (depto && pos === depPos && FN(depto).startsWith(k)) continue
      const score = (after ? 2 : 0) + (nearComma ? 1 : 0) + (depto && g.d === depto ? 3 : 0) + k.length / 100
      if (!best || score > best.score) best = { g, score, pos, k }
    }
  }
  let city = best?.g ?? null
  if (city && depto && city.d !== depto) city = GEO.find((g) => FN(g.c) === FN(city!.c) && g.d === depto) ?? city
  if (!city && depto?.startsWith("Bogotá")) city = GEO.find((g) => g.c === "Bogotá") ?? null
  // Barrio explícito
  let barrio: string | null = null
  const bm = raw.match(/\b(barrio|br\.|b\/|urbanizaci[oó]n|urb\.|conjunto|sector)\s+([^,#\d][^,#]*)/i)
  let barrioFrag = ""
  if (bm) { barrioFrag = bm[0]; barrio = bm[2].split(/\b(apto|apartamento|torre|int|interior|casa|piso)\b/i)[0].trim() }
  // Zona conocida de la ciudad
  let zona: string | null = null
  if (!barrio && city && ZONAS[city.c]) zona = ZONAS[city.c].filter((z) => word(FN(z)).test(t)).sort((a, b) => b.length - a.length)[0] ?? null
  if (!city && !barrio && !zona) {
    for (const [c, zs] of Object.entries(ZONAS)) {
      const z = zs.filter((z) => z.length > 5 && word(FN(z)).test(t)).sort((a, b) => b.length - a.length)[0]
      if (z) { zona = z; city = GEO.find((g) => g.c === c) ?? null; break }
    }
  }
  // Dirección limpia
  let dir = raw
  if (barrioFrag) dir = dir.replace(barrioFrag, " ")
  const strip = (name: string) => { dir = dir.replace(new RegExp(`[,\\s]*\\b${esc(name)}\\b(\\s*d\\.?\\s*c\\.?)?`, "gi"), " ") }
  const stripLoose = (name: string) => { const re = new RegExp(`(^|[^\\p{L}])(${[...name].map((ch) => { const b = ch.normalize("NFD").replace(/[̀-ͯ]/g, ""); return b === ch ? esc(ch) : `[${esc(ch)}${esc(b)}]` }).join("")})(\\s*d\\.?\\s*c\\.?)?(?=$|[^\\p{L}])`, "giu"); dir = dir.replace(re, "$1") }
  if (city) { stripLoose(city.c); for (const [a, c] of Object.entries(GEO_ALIAS as Record<string, string>)) if (c === city.c && a.length > 3) strip(a) }
  if (depto) stripLoose(depto.replace(/ D\.C\./, ""))
  strip("Colombia")
  if (zona) stripLoose(zona)
  if (barrio) {
    // El barrio también se limpia de ciudad, departamento y "Colombia"
    for (const n of [city?.c, depto?.replace(/ D\.C\./, ""), "Colombia"]) if (n) barrio = removeLoose(barrio, n)
    barrio = barrio.replace(/[\s,\-]+$/, "").trim()
  }
  return { ciudad: city?.v ?? null, cityName: city?.c ?? null, depto: city?.d ?? depto, barrio: barrio || zona, dir: normAddr(dir) }
}

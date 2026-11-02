// Proveedores: a quién le pagas (Enel, la inmobiliaria, Claro, el colegio…). Normalización de nombres para no
// duplicarlos, tipo sugerido, categoría sugerida y cuánto se le paga al mes. Sin React ni Supabase.
import { fijoMensual } from "./fixed"
import { subMensual } from "./subscriptions"
import type { Trm } from "./types"

export const PROVIDER_TIPOS = {
  servicios: { label: "Servicios públicos", icon: "zap", cat: "Servicios públicos" },
  telecom: { label: "Internet y telefonía", icon: "wifi", cat: "Servicios públicos" },
  vivienda: { label: "Arriendo y administración", icon: "house", cat: "Vivienda" },
  salud: { label: "Salud", icon: "heart-pulse", cat: "Salud" },
  educacion: { label: "Educación", icon: "graduation-cap", cat: "Educación" },
  transporte: { label: "Transporte", icon: "bus", cat: "Transporte" },
  seguros: { label: "Seguros", icon: "shield-check", cat: null },
  suscripciones: { label: "Suscripciones", icon: "repeat", cat: "Suscripciones" },
  comercio: { label: "Comercio", icon: "shopping-bag", cat: "Mercado" },
  otro: { label: "Otro", icon: "store", cat: null },
} as const satisfies Record<string, { label: string; icon: string; cat: string | null }>
export type ProviderTipo = keyof typeof PROVIDER_TIPOS
export const isProviderTipo = (t: unknown): t is ProviderTipo => typeof t === "string" && t in PROVIDER_TIPOS
export const tipoLabel = (t: string | null | undefined) => (isProviderTipo(t) ? PROVIDER_TIPOS[t].label : PROVIDER_TIPOS.otro.label)
export const tipoIcon = (t: string | null | undefined) => (isProviderTipo(t) ? PROVIDER_TIPOS[t].icon : PROVIDER_TIPOS.otro.icon)

// Igual a public.provider_norm() en la migración 20261103000700_proveedores.sql (la ñ se conserva).
const ACENTOS: Record<string, string> = { á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", à: "a", è: "e", ì: "i", ò: "o", ù: "u", Á: "A", É: "E", Í: "I", Ó: "O", Ú: "U", Ü: "U", À: "A", È: "E", Ì: "I", Ò: "O", Ù: "U" }

/** Clave para comparar nombres: sin tildes, minúsculas, sin puntos ni comas y con un solo espacio. */
export function normProv(s: string | null | undefined): string {
  return (s ?? "").replace(/[áéíóúüàèìòùÁÉÍÓÚÜÀÈÌÒÙ]/g, (c) => ACENTOS[c] ?? c).toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim()
}

/** Nombre para guardar: el que escribió la persona, con los espacios limpios. */
export const cleanProvName = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 120)

/** Busca un proveedor por nombre (ignorando mayúsculas, tildes, puntos y espacios). */
export function findProvider<T extends { nombre: string }>(list: T[], nombre: string): T | undefined {
  const k = normProv(nombre)
  return k ? list.find((p) => normProv(p.nombre) === k) : undefined
}

/** Nombres únicos (la primera forma escrita gana) a partir de textos libres. Para migrar e importar. */
export function dedupeNames(names: (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>()
  for (const n of names) {
    const k = normProv(n)
    if (k && !seen.has(k)) seen.set(k, cleanProvName(n ?? ""))
  }
  return [...seen.values()]
}

// Igual a public.provider_tipo(): el primer grupo que coincide gana.
const TIPO_RULES: [ProviderTipo, RegExp][] = [
  ["servicios", /(acueducto|alcantarillado|energia|\benel\b|\bepm\b|\bvanti\b|\bgas\b|aseo|codensa|electrific|empresas publicas|servicios publicos|\baaa\b|emcali|air-e|afinia|\bessa\b|celsia)/],
  ["telecom", /(internet|claro|movistar|\btigo\b|\betb\b|\bwom\b|\bune\b|directv|operador|celular|telefon|fibra)/],
  ["vivienda", /(inmobiliaria|arriendo|arrendador|conjunto|administracion|propiedad horizontal|edificio|\bph\b)/],
  ["salud", /(\beps\b|salud|sanitas|\bsura\b|compensar|colsanitas|medic|clinica|hospital|odontolog|prepagada|nueva eps|famisanar|salud total)/],
  ["educacion", /(colegio|universidad|jardin|escuela|instituto|academia|icetex|liceo|gimnasio moderno)/],
  ["transporte", /(transporte|transmilenio|\bmetro\b|peaje|parqueadero|gasolina|terpel|primax|\btaxi\b|ruta escolar)/],
  ["seguros", /(seguro|asegurador|aseguradora|allianz|mapfre|axa colpatria|liberty|soat|previsora)/],
  ["suscripciones", /(netflix|spotify|disney|youtube|prime video|\bhbo\b|\bmax\b|apple|icloud|google one|microsoft|suscrip)/],
  ["comercio", /(exito|carulla|jumbo|olimpica|\bd1\b|\bara\b|alkosto|falabella|homecenter|tienda|supermercado|drogueria|colsubsidio|cafam)/],
]

/** Tipo de proveedor que sugiere el nombre ("Acueducto" → servicios públicos). */
export function tipoSugerido(nombre: string): ProviderTipo {
  const n = normProv(nombre)
  return TIPO_RULES.find(([, re]) => re.test(n))?.[0] ?? "otro"
}

/**
 * Categoría de gasto que conviene al elegir un proveedor: la suya por defecto (si sigue existiendo); si no tiene,
 * la que corresponde a su tipo con las categorías del libro (Servicios públicos, Vivienda, Salud…). null si nada aplica.
 */
export function categoriaSugerida(
  p: { category_id?: string | null; tipo?: string | null } | null | undefined,
  categories: { id: string; nombre: string }[],
): string | null {
  if (!p) return null
  if (p.category_id && categories.some((c) => c.id === p.category_id)) return p.category_id
  const nombre = isProviderTipo(p.tipo) ? PROVIDER_TIPOS[p.tipo].cat : null
  if (!nombre) return null
  return categories.find((c) => normProv(c.nombre) === normProv(nombre))?.id ?? null
}

/**
 * Proveedores comunes en Colombia: solo sugerencias en el selector (no se crean en el libro hasta que la persona
 * los elige). `brand` es la clave de lib/brands.ts cuando hay logo libre o monograma para identificarlo.
 */
export const PROVEEDORES_CO: { nombre: string; tipo: ProviderTipo; brand?: string }[] = [
  { nombre: "EPM", tipo: "servicios" }, { nombre: "Enel", tipo: "servicios" }, { nombre: "Vanti", tipo: "servicios" },
  { nombre: "Acueducto de Bogotá", tipo: "servicios" }, { nombre: "Air-e", tipo: "servicios" }, { nombre: "Afinia", tipo: "servicios" },
  { nombre: "Celsia", tipo: "servicios" }, { nombre: "Emcali", tipo: "servicios" }, { nombre: "ESSA", tipo: "servicios" },
  { nombre: "Gases de Occidente", tipo: "servicios" }, { nombre: "Triple A", tipo: "servicios" },
  { nombre: "Claro", tipo: "telecom", brand: "claro" }, { nombre: "Movistar", tipo: "telecom", brand: "movistar" },
  { nombre: "Tigo", tipo: "telecom", brand: "tigo" }, { nombre: "ETB", tipo: "telecom", brand: "etb" }, { nombre: "WOM", tipo: "telecom", brand: "wom" },
  { nombre: "Une", tipo: "telecom", brand: "tigo" }, { nombre: "DirecTV", tipo: "telecom", brand: "directv" },
  { nombre: "Sura", tipo: "salud" }, { nombre: "Sanitas", tipo: "salud" }, { nombre: "Compensar", tipo: "salud" },
  { nombre: "Nueva EPS", tipo: "salud" }, { nombre: "Colsanitas", tipo: "salud" },
  { nombre: "Colsubsidio", tipo: "comercio" }, { nombre: "Cafam", tipo: "comercio" }, { nombre: "Éxito", tipo: "comercio" },
  { nombre: "Seguros Bolívar", tipo: "seguros" }, { nombre: "Allianz", tipo: "seguros" }, { nombre: "Mapfre", tipo: "seguros" },
  { nombre: "Terpel", tipo: "transporte" }, { nombre: "Icetex", tipo: "educacion" },
]

/** Sugerencias que aún no están en el libro. */
export const sugerenciasPendientes = (list: { nombre: string }[]) => {
  const ya = new Set(list.map((p) => normProv(p.nombre)))
  return PROVEEDORES_CO.filter((s) => !ya.has(normProv(s.nombre)))
}

export interface ProviderUsage {
  fijos: number
  suscripciones: number
  gastos: number
  /** Lo que se le paga al mes: gastos fijos (equivalente mensual) + suscripciones activas (tu parte). */
  mensual: number
  /** Lo que ya le pagaste este mes (gastos registrados con este proveedor). */
  pagadoMes: number
}

/** Uso de cada proveedor en el libro (cuántos registros lo usan y cuánto se le paga al mes). */
export function providerUsage(
  b: {
    fixed: { provider_id?: string | null; frec: string; valor: number | string }[]
    subs: { provider_id?: string | null; valor: number | string; currency?: string | null; ciclo: string; comparte?: number | null; activa?: boolean | null }[]
    expenses: { provider_id?: string | null; valor: number | string; fecha: string }[]
  },
  trm: Trm,
  mes: string,
): Map<string, ProviderUsage> {
  const out = new Map<string, ProviderUsage>()
  const at = (id: string) => {
    let u = out.get(id)
    if (!u) out.set(id, (u = { fijos: 0, suscripciones: 0, gastos: 0, mensual: 0, pagadoMes: 0 }))
    return u
  }
  for (const f of b.fixed) {
    if (!f.provider_id) continue
    const u = at(f.provider_id)
    u.fijos++
    u.mensual += fijoMensual({ frec: f.frec, valor: Number(f.valor) })
  }
  for (const s of b.subs) {
    if (!s.provider_id) continue
    const u = at(s.provider_id)
    u.suscripciones++
    if (s.activa !== false) u.mensual += subMensual({ valor: Number(s.valor), currency: s.currency ?? "COP", ciclo: s.ciclo, comparte: s.comparte ?? 1 }, trm)
  }
  for (const g of b.expenses) {
    if (!g.provider_id) continue
    const u = at(g.provider_id)
    u.gastos++
    if (g.fecha.startsWith(mes)) u.pagadoMes += Number(g.valor)
  }
  for (const u of out.values()) { u.mensual = Math.round(u.mensual); u.pagadoMes = Math.round(u.pagadoMes) }
  return out
}

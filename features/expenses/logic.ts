import type { Row } from "@/lib/supabase/tables"

/** Normaliza texto para comparar (sin tildes, minúsculas). */
export const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")

/** Palabras hormiga (HKW de la v4). */
const HKW = /tinto|cafe|gaseosa|snack|paquete|dulce|chicle|helado|galleta|mecato|empanada|pandebono|bunuelo|domicilio|rappi|propina|cigarr|chocolatina|golosina|loteria|chance|antojo|cerveza|jugo|agua botella|retiro|cuota de manejo|recarga|uber|taxi/
const NO_HORMIGA_CATS = new Set(["vivienda", "servicios publicos", "educacion", "salud"])

/** localHormiga(g) de la v4, literal. */
export function localHormiga(
  g: { descripcion: string; valor: number; fixed_expense_id?: string | null; category_id?: string | null },
  cats: Pick<Row<"categories">, "id" | "nombre" | "grupo">[],
  umbral: number,
) {
  if (g.fixed_expense_id) return false
  if (g.valor > 2 * umbral) return false
  const cat = cats.find((c) => c.id === g.category_id)
  if (cat && (cat.grupo === "a" || NO_HORMIGA_CATS.has(norm(cat.nombre)))) return false
  if (HKW.test(norm(g.descripcion))) return true
  if (g.valor <= umbral && cat?.grupo === "g") return true
  return g.valor <= umbral && !cat
}

/** isHormiga(g): manual o IA mandan; si no, la regla local. */
export function isHormiga(
  g: Pick<Row<"expenses">, "descripcion" | "valor" | "fixed_expense_id" | "category_id" | "hormiga" | "hormiga_src">,
  cats: Pick<Row<"categories">, "id" | "nombre" | "grupo">[],
  umbral: number,
) {
  if (g.fixed_expense_id) return false
  if (g.hormiga_src === "manual" || g.hormiga_src === "ia") return g.hormiga
  return localHormiga(g, cats, umbral)
}

/** Categoría por reglas del usuario (palabra → categoría). La IA y el diccionario KW se suman en la fase 4. */
export function ruleCategory(desc: string, rules: Pick<Row<"keyword_rules">, "keyword" | "category_id">[]) {
  const d = norm(desc)
  return rules.find((r) => r.keyword && d.includes(norm(r.keyword)))?.category_id ?? null
}

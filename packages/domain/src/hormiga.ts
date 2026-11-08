// Categorización automática local y detección de gastos hormiga (equivalente a e_ai.js de la v4).
// La IA puede confirmar después; aquí solo están las reglas locales (sin red).
import { addDays, iso, toDay } from "./dates"
import type { CategoryIn, DateInput, ExpenseIn, KeywordRuleIn } from "./types"

/** Minúsculas, sin tildes, espacios colapsados. */
export const norm = (s: unknown): string =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim()

/** Palabras clave por categoría (el orden importa: gana la primera coincidencia). */
export const KW: Record<string, string> = {
  Imprevistos: "imprevist|emergencia|urgencia|daño|dano|reparacion|arreglo|varado|grua|cerrajer|plomer|fuga|multa|comparendo|accidente|se rompio|se dano",
  Vivienda: "arriendo|arrendamiento|administracion|hipoteca|inmobiliaria|predial|canon",
  "Servicios públicos": "energia|luz|enel|codensa|epm|agua|acueducto|alcantarillado|gas natural|vanti|internet|claro|movistar|tigo|etb|wom|plan celular|recarga|aseo",
  Mercado: "mercado|exito|carulla|jumbo|\\bd1\\b|\\bara\\b|olimpica|makro|surtimax|alkosto|tienda|fruver|verdura|carniceria|supermercado|plaza",
  Transporte: "gasolina|tanqueo|terpel|primax|biomax|uber|didi|cabify|indriver|taxi|transmilenio|sitp|\\bbus\\b|metro|peaje|parqueadero|lavado del carro|taller|llanta|aceite",
  Educación: "colegio|pension|matricula|universidad|curso|libro|utiles|uniforme|icetex",
  Salud: "farmacia|drogueria|\\beps\\b|medic|cita|odontolog|optica|laboratorio|cruz verde|farmatodo|examen|terapia",
  "Comisiones bancarias": "cuota de manejo|comision|retiro|4x1000|gmf|cajero",
  Mascotas: "veterinari|concentrado|mascota|perro|gato|purina|peluqueria canina",
  Restaurantes: "restaurante|almuerzo|cena|corrientazo|hamburguesa|pizza|crepes|frisby|kfc|mcdonald|corral|sushi|asadero|comida rapida",
  Café: "tinto|cafe|juan valdez|tostao|\\boma\\b|starbucks|pandebono|empanada|bunuelo|arepa",
  Domicilios: "rappi|domicilio|ifood|didi food|propina domicili",
  Snacks: "snack|paquete|gaseosa|dulce|chicle|helado|galleta|papas|chocolatina|mecato|golosina|jugo|agua botella|antojo",
  Entretenimiento: "cine|cinecolombia|procinal|cinemark|concierto|teatro|\\bbar\\b|cerveza|rumba|discoteca|juego|steam|playstation|xbox|boleta",
  Suscripciones: "netflix|spotify|disney|prime video|amazon prime|\\bhbo\\b|\\bmax\\b|youtube|apple|icloud|google one|gimnasio|smart ?fit|bodytech|chatgpt|suscripcion|membresia",
  Ropa: "ropa|zapato|tenis|camisa|pantalon|zara|falabella|arturo calle|koaj|studio f|vestido|chaqueta",
  Regalos: "regalo|cumpleanos|detalle|flores",
  Viajes: "hotel|vuelo|avianca|latam|airbnb|viaje|tiquete|wingo|hostal",
  Ahorro: "ahorro|bolsillo",
  Inversión: "\\bcdt\\b|inversion|fiducia|acciones",
}

/**
 * Palabras típicas de gasto hormiga, como palabra completa ("tintorería" no es un tinto). "retiro" y "cuota de manejo"
 * son las comisiones del banco (pequeñas y evitables); sacar efectivo no es un gasto y no se registra como tal.
 */
export const HKW = /\b(tintos?|cafes?|gaseosas?|snacks?|paquetes?|dulces?|chicles?|helados?|galletas?|mecato|empanadas?|pandebonos?|bunuelos?|domicilios?|rappi|propinas?|cigarr\w*|chocolatinas?|golosinas?|loteria|chance|antojos?|cervezas?|jugos?|agua botella|retiros?|cuota de manejo|recargas?|uber|taxi)\b/

/** Categorías que nunca son hormiga (necesidades básicas y suscripciones, que son un cobro fijo). */
const NO_HORMIGA = ["Vivienda", "Servicios públicos", "Educación", "Salud", "Suscripciones"]

const catByName = (cats: CategoryIn[], n: string) => cats.find((c) => c.nombre.toLowerCase() === String(n || "").toLowerCase())

/**
 * Regla del usuario que aplica a una descripción: la palabra más larga (la más específica) que esté contenida, sin
 * importar mayúsculas ni tildes ("uber eats" gana sobre "uber"); si empatan, la primera de la lista.
 */
export function matchRule<R extends Pick<KeywordRuleIn, "keyword">>(desc: string, rules: readonly R[]): R | undefined {
  const d = norm(desc)
  let best: R | undefined
  let len = 0
  for (const r of rules) {
    const k = norm(r.keyword)
    if (k && k.length > len && d.includes(k)) { best = r; len = k.length }
  }
  return best
}

export type LocalCatSource = "regla" | "historial" | "palabras"

export interface LocalCatContext {
  rules: KeywordRuleIn[]
  /** Gastos anteriores en orden de creación (el más reciente al final). */
  expenses: Pick<ExpenseIn, "descripcion" | "category_id">[]
  categories: CategoryIn[]
}

/**
 * Sugiere la categoría de una descripción. Prioridad: regla del usuario → historial →
 * palabras clave → nombre de una categoría contenido en la descripción.
 */
export function localCat(desc: string, ctx: LocalCatContext): { category_id: string; src: LocalCatSource } | null {
  const d = norm(desc)
  if (d.length < 2) return null
  const byId = (id: string | null | undefined) => (id ? ctx.categories.find((c) => c.id === id) : undefined)
  const r = matchRule(d, ctx.rules.filter((x) => byId(x.category_id)))
  const rc = r && byId(r.category_id)
  if (rc) return { category_id: rc.id, src: "regla" }
  const hist = [...ctx.expenses].reverse().find((g) => {
    const n = norm(g.descripcion)
    return n === d || (d.length >= 4 && (n.startsWith(d) || d.startsWith(n)))
  })
  const hc = hist && byId(hist.category_id)
  if (hc) return { category_id: hc.id, src: "historial" }
  for (const [c, re] of Object.entries(KW)) {
    const cat = catByName(ctx.categories, c)
    if (cat && new RegExp(re).test(d)) return { category_id: cat.id, src: "palabras" }
  }
  for (const c of ctx.categories) if (norm(c.nombre).length > 3 && d.includes(norm(c.nombre))) return { category_id: c.id, src: "palabras" }
  return null
}

type HormigaExpense = Pick<ExpenseIn, "descripcion" | "valor" | "category_id" | "fixed_expense_id">

/**
 * Regla local de gasto hormiga (`umbral` = valor máximo de un gasto hormiga):
 * fijo → no · valor > 2×umbral → no · ahorro o necesidad básica → no · palabra hormiga → sí ·
 * valor ≤ umbral en categoría de gusto → sí · valor ≤ umbral sin categoría → sí.
 */
export function localHormiga(g: HormigaExpense, categories: CategoryIn[], umbral: number): boolean {
  if (g.fixed_expense_id) return false
  const v = +g.valor || 0
  const c = g.category_id ? categories.find((x) => x.id === g.category_id) : undefined
  const d = norm(g.descripcion)
  if (v > umbral * 2) return false
  if (c && (c.grupo === "a" || NO_HORMIGA.includes(c.nombre))) return false
  if (HKW.test(d)) return true
  if (v <= umbral && c && c.grupo === "g") return true
  return v <= umbral && !c
}

/**
 * ¿Es gasto hormiga? Un fijo nunca. Si ya hay una decisión guardada (`hormiga_src` manual, ia o regla)
 * manda `hormiga`; si no, la regla local.
 */
export function isHormiga(g: HormigaExpense & Pick<ExpenseIn, "hormiga" | "hormiga_src">, categories: CategoryIn[], umbral: number): boolean {
  if (!g || g.fixed_expense_id) return false
  if (g.hormiga_src && typeof g.hormiga === "boolean") return g.hormiga
  return localHormiga(g, categories, umbral)
}

/** Cuántas veces aparece la misma descripción en los últimos 30 días. */
export function vecesMes(desc: string, expenses: Pick<ExpenseIn, "fecha" | "descripcion">[], today: DateInput): number {
  const d = norm(desc)
  const lim = iso(addDays(toDay(today), -30))
  return expenses.filter((g) => g.fecha >= lim && norm(g.descripcion) === d).length
}

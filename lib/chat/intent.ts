// Intención del mensaje del chat, con reglas (sin IA). Puro, con pruebas en intent.test.ts.
// - Decisión: "¿me conviene comprar una moto de 8 millones a 24 cuotas?" → el consejero la analiza con los cálculos de
//   lib/domain y la muestra como tarjeta dentro del chat (antes era un formulario).
// - Registrar: "registra un gasto de 15 mil en almuerzo" → tarjeta para confirmar antes de guardar.
import { dudasLocales, interpConfiable } from "@/lib/ai/router"
import { CONS_RE, completeInterp, localInterp, moneyIn, norm, type AdvisorInput } from "@/lib/domain"

const clean = (t: string) => norm(t).replace(/[¿?¡!"“”]/g, " ").replace(/\s+/g, " ").trim()

/** Verbos de decisión más amplios que CONS_RE ("¿saco…?", "¿compro…?", "¿le presto…?"). */
const DEC_RE = /(me conviene|vale la pena|es buena idea|deberia|me alcanza|puedo|quiero|voy a|pienso|estoy pensando)\b.{0,60}\b(compr|sac[oa]r?\b|pedir|prest|financ|endeud|tarjeta|credito|prestamo|arriend|invert|cdt|empen|abon|cuotas|moto|carro|celular|nevera|viaje)|^(compro|saco|pido|presto|le presto|invierto|abono|empeno)\b/
/** Preguntas de concepto o comparación de opciones: mejor la IA (o la explicación) que el análisis de una sola decisión. */
const NO_DEC_RE = /^(que es|que son|como funciona|explicame|cual es la diferencia|diferencia entre)\b|\bo (pago|abono|invierto|ahorro|saco|compro|mejor)\b|\bque es mejor\b/

const INTENCION_RE = /^(quiero|quisiera|voy a|pienso|estoy pensando|me conviene|me alcanza|deberia|puedo|sera que|vale la pena|es buena idea)\b|\b(me conviene|me alcanza|vale la pena)\b/
const PREGUNTA_RE = /^(cuanto|cuanta|cuantos|como|que|cual|cuales|cuando|donde|por que|explicame|dame|ayudame|registra|anota)\b/
const VERBO_RE = /\b(compr\w*|sac(?:o|ar|arme|aria)|pido|pedir|pediria|prest\w*|presto|financ\w*|endeud\w*|invert\w*|invierto|cdt|abon\w*|empen\w*|arrend\w*|arriendo|meter|meteria)\b/

export type Decision = { input: AdvisorInput; faltan: string[]; confiable: boolean }

/** ¿El mensaje describe una decisión concreta para analizar? Devuelve la interpretación con reglas o null. */
export function detectDecision(text: string): Decision | null {
  const n = clean(text)
  if (n.length < 8 || n.length > 400 || NO_DEC_RE.test(n)) return null
  // "Quiero darle a mi mujer 100 mil al mes", "¿me conviene pagar 80 mil mensuales de gimnasio?": un gasto mensual nuevo.
  const mensual = INTENCION_RE.test(n) && /\b(al mes|mensual(es)?|cada mes|por mes)\b/.test(n) && moneyIn(text).length > 0
  if (!CONS_RE.test(n) && !DEC_RE.test(n) && !mensual) return null
  // "¿Cuánto debo en mis tarjetas?", "¿Cómo puedo pagar la tarjeta?": son preguntas, no decisiones.
  if (PREGUNTA_RE.test(n) && !/me conviene|me alcanza|vale la pena|es buena idea/.test(n)) return null
  if (!VERBO_RE.test(n) && !moneyIn(text).length) return null
  const sure = interpConfiable(text)
  const input = completeInterp(sure ?? localInterp(text), text)
  const faltan = [...(+(input.valor ?? 0) ? [] : [preguntaValor(input)]), ...(sure?.dudas ?? dudasLocales(input))].slice(0, 3)
  return { input, faltan, confiable: !!sure }
}

/** Pregunta por el monto según el tipo de decisión. */
export function preguntaValor(d: Pick<AdvisorInput, "tipo">): string {
  switch (d.tipo) {
    case "tarjeta": return "¿De cuánto es el cupo que te aprueban?"
    case "credito": case "empeno": return "¿Cuánto te prestarían?"
    case "prestar": return "¿Cuánto vas a prestar?"
    case "fijo": return "¿Cuánto pagarías al mes?"
    case "invertir": return "¿Cuánto quieres invertir?"
    case "abonar": return "¿Cuánto abonarías?"
    default: return "¿Cuánto cuesta en total?"
  }
}

/**
 * Respuesta a una decisión a la que le faltaban datos: si el mensaje nuevo trae un monto, cuotas, tasa o es corto, se
 * suma al texto anterior para volver a interpretarlo. Devuelve el texto combinado o null si parece otro tema.
 */
export function continueDecision(prev: string, reply: string): string | null {
  const n = clean(reply)
  if (!n || NO_DEC_RE.test(n)) return null
  const hasData = moneyIn(reply).length > 0 || /\d+\s*(cuotas|meses|dias|%)/.test(n) || /^\d[\d.,]*\s*(mil|millones?|k|lucas|palos?)?$/.test(n)
  if (!hasData && n.length > 40) return null
  // "3 millones" a secas o "a 12 cuotas": se agrega al final como un dato más.
  const extra = /^\d[\d.,]*$/.test(n.replace(/\s/g, "")) && +n.replace(/\D/g, "") < 1000 ? `${reply.trim()} cuotas` : reply.trim()
  return `${prev.trim().replace(/[?.!]+$/, "")}, ${extra}`
}

export type QuickAction = { tipo: "gasto" | "ingreso"; valor: number; descripcion: string; cuando: "hoy" | "ayer" }

const VERBO = "(?:registra(?:me)?|anota(?:me)?|agrega(?:me)?|apunta(?:me)?|guarda(?:me)?|pon(?:me)?|mete(?:me)?)"
const MONTO = "(\\$?\\s?\\d[\\d.,]*\\s*(?:mil|millones?|millon|k|lucas|palos?)?)"

/** "Registra un gasto de 15 mil en almuerzo", "gasté 20 mil en taxi", "anota un ingreso de 300 mil por un trabajo". */
export function detectQuickAction(text: string): QuickAction | null {
  const n = clean(text).replace(/\s+(por favor|porfa)$/, "")
  if (n.length > 140 || /^cuanto\b/.test(n)) return null
  const cuando: QuickAction["cuando"] = /\bayer\b/.test(n) ? "ayer" : "hoy"
  const s = n.replace(/\b(hoy|ayer)\b/g, " ").replace(/\s+/g, " ").trim()
  const pats: [RegExp, "gasto" | "ingreso"][] = [
    [new RegExp(`^${VERBO} (?:un |una |el |la )?(?:gasto|compra|pago) (?:de |por )?${MONTO} (?:en|de|por|para) (.+)$`), "gasto"],
    [new RegExp(`^${VERBO} ${MONTO} (?:en|de|por|para) (.+)$`), "gasto"],
    [new RegExp(`^(?:gaste|pague|compre) ${MONTO} (?:en|de|por|para) (.+)$`), "gasto"],
    [new RegExp(`^${VERBO} (?:un |una |el )?ingreso (?:de |por )?${MONTO} (?:en|de|por|para) (.+)$`), "ingreso"],
    [new RegExp(`^(?:me pagaron|recibi|me entraron|me consignaron|gane) ${MONTO} (?:en|de|por|para) (.+)$`), "ingreso"],
  ]
  for (const [re, tipo] of pats) {
    const m = s.match(re)
    if (!m) continue
    const valor = moneyIn(m[1])[0]?.v ?? 0
    const descripcion = m[2].replace(/^(un|una|el|la|los|las|mi|mis) /, "").trim()
    if (valor < 100 || !descripcion || descripcion.length > 80) return null
    return { tipo, valor: Math.round(valor), descripcion: descripcion.charAt(0).toUpperCase() + descripcion.slice(1), cuando }
  }
  return null
}

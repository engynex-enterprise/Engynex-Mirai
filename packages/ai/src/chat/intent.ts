// Intención del mensaje del chat, con reglas (sin IA). Puro, con pruebas en intent.test.ts.
// - Decisión: "¿me conviene comprar una moto de 8 millones a 24 cuotas?" → el consejero la analiza con los cálculos de
//   lib/domain y la muestra como tarjeta dentro del chat (antes era un formulario).
// - Registrar: "registra un gasto de 15 mil en almuerzo" → tarjeta para confirmar antes de guardar.
import { dudasLocales, interpConfiable } from "../router"
import { CONS_RE, completeInterp, localInterp, moneyIn, norm, type AdvisorInput } from "@mirai/domain"

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

// ── Registrar en todos los módulos (sin IA) ──────────────────────────────────────────────────────────────────────
// Frases en pasado o con "registra/anota": "le presté 200 mil a Juan a 3 meses", "pagué la cuota del carro",
// "ya se cobró Netflix", "compré un celular de 2 millones con la Visa a 12 cuotas", "abona 100 mil a la meta del viaje".
// Devuelve las interpretaciones posibles en orden de prioridad; app/api/chat las cruza con el libro (lib/chat/acciones.ts)
// y usa la primera que encuentre el registro. Las preguntas y las decisiones ("¿le presto…?") no entran aquí.

type Cuando = "hoy" | "ayer"
export type Accion =
  | ({ tipo: "gasto" | "ingreso" } & Omit<QuickAction, "tipo">)
  | { tipo: "prestamo"; kind: "pagar" | "cobrar"; valor: number; persona: string; plazo?: number; frec?: string; tasa?: number; cuando: Cuando }
  | { tipo: "pago_cuota"; kind: "pagar" | "cobrar"; ref: string; cuotas?: number; valor?: number; cuando: Cuando; estricto: boolean }
  | { tipo: "pago_fijo"; ref: string; valor?: number; cuando: Cuando }
  | { tipo: "cobro_suscripcion"; ref: string; cuando: Cuando }
  | { tipo: "compra_tarjeta"; ref: string; valor: number; descripcion: string; cuotas?: number; cuando: Cuando }
  | { tipo: "pago_tarjeta"; ref: string; valor?: number; total: boolean; cuando: Cuando }
  | { tipo: "abono_meta"; ref: string; valor: number; cuando: Cuando; explicito: boolean }

const ART = /^(?:el|la|los|las|un|una|mi|mis|su|sus|de|del|al|a)\s+/
const sinArt = (s: string) => { let x = s.trim(); while (ART.test(x)) x = x.replace(ART, ""); return x.trim() }
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)
const MONTO_RE = /\$?\s?\d[\d.,]*\s*(?:millones|millon|mil|k\b|lucas|palos?)?/
/** Un monto que no se confunde con "2 cuotas": con unidad (mil, millones…) o de 4 cifras o más. */
const MONTO_FUERTE = /\$?\s?(?:\d[\d.,]*\s*(?:millones|millon|mil|k\b|lucas|palos?)|\d[\d.,]{3,})/
const NUM: Record<string, number> = { una: 1, un: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, doce: 12 }
const numOf = (s: string | undefined) => (s ? NUM[s] ?? (+s || undefined) : undefined)

/** "a 3 meses", "en 12 cuotas", "a 6 quincenas", "al 2 %": plazo, frecuencia y tasa mensual. */
export function plazoDe(n: string): { plazo?: number; frec?: string; tasa?: number } {
  const m = n.match(/\b(?:a|en|por)\s+(\d{1,3}|una|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|doce)\s+(meses|mes|cuotas?|quincenas?|semanas?|dias?)\b(\s+quincenales|\s+semanales|\s+mensuales)?/)
  const t = n.match(/\bal\s+(\d+(?:[.,]\d+)?)\s*(?:%|por ciento)/)
  const out: { plazo?: number; frec?: string; tasa?: number } = {}
  if (m) {
    out.plazo = numOf(m[1])
    const u = m[2] + (m[3] ?? "")
    out.frec = /quincena/.test(u) ? "quincenal" : /semana/.test(u) ? "semanal" : /dia/.test(u) ? "diario" : "mensual"
  }
  if (t) out.tasa = +t[1].replace(",", ".")
  return out
}

const VAR: Record<string, string> = { a: "[aáàä]", e: "[eéèë]", i: "[iíìï]", o: "[oóòö]", u: "[uúùü]", n: "[nñ]" }
/** El mismo fragmento como lo escribió la persona (con tildes y mayúsculas): "andres" → "Andrés". */
export function original(text: string, frag: string): string {
  if (!frag) return frag
  const re = new RegExp(frag.split("").map((c) => (c === " " ? "\\s+" : VAR[c] ?? c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join(""), "i")
  const m = text.match(re)
  return m ? m[0].replace(/\s+/g, " ") : frag
}

/** Nombre de la persona después de "a" / "de" / "con": "a Juan a 3 meses" → "Juan". */
function personaDe(s: string, prep: string): string {
  const m = s.match(new RegExp(`\\b(?:${prep})\\s+(?!\\d)([a-zñ][a-zñ ]{1,40}?)(?=\\s+(?:a|al|por|en|para|con|que|hace|desde|el|la|y|de)\\s+\\d|\\s+(?:a|en)\\s+(?:\\d|una|un|dos|tres|cuatro|cinco|seis|doce)\\b|\\s+(?:para|por|que|hace|desde)\\b|\\s*$|\\s+\\$?\\d)`))
  return m ? m[1].trim().replace(/^(?:el|la)\s+/, "").replace(/\s+(hoy|ayer)$/, "") : ""
}

export function detectActions(text: string): Accion[] {
  const n0 = clean(text).replace(/\s+(por favor|porfa)$/, "").replace(/[.,;:]+$/, "")
  if (!n0 || n0.length > 200 || /^(cuanto|cuanta|como|que|cual|cuales|cuando|donde|por que|deberia|me conviene)\b/.test(n0)) return []
  const cuando: Cuando = /\bayer\b/.test(n0) ? "ayer" : "hoy"
  const n = n0.replace(/\b(hoy|ayer)\b/g, " ").replace(/^(ya|oye|mira|hola|mirai)\s+/, "").replace(/\s+/g, " ").trim()
  const montos = moneyIn(n)
  const valor = Math.round(montos[0]?.v ?? 0)
  const out: Accion[] = []
  const reg = "(?:registra(?:me)?|anota(?:me)?|agrega(?:me)?|apunta(?:me)?)\\s+"

  // 1. Compra con tarjeta de crédito.
  const tj = n.match(/\bcon (?:la |mi |una )?(?:tarjeta(?: de credito)?\s*)?(visa|master(?:card)?|amex|american express|diners|[a-zñ]+)?(?=\s|$)/)
  if (tj && /\btarjeta\b|\bcon (?:la |mi )(?:visa|master|amex|diners)/.test(n) && valor && new RegExp(`^(?:${reg})?(?:una )?(?:compra|compre|pague|gaste|meti)\\b`).test(n)) {
    const cuotas = numOf(n.match(/\ba (\d{1,2}|una|un|dos|tres|seis|doce) cuotas?\b/)?.[1])
    const ref = sinArt((n.match(/\bcon (?:la |mi |una )?tarjeta(?: de credito)?\s+([a-zñ ]+?)(?=\s+a \d|\s+a una|\s*$)/)?.[1] ?? tj[1] ?? "").replace(/^(de credito|tarjeta)$/, ""))
    let d = n.replace(new RegExp(`^(?:${reg})?(?:una )?(?:compra(?: de)?|compre|pague|gaste|meti)\\s+`), "")
    d = d.split(/\s+con (?:la |mi |una )?(?:tarjeta|visa|master|amex|diners)\b/)[0]
    d = d.replace(new RegExp(`\\s*(?:de|por|en)?\\s*${MONTO_RE.source}\\s*`), " ").replace(/^\s*(?:en|de|por)\s+/, "").replace(/\s+a \d+ cuotas?$/, "")
    out.push({ tipo: "compra_tarjeta", ref: ref === "tarjeta" ? "" : ref, valor, descripcion: cap(original(text, sinArt(d.trim()))) || "Compra", cuotas, cuando })
  }

  // 1b. Pago de la tarjeta: "pagué la tarjeta", "pagué el total de la Visa", "abone 300 mil a la tarjeta Visa".
  const pt = n.match(new RegExp(`^(?:${reg}(?:el )?pago (?:de|a) |pague |abone |cancele |le abone )(?:${MONTO_FUERTE.source}\\s+(?:a|de|en)\\s+)?(el total de |todo lo de )?(?:la |mi )?tarjeta(?: de credito)?\\s*(.*)$`))
  if (pt && !out.length) out.push({ tipo: "pago_tarjeta", ref: sinArt(pt[2] ?? ""), valor: valor || undefined, total: !!pt[1], cuando })

  // 2. Préstamos: "le presté…" (Me deben) y "me prestaron…", "saqué un crédito…", "le debo… a…" (Le debo).
  const pz = plazoDe(n)
  const cobrar = n.match(new RegExp(`^(?:${reg}(?:un |el )?prestamo (?:que le hice )?(?:a |de )?|(?:le |les )?preste\\s+)(.*)$`))
  if (cobrar && valor) out.push({ tipo: "prestamo", kind: "cobrar", valor, persona: cap(original(text, personaDe(n, "a|al|le preste a"))), ...pz, cuando })
  const pagar1 = n.match(/^([a-zñ][a-zñ ]{1,40}?) me (?:presto|fio|presto plata)\b/)
  const pagar2 = /^(?:me prestaron|me fiaron|pedi prestad[oa]s?|saque (?:un |el )?(?:credito|prestamo)|me aprobaron (?:un |el )?(?:credito|prestamo)|le debo)\b/.test(n)
  if ((pagar1 || pagar2) && valor && !/^debo pagar|^le debo pagar/.test(n)) {
    const persona = pagar1 ? pagar1[1].replace(/^(?:el|la)\s+/, "") : personaDe(n, "a|al|de|del|en|con")
    out.push({ tipo: "prestamo", kind: "pagar", valor, persona: cap(original(text, persona)), ...pz, cuando })
  }

  // 3. Abono a una meta: "abona 100 mil a la meta del viaje", "guardé 200 mil para el viaje".
  const meta = n.match(new RegExp(`^(?:${reg})?(?:abona(?:le)?|abone|abono de|guarde|guarda|ahorre|aparte|separe|mete|meti|suma|sume|pon|puse)\\s+${MONTO_RE.source}\\s+(?:a|al|para|en|de)\\s+(.+)$`))
  if (meta && valor) {
    const explicito = /\bmeta\b/.test(meta[1])
    const ref = sinArt(meta[1].replace(/^(?:la |mi )?meta(?:\s+(?:de|del|para|de la)\b)?/, "")).replace(/^(el|la)\s+/, "")
    if (explicito || !/\b(deuda|cuota|credito|prestamo|tarjeta)\b/.test(meta[1])) out.push({ tipo: "abono_meta", ref, valor, cuando, explicito })
  }

  // 4. Cuotas y abonos de deudas: "pagué la cuota del carro", "pagué 2 cuotas de Bancolombia", "Andrés me pagó la cuota".
  const cuota = n.match(new RegExp(`^(?:${reg}(?:el )?pago de |pague |cancele |abone |le abone |hice (?:el )?abono de )(?:${MONTO_FUERTE.source}\\s+(?:de |a |al |para )?)?(?:la |las |una |(\\d|dos|tres) )?(cuotas?|abono)\\b(?:\\s+(?:del|de la|de mi|de|a la|al|a|para)\\b)?\\s*(.*)$`))
  if (cuota) {
    const nCuotas = numOf(cuota[1])
    out.push({ tipo: "pago_cuota", kind: "pagar", ref: sinArt(cuota[3] ?? ""), cuotas: nCuotas, valor: valor || undefined, cuando, estricto: false })
  }
  const abonoDeuda = !cuota && n.match(new RegExp(`^(?:abone|le abone)\\s+${MONTO_RE.source}\\s+(?:a|al|a la|de)\\s+(.+)$`))
  if (abonoDeuda && valor) out.push({ tipo: "pago_cuota", kind: "pagar", ref: sinArt(abonoDeuda[1]), valor, cuando, estricto: true })
  const cobro = n.match(/^(?!me |ya |le )([a-zñ][a-zñ ]{1,40}?) me (?:pago|abono|consigno|transfirio|devolvio|cancelo)\b\s*(.*)$/)
  if (cobro) {
    const resto = cobro[2]
    out.push({ tipo: "pago_cuota", kind: "cobrar", ref: sinArt(cobro[1]), cuotas: numOf(resto.match(/^(?:las )?(\d|dos|tres) cuotas/)?.[1]), valor: /cuota/.test(resto) && !valor ? undefined : valor || undefined, cuando, estricto: !/cuota/.test(resto) })
  }
  const meCuota = n.match(/^me (?:pagaron|abonaron|consignaron) (?:la |las |una |(\d|dos|tres) )?cuotas? (?:de |del )?(.+)$/)
  if (meCuota) out.push({ tipo: "pago_cuota", kind: "cobrar", ref: sinArt(meCuota[2]), cuotas: numOf(meCuota[1]), cuando, estricto: false })

  // 5. Cobro de una suscripción: "ya se cobró Netflix", "me cobraron Spotify".
  const sub = n.match(/^(?:se (?:cobro|pago|debito|renovo)|me (?:cobraron|debitaron)|(?:registra(?:me)? el )?cobro de)\s+(?:el |la |de )?(.+)$/)
  if (sub && !valor) out.push({ tipo: "cobro_suscripcion", ref: sinArt(sub[1]), cuando })

  // 6. Gasto o ingreso suelto ("gasté 20 mil en taxi"): lo de siempre.
  const q = detectQuickAction(text)
  if (q && !out.some((a) => a.tipo === "compra_tarjeta" || a.tipo === "abono_meta" || a.tipo === "pago_cuota" && !a.estricto)) out.push(q)

  // 7. "Pagué el arriendo" sin valor: un gasto fijo, una suscripción o una deuda que se llame así.
  const pague = !valor && !cuota && !pt && n.match(/^(?:pague|cancele|ya pague)\s+(.+)$/)
  if (pague) {
    const ref = sinArt(pague[1])
    out.push({ tipo: "pago_fijo", ref, cuando }, { tipo: "cobro_suscripcion", ref, cuando }, { tipo: "pago_cuota", kind: "pagar", ref, cuando, estricto: true }, { tipo: "pago_tarjeta", ref, total: /\btotal\b/.test(ref), cuando })
  }
  return out
}

// Tarjeta del consejero en lenguaje cotidiano. Puro, con pruebas en decision-view.test.ts.
// A partir del análisis (asAnalyze de lib/domain + concepto de la IA si lo hay) arma lo que ve la persona:
//   1. Una respuesta en texto natural con sus propias palabras ("darle a tu esposa $ 100.000 al mes…").
//   2. El veredicto con color y un medidor de cuánto pesa frente a lo que le sobra al mes.
//   3. Solo 2 o 3 cifras que importan para ESE tipo de decisión, escritas como frases y con "¿Qué significa?".
//   4. "¿Por qué?" (2-4 razones) y "Qué te recomiendo" (1-3 pasos).
// Sin cuentas ni fondo registrados no se muestran "disponible" ni "colchón" como si fueran datos: se explica qué falta.
// Sin IA (o en plan Gratis) los textos salen de plantillas variadas por tipo de decisión y veredicto.
import { ATIPOS, formatCOP, type Veredicto } from "@mirai/domain"
import type { Consulta } from "./types"

export type Grupo = "contado" | "cuotas" | "mensual" | "tarjeta" | "inversion" | "abono" | "prestamo" | "empeno"
export type Cifra = { id: string; frase: string; valor: string; ayuda: string; tone?: "ok" | "warn" | "bad" }
export type Peso = { pct: number; label: string; tone: "ok" | "warn" | "bad" }
export type DecisionView = {
  grupo: Grupo; v: Veredicto; veredicto: string; intro: string; peso: Peso | null
  cifras: Cifra[]; razones: string[]; pasos: string[]; avisos: string[]
}

const $ = (v: number) => formatCOP(Math.round(v))
const dec1 = new Intl.NumberFormat("es-CO", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const int = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 })
/** "0,4", "2,5", "12" (una cifra decimal solo si es pequeño). */
export const num = (v: number) => (Math.abs(v) < 10 ? dec1.format(v) : int.format(v))
const pctTxt = (p: number) => `${p < 10 ? dec1.format(p) : int.format(p)} %`
const plural = (n: number, s: string, p = `${s}s`) => `${num(n)} ${Math.abs(n) === 1 ? s : p}`
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const VEREDICTO: Record<Veredicto, string> = { si: "Te alcanza", cuidado: "Puedes, pero con cuidado", no: "Mejor no, por ahora" }

/** Tipo de decisión para elegir cifras y textos. */
export function grupoDe(c: Pick<Consulta, "d" | "m">): Grupo {
  const t = c.d.tipo
  if (t === "comprar") return c.m.enCuotas ? "cuotas" : "contado"
  if (t === "credito") return "cuotas"
  if (t === "fijo") return "mensual"
  if (t === "tarjeta") return "tarjeta"
  if (t === "invertir") return "inversion"
  if (t === "abonar") return "abono"
  if (t === "prestar") return "prestamo"
  return "empeno"
}

const PREFIJO = /^(oye|hola|mirai)[,\s]+|^(me conviene|me alcanza para|me alcanza|vale la pena|es buena idea|sera que|será que|quiero|quisiera|voy a|pienso|estoy pensando en|estoy pensando|deberia|debería|puedo|necesito)\s+/i
const PRON: [RegExp, string][] = [[/\bmis\b/gi, "tus"], [/\bmi\b/gi, "tu"], [/\bm[ií]\b/gi, "ti"], [/\bconmigo\b/gi, "contigo"], [/\bme\b/gi, "te"], [/\bm[ií]o\b/gi, "tuyo"], [/\bm[ií]a\b/gi, "tuya"]]

/** Lo que la persona quiere hacer, en segunda persona y sin montos: "darle a tu mujer para sus cosas". */
export function concepto(c: Pick<Consulta, "d" | "txt">): string {
  let t = (c.txt || c.d.desc || "").replace(/\s+/g, " ").trim().replace(/^[¿¡"“]+/, "").replace(/[?!.…"”]+$/, "")
  for (let i = 0; i < 3; i++) t = t.replace(PREFIJO, "").trim()
  t = t
    .replace(/\b(?:a|en|durante)\s+(?:\d+\s*)?(?:cuotas|meses|d[ií]as)\b/gi, " ")
    .replace(/\s*,?\s*\b(?:de|por|en|con|a)?\s*\$?\s?\d[\d.,]*\s*(?:mil|millones?|millon|mill|k|lucas|palos?)?(?:\s*pesos)?\b/gi, " ")
    .replace(/\b(?:al mes|mensuales?|cada mes|con la tarjeta|de contado)\b/gi, " ")
    .replace(/\s+([,.;:])/g, "$1").replace(/[,;:\s]+$/, "").replace(/\s+/g, " ").trim()
  for (const [re, by] of PRON) t = t.replace(re, by)
  if (t.length < 4 || /^\d/.test(t)) t = ATIPOS[c.d.tipo]?.l.toLowerCase() ?? "esto"
  return t.charAt(0).toLowerCase() + t.slice(1)
}

/** Pseudoaleatorio estable por consulta (misma consulta → mismo texto; consultas distintas → textos distintos). */
export function seedOf(id: string) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
const pick = <T>(xs: T[], seed: number, k = 0) => xs[(seed + k * 7) % xs.length]

type Ctx = {
  c: Consulta; g: Grupo; v: Veredicto; q: string; valor: number; mensual: number; libre: number; libreD: number
  cuentas: boolean; ingresos: boolean; diaTrabajo: number; seed: number
}

/** Costo que se repite cada mes según el tipo (o 0 si es de una vez). */
function costoMensual(c: Consulta, g: Grupo, valor: number) {
  const X = c.X ?? {}
  if (g === "mensual") return Math.max(0, valor - (+(c.d.reemplaza ?? 0) || 0))
  if (g === "cuotas") return c.m.cuota
  if (g === "tarjeta") return (X.manejo ?? 0) + (X.intMes ?? 0)
  if (g === "empeno") return X.intMes ?? 0
  return 0
}

function intro(x: Ctx): string {
  const { q, valor, mensual, libreD, libre, v, g, seed } = x
  const Q = cap(q)
  if (!x.ingresos) return pick([
    `Para decirte si ${q} te conviene necesito saber cuánto ganas. Registra tus ingresos en Mirai y lo reviso con tus números.`,
    `Me encantaría ayudarte con ${q}, pero aún no conozco tus ingresos. Agrégalos y te digo con cifras si te alcanza.`,
  ], seed)
  const peso = libre > 0 && mensual ? (mensual / libre) * 100 : 0
  const meses = libre > 0 ? valor / libre : 0
  const T: Record<Grupo, Record<Veredicto, string[]>> = {
    mensual: {
      si: [`${Q} cabe bien en tu presupuesto: son ${$(mensual)} al mes y aun así te sobran ${$(libreD)}.`, `Puedes hacerlo tranquilo. ${Q} (${$(mensual)} al mes) se lleva apenas el ${pctTxt(peso)} de lo que te sobra cada mes.`, `Sí te alcanza. Con ${q} por ${$(mensual)} al mes, todavía te quedan ${$(libreD)} libres.`],
      cuidado: [`Se puede, pero te deja con poco margen: después de ${q} te sobrarían ${$(libreD)} al mes.`, `${Q} (${$(mensual)} al mes) es posible, aunque se lleva el ${pctTxt(peso)} de lo que te sobra. Ve con calma.`],
      no: [`Por ahora no te alcanza: ${q} (${$(mensual)} al mes) te dejaría con ${$(Math.abs(libreD))} de menos cada mes.`, `Mejor espera. Hoy ${q} haría que gastes más de lo que ganas: te faltarían ${$(Math.abs(libreD))} al mes.`],
    },
    cuotas: {
      si: [`${Q} te cabe: la cuota sería de ${$(mensual)} al mes y te seguirían sobrando ${$(libreD)}.`, `Puedes hacerlo. Pagarías ${$(mensual)} durante ${x.c.m.n} meses${x.c.m.intereses > 0 ? `, con ${$(x.c.m.intereses)} de intereses` : ""}, y te queda margen.`],
      cuidado: [`${Q} es posible, pero la cuota de ${$(mensual)} te apretaría: te sobrarían ${$(libreD)} al mes.`, `Se puede con cuidado. Ojo con los intereses: al final pagarías ${$(x.c.m.total)} por algo que cuesta ${$(valor)}.`],
      no: [`Mejor no por ahora: con la cuota de ${$(mensual)} no te alcanzaría para tus gastos del mes.`, `Hoy ${q} a cuotas te pondría en aprietos: te faltarían ${$(Math.abs(libreD))} cada mes.`],
    },
    contado: {
      si: [`${Q} por ${$(valor)} te alcanza${x.cuentas ? " y sigues con plata para emergencias" : ""}.`, `Puedes hacerlo: ${$(valor)} equivale a ${plural(meses, "mes", "meses")} de lo que te sobra.`],
      cuidado: [`${Q} se puede, pero ${$(valor)} es ${plural(meses, "mes", "meses")} de lo que te sobra: piensa si es el momento.`, `Es posible, aunque te dejaría con poco respaldo. Si puedes, ahorra primero una parte.`],
      no: [`Mejor espera con ${q}: ${$(valor)} es más de lo que puedes cubrir sin quedarte sin respaldo.`, `Hoy no es buena idea: ${q} te dejaría sin plata para imprevistos.`],
    },
    tarjeta: {
      si: [`Sacar la tarjeta te puede servir si la pagas completa cada mes: así solo pagas la cuota de manejo.`, `Puedes tenerla sin problema, siempre que no la uses como si el cupo fuera plata tuya.`],
      cuidado: [`La tarjeta es posible, pero te cobraría unos ${$(mensual)} al mes entre manejo e intereses. Úsala con cuidado.`],
      no: [`Mejor no por ahora: entre manejo e intereses te costaría ${$(mensual)} al mes y no te sobra para eso.`],
    },
    inversion: {
      si: [`${Q} es buena idea: tu plata trabaja por ti y ganarías unos ${$(x.c.X?.net ?? 0)}.`, `Puedes hacerlo. Invertir ${$(valor)} te daría cerca de ${$(x.c.X?.net ?? 0)} después de la retención.`],
      cuidado: [`Invertir está bien, pero deja primero un colchón para emergencias: ese dinero no lo podrás usar mientras tanto.`],
      no: [`Antes de invertir ${$(valor)} conviene que tengas un respaldo para emergencias.`],
    },
    abono: {
      si: [`Abonar ${$(valor)} es una gran decisión: te ahorras unos ${$(x.c.X?.ahorro ?? 0)} en intereses.`, `Sí, ese abono te conviene: terminas antes y pagas menos intereses.`],
      cuidado: [`El abono ayuda, pero no te quedes sin respaldo para imprevistos.`],
      no: [`Mejor no abones todo ahora: te quedarías sin plata para emergencias.`],
    },
    prestamo: {
      si: [`Puedes prestar ${$(valor)} sin poner en riesgo tus finanzas.`, `${Q} es posible: es una parte manejable de tu plata.`],
      cuidado: [`Puedes prestarlo, pero solo si estás dispuesto a esperar si te pagan tarde.`],
      no: [`Mejor no prestes ${$(valor)} ahora: podrías necesitar esa plata.`],
    },
    empeno: {
      si: [`El empeño es posible, pero recuerda: pagas ${$(mensual)} de interés cada mes hasta recuperarlo.`],
      cuidado: [`Empeñar sale caro: ${$(mensual)} de interés al mes. Úsalo solo si es urgente.`],
      no: [`Mejor busca otra opción: el empeño te costaría ${$(mensual)} al mes en intereses.`],
    },
  }
  return pick(T[g][v], seed)
}

function cifras(x: Ctx): Cifra[] {
  const { c, g, valor, mensual, libreD, libre, cuentas, ingresos, diaTrabajo } = x
  const m = c.m, X = c.X ?? {}
  const out: (Cifra | null)[] = []
  const sobra = (base: number): Cifra | null => ingresos ? { id: "sobra", frase: libreD >= 0 ? `Después de ${g === "cuotas" ? "la cuota" : "este gasto"}, cada mes te sobran` : "Cada mes te faltarían", valor: $(Math.abs(libreD)), tone: libreD < 0 ? "bad" : libreD < base * 0.1 ? "warn" : "ok", ayuda: "Lo que ganas al mes menos tus gastos fijos, cuotas, suscripciones y lo que sueles gastar. Es la plata que te queda libre." } : null
  const dias = (v: number, mes: boolean): Cifra | null => diaTrabajo > 0 ? { id: "dias", frase: mes ? "Equivale cada mes a" : "Equivale a", valor: `${plural(v / diaTrabajo, "día", "días")} de tu trabajo${mes ? " al mes" : ""}`, ayuda: "Tu ingreso del mes dividido entre 30 días: cuántos días tendrías que trabajar para pagarlo." } : null
  const disp = (): Cifra | null => cuentas ? { id: "disponible", frase: m.liqD >= 0 ? "En tus cuentas te quedarían" : "En tus cuentas te faltarían", valor: $(Math.abs(m.liqD)), tone: m.liqD < 0 ? "bad" : "ok", ayuda: "La plata que tienes registrada en cuentas, efectivo e inversiones que puedes sacar rápido, después de este pago." } : null
  const colchon = (): Cifra | null => cuentas ? { id: "colchon", frase: "Tu respaldo para emergencias alcanzaría para", valor: plural(Math.max(0, m.emergD), "mes", "meses"), tone: m.emergD < 1 ? "bad" : m.emergD < 3 ? "warn" : "ok", ayuda: "Cuántos meses podrías pagar tus gastos básicos con la plata disponible si dejaras de recibir ingresos. Lo ideal es de 3 a 6 meses." } : null
  switch (g) {
    case "mensual":
      out.push(sobra(m.ing), dias(mensual, true), { id: "anio", frase: "En un año suma", valor: $(mensual * 12), ayuda: "El gasto mensual por 12 meses: lo que te cuesta en total en un año." })
      break
    case "cuotas":
      out.push({ id: "cuota", frase: `Pagarías cada mes, durante ${plural(m.n, "mes", "meses")}`, valor: $(m.cuota), ayuda: "El valor de cada cuota mensual, con intereses incluidos." },
        m.intereses > 0 ? { id: "intereses", frase: "En intereses pagarías de más", valor: $(m.intereses), tone: m.intereses > valor * 0.25 ? "warn" : undefined, ayuda: `Lo que pagas por encima del precio. En total pagarías ${$(m.total)}.` } : { id: "sin-int", frase: "Sin intereses: en total pagas", valor: $(m.total), ayuda: "Si no hay intereses, la suma de las cuotas es igual al precio." },
        sobra(m.ing))
      break
    case "contado":
      out.push(libre > 0 ? { id: "meses", frase: "Equivale a", valor: `${plural(valor / libre, "mes", "meses")} de lo que te sobra`, ayuda: "Cuántos meses de tu plata libre (lo que te sobra cada mes) se necesitan para pagarlo." } : null, dias(valor, false), disp() ?? colchon())
      break
    case "tarjeta":
      out.push({ id: "manejo", frase: "La cuota de manejo cuesta al año", valor: $((X.manejo ?? 0) * 12), ayuda: "Lo que cobra el banco por tener la tarjeta, aunque no la uses." },
        X.intMes ? { id: "int-mes", frase: "Si difieres a cuotas, pagarías de intereses al mes", valor: $(X.intMes), tone: "warn", ayuda: "Diferir una compra a varias cuotas genera intereses; si pagas el total cada mes, no." } : { id: "cupo", frase: "El cupo (no es plata tuya)", valor: $(valor), ayuda: "Es lo máximo que el banco te presta. Todo lo que gastes lo debes devolver." },
        sobra(m.ing))
      break
    case "inversion":
      {
        const meses = (+(c.d.dias ?? 0) || 180) / 30
        out.push({ id: "gana", frase: "Ganarías, ya con la retención", valor: $(X.net ?? 0), tone: "ok", ayuda: "Lo que te paga la inversión menos la retención en la fuente (4 %). Es una estimación." },
          disp() ?? { id: "plazo", frase: "Tu plata queda guardada durante", valor: plural(meses, "mes", "meses"), ayuda: "Mientras dure la inversión no puedes usar ese dinero sin perder parte de la ganancia." },
          colchon() ?? { id: "rinde", frase: "Es como si te pagaran cada mes", valor: $((X.net ?? 0) / Math.max(1, meses)), ayuda: "La ganancia neta repartida entre los meses del plazo." })
      }
      break
    case "abono":
      out.push({ id: "ahorro", frase: "Te ahorras en intereses", valor: $(X.ahorro ?? 0), tone: "ok", ayuda: "Los intereses que dejas de pagar al bajar el saldo de la deuda." }, X.menos ? { id: "menos", frase: "Terminas de pagar antes", valor: plural(X.menos, "cuota"), ayuda: "Cuotas que ya no tendrías que pagar." } : null, disp())
      break
    case "prestamo":
      out.push(dias(valor, false), m.n > 1 ? { id: "recibe", frase: `Te devolvería cada mes, durante ${plural(m.n, "mes", "meses")}`, valor: $(m.cuota), ayuda: "Lo que deberías recibir en cada cuota si te paga a tiempo." } : null, disp())
      break
    case "empeno":
      out.push({ id: "int-mes", frase: "Pagarías de interés cada mes", valor: $(mensual), tone: "warn", ayuda: "El interés mensual del empeño sobre lo que te prestan." }, { id: "devolver", frase: "Para recuperar tu objeto debes devolver", valor: $(valor), ayuda: "Al final pagas el préstamo completo, además de los intereses." }, sobra(m.ing))
      break
  }
  return out.filter((x): x is Cifra => !!x).slice(0, 3)
}

const LIQ_RE = /disponible|colch[oó]n|te faltan \$/i

function razones(x: Ctx): string[] {
  const { c, g, mensual, valor, libre, cuentas } = x
  const base = (c.ai?.razones?.length ? c.ai.razones : c.R).filter((r) => cuentas || !LIQ_RE.test(r))
  const extra: string[] = []
  if (g === "mensual" && mensual) extra.push(`Es un gasto que se repite: en un año son ${$(mensual * 12)}.`)
  if ((g === "contado" || g === "prestamo") && libre > 0) extra.push(`Juntar ${$(valor)} te toma unos ${plural(valor / libre, "mes", "meses")} de lo que te sobra.`)
  if (g === "cuotas" && c.m.ea > 0) extra.push(`La tasa equivale a ${pctTxt(c.m.ea * 100)} efectivo anual.`)
  const out = [...new Set([...base, ...extra])]
  return out.slice(0, 4)
}

const PASOS: Record<Grupo, Record<Veredicto, string[][]>> = {
  mensual: {
    si: [["Regístralo como gasto fijo para que Mirai lo tenga en cuenta cada mes.", "Revisa en 3 meses si sigues cómodo con este gasto."], ["Agrégalo en Gastos fijos con el día en que lo pagas.", "Si algún mes te aprieta, ajústalo antes de endeudarte."]],
    cuidado: [["Busca un gasto que puedas bajar en la misma cantidad.", "Empieza con un valor menor y súbelo si ves que te alcanza."], ["Ponte un tope mensual y revísalo en tu presupuesto.", "Asegura primero tus gastos básicos y tus cuotas."]],
    no: [["Primero baja gastos o sube tus ingresos para que te sobre plata.", "Prueba con un valor más pequeño y revisa de nuevo."], ["Revisa tus suscripciones y gastos hormiga: ahí suele haber espacio.", "Vuelve a preguntarme cuando te sobre más al mes."]],
  },
  cuotas: {
    si: [["Pregunta la tasa efectiva anual (E.A.) y compárala con otro banco.", "Si puedes, da una cuota inicial más grande para pagar menos intereses."], ["Regístralo en Préstamos para ver cada cuota en tu agenda.", "No sumes otra deuda hasta terminar esta."]],
    cuidado: [["Considera menos cuotas o una cuota inicial para bajar los intereses.", "Mejor ahorra la cuota unos meses y compra de contado."], ["Compara con otra entidad: una tasa más baja cambia mucho la cuota.", "Asegúrate de que la cuota no pase del 30 % de lo que ganas."]],
    no: [["Ahorra primero: con lo que te sobra cada mes podrías comprarlo de contado.", "Paga tus deudas actuales antes de tomar una nueva."], ["Busca una opción más barata o espera a tener una cuota inicial.", "Vuelve a revisarlo cuando bajen tus cuotas actuales."]],
  },
  contado: {
    si: [["Paga de contado y evita los intereses.", "Después, reconstruye tu respaldo para emergencias."], ["Compara precios antes de comprar: a veces el ahorro es grande.", "Anótalo en Gastos para que tu presupuesto quede al día."]],
    cuidado: [["Espera unos días (regla de los 30 días) y mira si lo sigues queriendo.", "Si lo compras, no toques tu fondo de emergencia."], ["Ahorra una parte primero y cómpralo en unas semanas.", "Busca una opción más económica."]],
    no: [["Ahorra para comprarlo: separa una parte de lo que te sobra cada mes.", "Agrégalo a tu Lista de deseos y decide en 30 días."], ["Primero arma un respaldo para emergencias.", "Busca una opción más barata o usada."]],
  },
  tarjeta: {
    si: [["Paga siempre el total del mes para no pagar intereses.", "Pide que te bajen o quiten la cuota de manejo."]],
    cuidado: [["Úsala solo para compras que ya tenías presupuestadas.", "Evita diferir a muchas cuotas."]],
    no: [["Usa por ahora tarjeta débito o efectivo.", "Revisa de nuevo cuando te sobre más al mes."]],
  },
  inversion: {
    si: [["Compara la tasa E.A. en varias entidades vigiladas por la Superfinanciera.", "Deja aparte tu fondo de emergencia antes de invertir."]],
    cuidado: [["Invierte una parte y deja el resto disponible para emergencias.", "Elige un plazo que no choque con gastos grandes."]],
    no: [["Primero arma un colchón de 3 meses de gastos.", "Después invierte lo que te sobre."]],
  },
  abono: {
    si: [["Pide que el abono vaya a capital y a reducir el plazo.", "Guarda el comprobante del abono."]],
    cuidado: [["Abona una parte y guarda el resto para emergencias.", "Prioriza la deuda con la tasa más alta."]],
    no: [["Primero arma un respaldo para emergencias.", "Abona después con lo que te sobre."]],
  },
  prestamo: {
    si: [["Acuerden por escrito el valor, las fechas y las cuotas.", "Regístralo en Me deben para recordar los cobros."]],
    cuidado: [["Presta solo lo que podrías perder sin que te afecte.", "Acuerden fechas claras y anótalo en Me deben."]],
    no: [["Ofrece una cantidad menor o ayuda de otra forma.", "Cuida tu respaldo: también puedes tener imprevistos."]],
  },
  empeno: {
    si: [["Recupera el objeto lo antes posible para pagar menos intereses.", "Lee el contrato: fecha límite y qué pasa si no pagas."]],
    cuidado: [["Compara con un préstamo de banco o cooperativa: suele ser más barato.", "Pide solo lo que necesitas."]],
    no: [["Busca otra opción: préstamo formal, vender algo o pedir un adelanto.", "Evita los préstamos gota a gota."]],
  },
}

/** Vista de la tarjeta del consejero para una consulta. */
export function decisionView(c: Consulta, seed = seedOf(c.id || c.txt || "x")): DecisionView {
  const g = grupoDe(c)
  const m = c.m
  const valor = +(c.d.valor ?? 0) || m.valor || 0
  const cuentas = c.datos?.cuentas ?? m.liq > 0
  const ingresos = c.datos?.ingresos ?? m.ing > 0
  const mensual = costoMensual(c, g, valor)
  // Sin cuentas registradas, "no tienes la plata disponible" no es un dato: el veredicto sale solo del flujo del mes.
  const usaLiquidez = g === "contado" || g === "prestamo" || g === "inversion" || g === "abono"
  let v: Veredicto = c.v
  if (!cuentas && usaLiquidez && !c.ai) {
    const meses = m.libre > 0 ? valor / m.libre : Infinity
    v = g === "inversion" || g === "abono" ? (meses > 6 ? "cuidado" : "si") : meses > 6 ? "no" : meses > 2 || m.hist?.mora ? "cuidado" : "si"
  }
  // Sin ingresos registrados no hay cómo decidir: no se dice "mejor no", se pide el dato.
  if (!ingresos) v = "cuidado"
  const x: Ctx = { c, g, v, q: concepto(c), valor, mensual, libre: m.libre, libreD: m.libreD, cuentas, ingresos, diaTrabajo: m.ing / 30, seed }
  const avisos: string[] = []
  if (!ingresos) avisos.push("Aún no registras tus ingresos: agrégalos en Ingresos para saber cuánto te sobra cada mes.")
  if (!cuentas && usaLiquidez) avisos.push("Aún no registras tu plata en cuentas ni tu fondo de emergencia; regístralos en Balance para calcular cuánto te quedaría disponible y tu respaldo para emergencias.")
  let peso: Peso | null = null
  if (ingresos && m.libre > 0) {
    if (mensual > 0) {
      const p = (mensual / m.libre) * 100
      peso = { pct: Math.min(100, p), label: `Se lleva el ${pctTxt(p)} de lo que te sobra cada mes`, tone: p > 70 ? "bad" : p > 30 ? "warn" : "ok" }
    } else if (valor > 0) {
      const meses = valor / m.libre
      peso = { pct: Math.min(100, (meses / 6) * 100), label: `Equivale a ${plural(meses, "mes", "meses")} de lo que te sobra`, tone: g === "inversion" || g === "abono" ? "ok" : meses > 3 ? "bad" : meses > 1 ? "warn" : "ok" }
    }
  } else if (ingresos && m.libre <= 0) avisos.push("Hoy no te sobra plata al mes: tus gastos ya igualan o superan lo que ganas.")
  const pasos = (c.ai?.plan?.length ? c.ai.plan : pick(PASOS[g][v], seed, 1)).slice(0, 3)
  return {
    grupo: g, v, veredicto: ingresos ? VEREDICTO[v] : "Me faltan tus ingresos para decidir", intro: c.ai?.explicacion?.trim() || intro(x), peso,
    cifras: cifras(x), razones: razones(x), pasos, avisos,
  }
}

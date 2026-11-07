// Propuestas del chat en todos los módulos: encontrar el registro del que habla la persona ("la cuota del carro",
// "el arriendo", "Netflix", "la Visa", "la meta del viaje") y preparar los datos de la tarjeta para confirmar, con los
// mismos cálculos de lib/domain que usan los formularios. Puro (sin Supabase ni reloj): lo usan app/api/chat,
// lib/chat/tools.ts y features/chat/actions.ts (que vuelve a calcular todo al confirmar).
import {
  addMonths, annuity, conv, deudaTarjeta, esTipo, tarjetaPagoMes, fijoStatus, fijoValor, findContact, findEntity, iso, loanEngine, loanName, loanTipo,
  norm, parseDate, previewLoan, tipoDef, tipoDefaults, toDay, type BookData, type LoanTipo,
} from "@mirai/domain"
import type { Propuesta } from "./types"

type Loan = BookData["loans"][number]
type Fixed = BookData["fixedExpenses"][number]
type Sub = BookData["subscriptions"][number]
type Card = BookData["creditCards"][number]
type Goal = BookData["goals"][number]
export type Datos = Propuesta["datos"]

/** Resultado de preparar una propuesta: los datos de la tarjeta o una pregunta para la persona. */
export type Armado = { ok: true; datos: Datos; resumen: string } | { ok: false; msg: string }

const r0 = (v: number) => Math.round(+v || 0)
const $ = (v: number) => `$ ${r0(v).toLocaleString("es-CO")}`

// ── Encontrar el registro por lo que dice la persona ──────────────────────────────────────────────────────────────

/** Sinónimos frecuentes: "la cuota del carro" encuentra el "Crédito de vehículo". */
const SYN: [RegExp, string][] = [
  [/\b(carro|carrito|moto|auto|automovil|vehiculo|camioneta|camion)\b/g, "vehiculo"],
  [/\b(casa|apartamento|apto|vivienda|hipoteca|hipotecario|leasing habitacional)\b/g, "vivienda"],
  [/\b(luz|energia|electricidad|enel|codensa|epm energia)\b/g, "energia"],
  [/\b(agua|acueducto|alcantarillado)\b/g, "agua"],
  [/\b(internet|wifi|fibra)\b/g, "internet"],
  [/\b(celular|telefono|movil|plan de datos)\b/g, "celular"],
  [/\b(arriendo|arrendamiento|alquiler)\b/g, "arriendo"],
  [/\b(gimnasio|gym)\b/g, "gimnasio"],
  [/\b(colegio|pension del colegio|matricula)\b/g, "colegio"],
  [/\b(tarjeta de credito|tdc)\b/g, "tarjeta"],
]
const STOP = new Set(["el", "la", "los", "las", "de", "del", "mi", "mis", "un", "una", "al", "en", "con", "por", "para", "que", "y", "o", "su", "sus",
  "cuota", "cuotas", "pago", "pague", "credito", "prestamo", "deuda", "meta", "abono", "tarjeta", "suscripcion", "cobro", "mes", "este", "esta"])

/** Palabras con significado de un texto (sin tildes, con sinónimos). */
export function palabras(s: string | null | undefined): string[] {
  let n = norm(s ?? "").replace(/[^a-z0-9ñ ]+/g, " ")
  for (const [re, k] of SYN) n = n.replace(re, k)
  return n.split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w))
}

const casa = (q: string, w: string) => q === w || (q.length >= 4 && w.length >= 4 && (w.startsWith(q) || q.startsWith(w)))

/**
 * El registro que mejor coincide con la frase: cuenta las palabras de la frase que aparecen en sus nombres. Si la frase
 * no trae palabras y solo hay uno, es ese. `empate` trae los candidatos cuando no se puede decidir.
 */
export function elegir<T>(q: string, items: { item: T; textos: (string | null | undefined)[] }[]): { item?: T; empate: T[] } {
  if (!items.length) return { empate: [] }
  const qs = palabras(q)
  if (!qs.length) return items.length === 1 ? { item: items[0].item, empate: [] } : { empate: items.map((x) => x.item) }
  const scored = items.map((x) => {
    const ws = x.textos.flatMap(palabras)
    return { x, s: qs.filter((w) => ws.some((v) => casa(w, v))).length }
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s)
  if (!scored.length) return { empate: [] }
  const top = scored.filter((x) => x.s === scored[0].s)
  return top.length === 1 ? { item: top[0].x.item, empate: [] } : { empate: top.map((x) => x.x.item) }
}

/**
 * El contacto de una persona por su nombre. Como `elegir`, pero el nombre de pila de la frase tiene que estar en el del
 * contacto: "Juan" o "Juan Pérez" encuentran a "Juan Pérez"; "Juan Gómez" NO es "Laura Gómez" (antes bastaba el apellido).
 */
export function elegirPersona<T extends { nombre: string }>(q: string, contactos: T[]): T | undefined {
  const [pila] = palabras(q)
  if (!pila) return undefined
  const conPila = contactos.filter((c) => palabras(c.nombre).some((w) => casa(pila, w)))
  return elegir(q, conPila.map((c) => ({ item: c, textos: [c.nombre] }))).item
}

/** Nombre de una deuda para mostrar: quién + concepto ("Bancolombia · Crédito de vehículo"). */
export const deudaLabel = (b: Pick<BookData, "contacts" | "entities">, L: Loan) =>
  [loanName(L as never, b.contacts, b.entities), L.concepto].filter((x) => x && x.trim()).join(" · ")

export function findLoan(b: BookData, q: string, kind?: "pagar" | "cobrar", today?: string) {
  const vivos = b.loans.filter((L) => (!kind || L.kind === kind) && (!today || !loanEngine(L, today).done))
  return elegir(q, vivos.map((L) => ({ item: L, textos: [loanName(L as never, b.contacts, b.entities), L.concepto, tipoDef(loanTipo(L as never))?.corto] })))
}
export const findFixed = (b: BookData, q: string) => elegir(q, b.fixedExpenses.map((f) => ({ item: f, textos: [f.nombre, (f as { proveedor?: string }).proveedor] })))
export const findSub = (b: BookData, q: string) => elegir(q, b.subscriptions.map((s) => ({ item: s, textos: [s.nombre] })))
export const findCard = (b: BookData, q: string) => elegir(q, b.creditCards.map((c) => ({ item: c, textos: [c.nombre] })))
export const findGoal = (b: BookData, q: string) => elegir(q, b.goals.map((g) => ({ item: g, textos: [g.nombre] })))

const lista = (xs: string[]) => xs.slice(0, 6).map((x) => `- ${x}`).join("\n")

// ── Préstamos y deudas ────────────────────────────────────────────────────────────────────────────────────────────

export const PARECE_ENTIDAD = /\b(banco|bancolombia|davivienda|bbva|bogota|occidente|popular|av villas|colpatria|scotiabank|itau|falabella|caja social|nequi|daviplata|cooperativa|coop|financiera|fondo|credito|tuya|addi|sistecredito|fintech|lulo|nu)\b/

export type PrestamoIn = {
  kind: "pagar" | "cobrar"; valor: number; persona?: string | null; plazo?: number | null; frec?: string | null
  tasa?: number | null; fecha?: string | null; concepto?: string | null; tipo?: string | null
}

/** "Le presté 200 mil a Juan a 3 meses" → préstamo en Me deben con su plan de cuotas (igual que el formulario). */
export function armarPrestamo(b: BookData, today: string, i: PrestamoIn): Armado {
  const valor = r0(i.valor)
  if (!(valor > 0)) return { ok: false, msg: i.kind === "cobrar" ? "¿Cuánto prestaste?" : "¿Cuánto te prestaron o cuánto debes?" }
  const persona = (i.persona ?? "").trim().replace(/^(a |al |a la |de |del |con )/i, "").slice(0, 80)
  if (!persona) return { ok: false, msg: i.kind === "cobrar" ? "¿A quién le prestaste? Dime su nombre para anotarlo en **Me deben**." : "¿Quién te prestó (una persona, un banco o una tienda)?" }
  const ct = findContact(b.contacts, { nombre: persona }) ?? elegirPersona(persona, b.contacts)
  const en = ct ? undefined : findEntity(b.entities, { nombre: persona })
  const esEntidad = !!en || (!ct && i.kind === "pagar" && PARECE_ENTIDAD.test(norm(persona)))
  const tipo: LoanTipo = esTipo(i.tipo, i.kind) ? i.tipo : i.kind === "cobrar" ? "presto" : esEntidad ? "banco" : "persona"
  const D = tipoDefaults(tipo, i.kind)
  const frec = ["mensual", "quincenal", "semanal", "diario", "diariohab"].includes(i.frec ?? "") ? i.frec! : D.frec
  const plazo = Math.max(1, Math.min(600, Math.round(+(i.plazo ?? 0) || D.plazo)))
  const tasa = Math.max(0, Math.min(30, +(i.tasa ?? 0) || 0))
  const sistema = tasa > 0 ? (D.sistema === "sin" ? "simple" : D.sistema) : "simple"
  const fecha = i.fecha && /^\d{4}-\d{2}-\d{2}$/.test(i.fecha) ? i.fecha : today
  const pv = previewLoan({ monto: valor, sistema, tasa, frec, plazo, inicio: fecha }, today)
  const nombre = ct?.nombre ?? en?.nombre ?? persona.charAt(0).toUpperCase() + persona.slice(1)
  const concepto = (i.concepto ?? "").trim().slice(0, 80) || (i.kind === "cobrar" ? "Préstamo" : tipo === "banco" ? "Crédito" : "Préstamo")
  return {
    ok: true,
    datos: {
      kind: i.kind, loan_tipo: tipo, valor, persona: nombre, contact_id: ct?.id ?? null, entity_id: en?.id ?? null, plazo, frec, tasa, sistema, fecha, concepto,
      cuota: r0(pv.cuota), total: r0(pv.total),
    },
    resumen: i.kind === "cobrar"
      ? `el préstamo de **${$(valor)}** a **${nombre}** (${plazo} ${plazo === 1 ? "cuota" : "cuotas"} de ${$(pv.cuota)})`
      : `la deuda de **${$(valor)}** con **${nombre}** (${plazo} ${plazo === 1 ? "cuota" : "cuotas"} de ${$(pv.cuota)})`,
  }
}

export type PagoCuotaIn = { kind: "pagar" | "cobrar"; ref: string; cuotas?: number | null; valor?: number | null; fecha?: string | null }

/** "Pagué la cuota del carro" o "Andrés me abonó 100 mil": cuota del plan (o abono a capital) de esa deuda. */
export function armarPagoCuota(b: BookData, today: string, i: PagoCuotaIn, L0?: Loan): Armado {
  const { item: L, empate } = L0 ? { item: L0, empate: [] } : findLoan(b, i.ref, i.kind, today)
  const nada = i.kind === "pagar" ? "No tienes deudas pendientes en **Le debo**." : "No tienes préstamos pendientes en **Me deben**."
  if (!L) {
    const vivos = b.loans.filter((x) => x.kind === i.kind && !loanEngine(x, today).done)
    if (!vivos.length) return { ok: false, msg: nada }
    const opts = (empate.length ? empate : vivos).map((x) => deudaLabel(b, x))
    return { ok: false, msg: `¿De cuál ${i.kind === "pagar" ? "deuda" : "préstamo"} es el pago?\n\n${lista(opts)}\n\nDime el nombre, por ejemplo: *pagué la cuota de ${palabras(opts[0])[0] ?? "Bancolombia"}*.` }
  }
  const e0 = loanEngine(L, today)
  if (e0.done) return { ok: false, msg: `**${deudaLabel(b, L)}** ya está saldada.` }
  const fecha = i.fecha && /^\d{4}-\d{2}-\d{2}$/.test(i.fecha) ? i.fecha : today
  const cuota = e0.next?.valor ?? 0
  const v = r0(+(i.valor ?? 0))
  // Si dice un valor que no es un número exacto de cuotas, es un abono a capital.
  const k = v && cuota ? Math.round(v / cuota) : 0
  const exacto = !v || (k >= 1 && Math.abs(v - k * cuota) <= Math.max(1000, cuota * 0.01))
  const pago: "cuota" | "abono" = exacto ? "cuota" : "abono"
  const n = pago === "cuota" ? Math.max(1, Math.min(e0.plan.length, Math.round(+(i.cuotas ?? 0) || k || 1))) : 0
  const sim = pago === "cuota" ? e0.plan.slice(0, n).map(() => ({ fecha, tipo: "cuota" as const, valor: 0 })) : [{ fecha, tipo: "abono" as const, valor: Math.min(v, e0.saldo), modo: "plazo" }]
  const e1 = loanEngine({ ...L, payments: [...L.payments, ...sim] }, today)
  const valor = pago === "cuota" ? r0(e0.plan.slice(0, n).reduce((a, r) => a + r.valor, 0)) : r0(Math.min(v, e0.saldo))
  const nombre = deudaLabel(b, L)
  return {
    ok: true,
    datos: { ref_id: L.id, kind: i.kind, nombre, pago, cuotas: n, valor, fecha, saldo: r0(e1.saldo) },
    resumen: pago === "cuota" ? `${n === 1 ? "la cuota" : `${n} cuotas`} de **${nombre}** por **${$(valor)}**` : `el abono de **${$(valor)}** a **${nombre}**`,
  }
}

// ── Gastos fijos, suscripciones, tarjetas y metas ────────────────────────────────────────────────────────────────

const qLabel = (per: string) => (per.endsWith("Q1") ? " (1ª quincena)" : per.endsWith("Q2") ? " (2ª quincena)" : "")

/** "Pagué el arriendo": el periodo vencido o el próximo de ese gasto fijo, con su valor (igual a Pagar en Gastos fijos). */
export function armarPagoFijo(b: BookData, today: string, i: { ref: string; valor?: number | null; fecha?: string | null }, f0?: Fixed): Armado {
  const { item, empate } = f0 ? { item: f0, empate: [] } : findFixed(b, i.ref)
  const f = item
  if (!f) {
    if (!b.fixedExpenses.length) return { ok: false, msg: "Aún no tienes gastos fijos. Agrégalos en **Gastos fijos** o dime, por ejemplo: *agrega el arriendo de 1,2 millones cada mes el día 5*." }
    return { ok: false, msg: `¿Cuál gasto fijo pagaste?\n\n${lista((empate.length ? empate : b.fixedExpenses).map((x) => x.nombre))}` }
  }
  const st = fijoStatus(f, today)
  const per = st.venc[0] ?? st.prox
  if (!per) return { ok: false, msg: `**${f.nombre}** está al día: no tiene periodos pendientes.` }
  const v = r0(+(i.valor ?? 0)) || (f.variable ? 0 : r0(fijoValor(f, per.per)))
  if (!v) return { ok: false, msg: `¿Cuánto pagaste de **${f.nombre}**? Escríbeme algo como *pagué 180 mil de ${f.nombre.toLowerCase()}*.` }
  const fecha = i.fecha && /^\d{4}-\d{2}-\d{2}$/.test(i.fecha) ? i.fecha : today
  return {
    ok: true,
    datos: { ref_id: f.id, nombre: f.nombre + qLabel(per.per), periodo: per.per, valor: v, fecha, descripcion: per.due < today ? "Vencido" : "Pendiente" },
    resumen: `el pago de **${f.nombre}${qLabel(per.per)}** por **${$(v)}**`,
  }
}

/** "Ya se cobró Netflix": gasto en Suscripciones (en pesos, tu parte) y el próximo cobro avanza (como "Ya se cobró"). */
export function armarCobroSub(b: BookData, today: string, i: { ref: string; valor?: number | null }, s0?: Sub): Armado {
  const { item: s, empate } = s0 ? { item: s0, empate: [] } : findSub(b, i.ref)
  if (!s) {
    if (!b.subscriptions.length) return { ok: false, msg: "Aún no tienes suscripciones activas. Agrégalas en **Suscripciones**." }
    return { ok: false, msg: `¿Cuál suscripción se cobró?\n\n${lista((empate.length ? empate : b.subscriptions).map((x) => x.nombre))}` }
  }
  const valor = r0(+(i.valor ?? 0)) || r0(conv(+s.valor, s.currency, b.settings.trm) / Math.max(1, +(s.comparte ?? 1)))
  const fecha = s.proximo && s.proximo <= today ? s.proximo : today
  const proximo = iso(addMonths(parseDate(s.proximo ?? today), s.ciclo === "anual" ? 12 : 1))
  return { ok: true, datos: { ref_id: s.id, nombre: s.nombre, valor, fecha, proximo }, resumen: `el cobro de **${s.nombre}** por **${$(valor)}**` }
}

/** "Compré un celular de 2 millones con la Visa a 12 cuotas": compra en la tarjeta (y el gasto, como el formulario). */
export function armarCompraTarjeta(b: BookData, today: string, i: { ref?: string | null; valor: number; descripcion: string; cuotas?: number | null; fecha?: string | null }, c0?: Card): Armado {
  if (!b.creditCards.length) return { ok: false, msg: "Aún no tienes tarjetas de crédito en Mirai. Agrégala en **Tarjetas** y luego me cuentas la compra." }
  const { item: c, empate } = c0 ? { item: c0, empate: [] } : findCard(b, i.ref ?? "")
  const card = c ?? (b.creditCards.length === 1 ? b.creditCards[0] : undefined)
  if (!card) return { ok: false, msg: `¿Con cuál tarjeta compraste?\n\n${lista((empate.length ? empate : b.creditCards).map((x) => x.nombre))}` }
  const valor = r0(i.valor)
  if (!(valor > 0)) return { ok: false, msg: "¿De cuánto fue la compra?" }
  const n = Math.max(1, Math.min(48, Math.round(+(i.cuotas ?? 1) || 1)))
  const cuota = r0(annuity(valor, n > 1 ? (+card.tasa || 0) / 100 : 0, n))
  const fecha = i.fecha && /^\d{4}-\d{2}-\d{2}$/.test(i.fecha) ? i.fecha : today
  const descripcion = (i.descripcion || "Compra").trim().slice(0, 80)
  return {
    ok: true,
    datos: { ref_id: card.id, nombre: card.nombre, valor, descripcion, cuotas: n, fecha, cuota, total: cuota * n },
    resumen: `la compra de **${descripcion}** por **${$(valor)}** con la tarjeta **${card.nombre}** a ${n} ${n === 1 ? "cuota" : "cuotas"}`,
  }
}

/**
 * "Pagué la tarjeta" (el pago del mes), "pagué el total de la Visa" o "abone 300 mil a la tarjeta": pago real de la
 * tarjeta (pay_credit_card de F2), que baja la deuda y sale en el flujo en vez de la estimación.
 */
export function armarPagoTarjeta(b: BookData, today: string, i: { ref?: string | null; valor?: number | null; total?: boolean; fecha?: string | null }, c0?: Card): Armado {
  if (!b.creditCards.length) return { ok: false, msg: "Aún no tienes tarjetas de crédito en Mirai. Agrégala en **Tarjetas**." }
  const { item: c, empate } = c0 ? { item: c0, empate: [] } : findCard(b, i.ref ?? "")
  const card = c ?? (b.creditCards.length === 1 ? b.creditCards[0] : undefined)
  if (!card) return { ok: false, msg: `¿Cuál tarjeta pagaste?\n\n${lista((empate.length ? empate : b.creditCards).map((x) => x.nombre))}` }
  const deuda = r0(deudaTarjeta(card, today))
  if (deuda <= 0) return { ok: false, msg: `La tarjeta **${card.nombre}** no tiene deuda registrada en Mirai.` }
  const mes = r0(tarjetaPagoMes(card, today))
  const v = r0(+(i.valor ?? 0))
  const valor = Math.min(deuda, i.total ? deuda : v || mes)
  if (!(valor > 0)) return { ok: false, msg: `¿Cuánto pagaste de la tarjeta **${card.nombre}**? Debes ${$(deuda)}.` }
  const tipo: "minimo" | "total" | "otro" = valor >= deuda - 1 ? "total" : !v ? "minimo" : "otro"
  const fecha = i.fecha && /^\d{4}-\d{2}-\d{2}$/.test(i.fecha) ? i.fecha : today
  return {
    ok: true,
    datos: { ref_id: card.id, nombre: card.nombre, valor, pago_tarjeta: tipo, fecha, saldo: Math.max(0, deuda - valor), total: deuda },
    resumen: `el pago de **${$(valor)}** a la tarjeta **${card.nombre}**${tipo === "total" ? " (el total)" : tipo === "minimo" ? " (el pago del mes)" : ""}`,
  }
}

/** "Abona 100 mil a la meta del viaje": suma a lo ahorrado de esa meta. */
export function armarAbonoMeta(b: BookData, today: string, i: { ref?: string | null; valor: number; fecha?: string | null }, preset?: Goal): Armado {
  if (!b.goals.length) return { ok: false, msg: "Aún no tienes metas. Dime, por ejemplo: *crea una meta de 3 millones para un viaje en diciembre*." }
  const { item: g0, empate } = preset ? { item: preset, empate: [] } : findGoal(b, i.ref ?? "")
  const g: Goal | undefined = g0 ?? (b.goals.length === 1 ? b.goals[0] : undefined)
  if (!g) return { ok: false, msg: `¿A cuál meta le abonas?\n\n${lista((empate.length ? empate : b.goals).map((x) => x.nombre))}` }
  const valor = r0(i.valor)
  if (!(valor > 0)) return { ok: false, msg: `¿Cuánto guardaste para **${g.nombre}**?` }
  const fecha = i.fecha && /^\d{4}-\d{2}-\d{2}$/.test(i.fecha) ? i.fecha : today
  const ahorrado = r0(+g.ahorrado + valor)
  return { ok: true, datos: { ref_id: g.id, nombre: g.nombre, valor, fecha, ahorrado, objetivo: r0(+g.objetivo) }, resumen: `el abono de **${$(valor)}** a la meta **${g.nombre}**` }
}

/**
 * ¿Un gasto suelto es en realidad el pago de un gasto fijo pendiente? ("pagué 180 mil de la luz" con el fijo
 * "Energía" sin pagar este periodo). Solo si TODAS las palabras de la descripción coinciden con el fijo.
 */
export function fijoDelGasto(b: BookData, today: string, descripcion: string): Fixed | undefined {
  const qs = palabras(descripcion)
  if (!qs.length) return undefined
  const cands = b.fixedExpenses.filter((f) => {
    const ws = [f.nombre, (f as { proveedor?: string }).proveedor].flatMap(palabras)
    return qs.every((w) => ws.some((v) => casa(w, v))) && !!(fijoStatus(f, today).venc[0] ?? fijoStatus(f, today).prox)
  })
  if (cands.length !== 1) return undefined
  // Solo si el periodo está cerca (vencido o en los próximos 10 días): un fijo de dentro de un mes no es este gasto.
  const st = fijoStatus(cands[0], today)
  const per = st.venc[0] ?? st.prox!
  return per.due <= iso(new Date(toDay(today).getTime() + 10 * 864e5)) ? cands[0] : undefined
}

/**
 * Medio de pago que nombra la frase ("…por Nequi", "en efectivo", "con Daviplata"): el del catálogo cuyo nombre aparece
 * en el texto. Así el gasto o el ingreso mueve la cuenta ligada a ese medio (saldos de F1).
 */
export function medioEnTexto<T extends { id: string; nombre: string }>(text: string, medios: T[] | null | undefined): T | undefined {
  const n = ` ${norm(text).replace(/[^a-z0-9ñ ]+/g, " ")} `
  return (medios ?? []).map((m) => ({ m, k: norm(m.nombre).replace(/[^a-z0-9ñ ]+/g, " ").trim() }))
    .filter((x) => x.k.length >= 3)
    .sort((a, b) => b.k.length - a.k.length)
    .find((x) => n.includes(` ${x.k} `) || x.k.split(/\s+/).some((w) => w.length >= 5 && n.includes(` ${w} `)))?.m
}

export type { Card, Fixed, Goal, Loan, Sub }

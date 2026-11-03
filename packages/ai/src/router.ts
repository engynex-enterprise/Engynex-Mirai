// Algoritmo primero, IA solo de respaldo. Puro (sin red), con pruebas en router.test.ts.
//
// Lo que se resuelve aquí NO gasta tokens:
// - Categoría: regla del usuario → historial → palabras clave (localCat de lib/domain).
// - Gasto hormiga: los casos claros (fijo, más del doble del umbral, necesidad básica o ahorro, palabra típica de
//   hormiga, pequeño y repetido) se deciden con reglas; solo los dudosos van a la IA.
// - Chat: preguntas frecuentes sobre los propios datos ("¿cuánto gasté en mercado?", "¿cuánto debo?",
//   "¿cuánto me queda?") se responden con los números ya calculados.
// - Consejero: si la frase trae tipo y valor claros, se interpreta con reglas y las preguntas de "faltan datos" se
//   generan aquí.
// - Correo del banco: los correos sin un monto no pueden ser compras y no se mandan a la IA.
import { CONS_RE, HKW, addMonths, finCtx, formatCOP, gastosMesK, localCat, localInterp, mkey, moneyIn, norm, toDay, type AdvisorInput, type BookData, type CategoryIn, type DateInput, type LocalCatContext } from "@/lib/domain"
import { estadoIntegral, flujoIntegral, periodo, type ExtrasIntegral } from "@/lib/domain/flujo-integral"
import { capacidad, compromisos } from "@/lib/domain/dashboard"

// ── Categorizar y gasto hormiga ──────────────────────────────────────────────────────────────────────────────────

export type ClassifyItem = { i: number; descripcion: string; valor: number; veces_mes: number }
export type ClassifyOut = { i: number; category_id: string | null; hormiga: boolean | null; razon: string; src?: "regla" | "ia" }

const NO_HORMIGA = ["Vivienda", "Servicios públicos", "Educación", "Salud"]

/** Decide con reglas si un gasto es hormiga cuando el caso es claro; null si es dudoso (lo decide la IA). */
export function hormigaCierta(it: Pick<ClassifyItem, "descripcion" | "valor" | "veces_mes">, cat: CategoryIn | undefined, umbral: number): { h: boolean; razon: string } | null {
  const v = +it.valor || 0
  const d = norm(it.descripcion)
  if (v > umbral * 2) return { h: false, razon: "Valor alto para ser hormiga" }
  if (cat && cat.grupo === "a") return { h: false, razon: "Es ahorro" }
  if (cat && NO_HORMIGA.includes(cat.nombre)) return { h: false, razon: `Necesidad básica (${cat.nombre})` }
  if (HKW.test(d) && v <= umbral * 2) return { h: true, razon: "Gasto pequeño típico de hormiga" }
  if (v <= umbral && it.veces_mes >= 4) return { h: true, razon: `Pequeño y repetido ${it.veces_mes} veces al mes` }
  return null
}

/**
 * Reparte los gastos: lo que se resuelve con reglas (`done`) y lo que necesita IA (`pending`).
 * `needCat`/`needH` dicen qué se pidió (Ajustes › IA: categoría automática y gastos hormiga).
 */
export function routeClassify(items: ClassifyItem[], ctx: LocalCatContext & {
  umbral: number; needCat: boolean; needH: boolean
  /** La IA decide siempre la categoría: lo que encuentren las reglas va como pista ("categoría probable"). */
  siempreIA?: boolean
}) {
  const done: ClassifyOut[] = []
  const pending: (ClassifyItem & { category_id: string | null; cat?: string; askCat: boolean; askH: boolean })[] = []
  for (const it of items) {
    const hit = localCat(it.descripcion, ctx)
    const cat = hit ? ctx.categories.find((c) => c.id === hit.category_id) : undefined
    const h = ctx.needH ? hormigaCierta(it, cat, ctx.umbral) : null
    const askCat = ctx.needCat && (!!ctx.siempreIA || !hit)
    const askH = ctx.needH && !h
    if (!askCat && !askH) {
      done.push({ i: it.i, category_id: hit?.category_id ?? null, hormiga: h ? h.h : null, razon: h?.razon ?? (hit ? `Por ${hit.src === "regla" ? "tu regla" : hit.src === "historial" ? "tu historial" : "palabras clave"}` : ""), src: "regla" })
    } else {
      pending.push({ ...it, category_id: hit?.category_id ?? null, cat: cat?.nombre, askCat, askH })
    }
  }
  return { done, pending }
}

// ── Chat: preguntas frecuentes con los propios datos ────────────────────────────────────────────────────────────

export type ChatFacts = {
  mes: string
  gasto_mes: number
  gasto_mes_anterior: number
  por_categoria: Record<string, number>
  por_categoria_anterior: Record<string, number>
  ingreso_mensual: number
  gastos_fijos_mes: number
  cuotas_deudas_mes: number
  suscripciones_mes: number
  disponible: number
  fondo_emergencia: number
  deudas: { nombre: string; saldo: number }[]
  te_deben: number
  hormiga_mes: number
  metas: { nombre: string; objetivo: number; ahorrado: number }[]
  /** Nombres de todas las categorías (para responder también las que van en cero). */
  categorias?: string[]
  /**
   * Cifras del Balance y el Dashboard (flujo integral del mes y estado de lo que tienes y debes): el chat responde lo
   * mismo que esas pantallas. Opcionales para poder probar quickAnswer con hechos escritos a mano.
   */
  integral?: {
    entra: number; sale: number; ahorro: number; queda: number
    tengo: number; debo: number; patrimonio: number
    deuda_tarjetas: number; pago_tarjetas_mes: number
    /** Lo que puedes ahorrar al mes (Dashboard › Capacidad de ahorro). */
    libre_mes: number
    /** Meses que aguantas sin ingresos con tu dinero disponible. */
    colchon_meses: number
  }
}

/**
 * Hechos del libro para el chat, con los mismos cálculos del Balance y el Dashboard: ingreso y compromisos
 * (`compromisos`), disponible (`estadoIntegral().liquidez`), lo que debes línea por línea (`estadoIntegral().debo`:
 * créditos, tarjetas, otras deudas e impuestos) y el mes (`flujoIntegral`). `X` son los extras del flujo integral
 * (estimados de impuestos, mesadas y fondo) que el servidor arma igual que el Balance (lib/chat/extras.ts).
 */
export function chatFacts(b: BookData & { fund?: { on?: boolean; activo?: boolean | null; saldo?: number | string | null } | null }, today: DateInput, X: ExtrasIntegral = {}): ChatFacts {
  // El fondo llega como la fila del libro (activo, saldo; lib/book-data.ts) o ya resumido (on, saldo).
  const fr = b.fund ?? null
  const fondo = fr ? { on: !!(fr.activo ?? fr.on), saldo: +(fr.saldo ?? 0) || 0 } : null
  const base = finCtx({ ...b, fund: fondo }, today)
  const t = toDay(today)
  const k = mkey(t), prevK = mkey(addMonths(t, -1))
  const name = new Map(b.categories.map((c) => [c.id, c.nombre]))
  const by = (kk: string) => {
    const o: Record<string, number> = {}
    for (const g of gastosMesK(b.expenses, kk)) { const nm = name.get(g.category_id ?? "") ?? "Sin categoría"; o[nm] = (o[nm] || 0) + +g.valor }
    return o
  }
  const a = by(k), p = by(prevK)
  const sum = (o: Record<string, number>) => Math.round(Object.values(o).reduce((x, y) => x + y, 0))
  const E = estadoIntegral(b, today, X)
  const F = flujoIntegral(b, periodo(b, "mes", t.getFullYear(), t.getMonth()), today, X)
  const C = compromisos(b, today)
  const cap = capacidad(b, today, C, E.liquidez, fondo ? { activo: fondo.on, saldo: fondo.saldo } : null)
  const r = Math.round
  return {
    mes: k, gasto_mes: sum(a), gasto_mes_anterior: sum(p), por_categoria: a, por_categoria_anterior: p,
    ingreso_mensual: r(C.ingreso), gastos_fijos_mes: r(C.fijos), cuotas_deudas_mes: r(C.cuotas), suscripciones_mes: r(C.subs),
    disponible: r(E.liquidez), fondo_emergencia: base.fondo_emergencia,
    deudas: E.debo.map((d) => ({ nombre: d.n, saldo: r(d.v) })),
    te_deben: r(E.tengo.filter((x) => x.grupo === "me-deben").reduce((s, x) => s + x.v, 0)),
    hormiga_mes: base.hormiga_mes, metas: base.metas.map((m) => ({ nombre: m.nombre, objetivo: +m.objetivo, ahorrado: +m.ahorrado })), categorias: b.categories.map((c) => c.nombre),
    integral: {
      entra: r(F.tot.entra), sale: r(F.tot.sale), ahorro: r(F.tot.ahorro), queda: r(F.tot.queda),
      tengo: r(E.A), debo: r(E.P), patrimonio: r(E.pat),
      deuda_tarjetas: r(E.debo.filter((x) => x.grupo === "tarjetas").reduce((s, x) => s + x.v, 0)), pago_tarjetas_mes: r(C.tarjetas),
      libre_mes: r(cap.libre), colchon_meses: Math.round(cap.meses * 10) / 10,
    },
  }
}

const pesos = (n: number) => formatCOP(n)
const vs = (b: number) => (b ? ` El mes pasado completo fueron ${pesos(b)}.` : "")

/**
 * Respuesta sin IA para preguntas de datos. Devuelve null si la pregunta no es de este tipo (o pide consejo,
 * comparar opciones o planear: eso sí lo hace la IA).
 */
export function quickAnswer(q: string, f: ChatFacts): string | null {
  const n = norm(q).replace(/[¿?¡!.,]/g, " ").replace(/\s+/g, " ").trim()
  // Antes del filtro de decisiones: "debo … tarjeta" se parece a "¿debo sacar una tarjeta?".
  if (/^cuanto (?:debo|le debo) (?:en|de) (?:la |las |mis )?tarjetas?(?: de credito)?$/.test(n) && f.integral)
    return f.integral.deuda_tarjetas ? `En tus tarjetas debes **${pesos(f.integral.deuda_tarjetas)}**. Este mes te toca pagar unos **${pesos(f.integral.pago_tarjetas_mes)}**.` : "No tienes deuda en tarjetas de crédito registrada en Mirai."
  if (n.length > 90 || CONS_RE.test(n) || /\b(deberia|conviene|recomiend|consejo|como (puedo|hago)|por que|estrategia|plan|ayudame a|que hago)\b/.test(n)) return null
  const pasado = /mes pasado|mes anterior/.test(n)
  const cats = pasado ? f.por_categoria_anterior : f.por_categoria

  if (!pasado && (/^(?:cuanto|cual es mi|cuales son mis) (?:es mi |son mis |)(?:gasto hormiga|gastos hormiga|hormiga)/.test(n) || /cuanto (?:llevo|gaste|he gastado) en (?:gastos? )?hormiga/.test(n)))
    return `Este mes llevas **${pesos(f.hormiga_mes)}** en gastos hormiga (pequeños y frecuentes, como tintos, snacks o domicilios).`

  // ¿Cuánto gasté en <categoría>?
  const gasto = n.match(/^cuanto (?:he |hemos |llevo |llevamos |me |)(?:gastado|gaste|gastamos|gasto|va gastado)(?: (.+?))?(?: este mes| el mes pasado| el mes anterior| en el mes)?$/)
  if (gasto) {
    // El período ("el mes pasado", "este mes") puede quedar dentro del grupo: se quita antes de buscar la categoría.
    const want = (gasto[1] ?? "").replace(/\s*\b(?:este mes|el mes pasado|el mes anterior|en el mes)$/, "").replace(/^(en|de) /, "").replace(/^(el|la|los|las) /, "").trim()
    if (/\by\b|\bo\b/.test(want)) return null // varias categorías juntas: mejor la IA
    if (/^(total|todo|este mes|el mes|en total|)$/.test(want)) {
      const t = pasado ? f.gasto_mes_anterior : f.gasto_mes
      return `${pasado ? "El mes pasado gastaste" : "Este mes llevas"} **${pesos(t)}** en gastos.${pasado ? "" : vs(f.gasto_mes_anterior)}`
    }
    const key = [...new Set([...(f.categorias ?? []), ...Object.keys(f.por_categoria), ...Object.keys(f.por_categoria_anterior)])].find((c) => { const cn = norm(c); return cn === want || cn.includes(want) || want.includes(cn) })
    if (key) {
      const v = cats[key] ?? 0
      const prev = f.por_categoria_anterior[key] ?? 0
      return `${pasado ? "El mes pasado gastaste" : "Este mes llevas"} **${pesos(v)}** en ${key}.${pasado ? "" : vs(prev)}`
    }
    return null // categoría que no existe: mejor que la IA lo explique
  }
  if (/^cuanto (?:debo|le debo|debemos)(?: en total| en deudas)?$|^(?:cuanto|cuales) (?:son )?mis deudas$/.test(n)) {
    if (!f.deudas.length) return "No tienes deudas registradas en Mirai. Si tienes alguna, agrégala en **Le debo** para verla aquí."
    const tot = f.deudas.reduce((s, d) => s + d.saldo, 0)
    const top = f.deudas.slice(0, 8)
    return `Debes **${pesos(tot)}** en total:\n${top.map((d) => `- ${d.nombre}: ${pesos(d.saldo)}`).join("\n")}${f.deudas.length > top.length ? `\n- Y ${f.deudas.length - top.length} más (míralas en **Balance**).` : ""}`
  }
  if (/^cual es mi patrimonio$|^cuanto (?:tengo|valgo) en total$|^cuanto es mi patrimonio$/.test(n) && f.integral)
    return `Tienes **${pesos(f.integral.tengo)}** y debes **${pesos(f.integral.debo)}**: tu patrimonio es **${pesos(f.integral.patrimonio)}** (lo mismo que ves en **Balance**).`
  if (/^cuanto me deben$|^quien me debe$/.test(n)) return f.te_deben ? `Te deben **${pesos(f.te_deben)}** en total. El detalle está en **Préstamos › Me deben**.` : "No tienes préstamos por cobrar registrados."
  if (/^cuanto (?:gano|ganamos|me entra|recibo)(?: al mes| mensual)?$|^cual es mi (?:ingreso|salario|sueldo)$/.test(n)) return `Tu ingreso mensual registrado es **${pesos(f.ingreso_mensual)}**.`
  if (/^cuanto (?:pago|pagamos|gasto) en suscripciones$|^cuanto (?:me cuestan|cuestan) (?:mis |las )?suscripciones$/.test(n)) return `Tus suscripciones suman **${pesos(f.suscripciones_mes)}** al mes.`
  if (/^cuanto (?:pago|pagamos) (?:en|de) (?:gastos )?fijos$|^cuanto son (?:mis )?(?:gastos )?fijos$/.test(n)) return `Tus gastos fijos suman **${pesos(f.gastos_fijos_mes)}** al mes y las cuotas de deudas **${pesos(f.cuotas_deudas_mes)}**.`
  if (/^cuanto (?:tengo|dinero tengo|plata tengo)(?: disponible| ahorrado| en total)?$|^cuanta plata tengo$/.test(n)) return `Tienes **${pesos(f.disponible)}** disponibles (cuentas, efectivo e inversiones líquidas)${f.fondo_emergencia ? ` y **${pesos(f.fondo_emergencia)}** en tu fondo de emergencia` : ""}.`
  if (/^cuanto me queda(?: este mes| libre| al mes)?$|^cuanto me sobra(?: al mes| este mes)?$/.test(n) && f.integral) {
    const I = f.integral
    return `Este mes entran **${pesos(I.entra)}**, salen **${pesos(I.sale)}**${I.ahorro ? ` y ahorras **${pesos(I.ahorro)}**` : ""}: ${I.queda >= 0 ? `te sobran **${pesos(I.queda)}**` : `te faltan **${pesos(-I.queda)}**`} (lo mismo que ves en **Balance**, con lo que falta pagar del mes).${I.queda < 0 ? " Revisa en qué puedes frenar o qué pago puedes mover." : ""}`
  }
  if (/^cuanto me queda(?: este mes| libre| al mes)?$|^cuanto me sobra(?: al mes)?$/.test(n)) {
    const libre = f.ingreso_mensual - f.gastos_fijos_mes - f.cuotas_deudas_mes - f.suscripciones_mes - f.gasto_mes
    return `De tu ingreso del mes (${pesos(f.ingreso_mensual)}), después de fijos, cuotas, suscripciones y lo que llevas gastado, te quedan **${pesos(libre)}**.${libre < 0 ? " Vas en rojo: revisa en qué categoría puedes frenar." : ""}`
  }
  if (/^como van (?:mis )?metas$|^cuanto llevo (?:en|de) (?:mis )?metas$/.test(n)) {
    if (!f.metas.length) return "Aún no tienes metas. Crea una en **Metas** y te ayudo a seguirla."
    return f.metas.map((m) => `- **${m.nombre}**: ${pesos(m.ahorrado)} de ${pesos(m.objetivo)} (${Math.round((m.ahorrado / Math.max(1, m.objetivo)) * 100)} %)`).join("\n")
  }
  return null
}

// ── Consejero: interpretar con reglas cuando la frase es clara ──────────────────────────────────────────────────

const TIPO_RE: Record<string, RegExp> = {
  comprar: /\b(comprar|compra|comprarme|adquirir)\b/, tarjeta: /tarjeta de credito|sacar (una )?tarjeta|cupo de/, credito: /\b(credito|prestamo|libranza)\b/,
  prestar: /\b(prestar|prestarle|presto)\b/, fijo: /\b(arriendo|mensualidad|al mes|cada mes|gimnasio|suscrip)/, invertir: /\b(cdt|invertir|inversion)\b/,
  abonar: /\b(abonar|abono|prepagar)\b/, empeno: /empen/,
}

/** ¿La frase se entiende sin IA? Tipo explícito, un solo monto y frase corta. */
export function interpConfiable(t: string): AdvisorInput | null {
  const n = norm(t)
  const montos = moneyIn(t)
  if (n.length > 120 || montos.length !== 1) return null
  const d = localInterp(t)
  if (!TIPO_RE[d.tipo]?.test(n)) return null
  return { ...d, dudas: dudasLocales(d) }
}

/** Preguntas de "faltan datos" generadas con reglas (equivalen a las "dudas" de la IA). */
export function dudasLocales(d: AdvisorInput): string[] {
  const q: string[] = []
  if (d.tipo === "comprar" && d.forma === "cuotas" && !d.tasa) q.push("¿Qué tasa de interés mensual te cobran?")
  if ((d.tipo === "comprar" && d.forma === "cuotas") || d.tipo === "credito") { if (!d.cuotas) q.push("¿A cuántas cuotas sería?") }
  if (d.tipo === "credito" && !d.tasa) q.push("¿Qué tasa de interés te ofrecen (mensual o efectiva anual)?")
  if (d.tipo === "prestar") q.push("¿Cuándo te lo devolvería?")
  if (d.tipo === "tarjeta") q.push("¿Cuánto cobra de cuota de manejo?")
  if (d.tipo === "invertir" && !d.dias) q.push("¿A qué plazo quieres invertir?")
  if (d.tipo === "empeno") q.push("¿En cuánto tiempo crees que puedes recuperarlo?")
  if (d.tipo === "fijo") q.push("¿Desde qué mes empezarías a pagarlo?")
  return q.slice(0, 3)
}

// ── Correo del banco ─────────────────────────────────────────────────────────────────────────────────────────────

/** ¿El correo puede ser una compra? Debe tener un monto y no parecer publicidad ni un abono. */
export function mailMayBePurchase(text: string) {
  const n = norm(text)
  if (!/(\$|cop|pesos)\s?\d|\d{1,3}(?:[.,]\d{3})+/.test(n)) return false
  if (/\b(oferta|promocion|descuento exclusivo|aprobado tu|preaprobado|gana|sorteo|black friday|cyber)\b/.test(n) && !/\b(compra|pago|debito|transaccion|retiro)\b/.test(n)) return false
  if (/\b(recibiste|te consignaron|abono a tu cuenta|transferencia recibida)\b/.test(n) && !/\b(compra|pago|debito)\b/.test(n)) return false
  return true
}

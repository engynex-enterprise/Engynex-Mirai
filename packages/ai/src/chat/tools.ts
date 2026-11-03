import { tool, type ToolSet } from "ai"
import { z } from "zod"
import type { LoadedBook } from "@mirai/domain/book-data"
import { addDays, agenda, deudaTarjeta, fdate, fijoStatus, iso, loanEngine, loanName, localCat, norm, tarjetaPagoMes, toDay, type KeywordRuleIn } from "@mirai/domain"
import { flujoIntegral, periodo as periodoDe, type ExtrasIntegral } from "@mirai/domain/flujo-integral"
import type { AccessRole } from "@mirai/domain/household/roles"
import { armarAbonoMeta, armarCobroSub, armarCompraTarjeta, armarPagoTarjeta, armarPagoCuota, armarPagoFijo, armarPrestamo, fijoDelGasto, type Armado, type Datos } from "./acciones"
import { puedeProponer } from "./permisos"
import type { Propuesta, PropuestaTipo } from "./types"

// Herramientas del chat con IA (tool calling). Las de consulta leen el libro ya cargado (mismos cálculos de lib/domain
// que el Balance y el Dashboard); las de "proponer_…" NO escriben: preparan una tarjeta que la persona confirma
// (features/chat/actions.ts › chatConfirm, que valida y recalcula todo otra vez). Cada herramienta valida su entrada
// con zod y solo se entregan las que el rol puede usar (lib/chat/permisos.ts): "Solo mira" solo consulta y
// "Registra sus gastos" solo propone gastos e ingresos. Sin "server-only" para poder probarlas con Vitest: no toca
// la base ni la IA (la categoría llega con `categorize`, que el servidor arma con features/ai/classify.ts).

const r0 = (v: number) => Math.round(+v || 0)
const isoOk = (s: unknown) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s)

export type Periodo = "este_mes" | "mes_pasado" | "ultimos_30_dias" | "ultimos_90_dias" | "este_ano"

/** Rango [desde, hasta] (YYYY-MM-DD, inclusivo) de un período, relativo a hoy. */
export function rango(p: Periodo, today: string): [string, string] {
  const t = toDay(today)
  const y = t.getFullYear(), m = t.getMonth()
  switch (p) {
    case "mes_pasado": return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))]
    case "ultimos_30_dias": return [iso(addDays(t, -29)), today]
    case "ultimos_90_dias": return [iso(addDays(t, -89)), today]
    case "este_ano": return [`${y}-01-01`, today]
    default: return [iso(new Date(y, m, 1)), today]
  }
}

export type CatSrc = "regla" | "historial" | "palabras" | "ia"
export type Categoria = { id: string | null; nombre: string | null; src: CatSrc | null }

/** Categoría de un gasto sin IA: la que nombró el modelo (si existe), si no regla del usuario → historial → palabras clave. */
export function resolveCategory(b: Pick<LoadedBook, "categories" | "expenses">, rules: KeywordRuleIn[], descripcion: string, nombre?: string | null): Categoria {
  const want = norm(nombre ?? "")
  const byName = want ? b.categories.find((c) => norm(c.nombre) === want) ?? b.categories.find((c) => norm(c.nombre).includes(want) || want.includes(norm(c.nombre))) : undefined
  if (byName) return { id: byName.id, nombre: byName.nombre, src: "ia" }
  const hit = localCat(descripcion, { rules, expenses: b.expenses, categories: b.categories })
  const cat = hit ? b.categories.find((c) => c.id === hit.category_id) : undefined
  return { id: cat?.id ?? null, nombre: cat?.nombre ?? null, src: cat ? hit!.src : null }
}

/** Categoría del gasto que se propone: el servidor la decide con reglas + IA (features/ai/classify.ts). */
export type Categorize = (descripcion: string, valor: number, nombreDelModelo?: string | null) => Promise<Categoria>

export function chatTools(o: {
  b: LoadedBook; today: string; access: AccessRole; rules: () => Promise<KeywordRuleIn[]>
  /** Extras del flujo integral (los mismos del Balance) para la consulta "balance". */
  X?: ExtrasIntegral
  /** Categoría del gasto (reglas + IA). Si no viene, solo reglas. */
  categorize?: Categorize
  onTool: (label: string, name: string) => void; onPropuesta: (p: Propuesta) => void
}): ToolSet {
  const { b, today } = o
  const catName = new Map(b.categories.map((c) => [c.id, c.nombre]))
  const periodo = z.enum(["este_mes", "mes_pasado", "ultimos_30_dias", "ultimos_90_dias", "este_ano"]).optional().describe("Período. Por defecto este_mes.")
  const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("YYYY-MM-DD; por defecto hoy")
  const categorize: Categorize = o.categorize ?? (async (d, _v, n) => resolveCategory(b, await o.rules(), d, n))

  const consultas: ToolSet = {
    gastos: tool({
      description: "Gastos registrados en un período: total, por categoría y los más grandes. Filtra por categoría o por una palabra de la descripción (ej. 'Rappi').",
      inputSchema: z.object({ periodo, categoria: z.string().max(60).optional().describe("Nombre de la categoría"), texto: z.string().max(60).optional().describe("Palabra a buscar en la descripción") }),
      execute: async ({ periodo: p, categoria, texto }) => {
        o.onTool("Revisando tus gastos", "gastos")
        const [desde, hasta] = rango(p ?? "este_mes", today)
        const wc = norm(categoria ?? ""), wt = norm(texto ?? "")
        const list = b.expenses.filter((g) => g.fecha >= desde && g.fecha <= hasta)
          .filter((g) => !wc || norm(catName.get(g.category_id ?? "") ?? "").includes(wc))
          .filter((g) => !wt || norm(g.descripcion).includes(wt))
        const by = new Map<string, { total: number; veces: number }>()
        for (const g of list) { const k = catName.get(g.category_id ?? "") ?? "Sin categoría"; const x = by.get(k) ?? { total: 0, veces: 0 }; x.total += +g.valor; x.veces++; by.set(k, x) }
        return {
          desde, hasta, total: r0(list.reduce((s, g) => s + +g.valor, 0)), movimientos: list.length,
          por_categoria: [...by.entries()].sort((a, c) => c[1].total - a[1].total).slice(0, 10).map(([k, v]) => ({ categoria: k, total: r0(v.total), veces: v.veces })),
          mas_grandes: [...list].sort((a, c) => +c.valor - +a.valor).slice(0, 6).map((g) => ({ fecha: g.fecha, descripcion: g.descripcion.slice(0, 60), valor: r0(+g.valor), categoria: catName.get(g.category_id ?? "") ?? null })),
        }
      },
    }),
    balance: tool({
      description: "Lo que entra, sale, ahorras y te queda en un período (las mismas cifras del Balance), por módulo: ingresos, gastos, fijos, suscripciones, tarjetas, deudas, impuestos, metas.",
      inputSchema: z.object({ periodo: z.enum(["este_mes", "mes_pasado", "este_ano"]).optional().describe("Por defecto este_mes") }),
      execute: async ({ periodo: p }) => {
        o.onTool("Revisando tu balance", "balance")
        const t = toDay(today)
        const P = p === "este_ano" ? periodoDe(b, "anio", t.getFullYear()) : p === "mes_pasado" ? periodoDe(b, "mes", t.getMonth() ? t.getFullYear() : t.getFullYear() - 1, (t.getMonth() + 11) % 12) : periodoDe(b, "mes", t.getFullYear(), t.getMonth())
        const F = flujoIntegral(b, P, today, o.X ?? {})
        return {
          desde: F.a, hasta: F.b, entra: r0(F.tot.entra), sale: r0(F.tot.sale), ahorras: r0(F.tot.ahorro), te_queda: r0(F.tot.queda),
          por_pagar: r0(F.tot.pendienteSale), por_recibir: r0(F.tot.pendienteEntra), atrasado: r0(F.tot.vencidoSale), intereses: r0(F.tot.intereses),
          por_modulo: F.porModulo.filter((g) => g.modulo !== "presupuesto").map((g) => ({ modulo: g.label, entra: r0(g.entra), sale: r0(g.sale) })),
          en_que_se_va: F.porCategoria.slice(0, 8).map((c) => ({ categoria: c.cat, valor: r0(c.v) })),
        }
      },
    }),
    ingresos: tool({
      description: "Ingresos fijos (sueldo, pensión, arriendos…) con su frecuencia y los ingresos extra de un período.",
      inputSchema: z.object({ periodo }),
      execute: async ({ periodo: p }) => {
        o.onTool("Revisando tus ingresos", "ingresos")
        const [desde, hasta] = rango(p ?? "este_mes", today)
        const ex = b.extraIncomes.filter((x) => x.fecha >= desde && x.fecha <= hasta)
        return {
          fijos: b.incomes.map((x) => ({ concepto: (x as { concepto?: string }).concepto ?? "Ingreso", valor_por_pago: r0(+x.valor), frecuencia: x.frec, dia: x.dia })),
          extra: { desde, hasta, total: r0(ex.reduce((a, x) => a + +x.valor, 0)), lista: ex.slice(0, 10).map((x) => ({ fecha: x.fecha, descripcion: x.descripcion.slice(0, 60), valor: r0(+x.valor) })) },
        }
      },
    }),
    fijos_y_suscripciones: tool({
      description: "Gastos fijos (arriendo, servicios…) con su próximo pago o lo vencido, y suscripciones con su próximo cobro.",
      inputSchema: z.object({}),
      execute: async () => {
        o.onTool("Revisando tus gastos fijos", "fijos_y_suscripciones")
        return {
          fijos: b.fixedExpenses.map((f) => { const st = fijoStatus(f, today); const per = st.venc[0] ?? st.prox; return { nombre: f.nombre, valor: r0(+f.valor), frecuencia: f.frec, proximo_pago: per?.due ?? null, vencidos: st.venc.length, es_aporte_a_ahorro: !!f.link_type } }),
          suscripciones: b.subscriptions.map((s) => ({ nombre: s.nombre, valor: r0(+s.valor), ciclo: s.ciclo, proximo_cobro: s.proximo, moneda: s.currency ?? "COP" })),
        }
      },
    }),
    tarjetas: tool({
      description: "Tarjetas de crédito: deuda actual, pago de este mes y del próximo, cupo, tasa mensual y días de corte y de pago.",
      inputSchema: z.object({}),
      execute: async () => {
        o.onTool("Revisando tus tarjetas", "tarjetas")
        if (!b.creditCards.length) return { tarjetas: [], nota: "No tiene tarjetas registradas en Mirai." }
        return {
          tarjetas: b.creditCards.map((c) => {
            // Deuda real: compras menos los pagos a la tarjeta (card_payments), igual que Tarjetas y el Balance.
            const deuda = deudaTarjeta(c, today)
            return { nombre: c.nombre, deuda: r0(deuda), pago_este_mes: r0(tarjetaPagoMes(c, today)), pago_proximo_mes: r0(tarjetaPagoMes(c, today, 1)), cupo: r0(c.cupo ?? 0), disponible: c.cupo ? r0(Math.max(0, c.cupo - deuda)) : null, tasa_mensual_pct: +c.tasa || 0, dia_corte: c.corte, dia_pago: c.pago }
          }),
        }
      },
    }),
    deudas: tool({
      description: "Deudas y préstamos que la persona debe (Le debo) y lo que le deben (Me deben): saldo, cuota, tasa, próxima fecha y cuotas atrasadas.",
      inputSchema: z.object({}),
      execute: async () => {
        o.onTool("Revisando tus deudas", "deudas")
        const row = (L: LoadedBook["loans"][number]) => { const e = loanEngine(L, today); return { nombre: loanName(L, b.contacts, b.entities), concepto: L.concepto || null, saldo: r0(e.saldo), cuota: r0(e.next?.valor ?? 0), proxima_fecha: e.next?.fecha ?? null, cuotas_vencidas: e.vencidas.length, tasa_mensual_pct: +L.tasa || 0 } }
        return { debo: b.loans.filter((L) => L.kind === "pagar").map(row), me_deben: b.loans.filter((L) => L.kind === "cobrar").map(row) }
      },
    }),
    metas: tool({
      description: "Metas de ahorro: objetivo, ahorrado, cuánto falta, fecha límite y cuánto ahorrar al mes para llegar.",
      inputSchema: z.object({}),
      execute: async () => {
        o.onTool("Revisando tus metas", "metas")
        const t = toDay(today)
        return {
          metas: b.goals.map((g) => {
            const falta = Math.max(0, +g.objetivo - +g.ahorrado)
            const meses = g.fecha ? Math.max(1, (toDay(g.fecha).getFullYear() - t.getFullYear()) * 12 + toDay(g.fecha).getMonth() - t.getMonth()) : null
            return { nombre: g.nombre, objetivo: r0(+g.objetivo), ahorrado: r0(+g.ahorrado), falta: r0(falta), avance_pct: Math.round((+g.ahorrado / Math.max(1, +g.objetivo)) * 100), fecha: g.fecha, ahorro_mensual_sugerido: meses ? r0(falta / meses) : null }
          }),
        }
      },
    }),
    proximos_pagos: tool({
      description: "Pagos y cobros próximos o vencidos: gastos fijos, cuotas de deudas, tarjetas, suscripciones y fechas del calendario.",
      inputSchema: z.object({ dias: z.number().int().min(1).max(60).optional().describe("Cuántos días hacia adelante (por defecto 15)") }),
      execute: async ({ dias }) => {
        o.onTool("Revisando tus próximos pagos", "proximos_pagos")
        const lim = dias ?? 15
        return { hoy: today, pagos: agenda(b, today).filter((a) => a.d <= lim).slice(0, 20).map((a) => ({ fecha: a.fecha, cuando: a.lbl, que: a.titulo, tipo: a.sub, monto: r0(a.monto), direccion: a.dir === "cobrar" ? "te pagan" : "pagas", vencido: a.d < 0 })) }
      },
    }),
  }

  const listo = { listo: true, nota: "La persona verá una tarjeta con Confirmar y Cancelar. Dile que revise los datos y confirme; no digas que ya quedó guardado." }
  const propose = (tipo: PropuestaTipo, datos: Datos) => { o.onPropuesta({ id: crypto.randomUUID(), estado: "pendiente", tipo, datos }); return listo }
  const desde = (tipo: PropuestaTipo, a: Armado) => (a.ok ? propose(tipo, a.datos) : { listo: false, pregunta: a.msg, nota: "Hazle esta pregunta a la persona con tus palabras." })
  const fechaOk = (f?: string) => (f && isoOk(f) ? f : today)
  const all: Partial<Record<PropuestaTipo, ToolSet>> = {
    gasto: {
      proponer_gasto: tool({
        description: "Prepara el registro de un gasto del día a día (la persona lo confirma). Úsala cuando pida anotar un gasto o una compra en efectivo, débito o transferencia. Si fue con tarjeta de crédito usa proponer_compra_tarjeta; si es el pago de un gasto fijo, proponer_pago_fijo.",
        inputSchema: z.object({ valor: z.number().positive().max(1e11).describe("Valor en pesos"), descripcion: z.string().trim().min(1).max(80), fecha, categoria: z.string().max(60).optional().describe("Nombre exacto de una categoría existente") }),
        execute: async (i) => {
          // Si es el pago de un gasto fijo pendiente ("la luz", "el arriendo"), se registra como pago del fijo para no contarlo dos veces.
          const f = puedeProponer(o.access, "pago_fijo") ? fijoDelGasto(b, today, i.descripcion) : undefined
          if (f) return desde("pago_fijo", armarPagoFijo(b, today, { ref: f.nombre, valor: i.valor, fecha: i.fecha }, f))
          const cat = await categorize(i.descripcion.trim(), r0(i.valor), i.categoria)
          return propose("gasto", { valor: r0(i.valor), descripcion: i.descripcion.trim(), fecha: fechaOk(i.fecha), category_id: cat.id, categoria: cat.nombre, cat_src: cat.src })
        },
      }),
    },
    ingreso: {
      proponer_ingreso: tool({
        description: "Prepara el registro de un ingreso extra de una sola vez (bono, venta, trabajo, regalo). La persona lo confirma.",
        inputSchema: z.object({ valor: z.number().positive().max(1e11), descripcion: z.string().trim().min(1).max(80), fecha }),
        execute: async (i) => propose("ingreso", { valor: r0(i.valor), descripcion: i.descripcion.trim(), fecha: fechaOk(i.fecha) }),
      }),
    },
    ingreso_fijo: {
      proponer_ingreso_fijo: tool({
        description: "Prepara un ingreso que se repite (sueldo, pensión, arriendo que te pagan, honorarios fijos). 'valor' es lo que llega en CADA pago.",
        inputSchema: z.object({ concepto: z.string().trim().min(1).max(60), valor: z.number().positive().max(1e11).describe("Lo que recibe en cada pago"), frecuencia: z.enum(["mensual", "quincenal", "semanal"]), dia: z.number().int().min(1).max(31).optional().describe("Día del mes del pago (mensual) o del primer pago (quincenal)") }),
        execute: async (i) => propose("ingreso_fijo", { descripcion: i.concepto, valor: r0(i.valor), frec: i.frecuencia, dia: i.dia ?? (i.frecuencia === "quincenal" ? 15 : 30) }),
      }),
    },
    fijo: {
      proponer_gasto_fijo: tool({
        description: "Prepara un gasto fijo NUEVO que se repite (arriendo, servicios, colegio, administración). Para registrar que ya pagaste uno existente usa proponer_pago_fijo.",
        inputSchema: z.object({ nombre: z.string().trim().min(1).max(60), valor: z.number().positive().max(1e11), frecuencia: z.enum(["mensual", "quincenal", "bimestral", "trimestral", "semestral", "anual"]), dia: z.number().int().min(1).max(31).describe("Día de pago"), categoria: z.string().max(60).optional() }),
        execute: async (i) => {
          const cat = await categorize(i.nombre, r0(i.valor), i.categoria)
          return propose("fijo", { nombre: i.nombre, valor: r0(i.valor), frec: i.frecuencia, dia: i.dia, category_id: cat.id, categoria: cat.nombre })
        },
      }),
    },
    pago_fijo: {
      proponer_pago_fijo: tool({
        description: "Prepara el pago de un gasto fijo que ya existe (\"pagué el arriendo\", \"pagué la luz\"): marca el periodo pendiente como pagado y crea el gasto.",
        inputSchema: z.object({ gasto_fijo: z.string().trim().min(1).max(60).describe("Nombre del gasto fijo"), valor: z.number().positive().max(1e11).optional().describe("Lo que pagó, si lo dijo"), fecha }),
        execute: async (i) => desde("pago_fijo", armarPagoFijo(b, today, { ref: i.gasto_fijo, valor: i.valor, fecha: i.fecha })),
      }),
    },
    suscripcion: {
      proponer_suscripcion: tool({
        description: "Prepara una suscripción NUEVA (Netflix, Spotify, gimnasio, nube): valor, ciclo y fecha del próximo cobro.",
        inputSchema: z.object({ nombre: z.string().trim().min(1).max(60), valor: z.number().positive().max(1e10), ciclo: z.enum(["mensual", "anual"]), proximo_cobro: fecha }),
        execute: async (i) => propose("suscripcion", { nombre: i.nombre, valor: r0(i.valor), ciclo: i.ciclo, proximo: i.proximo_cobro && isoOk(i.proximo_cobro) && i.proximo_cobro >= today ? i.proximo_cobro : today }),
      }),
    },
    cobro_suscripcion: {
      proponer_cobro_suscripcion: tool({
        description: "Prepara el cobro de una suscripción que ya existe (\"ya se cobró Netflix\"): crea el gasto y pasa el próximo cobro al siguiente ciclo.",
        inputSchema: z.object({ suscripcion: z.string().trim().min(1).max(60), valor: z.number().positive().max(1e10).optional() }),
        execute: async (i) => desde("cobro_suscripcion", armarCobroSub(b, today, { ref: i.suscripcion, valor: i.valor })),
      }),
    },
    compra_tarjeta: {
      proponer_compra_tarjeta: tool({
        description: "Prepara una compra con TARJETA DE CRÉDITO (a una o varias cuotas). La deuda de la tarjeta sube y el gasto queda en su categoría.",
        inputSchema: z.object({ tarjeta: z.string().max(60).optional().describe("Nombre de la tarjeta; vacío si solo tiene una"), descripcion: z.string().trim().min(1).max(80), valor: z.number().positive().max(1e11), cuotas: z.number().int().min(1).max(48).optional(), fecha, categoria: z.string().max(60).optional() }),
        execute: async (i) => {
          const a = armarCompraTarjeta(b, today, { ref: i.tarjeta, valor: i.valor, descripcion: i.descripcion, cuotas: i.cuotas, fecha: i.fecha })
          if (!a.ok) return desde("compra_tarjeta", a)
          const cat = await categorize(i.descripcion, r0(i.valor), i.categoria)
          return propose("compra_tarjeta", { ...a.datos, category_id: cat.id, categoria: cat.nombre, cat_src: cat.src })
        },
      }),
    },
    pago_tarjeta: {
      proponer_pago_tarjeta: tool({
        description: "Prepara el PAGO de una tarjeta de crédito (el pago del mes, el total o otro valor). Baja la deuda de la tarjeta.",
        inputSchema: z.object({ tarjeta: z.string().max(60).optional().describe("Nombre de la tarjeta; vacío si solo tiene una"), valor: z.number().positive().max(1e11).optional().describe("Lo que pagó; vacío = el pago del mes"), total: z.boolean().optional().describe("true si pagó toda la deuda"), fecha }),
        execute: async (i) => desde("pago_tarjeta", armarPagoTarjeta(b, today, { ref: i.tarjeta, valor: i.valor, total: i.total, fecha: i.fecha })),
      }),
    },
    prestamo: {
      proponer_prestamo: tool({
        description: "Prepara una deuda nueva (Le debo: te prestaron, un crédito, un fiado, una compra a cuotas) o un préstamo que hiciste (Me deben). Con cuotas, frecuencia e interés si los dijo.",
        inputSchema: z.object({
          direccion: z.enum(["le_debo", "me_deben"]), persona: z.string().trim().min(1).max(80).describe("A quién le prestó o quién le prestó (persona, banco o tienda)"),
          valor: z.number().positive().max(1e11), cuotas: z.number().int().min(1).max(600).optional(), frecuencia: z.enum(["mensual", "quincenal", "semanal", "diario"]).optional(),
          tasa_mensual_pct: z.number().min(0).max(30).optional().describe("Interés mensual en %, si lo dijo"), fecha, concepto: z.string().max(80).optional(),
          clase: z.enum(["banco", "empeno", "fiado", "persona", "cuotas", "gota", "presto", "vendi", "otro"]).optional().describe("Tipo de deuda si es claro"),
        }),
        execute: async (i) => desde("prestamo", armarPrestamo(b, today, { kind: i.direccion === "me_deben" ? "cobrar" : "pagar", valor: i.valor, persona: i.persona, plazo: i.cuotas, frec: i.frecuencia, tasa: i.tasa_mensual_pct, fecha: i.fecha, concepto: i.concepto, tipo: i.clase })),
      }),
    },
    pago_cuota: {
      proponer_pago_cuota: tool({
        description: "Prepara el pago de una cuota o un abono de una deuda (Le debo) o lo que te pagó alguien que te debe (Me deben). Sin valor = la cuota del plan.",
        inputSchema: z.object({ direccion: z.enum(["le_debo", "me_deben"]), deuda: z.string().trim().max(80).describe("Nombre de la deuda, del banco o de la persona"), cuotas: z.number().int().min(1).max(24).optional(), valor: z.number().positive().max(1e11).optional().describe("Solo si dijo un valor distinto a la cuota"), fecha }),
        execute: async (i) => desde("pago_cuota", armarPagoCuota(b, today, { kind: i.direccion === "me_deben" ? "cobrar" : "pagar", ref: i.deuda, cuotas: i.cuotas, valor: i.valor, fecha: i.fecha })),
      }),
    },
    meta: {
      proponer_meta: tool({
        description: "Prepara una meta de ahorro nueva (nombre, cuánto quiere juntar y para cuándo). La persona la confirma.",
        inputSchema: z.object({ nombre: z.string().trim().min(1).max(60), objetivo: z.number().positive().max(1e12), fecha, ahorrado: z.number().min(0).max(1e12).optional() }),
        execute: async (i) => propose("meta", { nombre: i.nombre, objetivo: r0(i.objetivo), ahorrado: r0(i.ahorrado ?? 0), fecha: i.fecha && isoOk(i.fecha) ? i.fecha : undefined }),
      }),
    },
    abono_meta: {
      proponer_abono_meta: tool({
        description: "Prepara un abono a una meta de ahorro que ya existe (\"guardé 100 mil para el viaje\").",
        inputSchema: z.object({ meta: z.string().max(60).optional().describe("Nombre de la meta; vacío si solo tiene una"), valor: z.number().positive().max(1e11), fecha }),
        execute: async (i) => desde("abono_meta", armarAbonoMeta(b, today, { ref: i.meta, valor: i.valor, fecha: i.fecha })),
      }),
    },
    recordatorio: {
      proponer_recordatorio: tool({
        description: "Prepara un recordatorio de pago en una fecha (aparece en Próximos pagos). La persona lo confirma.",
        inputSchema: z.object({ titulo: z.string().trim().min(1).max(80), fecha: z.string().describe("YYYY-MM-DD"), monto: z.number().min(0).max(1e11).optional() }),
        execute: async (i) => {
          if (!isoOk(i.fecha) || i.fecha < today) return { listo: false, error: `La fecha debe ser YYYY-MM-DD desde hoy (${fdate(toDay(today))}). Pregúntale la fecha.` }
          return propose("recordatorio", { titulo: i.titulo, fecha: i.fecha, monto: r0(i.monto ?? 0) })
        },
      }),
    },
  }
  const propias = Object.entries(all).filter(([t]) => puedeProponer(o.access, t as PropuestaTipo)).map(([, set]) => set)
  return Object.assign({}, consultas, ...propias)
}

/** Nombres de las herramientas de proponer que recibe un rol (para pruebas y el prompt). */
export const herramientasDe = (t: ToolSet) => Object.keys(t).filter((k) => k.startsWith("proponer_"))

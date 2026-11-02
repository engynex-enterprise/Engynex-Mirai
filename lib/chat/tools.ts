import "server-only"
import { tool, type ToolSet } from "ai"
import { z } from "zod"
import type { LoadedBook } from "@/lib/book-data"
import { addDays, agenda, compraEstado, fdate, iso, loanEngine, loanName, localCat, norm, tarjetaPagoMes, toDay, type KeywordRuleIn } from "@/lib/domain"
import type { Propuesta } from "./types"

// Herramientas del chat con IA (tool calling). Las de consulta leen el libro ya cargado (mismos cálculos de lib/domain);
// las de "proponer" NO escriben: preparan una tarjeta que la persona confirma (features/chat/actions.ts › chatConfirm).
// Solo se entregan las de proponer si el rol puede escribir (owner/editor).

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

/** Categoría de un gasto: la que diga la IA (si existe), si no regla del usuario → historial → palabras clave. */
export function resolveCategory(b: LoadedBook, rules: KeywordRuleIn[], descripcion: string, nombre?: string | null): { id: string | null; nombre: string | null } {
  const want = norm(nombre ?? "")
  const byName = want ? b.categories.find((c) => norm(c.nombre) === want) ?? b.categories.find((c) => norm(c.nombre).includes(want) || want.includes(norm(c.nombre))) : undefined
  const hit = byName ? { category_id: byName.id } : localCat(descripcion, { rules, expenses: b.expenses, categories: b.categories })
  const cat = hit ? b.categories.find((c) => c.id === hit.category_id) : undefined
  return { id: cat?.id ?? null, nombre: cat?.nombre ?? null }
}

export function chatTools(o: {
  b: LoadedBook; today: string; canEdit: boolean; rules: () => Promise<KeywordRuleIn[]>
  onTool: (label: string, name: string) => void; onPropuesta: (p: Propuesta) => void
}): ToolSet {
  const { b, today } = o
  const catName = new Map(b.categories.map((c) => [c.id, c.nombre]))
  const periodo = z.enum(["este_mes", "mes_pasado", "ultimos_30_dias", "ultimos_90_dias", "este_ano"]).optional().describe("Período. Por defecto este_mes.")

  const consultas: ToolSet = {
    gastos: tool({
      description: "Gastos registrados en un período: total, por categoría y los más grandes. Filtra por categoría o por una palabra de la descripción (ej. 'Rappi').",
      inputSchema: z.object({ periodo, categoria: z.string().optional().describe("Nombre de la categoría"), texto: z.string().optional().describe("Palabra a buscar en la descripción") }),
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
    tarjetas: tool({
      description: "Tarjetas de crédito: deuda actual, pago de este mes y del próximo, cupo, tasa mensual y días de corte y de pago.",
      inputSchema: z.object({}),
      execute: async () => {
        o.onTool("Revisando tus tarjetas", "tarjetas")
        if (!b.creditCards.length) return { tarjetas: [], nota: "No tiene tarjetas registradas en Mirai." }
        return {
          tarjetas: b.creditCards.map((c) => {
            const deuda = (c.purchases ?? []).reduce((s, x) => s + compraEstado(c, x, today).saldo, 0)
            return { nombre: c.nombre, deuda: r0(deuda), pago_este_mes: r0(tarjetaPagoMes(c, today)), pago_proximo_mes: r0(tarjetaPagoMes(c, today, 1)), cupo: r0(c.cupo ?? 0), disponible: c.cupo ? r0(Math.max(0, c.cupo - deuda)) : null, tasa_mensual_pct: +c.tasa || 0, dia_corte: c.corte, dia_pago: c.pago }
          }),
        }
      },
    }),
    deudas: tool({
      description: "Deudas y préstamos que la persona debe (y lo que le deben): saldo, cuota, tasa y próxima fecha de pago.",
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
  if (!o.canEdit) return consultas

  const listo = { listo: true, nota: "La persona verá una tarjeta con Confirmar y Cancelar. Dile que revise los datos y confirme; no digas que ya quedó guardado." }
  const propose = (p: Omit<Propuesta, "id" | "estado">) => { o.onPropuesta({ id: crypto.randomUUID(), estado: "pendiente", ...p }); return listo }
  return {
    ...consultas,
    proponer_gasto: tool({
      description: "Prepara el registro de un gasto (la persona lo confirma). Úsala cuando pida anotar o registrar un gasto o una compra.",
      inputSchema: z.object({ valor: z.number().positive().describe("Valor en pesos"), descripcion: z.string().min(1).max(80), fecha: z.string().optional().describe("YYYY-MM-DD; por defecto hoy"), categoria: z.string().optional().describe("Nombre exacto de una categoría existente") }),
      execute: async (i) => {
        const cat = resolveCategory(b, await o.rules(), i.descripcion, i.categoria)
        return propose({ tipo: "gasto", datos: { valor: r0(i.valor), descripcion: i.descripcion.trim(), fecha: isoOk(i.fecha) ? i.fecha : today, category_id: cat.id, categoria: cat.nombre } })
      },
    }),
    proponer_ingreso: tool({
      description: "Prepara el registro de un ingreso extra de una sola vez (bono, venta, trabajo). La persona lo confirma.",
      inputSchema: z.object({ valor: z.number().positive(), descripcion: z.string().min(1).max(80), fecha: z.string().optional().describe("YYYY-MM-DD; por defecto hoy") }),
      execute: async (i) => propose({ tipo: "ingreso", datos: { valor: r0(i.valor), descripcion: i.descripcion.trim(), fecha: isoOk(i.fecha) ? i.fecha : today } }),
    }),
    proponer_meta: tool({
      description: "Prepara una meta de ahorro nueva (nombre, cuánto quiere juntar y para cuándo). La persona la confirma.",
      inputSchema: z.object({ nombre: z.string().min(1).max(60), objetivo: z.number().positive(), fecha: z.string().optional().describe("YYYY-MM-DD"), ahorrado: z.number().min(0).optional() }),
      execute: async (i) => propose({ tipo: "meta", datos: { nombre: i.nombre.trim(), objetivo: r0(i.objetivo), ahorrado: r0(i.ahorrado ?? 0), fecha: isoOk(i.fecha) ? i.fecha : undefined } }),
    }),
    proponer_recordatorio: tool({
      description: "Prepara un recordatorio de pago en una fecha (aparece en Próximos pagos). La persona lo confirma.",
      inputSchema: z.object({ titulo: z.string().min(1).max(80), fecha: z.string().describe("YYYY-MM-DD"), monto: z.number().min(0).optional() }),
      execute: async (i) => {
        if (!isoOk(i.fecha) || i.fecha < today) return { listo: false, error: `La fecha debe ser YYYY-MM-DD desde hoy (${fdate(toDay(today))}). Pregúntale la fecha.` }
        return propose({ tipo: "recordatorio", datos: { titulo: i.titulo.trim(), fecha: i.fecha, monto: r0(i.monto ?? 0) } })
      },
    }),
  }
}

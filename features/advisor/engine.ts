import "server-only"
import { z } from "zod"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { AppContext } from "@/lib/dal"
import type { Database } from "@/lib/supabase/database.types"
import type { LoadedBook } from "@/lib/book-data"
import { aiObject, AiUnavailable, logAlgorithm, tokensFor } from "@/lib/ai/run"
import { interpConfiable } from "@/lib/ai/router"
import { toLines } from "@/lib/ai/compact"
import { ATIPOS, asAnalyze, completeInterp, localInterp, todayBogota, type AdvisorInput, type Atipo } from "@/lib/domain"
import type { AiVerdict, Consulta } from "@/lib/chat/types"

// Consejero antes de gastar, ahora dentro del chat (sin formulario): entiende la frase, analiza con los cálculos de
// lib/domain (asAnalyze) y, si hay IA, agrega su concepto. Lo usa app/api/chat. Cada análisis se guarda también en
// advisor_consultations (historial del consejero de la v4).

const TIPOS = Object.keys(ATIPOS) as [Atipo, ...Atipo[]]
const n = z.number().nullable().optional()

const InterpSchema = z.object({
  tipo: z.enum(TIPOS), desc: z.string(), valor: n, forma: z.enum(["contado", "cuotas"]).nullable().optional(), cuotas: n,
  tasa_mensual: n, tasa_ea: n, cuota: n, cuota_manejo: n, uso_mensual: n, pago_tarjeta: z.enum(["total", "cuotas"]).nullable().optional(),
  seguros: n, plazo_dias: n, reemplaza: n, persona: z.string().nullable().optional(), dudas: z.array(z.string()).optional(),
})

const VerdictSchema = z.object({
  veredicto: z.enum(["si", "con_cuidado", "no"]), titular: z.string(), explicacion: z.string(),
  razones: z.array(z.string()), alternativas: z.array(z.string()), plan: z.array(z.string()), pregunta: z.string(),
  tecnico: z.object({ resumen: z.string(), indicadores: z.array(z.object({ nombre: z.string(), valor: z.string(), lectura: z.enum(["sano", "alerta", "riesgo"]) })), recomendacion: z.string() }),
}) satisfies z.ZodType<AiVerdict>

type Ctx = Pick<AppContext, "household" | "book" | "user">
const who = (ctx: Ctx) => ({ householdId: ctx.household.id, bookId: ctx.book.id, userId: ctx.user.id })

/** Entiende la frase: si es clara (tipo y un solo monto) basta con reglas; si no y hay IA, la IA; sin IA, reglas. */
export async function interpretText(ctx: Ctx, text: string, useAi: boolean): Promise<{ d: AdvisorInput; src: "ia" | "local" }> {
  const t = text.trim().slice(0, 600)
  const sure = interpConfiable(t)
  if (sure) {
    await logAlgorithm({ ...who(ctx), feature: "consejero_interpretar", evitados: tokensFor("consejero_interpretar", t) })
    return { d: completeInterp(sure, t), src: "local" }
  }
  if (useAi) {
    try {
      const { object: r } = await aiObject({ ...who(ctx), feature: "consejero_interpretar", schema: InterpSchema, prompt: `FRASE: "${t}"` })
      const d: AdvisorInput = {
        tipo: r.tipo, desc: r.desc, valor: r.valor ?? "", forma: r.forma ?? undefined, cuotas: r.cuotas ?? "", tasa: r.tasa_mensual ?? undefined,
        cuotaV: r.cuota ?? undefined, manejo: r.cuota_manejo ?? undefined, uso: r.uso_mensual ?? undefined, pagoModo: r.pago_tarjeta ?? "total",
        seguros: r.seguros ?? undefined, dias: r.plazo_dias ?? undefined, reemplaza: r.reemplaza ?? undefined, persona: r.persona ?? undefined, dudas: (r.dudas ?? []).slice(0, 3),
      }
      if (d.cuotaV && !d.tasa) d.modoInt = "cuota"
      return { d: completeInterp(d, t, r.tasa_ea), src: "ia" }
    } catch { /* sigue con reglas */ }
  }
  return { d: completeInterp(localInterp(t), t), src: "local" }
}

/** Análisis con reglas (+ concepto de la IA si se puede) y se guarda en advisor_consultations. */
export async function analyzeInput(ctx: Ctx, sb: SupabaseClient<Database>, book: LoadedBook, d: AdvisorInput, txt: string, useAi: boolean): Promise<Consulta> {
  const today = todayBogota()
  const { data: cfg } = await sb.from("book_settings").select("estricto,usura").eq("book_id", ctx.book.id).single()
  const usura = +(cfg?.usura ?? 26)
  if (!d.desc?.trim()) d.desc = (ATIPOS[d.tipo]?.l ?? "Decisión").slice(0, 80)
  const an = asAnalyze(book, d, { estricto: cfg?.estricto, usura }, today)
  const m = an.m
  let ai: AiVerdict | null = null, aiErr: string | null = null, provider: string | undefined, creditos = 0
  if (!useAi) aiErr = "Análisis con tus números (sin IA)."
  else {
    const data = {
      quiere: ATIPOS[d.tipo].l, descripcion: d.desc, texto_original: txt,
      detalles: Object.fromEntries(Object.entries(d).filter(([k, v]) => v !== "" && v != null && k !== "dudas" && !/Id$/.test(k))),
      calculos: { cuota_mensual: Math.round(m.cuota), intereses_totales: Math.round(m.intereses), tasa_efectiva_anual_pct: +(m.ea * 100).toFixed(1), ...Object.fromEntries(Object.entries(an.X ?? {}).map(([k, v]) => [k, Math.round(v)])) },
      finanzas: { ingreso_mensual: Math.round(m.ing), gastos_fijos_mes: Math.round(m.fij), cuotas_deudas_mes: Math.round(m.cuo), suscripciones_mes: Math.round(m.subs), gasto_variable_mes: Math.round(m.varr), libre_mes_antes: Math.round(m.libre), libre_mes_despues: Math.round(m.libreD), deudas_sobre_ingreso_despues_pct: +(m.ratioD * 100).toFixed(1), disponible_hoy: Math.round(m.liq), disponible_despues: Math.round(m.liqD), meses_colchon_antes: +m.emergA.toFixed(1), meses_colchon_despues: +m.emergD.toFixed(1) },
      veredicto_reglas: an.v, observaciones: an.R,
    }
    try {
      const r = await aiObject({ ...who(ctx), feature: "consejero_analizar", schema: VerdictSchema, prompt: `DATOS:\n${toLines(data as never, { exact: true })}` })
      ai = r.object; provider = r.provider; creditos = r.creditos
    } catch (e) { aiErr = e instanceof AiUnavailable ? e.message : "No pudimos consultar la IA; ves el análisis automático con tus números." }
  }
  const v = ai ? (ai.veredicto === "si" ? "si" : ai.veredicto === "no" ? "no" : "cuidado") : an.v
  const payload = { d, txt, R: an.R, m, X: an.X ?? {}, ai, aiErr, provider }
  const { data: row } = await sb.from("advisor_consultations").insert({
    book_id: ctx.book.id, fecha: today, tipo: d.tipo, descripcion: (d.desc || ATIPOS[d.tipo].l).slice(0, 120), valor: +(d.valor ?? 0) || 0,
    contact_id: d.contactoId || null, veredicto: v, payload: payload as never,
  }).select("id").single()
  // Sin cuentas ni inversiones registradas, "disponible" y "colchón" no son un dato real (la tarjeta lo explica).
  const datos = { cuentas: book.assets.some((a) => +a.valor > 0) || book.investments.length > 0, ingresos: m.ing > 0 }
  return { id: row?.id ?? crypto.randomUUID(), fecha: today, v, usura, datos, creditos, ...payload }
}

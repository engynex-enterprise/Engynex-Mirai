"use server"

import { z } from "zod"
import { requireRole } from "@/lib/dal"
import { supabaseServer } from "@/utils/supabase/server"
import { loadBookData } from "@/lib/book-data"
import { aiObject, AiUnavailable, logAlgorithm, tokensFor } from "@/lib/ai/run"
import { interpConfiable } from "@/lib/ai/router"
import { toLines } from "@/lib/ai/compact"
import { aiSettings } from "@/lib/ai/model"
import { ATIPOS, asAnalyze, completeInterp, localInterp, todayBogota, type AdvisorInput, type Analisis, type Atipo } from "@/lib/domain"

const TIPOS = Object.keys(ATIPOS) as [Atipo, ...Atipo[]]
const n = z.number().nullable().optional()

const InterpSchema = z.object({
  tipo: z.enum(TIPOS), desc: z.string(), valor: n, forma: z.enum(["contado", "cuotas"]).nullable().optional(), cuotas: n,
  tasa_mensual: n, tasa_ea: n, cuota: n, cuota_manejo: n, uso_mensual: n, pago_tarjeta: z.enum(["total", "cuotas"]).nullable().optional(),
  seguros: n, plazo_dias: n, reemplaza: n, persona: z.string().nullable().optional(), dudas: z.array(z.string()).optional(),
})

/** Paso 1: entiende la frase. Si es clara (tipo y un solo monto) basta con reglas; si no, IA; sin IA, reglas. */
export async function interpretDecision(text: string): Promise<{ d: AdvisorInput; src: "ia" | "local" }> {
  const ctx = await requireRole("viewer")
  const t = text.trim().slice(0, 600)
  const ia = await aiSettings(ctx.book.id)
  if (ia.on !== false && ia.consejero !== false) {
    const sure = interpConfiable(t)
    if (sure) {
      await logAlgorithm({ householdId: ctx.household.id, bookId: ctx.book.id, userId: ctx.user.id, feature: "consejero_interpretar", evitados: tokensFor("consejero_interpretar", t) })
      return { d: completeInterp(sure, t), src: "local" }
    }
    try {
      const { object: r } = await aiObject({
        householdId: ctx.household.id, bookId: ctx.book.id, userId: ctx.user.id, feature: "consejero_interpretar", schema: InterpSchema,
        prompt: `FRASE: "${t}"`,
      })
      const d: AdvisorInput = {
        tipo: r.tipo, desc: r.desc, valor: r.valor ?? "", forma: r.forma ?? undefined, cuotas: r.cuotas ?? "", tasa: r.tasa_mensual ?? undefined,
        cuotaV: r.cuota ?? undefined, manejo: r.cuota_manejo ?? undefined, uso: r.uso_mensual ?? undefined, pagoModo: r.pago_tarjeta ?? "total",
        seguros: r.seguros ?? undefined, dias: r.plazo_dias ?? undefined, reemplaza: r.reemplaza ?? undefined, persona: r.persona ?? undefined, dudas: (r.dudas ?? []).slice(0, 3),
      }
      if (d.cuotaV && !d.tasa) d.modoInt = "cuota"
      return { d: completeInterp(d, t, r.tasa_ea), src: "ia" }
    } catch { /* sigue sin IA */ }
  }
  return { d: completeInterp(localInterp(t), t), src: "local" }
}

const AiVerdict = z.object({
  veredicto: z.enum(["si", "con_cuidado", "no"]), titular: z.string(), explicacion: z.string(),
  razones: z.array(z.string()), alternativas: z.array(z.string()), plan: z.array(z.string()), pregunta: z.string(),
  tecnico: z.object({ resumen: z.string(), indicadores: z.array(z.object({ nombre: z.string(), valor: z.string(), lectura: z.enum(["sano", "alerta", "riesgo"]) })), recomendacion: z.string() }),
})
export type AiVerdict = z.infer<typeof AiVerdict>
export type Consulta = { id: string; fecha: string; d: AdvisorInput; txt: string; v: "si" | "cuidado" | "no"; R: string[]; m: Analisis["m"]; X: Record<string, number>; ai: AiVerdict | null; aiErr: string | null; provider?: string }

/** Paso 2: análisis con reglas + IA, y se guarda en "Consultas anteriores". */
export async function analyzeDecision(d: AdvisorInput, txt: string): Promise<Consulta> {
  const ctx = await requireRole("viewer")
  if (!+(d.valor ?? 0)) throw new Error("Escribe el valor")
  const sb = await supabaseServer()
  const today = todayBogota()
  const [book, { data: cfg }] = await Promise.all([loadBookData(sb, ctx.book.id), sb.from("book_settings").select("estricto,usura").eq("book_id", ctx.book.id).single()])
  const an = asAnalyze(book, d, { estricto: cfg?.estricto, usura: +(cfg?.usura ?? 26) }, today)
  const m = an.m
  let ai: AiVerdict | null = null, aiErr: string | null = null, provider: string | undefined
  const ia = await aiSettings(ctx.book.id)
  if (ia.on === false || ia.consejero === false) aiErr = "La IA del consejero está apagada en Ajustes."
  else {
    const data = {
      quiere: ATIPOS[d.tipo].l, descripcion: d.desc, texto_original: txt,
      detalles: Object.fromEntries(Object.entries(d).filter(([k, v]) => v !== "" && v != null && k !== "dudas" && !/Id$/.test(k))),
      calculos: { cuota_mensual: Math.round(m.cuota), intereses_totales: Math.round(m.intereses), tasa_efectiva_anual_pct: +(m.ea * 100).toFixed(1), ...Object.fromEntries(Object.entries(an.X ?? {}).map(([k, v]) => [k, Math.round(v)])) },
      finanzas: { ingreso_mensual: Math.round(m.ing), gastos_fijos_mes: Math.round(m.fij), cuotas_deudas_mes: Math.round(m.cuo), suscripciones_mes: Math.round(m.subs), gasto_variable_mes: Math.round(m.varr), libre_mes_antes: Math.round(m.libre), libre_mes_despues: Math.round(m.libreD), deudas_sobre_ingreso_despues_pct: +(m.ratioD * 100).toFixed(1), disponible_hoy: Math.round(m.liq), disponible_despues: Math.round(m.liqD), meses_colchon_antes: +m.emergA.toFixed(1), meses_colchon_despues: +m.emergD.toFixed(1) },
      veredicto_reglas: an.v, observaciones: an.R,
    }
    try {
      const r = await aiObject({
        householdId: ctx.household.id, bookId: ctx.book.id, userId: ctx.user.id, feature: "consejero_analizar", schema: AiVerdict,
        prompt: `DATOS:\n${toLines(data as never, { exact: true })}`,
      })
      ai = r.object; provider = r.provider
    } catch (e) { aiErr = e instanceof AiUnavailable ? e.message : "No pudimos consultar la IA; ves el análisis automático con tus números." }
  }
  const v = ai ? (ai.veredicto === "si" ? "si" : ai.veredicto === "no" ? "no" : "cuidado") : an.v
  const payload = { d, txt, R: an.R, m, X: an.X ?? {}, ai, aiErr, provider }
  const { data: row, error } = await sb.from("advisor_consultations").insert({
    book_id: ctx.book.id, fecha: today, tipo: d.tipo, descripcion: (d.desc || ATIPOS[d.tipo].l).slice(0, 120), valor: +(d.valor ?? 0) || 0,
    contact_id: d.contactoId || null, veredicto: v, payload: payload as never,
  }).select("id").single()
  if (error) throw new Error(error.message)
  return { id: row.id, fecha: today, v, ...payload, X: an.X ?? {} }
}

// Resumen del mes con IA (resumenIA de la v4), con respaldo sin IA. Antes generateMonthSummary de
// apps/web/features/reports/actions.ts (F2-F-5). Se guarda en monthly_summaries. La web y la API
// (POST /v1/books/:b/reports/:mes/summary) revisan el rol (editor) antes. Solo servidor.
import { z } from "zod"
import { formatCOP, monthSummaryData, todayBogota } from "@mirai/domain"
import { rt } from "@mirai/services/runtime"
import { aiObject, AiUnavailable } from "../run"
import { toLines, topN } from "../compact"
import { whoOf, type AiCtx, type Sb } from "./ctx"

export const MonthSummarySchema = z.object({ titular: z.string(), resumen: z.string(), gastaste_mas: z.array(z.string()), mejoro: z.array(z.string()), alertas: z.array(z.string()), recomendacion: z.string() })
// La IA solo escribe lo que necesita redacción; "gastaste_mas" y "alertas" se calculan con los números (menos tokens de salida).
const AiPart = MonthSummarySchema.pick({ titular: true, resumen: true, mejoro: true, recomendacion: true })
export type MonthSummary = z.infer<typeof MonthSummarySchema> & { fecha: string; local?: boolean; provider?: string }

const MESES_L = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"]
/** "2026-11" → "noviembre 2026" (fmtMonth de apps/web/lib/format.ts). */
const fmtMonth = (ym: string) => { const [y, m] = ym.split("-").map(Number); return `${MESES_L[m - 1]} ${y}` }

/** Lanza "Mes inválido" si `k` no es AAAA-MM (como la web). */
export async function monthSummaryWith(ctx: AiCtx, sb: Sb, k: string): Promise<MonthSummary> {
  if (!/^\d{4}-\d{2}$/.test(k)) throw new Error("Mes inválido")
  const b = await rt().loadBook(sb, ctx.book.id)
  const data = { mes: fmtMonth(k), ...monthSummaryData(b, k, todayBogota()) }
  let out: MonthSummary
  // Lo calculable va con algoritmo: dónde más gastó (con la diferencia frente al mes anterior) y las alertas.
  const top = Object.entries(data.gastos_por_categoria).sort((x, y) => y[1] - x[1]).slice(0, 3)
  const gastasteMas = top.map(([c, v]) => { const p = data.mes_anterior[c] ?? 0; const d = v - p; return `${c}: ${formatCOP(v)}${p ? ` (${d >= 0 ? "+" : "−"}${formatCOP(Math.abs(d))} frente al mes anterior)` : ""}` })
  const alertas = [
    ...data.topes_excedidos.slice(0, 2).map((c) => `Te pasaste del tope en ${c}`),
    ...(data.ingreso_mensual && data.total > data.ingreso_mensual ? [`Gastaste más de lo que entra al mes (${formatCOP(data.ingreso_mensual)})`] : []),
    ...(data.total && data.hormiga / data.total > 0.15 ? [`Los gastos hormiga fueron ${Math.round((data.hormiga / data.total) * 100)} % del total`] : []),
  ].slice(0, 3)
  try {
    const r = await aiObject({
      ...whoOf(ctx), feature: "resumen_mes", schema: AiPart,
      prompt: `DATOS:\n${toLines({
        mes: data.mes, ingreso_mensual: data.ingreso_mensual, total_gastado: data.total, total_mes_anterior: data.total_anterior, hormiga: data.hormiga, deudas_saldo: data.deudas_saldo,
        por_categoria: topN(data.gastos_por_categoria, 8), mes_anterior_por_categoria: topN(data.mes_anterior, 8),
        donde_mas_gasto: gastasteMas, alertas, metas: data.metas.slice(0, 5).map((m) => ({ nombre: m.nombre, avance_pct: m.avance })),
      }, { exact: true })}`,
    })
    out = { ...r.object, gastaste_mas: gastasteMas, alertas, provider: r.provider, fecha: todayBogota() }
  } catch (e) {
    out = {
      titular: `Gastaste ${formatCOP(data.total)} en ${data.mes}`,
      resumen: `Comparado con el mes anterior (${formatCOP(data.total_anterior)}), ${data.total > data.total_anterior ? "gastaste más" : "gastaste menos"}.`,
      gastaste_mas: gastasteMas, mejoro: [], alertas,
      recomendacion: e instanceof AiUnavailable ? `${e.message} Así recibirás un análisis completo.` : "No pudimos consultar la IA; intenta de nuevo más tarde para un análisis completo.",
      local: true, fecha: todayBogota(),
    }
  }
  const { error } = await sb.from("monthly_summaries").upsert({ book_id: ctx.book.id, mes: k, contenido: out as never, deleted_at: null }, { onConflict: "book_id,mes" })
  if (error) throw new Error(error.message)
  return out
}

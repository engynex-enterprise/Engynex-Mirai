// Uso de IA y créditos: Ajustes › Uso de IA (myAiUsage de apps/web/features/ia-uso/actions.ts) y consola › Uso de IA
// (las 5 acciones de apps/web/features/admin/ia-server.ts). F2-F. La web y la API revisan el rol (viewer) o que sea
// administrador de la plataforma antes de llamar. Por privacidad la consola nunca muestra montos ni movimientos de los
// hogares (ni el contenido de las preguntas: ai_usage no lo guarda). Solo servidor.
import { z } from "zod"
import { can } from "@mirai/domain/plans"
import { planOf } from "@mirai/services/plan"
import { rt } from "@mirai/services/runtime"
import { byDay, dayBogota, groupBy, monthStartBogota, quotaState, savings, totals, type RollupRow } from "../credits"
import { DEFAULT_CREDIT_USD, DEFAULT_PRICES, priceFor, type PriceTable } from "../pricing"
import { aiPlatformSettings, householdQuota, latestTrm, resetAiSettingsMemo } from "../usage"
import type { AiCtx, Sb } from "./ctx"

const admin = () => rt().admin()

/** Uso de IA del hogar: cupo del mes, costo, ahorro, serie por día, por función y últimas solicitudes. Rol: viewer. */
export async function myAiUsageWith(ctx: Pick<AiCtx, "household">, sb: Sb) {
  const hoy = dayBogota()
  const inicioMes = dayBogota(monthStartBogota())
  const hace30 = dayBogota(new Date(Date.now() - 29 * 86_400_000))
  const desde = inicioMes < hace30 ? inicioMes : hace30
  const plan = await planOf(ctx.household.id)
  const [quota, s, trm, { data: roll }, { data: recent }] = await Promise.all([
    householdQuota(ctx.household.id, plan.id),
    aiPlatformSettings(),
    latestTrm(),
    sb.rpc("ai_usage_rollup", { p_desde: desde, p_household: ctx.household.id }),
    sb.from("ai_usage").select("id,created_at,feature,fuente,provider,model,input_tokens,output_tokens,cached_tokens,costo_usd,creditos,de_plataforma,ok,duracion_ms")
      .eq("household_id", ctx.household.id).order("created_at", { ascending: false }).limit(50),
  ])
  const rows = (roll ?? []) as RollupRow[]
  const delMes = rows.filter((r) => String(r.dia) >= inicioMes)
  const t = totals(delMes)
  return {
    plan: plan.nombre, incluyeIa: can(plan, "ia"), quota, avisoPct: s.avisoPct, creditUsd: s.creditUsd, trm,
    mes: t, ahorro: savings(t), propia: totals(delMes.filter((r) => r.fuente === "ia" && !r.de_plataforma)),
    porDia: byDay(rows, hace30, hoy).map((d) => ({ k: d.k, creditos: d.creditos, llamadas: d.llamadas, ia: d.ia, sinIa: d.cache + d.algoritmo })),
    porFuncion: groupBy(delMes, (r) => r.feature),
    recientes: (recent ?? []).map((r) => ({ ...r, costo_usd: +r.costo_usd, creditos: +r.creditos })),
  }
}
export type MyAiUsage = Awaited<ReturnType<typeof myAiUsageWith>>

// ── Consola › Uso de IA (solo administradores de la plataforma) ──

/** Registro en admin_audit (como features/admin/ia-server.ts). */
export async function adminAudit(actor: string, accion: string, objetivo: string | null, detalle: Record<string, unknown> = {}) {
  await admin().from("admin_audit").insert({ actor, accion, objetivo, detalle: detalle as never })
}

/** Métricas de toda la plataforma: llamadas, tokens y costo de los últimos `dias` (7 a 180). */
export async function adminAiUsageReport(dias = 30) {
  const db = admin()
  const d = Math.min(180, Math.max(7, Math.round(dias)))
  const hoy = dayBogota()
  const desde = dayBogota(new Date(Date.now() - (d - 1) * 86_400_000))
  const inicioMes = dayBogota(monthStartBogota())
  const desdeQ = inicioMes < desde ? inicioMes : desde
  const [{ data: roll, error }, { data: settings }, { data: plans }, { count: cacheN }, { data: cacheHits }, trm] = await Promise.all([
    db.rpc("ai_usage_rollup", { p_desde: desdeQ }),
    db.from("platform_settings").select("ia_credito_usd,ia_cupos_activo,ia_aviso_pct,ia_cache_horas,ia_precios").eq("id", true).single(),
    db.from("plans").select("id,nombre,ia_creditos,funciones,orden").order("orden"),
    db.from("ai_cache").select("key", { count: "exact", head: true }).gt("expires_at", new Date().toISOString()),
    db.from("ai_cache").select("hits").gt("hits", 0).limit(5000),
    latestTrm(),
  ])
  if (error) throw new Error(error.message)
  const all = (roll ?? []) as RollupRow[]
  const rows = all.filter((r) => String(r.dia) >= desde)
  const mes = all.filter((r) => String(r.dia) >= inicioMes)
  const t = totals(rows)

  // Top hogares por consumo del mes: nombre, plan, llamadas, tokens, costo y % del cupo. Nada financiero.
  const porHogar = groupBy(mes.filter((r) => r.household_id), (r) => r.household_id).slice(0, 25)
  const ids = porHogar.map((h) => h.k).filter((k) => k !== "—")
  const { data: hh } = ids.length ? await db.from("households").select("id,nombre").in("id", ids) : { data: [] }
  const planDe = new Map(mes.map((r) => [r.household_id, r.plan]))
  const cupoDe = new Map((plans ?? []).map((p) => [p.id, p.ia_creditos]))
  const precios = (settings?.ia_precios ?? {}) as PriceTable
  const modelos = groupBy(rows.filter((r) => r.fuente === "ia" && r.model), (r) => r.model)

  return {
    dias: d, desde, hoy, trm,
    settings: { creditUsd: +(settings?.ia_credito_usd ?? DEFAULT_CREDIT_USD), cuposActivo: settings?.ia_cupos_activo ?? true, avisoPct: settings?.ia_aviso_pct ?? 80, cacheHoras: settings?.ia_cache_horas ?? 24 },
    totales: t, ahorro: savings(t),
    cache: { vigentes: cacheN ?? 0, aciertos: (cacheHits ?? []).reduce((s, x) => s + x.hits, 0) },
    porDia: byDay(rows, desde, hoy),
    porFuncion: groupBy(rows, (r) => r.feature),
    porModelo: modelos.map((m) => ({ ...m, precio: priceFor(m.k, precios), propio: !!precios[m.k] })),
    porPlan: groupBy(rows, (r) => r.plan),
    porProveedor: groupBy(rows.filter((r) => r.fuente === "ia"), (r) => r.provider),
    plataformaVsPropia: { plataforma: totals(rows.filter((r) => r.fuente === "ia" && r.de_plataforma)), propia: totals(rows.filter((r) => r.fuente === "ia" && !r.de_plataforma)) },
    topHogares: porHogar.map((h) => {
      const plan = planDe.get(h.k) ?? null
      const q = quotaState(h.creditos, plan ? (cupoDe.get(plan) ?? null) : null, settings?.ia_aviso_pct ?? 80)
      return { id: h.k, nombre: (hh ?? []).find((x) => x.id === h.k)?.nombre ?? "Hogar", plan, llamadas: h.llamadas, ia: h.ia, tokens: h.tokensIn + h.tokensOut, usd: h.usd, creditos: h.creditos, pct: q.pct, nivel: q.nivel }
    }),
    planes: (plans ?? []).map((p) => ({ id: p.id, nombre: p.nombre, cupo: p.ia_creditos, incluyeIa: (p.funciones ?? []).includes("ia") })),
    precios: { propios: precios, base: DEFAULT_PRICES },
  }
}
export type AdminAiUsage = Awaited<ReturnType<typeof adminAiUsageReport>>

export const AiSettingsIn = z.object({
  creditUsd: z.number().positive().max(1).optional(), cuposActivo: z.boolean().optional(),
  avisoPct: z.number().int().min(1).max(100).optional(), cacheHoras: z.number().int().min(0).max(720).optional(),
})

/** Créditos, cupos, aviso y caché de la plataforma. */
export async function saveAiSettings(actor: string, input: z.input<typeof AiSettingsIn>) {
  const p = AiSettingsIn.parse(input)
  const patch = { ia_credito_usd: p.creditUsd, ia_cupos_activo: p.cuposActivo, ia_aviso_pct: p.avisoPct, ia_cache_horas: p.cacheHoras }
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
  const { error } = await admin().from("platform_settings").update({ ...clean, updated_at: new Date().toISOString() }).eq("id", true)
  if (error) throw new Error(error.message)
  resetAiSettingsMemo()
  await adminAudit(actor, "ajustes de IA", null, clean)
}

export const PlanId = z.string().regex(/^[a-z0-9-]{2,30}$/)
export const PlanCupo = z.number().int().min(0).max(10_000_000).nullable()

/** Créditos de IA al mes de un plan (null = sin límite). */
export async function setPlanAiCupo(actor: string, planId: string, cupo: number | null) {
  const id = PlanId.parse(planId)
  const c = PlanCupo.parse(cupo)
  const { error } = await admin().from("plans").update({ ia_creditos: c, updated_at: new Date().toISOString() }).eq("id", id)
  if (error) throw new Error(error.message)
  await adminAudit(actor, "cupo de IA del plan", id, { cupo: c })
}

export const PriceIn = z.object({ in: z.number().min(0).max(1000), out: z.number().min(0).max(1000), cached: z.number().min(0).max(1000).optional() })
export const ModelName = z.string().trim().min(2).max(120)

/** Precio propio de un modelo (US$ por millón de tokens); null lo quita y vuelve al de la tabla. */
export async function setModelPrice(actor: string, model: string, price: z.input<typeof PriceIn> | null) {
  const m = ModelName.parse(model)
  const db = admin()
  const { data } = await db.from("platform_settings").select("ia_precios").eq("id", true).single()
  const cur = { ...((data?.ia_precios ?? {}) as PriceTable) }
  if (price === null) delete cur[m]
  else cur[m] = PriceIn.parse(price)
  const { error } = await db.from("platform_settings").update({ ia_precios: cur as never, updated_at: new Date().toISOString() }).eq("id", true)
  if (error) throw new Error(error.message)
  resetAiSettingsMemo()
  await adminAudit(actor, price === null ? "quitar precio de modelo" : "precio de modelo", m, price ?? {})
}

/** Vacía la caché de respuestas de la IA. Devuelve cuántas se borraron. */
export async function clearAiCache(actor: string) {
  const { error, count } = await admin().from("ai_cache").delete({ count: "exact" }).neq("key", "")
  if (error) throw new Error(error.message)
  await adminAudit(actor, "vaciar caché de IA", null, { borradas: count ?? 0 })
  return count ?? 0
}

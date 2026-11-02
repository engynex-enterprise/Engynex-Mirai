"use server"

import { z } from "zod"
import { requirePlatformAdmin } from "@/lib/dal"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { byDay, dayBogota, groupBy, monthStartBogota, quotaState, savings, totals, type RollupRow } from "@/lib/ai/credits"
import { DEFAULT_CREDIT_USD, DEFAULT_PRICES, priceFor, type PriceTable } from "@/lib/ai/pricing"
import { latestTrm, resetAiSettingsMemo } from "@/lib/ai/usage"

// Consola › Uso de IA. Métricas de toda la plataforma: llamadas, tokens y costo. Por privacidad nunca muestra
// montos ni movimientos de los hogares (ni el contenido de las preguntas: ai_usage no lo guarda).

async function audit(actor: string, accion: string, objetivo: string | null, detalle: Record<string, unknown> = {}) {
  await supabaseAdmin().from("admin_audit").insert({ actor, accion, objetivo, detalle: detalle as never })
}

export async function adminAiUsage(dias = 30) {
  await requirePlatformAdmin()
  const db = supabaseAdmin()
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
export type AdminAiUsage = Awaited<ReturnType<typeof adminAiUsage>>

const Settings = z.object({
  creditUsd: z.number().positive().max(1).optional(), cuposActivo: z.boolean().optional(),
  avisoPct: z.number().int().min(1).max(100).optional(), cacheHoras: z.number().int().min(0).max(720).optional(),
})

export async function adminSaveAiSettings(input: z.input<typeof Settings>) {
  const ctx = await requirePlatformAdmin()
  const p = Settings.parse(input)
  const patch = { ia_credito_usd: p.creditUsd, ia_cupos_activo: p.cuposActivo, ia_aviso_pct: p.avisoPct, ia_cache_horas: p.cacheHoras }
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
  const { error } = await supabaseAdmin().from("platform_settings").update({ ...clean, updated_at: new Date().toISOString() }).eq("id", true)
  if (error) throw new Error(error.message)
  resetAiSettingsMemo()
  await audit(ctx.user.id, "ajustes de IA", null, clean)
}

export async function adminSetPlanAiCupo(planId: string, cupo: number | null) {
  const ctx = await requirePlatformAdmin()
  const id = z.string().regex(/^[a-z0-9-]{2,30}$/).parse(planId)
  const c = cupo === null ? null : z.number().int().min(0).max(10_000_000).parse(cupo)
  const { error } = await supabaseAdmin().from("plans").update({ ia_creditos: c, updated_at: new Date().toISOString() }).eq("id", id)
  if (error) throw new Error(error.message)
  await audit(ctx.user.id, "cupo de IA del plan", id, { cupo: c })
}

const PriceIn = z.object({ in: z.number().min(0).max(1000), out: z.number().min(0).max(1000), cached: z.number().min(0).max(1000).optional() })

/** Precio propio de un modelo (US$ por millón de tokens); null lo quita y vuelve al de la tabla. */
export async function adminSetModelPrice(model: string, price: z.input<typeof PriceIn> | null) {
  const ctx = await requirePlatformAdmin()
  const m = z.string().trim().min(2).max(120).parse(model)
  const db = supabaseAdmin()
  const { data } = await db.from("platform_settings").select("ia_precios").eq("id", true).single()
  const cur = { ...((data?.ia_precios ?? {}) as PriceTable) }
  if (price === null) delete cur[m]
  else cur[m] = PriceIn.parse(price)
  const { error } = await db.from("platform_settings").update({ ia_precios: cur as never, updated_at: new Date().toISOString() }).eq("id", true)
  if (error) throw new Error(error.message)
  resetAiSettingsMemo()
  await audit(ctx.user.id, price === null ? "quitar precio de modelo" : "precio de modelo", m, price ?? {})
}

export async function adminClearAiCache() {
  const ctx = await requirePlatformAdmin()
  const { error, count } = await supabaseAdmin().from("ai_cache").delete({ count: "exact" }).neq("key", "")
  if (error) throw new Error(error.message)
  await audit(ctx.user.id, "vaciar caché de IA", null, { borradas: count ?? 0 })
  return count ?? 0
}

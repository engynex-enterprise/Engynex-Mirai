"use server"

import { generateText } from "ai"
import { requireRole } from "@/lib/dal"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { encrypt, mask } from "@/lib/crypto"
import { integrationByKind } from "@/lib/integrations/registry"
import { aiErrMsg, modelFrom } from "@/lib/ai/model"
import { MODEL_LIST, modelOptions, parseModels, type ModelOption } from "@/lib/ai/models"
import { brandEmail, EMAIL_KINDS, sendEmail } from "@/lib/notify/email"
import { getIntegration } from "./store"
import { fetchFestivos, fetchFx, fetchTrm, fetchUsura } from "./data-sources"

/** Guarda la configuración (los secretos vacíos conservan los guardados) y la activa. */
export async function saveIntegration(kind: string, values: Record<string, string | number | boolean>, enabled = true) {
  const ctx = await requireRole("owner")
  const def = integrationByKind(kind)
  if (!def) throw new Error("Integración desconocida")
  const prev = await getIntegration(ctx.household.id, kind)
  const config: Record<string, unknown> = {}
  const secrets: Record<string, string> = { ...(prev?.secrets ?? {}) }
  const meta: Record<string, string> = {}
  for (const f of def.fields) {
    const v = values[f.k]
    if (f.type === "secret") {
      if (typeof v === "string" && v.trim()) secrets[f.k] = v.trim()
      if (secrets[f.k]) meta[f.k] = mask(secrets[f.k])
    } else config[f.k] = v ?? f.def ?? ""
  }
  const missing = def.fields.filter((f) => f.required && !(f.type === "secret" ? secrets[f.k] : config[f.k]))
  if (enabled && missing.length) throw new Error(`Falta: ${missing.map((f) => f.l).join(", ")}`)
  const { error } = await supabaseAdmin().from("integrations").upsert({
    household_id: ctx.household.id, kind, enabled, config: config as never, meta: meta as never,
    secrets_enc: Object.keys(secrets).length ? encrypt(JSON.stringify(secrets)) : null, updated_by: ctx.user.id,
  }, { onConflict: "household_id,kind" })
  if (error) throw new Error(error.message)
}

export async function toggleIntegration(kind: string, enabled: boolean) {
  const ctx = await requireRole("owner")
  const def = integrationByKind(kind)
  const prev = await getIntegration(ctx.household.id, kind)
  if (enabled && def?.fields.some((f) => f.required) && !prev) throw new Error("Primero completa sus datos")
  const { error } = await supabaseAdmin().from("integrations").upsert({ household_id: ctx.household.id, kind, enabled, updated_by: ctx.user.id }, { onConflict: "household_id,kind" })
  if (error) throw new Error(error.message)
}

export async function deleteIntegration(kind: string) {
  const ctx = await requireRole("owner")
  await supabaseAdmin().from("integrations").delete().eq("household_id", ctx.household.id).eq("kind", kind)
}

/** Prueba la conexión. Devuelve un mensaje para el usuario. */
export async function testIntegration(kind: string): Promise<{ ok: boolean; msg: string }> {
  const ctx = await requireRole("editor")
  const v = await getIntegration(ctx.household.id, kind)
  const def = integrationByKind(kind)
  const done = async (ok: boolean, msg: string) => {
    if (v) await supabaseAdmin().from("integrations").update({ meta: { ...(await metaOf(ctx.household.id, kind)), lastTest: new Date().toISOString(), lastOk: ok, lastMsg: msg } as never }).eq("household_id", ctx.household.id).eq("kind", kind)
    return { ok, msg }
  }
  try {
    if (def?.cat === "ia") {
      if (!v) return { ok: false, msg: "Primero guarda la clave de API." }
      const { text } = await generateText({ model: modelFrom(v), prompt: "Responde solo con la palabra: listo", maxOutputTokens: 20 })
      return done(true, `Conexión exitosa con ${def.n}. Respondió: “${text.trim().slice(0, 40)}”.`)
    }
    if (EMAIL_KINDS.includes(kind)) {
      if (!v) return { ok: false, msg: "Primero guarda los datos del correo." }
      await sendEmail(v, { to: ctx.user.email, subject: "Mirai: correo de prueba", html: brandEmail("¡Tu correo quedó conectado!", "<p>Desde ahora te llegarán aquí los avisos de pagos y cobros que actives.</p>") })
      return done(true, `Te enviamos un correo de prueba a ${ctx.user.email}.`)
    }
    if (kind === "telegram") {
      const r = await fetch(`https://api.telegram.org/bot${v?.secrets.botToken}/getMe`).then((x) => x.json())
      if (!r.ok) throw new Error("401 token inválido")
      return done(true, `Bot conectado: @${r.result.username}. Ahora vincula tu chat en Ajustes › Avisos.`)
    }
    if (kind === "trm") { const t = await fetchTrm(); return done(true, `TRM de hoy: $${t.valor.toLocaleString("es-CO")} (vigente desde ${t.fecha}).`) }
    if (kind === "usura") { const u = await fetchUsura(); return done(true, `Tasa de usura vigente: ${u.usura.toFixed(2).replace(".", ",")} % E.A. (1,5 × interés bancario corriente de ${u.ibc.toFixed(2).replace(".", ",")} %).`) }
    if (kind === "festivos") { const f = await fetchFestivos(new Date().getFullYear()); return done(true, `${f.length} festivos encontrados este año.`) }
    if (kind === "fx") { const r = await fetchFx(); return done(true, `1 USD = $${Math.round(r.USD).toLocaleString("es-CO")} · 1 EUR = $${Math.round(r.EUR).toLocaleString("es-CO")}.`) }
    if (kind === "coingecko") {
      const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=cop", { headers: v?.secrets.apiKey ? { "x-cg-demo-api-key": v.secrets.apiKey } : {} }).then((x) => x.json())
      return done(true, `1 BTC = $${Math.round(r.bitcoin.cop).toLocaleString("es-CO")}.`)
    }
    if (kind === "stocks") {
      const key = v?.secrets.apiKey
      const url = v?.config.provider === "twelvedata" ? `https://api.twelvedata.com/price?symbol=SPY&apikey=${key}` : `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=SPY&apikey=${key}`
      const r = await fetch(url).then((x) => x.json())
      const p = r.price ?? r["Global Quote"]?.["05. price"]
      if (!p) throw new Error(r.message ?? r.Note ?? r.Information ?? "invalid api key")
      return done(true, `SPY = US$${Number(p).toFixed(2)}.`)
    }
    return { ok: true, msg: "Esta integración no necesita prueba." }
  } catch (e) {
    return done(false, aiErrMsg(e, def?.url))
  }
}

/**
 * Modelos de chat que la cuenta puede usar, leídos de la API del proveedor. Usa la clave recién escrita
 * o, si está vacía, la guardada (o la del despliegue para el AI Gateway).
 */
export async function listModels(kind: string, apiKey?: string): Promise<{ ok: boolean; models: ModelOption[]; rec?: string; msg?: string }> {
  const ctx = await requireRole("owner")
  const src = MODEL_LIST[kind]
  if (!src) return { ok: false, models: [], msg: "Este proveedor no tiene lista de modelos." }
  const saved = await getIntegration(ctx.household.id, kind)
  const def = integrationByKind(kind)
  const key = apiKey?.trim() || saved?.secrets.apiKey || (def?.env ? process.env[def.env] : "") || ""
  if (!key && !src.keyless) return { ok: false, models: [], msg: "Pega la clave de API para ver los modelos de tu cuenta." }
  try {
    const r = await fetch(src.url + (key && src.query ? src.query(key) : ""), { headers: key && src.headers ? src.headers(key) : {}, signal: AbortSignal.timeout(12000), cache: "no-store" })
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`)
    const { options, rec } = modelOptions(kind, parseModels(kind, await r.json()))
    if (!options.length) return { ok: false, models: [], msg: "Tu cuenta no tiene modelos de chat disponibles en este proveedor." }
    return { ok: true, models: options, rec }
  } catch (e) {
    return { ok: false, models: [], msg: aiErrMsg(e, def?.url) }
  }
}

async function metaOf(householdId: string, kind: string) {
  const { data } = await supabaseAdmin().from("integrations").select("meta").eq("household_id", householdId).eq("kind", kind).maybeSingle()
  return (data?.meta ?? {}) as Record<string, unknown>
}

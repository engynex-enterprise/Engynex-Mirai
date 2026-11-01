import "server-only"
import { generateObject, generateText, type ModelMessage } from "ai"
import type { z } from "zod"
import { aiErrMsg, aiProviders, aiSettings } from "./model"
import { getIntegration } from "@/features/integrations/store"

export class AiUnavailable extends Error {}

type Base = { householdId: string; bookId: string; system?: string; prompt?: string; messages?: ModelMessage[]; images?: { data: string; mediaType: string }[] }

const asMessages = (b: Base): ModelMessage[] =>
  b.messages ?? [{ role: "user", content: [...(b.images ?? []).map((i) => ({ type: "image" as const, image: i.data, mediaType: i.mediaType })), { type: "text" as const, text: b.prompt ?? "" }] }]

/** Límite de consultas de IA por hogar y hora con Upstash Redis (si la integración o las variables existen). */
async function rateLimit(householdId: string) {
  const up = await getIntegration(householdId, "upstash")
  const url = (up?.enabled && String(up.config.url || "")) || process.env.UPSTASH_REDIS_REST_URL
  const token = (up?.enabled && up.secrets.token) || process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return
  const max = +(up?.config.aiPerHour ?? 0) || 60
  const key = `mirai:ai:${householdId}:${new Date().toISOString().slice(0, 13)}`
  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/pipeline`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify([["INCR", key], ["EXPIRE", key, 3600, "NX"]]) }).then((x) => x.json())
    if (+r?.[0]?.result > max) throw new AiUnavailable(`Llegaste al límite de ${max} consultas de IA por hora en tu hogar. Intenta de nuevo en un rato.`)
  } catch (e) { if (e instanceof AiUnavailable) throw e }
}

async function withFallback<T>(b: Base, fn: (model: Parameters<typeof generateText>[0]["model"]) => Promise<T>): Promise<{ result: T; provider: string }> {
  const ia = await aiSettings(b.bookId)
  if (ia.on === false) throw new AiUnavailable("La inteligencia artificial está apagada. Actívala en Ajustes › Integraciones.")
  const list = await aiProviders(b.householdId, ia.orden)
  if (!list.length) throw new AiUnavailable("Activa un proveedor de IA en Ajustes › Integraciones (Gemini tiene plan gratis).")
  await rateLimit(b.householdId)
  let last: unknown
  for (const p of list) {
    try { return { result: await fn(p.model), provider: p.name } } catch (e) { last = e }
  }
  throw new Error(aiErrMsg(last))
}

/** Texto libre con respaldo entre proveedores. */
export async function aiText(b: Base & { maxOutputTokens?: number }) {
  const { result, provider } = await withFallback(b, (model) => generateText({ model, system: b.system, messages: asMessages(b), maxOutputTokens: b.maxOutputTokens ?? 1500 }))
  return { text: result.text, provider }
}

/** Objeto validado con zod (equivale a .json() de la v4) con respaldo entre proveedores. */
export async function aiObject<S extends z.ZodType>(b: Base & { schema: S }) {
  const { result, provider } = await withFallback(b, (model) => generateObject({ model, system: b.system, messages: asMessages(b), schema: b.schema }))
  return { object: result.object as z.infer<S>, provider }
}

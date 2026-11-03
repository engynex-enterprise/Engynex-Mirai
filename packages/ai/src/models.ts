// Modelos de IA disponibles por proveedor: lee la respuesta de su API de modelos, deja solo los de chat
// y los ordena con el recomendado primero. Puro (sin red): las llamadas están en features/integrations/actions.ts.

export type ModelOption = { value: string; label: string; hint?: string; group?: string }
type Raw = { id: string; name?: string; created?: number; free?: boolean }

/** Dónde se listan los modelos de cada proveedor y cómo se autentica. */
export const MODEL_LIST: Record<string, { url: string; keyless?: boolean; headers?: (key: string) => Record<string, string>; query?: (key: string) => string }> = {
  ai_gateway: { url: "https://ai-gateway.vercel.sh/v1/models", keyless: true, headers: (k) => ({ Authorization: `Bearer ${k}` }) },
  ai_gemini: { url: "https://generativelanguage.googleapis.com/v1beta/models", query: (k) => `?pageSize=1000&key=${encodeURIComponent(k)}` },
  ai_groq: { url: "https://api.groq.com/openai/v1/models", headers: (k) => ({ Authorization: `Bearer ${k}` }) },
  ai_openrouter: { url: "https://openrouter.ai/api/v1/models", keyless: true, headers: (k) => ({ Authorization: `Bearer ${k}` }) },
  ai_anthropic: { url: "https://api.anthropic.com/v1/models?limit=1000", headers: (k) => ({ "x-api-key": k, "anthropic-version": "2023-06-01" }) },
  ai_openai: { url: "https://api.openai.com/v1/models", headers: (k) => ({ Authorization: `Bearer ${k}` }) },
}

// Modelos que no sirven para conversar (voz, imágenes, embeddings, moderación, código, lotes…).
const NOT_CHAT = /embed|whisper|tts|transcri|speech|audio|realtime|image|imagen|banana|veo|video|dall-e|moderation|guard|safety|rerank|aqa|search|computer-use|codex|coder|-batch$|-fast$|live|omni|learnlm|robotics/i

/** Preferencias para el recomendado, en orden: el más nuevo que cumpla la primera que tenga resultados. */
const PREFER: Record<string, RegExp[]> = {
  ai_gateway: [/^google\/gemini-[\d.]+-flash$/, /^openai\/gpt-[\d.]+-mini$/, /^anthropic\/claude-haiku-[\d.]+$/],
  ai_gemini: [/^gemini-[\d.]+-flash$/, /^gemini-flash-latest$/, /flash/],
  ai_groq: [/^llama-3\.3-70b-versatile$/, /gpt-oss-120b/, /llama|qwen|kimi/],
  ai_openrouter: [/^openrouter\/free$/, /:free$/],
  ai_anthropic: [/^claude-haiku/, /^claude-sonnet/],
  ai_openai: [/^gpt-[\d.]+-mini$/, /^gpt-[\d.]+-nano$/, /^gpt-/],
}

type J = Record<string, unknown> & { data?: J[]; models?: J[] }
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v ? Date.parse(v) / 1000 || undefined : undefined)
const zero = (v: unknown) => v === "0" || v === 0

/** Pasa la respuesta cruda del proveedor a una lista uniforme de modelos de chat. */
export function parseModels(kind: string, json: J): Raw[] {
  const rows = (json.data ?? json.models ?? []) as J[]
  const list: Raw[] = rows.flatMap((m): Raw[] => {
    const pr = (m.pricing ?? {}) as Record<string, unknown>
    switch (kind) {
      case "ai_gateway":
        return m.type === "language" ? [{ id: String(m.id), name: m.name as string, created: num(m.released ?? m.created), free: zero(pr.input) && zero(pr.output) }] : []
      case "ai_gemini":
        return (m.supportedGenerationMethods as string[] | undefined)?.includes("generateContent")
          ? [{ id: String(m.name).replace(/^models\//, ""), name: m.displayName as string }] : []
      case "ai_groq":
        return m.active === false ? [] : [{ id: String(m.id), created: num(m.created) }]
      case "ai_openrouter": {
        const out = ((m.architecture as Record<string, unknown> | undefined)?.output_modalities as string[] | undefined) ?? ["text"]
        return out.includes("text") && out.length === 1
          ? [{ id: String(m.id), name: m.name as string, created: num(m.created), free: String(m.id).endsWith(":free") || (zero(pr.prompt) && zero(pr.completion)) }] : []
      }
      case "ai_anthropic":
        return [{ id: String(m.id), name: m.display_name as string, created: num(m.created_at) }]
      case "ai_openai":
        return /^(gpt-|o\d|chatgpt-)/.test(String(m.id)) ? [{ id: String(m.id), created: num(m.created) }] : []
      default:
        return []
    }
  })
  const seen = new Set<string>()
  return list.filter((m) => m.id && !NOT_CHAT.test(m.id) && !seen.has(m.id) && (seen.add(m.id), true))
}

/** "gemini-3.8-flash" → 3.8: para ordenar cuando el proveedor no dice la fecha. */
const ver = (id: string) => +(id.match(/(\d+(?:\.\d+)?)/)?.[1] ?? 0)
const newest = (a: Raw, b: Raw) => (b.created ?? ver(b.id)) - (a.created ?? ver(a.id)) || a.id.localeCompare(b.id)
const isPreview = (id: string) => /preview|exp|beta|alpha/i.test(id)

/** El modelo que Mirai sugiere para ese proveedor, o undefined si la lista está vacía. */
export function recommended(kind: string, list: Raw[]): string | undefined {
  const stable = [...list].filter((m) => !isPreview(m.id)).sort(newest)
  for (const re of PREFER[kind] ?? []) { const hit = stable.find((m) => re.test(m.id)); if (hit) return hit.id }
  return stable[0]?.id ?? [...list].sort(newest)[0]?.id
}

/** Opciones para el selector: el recomendado arriba, luego los gratis (si aplica) y el resto del más nuevo al más viejo. */
export function modelOptions(kind: string, list: Raw[]): { options: ModelOption[]; rec?: string } {
  const rec = recommended(kind, list)
  const tag = (m: Raw) => [m.id !== (m.name ?? m.id) ? m.id : "", m.free ? "Gratis" : "", isPreview(m.id) ? "Vista previa" : ""].filter(Boolean).join(" · ")
  const opt = (m: Raw, group: string): ModelOption => ({ value: m.id, label: m.name?.trim() || m.id, hint: tag(m) || undefined, group })
  const sorted = [...list].sort(newest)
  const options = [
    ...sorted.filter((m) => m.id === rec).map((m) => opt(m, "Recomendado")),
    ...sorted.filter((m) => m.id !== rec && m.free).map((m) => opt(m, "Gratis")),
    ...sorted.filter((m) => m.id !== rec && !m.free).map((m) => opt(m, "Todos los modelos")),
  ]
  return { options, rec }
}

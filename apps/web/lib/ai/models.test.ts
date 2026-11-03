import { describe, expect, it } from "vitest"
import { modelOptions, parseModels, recommended } from "./models"
import { aiErrMsg } from "./errors"

describe("parseModels", () => {
  it("Gemini: solo modelos que generan texto, sin el prefijo models/", () => {
    const list = parseModels("ai_gemini", { models: [
      { name: "models/gemini-3.8-flash", displayName: "Gemini 3.8 Flash", supportedGenerationMethods: ["generateContent", "countTokens"] },
      { name: "models/gemini-embedding-001", displayName: "Embedding", supportedGenerationMethods: ["embedContent"] },
      { name: "models/gemini-3.1-flash-image", displayName: "Imagen", supportedGenerationMethods: ["generateContent"] },
      { name: "models/gemini-2.5-flash-preview-tts", displayName: "TTS", supportedGenerationMethods: ["generateContent"] },
    ] })
    expect(list.map((m) => m.id)).toEqual(["gemini-3.8-flash"])
  })

  it("Gateway: solo lenguaje, sin variantes batch/fast, y marca los gratis", () => {
    const list = parseModels("ai_gateway", { data: [
      { id: "google/gemini-3.8-flash", name: "Gemini 3.8 Flash", type: "language", released: 1788307200, pricing: { input: "0.0000003", output: "0.0000025" } },
      { id: "google/gemini-3.8-flash-batch", type: "language" },
      { id: "openai/gpt-5.4-mini-fast", type: "language" },
      { id: "openai/text-embedding-3-small", type: "embedding" },
      { id: "x/libre", name: "Libre", type: "language", pricing: { input: "0", output: "0" } },
    ] })
    expect(list.map((m) => [m.id, m.free])).toEqual([["google/gemini-3.8-flash", false], ["x/libre", true]])
  })

  it("OpenRouter: solo los que responden texto; los :free quedan como gratis", () => {
    const list = parseModels("ai_openrouter", { data: [
      { id: "nvidia/nemotron-3.5-lightning:free", name: "Nemotron (free)", created: 1786452751, architecture: { output_modalities: ["text"] }, pricing: { prompt: "0", completion: "0" } },
      { id: "google/gemini-3.1-flash-image", architecture: { output_modalities: ["image", "text"] } },
      { id: "openai/gpt-6.1-terra-pro", name: "GPT 6.1", created: 1792000000, architecture: { output_modalities: ["text"] }, pricing: { prompt: "0.000001", completion: "0.000005" } },
    ] })
    expect(list.map((m) => [m.id, m.free])).toEqual([["nvidia/nemotron-3.5-lightning:free", true], ["openai/gpt-6.1-terra-pro", false]])
  })

  it("OpenAI: solo modelos de chat", () => {
    const list = parseModels("ai_openai", { data: [{ id: "gpt-5-mini", created: 1 }, { id: "whisper-1" }, { id: "text-embedding-3-large" }, { id: "dall-e-3" }, { id: "gpt-4o-realtime-preview" }, { id: "o4-mini", created: 2 }] })
    expect(list.map((m) => m.id)).toEqual(["gpt-5-mini", "o4-mini"])
  })

  it("Anthropic: usa display_name y la fecha de creación", () => {
    const [m] = parseModels("ai_anthropic", { data: [{ id: "claude-haiku-4-5-20251001", display_name: "Claude Haiku 4.5", created_at: "2025-10-01T00:00:00Z" }] })
    expect(m).toMatchObject({ id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" })
    expect(m.created).toBeGreaterThan(0)
  })
})

describe("recommended", () => {
  it("Gemini: el Flash estable más nuevo (por versión), no la vista previa", () => {
    const list = [{ id: "gemini-2.5-flash" }, { id: "gemini-3.8-flash" }, { id: "gemini-4-flash-preview" }, { id: "gemini-3.8-pro" }]
    expect(recommended("ai_gemini", list)).toBe("gemini-3.8-flash")
  })
  it("OpenRouter: prefiere el enrutador gratis y si no, el gratis más nuevo", () => {
    expect(recommended("ai_openrouter", [{ id: "a:free", created: 1, free: true }, { id: "openrouter/free", free: true }])).toBe("openrouter/free")
    expect(recommended("ai_openrouter", [{ id: "a:free", created: 1, free: true }, { id: "b:free", created: 2, free: true }, { id: "paid", created: 3 }])).toBe("b:free")
  })
  it("Anthropic: el Haiku más reciente", () => {
    expect(recommended("ai_anthropic", [{ id: "claude-sonnet-5", created: 3 }, { id: "claude-haiku-4-5", created: 1 }, { id: "claude-haiku-5-5", created: 2 }])).toBe("claude-haiku-5-5")
  })
  it("lista vacía: no recomienda nada", () => {
    expect(recommended("ai_groq", [])).toBeUndefined()
  })
})

describe("modelOptions", () => {
  it("pone el recomendado primero, luego los gratis y luego el resto", () => {
    const { options, rec } = modelOptions("ai_openrouter", [
      { id: "paid/x", name: "X", created: 5 },
      { id: "free/y:free", name: "Y", created: 4, free: true },
      { id: "openrouter/free", name: "Free Router", created: 1, free: true },
    ])
    expect(rec).toBe("openrouter/free")
    expect(options.map((o) => [o.value, o.group])).toEqual([["openrouter/free", "Recomendado"], ["free/y:free", "Gratis"], ["paid/x", "Todos los modelos"]])
    expect(options[1].hint).toContain("Gratis")
  })
})

describe("aiErrMsg", () => {
  it("cuota o límite no se confunde con modelo inexistente", () => {
    expect(aiErrMsg(new Error("429 Quota exceeded for model gemini-3.8-flash"))).toMatch(/límite/)
    expect(aiErrMsg(new Error("RESOURCE_EXHAUSTED: model is overloaded"))).toMatch(/límite/)
  })
  it("clave inválida", () => {
    expect(aiErrMsg(new Error("400 API key not valid. Please pass a valid API key."), "https://x")).toMatch(/clave no es válida.*https:\/\/x/)
    expect(aiErrMsg(new Error("401 Incorrect API key provided"))).toMatch(/clave/)
  })
  it("modelo que ya no existe", () => {
    expect(aiErrMsg(new Error("404 models/gemini-1.5-flash is not found for API version v1beta"))).toMatch(/modelo elegido/)
    expect(aiErrMsg(new Error("The model `gpt-4o-mini` has been deprecated"))).toMatch(/modelo elegido/)
    expect(aiErrMsg(new Error("No endpoints found for meta-llama/llama-3.3-70b-instruct:free."))).toMatch(/modelo elegido/)
  })
  it("otros errores se muestran tal cual (recortados)", () => {
    expect(aiErrMsg(new Error("algo raro"))).toBe("algo raro")
  })
})

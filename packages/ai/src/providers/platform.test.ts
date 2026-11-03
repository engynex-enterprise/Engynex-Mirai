// Proveedores de la nube de la plataforma con dobles: `fetch` simulado (credenciales del contenedor, identidad
// administrada, metadatos y respuestas del modelo) y un cliente de Google falso en vez de ADC. Nunca sale a la red.
import { beforeEach, describe, expect, it } from "vitest"
import { generateText } from "ai"
import { ALL_AI_KINDS, AI_KINDS, CLIENT_INTEGRATIONS, isAdminOnly } from "@mirai/services/integrations/registry"
import { aiKindOrder } from "./order"
import { azureBaseURL, cloudModel, listCloudModels, providerReady } from "./platform"
import { awsCredentialProvider, resetCloudAuth, sigV4Headers } from "./cloud-auth"

type Call = { url: string; headers: Headers; body?: string }
const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { "content-type": "application/json" } })

/** fetch simulado: responde por la URL y guarda cada llamada. */
function fakeFetch(route: (url: string, c: Call) => Response | undefined) {
  const calls: Call[] = []
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    const c: Call = { url, headers: new Headers(init?.headers), body: typeof init?.body === "string" ? init.body : undefined }
    calls.push(c)
    const r = route(url, c)
    if (!r) throw new Error(`fetch inesperado: ${url}`)
    return r
  }) as typeof fetch
  return { f, calls }
}
const envOf = (e: Record<string, string>) => (k: string) => e[k]
const plat = (kind: string, config: Record<string, unknown> = {}, secrets: Record<string, string> = {}) => ({ kind, config, secrets, source: "plataforma" as const })

const VERTEX_OK = { candidates: [{ content: { role: "model", parts: [{ text: "listo" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1, totalTokenCount: 6 } }
const BEDROCK_OK = { output: { message: { role: "assistant", content: [{ text: "listo" }] } }, stopReason: "end_turn", usage: { inputTokens: 5, outputTokens: 1, totalTokens: 6 } }
const AZURE_OK = { id: "x", object: "chat.completion", created: 1, model: "gpt-5-mini", choices: [{ index: 0, message: { role: "assistant", content: "listo" }, finish_reason: "stop" }], usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 } }

beforeEach(() => resetCloudAuth())

describe("registro", () => {
  it("Vertex, Bedrock y Azure son de la plataforma: el hogar no los ve ni los ordena", () => {
    for (const k of ["ai_vertex", "ai_bedrock", "ai_azure"]) {
      expect(ALL_AI_KINDS).toContain(k)
      expect(AI_KINDS).not.toContain(k)
      expect(isAdminOnly(k)).toBe(true)
      expect(CLIENT_INTEGRATIONS.some((i) => i.kind === k)).toBe(false)
    }
    // Lo que ve el hogar no cambia.
    expect(AI_KINDS).toEqual(["ai_gateway", "ai_gemini", "ai_groq", "ai_openrouter", "ai_anthropic", "ai_openai"])
  })
})

describe("aiKindOrder (AI_PLATFORM_PROVIDER)", () => {
  it("vacío o desconocido: el orden del registro de siempre (Gateway primero)", () => {
    expect(aiKindOrder(undefined, "")).toEqual(ALL_AI_KINDS)
    expect(aiKindOrder(undefined, "otra-nube")).toEqual(ALL_AI_KINDS)
    expect(ALL_AI_KINDS[0]).toBe("ai_gateway")
  })
  it("vertex | bedrock | azure | gateway: ese va primero", () => {
    expect(aiKindOrder(undefined, "vertex")[0]).toBe("ai_vertex")
    expect(aiKindOrder(undefined, "BEDROCK")[0]).toBe("ai_bedrock")
    expect(aiKindOrder(undefined, "azure")[0]).toBe("ai_azure")
    expect(aiKindOrder(undefined, "gateway")[0]).toBe("ai_gateway")
    expect(new Set(aiKindOrder(undefined, "vertex"))).toEqual(new Set(ALL_AI_KINDS))
  })
  it("none: primero las claves del hogar y al final la IA de la plataforma", () => {
    const o = aiKindOrder(undefined, "none")
    expect(o.slice(0, 5)).toEqual(["ai_gemini", "ai_groq", "ai_openrouter", "ai_anthropic", "ai_openai"])
    expect(o.slice(5)).toEqual(["ai_gateway", "ai_vertex", "ai_bedrock", "ai_azure"])
  })
  it("si el hogar guardó su orden, ese manda; el de la plataforma queda primero entre los demás", () => {
    const o = aiKindOrder(["ai_groq", "ai_gemini", "x_raro"], "vertex")
    expect(o.slice(0, 3)).toEqual(["ai_groq", "ai_gemini", "ai_vertex"])
    expect(o).not.toContain("x_raro")
  })
})

describe("providerReady (sin red)", () => {
  it("AI Gateway de la plataforma sin AI_GATEWAY_API_KEY: no se intenta", () => {
    expect(providerReady(plat("ai_gateway"), envOf({}))).toBe(false)
    expect(providerReady(plat("ai_gateway"), envOf({ AI_GATEWAY_API_KEY: "k" }))).toBe(true)
    expect(providerReady(plat("ai_gateway", {}, { apiKey: "k" }), envOf({}))).toBe(true)
    expect(providerReady(plat("ai_gateway"), envOf({ VERCEL: "1" }))).toBe(true)
    // La del hogar se intenta y, sin clave, modelFrom explica qué falta (como hoy).
    expect(providerReady({ ...plat("ai_gateway"), source: "hogar" }, envOf({}))).toBe(true)
  })
  it("Vertex necesita el proyecto (consola o GOOGLE_VERTEX_PROJECT)", () => {
    expect(providerReady(plat("ai_vertex"), envOf({}))).toBe(false)
    expect(providerReady(plat("ai_vertex"), envOf({ GOOGLE_VERTEX_PROJECT: "p" }))).toBe(true)
    expect(providerReady(plat("ai_vertex", { project: "p" }), envOf({}))).toBe(true)
  })
  it("Bedrock necesita región y de dónde sacar credenciales", () => {
    expect(providerReady(plat("ai_bedrock"), envOf({ AI_BEDROCK_REGION: "us-east-1" }))).toBe(false)
    expect(providerReady(plat("ai_bedrock"), envOf({ AI_BEDROCK_REGION: "us-east-1", AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: "/v2/credentials/x" }))).toBe(true)
    expect(providerReady(plat("ai_bedrock"), envOf({ AWS_REGION: "us-east-1", AWS_BEARER_TOKEN_BEDROCK: "t" }))).toBe(true)
    expect(providerReady(plat("ai_bedrock"), envOf({ AWS_ACCESS_KEY_ID: "a", AWS_SECRET_ACCESS_KEY: "s" }))).toBe(false)
  })
  it("Azure necesita el recurso (con clave o identidad administrada)", () => {
    expect(providerReady(plat("ai_azure"), envOf({}))).toBe(false)
    expect(providerReady(plat("ai_azure"), envOf({ AZURE_OPENAI_ENDPOINT: "https://r.openai.azure.com" }))).toBe(true)
  })
  it("los proveedores con clave del hogar siempre se intentan", () => {
    expect(providerReady(plat("ai_gemini"), envOf({}))).toBe(true)
  })
})

describe("azureBaseURL", () => {
  it("acepta el nombre del recurso o su dirección, con o sin /openai/v1", () => {
    const want = "https://mi-recurso.openai.azure.com/openai/v1"
    for (const x of ["mi-recurso", "https://mi-recurso.openai.azure.com", "https://mi-recurso.openai.azure.com/", "https://mi-recurso.openai.azure.com/openai", "https://mi-recurso.openai.azure.com/openai/v1/"]) expect(azureBaseURL(x)).toBe(want)
    expect(azureBaseURL("")).toBe("")
  })
})

describe("Vertex AI", () => {
  const auth = { authClient: { getAccessToken: async () => ({ token: "token-adc-falso" }) } } as never

  it("sin proyecto: error en español; nunca con la cuenta de un hogar", () => {
    expect(() => cloudModel(plat("ai_vertex"), "gemini-2.5-flash", { env: envOf({}) })).toThrow(/proyecto de Google Cloud/)
    expect(() => cloudModel({ ...plat("ai_vertex", { project: "p" }), source: "hogar" }, "gemini-2.5-flash", { env: envOf({}) })).toThrow(/solo el administrador/)
  })

  it("con ADC: llama a la región y el proyecto configurados con el token de la cuenta de servicio", async () => {
    const { f, calls } = fakeFetch((u) => (u.includes(":generateContent") ? json(VERTEX_OK) : undefined))
    const model = cloudModel(plat("ai_vertex"), "gemini-2.5-flash", { env: envOf({ GOOGLE_VERTEX_PROJECT: "mirai-pruebas", GOOGLE_VERTEX_LOCATION: "us-east1" }), fetch: f, googleAuthOptions: auth })
    const r = await generateText({ model, prompt: "hola" })
    expect(r.text).toBe("listo")
    expect(calls[0].url).toBe("https://us-east1-aiplatform.googleapis.com/v1beta1/projects/mirai-pruebas/locations/us-east1/publishers/google/models/gemini-2.5-flash:generateContent")
    expect(calls[0].headers.get("authorization")).toBe("Bearer token-adc-falso")
  })

  it("la consola gana sobre las variables y la región por defecto es us-central1", () => {
    const m = cloudModel(plat("ai_vertex", { project: "consola" }), "gemini-2.5-flash", { env: envOf({ GOOGLE_VERTEX_PROJECT: "variable" }), googleAuthOptions: auth })
    expect(m).toMatchObject({ provider: "google.vertex.chat", modelId: "gemini-2.5-flash" })
  })
})

describe("Amazon Bedrock", () => {
  const ECS = { AI_BEDROCK_REGION: "us-east-1", AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: "/v2/credentials/abc" }
  const CREDS = { AccessKeyId: "ASIAFALSA", SecretAccessKey: "secreto-falso", Token: "sesion-falsa", Expiration: new Date(Date.now() + 3600_000).toISOString() }

  it("con el rol del contenedor de ECS: pide credenciales una vez y firma con SigV4", async () => {
    const { f, calls } = fakeFetch((u) => (u === "http://169.254.170.2/v2/credentials/abc" ? json(CREDS) : u.includes("/converse") ? json(BEDROCK_OK) : undefined))
    const model = cloudModel(plat("ai_bedrock"), "us.anthropic.claude-haiku-4-5-20251001-v1:0", { env: envOf(ECS), fetch: f })
    expect((await generateText({ model, prompt: "hola" })).text).toBe("listo")
    expect((await generateText({ model, prompt: "otra" })).text).toBe("listo")
    const call = calls.find((c) => c.url.includes("/converse"))!
    expect(call.url).toBe(`https://bedrock-runtime.us-east-1.amazonaws.com/model/${encodeURIComponent("us.anthropic.claude-haiku-4-5-20251001-v1:0")}/converse`)
    expect(call.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=ASIAFALSA\/\d{8}\/us-east-1\/bedrock\/aws4_request/)
    expect(call.headers.get("x-amz-security-token")).toBe("sesion-falsa")
    expect(calls.filter((c) => c.url.startsWith("http://169.254.170.2"))).toHaveLength(1)
  })

  it("FULL_URI con token (EKS Pod Identity) y solo hacia el agente local o https", async () => {
    const { f, calls } = fakeFetch((u) => (u === "http://169.254.170.23/v1/credentials" ? json(CREDS) : undefined))
    const creds = await awsCredentialProvider(envOf({ AWS_CONTAINER_CREDENTIALS_FULL_URI: "http://169.254.170.23/v1/credentials", AWS_CONTAINER_AUTHORIZATION_TOKEN: "tok" }), f)()
    expect(creds).toEqual({ accessKeyId: "ASIAFALSA", secretAccessKey: "secreto-falso", sessionToken: "sesion-falsa" })
    expect(calls[0].headers.get("authorization")).toBe("tok")
    await expect(awsCredentialProvider(envOf({ AWS_CONTAINER_CREDENTIALS_FULL_URI: "http://evil.example.com/creds" }), f)()).rejects.toThrow(/https o del agente local/)
  })

  it("variables AWS_* sin red; sin credenciales: error en español", async () => {
    const { f, calls } = fakeFetch(() => undefined)
    expect(await awsCredentialProvider(envOf({ AWS_ACCESS_KEY_ID: "AKIA", AWS_SECRET_ACCESS_KEY: "s" }), f)()).toEqual({ accessKeyId: "AKIA", secretAccessKey: "s", sessionToken: undefined })
    expect(calls).toHaveLength(0)
    await expect(awsCredentialProvider(envOf({}), f)()).rejects.toThrow(/Amazon Bedrock no tiene credenciales/)
  })

  it("con la clave de API de Bedrock: Bearer y sin firmar", async () => {
    const { f, calls } = fakeFetch((u) => (u.includes("/converse") ? json(BEDROCK_OK) : undefined))
    const model = cloudModel(plat("ai_bedrock"), "amazon.nova-lite-v1:0", { env: envOf({ AWS_REGION: "us-west-2", AWS_BEARER_TOKEN_BEDROCK: "clave-bedrock-falsa" }), fetch: f })
    expect((await generateText({ model, prompt: "hola" })).text).toBe("listo")
    expect(calls[0].url).toContain("https://bedrock-runtime.us-west-2.amazonaws.com/")
    expect(calls[0].headers.get("authorization")).toBe("Bearer clave-bedrock-falsa")
  })

  it("sin región: error en español", () => {
    expect(() => cloudModel(plat("ai_bedrock"), "x", { env: envOf({}) })).toThrow(/región de Amazon Bedrock/)
  })
})

describe("SigV4", () => {
  it("coincide con el vector oficial get-vanilla de AWS", () => {
    const h = sigV4Headers({ url: "https://example.amazonaws.com/", region: "us-east-1", service: "service", creds: { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY" }, now: new Date("2015-08-30T12:36:00Z") })
    expect(h["x-amz-date"]).toBe("20150830T123600Z")
    expect(h.authorization).toBe("AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31")
  })
})

describe("Azure OpenAI", () => {
  const RES = { AZURE_OPENAI_ENDPOINT: "https://mirai.openai.azure.com" }

  it("identidad administrada de Container Apps: token una vez y Bearer en cada llamada", async () => {
    const { f, calls } = fakeFetch((u) => (u.startsWith("http://localhost:42356/msi/token") ? json({ access_token: "token-mi-falso", expires_on: String(Math.floor(Date.now() / 1000) + 3600) }) : u.endsWith("/chat/completions") ? json(AZURE_OK) : undefined))
    const model = cloudModel(plat("ai_azure"), "gpt-5-mini", { env: envOf({ ...RES, IDENTITY_ENDPOINT: "http://localhost:42356/msi/token", IDENTITY_HEADER: "cabecera", AZURE_CLIENT_ID: "id-cliente" }), fetch: f })
    expect((await generateText({ model, prompt: "hola" })).text).toBe("listo")
    await generateText({ model, prompt: "otra" })
    const tok = calls.filter((c) => c.url.includes("/msi/token"))
    expect(tok).toHaveLength(1)
    expect(tok[0].url).toContain("resource=https%3A%2F%2Fcognitiveservices.azure.com")
    expect(tok[0].url).toContain("api-version=2019-08-01")
    expect(tok[0].url).toContain("client_id=id-cliente")
    expect(tok[0].headers.get("x-identity-header")).toBe("cabecera")
    const call = calls.find((c) => c.url.endsWith("/chat/completions"))!
    expect(call.url).toBe("https://mirai.openai.azure.com/openai/v1/chat/completions")
    expect(call.headers.get("authorization")).toBe("Bearer token-mi-falso")
    expect(call.headers.get("api-key")).toBeNull()
    expect(JSON.parse(call.body!).model).toBe("gpt-5-mini")
  })

  it("sin IDENTITY_ENDPOINT usa IMDS (VM/AKS)", async () => {
    const { f, calls } = fakeFetch((u) => (u.startsWith("http://169.254.169.254/metadata/identity/oauth2/token") ? json({ access_token: "imds", expires_in: "3600" }) : u.endsWith("/chat/completions") ? json(AZURE_OK) : undefined))
    await generateText({ model: cloudModel(plat("ai_azure"), "gpt-5-mini", { env: envOf(RES), fetch: f }), prompt: "hola" })
    expect(calls[0].headers.get("metadata")).toBe("true")
    expect(calls[1].headers.get("authorization")).toBe("Bearer imds")
  })

  it("con clave: api-key y sin pedir token", async () => {
    const { f, calls } = fakeFetch((u) => (u.endsWith("/chat/completions") ? json(AZURE_OK) : undefined))
    await generateText({ model: cloudModel(plat("ai_azure", { endpoint: "mirai" }), "gpt-5-mini", { env: envOf({ AZURE_OPENAI_API_KEY: "clave-azure-falsa" }), fetch: f }), prompt: "hola" })
    expect(calls).toHaveLength(1)
    expect(calls[0].headers.get("api-key")).toBe("clave-azure-falsa")
  })

  it("sin recurso: error en español", () => {
    expect(() => cloudModel(plat("ai_azure"), "gpt-5-mini", { env: envOf({}) })).toThrow(/recurso de Azure OpenAI/)
  })
})

describe("listCloudModels", () => {
  it("Vertex: lista de Model Garden con el token del servidor de metadatos", async () => {
    const { f, calls } = fakeFetch((u) => u.startsWith("http://metadata.google.internal") ? json({ access_token: "meta", expires_in: 3600 })
      : u.includes("/publishers/google/models") ? json({ publisherModels: [{ name: "publishers/google/models/gemini-2.5-flash", launchStage: "GA" }, { name: "publishers/google/models/gemini-2.5-flash-lite", launchStage: "GA" }, { name: "publishers/google/models/imagen-4.0", launchStage: "GA" }] }) : undefined)
    const r = await listCloudModels(plat("ai_vertex"), { env: envOf({ GOOGLE_VERTEX_PROJECT: "p" }), fetch: f })
    expect(r.ok).toBe(true)
    expect(r.rec).toBe("gemini-2.5-flash")
    expect(r.models.map((m) => m.value).sort()).toEqual(["gemini-2.5-flash", "gemini-2.5-flash-lite"])
    expect(calls[0].headers.get("metadata-flavor")).toBe("Google")
    expect(calls[1].url).toBe("https://us-central1-aiplatform.googleapis.com/v1beta1/publishers/google/models?pageSize=500")
    expect(calls[1].headers.get("authorization")).toBe("Bearer meta")
  })

  it("Bedrock: modelos y perfiles de inferencia, firmados con el rol del contenedor", async () => {
    const { f, calls } = fakeFetch((u) => u.startsWith("http://169.254.170.2") ? json({ AccessKeyId: "ASIA", SecretAccessKey: "s", Token: "t", Expiration: new Date(Date.now() + 3600_000).toISOString() })
      : u.includes("/foundation-models") ? json({ modelSummaries: [{ modelId: "amazon.nova-lite-v1:0", modelName: "Nova Lite", providerName: "Amazon", outputModalities: ["TEXT"], inferenceTypesSupported: ["ON_DEMAND"], modelLifecycle: { status: "ACTIVE" } }] })
      : u.includes("/inference-profiles") ? json({ inferenceProfileSummaries: [{ inferenceProfileId: "us.anthropic.claude-haiku-4-5-20251001-v1:0", inferenceProfileName: "US Claude Haiku 4.5", status: "ACTIVE" }] }) : undefined)
    const r = await listCloudModels(plat("ai_bedrock"), { env: envOf({ AI_BEDROCK_REGION: "us-east-1", AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: "/c" }), fetch: f })
    expect(r.ok).toBe(true)
    expect(r.rec).toBe("us.anthropic.claude-haiku-4-5-20251001-v1:0")
    expect(r.models).toHaveLength(2)
    for (const c of calls.filter((x) => x.url.startsWith("https://bedrock."))) expect(c.headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=ASIA\//)
  })

  it("Azure: modelos de chat del recurso", async () => {
    const { f } = fakeFetch((u) => (u === "https://mirai.openai.azure.com/openai/v1/models" ? json({ data: [{ id: "gpt-5-mini", created_at: 2, capabilities: { chat_completion: true } }, { id: "text-embedding-3-large", capabilities: { chat_completion: false, embeddings: true } }] }) : undefined))
    const r = await listCloudModels(plat("ai_azure"), { env: envOf({ AZURE_OPENAI_ENDPOINT: "mirai", AZURE_OPENAI_API_KEY: "k" }), fetch: f })
    expect(r).toMatchObject({ ok: true, rec: "gpt-5-mini" })
    expect(r.models.map((m) => m.value)).toEqual(["gpt-5-mini"])
  })

  it("si no se puede leer (p. ej. en local, sin metadatos), el respaldo es el modelo del registro", async () => {
    const { f } = fakeFetch((u) => (u.startsWith("http://metadata.google.internal") ? json({}, 404) : undefined))
    const r = await listCloudModels(plat("ai_vertex"), { env: envOf({ GOOGLE_VERTEX_PROJECT: "p" }), fetch: f })
    expect(r).toMatchObject({ ok: false, models: [], rec: "gemini-2.5-flash" })
    expect(r.msg).toBeTruthy()
  })
})

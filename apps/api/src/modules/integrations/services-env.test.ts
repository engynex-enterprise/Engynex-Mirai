import { describe, expect, it } from "vitest"
import { loadServicesEnv } from "./services-env"

describe("variables de F2-E", () => {
  it("valores por defecto según el ambiente y alias de la web", () => {
    const v = loadServicesEnv({ MIRAI_ENV: "pruebas", NEXT_PUBLIC_VAPID_PUBLIC_KEY: "BPub", VAPID_PRIVATE_KEY: "priv" })
    expect(v.siteUrl).toBe("https://engynex-mirai-pruebas.vercel.app")
    expect(v.publicSiteUrl).toBe("https://engynex-mirai-pruebas.vercel.app")
    expect(v.apiPublicUrl).toBe("http://localhost:8080")
    expect(v.vars.NEXT_PUBLIC_VAPID_PUBLIC_KEY).toBe("BPub")
    expect(v.tickDailyTasks).toBe(true)
    expect(loadServicesEnv({ MIRAI_ENV: "local" }).publicSiteUrl).toBe("https://mirai.engynex.com")
  })
  it("los vacíos que pone Terraform cuentan como no definidos (la API arranca)", () => {
    const v = loadServicesEnv({ MIRAI_ENV: "produccion", GOOGLE_CLIENT_ID: "", VAPID_PUBLIC_KEY: "", SITE_URL: "", GOOGLE_OAUTH_STATE_KEY: "", TICK_DAILY_TASKS: "0" })
    expect(v.siteUrl).toBe("https://mirai.engynex.com")
    expect(v.vars.GOOGLE_CLIENT_ID).toBeUndefined()
    expect(v.googleStateKey).toBeUndefined()
    expect(v.tickDailyTasks).toBe(false)
  })
  it("IA de la plataforma (V7-P): las variables de la nube llegan a rt().env; vacías = sin definir", () => {
    const v = loadServicesEnv({ AI_PLATFORM_PROVIDER: "vertex", GOOGLE_VERTEX_PROJECT: "mirai-pruebas", AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: "/v2/c", AZURE_OPENAI_ENDPOINT: "" })
    expect(v.vars).toMatchObject({ AI_PLATFORM_PROVIDER: "vertex", GOOGLE_VERTEX_PROJECT: "mirai-pruebas", AWS_CONTAINER_CREDENTIALS_RELATIVE_URI: "/v2/c" })
    expect(v.vars.AZURE_OPENAI_ENDPOINT).toBeUndefined()
    expect(v.vars.AI_GATEWAY_API_KEY).toBeUndefined()
  })
  it("una llave del state corta o una URL inválida: error con el nombre (nunca el valor)", () => {
    expect(() => loadServicesEnv({ GOOGLE_OAUTH_STATE_KEY: "corta" })).toThrow(/GOOGLE_OAUTH_STATE_KEY/)
    expect(() => loadServicesEnv({ SITE_URL: "no-es-url" })).toThrow(/SITE_URL/)
    try { loadServicesEnv({ GOOGLE_OAUTH_STATE_KEY: "valor-secreto-corto" }) } catch (e) { expect(String(e)).not.toMatch(/valor-secreto-corto/) }
  })
})

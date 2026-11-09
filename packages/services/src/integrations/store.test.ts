// La integración efectiva de la plataforma cuando las credenciales viven en las variables del servidor (Dokploy):
// es lo que decide si Mirai envía correos (invitaciones, verificación, recuperación de clave) y WhatsApp.
import { beforeEach, describe, expect, it } from "vitest"
import { configureServices } from "../runtime"
import { getGlobalIntegration, getIntegration } from "./store"

type Row = Record<string, unknown>

/** Doble mínimo de PostgREST: from(tabla).select().eq()…maybeSingle() y rpc("household_plan"). */
const db = (tablas: Record<string, Row[]>, plan = "gratis") => {
  const chain = (tabla: string, filtros: [string, unknown][] = []): Record<string, unknown> => ({
    select: () => chain(tabla, filtros),
    eq: (c: string, v: unknown) => chain(tabla, [...filtros, [c, v]]),
    maybeSingle: async () => ({ data: (tablas[tabla] ?? []).find((r) => filtros.every(([c, v]) => r[c] === v)) ?? null }),
  })
  return { from: (tabla: string) => chain(tabla), rpc: async () => ({ data: plan }) }
}

const configurar = (tablas: Record<string, Row[]>, env: Record<string, string> = {}, plan = "gratis") =>
  configureServices({
    admin: () => db(tablas, plan) as never,
    encrypt: (s) => s,
    decrypt: (s) => s,
    env: (n) => env[n],
    siteUrl: () => "https://mirai.engynex.com",
    publicSiteUrl: () => "https://mirai.engynex.com",
    loadBook: async () => ({}) as never,
  })

const RESEND = { RESEND_API_KEY: "re_123", MAIL_FROM: "avisos@engynex.com" }
const H = "hogar-1"

beforeEach(() => configurar({}))

describe("getGlobalIntegration con las variables del servidor", () => {
  it("sin fila y sin variables: no hay correo", async () => {
    expect(await getGlobalIntegration("email_resend")).toBeNull()
  })

  it("sin fila y con las variables: queda activa para todos los planes", async () => {
    configurar({}, RESEND)
    expect(await getGlobalIntegration("email_resend")).toEqual({
      modo: "obligatoria", planes: [], config: { from: "avisos@engynex.com", fromName: "Mirai" }, secrets: { apiKey: "re_123" }, desdeEnv: true,
    })
  })

  it("la IA nunca se enciende por aquí (tiene sus propios modos por hogar)", async () => {
    configurar({}, { ...RESEND, AI_GATEWAY_API_KEY: "k" })
    expect(await getGlobalIntegration("ai_gateway")).toBeNull()
  })

  it("lo guardado en la consola manda campo a campo; lo vacío sale de las variables", async () => {
    configurar({ platform_integrations: [{ kind: "email_resend", modo: "obligatoria", planes: [], config: { from: "hola@engynex.com" }, secrets_enc: null }] }, RESEND)
    const g = await getGlobalIntegration("email_resend")
    expect(g).toMatchObject({ modo: "obligatoria", config: { from: "hola@engynex.com", fromName: "Mirai" }, secrets: { apiKey: "re_123" }, desdeEnv: false })
  })

  it("si el administrador la apaga, se apaga aunque la variable exista", async () => {
    configurar({ platform_integrations: [{ kind: "email_resend", modo: "apagada", planes: [], config: {}, secrets_enc: null }] }, RESEND)
    expect((await getGlobalIntegration("email_resend"))?.modo).toBe("apagada")
    expect(await getIntegration(H, "email_resend")).toBeNull()
  })
})

describe("getIntegration de un hogar", () => {
  it("el correo del servidor llega a todos los hogares como integración de la plataforma", async () => {
    configurar({}, RESEND)
    expect(await getIntegration(H, "email_resend")).toEqual({
      kind: "email_resend", enabled: true, config: { from: "avisos@engynex.com", fromName: "Mirai" }, secrets: { apiKey: "re_123" }, source: "plataforma",
    })
  })

  it("sin variables no hay correo: la invitación se comparte a mano", async () => {
    expect(await getIntegration(H, "email_resend")).toBeNull()
  })

  it("WhatsApp del servidor: token y número para todos los hogares", async () => {
    configurar({}, { WHATSAPP_TOKEN: "EAAG", WHATSAPP_PHONE_ID: "1234567" })
    expect(await getIntegration(H, "whatsapp")).toMatchObject({ enabled: true, config: { phoneId: "1234567", template: "mirai_resumen" }, secrets: { token: "EAAG" } })
  })

  it("una fila solo para Premium no le llega al plan gratis", async () => {
    configurar({ platform_integrations: [{ kind: "email_resend", modo: "obligatoria", planes: ["premium"], config: {}, secrets_enc: null }] }, RESEND, "gratis")
    expect(await getIntegration(H, "email_resend")).toBeNull()
    configurar({ platform_integrations: [{ kind: "email_resend", modo: "obligatoria", planes: ["premium"], config: {}, secrets_enc: null }] }, RESEND, "premium")
    expect(await getIntegration(H, "email_resend")).toMatchObject({ enabled: true })
  })
})

import { describe, expect, it } from "vitest"
import { ENV_INTEGRATION_VARS, integrationFromEnv } from "./env"

const read = (vars: Record<string, string>) => (n: string) => vars[n]

describe("integrationFromEnv", () => {
  it("no enciende nada sin variables", () => {
    expect(integrationFromEnv("email_resend", read({}))).toBeNull()
    expect(integrationFromEnv("whatsapp", read({}))).toBeNull()
    expect(integrationFromEnv("telegram", read({}))).toBeNull()
  })

  it("no enciende las que el hogar configura (IA) ni las desconocidas", () => {
    expect(integrationFromEnv("ai_gateway", read({ AI_GATEWAY_API_KEY: "k" }))).toBeNull()
    expect(integrationFromEnv("ai_gemini", read({ AI_GATEWAY_API_KEY: "k" }))).toBeNull()
    expect(integrationFromEnv("inventada", read({ RESEND_API_KEY: "k" }))).toBeNull()
  })

  it("Resend con la clave y el remitente del despliegue", () => {
    const v = integrationFromEnv("email_resend", read({ RESEND_API_KEY: "re_123", MAIL_FROM: "avisos@engynex.com", MAIL_FROM_NAME: "Mirai" }))
    expect(v).toEqual({ config: { from: "avisos@engynex.com", fromName: "Mirai" }, secrets: { apiKey: "re_123" } })
  })

  it("Resend toma el remitente de AUTH_MAIL_FROM si no hay MAIL_FROM, y Mirai como nombre", () => {
    const v = integrationFromEnv("email_resend", read({ RESEND_API_KEY: "re_123", AUTH_MAIL_FROM: "no-responder@mirai.engynex.com" }))
    expect(v).toEqual({ config: { from: "no-responder@mirai.engynex.com", fromName: "Mirai" }, secrets: { apiKey: "re_123" } })
  })

  it("sin remitente no enciende el correo (Resend lo exige)", () => {
    expect(integrationFromEnv("email_resend", read({ RESEND_API_KEY: "re_123" }))).toBeNull()
    expect(integrationFromEnv("email_brevo", read({ BREVO_API_KEY: "k" }))).toBeNull()
    expect(integrationFromEnv("email_sendgrid", read({ SENDGRID_API_KEY: "k" }))).toBeNull()
  })

  it("SMTP con valores por defecto de puerto y SSL", () => {
    const v = integrationFromEnv("email_smtp", read({ SMTP_HOST: "smtp.hostinger.com", SMTP_USER: "avisos@engynex.com", SMTP_PASS: "x", MAIL_FROM: "avisos@engynex.com" }))
    expect(v).toEqual({ config: { host: "smtp.hostinger.com", port: 465, secure: true, user: "avisos@engynex.com", from: "avisos@engynex.com", fromName: "Mirai" }, secrets: { pass: "x" } })
  })

  it("SMTP respeta puerto y SSL del despliegue", () => {
    const v = integrationFromEnv("email_smtp", read({ SMTP_HOST: "smtp.tudominio.co", SMTP_PORT: "587", SMTP_SECURE: "false", SMTP_USER: "u", SMTP_PASS: "p", MAIL_FROM: "a@b.co" }))
    expect(v?.config).toMatchObject({ port: 587, secure: false })
  })

  it("SMTP sin usuario o sin clave no enciende", () => {
    expect(integrationFromEnv("email_smtp", read({ SMTP_HOST: "h", SMTP_USER: "u", MAIL_FROM: "a@b.co" }))).toBeNull()
    expect(integrationFromEnv("email_smtp", read({ SMTP_HOST: "h", SMTP_PASS: "p", MAIL_FROM: "a@b.co" }))).toBeNull()
  })

  it("Gmail con contraseña de aplicación (el remitente es la misma cuenta)", () => {
    const v = integrationFromEnv("email_gmail", read({ GMAIL_USER: "yo@gmail.com", GMAIL_APP_PASSWORD: "abcd efgh" }))
    expect(v).toEqual({ config: { user: "yo@gmail.com", fromName: "Mirai" }, secrets: { pass: "abcd efgh" } })
  })

  it("WhatsApp con token y número, con plantilla e idioma por defecto", () => {
    const v = integrationFromEnv("whatsapp", read({ WHATSAPP_TOKEN: "EAAG", WHATSAPP_PHONE_ID: "123456789" }))
    expect(v).toEqual({ config: { phoneId: "123456789", template: "mirai_resumen", lang: "es_CO" }, secrets: { token: "EAAG" } })
  })

  it("WhatsApp con cuenta de negocio, plantilla e idioma propios", () => {
    const v = integrationFromEnv("whatsapp", read({ WHATSAPP_TOKEN: "EAAG", WHATSAPP_PHONE_ID: "123456789", WHATSAPP_WABA_ID: "987654321", WHATSAPP_TEMPLATE: "mirai_aviso", WHATSAPP_LANG: "es" }))
    expect(v?.config).toEqual({ phoneId: "123456789", wabaId: "987654321", template: "mirai_aviso", lang: "es" })
  })

  it("WhatsApp sin el ID del número no enciende", () => {
    expect(integrationFromEnv("whatsapp", read({ WHATSAPP_TOKEN: "EAAG" }))).toBeNull()
  })

  it("Telegram con el token del bot", () => {
    const v = integrationFromEnv("telegram", read({ TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_BOT_NAME: "@MiraiBot" }))
    expect(v).toEqual({ config: { botName: "@MiraiBot" }, secrets: { botToken: "123:abc" } })
  })

  it("ignora los espacios y los valores vacíos", () => {
    expect(integrationFromEnv("email_resend", read({ RESEND_API_KEY: "  ", MAIL_FROM: "a@b.co" }))).toBeNull()
    const v = integrationFromEnv("telegram", read({ TELEGRAM_BOT_TOKEN: " 123:abc ", TELEGRAM_BOT_NAME: "   " }))
    expect(v).toEqual({ config: {}, secrets: { botToken: "123:abc" } })
  })

  it("publica los nombres de las variables para documentarlas y pasarlas al contenedor", () => {
    expect(ENV_INTEGRATION_VARS).toContain("RESEND_API_KEY")
    expect(ENV_INTEGRATION_VARS).toContain("WHATSAPP_TOKEN")
    expect(ENV_INTEGRATION_VARS).toContain("MAIL_FROM")
    expect(new Set(ENV_INTEGRATION_VARS).size).toBe(ENV_INTEGRATION_VARS.length)
  })
})

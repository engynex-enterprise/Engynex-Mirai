// Registro único de integraciones de Mirai. Cada una se activa, ajusta y prueba en Ajustes › Integraciones.
// Los campos "secret" se guardan cifrados (AES-256-GCM) y el navegador solo ve ••••1234.

export type FieldType = "text" | "secret" | "number" | "select" | "email" | "url" | "boolean" | "model"
export type IntegrationField = { k: string; l: string; type: FieldType; placeholder?: string; options?: { value: string; label: string }[]; help?: string; required?: boolean; def?: string | number | boolean }
export type IntegrationCategory = "ia" | "avisos" | "datos" | "google" | "infra"

export type IntegrationDef = {
  kind: string
  cat: IntegrationCategory
  n: string
  d: string
  icon: string
  /** household: cada hogar la configura · platform: la configura el administrador del despliegue */
  scope: "household" | "platform"
  free: "gratis" | "plan-gratis" | "pago"
  url?: string
  fields: IntegrationField[]
  /** Variable de entorno que, si existe, la habilita sin configurar nada. */
  env?: string
  /** Solo se configura en la consola (Integraciones globales); los hogares no la ven. */
  adminOnly?: boolean
  testable?: boolean
}

export const CATS: Record<IntegrationCategory, { n: string; d: string; icon: string }> = {
  ia: { n: "Inteligencia artificial", d: "Consejero, chat, lectura de facturas y clasificación automática.", icon: "sparkles" },
  avisos: { n: "Avisos", d: "Por dónde te llegan los recordatorios de pagos y cobros.", icon: "bell" },
  datos: { n: "Datos financieros", d: "TRM, tasa de usura, festivos, cambio de monedas, cripto y acciones.", icon: "chart-line" },
  google: { n: "Google", d: "Lee el correo del banco y lleva tus pagos a Google Calendar.", icon: "mail" },
  infra: { n: "Infraestructura", d: "Protección contra bots, errores, analítica y límites de uso.", icon: "server" },
}

const model = (def: string): IntegrationField => ({ k: "model", l: "Modelo", type: "model", def, help: "La lista sale de tu cuenta en el proveedor. Si no sabes cuál usar, deja el recomendado." })
const apiKey = (url: string): IntegrationField => ({ k: "apiKey", l: "Clave de API", type: "secret", required: true, help: `Créala en ${url}. Las cuentas personales (ChatGPT Plus, Gemini Advanced, Claude Pro) no sirven: se necesita una clave de API.` })

export const INTEGRATIONS: IntegrationDef[] = [
  // ── IA
  { kind: "ai_gateway", cat: "ia", n: "Vercel AI Gateway", d: "Una sola clave para Claude, OpenAI, Gemini, Kimi y más. Requiere una tarjeta registrada en Vercel (incluye créditos gratis).", icon: "network", scope: "platform", free: "plan-gratis", url: "https://vercel.com/ai-gateway", env: "AI_GATEWAY_API_KEY", fields: [{ ...apiKey("vercel.com › AI Gateway"), required: false, help: "Si ya está en las variables de Vercel (AI_GATEWAY_API_KEY) déjalo vacío." }, model("google/gemini-2.5-flash")], testable: true },
  { kind: "ai_gemini", cat: "ia", n: "Google Gemini", d: "Plan gratis generoso. Recomendado para empezar sin pagar: chat, consejero y lectura de facturas.", icon: "sparkles", scope: "household", free: "plan-gratis", url: "https://aistudio.google.com/apikey", fields: [apiKey("aistudio.google.com"), model("gemini-flash-latest")], testable: true },
  { kind: "ai_groq", cat: "ia", n: "Groq", d: "Modelos abiertos muy rápidos con plan gratis (con límites). Buen respaldo.", icon: "zap", scope: "household", free: "plan-gratis", url: "https://console.groq.com/keys", fields: [apiKey("console.groq.com"), model("llama-3.3-70b-versatile")], testable: true },
  { kind: "ai_openrouter", cat: "ia", n: "OpenRouter", d: "Acceso a muchos modelos, algunos gratis (terminan en :free).", icon: "route", scope: "household", free: "plan-gratis", url: "https://openrouter.ai/keys", fields: [apiKey("openrouter.ai"), model("openrouter/free")], testable: true },
  { kind: "ai_anthropic", cat: "ia", n: "Claude (Anthropic)", d: "Usa tu propia clave de la API de Anthropic. El uso se cobra en tu cuenta.", icon: "brain", scope: "household", free: "pago", url: "https://console.anthropic.com", fields: [apiKey("console.anthropic.com"), model("claude-haiku-4-5")], testable: true },
  { kind: "ai_openai", cat: "ia", n: "OpenAI (ChatGPT)", d: "Usa tu clave de la API de OpenAI. El uso se cobra en tu cuenta.", icon: "bot", scope: "household", free: "pago", url: "https://platform.openai.com/api-keys", fields: [apiKey("platform.openai.com"), model("gpt-5-mini")], testable: true },

  // ── Avisos
  { kind: "email_resend", cat: "avisos", n: "Correo con Resend", d: "3.000 correos al mes gratis. Necesitas un dominio verificado (o usa onboarding@resend.dev para probar).", icon: "mail", scope: "household", free: "plan-gratis", url: "https://resend.com", fields: [apiKey("resend.com › API Keys"), { k: "from", l: "Remitente", type: "email", required: true, placeholder: "avisos@tudominio.co" }, { k: "fromName", l: "Nombre del remitente", type: "text", def: "Mirai" }], testable: true },
  { kind: "email_brevo", cat: "avisos", n: "Correo con Brevo", d: "Unos 300 correos al día gratis.", icon: "mail", scope: "household", free: "plan-gratis", url: "https://app.brevo.com/settings/keys/api", fields: [apiKey("brevo.com"), { k: "from", l: "Remitente", type: "email", required: true }, { k: "fromName", l: "Nombre del remitente", type: "text", def: "Mirai" }], testable: true },
  { kind: "email_sendgrid", cat: "avisos", n: "Correo con SendGrid", d: "Remitente verificado y clave con permiso Mail Send.", icon: "mail", scope: "household", free: "plan-gratis", url: "https://app.sendgrid.com/settings/api_keys", fields: [apiKey("sendgrid.com"), { k: "from", l: "Remitente verificado", type: "email", required: true }, { k: "fromName", l: "Nombre del remitente", type: "text", def: "Mirai" }], testable: true },
  { kind: "email_gmail", cat: "avisos", n: "Correo con Gmail", d: "Con una contraseña de aplicación (requiere verificación en 2 pasos en tu cuenta de Google).", icon: "mail", scope: "household", free: "gratis", url: "https://myaccount.google.com/apppasswords", fields: [{ k: "user", l: "Tu correo de Gmail", type: "email", required: true }, { k: "pass", l: "Contraseña de aplicación", type: "secret", required: true }, { k: "fromName", l: "Nombre del remitente", type: "text", def: "Mirai" }], testable: true },
  { kind: "email_smtp", cat: "avisos", n: "Correo con SMTP", d: "Cualquier servidor de correo.", icon: "server", scope: "household", free: "gratis", fields: [{ k: "host", l: "Servidor", type: "text", required: true, placeholder: "smtp.tudominio.co" }, { k: "port", l: "Puerto", type: "number", def: 465 }, { k: "secure", l: "SSL/TLS", type: "boolean", def: true }, { k: "user", l: "Usuario", type: "text", required: true }, { k: "pass", l: "Contraseña", type: "secret", required: true }, { k: "from", l: "Remitente", type: "email", required: true }, { k: "fromName", l: "Nombre del remitente", type: "text", def: "Mirai" }], testable: true },
  { kind: "telegram", cat: "avisos", n: "Telegram", d: "100 % gratis y sin aprobación. Crea un bot con @BotFather y vincula tu chat.", icon: "send", scope: "household", free: "gratis", url: "https://t.me/BotFather", fields: [{ k: "botToken", l: "Token del bot", type: "secret", required: true, help: "Te lo da @BotFather al crear el bot." }, { k: "botName", l: "Usuario del bot", type: "text", placeholder: "@MiraiFamiliaBot" }], testable: true },
  { kind: "webpush", cat: "avisos", n: "Notificaciones push", d: "Avisos al celular o computador desde la app instalada. Gratis, sin servicio externo.", icon: "bell-ring", scope: "household", free: "gratis", fields: [], testable: true },
  { kind: "whatsapp", cat: "avisos", n: "WhatsApp Cloud API", d: "Meta cobra por mensaje según el tipo de plantilla. Opcional.", icon: "message-circle", scope: "household", free: "pago", url: "https://developers.facebook.com/docs/whatsapp/cloud-api", fields: [{ k: "phoneId", l: "ID del número de teléfono", type: "text", required: true }, { k: "token", l: "Token de acceso", type: "secret", required: true }, { k: "template", l: "Nombre de la plantilla", type: "text", help: "Plantilla aprobada por Meta para el resumen diario. Si la dejas vacía se envía texto (solo funciona dentro de la ventana de 24 h)." }, { k: "lang", l: "Idioma de la plantilla", type: "text", def: "es_CO" }], testable: true },

  // ── Datos
  { kind: "trm", cat: "datos", n: "TRM del día", d: "Tasa de cambio oficial desde datos.gov.co (Superfinanciera). Sin clave.", icon: "dollar-sign", scope: "household", free: "gratis", url: "https://www.datos.gov.co", fields: [], testable: true },
  { kind: "usura", cat: "datos", n: "Tasa de usura", d: "Tasa máxima legal vigente (Superfinanciera). Mirai avisa si un préstamo cobra más de lo permitido.", icon: "scale", scope: "household", free: "gratis", url: "https://www.superfinanciera.gov.co", fields: [], testable: true },
  { kind: "festivos", cat: "datos", n: "Festivos de Colombia", d: "Para correr las fechas de pago al siguiente día hábil (Nager.Date). Sin clave.", icon: "calendar-heart", scope: "household", free: "gratis", url: "https://date.nager.at", fields: [], testable: true },
  { kind: "fx", cat: "datos", n: "Cambio de monedas", d: "Dólares, euros y otras monedas a pesos (open.er-api.com). Sin clave.", icon: "arrow-left-right", scope: "household", free: "gratis", url: "https://www.exchangerate-api.com", fields: [], testable: true },
  { kind: "coingecko", cat: "datos", n: "Precios de cripto", d: "Actualiza el valor de tus inversiones en cripto (CoinGecko, plan gratis).", icon: "bitcoin", scope: "household", free: "plan-gratis", url: "https://www.coingecko.com/en/api", fields: [{ k: "apiKey", l: "Clave demo (opcional)", type: "secret" }], testable: true },
  { kind: "stocks", cat: "datos", n: "Acciones y ETF", d: "Precios de acciones internacionales (Alpha Vantage o Twelve Data, plan gratis con límites).", icon: "chart-candlestick", scope: "household", free: "plan-gratis", fields: [{ k: "provider", l: "Proveedor", type: "select", options: [{ value: "alphavantage", label: "Alpha Vantage" }, { value: "twelvedata", label: "Twelve Data" }], def: "alphavantage" }, { k: "apiKey", l: "Clave de API", type: "secret", required: true }], testable: true },

  // ── Google
  { kind: "google_gmail", cat: "google", n: "Gmail (correo del banco)", d: "Lee solo las notificaciones de compras de tus bancos para registrarlas. Permiso de solo lectura.", icon: "mail-search", scope: "household", free: "gratis", fields: [], testable: false },
  { kind: "google_calendar", cat: "google", n: "Google Calendar", d: "Lleva tus próximos pagos y cobros a tu calendario para recibir avisos en el celular.", icon: "calendar-check", scope: "household", free: "gratis", fields: [{ k: "calendarId", l: "Calendario", type: "text", def: "primary" }], testable: false },

  // ── Infraestructura (del despliegue)
  { kind: "turnstile", cat: "infra", n: "Cloudflare Turnstile", d: "Captcha invisible en el registro y el login contra bots. Gratis.", icon: "shield-check", scope: "platform", free: "gratis", url: "https://dash.cloudflare.com/?to=/:account/turnstile", fields: [{ k: "siteKey", l: "Site key", type: "text", required: true }, { k: "secretKey", l: "Secret key", type: "secret", required: true, help: "Pégala también en Supabase › Auth › Bot and Abuse Protection." }] },
  { kind: "sentry", cat: "infra", n: "Sentry", d: "Te avisa de errores antes de que tu familia los note. Plan gratis.", icon: "bug", scope: "platform", free: "plan-gratis", url: "https://sentry.io", fields: [{ k: "dsn", l: "DSN", type: "url", required: true }] },
  { kind: "adsense", cat: "infra", n: "Google AdSense", d: "Anuncios de Google en los espacios del plan gratis que no tengan un anuncio propio. Solo se muestran a quien acepte las cookies de publicidad.", icon: "megaphone", scope: "platform", free: "gratis", url: "https://www.google.com/adsense", adminOnly: true, fields: [{ k: "client", l: "Id de cliente (ca-pub-…)", type: "text", required: true, placeholder: "ca-pub-1234567890123456", help: "AdSense › Cuenta › Información de la cuenta. Con esto Mirai publica también /ads.txt." }, { k: "slot", l: "Id del bloque de anuncios", type: "text", required: true, placeholder: "1234567890", help: "AdSense › Anuncios › Por bloque de anuncios › crea un bloque \"Display\" adaptable y copia su id (data-ad-slot)." }] },
  { kind: "analytics", cat: "infra", n: "Vercel Analytics y Speed Insights", d: "Visitas y velocidad real de la app, sin cookies. Se activan en el panel de Vercel.", icon: "gauge", scope: "platform", free: "plan-gratis", fields: [] },
  { kind: "upstash", cat: "infra", n: "Upstash Redis", d: "Límite de peticiones por usuario para que nadie abuse de la IA. Plan gratis.", icon: "database-zap", scope: "platform", free: "plan-gratis", url: "https://console.upstash.com", fields: [{ k: "url", l: "REST URL", type: "url", required: true }, { k: "token", l: "REST token", type: "secret", required: true }, { k: "aiPerHour", l: "Consultas de IA por hora por usuario", type: "number", def: 60 }] },
]

export const integrationByKind = (k: string) => INTEGRATIONS.find((i) => i.kind === k)
export const AI_KINDS = INTEGRATIONS.filter((i) => i.cat === "ia").map((i) => i.kind)
export const isSecret = (kind: string, k: string) => integrationByKind(kind)?.fields.find((f) => f.k === k)?.type === "secret"

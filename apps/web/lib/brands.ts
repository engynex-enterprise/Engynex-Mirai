import BRANDS_RAW from "@/lib/data/brands.json"

// Logos de servicios de terceros (scripts/brand-logos.mjs): solo identifican el servicio y no se modifican.
export type Brand = {
  n: string; cat: string; kw: string; body?: string; w?: number; h?: number; src?: string; mono?: { bg: string; t: string; fg: string }
  /** Ícono oficial publicado por la entidad en su sitio (scripts/brand-official.mjs), servido desde /public/brands. */
  img?: string
  /** El ícono llena su cuadro (esquinas opacas): se dibuja sin placa ni margen. */
  bleed?: boolean
}
export const BRANDS = BRANDS_RAW as Record<string, Brand>

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
// El orden del JSON es el de prioridad: "youtube music" antes que "youtube", "apple tv" antes que "apple".
const MATCHERS = Object.entries(BRANDS).map(([k, b]) => [k, new RegExp(b.kw)] as const)

/** Marca que corresponde a un texto libre (nombre de una suscripción, tarjeta o servicio). */
export function brandFor(text: string | null | undefined): string | null {
  if (!text) return null
  const t = norm(text)
  // Gana la primera marca del JSON, salvo que una posterior coincida con un texto que contiene al de la primera
  // ("google one" contiene "google"; "visa" y "bancolombia" no se contienen: gana el orden).
  let best: string | null = null, at = -1, end = -1
  for (const [k, re] of MATCHERS) {
    const m = re.exec(t)
    if (!m) continue
    const a0 = m.index, a1 = m.index + m[0].length
    if (best === null || (a0 <= at && a1 >= end && a1 - a0 > end - at)) { best = k; at = a0; end = a1 }
  }
  return best
}

/** Suscripciones populares en Colombia para escoger con un toque. */
export const POPULAR_SUBS = ["netflix", "disney", "prime-video", "max", "youtube", "spotify", "apple", "icloud", "google-one", "microsoft", "openai", "claude", "canva", "duolingo", "playstation", "xbox", "paramount", "crunchyroll", "vix", "deezer", "rappi", "uber", "smartfit", "bodytech"] as const

/** Integración (lib/integrations/registry.ts) → logo de su servicio. */
export const INTEGRATION_BRAND: Record<string, string> = {
  ai_gateway: "vercel", ai_vertex: "google-cloud", ai_bedrock: "aws", ai_azure: "azure", ai_gemini: "gemini", ai_groq: "groq", ai_openrouter: "openrouter", ai_anthropic: "claude", ai_openai: "openai",
  email_resend: "resend", email_brevo: "brevo", email_sendgrid: "sendgrid", email_gmail: "gmail", telegram: "telegram", whatsapp: "whatsapp",
  coingecko: "coingecko", google_gmail: "gmail", google_calendar: "google-calendar", turnstile: "cloudflare", sentry: "sentry",
  analytics: "vercel", upstash: "upstash", adsense: "google-adsense", webpush: "pwa", trm: "superfinanciera", usura: "superfinanciera",
  festivos: "nager", fx: "exchangerate-api", stocks: "alphavantage",
}

/** Logo de una integración; si deja escoger proveedor (Acciones y ETF), el del proveedor configurado. */
export function integrationBrand(kind: string, config?: Record<string, unknown> | null): string | undefined {
  if (kind === "stocks" && config?.provider === "twelvedata") return "twelvedata"
  return INTEGRATION_BRAND[kind]
}

import BRANDS_RAW from "@/lib/data/brands.json"

// Logos de servicios de terceros (scripts/brand-logos.mjs): solo identifican el servicio y no se modifican.
export type Brand = { n: string; cat: string; kw: string; body?: string; w?: number; h?: number; src?: string; mono?: { bg: string; t: string; fg: string } }
export const BRANDS = BRANDS_RAW as Record<string, Brand>

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
// El orden del JSON es el de prioridad: "youtube music" antes que "youtube", "apple tv" antes que "apple".
const MATCHERS = Object.entries(BRANDS).map(([k, b]) => [k, new RegExp(b.kw)] as const)

/** Marca que corresponde a un texto libre (nombre de una suscripción, tarjeta o servicio). */
export function brandFor(text: string | null | undefined): string | null {
  if (!text) return null
  const t = norm(text)
  return MATCHERS.find(([, re]) => re.test(t))?.[0] ?? null
}

/** Suscripciones populares en Colombia para escoger con un toque. */
export const POPULAR_SUBS = ["netflix", "disney", "prime-video", "max", "youtube", "spotify", "apple", "icloud", "google-one", "microsoft", "openai", "claude", "canva", "duolingo", "playstation", "xbox", "paramount", "crunchyroll", "vix", "deezer", "rappi", "uber", "smartfit", "bodytech"] as const

/** Integración (lib/integrations/registry.ts) → logo de su servicio. */
export const INTEGRATION_BRAND: Record<string, string> = {
  ai_gateway: "vercel", ai_gemini: "gemini", ai_groq: "groq", ai_openrouter: "openrouter", ai_anthropic: "claude", ai_openai: "openai",
  email_resend: "resend", email_brevo: "brevo", email_sendgrid: "sendgrid", email_gmail: "gmail", telegram: "telegram", whatsapp: "whatsapp",
  coingecko: "coingecko", google_gmail: "gmail", google_calendar: "google-calendar", turnstile: "cloudflare", sentry: "sentry",
  analytics: "vercel", upstash: "upstash",
}

// Logos de servicios de terceros (solo para identificar el servicio, sin modificarlos).
// Fuentes con licencia libre: @iconify-json/logos (Gil Barbara, CC0, a color) y simple-icons (CC0, monocromo con el
// color oficial). Las marcas que no están en ninguna fuente libre se muestran como monograma con el color de la marca.
// Uso: node scripts/brand-logos.mjs  → lib/data/brands.json
import { readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const LOGOS = JSON.parse(readFileSync(require.resolve("@iconify-json/logos/icons.json"), "utf8"))
const SI = require("simple-icons")
const siBySlug = Object.fromEntries(Object.values(SI).filter((x) => x && x.slug).map((x) => [x.slug, x]))

// [clave, nombre, fuente, categoría, palabras clave (regex sin acentos, en minúscula)]
// fuente: "logos:<id>" | "si:<slug>" | "mono:<color>:<texto>[:<color del texto>]"
const B = [
  // Google e integraciones
  ["google", "Google", "logos:google-icon", "integracion", "google"],
  ["gmail", "Gmail", "logos:google-gmail", "integracion", "gmail"],
  ["google-calendar", "Google Calendar", "logos:google-calendar", "integracion", "google calendar|calendario de google"],
  ["gemini", "Google Gemini", "logos:google-gemini-icon", "ia", "gemini"],
  ["google-one", "Google One", "logos:google-one", "nube", "google one|almacenamiento google"],
  ["telegram", "Telegram", "logos:telegram", "integracion", "telegram"],
  ["whatsapp", "WhatsApp", "logos:whatsapp-icon", "integracion", "whatsapp"],
  ["openai", "ChatGPT", "logos:openai-icon", "ia", "chatgpt|openai|chat gpt"],
  ["claude", "Claude", "logos:claude-icon", "ia", "claude|anthropic"],
  ["anthropic", "Anthropic", "logos:anthropic-icon", "ia", "anthropic api"],
  ["perplexity", "Perplexity", "si:perplexity", "ia", "perplexity"],
  ["vercel", "Vercel", "logos:vercel-icon", "integracion", "vercel"],
  ["groq", "Groq", "logos:groq", "ia", "groq"],
  ["openrouter", "OpenRouter", "si:openrouter", "ia", "openrouter"],
  ["resend", "Resend", "logos:resend-icon", "integracion", "resend"],
  ["brevo", "Brevo", "si:brevo", "integracion", "brevo|sendinblue"],
  ["sendgrid", "SendGrid", "logos:sendgrid-icon", "integracion", "sendgrid"],
  ["cloudflare", "Cloudflare", "logos:cloudflare-icon", "integracion", "cloudflare"],
  ["sentry", "Sentry", "logos:sentry-icon", "integracion", "sentry"],
  ["upstash", "Upstash", "logos:upstash-icon", "integracion", "upstash"],
  ["coingecko", "CoinGecko", "mono:#8DC63F:CG", "integracion", "coingecko"],
  ["google-adsense", "Google AdSense", "logos:google-adsense", "integracion", "adsense"],
  ["pwa", "Web Push (app instalada)", "logos:pwa", "integracion", "web push|\\bpwa\\b"],
  ["superfinanciera", "Superintendencia Financiera", "mono:#0B3C7D:SFC", "integracion", "superfinanciera|superintendencia financiera"],
  ["nager", "Nager.Date", "mono:#1F2937:ND", "integracion", "nager"],
  ["exchangerate-api", "ExchangeRate-API", "mono:#0E7C66:ER", "integracion", "exchange ?rate"],
  ["alphavantage", "Alpha Vantage", "mono:#5A2D82:AV", "integracion", "alpha ?vantage"],
  ["twelvedata", "Twelve Data", "mono:#1B6EF3:12", "integracion", "twelve ?data"],
  ["github", "GitHub", "logos:github-icon", "software", "github"],
  // Video
  ["netflix", "Netflix", "logos:netflix-icon", "video", "netflix"],
  ["disney", "Disney+", "mono:#113CCF:D+", "video", "disney|star\\+"],
  ["prime-video", "Prime Video", "mono:#1A98FF:pv", "video", "prime video|amazon prime|primevideo|amazon"],
  ["max", "Max (HBO)", "si:hbomax", "video", "hbo|\\bmax\\b"],
  ["youtube-music", "YouTube Music", "si:youtubemusic", "musica", "youtube music"],
  ["youtube", "YouTube Premium", "logos:youtube-icon", "video", "youtube"],
  ["apple-tv", "Apple TV+", "si:appletv", "video", "apple tv"],
  ["paramount", "Paramount+", "si:paramountplus", "video", "paramount"],
  ["crunchyroll", "Crunchyroll", "si:crunchyroll", "video", "crunchyroll"],
  ["vix", "ViX", "mono:#FF5A00:ViX", "video", "\\bvix\\b"],
  ["mubi", "MUBI", "si:mubi", "video", "mubi"],
  ["dazn", "DAZN", "si:dazn", "video", "dazn"],
  ["twitch", "Twitch", "logos:twitch", "video", "twitch"],
  ["directv", "DIRECTV", "mono:#00A6D6:DTV", "video", "directv|direct tv|dgo"],
  // Música y libros
  ["spotify", "Spotify", "logos:spotify-icon", "musica", "spotify"],
  ["apple-music", "Apple Music", "si:applemusic", "musica", "apple music"],
  ["deezer", "Deezer", "si:deezer", "musica", "deezer"],
  ["tidal", "TIDAL", "si:tidal", "musica", "tidal"],
  ["audible", "Audible", "si:audible", "musica", "audible"],
  // Nube, software y apps
  ["icloud", "iCloud+", "si:icloud", "nube", "icloud"],
  ["apple", "Apple One", "logos:apple", "nube", "apple"],
  ["microsoft", "Microsoft 365", "logos:microsoft-icon", "software", "microsoft|office|365|outlook|onedrive"],
  ["xbox", "Xbox Game Pass", "mono:#107C10:X", "juegos", "xbox|game pass"],
  ["playstation", "PlayStation Plus", "si:playstation", "juegos", "playstation|ps plus|psn"],
  ["nintendo", "Nintendo Switch Online", "mono:#E60012:N", "juegos", "nintendo"],
  ["dropbox", "Dropbox", "logos:dropbox", "nube", "dropbox"],
  ["notion", "Notion", "logos:notion-icon", "software", "notion"],
  ["canva", "Canva", "mono:#00C4CC:C", "software", "canva"],
  ["adobe", "Adobe", "logos:adobe-icon", "software", "adobe|photoshop|lightroom|acrobat"],
  ["duolingo", "Duolingo", "si:duolingo", "software", "duolingo"],
  ["linkedin", "LinkedIn Premium", "logos:linkedin-icon", "software", "linkedin"],
  ["patreon", "Patreon", "si:patreon", "software", "patreon"],
  // Domicilios, transporte y gimnasio
  ["rappi", "Rappi Prime", "mono:#FF441F:R", "servicios", "rappi"],
  ["uber", "Uber One", "si:uber", "servicios", "uber"],
  ["didi", "DiDi", "mono:#FC4C02:Di", "servicios", "didi"],
  ["smartfit", "Smart Fit", "mono:#FFC20E:SF:#1C1C1C", "servicios", "smart ?fit"],
  ["bodytech", "Bodytech", "mono:#E30613:BT", "servicios", "bodytech"],
  // Telefonía e internet (Colombia)
  ["claro", "Claro", "mono:#DA291C:C", "telefonia", "\\bclaro\\b"],
  ["movistar", "Movistar", "si:movistar", "telefonia", "movistar"],
  ["tigo", "Tigo", "mono:#00377B:T", "telefonia", "\\btigo\\b|une"],
  ["etb", "ETB", "mono:#1E2A78:ETB", "telefonia", "\\betb\\b"],
  ["wom", "WOM", "mono:#6B0FA8:W", "telefonia", "\\bwom\\b"],
  // Pagos, bancos y cripto
  ["visa", "Visa", "logos:visa", "pagos", "\\bvisa\\b"],
  ["mastercard", "Mastercard", "logos:mastercard", "pagos", "master ?card"],
  ["amex", "American Express", "si:americanexpress", "pagos", "american express|amex"],
  ["paypal", "PayPal", "logos:paypal", "pagos", "paypal"],
  ["mercadopago", "Mercado Pago", "si:mercadopago", "pagos", "mercado ?pago"],
  ["nequi", "Nequi", "mono:#DA0081:N", "bancos", "nequi"],
  ["daviplata", "Daviplata", "mono:#ED1C24:DP", "bancos", "daviplata"],
  ["bancolombia", "Bancolombia", "mono:#FDDA24:B:#2C2A29", "bancos", "bancolombia"],
  ["davivienda", "Davivienda", "mono:#ED1C24:D", "bancos", "davivienda"],
  ["bbva", "BBVA", "mono:#004481:BBVA", "bancos", "bbva"],
  ["nubank", "Nu", "si:nubank", "bancos", "\\bnu\\b|nubank"],
  ["binance", "Binance", "si:binance", "bancos", "binance"],
  ["coinbase", "Coinbase", "si:coinbase", "bancos", "coinbase"],
]

const out = {}
const missing = []
for (const [k, n, src, cat, kw] of B) {
  const [type, a, b, c] = src.split(":")
  let logo
  if (type === "logos") {
    const ic = LOGOS.icons[a]
    if (!ic) { missing.push(`${k} (${src})`); continue }
    logo = { body: ic.body, w: ic.width ?? LOGOS.width ?? 256, h: ic.height ?? LOGOS.height ?? 256, src: "logos" }
  } else if (type === "si") {
    const ic = siBySlug[a]
    if (!ic) { missing.push(`${k} (${src})`); continue }
    logo = { body: `<path fill="#${ic.hex}" d="${ic.path}"/>`, w: 24, h: 24, src: "simple-icons" }
  } else {
    logo = { mono: { bg: `#${a.replace("#", "")}`.replace("##", "#"), t: b, fg: c ? `#${c.replace("#", "")}` : "#FFFFFF" } }
  }
  out[k] = { n, cat, kw, ...logo }
}
writeFileSync("lib/data/brands.json", JSON.stringify(out))
console.log(`marcas: ${Object.keys(out).length}`, missing.length ? `\nsin logo en la fuente: ${missing.join(", ")}` : "")

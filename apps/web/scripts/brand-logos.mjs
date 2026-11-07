// Logos de servicios de terceros (solo para identificar el servicio, sin modificarlos).
// Fuentes con licencia libre: @iconify-json/logos (Gil Barbara, CC0, a color) y simple-icons (CC0, monocromo con el
// color oficial). Las marcas que no están en ninguna fuente libre se muestran como monograma con el color de la marca.
// Uso: node scripts/brand-logos.mjs  → lib/data/brands.json
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const LOGOS = JSON.parse(readFileSync(require.resolve("@iconify-json/logos/icons.json"), "utf8"))
const SI = require("simple-icons")
const siBySlug = Object.fromEntries(Object.values(SI).filter((x) => x && x.slug).map((x) => [x.slug, x]))

// [clave, nombre, fuente, categoría, palabras clave (regex sin acentos, en minúscula)]
// fuente: "logos:<id>" | "si:<slug>" | "mono:<color>:<texto>[:<color del texto>]"
const B = [
  // Nube e infraestructura (primero: "google cloud" y "microsoft azure" no deben caer en Google ni en Microsoft)
  ["aws", "AWS", "logos:aws", "infraestructura", "\\baws\\b|amazon web services"],
  ["google-cloud", "Google Cloud", "logos:google-cloud", "infraestructura", "google cloud|\\bgcp\\b"],
  ["azure", "Microsoft Azure", "logos:microsoft-azure", "infraestructura", "azure"],
  ["google-workspace", "Google Workspace", "logos:google-workspace", "software", "google workspace|g ?suite"],
  ["oracle-cloud", "Oracle Cloud", "logos:oracle", "infraestructura", "oracle"],
  ["ibm-cloud", "IBM Cloud", "logos:ibm", "infraestructura", "\\bibm\\b"],
  ["alibaba-cloud", "Alibaba Cloud", "si:alibabacloud", "infraestructura", "alibaba cloud|aliyun"],
  ["digitalocean", "DigitalOcean", "logos:digital-ocean", "infraestructura", "digital ?ocean"],
  ["linode", "Linode (Akamai)", "logos:linode", "infraestructura", "linode"],
  ["ovh", "OVHcloud", "si:ovh", "infraestructura", "\\bovh"],
  ["heroku", "Heroku", "logos:heroku-icon", "infraestructura", "heroku"],
  ["netlify", "Netlify", "logos:netlify-icon", "infraestructura", "netlify"],
  ["render", "Render", "si:render", "infraestructura", "render\\.com|^render$"],
  ["railway", "Railway", "logos:railway", "infraestructura", "railway"],
  ["supabase", "Supabase", "logos:supabase-icon", "infraestructura", "supabase"],
  ["firebase", "Firebase", "logos:firebase", "infraestructura", "firebase"],
  ["mongodb", "MongoDB Atlas", "logos:mongodb-icon", "infraestructura", "mongo"],
  ["hostinger", "Hostinger", "si:hostinger", "infraestructura", "hostinger"],
  ["godaddy", "GoDaddy", "si:godaddy", "infraestructura", "godaddy"],
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
  ["tigo", "Tigo", "mono:#00377B:T", "telefonia", "\\btigo\\b|\\bune\\b"],
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
  ["applepay", "Apple Pay", "si:applepay", "pagos", "apple ?pay"],
  ["googlepay", "Google Pay", "si:googlepay", "pagos", "google ?pay|\\bgpay\\b"],
  ["samsungpay", "Samsung Pay", "si:samsungpay", "pagos", "samsung ?pay|samsung wallet"],
  ["stripe", "Stripe", "si:stripe", "pagos", "\\bstripe\\b"],
  ["payoneer", "Payoneer", "si:payoneer", "pagos", "payoneer"],
  ["wise", "Wise", "si:wise", "pagos", "\\bwise\\b|transferwise"],
  ["revolut", "Revolut", "si:revolut", "pagos", "revolut"],
  ["westernunion", "Western Union", "si:westernunion", "pagos", "western ?union"],
  ["moneygram", "MoneyGram", "si:moneygram", "pagos", "money ?gram"],
  ["cashapp", "Cash App", "si:cashapp", "pagos", "cash ?app"],
  ["hsbc", "HSBC", "si:hsbc", "bancos", "\\bhsbc\\b"],
  ["binance", "Binance", "si:binance", "bancos", "binance"],
  ["coinbase", "Coinbase", "si:coinbase", "bancos", "coinbase"],
  // Bancos, billeteras y cooperativas de Colombia (Perfil › Recibe pagos). Sin logo libre: monograma con su color.
  ["banco-bogota", "Banco de Bogotá", "mono:#003B7A:BdB", "bancos", "banco de bogota"],
  ["occidente", "Banco de Occidente", "mono:#0058A3:BdO", "bancos", "banco de occidente"],
  ["banco-popular", "Banco Popular", "mono:#00843D:BP", "bancos", "banco popular"],
  ["av-villas", "AV Villas", "mono:#E30613:AV", "bancos", "av ?villas"],
  ["caja-social", "Banco Caja Social", "mono:#004C97:BCS", "bancos", "caja social"],
  ["colpatria", "Scotiabank Colpatria", "mono:#EC111A:S", "bancos", "colpatria|scotiabank"],
  ["itau", "Itaú", "mono:#EC7000:itaú:#002D72", "bancos", "\\bitau\\b"],
  ["banco-agrario", "Banco Agrario", "mono:#00843D:BA", "bancos", "banco agrario"],
  ["falabella", "Banco Falabella", "mono:#43B02A:F", "bancos", "banco falabella|cmr falabella"],
  ["pichincha", "Banco Pichincha", "mono:#FFDD00:P:#0F265C", "bancos", "pichincha"],
  ["gnb-sudameris", "GNB Sudameris", "mono:#00285F:GNB", "bancos", "gnb|sudameris"],
  ["finandina", "Banco Finandina", "mono:#0055A5:Fi", "bancos", "finandina"],
  ["bancamia", "Bancamía", "mono:#E4002B:Bm", "bancos", "bancamia"],
  ["banco-w", "Banco W", "mono:#F18A00:W", "bancos", "banco w\\b"],
  ["mundo-mujer", "Banco Mundo Mujer", "mono:#E5007E:MM", "bancos", "mundo mujer"],
  ["coopcentral", "Banco Cooperativo Coopcentral", "mono:#007A33:BC", "bancos", "coopcentral"],
  ["lulo", "Lulo Bank", "mono:#1B1B1B:lulo:#C4F000", "bancos", "lulo ?bank"],
  ["movii", "MOVii", "mono:#5F259F:M", "bancos", "\\bmovii\\b"],
  ["dale", "dale!", "mono:#00B2E3:d!", "bancos", "\\bdale!"],
  ["rappipay", "RappiPay", "mono:#FF441F:RP", "bancos", "rappi ?pay"],
  ["uala", "Ualá", "mono:#3564FD:U", "bancos", "\\buala\\b"],
  ["global66", "Global66", "mono:#1C3FAA:G66", "bancos", "global ?66"],
  ["powwi", "Powwi", "mono:#6E2BD9:Pw", "bancos", "\\bpowwi\\b"],
  ["confiar", "Confiar Cooperativa Financiera", "mono:#E87722:C", "bancos", "confiar cooperativa"],
  ["cotrafa", "Cotrafa Cooperativa Financiera", "mono:#00A651:Ct", "bancos", "cotrafa"],
  ["jfk", "JFK Cooperativa Financiera", "mono:#003DA5:JFK", "bancos", "jfk cooperativa"],
  ["bancoomeva", "Bancoomeva", "mono:#006C35:Bc", "bancos", "bancoomeva|\\bcoomeva\\b"],
  ["serfinanza", "Banco Serfinanza", "mono:#E30613:Sf", "bancos", "serfinanza"],
  ["tuya", "Tuya (Tarjeta Éxito)", "mono:#FFD200:T:#1D1D1B", "bancos", "\\btuya\\b|tarjeta exito"],
  ["santander", "Banco Santander", "mono:#EC0000:S", "bancos", "banco santander|^santander$"],
  ["iris", "Iris", "mono:#5B2EFF:iris", "bancos", "\\biris\\b|iris bank"],
  ["coltefinanciera", "Coltefinanciera", "mono:#00508F:Cf", "bancos", "coltefinanciera"],
  ["fna", "Fondo Nacional del Ahorro", "mono:#00843D:FNA", "bancos", "fondo nacional del ahorro|\\bfna\\b"],
  ["addi", "Addi", "mono:#2F4CF5:addi", "pagos", "\\baddi\\b"],
  ["sistecredito", "Sistecrédito", "mono:#E4032E:Sc", "pagos", "siste ?credito"],
  ["bold", "Bold", "mono:#121E6C:bold", "pagos", "\\bbold\\b"],
  ["wompi", "Wompi", "mono:#2C2A29:W:#B0F2AE", "pagos", "wompi"],
  ["efecty", "Efecty", "mono:#FFD100:E:#1A1A1A", "pagos", "efecty"],
  ["banrep", "Banco de la República", "mono:#7A1F3D:BR", "bancos", "banco de la republica|\\bbanrep\\b"],
  ["breb", "Bre-B", "mono:#0F2A71:Bre-B", "pagos", "bre-?b\\b"],
  ["pse", "PSE", "mono:#005CA9:PSE", "pagos", "\\bpse\\b"],
  ["transfiya", "Transfiya", "mono:#5B2D8E:TY", "pagos", "transfiya"],
  // Pensiones y cesantías (Colombia)
  ["porvenir", "Porvenir", "mono:#E2231A:P", "pensiones", "^porvenir$|porvenir s\\.?a|(fondo|afp|pensiones|cesantias) porvenir|porvenir (pensiones|cesantias)"],
  ["proteccion", "Protección", "mono:#004B8D:P", "pensiones", "afp proteccion|fondo proteccion|pensiones proteccion|cesantias proteccion|^proteccion$"],
  ["colfondos", "Colfondos", "mono:#00539B:C", "pensiones", "colfondos"],
  ["skandia", "Skandia", "mono:#00A443:S", "pensiones", "skandia"],
  ["colpensiones", "Colpensiones", "mono:#004884:C", "pensiones", "colpensiones"],
  // Compras y mercado (Colombia)
  ["mercadolibre", "Mercado Libre", "mono:#FFE600:ML:#2D3277", "compras", "mercado ?libre"],
  ["exito", "Éxito", "mono:#FFE800:éxito:#1D1D1B", "mercado", "\\bexito\\b|almacenes exito"],
  ["carulla", "Carulla", "mono:#00A160:C", "mercado", "carulla"],
  ["d1", "Tiendas D1", "mono:#E30613:D1", "mercado", "\\bd1\\b|tiendas d1"],
  ["ara", "Tiendas Ara", "mono:#E30613:ara", "mercado", "\\bara\\b|tiendas ara"],
  ["olimpica", "Olímpica", "mono:#E30613:O", "mercado", "\\bolimpica\\b|supertiendas olimpica"],
  ["jumbo", "Jumbo", "mono:#00A650:J", "mercado", "\\bjumbo\\b"],
  ["alkosto", "Alkosto", "mono:#ED1C24:A", "compras", "alkosto|ktronix"],
  ["homecenter", "Homecenter", "mono:#FF6600:H", "compras", "home ?center|sodimac"],
  ["terpel", "Terpel", "mono:#E30613:T", "transporte", "terpel"],
  ["avianca", "Avianca", "si:avianca", "viajes", "avianca|lifemiles"],
  ["airbnb", "Airbnb", "si:airbnb", "viajes", "airbnb"],
  ["booking", "Booking.com", "si:bookingdotcom", "viajes", "booking"],
  ["aliexpress", "AliExpress", "si:aliexpress", "compras", "ali ?express"],
  ["zara", "Zara", "si:zara", "compras", "\\bzara\\b"],
  // Servicios públicos (Colombia)
  ["epm", "EPM", "mono:#00843D:epm", "servicios", "\\bepm\\b|empresas publicas de medellin"],
  ["enel", "Enel", "mono:#0555FA:enel", "servicios", "\\benel\\b|codensa"],
  ["vanti", "Vanti", "mono:#00A3E0:V", "servicios", "\\bvanti\\b|gas natural fenosa"],
  ["acueducto-bogota", "Acueducto de Bogotá", "mono:#0072BC:EAAB", "servicios", "acueducto de bogota|acueducto bogota|\\beaab\\b"],
  ["celsia", "Celsia", "mono:#FF6B00:C", "servicios", "celsia"],
  ["air-e", "Air-e", "mono:#00A3E0:Ae", "servicios", "\\bair-e\\b"],
  ["afinia", "Afinia", "mono:#E4002B:Af", "servicios", "afinia"],
  ["gases-occidente", "Gases de Occidente", "mono:#0058A3:GdO", "servicios", "gases de occidente"],
  ["emcali", "EMCALI", "mono:#00539F:Em", "servicios", "emcali"],
  // Salud y cajas de compensación (Colombia)
  ["sura", "SURA", "mono:#0033A0:S", "salud", "\\bsura\\b|suramericana"],
  ["sanitas", "Sanitas", "mono:#0072CE:S", "salud", "sanitas"],
  ["nueva-eps", "Nueva EPS", "mono:#00843D:NE", "salud", "nueva eps"],
  ["compensar", "Compensar", "mono:#E87722:C", "salud", "^compensar$|compensar (eps|caja)|(eps|caja|caja de compensacion) compensar"],
  ["colsubsidio", "Colsubsidio", "mono:#E30613:Cs", "salud", "colsubsidio"],
  ["cafam", "Cafam", "mono:#00A1DE:C", "salud", "cafam"],
  ["comfama", "Comfama", "mono:#E6007E:C", "salud", "comfama"],
  // Más servicios por suscripción
  ["gitlab", "GitLab", "logos:gitlab", "software", "gitlab"],
  ["jetbrains", "JetBrains", "logos:jetbrains-icon", "software", "jetbrains|intellij|pycharm|webstorm"],
  ["cursor", "Cursor", "logos:cursor", "ia", "cursor"],
  ["midjourney", "Midjourney", "logos:midjourney", "ia", "midjourney"],
  ["slack", "Slack", "logos:slack-icon", "software", "slack"],
  ["zoom", "Zoom", "logos:zoom-icon", "software", "\\bzoom\\b"],
  ["figma", "Figma", "logos:figma", "software", "figma"],
  ["atlassian", "Atlassian (Jira)", "logos:atlassian", "software", "atlassian|jira|confluence"],
  ["trello", "Trello", "logos:trello", "software", "trello"],
  ["asana", "Asana", "logos:asana-icon", "software", "asana"],
  ["miro", "Miro", "logos:miro-icon", "software", "\\bmiro\\b"],
  ["grammarly", "Grammarly", "logos:grammarly-icon", "software", "grammarly"],
  ["shopify", "Shopify", "logos:shopify", "software", "shopify"],
  ["wix", "Wix", "logos:wix", "software", "\\bwix\\b"],
  ["mailchimp", "Mailchimp", "logos:mailchimp-freddie", "software", "mailchimp"],
  ["onepassword", "1Password", "si:1password", "seguridad", "1password|one ?password"],
  ["bitwarden", "Bitwarden", "si:bitwarden", "seguridad", "bitwarden"],
  ["nordvpn", "NordVPN", "si:nordvpn", "seguridad", "nord ?vpn"],
  ["expressvpn", "ExpressVPN", "si:expressvpn", "seguridad", "express ?vpn"],
  ["discord", "Discord Nitro", "logos:discord-icon", "juegos", "discord"],
  ["steam", "Steam", "logos:steam", "juegos", "steam"],
  ["coursera", "Coursera", "logos:coursera", "educacion", "coursera"],
  ["udemy", "Udemy", "logos:udemy-icon", "educacion", "udemy"],
  ["platzi", "Platzi", "si:platzi", "educacion", "platzi"],
  ["kindle", "Kindle Unlimited", "mono:#232F3E:K", "educacion", "kindle"],
  ["x-premium", "X Premium", "logos:x", "software", "(^|\\s)x premium|twitter"],
  ["tinder", "Tinder", "si:tinder", "servicios", "tinder"],
]

// Íconos oficiales descargados del sitio de cada entidad (scripts/brand-official.mjs): img + bleed, conserva mono/body.
const OFFICIAL = existsSync("lib/data/brands-official.json") ? JSON.parse(readFileSync("lib/data/brands-official.json", "utf8")) : {}

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
  if (OFFICIAL[k]) Object.assign(out[k], { img: OFFICIAL[k].file, bleed: !!OFFICIAL[k].bleed })
}
const orphan = Object.keys(OFFICIAL).filter((k) => !out[k])
writeFileSync("lib/data/brands.json", JSON.stringify(out))
const nImg = Object.values(out).filter((b) => b.img).length
console.log(`marcas: ${Object.keys(out).length} (con ícono oficial: ${nImg})`, missing.length ? `\nsin logo en la fuente: ${missing.join(", ")}` : "", orphan.length ? `\níconos oficiales sin marca: ${orphan.join(", ")}` : "")

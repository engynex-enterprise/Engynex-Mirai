// Enciende el correo (y, si lo pasas, WhatsApp y Telegram) de Mirai en producción SIN entrar al panel y SIN imprimir
// ningún valor. Agrega las variables al servicio Compose de Dokploy, conserva las que ya están y pide el despliegue.
//
//   node infra/servidor/activar-avisos.mjs --resend re_xxx --from no-responder@mirai.engynex.com
//   node infra/servidor/activar-avisos.mjs --whatsapp EAAG... --phone-id 123456 --waba-id 7654321
//   node infra/servidor/activar-avisos.mjs --revisar          # solo mira qué hay hoy (no cambia nada)
//
// También lee las variables de .env.local si no las pasas por la línea de comandos (MAIL_FROM, RESEND_API_KEY,
// WHATSAPP_TOKEN, WHATSAPP_PHONE_ID, WHATSAPP_WABA_ID, TELEGRAM_BOT_TOKEN…).
//
// De dónde salen las credenciales del panel: .env.local de la raíz → DOKPLOY_URL, DOKPLOY_API_KEY y, si el panel está
// detrás de Cloudflare Access, CF_ACCESS_CLIENT_ID y CF_ACCESS_CLIENT_SECRET. El id del Compose: ~/.mirai/dokploy-compose-id
// o DOKPLOY_COMPOSE_ID.
//
// Con --resend revisa primero en Resend que el dominio del remitente esté verificado: si no lo está, no toca nada y te
// dice qué falta (los registros DNS de mirai.engynex.com ya están en Cloudflare).
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..")
const args = process.argv.slice(2)
const flag = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? (args[i + 1] ?? "").trim() : undefined }
const has = (n) => args.includes(`--${n}`)
const REVISAR = has("revisar")

// [ \t] y no \s: con \s una variable vacía (`X=`) se traga la línea siguiente como su valor.
const parse = (text) => Object.fromEntries([...text.matchAll(/^[ \t]*(?:export[ \t]+)?([A-Za-z_][A-Za-z0-9_]*)[ \t]*=[ \t]*["']?([^"'\r\n]*)["']?[ \t]*$/gm)].map((m) => [m[1], m[2].trim()]))
const envFile = (f) => (existsSync(f) ? parse(readFileSync(f, "utf8")) : {})
const local = { ...envFile(join(ROOT, ".env.local")), ...process.env }

const salir = (msg) => { console.error(`✗ ${msg}`); process.exit(1) }
const tapar = (s) => (s ? `${"•".repeat(8)}${s.slice(-4)}` : "(vacío)")

// ── Panel de Dokploy ────────────────────────────────────────────────────────────────────────────────────────────
const DOKPLOY_URL = (local.DOKPLOY_URL ?? "").replace(/\/+$/, "")
const COMPOSE_ID = flag("compose") || local.DOKPLOY_COMPOSE_ID || (existsSync(join(homedir(), ".mirai/dokploy-compose-id")) ? readFileSync(join(homedir(), ".mirai/dokploy-compose-id"), "utf8").trim() : "")
if (!DOKPLOY_URL || !local.DOKPLOY_API_KEY) salir("Faltan DOKPLOY_URL y DOKPLOY_API_KEY en .env.local.")
if (!COMPOSE_ID) salir("Falta el id del Compose: ~/.mirai/dokploy-compose-id o DOKPLOY_COMPOSE_ID.")

const headers = {
  "x-api-key": local.DOKPLOY_API_KEY,
  "content-type": "application/json",
  ...(local.CF_ACCESS_CLIENT_ID ? { "CF-Access-Client-Id": local.CF_ACCESS_CLIENT_ID, "CF-Access-Client-Secret": local.CF_ACCESS_CLIENT_SECRET } : {}),
}
async function dokploy(ruta, body) {
  const r = await fetch(`${DOKPLOY_URL}${ruta}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined })
  if (!r.ok) salir(`Dokploy respondió ${r.status} en ${ruta}: ${(await r.text()).slice(0, 200)}`)
  return r.json()
}

// ── Qué vamos a poner ───────────────────────────────────────────────────────────────────────────────────────────
const nuevas = {}
const poner = (k, v) => { if (v) nuevas[k] = v }
poner("RESEND_API_KEY", flag("resend") ?? local.RESEND_API_KEY)
poner("BREVO_API_KEY", flag("brevo") ?? local.BREVO_API_KEY)
poner("SENDGRID_API_KEY", flag("sendgrid") ?? local.SENDGRID_API_KEY)
poner("MAIL_FROM", flag("from") ?? local.MAIL_FROM)
poner("MAIL_FROM_NAME", flag("from-name") ?? local.MAIL_FROM_NAME)
poner("WHATSAPP_TOKEN", flag("whatsapp") ?? local.WHATSAPP_TOKEN)
poner("WHATSAPP_PHONE_ID", flag("phone-id") ?? local.WHATSAPP_PHONE_ID)
poner("WHATSAPP_WABA_ID", flag("waba-id") ?? local.WHATSAPP_WABA_ID)
poner("TELEGRAM_BOT_TOKEN", flag("telegram") ?? local.TELEGRAM_BOT_TOKEN)
poner("TELEGRAM_BOT_NAME", local.TELEGRAM_BOT_NAME)

const compose = await dokploy(`/api/compose.one?composeId=${encodeURIComponent(COMPOSE_ID)}`)
const actuales = parse(compose.env ?? "")
const CORREO = ["RESEND_API_KEY", "BREVO_API_KEY", "SENDGRID_API_KEY", "GMAIL_APP_PASSWORD", "SMTP_HOST"]
const hoy = Object.keys(actuales).filter((k) => CORREO.includes(k) || k.startsWith("WHATSAPP_") || k.startsWith("TELEGRAM_") || k.startsWith("MAIL_"))

console.log(`Compose «${compose.name}» (${compose.composeStatus}) · ${Object.keys(actuales).length} variables`)
console.log(`Avisos configurados hoy: ${hoy.length ? hoy.join(", ") : "ninguno — Mirai no envía correos ni WhatsApp"}`)

if (REVISAR) {
  console.log(`Correo activo: ${CORREO.some((k) => actuales[k]) ? "sí" : "NO"} · WhatsApp: ${actuales.WHATSAPP_TOKEN && actuales.WHATSAPP_PHONE_ID ? "sí" : "NO"}`)
  process.exit(0)
}
if (!Object.keys(nuevas).length) salir("No pasaste ninguna credencial. Ejemplo: --resend re_xxx --from no-responder@mirai.engynex.com (o --revisar).")

// ── Resend: el dominio del remitente debe estar verificado ──────────────────────────────────────────────────────
if (nuevas.RESEND_API_KEY) {
  const from = (nuevas.MAIL_FROM ?? actuales.MAIL_FROM ?? actuales.AUTH_MAIL_FROM ?? "").replace(/^.*</, "").replace(/>.*$/, "")
  if (!from) salir("Con --resend hay que decir el remitente: --from no-responder@mirai.engynex.com")
  const dominio = from.split("@")[1]
  const r = await fetch("https://api.resend.com/domains", { headers: { authorization: `Bearer ${nuevas.RESEND_API_KEY}` } })
  if (r.status === 401) salir("Resend no acepta esa clave (401). Créala en resend.com › API Keys con permiso «Sending access».")
  if (!r.ok) salir(`Resend respondió ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const lista = (await r.json()).data ?? []
  console.log(`Resend: ${lista.length} dominio(s) — ${lista.map((d) => `${d.name} (${d.status})`).join(", ") || "ninguno"}`)
  const d = lista.find((x) => x.name === dominio)
  if (!d) salir(`El dominio «${dominio}» no está en esa cuenta de Resend. Agrégalo en resend.com › Domains (sus registros DNS ya están en Cloudflare) o usa un remitente de los de arriba.`)
  if (d.status !== "verified") salir(`El dominio «${dominio}» está en estado «${d.status}», no «verified». Entra a resend.com › Domains › Verify. Si los registros ya están, espera unos minutos y vuelve a correr esto.`)
  nuevas.MAIL_FROM = from
  console.log(`✓ Resend listo para enviar desde ${from}`)
}

// ── Guardar en Dokploy (conservando todo lo demás) y desplegar ──────────────────────────────────────────────────
const combinadas = { ...actuales, ...nuevas }
const texto = Object.entries(combinadas).map(([k, v]) => `${k}=${v}`).join("\n") + "\n"
console.log(`Variables a agregar o cambiar: ${Object.entries(nuevas).map(([k, v]) => `${k}=${/KEY|TOKEN|PASS|SECRET/.test(k) ? tapar(v) : v}`).join(" · ")}`)

await dokploy("/api/compose.update", { composeId: COMPOSE_ID, env: texto })
console.log("✓ Variables guardadas en Dokploy.")

if (has("sin-desplegar")) {
  console.log("  (--sin-desplegar: no se pidió el despliegue; hazlo desde el panel cuando quieras)")
  process.exit(0)
}
await dokploy("/api/compose.deploy", { composeId: COMPOSE_ID, title: "Avisos: correo y WhatsApp", description: "activar-avisos.mjs" })
console.log("✓ Despliegue pedido. Cuando termine, revisa consola › Integraciones globales: debe decir «Activa · Variables del servidor».")
console.log("  Luego usa «Probar» (te llega un correo) y «Enviar prueba».")

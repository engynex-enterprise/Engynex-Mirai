#!/usr/bin/env node
// Revisa que no se suban secretos (llaves, tokens, contraseñas, archivos .env) antes de un commit.
//
//   node scripts/revisar-secretos.mjs            lo que está en el área de preparación (git diff --cached): pre-commit
//   node scripts/revisar-secretos.mjs --todo     además lo modificado sin preparar y los archivos nuevos sin seguimiento
//   node scripts/revisar-secretos.mjs --repo     todos los archivos del repositorio (auditoría completa; no solo lo nuevo)
//   node scripts/revisar-secretos.mjs --hook     modo hook de Claude Code (lee el JSON de stdin; solo actúa en `git commit`)
//
// Solo mira las líneas AGREGADAS. Nunca imprime el secreto: muestra archivo, línea, tipo y los primeros 4 caracteres.
// Falso positivo: agrega `secretos:ok` en esa línea (con un comentario de por qué). Sale con 1 (o 2 en modo hook) si encuentra algo.
import { execFileSync } from "node:child_process"
import { readFileSync, statSync } from "node:fs"

const args = process.argv.slice(2)
const git = (a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })

// Archivos que nunca se suben.
const ARCHIVOS = [
  [/(^|\/)\.env(\.[\w-]+)?$/, "archivo .env"],
  [/\.(pem|key|p12|pfx|jks|keystore)$/i, "llave o certificado"],
  [/\.(dump|secretos)$/i, "copia de la base o archivo de secretos"],
  [/(^|\/)id_(rsa|ed25519|ecdsa)$/, "llave SSH"],
]
const PERMITIDOS = /(^|\/)\.env\.(example|sample|template)$/

// Contenido. Cada patrón es estrecho a propósito (pocos falsos positivos).
const PATRONES = [
  [/-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/, "llave privada"],
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/, "clave de Anthropic"],
  [/\bsk-(?:proj-|live-|test-)?[A-Za-z0-9_-]{32,}/, "clave sk- (OpenAI, Stripe…)"],
  [/\bAKIA[0-9A-Z]{16}\b/, "clave de AWS"],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{50,}/, "token de GitHub"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/, "token de Slack"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "clave de Google"],
  [/\bAPP_USR-\d{6,}-[0-9a-f-]{20,}/i, "token de Mercado Pago"],
  [/\b(?:prv|pub)_(?:prod|test)_[A-Za-z0-9]{20,}|\b(?:prod|test)_(?:integrity|events)_[A-Za-z0-9]{20,}/, "llave de Wompi"],
  [/\bEAA[A-Za-z0-9]{80,}/, "token de Meta (WhatsApp)"],
  [/\b\d{8,10}:AA[A-Za-z0-9_-]{30,}/, "token de bot de Telegram"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/, "JWT (token firmado)"],
  [/\b(?:re|SG)\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|\bre_[A-Za-z0-9]{24,}/, "clave de correo (Resend/SendGrid)"],
]
// postgres://usuario:clave@host — solo si el host no es local (localhost, 127.0.0.1 o un servicio de Docker sin punto).
const URL_CON_CLAVE = /\b(?:postgres(?:ql)?|mysql|redis|mongodb(?:\+srv)?|amqp):\/\/[^:\s/@'"`]+:([^@\s'"`]{6,})@([^:/\s'"`]+)/g
const LOCAL = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|[a-z0-9_-]+)$/i
// VARIABLE_SECRETA = "valor largo" (no plantillas ${…}, process.env, ejemplos ni <…>).
const ASIGNACION = /\b([A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|ACCESS_KEY|CLIENT_SECRET)[A-Z0-9_]*)\s*[:=]\s*["'`]?([A-Za-z0-9/+_=.-]{24,})/
const NO_ES_VALOR = /^(process|import|env|ctx|cfg|config|secrets?|undefined|null|true|false)\b|\$\{|example|ejemplo|xxxx|changeme|your[_-]|tu[_-]|prueba|test|local|dummy|fake|demo|^[a-z]\w*\.[A-Z_]+$/i
// Pruebas: valores de ejemplo a propósito; ahí solo cuentan los patrones de arriba (formatos reales de cada proveedor).
const ES_PRUEBA = /(^|\/)(tests?|__tests__|e2e)\/|\.(test|spec|int\.test)\.[cm]?[jt]sx?$/

const hallazgos = []
const anota = (file, line, tipo, valor = "") =>
  hallazgos.push(`  ${file}${line ? `:${line}` : ""} — ${tipo}${valor ? ` (empieza por "${valor.slice(0, 4)}…")` : ""}`)

function revisaLinea(file, n, linea) {
  if (linea.includes("secretos:ok")) return
  for (const [re, tipo] of PATRONES) {
    const m = linea.match(re)
    if (m) { anota(file, n, tipo, m[0]); return }
  }
  for (const m of linea.matchAll(URL_CON_CLAVE)) {
    if (!LOCAL.test(m[2]) && !/^\$|\{|<|\*{3}|•/.test(m[1])) { anota(file, n, "URL con contraseña", m[1]); return }
  }
  const a = ES_PRUEBA.test(file) ? null : linea.match(ASIGNACION)
  if (a && !NO_ES_VALOR.test(a[2]) && /\d/.test(a[2]) && /[A-Za-z]/.test(a[2])) anota(file, n, `valor de ${a[1]}`, a[2])
}

function revisaDiff(diff) {
  let file = null, n = 0
  for (const l of diff.split("\n")) {
    if (l.startsWith("+++ ")) { file = l.slice(4).replace(/^b\//, ""); continue }
    if (l.startsWith("@@")) { n = Number(/\+(\d+)/.exec(l)?.[1] ?? 0) - 1; continue }
    if (!file || file === "/dev/null") continue
    if (l.startsWith("+")) { n++; revisaLinea(file, n, l.slice(1)) }
    else if (!l.startsWith("-")) n++
  }
}

function revisaNombre(file) {
  if (PERMITIDOS.test(file)) return
  for (const [re, tipo] of ARCHIVOS) if (re.test(file)) { anota(file, 0, `${tipo}: no se sube`); return }
}

function revisaArchivoNuevo(file) {
  revisaNombre(file)
  try {
    if (statSync(file).size > 2 * 1024 * 1024) return
    const txt = readFileSync(file, "utf8")
    if (txt.includes("\u0000")) return // binario
    txt.split("\n").forEach((l, i) => revisaLinea(file, i + 1, l))
  } catch { /* borrado o ilegible */ }
}

let modo = args.includes("--todo") ? "todo" : "staged"
if (args.includes("--hook")) {
  // Claude Code (PreToolUse › Bash): solo revisa cuando el comando hace un commit. Como `git add -A && git commit` llega
  // antes del add, se revisa todo lo pendiente (preparado, sin preparar y archivos nuevos).
  let cmd = ""
  try { cmd = JSON.parse(readFileSync(0, "utf8"))?.tool_input?.command ?? "" } catch { process.exit(0) }
  const seg = cmd.match(/\bgit\b[^|;&]*\bcommit\b[^|;&]*/)?.[0]
  if (!seg) process.exit(0)
  if (/\s--no-verify\b|\s-n(\s|$)/.test(seg)) {
    console.error("Revisión de secretos: no uses `git commit --no-verify`; corrige el hallazgo o marca el falso positivo con `secretos:ok`.")
    process.exit(2)
  }
  modo = "todo"
}

if (args.includes("--repo")) {
  for (const f of git(["ls-files"]).split("\n").filter(Boolean)) revisaArchivoNuevo(f)
  modo = "repo"
}
const nombres = modo === "repo" ? [] : git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"]).split("\n").filter(Boolean)
if (modo !== "repo") revisaDiff(git(["diff", "--cached", "-U0", "--diff-filter=ACMR", "--no-color"]))
if (modo === "todo") {
  nombres.push(...git(["diff", "--name-only", "--diff-filter=ACMR"]).split("\n").filter(Boolean))
  revisaDiff(git(["diff", "-U0", "--diff-filter=ACMR", "--no-color"]))
  for (const f of git(["ls-files", "--others", "--exclude-standard"]).split("\n").filter(Boolean)) revisaArchivoNuevo(f)
}
for (const f of new Set(nombres)) revisaNombre(f)

const unicos = [...new Set(hallazgos)]
if (unicos.length) {
  console.error(`✗ Revisión de secretos: ${unicos.length} posible(s) secreto(s) en lo que vas a subir:\n${unicos.join("\n")}`)
  console.error("Quítalo del archivo (los secretos van en .env.local o en las variables de Dokploy) y vuelve a intentar.")
  console.error("Si es un falso positivo, agrega `secretos:ok` en esa línea con el motivo.")
  process.exit(args.includes("--hook") ? 2 : 1)
}
if (!args.includes("--hook")) console.log("✓ Revisión de secretos: nada sospechoso.")

// Íconos oficiales de entidades sin logo libre (bancos, billeteras, servicios públicos… de Colombia).
// Se toma el ícono que la propia entidad publica en su sitio web oficial (apple-touch-icon, ícono del manifest,
// favicon SVG/PNG grande) y se guarda UNA vez como archivo de Mirai (public/brands/<clave>.png|svg). Sin hotlinking
// ni servicios de terceros en tiempo de ejecución. El diseño no se modifica: solo se reescala (PNG 128×128).
// Uso nominativo: solo identifica la entidad. Las marcas que no salen bien se quedan con su monograma.
//
// Uso (desde apps/web):  node scripts/brand-official.mjs [clave…]   → public/brands/* y lib/data/brands-official.json
// Luego: node scripts/brand-logos.mjs (une img/bleed en lib/data/brands.json).
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const sharp = require("sharp")

const OUT_DIR = "public/brands"
const OUT_JSON = "lib/data/brands-official.json"
const AT = new Date().toISOString().slice(0, 10)
const SIZE = 128
const MIN_PX = 64
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"

// [clave (la de brand-logos.mjs), dominio oficial, ...otros dominios o URL exactas de respaldo]
// Una entrada con { skip: "motivo" } se revisó a ojo y quedó descartada: se borra su archivo y se queda el monograma.
const T = [
  // Integraciones y datos de referencia
  ["coingecko", "www.coingecko.com"],
  ["superfinanciera", "www.superfinanciera.gov.co"],
  ["nager", "date.nager.at"],
  ["exchangerate-api", "www.exchangerate-api.com"],
  ["alphavantage", "www.alphavantage.co"],
  ["twelvedata", "twelvedata.com"],
  // Video, juegos y software
  ["disney", "www.disneyplus.com"],
  ["prime-video", "www.primevideo.com"],
  ["vix", "vix.com"],
  ["directv", "www.directv.com.co", "www.directvgo.com"],
  ["xbox", "www.xbox.com"],
  ["nintendo", "www.nintendo.com"],
  ["canva", "www.canva.com"],
  ["kindle", "www.amazon.com"],
  // Domicilios, transporte y gimnasio
  ["rappi", "www.rappi.com.co"],
  ["didi", "web.didiglobal.com", "www.didiglobal.com"],
  ["smartfit", "www.smartfit.com.co"],
  ["bodytech", "bodytech.com.co"],
  // Telefonía
  ["claro", "www.claro.com.co"],
  ["tigo", "www.tigo.com.co"],
  ["etb", "etb.com"],
  ["wom", "www.wom.co"],
  // Bancos, billeteras y cooperativas
  ["nequi", "www.nequi.com.co"],
  ["daviplata", "www.daviplata.com"],
  ["bancolombia", "www.bancolombia.com"],
  ["davivienda", "www.davivienda.com"],
  ["bbva", "www.bbva.com.co"],
  ["banco-bogota", "www.bancodebogota.com"],
  ["occidente", "www.bancodeoccidente.com.co"],
  ["banco-popular", "www.bancopopular.com.co"],
  ["av-villas", "www.avvillas.com.co"],
  ["caja-social", "www.bancocajasocial.com"],
  ["colpatria", "www.scotiabankcolpatria.com"],
  ["itau", "www.itau.co", "banco.itau.co"],
  ["banco-agrario", "www.bancoagrario.gov.co"],
  ["falabella", "www.bancofalabella.com.co"],
  ["pichincha", "www.bancopichincha.com.co"],
  ["gnb-sudameris", "www.gnbsudameris.com.co"],
  ["finandina", "www.bancofinandina.com"],
  ["bancamia", "www.bancamia.com.co"],
  ["banco-w", "www.bancow.com.co"],
  ["mundo-mujer", "www.bmm.com.co"],
  ["coopcentral", "www.coopcentral.com.co"],
  ["lulo", "www.lulobank.com"],
  ["movii", "www.movii.com.co"],
  ["dale", "dale.com.co"],
  ["rappipay", "www.rappipay.co", "www.rappipay.com.co"],
  ["uala", "www.uala.com.co"],
  ["global66", "www.global66.com"],
  ["powwi", "www.powwi.co"],
  ["confiar", "www.confiar.coop"],
  ["cotrafa", "www.cotrafa.com.co"],
  ["jfk", "www.jfk.com.co"],
  ["bancoomeva", "www.bancoomeva.com.co"],
  ["serfinanza", "www.bancoserfinanza.com"],
  ["tuya", "www.tuya.com.co"],
  ["santander", "www.santander.com.co"],
  ["iris", "www.iris.com.co"],
  ["coltefinanciera", "www.coltefinanciera.com.co"],
  ["fna", "www.fna.gov.co"],
  // Pensiones y cesantías
  ["porvenir", "www.porvenir.com.co"],
  ["proteccion", "www.proteccion.com"],
  ["colfondos", "www.colfondos.com.co"],
  ["skandia", "www.skandia.co"],
  ["colpensiones", "www.colpensiones.gov.co"],
  // Pagos
  ["addi", "co.addi.com", "addi.com"],
  ["sistecredito", "www.sistecredito.com"],
  ["bold", "bold.co"],
  ["wompi", "wompi.com", "wompi.co"],
  ["efecty", "www.efecty.com.co"],
  ["banrep", "www.banrep.gov.co"],
  ["breb", "www.banrep.gov.co"],
  ["pse", "www.pse.com.co", "www.achcolombia.com.co"],
  ["transfiya", "www.transfiya.com.co"],
  // Compras y mercado
  ["mercadolibre", "www.mercadolibre.com.co"],
  ["exito", "www.exito.com"],
  ["carulla", "www.carulla.com"],
  ["d1", "d1.com.co", "www.d1.com.co"],
  ["ara", "aratiendas.com", "www.aratiendas.com"],
  ["olimpica", "www.olimpica.com"],
  ["jumbo", "www.tiendasjumbo.co"],
  ["alkosto", "www.alkosto.com"],
  ["homecenter", "www.homecenter.com.co"],
  ["terpel", "www.terpel.com"],
  // Servicios públicos
  ["epm", "www.epm.com.co"],
  ["enel", "www.enel.com.co"],
  ["vanti", "www.grupovanti.com"],
  ["acueducto-bogota", "www.acueducto.com.co"],
  ["celsia", "www.celsia.com"],
  ["air-e", "www.air-e.com"],
  ["afinia", "www.afinia.com.co"],
  ["gases-occidente", "www.gasesdeoccidente.com"],
  ["emcali", "www.emcali.com.co"],
  // Salud y cajas de compensación
  ["sura", "www.segurossura.com.co", "www.sura.co", "www.epssura.com"],
  ["sanitas", "www.epssanitas.com", "www.colsanitas.com"],
  ["compensar", "corporativo.compensar.com", "www.compensar.com"],
  ["nueva-eps", "www.nuevaeps.com.co"],
  ["colsubsidio", "www.colsubsidio.com"],
  ["cafam", "www.cafam.com.co"],
  ["comfama", "www.comfama.com"],
]

// Revisión a ojo de la hoja de contacto (2026-11-07): se quedan con el monograma.
const SKIP = {
  superfinanciera: "el favicon es el escudo de Colombia, no el logo de la Superintendencia",
  nintendo: "el favicon es un sprite de Mario, no el logo de Nintendo",
  ara: "pixelado (ícono pequeño ampliado)",
  comfama: "logotipo horizontal: ilegible a 40 px",
}

// ── utilidades ───────────────────────────────────────────────────────────────
// Dos formas de descargar: fetch de Node (rápido) y, si el sitio bloquea bots o arma el <head> con JavaScript,
// un Chromium real (el de Playwright del workspace) que abre la portada como cualquier visitante.
// Ambas devuelven { ok, status, url, ct, buf }.
const nodeFetcher = {
  name: "node",
  async get(url, accept = "*/*") {
    const r = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
      headers: { "user-agent": UA, accept, "accept-language": "es-CO,es;q=0.9,en;q=0.6" },
    })
    return { ok: r.ok, status: r.status, url: r.url, ct: (r.headers.get("content-type") || "").toLowerCase(), buf: Buffer.from(await r.arrayBuffer()) }
  },
  async html(url) { return this.get(url, "text/html,application/xhtml+xml") },
}

let browser = null
async function browserFetcher() {
  if (!browser) {
    const { chromium } = require("@playwright/test")
    // Chromium completo (no el headless-shell) y sin la marca de automatización: varios bancos bloquean el otro.
    browser = await chromium.launch({ headless: true, channel: "chromium", args: ["--disable-blink-features=AutomationControlled"] })
  }
  const ctx = await browser.newContext({ locale: "es-CO", userAgent: UA, viewport: { width: 1280, height: 800 } })
  return {
    name: "navegador",
    async get(url) {
      const r = await ctx.request.get(url, { timeout: 15000, failOnStatusCode: false })
      return { ok: r.ok(), status: r.status(), url: r.url(), ct: (r.headers()["content-type"] || "").toLowerCase(), buf: await r.body() }
    },
    async html(url) {
      const page = await ctx.newPage()
      try {
        const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 })
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {})
        // Algunas protecciones (Radware, Akamai) resuelven un reto y recargan: se espera un poco más.
        if (/perfdrive|captcha|challenge/i.test(page.url())) await page.waitForTimeout(6000)
        const text = await page.content()
        return { ok: (resp?.ok() ?? false) || /<link\b[^>]*icon/i.test(text), status: resp?.status() ?? 0, url: page.url(), ct: "text/html", buf: Buffer.from(text) }
      } finally { await page.close() }
    },
    close: () => ctx.close(),
  }
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"))
  return m ? (m[2] ?? m[3] ?? m[4] ?? "").trim() : null
}
const decodeEnt = (s) => s.replace(/&amp;/g, "&").replace(/&#x2F;/gi, "/").replace(/&#47;/g, "/").replace(/&quot;/g, '"')
const maxSize = (sizes) => {
  if (!sizes) return 0
  if (/any/i.test(sizes)) return 1000
  return Math.max(0, ...sizes.split(/\s+/).map((s) => parseInt(s.split(/x/i)[0], 10) || 0))
}

/** Candidatos declarados en el HTML de la portada (y su manifest). */
async function candidatesFrom(site, F) {
  const out = []
  let html = "", base = `https://${site}/`
  try {
    const r = await F.html(base)
    base = r.url || base
    html = r.ok ? r.buf.toString("utf8") : ""
    if (/perfdrive|captcha/i.test(new URL(base).host)) { out.push({ note: `bloqueo anti-bots (${new URL(base).host})` }); html = ""; base = `https://${site}/` }
    if (!r.ok) out.push({ note: `portada HTTP ${r.status}` })
  } catch (e) {
    out.push({ note: `portada: ${e.name === "TimeoutError" ? "tiempo agotado" : e.cause?.code || e.message}` })
  }
  const bm = html.match(/<base\s[^>]*href=["']([^"']+)["']/i)
  const root = bm ? new URL(bm[1], base).href : base
  const abs = (h) => { try { return new URL(decodeEnt(h), root).href } catch { return null } }

  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = (attr(tag, "rel") || "").toLowerCase()
    const href = attr(tag, "href")
    if (!href || href.startsWith("data:")) continue
    if (/mask-icon/.test(rel)) continue // ícono monocromo de Safari: no es el logo a color
    if (/apple-touch-icon/.test(rel)) out.push({ url: abs(href), hint: maxSize(attr(tag, "sizes")) || 180, kind: "apple-touch-icon" })
    else if (/(^|\s)icon(\s|$)/.test(rel)) {
      const type = (attr(tag, "type") || "").toLowerCase()
      const svg = /svg/.test(type) || /\.svg(\?|$)/i.test(href)
      out.push({ url: abs(href), hint: svg ? 1000 : maxSize(attr(tag, "sizes")) || 32, kind: svg ? "icon-svg" : "icon" })
    } else if (/manifest/.test(rel)) {
      const murl = abs(href)
      try {
        const r = await F.get(murl, "application/manifest+json,application/json")
        if (r.ok) {
          const m = JSON.parse(r.buf.toString("utf8"))
          for (const ic of m.icons ?? []) {
            if (!ic.src || /monochrome/.test(ic.purpose || "")) continue
            out.push({ url: new URL(ic.src, r.url || murl).href, hint: maxSize(ic.sizes) || 96, kind: "manifest" })
          }
        }
      } catch { /* manifest roto: se ignora */ }
    }
  }
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (/msapplication-tileimage/i.test(attr(tag, "name") || "") && attr(tag, "content")) out.push({ url: abs(attr(tag, "content")), hint: 144, kind: "ms-tile" })
  }
  return { list: out.filter((c) => c.url || c.note), origin: new URL(base).origin }
}

// ICO: toma la imagen más grande (PNG incrustado o BMP de 1, 4, 8, 24 o 32 bits con su máscara).
function decodeIco(buf) {
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return null
  const n = buf.readUInt16LE(4)
  let best = null
  for (let i = 0; i < n; i++) {
    const o = 6 + i * 16
    if (o + 16 > buf.length) break
    const w = buf[o] || 256, bpp = buf.readUInt16LE(o + 6), size = buf.readUInt32LE(o + 8), off = buf.readUInt32LE(o + 12)
    if (!best || w > best.w || (w === best.w && bpp > best.bpp)) best = { w, bpp, data: buf.subarray(off, off + size) }
  }
  if (!best || best.data.length < 40) return null
  if (best.data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { png: best.data, w: best.w }
  const d = best.data, hs = d.readUInt32LE(0), w = d.readInt32LE(4), h = Math.abs(d.readInt32LE(8)) / 2, bpp = d.readUInt16LE(14)
  if (![1, 4, 8, 24, 32].includes(bpp)) return { w, unsupported: `BMP de ${bpp} bits` }
  const ncol = bpp <= 8 ? d.readUInt32LE(32) || 1 << bpp : 0
  const pal = hs, px0 = hs + ncol * 4
  const stride = Math.ceil((w * bpp) / 32) * 4, mstride = Math.ceil(w / 32) * 4, m0 = px0 + stride * h
  const raw = Buffer.alloc(w * h * 4)
  let anyAlpha = false
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const row = px0 + (h - 1 - y) * stride, t = (y * w + x) * 4
    let r, g, b, a = 255
    if (bpp === 32) { const s = row + x * 4; b = d[s]; g = d[s + 1]; r = d[s + 2]; a = d[s + 3]; if (a) anyAlpha = true }
    else if (bpp === 24) { const s = row + x * 3; b = d[s]; g = d[s + 1]; r = d[s + 2] }
    else {
      const bit = x * bpp, byte = d[row + (bit >> 3)], idx = (byte >> (8 - bpp - (bit & 7))) & ((1 << bpp) - 1), c = pal + idx * 4
      b = d[c]; g = d[c + 1]; r = d[c + 2]
    }
    raw[t] = r; raw[t + 1] = g; raw[t + 2] = b; raw[t + 3] = a
  }
  // Máscara AND (1 = transparente) cuando la imagen no trae canal alfa propio.
  if (!anyAlpha && m0 + mstride * h <= d.length) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const byte = d[m0 + (h - 1 - y) * mstride + (x >> 3)]
    if ((byte >> (7 - (x & 7))) & 1) raw[(y * w + x) * 4 + 3] = 0
  }
  return { raw, w, h }
}

function sanitizeSvg(txt) {
  let s = txt
    .replace(/<\?xml[^>]*\?>/gi, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script[^>]*\/>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(xlink:)?href\s*=\s*("([^"]*)"|'([^']*)')/gi, (m, _x, _q, a, b) => {
      const v = (a ?? b ?? "").trim()
      return v.startsWith("#") || /^data:image\/(png|jpe?g|gif|webp);/i.test(v) ? m : ""
    })
    .replace(/@import[^;]+;/gi, "")
    .replace(/url\(\s*['"]?(?!#)[^)]*\)/gi, "none")
    .trim()
  // Sin viewBox no se puede reescalar: se crea a partir de width/height.
  const open = s.match(/<svg\b[^>]*>/i)?.[0]
  if (open && !/viewBox/i.test(open)) {
    const w = parseFloat(attr(open, "width") || ""), h = parseFloat(attr(open, "height") || "")
    if (w && h) s = s.replace(open, open.replace(/<svg/i, `<svg viewBox="0 0 ${w} ${h}"`))
  }
  return s
}

const svgRatio = (s) => {
  const open = s.match(/<svg\b[^>]*>/i)?.[0] || ""
  const vb = (attr(open, "viewBox") || "").split(/[\s,]+/).map(Number)
  if (vb.length === 4 && vb[2] && vb[3]) return vb[2] / vb[3]
  return 1
}

/** Ícono en RGBA 128×128 (contain, transparente) para medir sangre y forma. */
async function toPng(input, opts = {}) {
  return sharp(input, { density: 300, ...opts })
    .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer()
}

async function isBleed(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width, H = info.height
  let op = 0, tot = 0
  const px = (x, y) => data[(y * W + x) * 4 + 3]
  for (let x = 0; x < W; x++) for (const y of [1, H - 2]) { tot++; if (px(x, y) > 200) op++ }
  for (let y = 0; y < H; y++) for (const x of [1, W - 2]) { tot++; if (px(x, y) > 200) op++ }
  return op / tot >= 0.85
}

/** Descarga y mide un candidato. Devuelve { kind: "svg"|"png", buf, px, ratio } o { err }. */
async function load(c, F) {
  let r
  try { r = await F.get(c.url, "image/avif,image/webp,image/svg+xml,image/png,image/*,*/*") } catch (e) { return { err: e.cause?.code || e.message.split("\n")[0] } }
  if (!r.ok) return { err: `HTTP ${r.status}` }
  const { ct, buf } = r
  if (buf.length < 50) return { err: "vacío" }
  const head = buf.subarray(0, 300).toString("utf8").trimStart().toLowerCase()
  if (head.startsWith("<!doctype html") || head.startsWith("<html")) return { err: "devolvió HTML" }
  const isSvg = /svg/.test(ct) || /^(\ufeff)?\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!doctype svg[^>]*>\s*)?<svg[\s>]/i.test(buf.toString("utf8", 0, 4000))
  if (isSvg) {
    const svg = sanitizeSvg(buf.toString("utf8"))
    try { await toPng(Buffer.from(svg)) } catch (e) { return { err: `SVG ilegible: ${e.message}` } }
    return { kind: "svg", svg, px: 1000, ratio: svgRatio(svg) }
  }
  let input = buf, raw
  if (buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1) {
    const ico = decodeIco(buf)
    if (!ico) return { err: "ICO ilegible" }
    if (ico.unsupported) return { err: ico.unsupported, px: ico.w }
    if (ico.png) input = ico.png
    else { raw = { width: ico.w, height: ico.h, channels: 4 }; input = ico.raw }
  }
  try {
    const meta = await sharp(input, raw ? { raw } : {}).metadata()
    if (meta.format === "svg") {
      const svg = sanitizeSvg(input.toString("utf8"))
      return { kind: "svg", svg, px: 1000, ratio: svgRatio(svg) }
    }
    return { kind: "png", buf: input, raw, px: Math.min(meta.width, meta.height), ratio: meta.width / meta.height }
  } catch { return { err: `imagen ilegible (${ct || "sin tipo"})` } }
}

async function processKey(key, sites, F) {
  const tried = []
  let best = null, bestUrl = null
  for (const site of sites) {
    const isUrl = /^https?:\/\//.test(site)
    const { list, origin } = isUrl ? { list: [{ url: site, hint: 999, kind: "manual" }], origin: new URL(site).origin } : await candidatesFrom(site, F)
    for (const c of list) if (c.note) tried.push(`${site}: ${c.note}`)
    let cands = list.filter((c) => c.url).sort((a, b) => b.hint - a.hint)
    const seen = new Set()
    cands = cands.filter((c) => !seen.has(c.url) && seen.add(c.url))
    const consider = async (c) => {
      const res = await load(c, F)
      if (res.err) { tried.push(`${c.url}: ${res.err}`); return }
      if (!best || res.px > best.px || (res.px === best.px && res.kind === "svg")) { best = res; bestUrl = c.url }
    }
    for (const c of cands.slice(0, 8)) await consider(c)
    if (!best || best.px < MIN_PX) {
      for (const p of ["/apple-touch-icon.png", "/apple-touch-icon-precomposed.png", "/favicon.svg", "/favicon.ico"]) {
        if (!seen.has(origin + p)) await consider({ url: origin + p })
        if (best && best.px >= 180) break
      }
    }
    if (best && best.px >= MIN_PX) break
  }
  if (!best) return { key, status: "falló", why: `[${F.name}] ` + (tried.slice(0, 4).join(" | ") || "sin candidatos") }
  if (best.px < MIN_PX) return { key, status: "baja", px: best.px, why: `[${F.name}] ${best.px}px en ${bestUrl}` }
  if (best.ratio > 1.6 || best.ratio < 0.625) return { key, status: "falló", why: `forma ancha (${best.ratio.toFixed(2)}) en ${bestUrl}` }

  for (const ext of ["png", "svg"]) if (existsSync(`${OUT_DIR}/${key}.${ext}`)) unlinkSync(`${OUT_DIR}/${key}.${ext}`)
  let file, png
  // Un SVG pesado (p. ej. con una imagen incrustada) se guarda como PNG 128×128: pesa mucho menos y se ve igual.
  if (best.kind === "svg" && best.svg.length <= 40 * 1024) {
    file = `${key}.svg`
    writeFileSync(`${OUT_DIR}/${file}`, best.svg)
    png = await toPng(Buffer.from(best.svg))
  } else {
    file = `${key}.png`
    png = best.kind === "svg" ? await toPng(Buffer.from(best.svg)) : await toPng(best.buf, best.raw ? { raw: best.raw } : {})
    writeFileSync(`${OUT_DIR}/${file}`, png)
  }
  const bleed = await isBleed(png)
  return { key, status: "ok", entry: { file: `/brands/${file}`, bleed, from: bestUrl, at: AT }, why: `${best.kind} ${best.px >= 1000 ? "vector" : best.px + "px"}${bleed ? " · sangre" : ""}` }
}

// Un sitio que no responde no debe frenar a los demás.
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`sin respuesta en ${ms / 1000} s`)), ms).unref())])

// ── principal ────────────────────────────────────────────────────────────────
mkdirSync(OUT_DIR, { recursive: true })
const noBrowser = process.argv.includes("--sin-navegador")
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"))
const db = existsSync(OUT_JSON) ? JSON.parse(readFileSync(OUT_JSON, "utf8")) : {}
const todo = T.filter(([k]) => !only.length || only.includes(k))
const results = []

const drop = (k) => {
  delete db[k]
  for (const ext of ["png", "svg"]) if (existsSync(`${OUT_DIR}/${k}.${ext}`)) unlinkSync(`${OUT_DIR}/${k}.${ext}`)
}

const queue = [...todo]
await Promise.all(Array.from({ length: 6 }, async () => {
  for (let it = queue.shift(); it; it = queue.shift()) {
    const [k, ...sites] = it
    if (SKIP[k]) { drop(k); results.push({ key: k, status: "descartado", why: SKIP[k] }); continue }
    let res
    try { res = await withTimeout(processKey(k, sites, nodeFetcher), 120000) } catch (e) { res = { key: k, status: "falló", why: e.message } }
    if (res.status !== "ok" && !noBrowser) {
      // Segundo intento con un navegador real (bloqueos anti-bots, <head> armado con JavaScript, certificados
      // intermedios que Node no completa).
      const F = await browserFetcher()
      let r2
      try { r2 = await withTimeout(processKey(k, sites, F), 120000) } catch (e) { r2 = { key: k, status: "falló", why: `[navegador] ${e.message.split("\n")[0]}` } }
      finally { await withTimeout(F.close(), 10000).catch(() => {}) }
      if (r2.status === "ok" || (r2.status === "baja" && (res.status === "falló" || r2.px > res.px))) res = r2
    }
    if (res.status === "ok") db[k] = res.entry
    else drop(k)
    results.push(res)
    console.log(`${res.status.padEnd(10)} ${k.padEnd(18)} ${res.why ?? ""}`)
  }
}))

if (browser) await withTimeout(browser.close(), 15000).catch(() => {})
const sorted = Object.fromEntries(Object.keys(db).sort().map((k) => [k, db[k]]))
writeFileSync(OUT_JSON, JSON.stringify(sorted, null, 2) + "\n")
const by = (s) => results.filter((r) => r.status === s).map((r) => r.key)
console.log(`\nok (${by("ok").length}): ${by("ok").join(", ")}`)
console.log(`baja (${by("baja").length}): ${by("baja").join(", ")}`)
console.log(`falló (${by("falló").length}): ${by("falló").join(", ")}`)
if (by("descartado").length) console.log(`descartado (${by("descartado").length}): ${by("descartado").join(", ")}`)

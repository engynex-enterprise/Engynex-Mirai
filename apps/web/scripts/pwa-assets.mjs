// Genera las imágenes de Mirai instalado (PWA) en public/pwa/: íconos (any, maskable, monocromo), ícono de Apple,
// íconos de los accesos directos, splash de iPhone/iPad (claro y oscuro) y capturas de muestra para el diálogo de
// instalación de Android/Chrome. Usa sharp (viene con Next) y los isotipos de lib/data/iso.json.
//
// Uso: npm run pwa:assets            (todo)
//      npm run pwa:assets -- --sin-capturas   (no toca public/pwa/capturas: p. ej. si ya pusiste capturas reales
//                                              con scripts/pwa-screenshots.mjs)
// Detalle en docs/PWA.md.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { PWA_COLORS, PWA_SHORTCUTS } from "../lib/pwa/config.ts"
import { splashImages } from "../lib/pwa/splash.ts"

let sharp
try { sharp = (await import("sharp")).default } catch {
  console.error("Falta sharp. Instálalo con: npm i -D sharp")
  process.exit(1)
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const OUT = join(root, "public/pwa")
const iso = JSON.parse(readFileSync(join(root, "lib/data/iso.json"), "utf8"))
const skipShots = process.argv.includes("--sin-capturas")
for (const d of ["", "atajos", "splash", "capturas"]) mkdirSync(join(OUT, d), { recursive: true })

const FONT = "'Helvetica Neue', Helvetica, Arial, sans-serif"
const C = { ...PWA_COLORS, ink: "#1C2B33", muted: "#65676B", brand: "#2A7F14", expense: "#E41E3F", card: "#FFFFFF" }

/** Isotipo (viewBox 256) dentro de un cuadro x,y,size. */
const isoAt = (k, x, y, size) => `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 256 256">${iso.icons[k] ?? iso.icons.mirai}</svg>`
const doc = (w, h, body, vw = w, vh = h) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${vw} ${vh}"><defs>${iso.defs}
  <linearGradient id="pwa-navy" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2B3F6E"/><stop offset=".55" stop-color="#1F2B4B"/><stop offset="1" stop-color="#1D3F2A"/></linearGradient>
  <linearGradient id="pwa-hero" x1="0" y1="0" x2="1" y2=".4"><stop offset="0" stop-color="#1F2B4B"/><stop offset=".55" stop-color="#1F5C3A"/><stop offset="1" stop-color="#2A9D3A"/></linearGradient>
  <linearGradient id="pwa-brand" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9EDB4E"/><stop offset=".45" stop-color="#2A9D3A"/><stop offset="1" stop-color="#13778F"/></linearGradient>
  <linearGradient id="pwa-app" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F8EDF1"/><stop offset=".45" stop-color="#F1EBF6"/><stop offset="1" stop-color="#DFE9FA"/></linearGradient>
</defs>${body}</svg>`
const png = async (svg, file) => { await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(join(OUT, file)); return file }
const out = []

// ── Ícono de la app ──
// any: cuadro navy redondeado (escritorio, Windows, macOS). maskable: navy a sangre con el logo en la zona segura (80 %).
const appIcon = (s, { radius = 0.22, logo = 0.66 } = {}) => doc(s, s,
  `<rect width="${s}" height="${s}" rx="${s * radius}" fill="url(#pwa-navy)"/>
   ${isoAt("mirai", s * (1 - logo) / 2, s * (1 - logo) / 2 + s * 0.01, s * logo)}`)
for (const s of [192, 512]) {
  out.push(await png(appIcon(s), `icon-${s}.png`))
  out.push(await png(appIcon(s, { radius: 0, logo: 0.54 }), `maskable-${s}.png`))
}
// Apple: iOS redondea solo y no acepta transparencia (el fondo transparente sale negro).
out.push(await png(appIcon(180, { radius: 0, logo: 0.64 }), "apple-touch-icon.png"))
// Monocromo (íconos temáticos de Android 13+ e ícono pequeño de las notificaciones): silueta blanca sin fondo.
const mono = (s, k = 0.7) => doc(s, s, `<svg x="${s * (1 - k) / 2}" y="${s * (1 - k) / 2}" width="${s * k}" height="${s * k}" viewBox="0 0 256 256">${(iso.icons.mirai).replace(/fill="url\(#[^)]+\)"/g, 'fill="#FFFFFF"')}</svg>`)
out.push(await png(mono(512), "monochrome-512.png"))
out.push(await png(mono(96, 0.82), "badge-96.png"))

// ── Accesos directos (96 y 192): fondo pastel opaco (se ve en lanzadores claros y oscuros), isotipo y "+" si crea algo ──
const shortcutIcon = (sc, s) => doc(s, s,
  `<rect width="${s}" height="${s}" rx="${s * 0.22}" fill="${sc.tint}"/>
   <rect x="${s * 0.02}" y="${s * 0.02}" width="${s * 0.96}" height="${s * 0.96}" rx="${s * 0.2}" fill="none" stroke="#1F2B4B" stroke-opacity=".06" stroke-width="${s * 0.02}"/>
   ${isoAt(sc.iso, s * 0.2, s * 0.18, s * 0.6)}
   ${sc.plus ? `<circle cx="${s * 0.74}" cy="${s * 0.74}" r="${s * 0.13}" fill="${C.brand}" stroke="${sc.tint}" stroke-width="${s * 0.045}"/>
     <path d="M${s * 0.74} ${s * 0.685}v${s * 0.11}M${s * 0.685} ${s * 0.74}h${s * 0.11}" stroke="#fff" stroke-width="${s * 0.032}" stroke-linecap="round"/>` : ""}`)
for (const sc of PWA_SHORTCUTS) {
  out.push(await png(shortcutIcon(sc, 96), `atajos/${sc.id}.png`))
  out.push(await png(shortcutIcon(sc, 192), `atajos/${sc.id}-192.png`))
}

// ── Splash de iPhone y iPad ──
const splash = (w, h, scheme) => {
  const m = Math.min(w, h), dark = scheme === "dark"
  const logo = m * 0.26, cy = h * 0.44
  return doc(w, h,
    `<rect width="${w}" height="${h}" fill="${dark ? C.backgroundDark : C.backgroundLight}"/>
     ${isoAt("mirai", (w - logo) / 2, cy - logo / 2, logo)}
     <text x="${w / 2}" y="${cy + logo * 0.78}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${m * 0.075}" fill="${dark ? "#E4E6EB" : C.navy}">Mirai</text>
     <text x="${w / 2}" y="${cy + logo * 0.78 + m * 0.06}" text-anchor="middle" font-family="${FONT}" font-size="${m * 0.034}" fill="${dark ? "#B0B3B8" : C.muted}">Tu futuro financiero</text>`)
}
for (const s of splashImages()) {
  await sharp(Buffer.from(splash(s.width, s.height, s.scheme))).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(join(OUT, "splash", s.file))
  out.push(`splash/${s.file}`)
}

// ── Capturas de muestra (diálogo de instalación enriquecido de Android y Chrome de escritorio) ──
// Ilustran la app con datos de ejemplo. Para capturas reales: scripts/pwa-screenshots.mjs (Playwright).
const money = (n) => "$ " + Math.round(n).toLocaleString("es-CO")
const card = (x, y, w, h, inner = "", r = 14) => `<rect x="${x}" y="${y + 1}" width="${w}" height="${h}" rx="${r}" fill="#000" opacity=".06"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="#fff" fill-opacity=".86"/>${inner}`
const t = (x, y, s, txt, o = {}) => `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${s}" font-weight="${o.w ?? 400}" fill="${o.c ?? C.ink}" text-anchor="${o.a ?? "start"}">${txt}</text>`
const pill = (x, y, w, h, c) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${c}"/>`
const PAGOS = [["fijos", "Arriendo", "5 nov", 1200000], ["suscripciones", "Netflix", "8 nov", 26900], ["le-debo", "Cuota Bancolombia", "15 nov", 412000], ["tarjetas", "Tarjeta Visa", "18 nov", 380500]]
const MOVS = [["gastos", "Mercado en el D1", "Hoy", -86400], ["ingresos", "Quincena", "Ayer", 2100000], ["gastos", "Gasolina", "31 oct", -60000], ["me-deben", "Abono de Juan", "30 oct", 150000]]
const row = (x, y, w, [k, a, b, v], s = 1) => `${isoAt(k, x, y, 34 * s)}${t(x + 46 * s, y + 15 * s, 14 * s, a, { w: 600 })}${t(x + 46 * s, y + 32 * s, 12 * s, b, { c: C.muted })}${t(x + w, y + 22 * s, 14 * s, (v > 0 ? "+" : "") + money(v).replace("$ -", "-$ "), { w: 700, a: "end", c: v > 0 ? C.brand : C.ink })}`

function wide(kind) {
  const W = 1280, H = 800
  const menu = ["inicio", "dashboard", "balance", "gastos", "ingresos", "le-debo", "me-deben", "metas", "recordatorios"]
  const labels = { inicio: "Inicio", dashboard: "Dashboard", balance: "Balance", gastos: "Gastos", ingresos: "Ingresos", "le-debo": "Le debo", "me-deben": "Me deben", metas: "Metas", recordatorios: "Próximos pagos" }
  const active = kind === "balance" ? "balance" : "inicio"
  let side = `<rect width="260" height="${H}" fill="#fff" fill-opacity=".55"/>${isoAt("mirai", 20, 18, 34)}${t(62, 42, 20, "Mirai", { w: 700, c: C.navy })}
    ${pill(20, 70, 220, 40, "#E4E6EB")}${t(40, 95, 14, "Buscar en Mirai", { c: C.muted })}${pill(20, 120, 220, 40, C.brand)}${t(130, 145, 15, "+ Agregar", { w: 700, c: "#fff", a: "middle" })}`
  menu.forEach((k, i) => {
    const y = 180 + i * 48
    if (k === active) side += `<rect x="12" y="${y - 6}" width="236" height="44" rx="8" fill="#283943"/>`
    side += `<circle cx="38" cy="${y + 16}" r="17" fill="#fff"/>${isoAt(k, 27, y + 5, 22)}${t(66, y + 21, 15, labels[k], { w: k === active ? 600 : 400, c: k === active ? "#fff" : C.ink })}`
  })
  let main = ""
  if (kind === "inicio") {
    main += t(300, 64, 28, "Hola, Laura", { w: 700 }) + t(300, 90, 15, "Así va tu plata hoy, 2 de noviembre", { c: C.muted })
    main += `<rect x="300" y="112" width="940" height="150" rx="18" fill="url(#pwa-hero)"/>${t(330, 152, 16, "Te queda esta quincena", { c: "#DDE7D7" })}${t(330, 206, 46, money(1245300), { w: 700, c: "#fff" })}${t(330, 238, 14, "Puedes gastar " + money(89000) + " al día hasta el 15 de noviembre", { c: "#DDE7D7" })}${isoAt("balance", 1110, 128, 110)}`
    ;[["ingresos", "Entra este mes", 4200000, C.brand], ["gastos", "Llevas gastado", 2310450, C.expense], ["recordatorios", "Por pagar", 640000, C.navy]].forEach(([k, l, v, c], i) => {
      const x = 300 + i * 320
      main += card(x, 282, 300, 104, `${isoAt(k, x + 18, 300, 40)}${t(x + 70, 318, 14, l, { c: C.muted })}${t(x + 70, 350, 26, money(v), { w: 700, c })}`)
    })
    main += card(300, 406, 560, 360, t(322, 442, 18, "Próximos pagos", { w: 700 }) + PAGOS.map(([k, a, b, v], i) => row(322, 466 + i * 70, 516, [k, a, b, -v])).join(""))
    const seg = [[0.34, "#2A7F14"], [0.22, "#1F2B4B"], [0.16, "#9EDB4E"], [0.14, "#F5A524"], [0.14, "#1B8BA8"]]
    let a = -Math.PI / 2, arcs = ""
    for (const [f, c] of seg) { const b = a + f * 2 * Math.PI, R = 92, cx = 1000, cy = 590; arcs += `<path d="M${cx + R * Math.cos(a)} ${cy + R * Math.sin(a)}A${R} ${R} 0 ${f > 0.5 ? 1 : 0} 1 ${cx + R * Math.cos(b)} ${cy + R * Math.sin(b)}" fill="none" stroke="${c}" stroke-width="30"/>`; a = b + 0.02 }
    main += card(880, 406, 360, 360, t(902, 442, 18, "En qué se va la plata", { w: 700 }) + arcs + t(1000, 586, 13, "Este mes", { a: "middle", c: C.muted }) + t(1000, 608, 20, money(2310450), { a: "middle", w: 700 })
      + [["Mercado 34 %", "#2A7F14"], ["Vivienda 22 %", "#1F2B4B"], ["Transporte 16 %", "#9EDB4E"]].map(([l, c], i) => `<circle cx="${908 + i * 112}" cy="726" r="5" fill="${c}"/>` + t(918 + i * 112, 730, 12, l, { c: C.muted })).join(""))
  } else {
    main += t(300, 64, 28, "Balance", { w: 700 }) + t(300, 90, 15, "Todo lo que entra y sale, sin contar nada dos veces", { c: C.muted })
    ;[["Lo que entra", 4200000, C.brand], ["Lo que sale", 3180000, C.expense], ["Lo que ahorras", 420000, C.navy], ["Te queda", 600000, C.brand]].forEach(([l, v, c], i) => {
      const x = 300 + i * 237
      main += card(x, 112, 222, 96, t(x + 18, 146, 14, l, { c: C.muted }) + t(x + 18, 180, 24, money(v), { w: 700, c }))
    })
    const months = ["jun", "jul", "ago", "sep", "oct", "nov"]
    let bars = ""
    months.forEach((m, i) => {
      const x = 340 + i * 86, inc = 150 + (i % 3) * 18, exp = 110 + ((i + 1) % 4) * 20
      bars += `<rect x="${x}" y="${560 - inc}" width="26" height="${inc}" rx="5" fill="#2A7F14"/><rect x="${x + 30}" y="${560 - exp}" width="26" height="${exp}" rx="5" fill="#F3687E"/>${t(x + 28, 584, 13, m, { a: "middle", c: C.muted })}`
    })
    main += card(300, 228, 560, 380, t(322, 264, 18, "Entra y sale, mes a mes", { w: 700 }) + bars)
    main += card(880, 228, 360, 540, t(902, 264, 18, "1.ª quincena de noviembre", { w: 700 }) + MOVS.concat(PAGOS.slice(0, 2).map(([k, a, b, v]) => [k, a, b, -v])).map((p, i) => row(902, 290 + i * 74, 316, p)).join(""))
    main += card(300, 628, 560, 140, t(322, 664, 18, "Tu patrimonio", { w: 700 }) + t(322, 708, 32, money(18450000), { w: 700, c: C.navy }) + t(322, 740, 14, "+ " + money(620000) + " frente al mes pasado", { c: C.brand }))
  }
  return doc(W, H, `<rect width="${W}" height="${H}" fill="url(#pwa-app)"/>${side}${main}`)
}

function narrow(kind) {
  const W = 412, H = 915, S = 2
  let b = `<rect width="${W}" height="${H}" fill="url(#pwa-app)"/>${t(20, 30, 14, "9:41", { w: 700 })}`
  const tabbar = `<rect y="${H - 78}" width="${W}" height="78" fill="#fff" fill-opacity=".86"/>${[["inicio", "Inicio"], ["gastos", "Gastos"], [null, "Agregar"], ["recordatorios", "Pagos"], ["ajustes", "Menú"]].map(([k, l], i) => {
    const x = 41 + i * 82.5
    return (k ? isoAt(k, x - 13, H - 66, 26) : `<circle cx="${x}" cy="${H - 66}" r="26" fill="url(#pwa-brand)" stroke="#fff" stroke-width="4"/><path d="M${x} ${H - 78}v24M${x - 12} ${H - 66}h24" stroke="#fff" stroke-width="3.5" stroke-linecap="round"/>`) + t(x, H - 24, 11, l, { a: "middle", w: 600, c: i === 0 && kind !== "deudas" ? C.brand : C.muted })
  }).join("")}`
  if (kind === "inicio" || kind === "gasto") {
    b += t(20, 78, 24, "Hola, Laura", { w: 700 }) + t(20, 100, 13, "Así va tu plata hoy", { c: C.muted })
    b += `<rect x="16" y="118" width="380" height="140" rx="18" fill="url(#pwa-hero)"/>${t(36, 152, 14, "Te queda esta quincena", { c: "#DDE7D7" })}${t(36, 198, 36, money(1245300), { w: 700, c: "#fff" })}${t(36, 230, 12, money(89000) + " al día hasta el 15", { c: "#DDE7D7" })}`
    b += card(16, 274, 184, 92, isoAt("ingresos", 30, 288, 28) + t(30, 336, 12, "Entra este mes", { c: C.muted }) + t(30, 356, 18, money(4200000), { w: 700, c: C.brand }))
    b += card(212, 274, 184, 92, isoAt("gastos", 226, 288, 28) + t(226, 336, 12, "Llevas gastado", { c: C.muted }) + t(226, 356, 18, money(2310450), { w: 700, c: C.expense }))
    b += card(16, 382, 380, 330, t(34, 414, 16, "Últimos movimientos", { w: 700 }) + MOVS.map((p, i) => row(34, 434 + i * 68, 344, p)).join(""))
  }
  if (kind === "gasto") {
    b += `<rect width="${W}" height="${H}" fill="#000" opacity=".28"/><rect x="0" y="300" width="${W}" height="${H - 300}" rx="26" fill="#fff"/>${pill(166, 312, 80, 5, "#E4E6EB")}`
    b += t(W / 2, 352, 18, "Registrar gasto", { w: 700, a: "middle" })
    b += `${pill(20, 374, 230, 36, "#E7F5D9")}${t(135, 397, 13, "Leer una factura con foto", { a: "middle", w: 600, c: "#1F5C0E" })}`
    const field = (y, l, v) => t(20, y, 13, l, { w: 600 }) + `<rect x="20" y="${y + 8}" width="372" height="46" rx="8" fill="#fff" stroke="#CED0D4"/>` + t(34, y + 37, 15, v)
    b += field(440, "¿En qué gastaste?", "Mercado en el D1") + field(516, "Valor", money(86400)) + field(592, "Categoría", "Mercado") + field(668, "Fecha", "Hoy, 2 nov 2026")
    b += `${pill(20, 760, 372, 48, C.brand)}${t(W / 2, 790, 16, "Guardar", { a: "middle", w: 700, c: "#fff" })}`
    b += t(W / 2, 836, 12, "La categoría se puso sola según lo que escribiste.", { a: "middle", c: C.muted })
    return doc(W * S, H * S, b, W, H)
  }
  if (kind === "deudas") {
    b += t(20, 78, 24, "Le debo", { w: 700 }) + t(20, 100, 13, "Tus créditos y deudas, con su próxima cuota", { c: C.muted })
    b += card(16, 118, 380, 96, t(34, 150, 13, "Debes en total", { c: C.muted }) + t(34, 186, 28, money(12840000), { w: 700, c: C.navy }) + t(382, 186, 13, "3 deudas", { a: "end", c: C.muted }))
    ;[["le-debo", "Bancolombia · libre inversión", "Cuota " + money(412000) + " · 15 nov", 0.62], ["tarjetas", "Tarjeta Visa", "Pago mínimo " + money(380500) + " · 18 nov", 0.35], ["contactos", "Tienda Don Pedro (fiado)", money(84000) + " · pago único 30 nov", 0.1]].forEach(([k, a, s, f], i) => {
      const y = 230 + i * 150
      b += card(16, y, 380, 134, isoAt(k, 32, y + 18, 40) + t(84, y + 36, 15, a, { w: 700 }) + t(84, y + 56, 12, s, { c: C.muted }) + pill(32, y + 82, 348, 10, "#E4E6EB") + pill(32, y + 82, 348 * f, 10, C.brand) + t(32, y + 116, 12, Math.round(f * 100) + " % pagado", { c: C.muted }))
    })
    b += card(16, 690, 380, 120, isoAt("me-deben", 32, 708, 40) + t(84, 726, 15, "Me deben", { w: 700 }) + t(84, 748, 12, "Juan te debe " + money(450000) + " · cobra el 20 nov", { c: C.muted }) + pill(84, 764, 150, 30, "#E5EFFB") + t(159, 784, 12, "Recordarle por WhatsApp", { a: "middle", w: 600, c: "#1B5FA8" }))
  }
  return doc(W * S, H * S, b + tabbar, W, H)
}

if (!skipShots) {
  out.push(await png(wide("inicio"), "capturas/escritorio-inicio.png"))
  out.push(await png(wide("balance"), "capturas/escritorio-balance.png"))
  out.push(await png(narrow("inicio"), "capturas/celular-inicio.png"))
  out.push(await png(narrow("gasto"), "capturas/celular-gasto.png"))
  out.push(await png(narrow("deudas"), "capturas/celular-deudas.png"))
}

writeFileSync(join(OUT, "README.txt"), "Generado por scripts/pwa-assets.mjs (npm run pwa:assets). No editar a mano: ver docs/PWA.md.\n")
console.log(`${out.length} imágenes en public/pwa`)

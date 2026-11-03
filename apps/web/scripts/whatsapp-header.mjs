// Genera la imagen de encabezado por defecto de las plantillas de WhatsApp (public/brand/whatsapp-header.png, 1125×600)
// a partir de un SVG con la paleta Engynex y el logo de Mirai. Uso: node scripts/whatsapp-header.mjs
import sharp from "sharp"

const W = 1125, H = 600
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1F2B4B"/><stop offset="1" stop-color="#16203A"/></linearGradient>
    <linearGradient id="ac" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9EDB4E"/><stop offset="1" stop-color="#3F7A1E"/></linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <circle cx="${W - 70}" cy="80" r="230" fill="#9EDB4E" opacity="0.10"/>
  <circle cx="${W - 20}" cy="${H - 40}" r="170" fill="#3F7A1E" opacity="0.22"/>
  <rect x="80" y="${H - 96}" width="260" height="10" rx="5" fill="url(#ac)"/>
  <text x="80" y="300" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="92" font-weight="700" fill="#FFFFFF">Engynex <tspan fill="#9EDB4E">Mirai</tspan></text>
  <text x="82" y="388" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="50" font-weight="500" fill="#DCE3F0">Tus pagos, siempre a tiempo</text>
  <text x="82" y="${H - 120}" font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-size="26" fill="#9FB0CF">Tu futuro financiero · mirai.engynex.com</text>
</svg>`

const logo = await sharp("public/brand/mirai-logo.png").resize(120, 120, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
await sharp(Buffer.from(svg)).composite([{ input: logo, left: 80, top: 80 }]).png({ compressionLevel: 9 }).toFile("public/brand/whatsapp-header.png")
console.log("public/brand/whatsapp-header.png listo")

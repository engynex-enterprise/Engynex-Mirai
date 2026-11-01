// Isotipos nuevos de Mirai con el lenguaje de la colección (estilo Microsoft 365 / Fluent: formas fluidas,
// degradados de una misma familia, volumen sutil con las capas iso-hl / iso-sh, sin glow ni sombras exteriores).
// Uso: node scripts/isos-mirai.mjs  (idempotente: reemplaza los que ya existan)
import { readFileSync, writeFileSync } from "node:fs"

const FILE = "lib/data/iso.json"
const iso = JSON.parse(readFileSync(FILE, "utf8"))

const lg = (id, stops, dir = "0 0 1 1") => {
  const [x1, y1, x2, y2] = dir.split(" ")
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient>`
}
const fam = {
  rojo: [[0, "#FFB3C1"], [0.55, "#F0506E"], [1, "#C2264B"]],
  coral: [[0, "#FFC9A8"], [0.55, "#FF8A5B"], [1, "#E5572F"]],
  naranja: [[0, "#FFE3A0"], [0.55, "#FFB547"], [1, "#E98A12"]],
  amarillo: [[0, "#FFF0B3"], [0.55, "#FFD15C"], [1, "#E8A814"]],
  verde: [[0, "#A8F0C6"], [0.55, "#2FBF71"], [1, "#137447"]],
  menta: [[0, "#C9F5E4"], [0.55, "#5AD6A8"], [1, "#1E9E7A"]],
  azul: [[0, "#86D4FF"], [0.55, "#3D8BFF"], [1, "#2349C9"]],
  cyan: [[0, "#A8F0FF"], [0.55, "#2CC7EA"], [1, "#117FA8"]],
  morado: [[0, "#DCC4FF"], [0.55, "#9361F5"], [1, "#5A2BC2"]],
  lavanda: [[0, "#EFE6FF"], [0.6, "#C9B0FF"], [1, "#9C7BEF"]],
  teal: [[0, "#A6F2EA"], [0.55, "#22BFAE"], [1, "#0E7C74"]],
  claro: [[0, "#FFFFFF"], [1, "#E4ECFA"]],
}
const shade = (d, g) => `<path d="${d}" fill="url(#${g})" /><path d="${d}" fill="url(#iso-hl)" /><path d="${d}" fill="url(#iso-sh)" />`

/** Cada isotipo: gradientes [familia, dirección] y el SVG interior (viewBox 256). */
const NEW = {
  // Notificaciones: campana rosa con un globo de aviso coral (sin números).
  notificaciones: {
    g: [["rojo", "0.2 0 0.8 1"], ["coral"], ["coral"]],
    svg: (k) => `<path d="M106 206a22 22 0 1 0 44 0a22 22 0 1 0 -44 0Z" fill="url(#${k}-3)" />`
      + shade("M128 38C86 38 66 72 66 112V152L48 178Q42 192 56 192H200Q214 192 208 178L190 152V112C190 72 170 38 128 38Z", `${k}-1`)
      + `<path d="M116 34a12 12 0 1 0 24 0a12 12 0 1 0 -24 0Z" fill="url(#${k}-3)" />`
      + `<path d="M164 64a30 30 0 1 0 60 0a30 30 0 1 0 -60 0Z" fill="url(#${k}-2)" /><path d="M164 64a30 30 0 1 0 60 0a30 30 0 1 0 -60 0Z" fill="url(#iso-hl)" />`
      + `<path d="M182 64a12 12 0 1 0 24 0a12 12 0 1 0 -24 0Z" fill="#FFF1EA" />`,
  },
  // Novedades: cohete naranja con ventana cyan y llama ámbar.
  novedades: {
    g: [["naranja", "0.2 0 0.8 1"], ["coral"], ["cyan"], ["amarillo", "0 0 0 1"]],
    svg: (k) => `<path d="M108 178Q128 244 148 178Z" fill="url(#${k}-4)" />`
      + `<path d="M84 138L52 168Q44 184 60 186L100 178Z" fill="url(#${k}-2)" /><path d="M172 138L204 168Q212 184 196 186L156 178Z" fill="url(#${k}-2)" />`
      + shade("M128 22C168 48 186 96 178 152L156 180H100L78 152C70 96 88 48 128 22Z", `${k}-1`)
      + `<path d="M104 102a24 24 0 1 0 48 0a24 24 0 1 0 -48 0Z" fill="#FFFFFF" /><path d="M110 102a18 18 0 1 0 36 0a18 18 0 1 0 -36 0Z" fill="url(#${k}-3)" />`
      + `<path d="M108 162H148V180H108Z" fill="url(#${k}-2)" />`,
  },
  // Preguntas frecuentes: globo de pregunta verde.
  faq: {
    g: [["verde", "0.1 0 0.9 1"], ["menta"]],
    svg: (k) => shade("M128 30C74 30 32 66 32 114C32 142 46 166 70 182L62 218Q60 230 72 225L116 200Q122 200 128 200C182 200 224 164 224 114C224 66 182 30 128 30Z", `${k}-1`)
      + `<path d="M102 96Q102 66 128 66Q154 66 154 92Q154 110 138 118Q128 123 128 136" fill="none" stroke="#FFFFFF" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" />`
      + `<path d="M116 164a12 12 0 1 0 24 0a12 12 0 1 0 -24 0Z" fill="#FFFFFF" />`,
  },
  // Manual: libro abierto azul/cyan con cinta.
  manual: {
    g: [["azul", "0 0 1 1"], ["cyan", "1 0 0 1"], ["morado", "0 0 0 1"]],
    svg: (k) => shade("M128 70Q98 48 44 54Q34 55 34 66V184Q34 194 44 193Q98 188 128 210Z", `${k}-1`)
      + shade("M128 70Q158 48 212 54Q222 55 222 66V184Q222 194 212 193Q158 188 128 210Z", `${k}-2`)
      + `<path d="M128 72V208" stroke="#FFFFFF" stroke-opacity=".7" stroke-width="5" stroke-linecap="round" />`
      + `<path d="M64 96Q92 92 110 102M64 124Q92 120 110 130M146 102Q164 92 192 96M146 130Q164 120 192 124" fill="none" stroke="#FFFFFF" stroke-opacity=".75" stroke-width="7" stroke-linecap="round" />`
      + `<path d="M170 52V106L182 96L194 106V52Q182 48 170 52Z" fill="url(#${k}-3)" />`,
  },
  // Buscar: lupa azul con vidrio claro.
  buscar: {
    g: [["azul"], ["claro"], ["cyan"]],
    svg: (k) => `<path d="M156 160L204 208" stroke="url(#${k}-3)" stroke-width="34" stroke-linecap="round" />`
      + shade("M38 108a70 70 0 1 0 140 0a70 70 0 1 0 -140 0Z", `${k}-1`)
      + `<path d="M62 108a46 46 0 1 0 92 0a46 46 0 1 0 -92 0Z" fill="url(#${k}-2)" />`
      + `<path d="M80 96Q86 74 108 70" fill="none" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round" />`,
  },
  // Seguridad: escudo morado con visto bueno.
  seguridad: {
    g: [["morado", "0.2 0 0.8 1"], ["lavanda"]],
    svg: (k) => shade("M128 26L210 56V120C210 172 176 210 128 230C80 210 46 172 46 120V56Z", `${k}-1`)
      + `<path d="M128 54L184 74V120C184 156 162 182 128 198Z" fill="url(#${k}-2)" opacity=".55" />`
      + `<path d="M92 126L118 150L166 102" fill="none" stroke="#FFFFFF" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" />`,
  },
  // Integraciones: enchufe teal.
  integraciones: {
    g: [["teal", "0.2 0 0.8 1"], ["menta"]],
    svg: (k) => `<path d="M94 32Q94 24 102 24H110Q118 24 118 32V98H94Z" fill="url(#${k}-2)" /><path d="M138 32Q138 24 146 24H154Q162 24 162 32V98H138Z" fill="url(#${k}-2)" />`
      + shade("M70 92H186Q198 92 198 104V134Q198 180 152 188V216Q152 230 138 230H118Q104 230 104 216V188Q58 180 58 134V104Q58 92 70 92Z", `${k}-1`)
      + `<path d="M98 132a12 12 0 1 0 24 0a12 12 0 1 0 -24 0ZM134 132a12 12 0 1 0 24 0a12 12 0 1 0 -24 0Z" fill="#FFFFFF" opacity=".85" />`,
  },
  // Chat del asesor: dos globos (lavanda detrás, azul delante) con tres puntos.
  chat: {
    g: [["morado"], ["azul", "0.1 0 0.9 1"]],
    svg: (k) => shade("M150 34C198 34 230 64 230 104C230 128 218 148 198 160L204 190Q206 198 198 194L164 174Q156 175 150 175C102 175 70 144 70 104C70 64 102 34 150 34Z", `${k}-1`)
      + shade("M104 86C56 86 24 116 24 156C24 180 36 200 56 212L50 240Q48 248 56 244L92 225Q98 226 104 226C152 226 184 196 184 156C184 116 152 86 104 86Z", `${k}-2`)
      + `<path d="M64 156a12 12 0 1 0 24 0a12 12 0 1 0 -24 0ZM92 156a12 12 0 1 0 24 0a12 12 0 1 0 -24 0ZM120 156a12 12 0 1 0 24 0a12 12 0 1 0 -24 0Z" fill="#FFFFFF" />`,
  },
}

let defs = iso.defs
for (const [k, def] of Object.entries(NEW)) {
  const id = `iso-${k}`
  defs = defs.replace(new RegExp(`<linearGradient id="${id}-\\d+"[\\s\\S]*?</linearGradient>`, "g"), "")
  defs += def.g.map(([f, dir], i) => lg(`${id}-${i + 1}`, fam[f], dir)).join("")
  iso.icons[k] = def.svg(id)
}
iso.defs = defs
writeFileSync(FILE, JSON.stringify(iso))
console.log("isotipos:", Object.keys(NEW).join(", "))

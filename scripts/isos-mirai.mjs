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
  // Lista de deseos: corazón rosa con etiqueta de precio amarilla y un destello.
  deseos: {
    g: [["rojo", "0.2 0 0.8 1"], ["amarillo"], ["naranja"]],
    svg: (k) => shade("M128 214C70 176 30 140 30 96C30 64 54 42 84 42C104 42 120 52 128 68C136 52 152 42 172 42C202 42 226 64 226 96C226 140 186 176 128 214Z", `${k}-1`)
      + `<path d="M84 76Q66 80 62 100" fill="none" stroke="#FFFFFF" stroke-opacity=".75" stroke-width="12" stroke-linecap="round" />`
      + `<path d="M150 150L186 114H220Q228 114 228 122V156L192 192Q186 198 180 192L150 162Q144 156 150 150Z" fill="url(#${k}-2)" /><path d="M150 150L186 114H220Q228 114 228 122V156L192 192Q186 198 180 192L150 162Q144 156 150 150Z" fill="url(#iso-sh)" />`
      + `<path d="M204 132a8 8 0 1 0 16 0a8 8 0 1 0 -16 0Z" fill="#FFFFFF" />`
      + `<path d="M206 26l5 13 13 5 -13 5 -5 13 -5 -13 -13 -5 13 -5z" fill="url(#${k}-3)" />`,
  },
  // Calculadoras: calculadora azul con pantalla clara y teclas.
  calculadoras: {
    g: [["azul", "0.2 0 0.8 1"], ["claro"], ["naranja"], ["cyan"]],
    svg: (k) => shade("M72 24H184Q206 24 206 46V210Q206 232 184 232H72Q50 232 50 210V46Q50 24 72 24Z", `${k}-1`)
      + `<path d="M76 50H180Q186 50 186 56V90Q186 96 180 96H76Q70 96 70 90V56Q70 50 76 50Z" fill="url(#${k}-2)" />`
      + `<path d="M134 74H170" stroke="#2349C9" stroke-opacity=".55" stroke-width="10" stroke-linecap="round" />`
      + [0, 1, 2].map((r) => [0, 1, 2].map((c) => `<path d="M${74 + c * 40} ${116 + r * 36}h28a6 6 0 0 1 6 6v16a6 6 0 0 1 -6 6h-28a6 6 0 0 1 -6 -6v-16a6 6 0 0 1 6 -6Z" fill="${c === 2 ? `url(#${k}-3)` : "#FFFFFF"}" ${c === 2 ? "" : 'opacity=".9"'} />`).join("")).join(""),
  },
  // Automatizaciones: tres nodos conectados (disparador, condición, acción) con un rayo.
  automatizaciones: {
    g: [["teal", "0.2 0 0.8 1"], ["morado", "0.2 0 0.8 1"], ["naranja", "0.2 0 0.8 1"], ["amarillo"]],
    svg: (k) => `<path d="M80 84V128Q80 140 92 140H164Q176 140 176 152V178" fill="none" stroke="#2C3A66" stroke-opacity=".35" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />`
      + `<path d="M80 140V178" fill="none" stroke="#2C3A66" stroke-opacity=".35" stroke-width="12" stroke-linecap="round" />`
      + shade("M52 28H108Q124 28 124 44V84Q124 100 108 100H52Q36 100 36 84V44Q36 28 52 28Z", `${k}-1`)
      + shade("M52 160H108Q124 160 124 176V212Q124 228 108 228H52Q36 228 36 212V176Q36 160 52 160Z", `${k}-2`)
      + shade("M148 160H204Q220 160 220 176V212Q220 228 204 228H148Q132 228 132 212V176Q132 160 148 160Z", `${k}-3`)
      + `<path d="M86 40L66 68H82L74 90L98 58H82L90 40Z" fill="url(#${k}-4)" />`
      + `<path d="M62 194L74 206L98 182" fill="none" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" />`
      + `<path d="M158 194H194M176 176V212" stroke="#FFFFFF" stroke-width="10" stroke-linecap="round" />`
      + `<path d="M168 30l6 16 16 6 -16 6 -6 16 -6 -16 -16 -6 16 -6z" fill="url(#${k}-4)" />`,
  },
  // Academia: birrete morado con borla amarilla.
  academia: {
    g: [["morado", "0.2 0 0.8 1"], ["lavanda"], ["amarillo", "0 0 0 1"]],
    svg: (k) => shade("M74 120V166Q74 196 128 196Q182 196 182 166V120L128 146Z", `${k}-2`)
      + shade("M128 50L232 98L128 146L24 98Z", `${k}-1`)
      + `<path d="M128 50L232 98L128 146L24 98Z" fill="#FFFFFF" opacity=".08" />`
      + `<path d="M128 98L204 116V176" fill="none" stroke="url(#${k}-3)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" />`
      + `<path d="M192 172H216L222 212Q222 220 214 220H194Q186 220 186 212Z" fill="url(#${k}-3)" />`
      + `<path d="M116 98a12 8 0 1 0 24 0a12 8 0 1 0 -24 0Z" fill="url(#${k}-3)" />`,
  },
  // Tu opinión: globo coral con un corazón y estrellas de calificación.
  opiniones: {
    g: [["coral", "0.1 0 0.9 1"], ["amarillo"]],
    svg: (k) => shade("M128 26C74 26 32 60 32 106C32 132 46 154 68 168L60 206Q58 218 70 213L112 188Q120 188 128 188C182 188 224 152 224 106C224 60 182 26 128 26Z", `${k}-1`)
      + `<path d="M128 146C102 128 84 112 84 92C84 78 94 68 107 68C116 68 124 73 128 81C132 73 140 68 149 68C162 68 172 78 172 92C172 112 154 128 128 146Z" fill="#FFFFFF" />`
      + [0, 1, 2].map((i) => `<path transform="translate(${150 + i * 30} 210) scale(.9)" d="M0 -14L4 -4L15 -4L6 3L9 14L0 7L-9 14L-6 3L-15 -4L-4 -4Z" fill="url(#${k}-2)" />`).join(""),
  },
  // Invita y gana: regalo verde con moño rojo.
  referidos: {
    g: [["verde", "0.2 0 0.8 1"], ["menta"], ["rojo", "0.2 0 0.8 1"]],
    svg: (k) => shade("M48 120H208V212Q208 228 192 228H64Q48 228 48 212Z", `${k}-1`)
      + shade("M36 88Q36 76 48 76H208Q220 76 220 88V114Q220 124 208 124H48Q36 124 36 114Z", `${k}-2`)
      + `<path d="M112 76H144V228H112Z" fill="url(#${k}-3)" /><path d="M112 76H144V228H112Z" fill="url(#iso-sh)" />`
      + `<path d="M128 76C112 46 76 34 70 54C64 74 100 80 128 76Z" fill="url(#${k}-3)" /><path d="M128 76C144 46 180 34 186 54C192 74 156 80 128 76Z" fill="url(#${k}-3)" />`
      + `<path d="M84 56Q92 64 116 72" fill="none" stroke="#FFFFFF" stroke-opacity=".5" stroke-width="6" stroke-linecap="round" />`,
  },
  // Centro de ayuda: salvavidas rojo y blanco.
  ayuda: {
    g: [["rojo", "0.2 0 0.8 1"], ["claro"]],
    svg: (k) => shade("M128 24a104 104 0 1 0 0.01 0Z", `${k}-2`)
      + `<path d="M128 24A104 104 0 0 1 201.5 54.5L169 87A58 58 0 0 0 128 70Z" fill="url(#${k}-1)" /><path d="M232 128A104 104 0 0 1 201.5 201.5L169 169A58 58 0 0 0 186 128Z" fill="url(#${k}-1)" />`
      + `<path d="M128 232A104 104 0 0 1 54.5 201.5L87 169A58 58 0 0 0 128 186Z" fill="url(#${k}-1)" /><path d="M24 128A104 104 0 0 1 54.5 54.5L87 87A58 58 0 0 0 70 128Z" fill="url(#${k}-1)" />`
      + `<path d="M128 24a104 104 0 1 0 0.01 0Z" fill="url(#iso-hl)" /><path d="M128 24a104 104 0 1 0 0.01 0Z" fill="url(#iso-sh)" />`
      + `<path d="M128 70a58 58 0 1 0 0.01 0Z" fill="#FFFFFF" /><path d="M128 84a44 44 0 1 0 0.01 0Z" fill="#E4ECFA" />`,
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

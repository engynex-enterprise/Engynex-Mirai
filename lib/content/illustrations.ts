// Ilustraciones vectoriales de Mirai (estados vacíos, "no se encontró", introducción, errores) con el mismo lenguaje
// que los isotipos: formas fluidas, degradados de una familia, volumen interno sutil; sin glow, fondos ni contenedores.
// viewBox 0 0 320 240. Los ids de degradado llevan el prefijo "il-<clave>-" para no chocar entre ilustraciones.

const g = (id: string, stops: [number, string][], d = "0 0 1 1") => {
  const [x1, y1, x2, y2] = d.split(" ")
  return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient>`
}
const F = {
  naranja: [[0, "#FFE3A0"], [0.55, "#FFB547"], [1, "#E98A12"]] as [number, string][],
  coral: [[0, "#FFC9A8"], [0.55, "#FF8A5B"], [1, "#E5572F"]] as [number, string][],
  amarillo: [[0, "#FFF0B3"], [0.55, "#FFD15C"], [1, "#E8A814"]] as [number, string][],
  verde: [[0, "#A8F0C6"], [0.55, "#2FBF71"], [1, "#137447"]] as [number, string][],
  lima: [[0, "#E2F8C2"], [0.55, "#9EDB4E"], [1, "#3F9A1E"]] as [number, string][],
  azul: [[0, "#86D4FF"], [0.55, "#3D8BFF"], [1, "#2349C9"]] as [number, string][],
  cyan: [[0, "#A8F0FF"], [0.55, "#2CC7EA"], [1, "#117FA8"]] as [number, string][],
  claro: [[0, "#FFFFFF"], [1, "#E4ECFA"]] as [number, string][],
  rojo: [[0, "#FFB3C1"], [0.55, "#F0506E"], [1, "#C2264B"]] as [number, string][],
  teal: [[0, "#A6F2EA"], [0.55, "#22BFAE"], [1, "#0E7C74"]] as [number, string][],
  morado: [[0, "#DCC4FF"], [0.55, "#9361F5"], [1, "#5A2BC2"]] as [number, string][],
}
const HL = (id: string) => g(id, [[0, "rgba(255,255,255,.42)"], [0.45, "rgba(255,255,255,0)"]], "0 0 0 1")
const SH = (id: string) => g(id, [[0.55, "rgba(10,16,48,0)"], [1, "rgba(10,16,48,.16)"]], "0 0 0 1")
/** Forma con luz y sombra interna (mismo tratamiento que los isotipos). */
const vol = (d: string, fill: string, k: string) => `<path d="${d}" fill="url(#${fill})"/><path d="${d}" fill="url(#il-${k}-hl)"/><path d="${d}" fill="url(#il-${k}-sh)"/>`
const star = (x: number, y: number, r: number, fill: string) => `<path d="M${x} ${y - r}Q${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y}Q${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r}Q${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y}Q${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z" fill="url(#${fill})"/>`
const defs = (k: string, list: [string, [number, string][], string?][]) => `<defs>${HL(`il-${k}-hl`)}${SH(`il-${k}-sh`)}${list.map(([n, s, d]) => g(`il-${k}-${n}`, s, d)).join("")}</defs>`

export const ILLUSTRATIONS: Record<string, string> = {
  // Caja abierta de la que brota una planta: "aún no hay nada aquí"
  vacio: defs("vacio", [["caja", F.naranja, "0.2 0 0.8 1"], ["tapa", F.amarillo], ["hoja", F.lima], ["tallo", F.verde, "0 0 0 1"], ["chispa", F.amarillo]])
    + `<path d="M160 116C160 92 168 72 184 60" fill="none" stroke="url(#il-vacio-tallo)" stroke-width="8" stroke-linecap="round"/>`
    + vol("M184 60C204 40 236 40 248 50C240 74 214 84 186 70Z", "il-vacio-hoja", "vacio")
    + vol("M160 92C140 66 108 62 92 72C100 98 128 108 158 98Z", "il-vacio-hoja", "vacio")
    + vol("M96 120H224L214 206Q212 216 202 216H118Q108 216 106 206Z", "il-vacio-caja", "vacio")
    + vol("M96 120L60 96Q54 92 62 90L118 84L150 120Z", "il-vacio-tapa", "vacio")
    + vol("M224 120L260 96Q266 92 258 90L202 84L170 120Z", "il-vacio-tapa", "vacio")
    + `<path d="M126 160H194" stroke="#FFFFFF" stroke-opacity=".6" stroke-width="8" stroke-linecap="round"/>`
    + star(64, 150, 12, "il-vacio-chispa") + star(256, 152, 9, "il-vacio-chispa"),

  // Hoja con lupa: "no encontramos lo que buscas"
  "sin-resultados": defs("sinres", [["hoja", F.claro], ["linea", F.azul, "0 0 1 0"], ["lupa", F.azul], ["vidrio", F.cyan], ["mango", F.morado]])
    + vol("M92 34H186L230 78V200Q230 212 218 212H92Q80 212 80 200V46Q80 34 92 34Z", "il-sinres-hoja", "sinres")
    + `<path d="M186 34V66Q186 78 198 78H230Z" fill="#D6E2F7"/>`
    + `<path d="M104 104H178M104 128H200M104 152H160" stroke="url(#il-sinres-linea)" stroke-opacity=".55" stroke-width="9" stroke-linecap="round"/>`
    + `<path d="M222 182L262 222" stroke="url(#il-sinres-mango)" stroke-width="22" stroke-linecap="round"/>`
    + vol("M154 148a48 48 0 1 0 96 0a48 48 0 1 0 -96 0Z", "il-sinres-lupa", "sinres")
    + `<path d="M170 148a32 32 0 1 0 64 0a32 32 0 1 0 -64 0Z" fill="url(#il-sinres-vidrio)" opacity=".85"/>`
    + `<path d="M184 138Q188 124 202 122" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round"/>`,

  // Visto bueno con hojas y chispas: "todo al día"
  "todo-al-dia": defs("ok", [["circulo", F.verde, "0.2 0 0.8 1"], ["hoja", F.lima], ["chispa", F.amarillo]])
    + vol("M96 182C70 186 52 170 50 150C72 146 92 160 96 182Z", "il-ok-hoja", "ok")
    + vol("M224 182C250 186 268 170 270 150C248 146 228 160 224 182Z", "il-ok-hoja", "ok")
    + vol("M90 122a70 70 0 1 0 140 0a70 70 0 1 0 -140 0Z", "il-ok-circulo", "ok")
    + `<path d="M126 124L150 148L196 100" fill="none" stroke="#FFFFFF" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>`
    + star(70, 70, 13, "il-ok-chispa") + star(252, 60, 10, "il-ok-chispa") + star(262, 104, 7, "il-ok-chispa"),

  // Monedas con un brote que crece: bienvenida / introducción ("tu futuro crece")
  bienvenida: defs("bien", [["moneda", F.amarillo, "0 0 0 1"], ["canto", F.naranja, "0 0 0 1"], ["hoja", F.lima], ["hoja2", F.verde], ["tallo", F.verde, "0 0 0 1"], ["sol", F.coral]])
    + vol("M222 66a26 26 0 1 0 52 0a26 26 0 1 0 -52 0Z", "il-bien-sol", "bien")
    + `<path d="M120 196V200Q120 212 160 212Q200 212 200 200V196Z" fill="url(#il-bien-canto)"/>`
    + vol("M120 196a40 14 0 1 0 80 0a40 14 0 1 0 -80 0Z", "il-bien-moneda", "bien")
    + `<path d="M124 172V178Q124 190 160 190Q196 190 196 178V172Z" fill="url(#il-bien-canto)"/>`
    + vol("M124 172a36 13 0 1 0 72 0a36 13 0 1 0 -72 0Z", "il-bien-moneda", "bien")
    + `<path d="M160 168C160 132 166 104 180 84" fill="none" stroke="url(#il-bien-tallo)" stroke-width="8" stroke-linecap="round"/>`
    + vol("M178 88C190 60 224 50 240 58C234 86 206 98 180 92Z", "il-bien-hoja", "bien")
    + vol("M162 126C146 98 112 90 96 98C102 126 132 138 160 132Z", "il-bien-hoja2", "bien"),

  // Mapa con un pin y una pregunta: "página no encontrada"
  "no-encontrado": defs("ne", [["mapa", F.cyan, "0 0 1 1"], ["mapa2", F.azul, "0 0 1 1"], ["pin", F.rojo, "0.2 0 0.8 1"], ["globo", F.morado]])
    + vol("M48 92L112 68L176 92L240 68V184L176 208L112 184L48 208Z", "il-ne-mapa", "ne")
    + `<path d="M112 68V184L176 208V92Z" fill="url(#il-ne-mapa2)" opacity=".55"/>`
    + `<path d="M68 150Q100 128 130 150T196 142" fill="none" stroke="#FFFFFF" stroke-opacity=".7" stroke-width="7" stroke-linecap="round" stroke-dasharray="2 14"/>`
    + vol("M196 52C176 52 162 66 162 84C162 108 196 140 196 140C196 140 230 108 230 84C230 66 216 52 196 52Z", "il-ne-pin", "ne")
    + `<path d="M184 84a12 12 0 1 0 24 0a12 12 0 1 0 -24 0Z" fill="#FFFFFF"/>`
    + vol("M246 30C268 30 284 44 284 62C284 80 268 94 246 94Q240 94 236 93L220 102L222 88Q208 78 208 62C208 44 224 30 246 30Z", "il-ne-globo", "ne")
    + `<path d="M236 54Q236 44 246 44Q256 44 256 53Q256 60 249 63Q246 65 246 70" fill="none" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round"/><path d="M242 80a4 4 0 1 0 8 0a4 4 0 1 0 -8 0Z" fill="#FFFFFF"/>`,

  // Triángulo de aviso: "algo salió mal"
  error: defs("err", [["tri", F.coral, "0.2 0 0.8 1"], ["chispa", F.amarillo]])
    + vol("M146 46Q160 22 174 46L262 196Q276 220 248 220H72Q44 220 58 196Z", "il-err-tri", "err")
    + `<path d="M160 92V150" stroke="#FFFFFF" stroke-width="20" stroke-linecap="round"/><path d="M148 184a12 12 0 1 0 24 0a12 12 0 1 0 -24 0Z" fill="#FFFFFF"/>`
    + star(58, 82, 11, "il-err-chispa") + star(270, 96, 8, "il-err-chispa"),

  // Nube con un enchufe suelto: "sin conexión"
  "sin-conexion": defs("off", [["nube", F.cyan, "0 0 0 1"], ["nube2", F.azul, "0 0 0 1"], ["enchufe", F.teal]])
    + vol("M96 150C70 150 54 132 54 112C54 92 70 76 92 76Q100 44 136 40Q168 38 182 64Q196 56 212 60Q240 66 244 96Q270 102 270 126Q270 150 242 150Z", "il-off-nube", "off")
    + `<path d="M96 150H242Q256 150 264 140" fill="none" stroke="url(#il-off-nube2)" stroke-opacity=".35" stroke-width="6" stroke-linecap="round"/>`
    + `<path d="M118 216Q118 186 148 178" fill="none" stroke="#7B8794" stroke-width="7" stroke-linecap="round"/><path d="M202 216Q202 190 178 182" fill="none" stroke="#7B8794" stroke-width="7" stroke-linecap="round"/>`
    + vol("M138 168H156V198H138Q130 198 130 190V176Q130 168 138 168Z", "il-off-enchufe", "off")
    + vol("M168 172H184Q192 172 192 180V194Q192 202 184 202H168Z", "il-off-enchufe", "off")
    + `<path d="M156 176H164M156 190H164" stroke="#0E7C74" stroke-width="5" stroke-linecap="round"/>`,

  // Campana tranquila con visto: "sin avisos"
  "sin-avisos": defs("calma", [["campana", F.morado, "0.2 0 0.8 1"], ["badge", F.verde], ["chispa", F.amarillo]])
    + `<path d="M144 200a16 16 0 1 0 32 0a16 16 0 1 0 -32 0Z" fill="url(#il-calma-campana)"/>`
    + vol("M160 48C126 48 110 76 110 108V142L96 164Q92 176 104 176H216Q228 176 224 164L210 142V108C210 76 194 48 160 48Z", "il-calma-campana", "calma")
    + vol("M196 78a26 26 0 1 0 52 0a26 26 0 1 0 -52 0Z", "il-calma-badge", "calma")
    + `<path d="M210 78L219 87L234 70" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`
    + star(84, 84, 10, "il-calma-chispa") + star(250, 140, 8, "il-calma-chispa"),
}

export type IllustrationKey = keyof typeof ILLUSTRATIONS

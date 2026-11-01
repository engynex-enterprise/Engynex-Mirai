// Banner de cada módulo: tema de color (familias de los isotipos) y escena ilustrada relacionada con la sección.

export type BannerTheme = { a: string; b: string; c: string; bg: string; dark: string }
export type BannerMotif =
  | "dashboard" | "coins" | "receipt" | "card" | "people" | "up" | "down" | "pie" | "calendar"
  | "doc" | "trophy" | "chat" | "toggles" | "mail" | "checklist"

const g = (a: string, b: string, c: string) => `linear-gradient(115deg, ${a} 0%, ${b} 52%, ${c} 100%)`

/** a = tono fuerte, b = medio, c = suave; bg / dark = fondo del banner en modo claro / oscuro. */
export const BANNER_THEMES = {
  verde: { a: "#2A7F14", b: "#7BCB3E", c: "#D4F3BE", bg: g("#EAF8DF", "#DDF5E6", "#D3F0EE"), dark: g("#1D3317", "#173328", "#14302F") },
  menta: { a: "#128A6A", b: "#3FD0A0", c: "#CDF6E7", bg: g("#E2F8EF", "#D8F3F1", "#DDEEFB"), dark: g("#142F28", "#14302F", "#172A38") },
  naranja: { a: "#D9700F", b: "#FFB547", c: "#FFE3BC", bg: g("#FFF1DE", "#FFE9E0", "#FCE4EC"), dark: g("#3A2A16", "#3A2219", "#36202A") },
  amarillo: { a: "#B98100", b: "#FFC83D", c: "#FFEFB0", bg: g("#FFF6D6", "#FFF0DD", "#FDEBDF"), dark: g("#3A3214", "#3A2B16", "#3A2419") },
  rosa: { a: "#C2264B", b: "#F0506E", c: "#FFD3DD", bg: g("#FDE7EC", "#F8E4F2", "#ECE6FB"), dark: g("#3A1C24", "#331C2E", "#272238") },
  morado: { a: "#5A2BC2", b: "#9361F5", c: "#E2D4FF", bg: g("#EEE6FF", "#E6E8FD", "#DEEFFC"), dark: g("#291F42", "#222445", "#1A2A40") },
  lavanda: { a: "#6F55D6", b: "#B49CFF", c: "#ECE2FF", bg: g("#F2ECFF", "#F7E8F6", "#FCEDEA"), dark: g("#2A2440", "#30223A", "#352430") },
  azul: { a: "#2349C9", b: "#3D8BFF", c: "#D3E5FF", bg: g("#E2EDFF", "#E3F2FE", "#DDF6F6"), dark: g("#18264A", "#152E48", "#123640") },
  cyan: { a: "#117FA8", b: "#2CC7EA", c: "#CAF2FB", bg: g("#DDF5FC", "#E0F1FD", "#E7EBFC"), dark: g("#123445", "#15304A", "#1C2A48") },
  teal: { a: "#0E7C74", b: "#22BFAE", c: "#CCF4EF", bg: g("#DCF6F2", "#E0F5EA", "#EEF7DC"), dark: g("#11332F", "#143428", "#22341A") },
  navy: { a: "#1F2B4B", b: "#4A67A8", c: "#DAE1F2", bg: g("#E6EAF4", "#E9ECF6", "#EEEAF6"), dark: g("#1B2235", "#1D2338", "#22223A") },
} satisfies Record<string, BannerTheme>

export type BannerThemeKey = keyof typeof BANNER_THEMES

/** Módulo → tema y escena. Los que no estén aquí usan el banner verde con el tablero. */
export const BANNERS: Record<string, { t: BannerThemeKey; m: BannerMotif }> = {
  inicio: { t: "verde", m: "dashboard" },
  puesta: { t: "naranja", m: "checklist" },
  consejero: { t: "morado", m: "chat" },
  balance: { t: "verde", m: "coins" },
  ingresos: { t: "menta", m: "coins" },
  gastos: { t: "rosa", m: "receipt" },
  fijos: { t: "naranja", m: "receipt" },
  tarjetas: { t: "azul", m: "card" },
  suscripciones: { t: "morado", m: "receipt" },
  correo: { t: "cyan", m: "mail" },
  importar: { t: "azul", m: "doc" },
  "me-deben": { t: "naranja", m: "people" },
  "le-debo": { t: "rosa", m: "people" },
  contactos: { t: "azul", m: "people" },
  estrategia: { t: "teal", m: "down" },
  presupuesto: { t: "morado", m: "pie" },
  flujo: { t: "cyan", m: "up" },
  metas: { t: "verde", m: "coins" },
  retos: { t: "naranja", m: "trophy" },
  logros: { t: "amarillo", m: "trophy" },
  primas: { t: "menta", m: "coins" },
  familia: { t: "azul", m: "people" },
  mesadas: { t: "rosa", m: "coins" },
  compartidos: { t: "lavanda", m: "people" },
  inversiones: { t: "teal", m: "up" },
  renta: { t: "azul", m: "doc" },
  calendario: { t: "cyan", m: "calendar" },
  contador: { t: "navy", m: "doc" },
  recordatorios: { t: "naranja", m: "calendar" },
  indicadores: { t: "verde", m: "up" },
  reportes: { t: "morado", m: "up" },
  novedades: { t: "naranja", m: "checklist" },
  faq: { t: "verde", m: "chat" },
  manual: { t: "azul", m: "doc" },
  opiniones: { t: "amarillo", m: "chat" },
  planes: { t: "amarillo", m: "trophy" },
  deseos: { t: "rosa", m: "checklist" },
  calculadoras: { t: "azul", m: "pie" },
  academia: { t: "verde", m: "doc" },
  referidos: { t: "amarillo", m: "people" },
  admin: { t: "navy", m: "dashboard" },
  perfil: { t: "lavanda", m: "toggles" },
  ajustes: { t: "azul", m: "toggles" },
}

export const bannerFor = (id: string) => {
  const b = BANNERS[id] ?? { t: "verde" as const, m: "dashboard" as const }
  return { theme: BANNER_THEMES[b.t], motif: b.m }
}

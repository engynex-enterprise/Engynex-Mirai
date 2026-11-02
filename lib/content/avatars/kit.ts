// Piezas comunes de los avatares de Mirai (estilo perfiles de Netflix). viewBox 0 0 120 120.
// Reglas: SVG dibujado a mano, sin imágenes externas, sin logos ni personajes con derechos de autor.
// Los ids internos (degradados, recortes) empiezan siempre por "av-<clave>" para que no choquen entre avatares.

export const INK = "#1C2B33"
const BLUSH = "#FF7E9A"

/** Redondea a 2 decimales para que el SVG quede corto. */
const r2 = (n: number) => Math.round(n * 100) / 100

/** Carita: ojos, mejillas y sonrisa centrados en (x, y); s escala. */
export const face = (x: number, y: number, s = 1) =>
  `<circle cx="${x - 8 * s}" cy="${y}" r="${3.4 * s}" fill="${INK}"/><circle cx="${x + 8 * s}" cy="${y}" r="${3.4 * s}" fill="${INK}"/>` +
  `<circle cx="${x - 7 * s}" cy="${y - 1.2 * s}" r="${1.1 * s}" fill="#fff"/><circle cx="${x + 9 * s}" cy="${y - 1.2 * s}" r="${1.1 * s}" fill="#fff"/>` +
  `<circle cx="${x - 14 * s}" cy="${y + 6 * s}" r="${3.6 * s}" fill="${BLUSH}" opacity=".55"/><circle cx="${x + 14 * s}" cy="${y + 6 * s}" r="${3.6 * s}" fill="${BLUSH}" opacity=".55"/>` +
  `<path d="M${x - 6 * s} ${y + 6 * s}Q${x} ${y + 12 * s} ${x + 6 * s} ${y + 6 * s}" fill="none" stroke="${INK}" stroke-width="${2.8 * s}" stroke-linecap="round"/>`

/** Solo los ojos (con brillo), separados `gap` desde el centro. */
export const eyes = (x: number, y: number, s = 1, gap = 8) =>
  `<circle cx="${r2(x - gap)}" cy="${y}" r="${r2(3.4 * s)}" fill="${INK}"/><circle cx="${r2(x + gap)}" cy="${y}" r="${r2(3.4 * s)}" fill="${INK}"/>` +
  `<circle cx="${r2(x - gap + s)}" cy="${r2(y - 1.2 * s)}" r="${r2(1.1 * s)}" fill="#fff"/><circle cx="${r2(x + gap + s)}" cy="${r2(y - 1.2 * s)}" r="${r2(1.1 * s)}" fill="#fff"/>`

/** Ojos cerrados (contentos o dormidos). */
export const closedEyes = (x: number, y: number, s = 1, gap = 8, color = INK) =>
  `<path d="M${r2(x - gap - 4 * s)} ${y}Q${r2(x - gap)} ${r2(y + 4 * s)} ${r2(x - gap + 4 * s)} ${y}M${r2(x + gap - 4 * s)} ${y}Q${r2(x + gap)} ${r2(y + 4 * s)} ${r2(x + gap + 4 * s)} ${y}" fill="none" stroke="${color}" stroke-width="${r2(2.6 * s)}" stroke-linecap="round"/>`

/** Mejillas rosadas. */
export const cheeks = (x: number, y: number, s = 1, gap = 14) =>
  `<circle cx="${r2(x - gap)}" cy="${y}" r="${r2(3.6 * s)}" fill="${BLUSH}" opacity=".55"/><circle cx="${r2(x + gap)}" cy="${y}" r="${r2(3.6 * s)}" fill="${BLUSH}" opacity=".55"/>`

/** Sonrisa. */
export const smile = (x: number, y: number, s = 1, color = INK) =>
  `<path d="M${r2(x - 6 * s)} ${y}Q${x} ${r2(y + 6 * s)} ${r2(x + 6 * s)} ${y}" fill="none" stroke="${color}" stroke-width="${r2(2.8 * s)}" stroke-linecap="round"/>`

/** Fondo degradado con dos círculos de luz. */
export const bg = (k: string, a: string, b: string) =>
  `<defs><linearGradient id="av-${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>` +
  `<rect width="120" height="120" fill="url(#av-${k})"/><circle cx="96" cy="22" r="30" fill="#fff" opacity=".12"/><circle cx="14" cy="110" r="26" fill="#fff" opacity=".1"/>`

/** Moneda dorada. */
export const coin = (x: number, y: number, r: number) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#FFC83D"/><circle cx="${x}" cy="${y}" r="${r * 0.66}" fill="none" stroke="#FFF1BF" stroke-width="${r * 0.22}"/>`

/** Destello de 4 puntas. */
export const sparkle = (x: number, y: number, s = 1, fill = "#fff") =>
  `<path d="M${x} ${r2(y - 9 * s)}L${r2(x + 2.6 * s)} ${r2(y - 2.6 * s)}L${r2(x + 9 * s)} ${y}L${r2(x + 2.6 * s)} ${r2(y + 2.6 * s)}L${x} ${r2(y + 9 * s)}L${r2(x - 2.6 * s)} ${r2(y + 2.6 * s)}L${r2(x - 9 * s)} ${y}L${r2(x - 2.6 * s)} ${r2(y - 2.6 * s)}Z" fill="${fill}"/>`

/** Puntos de una estrella de n puntas (radio externo R, interno r). */
export const starPts = (cx: number, cy: number, R: number, r: number, n = 5) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const a = (Math.PI / n) * i - Math.PI / 2
    const d = i % 2 ? r : R
    return `${r2(cx + d * Math.cos(a))},${r2(cy + d * Math.sin(a))}`
  }).join(" ")

/** Puntos de un polígono regular. */
export const polyPts = (cx: number, cy: number, r: number, n: number, rot = -Math.PI / 2) =>
  Array.from({ length: n }, (_, i) => {
    const a = rot + ((Math.PI * 2) / n) * i
    return `${r2(cx + r * Math.cos(a))},${r2(cy + r * Math.sin(a))}`
  }).join(" ")

/** Corazón centrado en (x, y). */
export const heart = (x: number, y: number, s = 1, fill = "#FF4D6D") =>
  `<path d="M${x} ${r2(y + 7 * s)}C${r2(x - 13 * s)} ${r2(y - 1 * s)} ${r2(x - 7 * s)} ${r2(y - 12 * s)} ${x} ${r2(y - 5 * s)}C${r2(x + 7 * s)} ${r2(y - 12 * s)} ${r2(x + 13 * s)} ${r2(y - 1 * s)} ${x} ${r2(y + 7 * s)}Z" fill="${fill}"/>`

/** Dibujo de píxeles: cada letra de `rows` es un color de `colors` ("." = vacío). */
export const pixels = (rows: string[], cell: number, ox: number, oy: number, colors: Record<string, string>) =>
  rows.flatMap((row, y) =>
    [...row].map((ch, x) => (colors[ch] ? `<rect x="${ox + x * cell}" y="${oy + y * cell}" width="${cell}" height="${cell}" fill="${colors[ch]}"/>` : "")),
  ).join("")

/** Olas de agua en la parte de abajo. */
export const waves = (y: number, fill = "#8FD3FF", opacity = 0.85) =>
  `<path d="M0 ${y}Q15 ${y - 6} 30 ${y}T60 ${y}T90 ${y}T120 ${y}V120H0Z" fill="${fill}" opacity="${opacity}"/>`

export const AVATAR_CATS = [
  { id: "financiero", label: "Financiero" },
  { id: "infantil", label: "Infantil" },
  { id: "animales", label: "Animales" },
  { id: "personas", label: "Personas" },
  { id: "caritas", label: "Caritas" },
  { id: "abstracto", label: "Abstracto" },
  { id: "comida", label: "Comida y café" },
  { id: "naturaleza", label: "Naturaleza" },
  { id: "deportes", label: "Deportes" },
  { id: "viajes", label: "Viajes" },
  { id: "hogar", label: "Hogar" },
  { id: "gamer", label: "Gamer" },
] as const

export type AvatarCat = (typeof AVATAR_CATS)[number]["id"]
/** k = clave (se guarda como "mirai:<k>", nunca cambiarla), n = nombre en español, c = categoría. */
export type AvatarDef = { k: string; n: string; c: AvatarCat; svg: string }

/** Asigna la categoría a una lista de avatares. */
export const inCat = (c: AvatarCat, list: Omit<AvatarDef, "c">[]): AvatarDef[] => list.map((a) => ({ ...a, c }))

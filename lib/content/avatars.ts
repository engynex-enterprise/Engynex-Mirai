// Avatares de Mirai (estilo perfiles de Netflix): un personaje amable de finanzas sobre un fondo de color.
// viewBox 0 0 120 120. En profiles.avatar_url y family_members.avatar se guardan como "mirai:<clave>".

const INK = "#1C2B33"
/** Carita: ojos, mejillas y sonrisa centrados en (x, y); s escala. */
const face = (x: number, y: number, s = 1) =>
  `<circle cx="${x - 8 * s}" cy="${y}" r="${3.4 * s}" fill="${INK}"/><circle cx="${x + 8 * s}" cy="${y}" r="${3.4 * s}" fill="${INK}"/>` +
  `<circle cx="${x - 7 * s}" cy="${y - 1.2 * s}" r="${1.1 * s}" fill="#fff"/><circle cx="${x + 9 * s}" cy="${y - 1.2 * s}" r="${1.1 * s}" fill="#fff"/>` +
  `<circle cx="${x - 14 * s}" cy="${y + 6 * s}" r="${3.6 * s}" fill="#FF7E9A" opacity=".55"/><circle cx="${x + 14 * s}" cy="${y + 6 * s}" r="${3.6 * s}" fill="#FF7E9A" opacity=".55"/>` +
  `<path d="M${x - 6 * s} ${y + 6 * s}Q${x} ${y + 12 * s} ${x + 6 * s} ${y + 6 * s}" fill="none" stroke="${INK}" stroke-width="${2.8 * s}" stroke-linecap="round"/>`
const bg = (k: string, a: string, b: string) =>
  `<defs><linearGradient id="av-${k}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>` +
  `<rect width="120" height="120" fill="url(#av-${k})"/><circle cx="96" cy="22" r="30" fill="#fff" opacity=".12"/><circle cx="14" cy="110" r="26" fill="#fff" opacity=".1"/>`
const coin = (x: number, y: number, r: number) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#FFC83D"/><circle cx="${x}" cy="${y}" r="${r * 0.66}" fill="none" stroke="#FFF1BF" stroke-width="${r * 0.22}"/>`

export type AvatarDef = { k: string; n: string; svg: string }

export const AVATARS: AvatarDef[] = [
  {
    k: "alcancia", n: "Alcancía",
    svg: bg("alcancia", "#FFB3C1", "#E23E64") + coin(60, 18, 9) +
      `<path d="M30 52L36 34L48 46Z" fill="#FFB8C8"/><path d="M78 46L88 32L92 50Z" fill="#FFB8C8"/>` +
      `<ellipse cx="62" cy="72" rx="40" ry="32" fill="#FFD6E0"/><rect x="52" y="40" width="20" height="5" rx="2.5" fill="#E86F8C"/>` +
      `<rect x="38" y="96" width="10" height="14" rx="4" fill="#FFB8C8"/><rect x="72" y="96" width="10" height="14" rx="4" fill="#FFB8C8"/>` +
      `<ellipse cx="96" cy="76" rx="11" ry="9" fill="#FF9CB4"/><circle cx="93" cy="76" r="2" fill="#C94767"/><circle cx="99" cy="76" r="2" fill="#C94767"/>` +
      face(64, 66, 0.9),
  },
  {
    k: "moneda", n: "Moneda",
    svg: bg("moneda", "#FFE9A6", "#F29B1D") +
      `<circle cx="60" cy="64" r="40" fill="#E8A814"/><circle cx="60" cy="60" r="40" fill="#FFD15C"/><circle cx="60" cy="60" r="31" fill="none" stroke="#FFEFB0" stroke-width="5"/>` +
      `<path d="M38 36Q48 26 62 26" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".7"/>` + face(60, 58),
  },
  {
    k: "billete", n: "Billete",
    svg: bg("billete", "#B6F2CF", "#1E9E5C") +
      `<rect x="14" y="34" width="92" height="56" rx="10" fill="#E3FAEC" transform="rotate(-6 60 62)"/>` +
      `<rect x="20" y="40" width="80" height="44" rx="7" fill="none" stroke="#7FD6A3" stroke-width="3" transform="rotate(-6 60 62)"/>` +
      `<circle cx="27" cy="52" r="5" fill="#7FD6A3"/><circle cx="94" cy="72" r="5" fill="#7FD6A3"/>` + face(60, 58),
  },
  {
    k: "cohete", n: "Cohete",
    svg: bg("cohete", "#D2BBFF", "#5A2BC2") +
      `<path d="M50 92Q60 118 70 92Z" fill="#FFB547"/><path d="M54 92Q60 108 66 92Z" fill="#FFE38A"/>` +
      `<path d="M42 70L26 86Q24 94 32 92L46 88Z" fill="#FF7A8E"/><path d="M78 70L94 86Q96 94 88 92L74 88Z" fill="#FF7A8E"/>` +
      `<path d="M60 12C80 26 86 52 80 82L74 94H46L40 82C34 52 40 26 60 12Z" fill="#F7F5FF"/>` +
      `<circle cx="60" cy="52" r="17" fill="#8FE3FF"/><circle cx="60" cy="52" r="17" fill="none" stroke="#C9B8FF" stroke-width="4"/>` + face(60, 50, 0.62),
  },
  {
    k: "planta", n: "Planta de plata",
    svg: bg("planta", "#C9F5E4", "#14967A") +
      `<path d="M60 64C60 48 60 40 60 30" stroke="#2E9E4F" stroke-width="5" fill="none" stroke-linecap="round"/>` +
      `<path d="M60 44C44 44 34 34 34 22C48 22 60 30 60 44Z" fill="#5CD08A"/><path d="M60 38C76 38 88 28 88 16C72 16 60 24 60 38Z" fill="#46C27A"/>` +
      coin(86, 40, 8) + coin(30, 50, 6) +
      `<path d="M30 62H90L84 104Q83 110 76 110H44Q37 110 36 104Z" fill="#F08A5D"/><rect x="26" y="58" width="68" height="12" rx="6" fill="#E5703F"/>` +
      face(60, 84, 0.85),
  },
  {
    k: "grafica", n: "Gráfica",
    svg: bg("grafica", "#9FD3FF", "#2349C9") +
      `<rect x="20" y="70" width="18" height="34" rx="5" fill="#CFE6FF"/><rect x="44" y="56" width="18" height="48" rx="5" fill="#E4F0FF"/>` +
      `<rect x="68" y="34" width="32" height="70" rx="8" fill="#fff"/>` +
      `<path d="M18 58L42 44L60 50L92 20" fill="none" stroke="#FFD15C" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M80 18H94V32" fill="none" stroke="#FFD15C" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` + face(84, 62, 0.62),
  },
  {
    k: "tarjeta", n: "Tarjeta",
    svg: bg("tarjeta", "#A8F0FF", "#117FA8") +
      `<rect x="20" y="38" width="88" height="58" rx="10" fill="#0E5F80" opacity=".45" transform="rotate(-8 64 67)"/>` +
      `<rect x="16" y="32" width="88" height="58" rx="10" fill="#F2FBFF" transform="rotate(-8 60 61)"/>` +
      `<rect x="16" y="44" width="88" height="9" fill="#BDEFFA" transform="rotate(-8 60 61)"/>` +
      `<rect x="26" y="60" width="16" height="12" rx="3" fill="#FFD15C" transform="rotate(-8 60 61)"/>` +
      `<rect x="26" y="78" width="34" height="5" rx="2.5" fill="#9ADCEB" transform="rotate(-8 60 61)"/>` +
      `<circle cx="84" cy="74" r="7" fill="#FF6B6B" opacity=".9"/><circle cx="92" cy="73" r="7" fill="#FFC83D" opacity=".9"/>` + face(56, 64, 0.72),
  },
  {
    k: "calculadora", n: "Calculadora",
    svg: bg("calculadora", "#FFD7A8", "#E5572F") +
      `<rect x="28" y="14" width="64" height="94" rx="12" fill="#1F2B4B"/><rect x="36" y="22" width="48" height="32" rx="6" fill="#C9F5A8"/>` +
      Array.from({ length: 9 }, (_, i) => `<rect x="${37 + (i % 3) * 16}" y="${62 + Math.floor(i / 3) * 14}" width="12" height="10" rx="3" fill="${i === 8 ? "#FFB547" : "#3D4C70"}"/>`).join("") +
      face(60, 36, 0.72),
  },
  {
    k: "diamante", n: "Diamante",
    svg: bg("diamante", "#EFE6FF", "#8B6CF0") +
      `<path d="M34 40L48 24H72L86 40L60 98Z" fill="#B9F1FF"/><path d="M34 40H86L60 98Z" fill="#7FD9F5"/>` +
      `<path d="M48 24L54 40L60 24L66 40L72 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linejoin="round" opacity=".8"/>` +
      `<path d="M34 40L60 98L86 40" fill="none" stroke="#fff" stroke-width="2.5" opacity=".5"/>` + face(60, 54, 0.75) +
      `<path d="M96 18l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#fff"/>`,
  },
  {
    k: "casa", n: "Casita",
    svg: bg("casa", "#A6F2EA", "#0E7C74") +
      `<path d="M60 18L104 54H92V104H28V54H16Z" fill="#FFF8EE"/><path d="M60 18L104 54H16Z" fill="#FF8A5B"/>` +
      `<rect x="78" y="24" width="10" height="18" rx="2" fill="#E5703F"/>` +
      `<path d="M50 104V86Q50 78 60 78Q70 78 70 86V104Z" fill="#22BFAE"/>` + face(60, 64, 0.8),
  },
]

export const AVATAR_BY_KEY = Object.fromEntries(AVATARS.map((a) => [a.k, a]))
export const MIRAI_PREFIX = "mirai:"
export const miraiAvatar = (src: string | null | undefined) => (src?.startsWith(MIRAI_PREFIX) ? AVATAR_BY_KEY[src.slice(MIRAI_PREFIX.length)] ?? null : null)

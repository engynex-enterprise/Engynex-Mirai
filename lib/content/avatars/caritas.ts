import { INK, bg, cheeks, closedEyes, eyes, heart, inCat, starPts } from "./kit"

// Caritas (emojis propios de Mirai, dibujados a mano).
const base = (k: string, a: string, b: string) =>
  bg(k, a, b) + `<circle cx="60" cy="63" r="42" fill="#E8A814"/><circle cx="60" cy="60" r="42" fill="#FFD84D"/>` +
  `<ellipse cx="44" cy="34" rx="12" ry="6" fill="#fff" opacity=".35" transform="rotate(-25 44 34)"/>`
const oval = (x: number, y: number) => `<ellipse cx="${x}" cy="${y}" rx="4.6" ry="6.4" fill="${INK}"/><circle cx="${x + 1.4}" cy="${y - 2.4}" r="1.5" fill="#fff"/>`

export const CARITAS = inCat("caritas", [
  {
    k: "feliz", n: "Feliz",
    svg: base("feliz", "#FFE0EC", "#E0457B") + oval(46, 52) + oval(74, 52) +
      `<path d="M40 68Q60 92 80 68Z" fill="${INK}"/><path d="M50 79Q60 86 70 79Q60 90 50 79Z" fill="#FF7E9A"/>` + cheeks(60, 68, 1.2, 26),
  },
  {
    k: "risa", n: "Carcajada",
    svg: base("risa", "#D6F3FF", "#2F8FD8") +
      `<path d="M37 54Q45 44 53 54M67 54Q75 44 83 54" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M34 64H86Q84 96 60 96Q36 96 34 64Z" fill="${INK}"/><rect x="40" y="64" width="40" height="7" rx="2" fill="#fff"/>` +
      `<path d="M46 88Q60 78 74 88Q60 98 46 88Z" fill="#FF7E9A"/>` +
      `<path d="M28 56Q22 66 28 70Q34 66 28 56Z M92 56Q86 66 92 70Q98 66 92 56Z" fill="#7FD3FF"/>`,
  },
  {
    k: "guino", n: "Guiño",
    svg: base("guino", "#E6E0FF", "#6E5BD6") + oval(46, 52) +
      `<path d="M66 52Q74 46 82 52" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M42 70Q60 88 78 70" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>` + cheeks(60, 66, 1.2, 26),
  },
  {
    k: "enamorado", n: "Enamorado",
    svg: base("enamorado", "#FFD6D6", "#D63B3B") + heart(45, 52, 1.05) + heart(75, 52, 1.05) +
      `<path d="M42 70Q60 88 78 70" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>` +
      heart(100, 22, 0.7, "#fff") + heart(18, 98, 0.5, "#fff"),
  },
  {
    k: "sorprendido", n: "Sorprendido",
    svg: base("sorprendido", "#DDF7EE", "#2BA37E") +
      `<path d="M38 38Q46 32 54 38M66 38Q74 32 82 38" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>` +
      `<circle cx="46" cy="52" r="6.5" fill="${INK}"/><circle cx="74" cy="52" r="6.5" fill="${INK}"/><circle cx="48" cy="50" r="2" fill="#fff"/><circle cx="76" cy="50" r="2" fill="#fff"/>` +
      `<ellipse cx="60" cy="78" rx="9" ry="11" fill="${INK}"/>`,
  },
  {
    k: "bacano", n: "Bacano",
    svg: base("bacano", "#FFE9C9", "#E0752A") +
      `<rect x="28" y="44" width="28" height="18" rx="7" fill="${INK}"/><rect x="64" y="44" width="28" height="18" rx="7" fill="${INK}"/><path d="M56 50H64" stroke="${INK}" stroke-width="4"/>` +
      `<path d="M34 50L42 46M70 50L78 46" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>` +
      `<path d="M44 76Q62 88 78 72" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`,
  },
  {
    k: "pensativo", n: "Pensativo",
    svg: base("pensativo", "#E3ECFF", "#5A7BE0") +
      `<path d="M38 40L52 36M68 38Q76 32 84 38" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>` +
      `<circle cx="46" cy="50" r="5" fill="${INK}"/><circle cx="76" cy="50" r="5" fill="${INK}"/><circle cx="47.5" cy="48" r="1.6" fill="#fff"/><circle cx="77.5" cy="48" r="1.6" fill="#fff"/>` +
      `<path d="M50 78Q60 74 72 80" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>` +
      `<circle cx="96" cy="22" r="8" fill="#fff"/><circle cx="104" cy="36" r="4" fill="#fff" opacity=".8"/>`,
  },
  {
    k: "dormido", n: "Dormilón",
    svg: base("dormido", "#3B3F8F", "#141838") + closedEyes(60, 54, 1.4, 14) +
      `<ellipse cx="60" cy="78" rx="6" ry="5" fill="${INK}"/>` + cheeks(60, 66, 1.1, 26) +
      `<path d="M84 16H96L84 28H96M100 34H108L100 42H108" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
  },
  {
    k: "asombrado", n: "Ojos de estrella",
    svg: base("asombrado", "#F7E3FF", "#A24CC9") +
      `<polygon points="${starPts(45, 52, 10, 4.6)}" fill="#FF7A2E" stroke="#FF7A2E" stroke-width="2" stroke-linejoin="round"/>` +
      `<polygon points="${starPts(75, 52, 10, 4.6)}" fill="#FF7A2E" stroke="#FF7A2E" stroke-width="2" stroke-linejoin="round"/>` +
      `<path d="M40 68Q60 92 80 68Z" fill="${INK}"/><path d="M50 79Q60 86 70 79Q60 90 50 79Z" fill="#FF7E9A"/>`,
  },
  {
    k: "chistoso", n: "Chistoso",
    svg: base("chistoso", "#E1F7C8", "#4C9A2A") + eyes(60, 52, 1.5, 14) +
      `<path d="M42 70Q60 84 78 70" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>` +
      `<path d="M54 75Q54 92 62 92Q70 92 68 75Z" fill="#FF7E9A"/><path d="M61 78V88" stroke="#E0466F" stroke-width="2" stroke-linecap="round"/>`,
  },
])

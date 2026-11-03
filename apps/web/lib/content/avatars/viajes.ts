import { INK, bg, face, inCat, waves } from "./kit"

// Viajes y transporte.
const cloud = (x: number, y: number, s = 1) =>
  `<g fill="#fff" opacity=".85"><circle cx="${x}" cy="${y}" r="${8 * s}"/><circle cx="${x + 10 * s}" cy="${y - 4 * s}" r="${10 * s}"/><circle cx="${x + 20 * s}" cy="${y}" r="${7 * s}"/></g>`

export const VIAJES = inCat("viajes", [
  {
    k: "avion", n: "Avión",
    svg: bg("avion", "#D2EEFF", "#3B8FE0") + cloud(14, 96, 1.1) + cloud(80, 22, 0.9) +
      `<g transform="rotate(-14 60 62)"><path d="M54 56L66 56L56 34H46Z" fill="#E4EEF9"/>` +
      `<path d="M14 64Q14 52 26 52H88Q106 52 112 62Q106 72 88 72H26Q14 72 14 64Z" fill="#fff"/>` +
      `<path d="M16 56L12 34H24L34 52Z" fill="#E5484D"/><path d="M96 56Q104 57 108 62H96Z" fill="#8FD3FF"/>` +
      Array.from({ length: 5 }, (_, i) => `<circle cx="${40 + i * 10}" cy="60" r="3" fill="#8FD3FF"/>`).join("") +
      `<path d="M50 68L68 68L54 94H44Z" fill="#DCE6F2"/><rect x="26" y="66" width="70" height="3" fill="#E5484D" opacity=".8"/></g>`,
  },
  {
    k: "carro", n: "Carro",
    svg: bg("carro", "#FFF0D6", "#F29B1D") +
      `<rect x="22" y="92" width="16" height="16" rx="4" fill="${INK}"/><rect x="82" y="92" width="16" height="16" rx="4" fill="${INK}"/>` +
      `<path d="M18 70Q18 58 28 56L38 34Q40 28 48 28H72Q80 28 82 34L92 56Q102 58 102 70V92Q102 96 98 96H22Q18 96 18 92Z" fill="#FF5C5C"/>` +
      `<path d="M42 36H78L86 56H34Z" fill="#BDEFFA"/><circle cx="32" cy="72" r="8" fill="#FFF3A3"/><circle cx="88" cy="72" r="8" fill="#FFF3A3"/>` +
      `<rect x="46" y="72" width="28" height="10" rx="4" fill="#C93A3A"/><rect x="14" y="88" width="92" height="8" rx="4" fill="#3D4C70"/>` + face(60, 46, 0.5),
  },
  {
    k: "moto", n: "Moto",
    svg: bg("moto", "#E6FFF2", "#1FA36A") +
      `<circle cx="28" cy="84" r="17" fill="none" stroke="${INK}" stroke-width="6"/><circle cx="92" cy="84" r="17" fill="none" stroke="${INK}" stroke-width="6"/>` +
      `<path d="M28 84L48 66H80L92 84M78 54L92 84" fill="none" stroke="#3D4C70" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M44 64Q56 50 78 56L82 70H48Z" fill="#4F7CFF"/><path d="M34 58H58" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>` +
      `<path d="M78 54L84 38H96" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/><circle cx="94" cy="50" r="5.5" fill="#FFD84D"/>`,
  },
  {
    k: "chiva", n: "Chiva",
    svg: bg("chiva", "#FFF0C2", "#F2A01D") +
      `<rect x="20" y="16" width="20" height="14" rx="3" fill="#B07A3C"/><rect x="44" y="20" width="16" height="10" rx="3" fill="#4F7CFF"/><rect x="66" y="14" width="22" height="16" rx="3" fill="#3FA34D"/>` +
      `<rect x="10" y="28" width="100" height="8" rx="3" fill="#E5484D"/><rect x="12" y="36" width="96" height="56" rx="8" fill="#FFD23F"/>` +
      ["#8D5A3B", "#F5C9A8", "#C68457", "#6E4529"].map((s, i) => `<rect x="${20 + i * 22}" y="44" width="16" height="18" rx="3" fill="#BDEFFA"/><circle cx="${28 + i * 22}" cy="56" r="5" fill="${s}"/>`).join("") +
      `<rect x="12" y="66" width="96" height="6" fill="#E5484D"/><rect x="12" y="72" width="96" height="6" fill="#4F7CFF"/><rect x="12" y="78" width="96" height="6" fill="#3FA34D"/>` +
      `<circle cx="32" cy="94" r="11" fill="${INK}"/><circle cx="88" cy="94" r="11" fill="${INK}"/><circle cx="32" cy="94" r="4" fill="#9AA3B5"/><circle cx="88" cy="94" r="4" fill="#9AA3B5"/>`,
  },
  {
    k: "barco", n: "Barco",
    svg: bg("barco", "#D2F0FF", "#2D8FD3") +
      `<circle cx="74" cy="28" r="6" fill="#fff" opacity=".7"/><circle cx="82" cy="18" r="8" fill="#fff" opacity=".7"/>` +
      `<rect x="62" y="34" width="11" height="22" fill="#FFC83D"/><rect x="36" y="54" width="44" height="22" rx="4" fill="#fff"/>` +
      `<circle cx="47" cy="65" r="4" fill="#8FD3FF"/><circle cx="60" cy="65" r="4" fill="#8FD3FF"/><circle cx="73" cy="65" r="4" fill="#8FD3FF"/>` +
      `<path d="M14 76H106L94 100Q92 104 86 104H34Q28 104 26 100Z" fill="#E5484D"/>` + face(60, 88, 0.6) + waves(104),
  },
  {
    k: "maleta", n: "Maleta",
    svg: bg("maleta", "#E7E2FF", "#7552E0") +
      `<path d="M48 34V26Q48 20 54 20H66Q72 20 72 26V34" fill="none" stroke="#3D4C70" stroke-width="5"/>` +
      `<rect x="22" y="32" width="76" height="72" rx="12" fill="#FF9F1C"/><rect x="34" y="32" width="6" height="72" fill="#E5862E"/>` +
      `<circle cx="84" cy="46" r="7" fill="#9EDB4E"/><rect x="74" y="84" width="16" height="10" rx="3" fill="#fff" opacity=".85" transform="rotate(10 82 89)"/>` +
      `<circle cx="34" cy="108" r="4.5" fill="${INK}"/><circle cx="86" cy="108" r="4.5" fill="${INK}"/>` + face(64, 68, 0.88),
  },
  {
    k: "globo-aero", n: "Globo aerostático",
    svg: bg("globo-aero", "#FFE6D6", "#F07B54") + cloud(8, 100, 0.9) + cloud(88, 92, 0.8) +
      `<path d="M50 92L52 100M70 92L68 100" stroke="#7A5230" stroke-width="2"/>` +
      `<path d="M60 10C84 10 98 28 98 48C98 68 76 80 70 92H50C44 80 22 68 22 48C22 28 36 10 60 10Z" fill="#4F9CFF"/>` +
      `<path d="M60 10C48 10 40 28 40 48C40 68 52 82 54 92H66C68 82 80 68 80 48C80 28 72 10 60 10Z" fill="#FFC83D"/>` +
      `<path d="M60 10C56 10 50 28 50 48C50 68 58 82 58 92H62C62 82 70 68 70 48C70 28 64 10 60 10Z" fill="#FF7A8E"/>` +
      `<rect x="50" y="100" width="20" height="14" rx="3" fill="#B07A3C"/>` + face(60, 48, 0.7),
  },
  {
    k: "metrocable", n: "Metrocable",
    svg: bg("metrocable", "#DFF2FF", "#3E8FC2") +
      ["#FF9F1C", "#E5484D", "#FFD23F", "#9EDB4E", "#FF7A8E", "#4F9CFF"].map((c, i) => `<rect x="${i * 20}" y="${100 - (i % 3) * 6}" width="18" height="${22 + (i % 3) * 6}" fill="${c}" opacity=".75"/>`).join("") +
      `<path d="M0 22L120 38" stroke="${INK}" stroke-width="3"/><path d="M62 30V44" stroke="${INK}" stroke-width="3"/><circle cx="62" cy="30" r="4" fill="${INK}"/>` +
      `<rect x="34" y="44" width="56" height="46" rx="10" fill="#E5484D"/><rect x="40" y="52" width="44" height="22" rx="5" fill="#BDEFFA"/>` +
      `<rect x="34" y="80" width="56" height="4" fill="#fff" opacity=".7"/>` + face(62, 62, 0.55),
  },
  {
    k: "mapa", n: "Mapa",
    svg: bg("mapa", "#E3F7D0", "#5FA83A") +
      `<path d="M16 32L42 24L78 32L104 24V94L78 102L42 94L16 102Z" fill="#FFF8E8"/><path d="M42 24L78 32V102L42 94Z" fill="#F2E6CC"/>` +
      `<path d="M26 84Q40 58 58 68T88 48" fill="none" stroke="#E5484D" stroke-width="3" stroke-dasharray="5 4" stroke-linecap="round"/>` +
      `<circle cx="26" cy="84" r="4" fill="#4F7CFF"/>` +
      `<path d="M88 16C80 16 75 22 75 29C75 40 88 50 88 50C88 50 101 40 101 29C101 22 96 16 88 16Z" fill="#E5484D"/><circle cx="88" cy="29" r="4.5" fill="#fff"/>`,
  },
  {
    k: "tren", n: "Tren",
    svg: bg("tren", "#FFF0D6", "#E08A00") +
      `<path d="M42 104L28 120M78 104L92 120" stroke="${INK}" stroke-width="4"/><path d="M50 12L60 22L70 12" fill="none" stroke="${INK}" stroke-width="3"/>` +
      `<rect x="28" y="22" width="64" height="80" rx="16" fill="#4F7CFF"/><rect x="36" y="32" width="48" height="30" rx="6" fill="#BDEFFA"/>` +
      `<circle cx="40" cy="82" r="6" fill="#FFF3A3"/><circle cx="80" cy="82" r="6" fill="#FFF3A3"/><rect x="52" y="78" width="16" height="8" rx="3" fill="#3557C9"/>` +
      `<rect x="28" y="68" width="64" height="4" fill="#FFC83D"/>` + face(60, 46, 0.6),
  },
])

import { INK, bg, face, inCat, polyPts, sparkle, waves } from "./kit"

// Deportes (incluido el tejo, deporte nacional de Colombia).
const futbol = () => {
  const outer = Array.from({ length: 5 }, (_, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5
    const x = 60 + 36 * Math.cos(a), y = 60 + 36 * Math.sin(a)
    return `<polygon points="${polyPts(x, y, 11, 5, a + Math.PI / 5)}" fill="${INK}"/>` +
      `<path d="M${(60 + 15 * Math.cos(a)).toFixed(1)} ${(60 + 15 * Math.sin(a)).toFixed(1)}L${(60 + 26 * Math.cos(a)).toFixed(1)} ${(60 + 26 * Math.sin(a)).toFixed(1)}" stroke="${INK}" stroke-width="2.5"/>`
  }).join("")
  return `<defs><clipPath id="av-futbol-c"><circle cx="60" cy="60" r="40"/></clipPath></defs>` +
    `<circle cx="60" cy="63" r="40" fill="#1E7F3E" opacity=".5"/><circle cx="60" cy="60" r="40" fill="#fff"/>` +
    `<g clip-path="url(#av-futbol-c)">${outer}</g><polygon points="${polyPts(60, 60, 14, 5)}" fill="${INK}"/>` +
    `<circle cx="60" cy="60" r="40" fill="none" stroke="${INK}" stroke-width="2.5"/>`
}

export const DEPORTES = inCat("deportes", [
  { k: "futbol", n: "Balón de fútbol", svg: bg("futbol", "#C9F2C2", "#2E9E4F") + futbol() },
  {
    k: "bici", n: "Bicicleta",
    svg: bg("bici", "#FFE3B0", "#E5862E") +
      `<circle cx="30" cy="80" r="20" fill="none" stroke="${INK}" stroke-width="5"/><circle cx="90" cy="80" r="20" fill="none" stroke="${INK}" stroke-width="5"/>` +
      `<circle cx="30" cy="80" r="3.5" fill="${INK}"/><circle cx="90" cy="80" r="3.5" fill="${INK}"/>` +
      `<path d="M30 80L50 52H80L90 80M50 52L62 80H30M80 52L62 80M82 44L90 80" fill="none" stroke="#E5484D" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M42 46H58M78 44L84 38H94" stroke="${INK}" stroke-width="5" stroke-linecap="round" fill="none"/><circle cx="62" cy="80" r="5" fill="#FFC83D"/>`,
  },
  {
    k: "tenis", n: "Raqueta de tenis",
    svg: bg("tenis", "#E6FFB3", "#7DBA1E") +
      `<defs><clipPath id="av-tenis-c"><ellipse cx="50" cy="46" rx="24" ry="28"/></clipPath></defs>` +
      `<path d="M64 70L92 106" stroke="#1F2B4B" stroke-width="9" stroke-linecap="round"/>` +
      `<g clip-path="url(#av-tenis-c)" stroke="#fff" stroke-width="1.8" opacity=".9">` +
      Array.from({ length: 7 }, (_, i) => `<path d="M${26 + i * 8} 16V78M20 ${22 + i * 8}H80"/>`).join("") + `</g>` +
      `<ellipse cx="50" cy="46" rx="26" ry="30" fill="none" stroke="#1F2B4B" stroke-width="6"/>` +
      `<circle cx="92" cy="40" r="15" fill="#E5FF5C"/><path d="M80 32Q92 40 80 50M104 30Q92 40 104 50" fill="none" stroke="#fff" stroke-width="2.5"/>` + face(92, 41, 0.42),
  },
  {
    k: "baloncesto", n: "Baloncesto",
    svg: bg("baloncesto", "#D6E4FF", "#3E5FD9") +
      `<circle cx="60" cy="63" r="38" fill="#C45E1F" opacity=".6"/><circle cx="60" cy="60" r="38" fill="#FF8A3D"/>` +
      `<path d="M60 22V98M22 60H98M34 32Q52 60 34 88M86 32Q68 60 86 88" fill="none" stroke="${INK}" stroke-width="3"/>`,
  },
  {
    k: "medalla", n: "Medalla",
    svg: bg("medalla", "#FFE3E3", "#D63B3B") +
      `<path d="M36 8H52L66 50H50Z" fill="#4F7CFF"/><path d="M84 8H68L54 50H70Z" fill="#FFD23F"/><path d="M58 8H62L64 30H56Z" fill="#E5484D"/>` +
      `<circle cx="60" cy="78" r="30" fill="#E8A814"/><circle cx="60" cy="75" r="30" fill="#FFC83D"/><circle cx="60" cy="75" r="22" fill="none" stroke="#FFF1BF" stroke-width="3.5"/>` +
      face(60, 74, 0.7),
  },
  {
    k: "tejo", n: "Tejo",
    svg: bg("tejo", "#FFE9C9", "#B5651D") +
      `<rect x="14" y="42" width="92" height="68" rx="12" fill="#9C6A45"/><rect x="20" y="48" width="80" height="56" rx="8" fill="#B57C52"/>` +
      `<circle cx="60" cy="76" r="17" fill="#7A5236" stroke="#E6E6EA" stroke-width="5"/>` +
      `<path d="M52 56L60 46L68 56Z M52 96L60 106L68 96Z" fill="#fff" stroke="#E5484D" stroke-width="3" stroke-linejoin="round"/>` +
      `<path d="M66 24L78 30M70 16L82 22" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>` +
      `<ellipse cx="96" cy="28" rx="15" ry="10" fill="#7C869B"/><ellipse cx="96" cy="26" rx="15" ry="10" fill="#B5BDCC"/>` + face(96, 25, 0.38),
  },
  {
    k: "natacion", n: "Natación",
    svg: bg("natacion", "#C9F2FF", "#1C8FB8") +
      `<circle cx="60" cy="60" r="27" fill="#E0A47A"/><path d="M33 58Q33 30 60 30Q87 30 87 58Z" fill="#E5484D"/>` +
      `<path d="M33 62H40M80 62H87" stroke="${INK}" stroke-width="3"/>` +
      `<ellipse cx="50" cy="62" rx="9" ry="7" fill="#7FD9F5" stroke="${INK}" stroke-width="2.5"/><ellipse cx="70" cy="62" rx="9" ry="7" fill="#7FD9F5" stroke="${INK}" stroke-width="2.5"/>` +
      `<path d="M54 74Q60 79 66 74" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>` +
      waves(84, "#5CC8FF", 0.95) + waves(96, "#8FD3FF", 0.9) + `<circle cx="96" cy="44" r="4" fill="#fff" opacity=".7"/><circle cx="104" cy="34" r="2.5" fill="#fff" opacity=".7"/>`,
  },
  {
    k: "pesa", n: "Pesa",
    svg: bg("pesa", "#E7E2FF", "#5A47C9") +
      `<path d="M40 54V42Q40 22 60 22Q80 22 80 42V54" fill="none" stroke="#3D4C70" stroke-width="10"/>` +
      `<circle cx="60" cy="77" r="33" fill="#E08A1C"/><circle cx="60" cy="74" r="33" fill="#FFB547"/>` +
      `<ellipse cx="46" cy="58" rx="9" ry="5" fill="#fff" opacity=".35" transform="rotate(-30 46 58)"/>` + face(60, 78, 0.85),
  },
  {
    k: "trofeo", n: "Trofeo",
    svg: bg("trofeo", "#DCEBFF", "#3B5BDB") +
      `<path d="M34 30H22Q18 52 38 58M86 30H98Q102 52 82 58" fill="none" stroke="#FFC83D" stroke-width="6"/>` +
      `<path d="M32 20H88V44Q88 74 60 76Q32 74 32 44Z" fill="#FFC83D"/><rect x="53" y="74" width="14" height="14" fill="#E8A814"/>` +
      `<rect x="40" y="86" width="40" height="10" rx="3" fill="#E8A814"/><rect x="34" y="96" width="52" height="14" rx="3" fill="#8A5A2B"/>` +
      `<path d="M40 26V42" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".5"/>` + face(60, 46, 0.8) + sparkle(102, 14, 0.7),
  },
  {
    k: "patineta", n: "Patineta",
    svg: bg("patineta", "#FFD6EC", "#D9458C") + sparkle(26, 28, 0.8) + sparkle(98, 30, 0.6) +
      `<g transform="rotate(-12 60 66)"><rect x="12" y="54" width="96" height="18" rx="9" fill="#1F2B4B"/>` +
      `<path d="M24 63H96" stroke="#9EDB4E" stroke-width="4" stroke-linecap="round"/>` +
      `<rect x="28" y="72" width="12" height="5" fill="#9AA3B5"/><rect x="80" y="72" width="12" height="5" fill="#9AA3B5"/>` +
      `<circle cx="34" cy="82" r="8" fill="#FFD84D"/><circle cx="86" cy="82" r="8" fill="#FFD84D"/><circle cx="34" cy="82" r="3" fill="#E8A814"/><circle cx="86" cy="82" r="3" fill="#E8A814"/></g>`,
  },
])

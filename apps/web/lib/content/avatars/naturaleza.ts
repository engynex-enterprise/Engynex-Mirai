import { bg, cheeks, closedEyes, face, inCat, smile, sparkle } from "./kit"

// Naturaleza y paisajes de Colombia.
export const NATURALEZA = inCat("naturaleza", [
  {
    k: "cactus", n: "Cactus",
    svg: bg("cactus", "#FFE8C2", "#E08A3A") +
      `<path d="M42 66H32Q26 66 26 58V44M78 58H88Q94 58 94 50V38" stroke="#4CB86A" stroke-width="12" stroke-linecap="round" fill="none"/>` +
      `<rect x="42" y="26" width="36" height="66" rx="18" fill="#4CB86A"/><path d="M52 34V86M68 34V86" stroke="#3A9A55" stroke-width="2" opacity=".6"/>` +
      `<circle cx="60" cy="24" r="7" fill="#FF7EB0"/><circle cx="60" cy="24" r="3" fill="#FFD84D"/>` +
      `<path d="M38 88H82L77 112H43Z" fill="#E5703F"/><rect x="34" y="84" width="52" height="9" rx="4.5" fill="#D45F30"/>` + face(60, 56, 0.75),
  },
  {
    k: "montana", n: "Montaña",
    svg: bg("montana", "#CDEBFF", "#5A8FD8") + `<circle cx="96" cy="26" r="11" fill="#FFD84D"/>` +
      `<path d="M-4 104L30 58L50 82L64 70L124 104Z" fill="#7FA8E0"/>` +
      `<path d="M14 110L60 28L106 110Z" fill="#4F6FA8"/><path d="M60 28L76 56L68 52L60 60L52 52L44 56Z" fill="#fff"/>` +
      `<rect x="0" y="102" width="120" height="18" fill="#5FB86A"/>` + face(60, 80, 0.8),
  },
  {
    k: "sol", n: "Sol",
    svg: bg("sol", "#FFF3B0", "#FF9F1C") +
      Array.from({ length: 12 }, (_, i) => `<rect x="56" y="6" width="8" height="18" rx="4" fill="#FFE14D" transform="rotate(${i * 30} 60 60)"/>`).join("") +
      `<circle cx="60" cy="60" r="31" fill="#FFC83D"/>` + face(60, 60, 0.95),
  },
  {
    k: "luna", n: "Luna",
    svg: bg("luna", "#3B3F8F", "#141838") + sparkle(22, 24, 0.6) + sparkle(100, 100, 0.7) + sparkle(98, 22, 0.45) + sparkle(18, 92, 0.4) +
      `<circle cx="60" cy="62" r="38" fill="#FFF1BF"/>` +
      `<circle cx="78" cy="44" r="7" fill="#F2DFA0"/><circle cx="42" cy="84" r="5" fill="#F2DFA0"/><circle cx="84" cy="78" r="4" fill="#F2DFA0"/>` +
      closedEyes(60, 60, 1.1, 12) + cheeks(60, 70, 1, 22) + smile(60, 74, 0.8),
  },
  {
    k: "palma", n: "Palma de cera",
    svg: bg("palma", "#D9F3FF", "#3BA3D9") +
      `<circle cx="28" cy="32" r="8" fill="#fff" opacity=".8"/><circle cx="38" cy="30" r="10" fill="#fff" opacity=".8"/>` +
      `<path d="M0 98Q30 72 60 90T120 82V120H0Z" fill="#5FB86A"/><path d="M0 108Q40 92 80 106T120 100V120H0Z" fill="#3FA34D"/>` +
      `<rect x="62" y="34" width="6" height="84" rx="3" fill="#E8DCC8"/>` +
      `<path d="M62 50H68M62 66H68M62 82H68M62 98H68" stroke="#C9B89C" stroke-width="2"/>` +
      `<path d="M65 34Q42 14 18 28Q42 24 65 38Z M65 34Q88 14 112 28Q88 24 65 38Z" fill="#2E8B57"/>` +
      `<path d="M65 34Q48 32 34 54Q50 38 65 38Z M65 34Q82 32 96 54Q80 38 65 38Z M65 34Q60 14 66 4Q72 14 65 34Z" fill="#3FA34D"/>`,
  },
  {
    k: "arcoiris", n: "Arcoíris",
    svg: bg("arcoiris", "#E6F4FF", "#7FB8F0") +
      [["#FF6B6B", 46], ["#FFC83D", 38], ["#7BD389", 30], ["#4F9CFF", 22]].map(([c, r]) => `<path d="M${60 - +r} 86A${r} ${r} 0 0 1 ${60 + +r} 86" fill="none" stroke="${c}" stroke-width="8"/>`).join("") +
      `<circle cx="16" cy="88" r="11" fill="#fff"/><circle cx="28" cy="84" r="13" fill="#fff"/><circle cx="38" cy="90" r="9" fill="#fff"/><rect x="8" y="88" width="34" height="12" rx="6" fill="#fff"/>` +
      `<circle cx="92" cy="88" r="10" fill="#fff"/><circle cx="104" cy="84" r="12" fill="#fff"/><rect x="84" y="88" width="30" height="12" rx="6" fill="#fff"/>` + face(26, 91, 0.5),
  },
  {
    k: "orquidea", n: "Orquídea",
    svg: bg("orquidea", "#F7E3FF", "#A24CC9") +
      `<path d="M60 92V118" stroke="#3FA34D" stroke-width="4"/><ellipse cx="44" cy="108" rx="14" ry="5" fill="#4CAF50" transform="rotate(-20 44 108)"/>` +
      Array.from({ length: 5 }, (_, i) => `<ellipse cx="60" cy="30" rx="13" ry="22" fill="${i % 2 ? "#F3C6F5" : "#EAB0EE"}" transform="rotate(${i * 72} 60 56)"/>`).join("") +
      `<path d="M46 64Q60 98 74 64Q60 72 46 64Z" fill="#C2417A"/><path d="M54 70Q60 84 66 70" fill="#FFD84D"/>` +
      `<circle cx="60" cy="54" r="14" fill="#FFE3F5"/>` + face(60, 54, 0.5),
  },
  {
    k: "hoja", n: "Hoja",
    svg: bg("hoja", "#E1F7C8", "#4C9A2A") +
      `<path d="M60 112V96" stroke="#3C7F2E" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M60 10C94 30 100 70 60 104C20 70 26 30 60 10Z" fill="#7BD389"/>` +
      `<path d="M60 74V102M60 84L44 74M60 84L76 74M60 94L48 88M60 94L72 88" stroke="#4CAF50" stroke-width="2.5" stroke-linecap="round"/>` + face(60, 52, 0.8),
  },
  {
    k: "nevado", n: "Nevado",
    svg: bg("nevado", "#FFD9C2", "#D9573A") +
      `<circle cx="56" cy="22" r="9" fill="#fff" opacity=".7"/><circle cx="68" cy="16" r="11" fill="#fff" opacity=".7"/><circle cx="80" cy="22" r="8" fill="#fff" opacity=".7"/>` +
      `<path d="M12 110L46 40H74L108 110Z" fill="#7A5A4A"/>` +
      `<path d="M46 40H74L84 60Q76 56 70 62Q62 56 56 62Q48 56 36 60Z" fill="#fff"/><ellipse cx="60" cy="40" rx="14" ry="3" fill="#5A3F33"/>` + face(60, 82, 0.8),
  },
  {
    k: "girasol", n: "Girasol",
    svg: bg("girasol", "#E6F7FF", "#4FA3E0") +
      `<path d="M60 76V118" stroke="#3FA34D" stroke-width="5"/><path d="M60 100Q40 86 30 98Q44 108 60 100Z" fill="#4CAF50"/>` +
      Array.from({ length: 12 }, (_, i) => `<ellipse cx="60" cy="20" rx="8" ry="16" fill="#FFC83D" transform="rotate(${i * 30} 60 48)"/>`).join("") +
      `<circle cx="60" cy="48" r="18" fill="#D9A066"/><circle cx="60" cy="48" r="18" fill="none" stroke="#B07A3C" stroke-width="3"/>` + face(60, 47, 0.6),
  },
])

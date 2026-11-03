import { INK, bg, cheeks, closedEyes, eyes, face, inCat, smile, waves } from "./kit"

// Animales de Colombia y de la casa.
export const ANIMALES = inCat("animales", [
  {
    k: "perro", n: "Perrito",
    svg: bg("perro", "#FFE6C7", "#D98A3A") +
      `<ellipse cx="28" cy="58" rx="12" ry="25" fill="#8B5A2B" transform="rotate(18 28 58)"/><ellipse cx="92" cy="58" rx="12" ry="25" fill="#8B5A2B" transform="rotate(-18 92 58)"/>` +
      `<circle cx="60" cy="62" r="35" fill="#E2A866"/><ellipse cx="75" cy="54" rx="12" ry="11" fill="#C8864A"/>` +
      `<ellipse cx="60" cy="80" rx="19" ry="14" fill="#FFF1DE"/><ellipse cx="60" cy="73" rx="7" ry="5" fill="${INK}"/>` +
      eyes(60, 56, 1, 13) + `<path d="M53 81Q60 87 67 81" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>` +
      `<path d="M56 84Q60 96 64 84Z" fill="#FF7E9A"/>`,
  },
  {
    k: "gato", n: "Gatico",
    svg: bg("gato", "#E6E0FF", "#6E5BD6") +
      `<path d="M28 44L32 12L56 32Z M92 44L88 12L64 32Z" fill="#F2A65A"/><path d="M34 36L36 20L48 32Z M86 36L84 20L72 32Z" fill="#FFD0B0"/>` +
      `<ellipse cx="60" cy="64" rx="36" ry="32" fill="#F2A65A"/>` +
      `<path d="M60 34V44M51 36L53 44M69 36L67 44" stroke="#D9823A" stroke-width="3" stroke-linecap="round"/>` +
      eyes(60, 60, 1, 13) + `<path d="M56 68H64L60 72Z" fill="#FF7E9A"/>` +
      `<path d="M60 72Q56 78 51 74M60 72Q64 78 69 74" stroke="${INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
      `<path d="M20 66H38M21 74L38 71M82 66H100M82 71L99 74" stroke="#fff" stroke-width="2" stroke-linecap="round"/>` + cheeks(60, 70, 0.9, 24),
  },
  {
    k: "buho", n: "Búho",
    svg: bg("buho", "#D8E6C7", "#4E7A3A") +
      `<rect x="10" y="104" width="100" height="7" rx="3.5" fill="#6B4A2A"/>` +
      `<path d="M30 36L26 14L46 28Z M90 36L94 14L74 28Z" fill="#A0703F"/><ellipse cx="60" cy="66" rx="36" ry="42" fill="#A0703F"/>` +
      `<ellipse cx="60" cy="84" rx="22" ry="22" fill="#E8C99A"/>` +
      `<path d="M50 78l4 4 4-4M62 78l4 4 4-4M56 90l4 4 4-4" stroke="#C9A06A" stroke-width="2" fill="none"/>` +
      `<circle cx="45" cy="54" r="14" fill="#fff"/><circle cx="75" cy="54" r="14" fill="#fff"/>` + eyes(60, 55, 1.6, 15) +
      `<path d="M55 63H65L60 73Z" fill="#FFB547"/>`,
  },
  {
    k: "tucan", n: "Tucán",
    svg: bg("tucan", "#C9F2FF", "#1C8FB8") +
      `<rect x="8" y="104" width="92" height="7" rx="3.5" fill="#6B4A2A"/>` +
      `<ellipse cx="50" cy="76" rx="28" ry="34" fill="#1F2B4B"/><ellipse cx="52" cy="72" rx="15" ry="17" fill="#FFE38A"/>` +
      `<circle cx="48" cy="46" r="24" fill="#1F2B4B"/><circle cx="54" cy="44" r="12" fill="#fff"/>` +
      `<circle cx="54" cy="44" r="6" fill="none" stroke="#7BD389" stroke-width="2.5"/><circle cx="54" cy="44" r="3.8" fill="${INK}"/><circle cx="55.2" cy="42.8" r="1.2" fill="#fff"/>` +
      `<path d="M64 34Q104 28 112 52Q96 50 66 56Z" fill="#FF9F1C"/><path d="M64 34Q100 28 110 44Q92 40 66 42Z" fill="#FFD84D"/>` +
      `<path d="M106 46Q112 50 112 53Q105 53 101 50Z" fill="#E5484D"/>`,
  },
  {
    k: "colibri", n: "Colibrí",
    svg: bg("colibri", "#FFE0EC", "#E0457B") +
      `<circle cx="96" cy="84" r="9" fill="#FF7EB0"/><circle cx="106" cy="94" r="9" fill="#FF7EB0"/><circle cx="96" cy="104" r="9" fill="#FF7EB0"/><circle cx="86" cy="94" r="9" fill="#FF7EB0"/><circle cx="96" cy="94" r="6" fill="#FFD84D"/>` +
      `<path d="M38 72L14 90L24 72L12 68Z" fill="#1E8F6A"/>` +
      `<ellipse cx="46" cy="40" rx="24" ry="9" fill="#8FE8C8" transform="rotate(-55 46 40)"/>` +
      `<ellipse cx="56" cy="66" rx="24" ry="15" fill="#2FBF8F" transform="rotate(-22 56 66)"/>` +
      `<ellipse cx="38" cy="50" rx="22" ry="8" fill="#5FD3A8" transform="rotate(-30 38 50)"/>` +
      `<circle cx="72" cy="50" r="14" fill="#2FBF8F"/><path d="M84 46L110 36" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>` +
      `<circle cx="75" cy="47" r="3.4" fill="${INK}"/><circle cx="76.1" cy="45.8" r="1.1" fill="#fff"/><circle cx="72" cy="56" r="3.4" fill="#FF7E9A" opacity=".6"/>`,
  },
  {
    k: "oso-anteojos", n: "Oso de anteojos",
    svg: bg("oso-anteojos", "#E1F2D8", "#4F8A3C") +
      `<circle cx="31" cy="32" r="13" fill="#2B2420"/><circle cx="89" cy="32" r="13" fill="#2B2420"/>` +
      `<circle cx="60" cy="62" r="38" fill="#3A302A"/>` +
      `<ellipse cx="45" cy="56" rx="13" ry="11" fill="#F2DDB0"/><ellipse cx="75" cy="56" rx="13" ry="11" fill="#F2DDB0"/>` +
      `<ellipse cx="60" cy="80" rx="19" ry="14" fill="#F2DDB0"/><ellipse cx="60" cy="74" rx="6.5" ry="4.5" fill="${INK}"/>` +
      eyes(60, 56, 1, 15) + smile(60, 82, 0.75) + `<circle cx="38" cy="74" r="4" fill="#FF7E9A" opacity=".5"/><circle cx="82" cy="74" r="4" fill="#FF7E9A" opacity=".5"/>`,
  },
  {
    k: "chiguiro", n: "Chigüiro",
    svg: bg("chiguiro", "#D7F0FF", "#3E8FC2") +
      `<circle cx="36" cy="34" r="7" fill="#8A5E36"/><circle cx="84" cy="34" r="7" fill="#8A5E36"/>` +
      `<rect x="28" y="30" width="64" height="70" rx="30" fill="#B98552"/><rect x="38" y="64" width="44" height="30" rx="15" fill="#9C6D42"/>` +
      `<ellipse cx="52" cy="72" rx="3.2" ry="2.2" fill="${INK}"/><ellipse cx="68" cy="72" rx="3.2" ry="2.2" fill="${INK}"/>` +
      eyes(60, 52, 0.95, 14) + smile(60, 82, 0.6) + cheeks(60, 62, 0.9, 22) +
      `<circle cx="60" cy="24" r="8" fill="#FF9F1C"/><path d="M60 16Q66 10 70 14Q64 18 60 16Z" fill="#3FA34D"/>` + waves(100),
  },
  {
    k: "delfin", n: "Delfín rosado",
    svg: bg("delfin", "#CDEBFF", "#2D7FD3") +
      `<path d="M26 60L6 46L12 64L4 80L28 70Z" fill="#F58BA8"/><path d="M48 38Q54 16 70 34Z" fill="#F58BA8"/>` +
      `<ellipse cx="58" cy="64" rx="36" ry="30" fill="#FF9EB8"/><ellipse cx="92" cy="72" rx="18" ry="10" fill="#FFB3C8"/>` +
      `<ellipse cx="64" cy="78" rx="22" ry="12" fill="#FFD6E0"/><path d="M48 88Q42 104 30 102Q38 92 42 84Z" fill="#F58BA8"/>` +
      `<circle cx="72" cy="56" r="4" fill="${INK}"/><circle cx="73.3" cy="54.6" r="1.3" fill="#fff"/><circle cx="76" cy="67" r="4" fill="#FF7E9A" opacity=".6"/>` +
      `<path d="M82 76Q92 82 104 76" stroke="${INK}" stroke-width="2.6" fill="none" stroke-linecap="round"/>` + waves(104, "#8FD3FF", 0.7),
  },
  {
    k: "tortuga", n: "Tortuga",
    svg: bg("tortuga", "#E6F6C9", "#7AA82E") +
      `<ellipse cx="26" cy="96" rx="11" ry="8" fill="#B5E08C"/><ellipse cx="94" cy="96" rx="11" ry="8" fill="#B5E08C"/>` +
      `<path d="M16 82Q16 32 60 32Q104 32 104 82Z" fill="#4E9F3D"/>` +
      `<polygon points="60,40 72,48 72,62 60,70 48,62 48,48" fill="#7BC96F"/><polygon points="34,58 44,64 44,76 34,80 26,76 26,64" fill="#7BC96F"/><polygon points="86,58 94,64 94,76 86,80 76,76 76,64" fill="#7BC96F"/>` +
      `<rect x="12" y="78" width="96" height="10" rx="5" fill="#3C7F2E"/><circle cx="60" cy="94" r="18" fill="#B5E08C"/>` + face(60, 94, 0.58),
  },
  {
    k: "condor", n: "Cóndor",
    svg: bg("condor", "#FFE5C2", "#D9733A") +
      `<path d="M0 104L26 74L44 92L70 62L96 88L120 70V120H0Z" fill="#B4542A" opacity=".45"/>` +
      `<path d="M60 58Q30 40 4 56Q24 58 32 66Q20 68 12 78Q40 78 60 72Z" fill="#2B2B33"/>` +
      `<path d="M60 58Q90 40 116 56Q96 58 88 66Q100 68 108 78Q80 78 60 72Z" fill="#2B2B33"/>` +
      `<ellipse cx="60" cy="76" rx="16" ry="22" fill="#2B2B33"/><ellipse cx="60" cy="56" rx="17" ry="7" fill="#fff"/>` +
      `<circle cx="60" cy="40" r="14" fill="#E8A08A"/><path d="M54 27Q60 20 66 27Z" fill="#7A3E33"/>` +
      `<circle cx="54.5" cy="38" r="2.8" fill="${INK}"/><circle cx="65.5" cy="38" r="2.8" fill="${INK}"/><path d="M56.5 43H63.5L60 52Z" fill="#F2D7A8"/>`,
  },
  {
    k: "rana", n: "Rana dorada",
    svg: bg("rana", "#D7F7E0", "#1FA36A") +
      `<ellipse cx="60" cy="104" rx="48" ry="10" fill="#2E8B57"/><path d="M60 104L74 96" stroke="#1FA36A" stroke-width="3"/>` +
      `<circle cx="40" cy="42" r="16" fill="#FFD23F"/><circle cx="80" cy="42" r="16" fill="#FFD23F"/>` +
      `<ellipse cx="60" cy="70" rx="42" ry="30" fill="#FFD23F"/>` +
      `<circle cx="40" cy="42" r="10" fill="#fff"/><circle cx="80" cy="42" r="10" fill="#fff"/>` + eyes(60, 43, 1.4, 20) +
      `<path d="M36 72Q60 90 84 72" stroke="#9A6A00" stroke-width="3.5" fill="none" stroke-linecap="round"/>` + cheeks(60, 66, 1.4, 30),
  },
  {
    k: "perezoso", n: "Perezoso",
    svg: bg("perezoso", "#E3F4D3", "#5C8F3A") +
      `<rect x="0" y="18" width="120" height="9" rx="4" fill="#7A5230"/>` +
      `<ellipse cx="16" cy="14" rx="9" ry="5" fill="#4CAF50" transform="rotate(-20 16 14)"/><ellipse cx="104" cy="14" rx="9" ry="5" fill="#4CAF50" transform="rotate(20 104 14)"/>` +
      `<path d="M36 26Q28 48 40 62M84 26Q92 48 80 62" stroke="#A98B6B" stroke-width="13" stroke-linecap="round" fill="none"/>` +
      `<circle cx="60" cy="72" r="31" fill="#A98B6B"/><ellipse cx="60" cy="75" rx="23" ry="18" fill="#E8D7BE"/>` +
      `<ellipse cx="49" cy="70" rx="8.5" ry="5" fill="#5A4636" transform="rotate(-20 49 70)"/><ellipse cx="71" cy="70" rx="8.5" ry="5" fill="#5A4636" transform="rotate(20 71 70)"/>` +
      closedEyes(60, 69, 0.8, 11, "#F2E6D4") + `<ellipse cx="60" cy="78" rx="4" ry="3" fill="${INK}"/>` + smile(60, 83, 0.6),
  },
])

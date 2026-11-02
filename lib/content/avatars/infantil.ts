import { INK, bg, cheeks, eyes, face, inCat, smile, sparkle, starPts } from "./kit"

// Personajes tiernos, pensados para los perfiles de los hijos (mesadas, metas de ahorro).
export const INFANTIL = inCat("infantil", [
  {
    k: "robotito", n: "Robotito",
    svg: bg("robotito", "#C8F0FF", "#2F8FD8") +
      `<path d="M60 14V26" stroke="#fff" stroke-width="4" stroke-linecap="round"/><circle cx="60" cy="13" r="6" fill="#FF7A8E"/>` +
      `<rect x="20" y="44" width="10" height="18" rx="4" fill="#FFC83D"/><rect x="90" y="44" width="10" height="18" rx="4" fill="#FFC83D"/>` +
      `<rect x="26" y="26" width="68" height="54" rx="16" fill="#EAF4FF"/><rect x="34" y="34" width="52" height="38" rx="11" fill="#1F2B4B"/>` +
      `<circle cx="49" cy="50" r="5.5" fill="#7CF2C8"/><circle cx="71" cy="50" r="5.5" fill="#7CF2C8"/>` + smile(60, 60, 1, "#7CF2C8") +
      `<rect x="38" y="84" width="44" height="30" rx="10" fill="#EAF4FF"/><circle cx="60" cy="98" r="5" fill="#FF7A8E"/>`,
  },
  {
    k: "dino", n: "Dinosaurio bebé",
    svg: bg("dino", "#D8F7C2", "#3FA34D") +
      `<path d="M84 80Q106 80 112 62Q104 90 84 94Z" fill="#7BD389"/><ellipse cx="62" cy="82" rx="30" ry="22" fill="#7BD389"/>` +
      `<path d="M38 26L44 14L52 25Z M52 22L60 10L66 22Z M65 26L74 16L77 29Z" fill="#FFB547"/>` +
      `<circle cx="56" cy="52" r="28" fill="#8FE09B"/>` + face(56, 52, 0.85) +
      `<path d="M16 92L26 84L36 92L46 84L56 92L66 84L76 92L86 84L96 92L104 86V112Q60 122 16 112Z" fill="#FFF8EE"/>` +
      `<circle cx="40" cy="102" r="3" fill="#F2DFC2"/><circle cx="78" cy="106" r="4" fill="#F2DFC2"/>`,
  },
  {
    k: "nube", n: "Nubecita",
    svg: bg("nube", "#DDEBFF", "#6A8DFF") +
      `<circle cx="38" cy="66" r="20" fill="#fff"/><circle cx="62" cy="52" r="27" fill="#fff"/><circle cx="86" cy="66" r="20" fill="#fff"/>` +
      `<rect x="30" y="62" width="64" height="24" rx="12" fill="#fff"/>` + face(62, 64, 0.85) +
      `<path d="M44 96Q40 102 44 106Q48 102 44 96Z M64 98Q60 104 64 108Q68 104 64 98Z M84 96Q80 102 84 106Q88 102 84 96Z" fill="#8FD3FF"/>`,
  },
  {
    k: "estrella", n: "Estrellita",
    svg: bg("estrella", "#3B2A86", "#14123F") + sparkle(22, 24, 0.6) + sparkle(100, 98, 0.7) + sparkle(98, 22, 0.45) +
      `<polygon points="${starPts(60, 64, 46, 22)}" fill="#FFD84D" stroke="#FFD84D" stroke-width="8" stroke-linejoin="round"/>` +
      face(60, 66, 0.72),
  },
  {
    k: "cohetico", n: "Cohetico",
    svg: bg("cohetico", "#FFD6C2", "#FF6B6B") + sparkle(22, 26, 0.8) + sparkle(96, 98, 0.6) + sparkle(100, 24, 0.5) +
      `<g transform="rotate(35 60 62)"><path d="M50 82Q60 112 70 82Z" fill="#FFC83D"/><path d="M54 82Q60 100 66 82Z" fill="#FFF3A3"/>` +
      `<path d="M46 66L32 86L48 84Z" fill="#4F7CFF"/><path d="M74 66L88 86L72 84Z" fill="#4F7CFF"/>` +
      `<path d="M60 14C76 28 80 56 74 84H46C40 56 44 28 60 14Z" fill="#fff"/>` +
      `<circle cx="60" cy="50" r="13" fill="#8FE3FF" stroke="#4F7CFF" stroke-width="3"/>` + face(60, 49, 0.5) + `</g>`,
  },
  {
    k: "osito", n: "Osito",
    svg: bg("osito", "#FFE0C7", "#C9773D") +
      `<circle cx="30" cy="34" r="15" fill="#A8683A"/><circle cx="30" cy="34" r="7" fill="#E7B48A"/>` +
      `<circle cx="90" cy="34" r="15" fill="#A8683A"/><circle cx="90" cy="34" r="7" fill="#E7B48A"/>` +
      `<circle cx="60" cy="64" r="40" fill="#B87745"/><ellipse cx="60" cy="80" rx="19" ry="14" fill="#F1D2B0"/>` +
      `<ellipse cx="60" cy="73" rx="6.5" ry="4.5" fill="${INK}"/>` + eyes(60, 58, 1, 15) + smile(60, 81, 0.75) + cheeks(60, 72, 1, 26),
  },
  {
    k: "globo", n: "Globito",
    svg: bg("globo", "#FFD0F0", "#B23AC8") +
      `<path d="M60 92Q50 102 60 110Q68 116 62 120" stroke="#fff" stroke-width="2.5" fill="none"/>` +
      `<ellipse cx="60" cy="52" rx="33" ry="38" fill="#FF5C8A"/><path d="M55 88L60 95L65 88Z" fill="#E0466F"/>` +
      `<ellipse cx="45" cy="36" rx="7" ry="11" fill="#fff" opacity=".45" transform="rotate(25 45 36)"/>` + face(60, 56, 0.9),
  },
  {
    k: "helado", n: "Helado",
    svg: bg("helado", "#D2F5EE", "#29A99A") +
      `<path d="M38 62L60 114L82 62Z" fill="#F2B35E"/>` +
      `<path d="M46 68L66 96M58 64L74 80M68 66L52 98M78 70L58 106" stroke="#D18A36" stroke-width="2.5" opacity=".7"/>` +
      `<circle cx="60" cy="50" r="26" fill="#FFB3C8"/><path d="M34 54Q34 66 42 64Q46 72 52 66Q58 74 64 66Q70 72 76 64Q86 66 86 54Z" fill="#FFB3C8"/>` +
      `<path d="M62 24Q66 14 74 12" stroke="#3FA34D" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="62" cy="24" r="6.5" fill="#E23E4A"/>` +
      `<rect x="40" y="38" width="6" height="2.5" rx="1.2" fill="#4F7CFF" transform="rotate(-30 43 39)"/><rect x="76" y="36" width="6" height="2.5" rx="1.2" fill="#FFC83D" transform="rotate(25 79 37)"/>` +
      face(60, 52, 0.75),
  },
  {
    k: "pulpito", n: "Pulpito",
    svg: bg("pulpito", "#D9D2FF", "#6C4CE0") +
      Array.from({ length: 5 }, (_, i) => `<path d="M${32 + i * 14} 62Q${26 + i * 14} 94 ${36 + i * 14} 104" stroke="#FF8FB1" stroke-width="10" stroke-linecap="round" fill="none"/>`).join("") +
      `<path d="M26 66Q26 20 60 20Q94 20 94 66Z" fill="#FF8FB1"/>` +
      `<circle cx="44" cy="32" r="4" fill="#fff" opacity=".35"/><circle cx="80" cy="38" r="3" fill="#fff" opacity=".35"/>` + face(60, 48, 0.85),
  },
  {
    k: "unicornio", n: "Unicornio",
    svg: bg("unicornio", "#FFE3F5", "#C26BE0") +
      `<circle cx="32" cy="44" r="11" fill="#FF9CC7"/><circle cx="27" cy="62" r="11" fill="#A6D8FF"/><circle cx="31" cy="80" r="11" fill="#C9A6FF"/>` +
      `<path d="M40 36L44 18L56 32Z M80 36L76 18L64 32Z" fill="#fff"/><path d="M53 32L60 4L67 32Z" fill="#FFD84D"/>` +
      `<path d="M56 22L64 20M55 27L65 25" stroke="#F2B400" stroke-width="2"/>` +
      `<ellipse cx="60" cy="66" rx="32" ry="34" fill="#fff"/><ellipse cx="60" cy="88" rx="20" ry="12" fill="#FFE0EC"/>` +
      `<circle cx="54" cy="88" r="2.2" fill="#E8A0BE"/><circle cx="66" cy="88" r="2.2" fill="#E8A0BE"/>` +
      `<path d="M34 34Q46 26 52 36" stroke="#FF9CC7" stroke-width="8" fill="none" stroke-linecap="round"/>` + face(60, 62, 0.8),
  },
])

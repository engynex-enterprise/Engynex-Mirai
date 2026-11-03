import { INK, bg, face, inCat } from "./kit"

// Comida y café, con sabor colombiano.
export const COMIDA = inCat("comida", [
  {
    k: "arepa", n: "Arepa",
    svg: bg("arepa", "#FFE9B8", "#E5A23A") +
      `<circle cx="60" cy="66" r="40" fill="#E2B567"/><circle cx="60" cy="62" r="40" fill="#F6D58E"/>` +
      [[34, 46, 3], [84, 52, 4], [40, 84, 3.5], [80, 86, 3], [62, 36, 2.5], [28, 66, 2.5]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#D99B4A" opacity=".7"/>`).join("") +
      `<rect x="64" y="26" width="24" height="15" rx="4" fill="#FFF3A3" transform="rotate(-12 76 33)"/>` + face(56, 66, 0.9),
  },
  {
    k: "empanada", n: "Empanada",
    svg: bg("empanada", "#FFE0B5", "#D9733A") +
      `<path d="M12 82Q18 32 60 30Q102 32 108 82Q60 94 12 82Z" fill="#F2B04A"/>` +
      Array.from({ length: 9 }, (_, i) => `<circle cx="${20 + i * 10}" cy="${85 - Math.sin((i / 8) * Math.PI) * 4}" r="6" fill="#E09A34"/>`).join("") +
      `<ellipse cx="44" cy="44" rx="12" ry="5" fill="#fff" opacity=".25" transform="rotate(-20 44 44)"/>` + face(60, 62, 0.9) +
      `<circle cx="100" cy="102" r="13" fill="#7BBF3A"/><circle cx="100" cy="102" r="10" fill="#D9F7A8"/><path d="M100 92V112M90 102H110M93 95L107 109M107 95L93 109" stroke="#B5E07A" stroke-width="1.5"/>`,
  },
  {
    k: "tinto", n: "Tinto",
    svg: bg("tinto", "#E9D8C4", "#7A4B2A") +
      `<path d="M46 30Q40 22 46 12M60 32Q54 22 60 10M74 30Q68 22 74 12" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>` +
      `<ellipse cx="60" cy="104" rx="46" ry="8" fill="#F4E9DC"/>` +
      `<path d="M88 52Q106 52 106 66Q106 82 86 82" fill="none" stroke="#fff" stroke-width="8"/>` +
      `<path d="M24 42H92V70Q92 100 58 100Q24 100 24 70Z" fill="#fff"/><ellipse cx="58" cy="43" rx="34" ry="6" fill="#6B3E1F"/>` + face(58, 70, 0.85),
  },
  {
    k: "aguacate", n: "Aguacate",
    svg: bg("aguacate", "#E3F7C2", "#4C9A2A") +
      `<path d="M60 10C76 10 82 28 88 46C96 70 94 110 60 110C26 110 24 70 32 46C38 28 44 10 60 10Z" fill="#2F6E2A"/>` +
      `<path d="M60 18C72 18 77 32 82 48C89 70 86 102 60 102C34 102 31 70 38 48C43 32 48 18 60 18Z" fill="#CDEB8B"/>` +
      `<circle cx="60" cy="76" r="17" fill="#9A5B2E"/><circle cx="54" cy="70" r="4.5" fill="#fff" opacity=".3"/>` + face(60, 44, 0.62),
  },
  {
    k: "mango", n: "Mango",
    svg: bg("mango", "#FFE5A8", "#F08A24") +
      `<path d="M62 28Q72 6 94 12Q84 30 62 28Z" fill="#4CAF50"/><path d="M60 30L62 22" stroke="#7A5230" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M28 68C28 38 50 24 72 28C96 32 102 56 92 80C84 100 64 108 48 102C34 96 28 84 28 68Z" fill="#FFB43C"/>` +
      `<ellipse cx="84" cy="56" rx="14" ry="20" fill="#FF7A4E" opacity=".45"/><ellipse cx="44" cy="44" rx="14" ry="9" fill="#9EDB4E" opacity=".6" transform="rotate(-35 44 44)"/>` +
      face(60, 68, 0.88),
  },
  {
    k: "banano", n: "Banano",
    svg: bg("banano", "#D9F2FF", "#3B9FD8") +
      `<path d="M16 38Q22 104 86 102Q108 100 112 80Q86 88 66 76Q40 62 36 34Z" fill="#FFE14D"/>` +
      `<path d="M16 38Q22 104 86 102Q108 100 112 80Q96 96 80 94Q34 88 16 38Z" fill="#F2C200"/>` +
      `<path d="M28 34L34 22L40 34Z" fill="#7A5230"/><circle cx="111" cy="81" r="3" fill="#7A5230"/>` + face(64, 82, 0.6),
  },
  {
    k: "bunuelo", n: "Buñuelo",
    svg: bg("bunuelo", "#FFE7C9", "#C96B2A") +
      `<ellipse cx="60" cy="102" rx="44" ry="8" fill="#fff" opacity=".7"/>` +
      `<circle cx="60" cy="64" r="38" fill="#C8833A"/><circle cx="60" cy="60" r="38" fill="#E3A14E"/>` +
      `<ellipse cx="46" cy="40" rx="13" ry="7" fill="#fff" opacity=".3" transform="rotate(-25 46 40)"/>` +
      [[34, 66], [84, 70], [76, 38], [44, 86], [72, 90]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.2" fill="#B5702E" opacity=".6"/>`).join("") + face(60, 62, 0.92),
  },
  {
    k: "jugo", n: "Jugo natural",
    svg: bg("jugo", "#E6FFD0", "#5CB82E") +
      `<path d="M66 50L82 8" stroke="#FF5C8A" stroke-width="6" stroke-linecap="round"/>` +
      `<path d="M32 28H88L81 106Q80 112 74 112H46Q40 112 39 106Z" fill="#fff" opacity=".9"/>` +
      `<path d="M35 46H85L81 106Q80 112 74 112H46Q40 112 39 106Z" fill="#FFB43C"/>` +
      `<circle cx="88" cy="30" r="13" fill="#9EDB4E"/><circle cx="88" cy="30" r="10" fill="#D9F7A8"/>` + face(60, 76, 0.85),
  },
  {
    k: "fresa", n: "Fresa",
    svg: bg("fresa", "#E3F7D0", "#5FA83A") +
      `<path d="M60 106C34 94 20 66 26 50C32 34 50 32 60 36C70 32 88 34 94 50C100 66 86 94 60 106Z" fill="#F0444F"/>` +
      [[38, 56], [82, 56], [36, 76], [84, 76], [50, 92], [70, 92], [60, 100]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.6" ry="2.6" fill="#FFE38A"/>`).join("") +
      `<path d="M40 38L52 34L50 22L60 30L70 22L68 34L80 38L60 44Z" fill="#3FA34D"/>` + face(60, 66, 0.9),
  },
  {
    k: "patilla", n: "Patilla",
    svg: bg("patilla", "#DFF7E8", "#2E9E6A") +
      `<path d="M10 48H110Q110 106 60 106Q10 106 10 48Z" fill="#3FA34D"/><path d="M16 48H104Q104 100 60 100Q16 100 16 48Z" fill="#E6F7D6"/>` +
      `<path d="M21 48H99Q99 95 60 95Q21 95 21 48Z" fill="#FF5C6C"/>` +
      [[32, 58], [88, 58], [40, 78], [80, 78], [60, 88]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2" ry="3" fill="${INK}"/>`).join("") + face(60, 64, 0.85),
  },
])

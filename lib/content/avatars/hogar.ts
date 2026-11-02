import { INK, bg, face, inCat } from "./kit"

// Hogar y servicios de la casa.
export const HOGAR = inCat("hogar", [
  {
    // Original de la v5 (antes en la lista única): no cambiar la clave.
    k: "casa", n: "Casita",
    svg: bg("casa", "#A6F2EA", "#0E7C74") +
      `<path d="M60 18L104 54H92V104H28V54H16Z" fill="#FFF8EE"/><path d="M60 18L104 54H16Z" fill="#FF8A5B"/>` +
      `<rect x="78" y="24" width="10" height="18" rx="2" fill="#E5703F"/>` +
      `<path d="M50 104V86Q50 78 60 78Q70 78 70 86V104Z" fill="#22BFAE"/>` + face(60, 64, 0.8),
  },
  {
    k: "llave", n: "Llave",
    svg: bg("llave", "#FFF0C2", "#E0A21D") +
      `<g transform="rotate(30 60 60)"><rect x="54" y="52" width="54" height="12" rx="6" fill="#FFC83D"/>` +
      `<rect x="86" y="60" width="7" height="14" rx="2" fill="#FFC83D"/><rect x="98" y="60" width="7" height="18" rx="2" fill="#FFC83D"/>` +
      `<circle cx="40" cy="58" r="25" fill="#E8A814"/><circle cx="40" cy="56" r="25" fill="#FFC83D"/>` + face(40, 58, 0.72) + `</g>` +
      `<circle cx="30" cy="20" r="8" fill="none" stroke="#fff" stroke-width="3" opacity=".8"/>`,
  },
  {
    k: "matera", n: "Matera",
    svg: bg("matera", "#FFE9E0", "#E07A5F") +
      `<ellipse cx="40" cy="44" rx="15" ry="25" fill="#3FA34D" transform="rotate(-35 40 44)"/><ellipse cx="80" cy="44" rx="15" ry="25" fill="#3FA34D" transform="rotate(35 80 44)"/>` +
      `<ellipse cx="60" cy="32" rx="14" ry="24" fill="#4CB86A"/><path d="M60 14V64M40 30L52 60M80 30L68 60" stroke="#2E8B57" stroke-width="2" opacity=".6"/>` +
      `<path d="M34 66H86L80 110H40Z" fill="#F2E6CC"/><rect x="30" y="62" width="60" height="10" rx="5" fill="#E5D3B0"/>` + face(60, 88, 0.8),
  },
  {
    k: "bombillo", n: "Bombillo",
    svg: bg("bombillo", "#3B3F8F", "#1A1F4D") + `<circle cx="60" cy="48" r="44" fill="#FFE38A" opacity=".16"/>` +
      `<path d="M18 22L28 30M102 22L92 30M10 52H22M98 52H110" stroke="#FFE38A" stroke-width="4" stroke-linecap="round" opacity=".8"/>` +
      `<path d="M60 14C80 14 92 30 92 46C92 60 82 66 78 76V84H42V76C38 66 28 60 28 46C28 30 40 14 60 14Z" fill="#FFE14D"/>` +
      `<rect x="43" y="84" width="34" height="8" rx="3" fill="#B5BDCC"/><rect x="45" y="93" width="30" height="8" rx="3" fill="#9AA3B5"/><rect x="52" y="102" width="16" height="7" rx="3" fill="#7C869B"/>` +
      face(60, 46, 0.85),
  },
  {
    k: "gota", n: "Gota de agua",
    svg: bg("gota", "#D6F3FF", "#2F8FD8") +
      `<path d="M60 12C60 12 94 50 94 76C94 94 79 108 60 108C41 108 26 94 26 76C26 50 60 12 60 12Z" fill="#5CC8FF"/>` +
      `<path d="M42 72Q42 58 52 48" stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none" opacity=".6"/>` + face(62, 80, 0.88),
  },
  {
    k: "sofa", n: "Sofá",
    svg: bg("sofa", "#FFE3D0", "#E0703A") +
      `<rect x="22" y="34" width="76" height="44" rx="12" fill="#4F7CFF"/>` +
      `<rect x="10" y="58" width="22" height="40" rx="9" fill="#3E66E0"/><rect x="88" y="58" width="22" height="40" rx="9" fill="#3E66E0"/>` +
      `<rect x="28" y="72" width="64" height="24" rx="8" fill="#6E95FF"/><rect x="18" y="96" width="6" height="10" rx="2" fill="#7A5230"/><rect x="96" y="96" width="6" height="10" rx="2" fill="#7A5230"/>` +
      face(60, 52, 0.8),
  },
  {
    k: "lampara", n: "Lámpara",
    svg: bg("lampara", "#F1E6FF", "#8E5BD9") + `<path d="M30 60H90L106 112H14Z" fill="#FFE38A" opacity=".3"/>` +
      `<rect x="57" y="60" width="6" height="42" fill="#3D4C70"/><ellipse cx="60" cy="104" rx="22" ry="6" fill="#3D4C70"/>` +
      `<path d="M38 18H82L96 62H24Z" fill="#FFC83D"/><path d="M38 18H82L84 24H36Z" fill="#FFE38A"/>` + face(60, 42, 0.75),
  },
  {
    k: "despertador", n: "Despertador",
    svg: bg("despertador", "#DDF7EE", "#2BA37E") +
      `<circle cx="28" cy="26" r="13" fill="#E5484D"/><circle cx="92" cy="26" r="13" fill="#E5484D"/>` +
      `<path d="M34 102L28 112M86 102L92 112" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>` +
      `<circle cx="60" cy="64" r="42" fill="#E5484D"/><circle cx="60" cy="64" r="33" fill="#fff"/>` +
      `<path d="M60 35V41M60 87V93M31 64H37M83 64H89" stroke="${INK}" stroke-width="3" stroke-linecap="round" opacity=".6"/>` +
      `<path d="M60 64V44M60 64L74 72" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><circle cx="60" cy="64" r="4" fill="${INK}"/>`,
  },
  {
    k: "buzon", n: "Buzón",
    svg: bg("buzon", "#E0F2FF", "#3E8FC2") +
      `<rect x="54" y="72" width="12" height="44" fill="#8A5A3A"/>` +
      `<rect x="36" y="18" width="34" height="22" rx="2" fill="#fff" transform="rotate(-12 53 29)"/>` +
      `<path d="M24 42Q24 26 40 26H80Q96 26 96 42V76H24Z" fill="#E5484D"/><rect x="36" y="36" width="30" height="5" rx="2.5" fill="#B83232"/>` +
      `<rect x="94" y="30" width="4" height="26" fill="#3D4C70"/><path d="M98 30H110V42H98Z" fill="#FFC83D"/>` + face(56, 58, 0.78),
  },
])

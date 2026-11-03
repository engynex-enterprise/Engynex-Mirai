import { INK, bg, face, inCat, pixels } from "./kit"

// Gamer: controles y arte de píxeles propio (sin personajes de videojuegos con derechos).
export const GAMER = inCat("gamer", [
  {
    k: "control", n: "Control de juegos",
    svg: bg("control", "#D2BBFF", "#5A2BC2") +
      `<path d="M30 42H90Q108 42 110 64Q112 90 98 92Q88 94 82 80H38Q32 94 22 92Q8 90 10 64Q12 42 30 42Z" fill="#F7F5FF"/>` +
      `<rect x="22" y="58" width="20" height="7" rx="2" fill="#3D4C70"/><rect x="28.5" y="51.5" width="7" height="20" rx="2" fill="#3D4C70"/>` +
      `<circle cx="88" cy="54" r="5" fill="#FF5C8A"/><circle cx="97" cy="63" r="5" fill="#4FC3F7"/><circle cx="79" cy="63" r="5" fill="#9EDB4E"/><circle cx="88" cy="72" r="5" fill="#FFC83D"/>` +
      face(60, 60, 0.55),
  },
  {
    k: "arcade", n: "Palanca arcade",
    svg: bg("arcade", "#C9F2FF", "#1C8FB8") +
      `<path d="M18 80Q18 72 26 72H94Q102 72 102 80V100Q102 108 94 108H26Q18 108 18 100Z" fill="#1F2B4B"/><rect x="18" y="72" width="84" height="8" rx="4" fill="#3D4C70"/>` +
      `<rect x="56" y="40" width="8" height="36" rx="3" fill="#9AA3B5"/><circle cx="60" cy="36" r="17" fill="#E5484D"/>` +
      `<ellipse cx="54" cy="29" rx="5" ry="3" fill="#fff" opacity=".45"/>` + face(60, 38, 0.45) +
      `<circle cx="34" cy="92" r="7" fill="#FFC83D"/><circle cx="86" cy="92" r="7" fill="#4FC3F7"/>`,
  },
  {
    k: "pixel-corazon", n: "Corazón pixel",
    svg: bg("pixel-corazon", "#2D2A5A", "#14123F") +
      pixels([".XX.XX.", "XWXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."], 12, 18, 26, { X: "#FF4D6D", W: "#FFB3C1" }),
  },
  {
    k: "pixel-heroe", n: "Héroe pixel",
    svg: bg("pixel-heroe", "#E6FFF2", "#1FA36A") +
      pixels(["..HHHH..", ".HHHHHH.", ".SSSSSS.", ".SESSES.", ".SSSSSS.", "..BBBB..", ".BBBBBB.", ".L....L."], 11, 16, 16,
        { H: "#4F7CFF", S: "#F5C29A", E: INK, B: "#FFC83D", L: "#1F2B4B" }),
  },
  {
    k: "pixel-gelatina", n: "Gelatina pixel",
    svg: bg("pixel-gelatina", "#FFE9F0", "#C2417A") +
      pixels(["...GG...", "..GWGG..", ".GWGGGG.", "GGEGGEGG", "GGGGGGGG", "GGGMMGGG", ".GGGGGG."], 11, 16, 24,
        { G: "#7BD389", W: "#D6F5C4", E: INK, M: "#1F6F3F" }),
  },
  {
    k: "dado", n: "Dado",
    svg: bg("dado", "#FFE3E3", "#D63B3B") +
      `<path d="M60 16L100 37L60 58L20 37Z" fill="#fff"/><path d="M20 37L60 58V104L20 83Z" fill="#E6E9F2"/><path d="M100 37L60 58V104L100 83Z" fill="#CDD3E3"/>` +
      `<ellipse cx="60" cy="37" rx="6" ry="3.5" fill="#E5484D"/>` +
      `<ellipse cx="32" cy="56" rx="3.5" ry="4.5" fill="${INK}"/><ellipse cx="48" cy="84" rx="3.5" ry="4.5" fill="${INK}"/>` +
      `<ellipse cx="72" cy="88" rx="3.5" ry="4.5" fill="${INK}"/><ellipse cx="80" cy="72" rx="3.5" ry="4.5" fill="${INK}"/><ellipse cx="88" cy="56" rx="3.5" ry="4.5" fill="${INK}"/>`,
  },
  {
    k: "audifonos", n: "Audífonos",
    svg: bg("audifonos", "#E6FFF2", "#1FA36A") +
      `<circle cx="60" cy="64" r="26" fill="#FFD84D"/>` + face(60, 64, 0.75) +
      `<path d="M28 68V56Q28 22 60 22Q92 22 92 56V68" fill="none" stroke="#1F2B4B" stroke-width="8"/>` +
      `<rect x="18" y="56" width="22" height="34" rx="10" fill="#1F2B4B"/><rect x="80" y="56" width="22" height="34" rx="10" fill="#1F2B4B"/>` +
      `<rect x="23" y="62" width="12" height="22" rx="6" fill="#9EDB4E"/><rect x="85" y="62" width="12" height="22" rx="6" fill="#9EDB4E"/>` +
      `<path d="M28 88Q30 104 50 104" fill="none" stroke="#1F2B4B" stroke-width="4"/><circle cx="52" cy="104" r="4.5" fill="#1F2B4B"/>`,
  },
  {
    k: "espada-pixel", n: "Espada pixel",
    svg: bg("espada-pixel", "#E3ECFF", "#5A7BE0") +
      pixels([".......WW", "......WLW", ".....WLW.", "....WLW..", ".G.WLW...", ".GGLW....", "..HG.....", ".H.GG....", "H........"], 10, 15, 15,
        { W: "#F2F4F8", L: "#9AA3B5", G: "#FFC83D", H: "#8A5A3A" }),
  },
  {
    k: "moneda-pixel", n: "Moneda pixel",
    svg: bg("moneda-pixel", "#2D3A5C", "#1F2B4B") +
      pixels(["..OOOO..", ".OYYYYO.", "OYWYYDYO", "OYWYYDYO", "OYWYYDYO", "OYWYYDYO", "OYYYYDYO", ".OYYYYO.", "..OOOO.."], 10, 20, 15,
        { O: "#E8A814", Y: "#FFD84D", W: "#FFF6C8", D: "#C98A0E" }),
  },
  {
    k: "consola", n: "Consola portátil",
    svg: bg("consola", "#E7E2FF", "#5A47C9") +
      `<rect x="30" y="10" width="60" height="100" rx="11" fill="#9EDB4E"/><rect x="36" y="18" width="48" height="40" rx="5" fill="#1F2B4B"/>` +
      `<circle cx="52" cy="36" r="3.6" fill="#B8F28A"/><circle cx="68" cy="36" r="3.6" fill="#B8F28A"/>` +
      `<path d="M54 44Q60 50 66 44" fill="none" stroke="#B8F28A" stroke-width="2.8" stroke-linecap="round"/>` +
      `<rect x="38" y="74" width="18" height="6" rx="2" fill="#2E6E1E"/><rect x="44" y="68" width="6" height="18" rx="2" fill="#2E6E1E"/>` +
      `<circle cx="70" cy="80" r="5" fill="#E5484D"/><circle cx="80" cy="72" r="5" fill="#E5484D"/>` +
      `<path d="M66 98L72 94M72 100L78 96" stroke="#2E6E1E" stroke-width="2.5" stroke-linecap="round"/>`,
  },
])

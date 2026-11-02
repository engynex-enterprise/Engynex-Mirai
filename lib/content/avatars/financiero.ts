import { bg, coin, face, inCat, sparkle } from "./kit"

/** Lingote de oro (trapecio con cara superior clara). */
const bar = (x: number, y: number) =>
  `<path d="M${x} ${y + 22}L${x + 8} ${y}H${x + 42}L${x + 50} ${y + 22}Z" fill="#FFC83D"/><path d="M${x + 8} ${y}H${x + 42}L${x + 38} ${y + 6}H${x + 12}Z" fill="#FFE38A"/>` +
  `<path d="M${x} ${y + 22}H${x + 50}" stroke="#E8A814" stroke-width="3"/>`

/** Pila de monedas vista de lado. */
const stack = (x: number, n: number) =>
  Array.from({ length: n }, (_, i) => `<ellipse cx="${x}" cy="${104 - i * 7 + 3}" rx="15" ry="5.5" fill="#C98A0E"/><ellipse cx="${x}" cy="${104 - i * 7}" rx="15" ry="5.5" fill="#FFD15C"/>`).join("")

export const FINANCIERO = inCat("financiero", [
  // ——— 9 de los 10 originales ("casa" está en Hogar). No cambiar sus claves: hay perfiles guardados con "mirai:<clave>" ———
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
  // ——— Nuevos ———
  {
    k: "billetera", n: "Billetera",
    svg: bg("billetera", "#FFD9B0", "#C8682A") +
      `<rect x="30" y="22" width="58" height="34" rx="5" fill="#B6F2CF" transform="rotate(-8 59 39)"/><circle cx="58" cy="38" r="7" fill="#7FD6A3"/>` +
      `<rect x="16" y="42" width="88" height="62" rx="13" fill="#A65A30"/><rect x="16" y="42" width="88" height="10" rx="5" fill="#8A4B2A"/>` +
      `<rect x="74" y="62" width="34" height="24" rx="9" fill="#7A3F1F"/><circle cx="88" cy="74" r="4.5" fill="#FFC83D"/>` + face(46, 72, 0.85),
  },
  {
    k: "cofre", n: "Cofre del tesoro",
    svg: bg("cofre", "#FFE3A3", "#B5651D") + coin(42, 34, 9) + coin(60, 28, 10) + coin(78, 34, 9) +
      `<path d="M18 58Q18 36 60 36Q102 36 102 58Z" fill="#9C5A2B"/><rect x="18" y="56" width="84" height="50" rx="7" fill="#B86B33"/>` +
      `<rect x="18" y="56" width="84" height="7" fill="#FFC83D"/><rect x="28" y="38" width="7" height="68" fill="#E8A814"/><rect x="85" y="38" width="7" height="68" fill="#E8A814"/>` +
      `<rect x="52" y="58" width="16" height="16" rx="4" fill="#FFD15C"/><circle cx="60" cy="66" r="2.6" fill="#8A4B2A"/>` + face(60, 88, 0.72),
  },
  {
    k: "lingote", n: "Lingote de oro",
    svg: bg("lingote", "#FFF0B8", "#D4931A") + bar(8, 84) + bar(62, 84) + bar(35, 60) + face(60, 74, 0.55) +
      sparkle(96, 30, 1.1) + sparkle(24, 40, 0.7),
  },
  {
    k: "sobre", n: "Sobre de ahorro",
    svg: bg("sobre", "#C7F3EA", "#1E9C8A") +
      `<rect x="34" y="20" width="52" height="40" rx="5" fill="#B6F2CF"/><circle cx="60" cy="36" r="8" fill="#7FD6A3"/>` +
      `<rect x="16" y="46" width="88" height="58" rx="9" fill="#FFF6EC"/>` +
      `<path d="M16 54L60 76L104 54V96Q104 104 96 104H24Q16 104 16 96Z" fill="#FFE4CC"/>` +
      `<path d="M16 54L60 76L104 54" fill="none" stroke="#F2C9A6" stroke-width="3" stroke-linejoin="round"/>` + face(60, 88, 0.7),
  },
  {
    k: "recibo", n: "Recibo",
    svg: bg("recibo", "#D7E3FF", "#4A5FD0") +
      `<path d="M30 12H90V104L82.5 98L75 104L67.5 98L60 104L52.5 98L45 104L37.5 98L30 104Z" fill="#fff"/>` +
      `<rect x="40" y="58" width="40" height="5" rx="2.5" fill="#C9D3F5"/><rect x="40" y="69" width="26" height="5" rx="2.5" fill="#C9D3F5"/>` +
      `<rect x="40" y="80" width="18" height="5" rx="2.5" fill="#C9D3F5"/>` + coin(76, 83, 7) + face(60, 34, 0.75),
  },
  {
    k: "balanza", n: "Balanza",
    svg: bg("balanza", "#E2F7C9", "#3F7A1E") +
      `<rect x="57" y="34" width="6" height="62" rx="3" fill="#fff"/><rect x="36" y="92" width="48" height="11" rx="5.5" fill="#fff"/>` +
      `<rect x="18" y="34" width="84" height="6" rx="3" fill="#fff"/>` +
      `<path d="M24 40L14 66M24 40L34 66M96 40L86 66M96 40L106 66" stroke="#fff" stroke-width="2" opacity=".8"/>` +
      `<path d="M8 66H40Q38 80 24 80Q10 80 8 66Z" fill="#FFC83D"/><path d="M80 66H112Q110 80 96 80Q82 80 80 66Z" fill="#FFC83D"/>` +
      coin(18, 61, 5) + coin(29, 61, 5) + coin(24, 53, 5) + coin(96, 61, 5) + coin(91, 53, 4) +
      `<circle cx="60" cy="30" r="13" fill="#9EDB4E"/>` + face(60, 30, 0.45),
  },
  {
    k: "diana", n: "Meta cumplida",
    svg: bg("diana", "#FFD6D6", "#D63B3B") +
      `<circle cx="56" cy="64" r="44" fill="#fff"/><circle cx="56" cy="64" r="34" fill="#FF6B6B"/><circle cx="56" cy="64" r="23" fill="#fff"/>` +
      `<path d="M74 46L100 20" stroke="#1F2B4B" stroke-width="4" stroke-linecap="round"/><path d="M96 14L106 12L104 22L98 26L94 18Z" fill="#FFC83D"/>` +
      `<circle cx="74" cy="46" r="3" fill="#1F2B4B"/>` + face(56, 64, 0.62),
  },
  {
    k: "candado", n: "CDT seguro",
    svg: bg("candado", "#CDE9FF", "#2D4C8F") +
      `<path d="M40 58V42Q40 20 60 20Q80 20 80 42V58" fill="none" stroke="#DCE4F2" stroke-width="10"/>` +
      `<rect x="26" y="52" width="68" height="56" rx="13" fill="#FFC83D"/><rect x="26" y="52" width="68" height="9" rx="4.5" fill="#FFE38A"/>` +
      face(60, 78, 0.85) + sparkle(98, 26, 0.9),
  },
  {
    k: "banco", n: "Banco",
    svg: bg("banco", "#D9F0FF", "#2B6CB0") +
      `<path d="M60 14L106 40H14Z" fill="#fff"/><circle cx="60" cy="30" r="5" fill="#FFC83D"/><rect x="18" y="40" width="84" height="6" fill="#E4F0FF"/>` +
      `<rect x="22" y="48" width="9" height="40" rx="2" fill="#fff"/><rect x="36" y="48" width="9" height="40" rx="2" fill="#fff"/>` +
      `<rect x="75" y="48" width="9" height="40" rx="2" fill="#fff"/><rect x="89" y="48" width="9" height="40" rx="2" fill="#fff"/>` +
      `<rect x="48" y="48" width="24" height="40" rx="4" fill="#FFF8E0"/><rect x="14" y="88" width="92" height="12" rx="4" fill="#fff"/>` +
      face(60, 64, 0.55),
  },
  {
    k: "bolsa", n: "Bolsa de dinero",
    svg: bg("bolsa", "#E8F8D0", "#5C9E2E") +
      `<path d="M44 34L50 20L60 28L70 20L76 34Q60 42 44 34Z" fill="#E9D3A6"/>` +
      `<path d="M48 44Q16 62 20 88Q22 108 60 108Q98 108 100 88Q104 62 72 44Z" fill="#E9D3A6"/>` +
      `<rect x="44" y="38" width="32" height="8" rx="4" fill="#B07A3C"/>` + face(60, 78, 0.85) + coin(98, 98, 10),
  },
  {
    k: "monedas", n: "Pila de monedas",
    svg: bg("monedas", "#FFF3C4", "#E08A00") + stack(28, 6) + stack(56, 9) +
      `<circle cx="88" cy="84" r="22" fill="#E8A814"/><circle cx="88" cy="81" r="22" fill="#FFD15C"/><circle cx="88" cy="81" r="16" fill="none" stroke="#FFEFB0" stroke-width="3.5"/>` +
      face(88, 80, 0.6) + sparkle(98, 30, 0.9),
  },
])

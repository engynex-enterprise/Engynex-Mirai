import { INK, bg, face, inCat } from "./kit"

// Personas en ilustración plana: tonos de piel, peinados, edades y accesorios variados.
// Cabeza: elipse centrada en (60, 54), rx 23, ry 26. Todo lo demás se ubica alrededor.

type Hair = "corto" | "raya" | "afro" | "largo" | "bob" | "trenzas" | "colitas" | "mono" | "rizos" | "calvo" | "canas" | "rapado" | "rulito"
type Extra = "gafas" | "barba" | "aretes" | "pecas" | "arrugas" | "lazo"
type Persona = {
  k: string; n: string; a: string; b: string; skin: string; shirt: string
  hair?: Hair; hc?: string; extras?: Extra[]; hijab?: string; gorra?: string; scale?: number
}

const HEAD = `cx="60" cy="54" rx="23" ry="26"`

const hairBack = (h: Hair | undefined, c = "#2B1B14") => {
  switch (h) {
    case "afro":
      return `<circle cx="60" cy="46" r="33" fill="${c}"/>` +
        [[32, 40, 11], [88, 40, 11], [42, 20, 12], [78, 20, 12], [60, 14, 13], [30, 58, 9], [90, 58, 9]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`).join("")
    case "largo":
      return `<path d="M31 58C28 28 44 20 60 20C76 20 92 28 89 58L94 100Q60 108 26 100Z" fill="${c}"/>`
    case "bob":
      return `<path d="M33 62C30 30 44 22 60 22C76 22 90 30 87 62L89 82Q60 88 31 82Z" fill="${c}"/>`
    case "trenzas":
      return `<path d="M33 58C30 28 44 22 60 22C76 22 90 28 87 58L90 96Q60 102 30 96Z" fill="${c}"/>`
    case "colitas":
      return `<circle cx="29" cy="42" r="12" fill="${c}"/><circle cx="91" cy="42" r="12" fill="${c}"/>` +
        `<circle cx="37" cy="38" r="3.5" fill="#FFC83D"/><circle cx="83" cy="38" r="3.5" fill="#FFC83D"/>`
    case "mono":
      return `<circle cx="60" cy="22" r="12" fill="${c}"/>`
    default:
      return ""
  }
}

const hairFront = (h: Hair | undefined, c = "#2B1B14") => {
  switch (h) {
    case "corto": case "colitas":
      return `<path d="M36 52C35 30 46 23 60 23C74 23 85 30 84 52C80 42 72 36 60 37C50 37 41 42 36 52Z" fill="${c}"/>`
    case "raya":
      return `<path d="M36 54C34 28 50 20 66 24C80 27 86 38 84 54C82 44 78 40 72 37C62 44 46 42 36 54Z" fill="${c}"/>`
    case "afro":
      return `<path d="M37 50C38 36 48 31 60 31C72 31 82 36 83 50C78 44 70 41 60 41C50 41 42 44 37 50Z" fill="${c}"/>`
    case "largo":
      return `<path d="M36 56C36 30 46 24 60 24C74 24 84 30 84 56C78 40 66 34 52 38C46 42 40 46 36 56Z" fill="${c}"/>`
    case "bob":
      return `<path d="M37 48C37 30 47 25 60 25C73 25 83 30 83 48Q72 42 60 42Q48 42 37 48Z" fill="${c}"/>`
    case "trenzas":
      return `<path d="M36 54C35 30 46 24 60 24C74 24 85 30 84 54C80 40 70 34 60 34C50 34 40 40 36 54Z" fill="${c}"/>` +
        [36, 84].map((x) => Array.from({ length: 5 }, (_, i) => `<ellipse cx="${x}" cy="${66 + i * 9}" rx="6" ry="5.5" fill="${c}"/>`).join("")).join("")
    case "mono":
      return `<path d="M36 52C35 30 46 25 60 25C74 25 85 30 84 52C80 40 70 35 60 35C50 35 40 40 36 52Z" fill="${c}"/>`
    case "rizos":
      return `<path d="M36 52C35 32 46 26 60 26C74 26 85 32 84 52C80 44 72 40 60 40C48 40 40 44 36 52Z" fill="${c}"/>` +
        [[40, 38, 9], [48, 30, 10], [60, 27, 11], [72, 30, 10], [80, 38, 9], [36, 48, 6], [84, 48, 6]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>`).join("")
    case "canas":
      return `<path d="M36 60C33 46 36 38 44 36C40 44 40 52 42 62Z M84 60C87 46 84 38 76 36C80 44 80 52 78 62Z" fill="${c}"/>` +
        `<ellipse cx="52" cy="34" rx="6" ry="3" fill="#fff" opacity=".25"/>`
    case "rapado":
      return `<path d="M37 48C38 31 48 27 60 27C72 27 82 31 83 48C78 40 70 37 60 37C50 37 42 40 37 48Z" fill="${c}" opacity=".9"/>`
    case "calvo":
      return `<ellipse cx="52" cy="35" rx="7" ry="3.5" fill="#fff" opacity=".28"/>`
    case "rulito":
      return `<path d="M58 30Q56 20 64 21Q70 23 66 28" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"/>`
    default:
      return ""
  }
}

const extra = (e: Extra, hc = "#2B1B14") => {
  switch (e) {
    case "gafas":
      return `<g fill="none" stroke="${INK}" stroke-width="2.6"><circle cx="51.5" cy="58" r="7"/><circle cx="68.5" cy="58" r="7"/><path d="M58.5 58H61.5M44.5 57L38 55M75.5 57L82 55"/></g>`
    case "barba":
      return `<path d="M37 56C37 78 48 86 60 86C72 86 83 78 83 56C80 66 74 70 68 70Q60 66 52 70C46 70 40 66 37 56Z" fill="${hc}"/>`
    case "aretes":
      return `<circle cx="37" cy="66" r="2.8" fill="#FFC83D"/><circle cx="83" cy="66" r="2.8" fill="#FFC83D"/>`
    case "pecas":
      return [[46, 64], [50, 66], [43, 66], [74, 64], [70, 66], [77, 66]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1" fill="#A0522D" opacity=".55"/>`).join("")
    case "arrugas":
      return `<path d="M41 52l-3-2M79 52l3-2M42 56l-3 0M78 56l3 0" stroke="${INK}" stroke-width="1.4" stroke-linecap="round" opacity=".35"/>`
    case "lazo":
      return `<path d="M76 30L86 23V37Z M76 30L66 23V37Z" fill="#FF5C8A"/><circle cx="76" cy="30" r="3.2" fill="#E0466F"/>`
  }
}

const person = (p: Persona) => {
  const body =
    `<path d="M16 120Q18 90 60 88Q102 90 104 120Z" fill="${p.shirt}"/>` +
    (p.hijab
      ? `<path d="M26 120Q22 84 30 62Q30 22 60 20Q90 22 90 62Q98 84 94 120Z" fill="${p.hijab}"/>` +
        `<path d="M36 50Q38 26 60 25Q82 26 84 50" fill="none" stroke="#fff" stroke-width="3" opacity=".25"/>` +
        `<ellipse cx="60" cy="57" rx="19" ry="22" fill="${p.skin}"/>`
      : hairBack(p.hair, p.hc) +
        `<rect x="51" y="70" width="18" height="22" rx="7" fill="${p.skin}"/><path d="M51 76H69V82Q60 88 51 82Z" fill="#000" opacity=".1"/>` +
        `<circle cx="37" cy="58" r="6" fill="${p.skin}"/><circle cx="83" cy="58" r="6" fill="${p.skin}"/>` +
        `<ellipse ${HEAD} fill="${p.skin}"/>` + hairFront(p.hair, p.hc)) +
    face(60, 58, 0.72) +
    (p.extras ?? []).map((e) => extra(e, p.hc)).join("") +
    (p.gorra
      ? `<path d="M35 46C35 27 46 21 60 21C74 21 85 27 85 46Z" fill="${p.gorra}"/><ellipse cx="60" cy="46" rx="30" ry="5.5" fill="${p.gorra}"/>` +
        `<ellipse cx="60" cy="47" rx="30" ry="5.5" fill="#000" opacity=".15"/><circle cx="60" cy="21" r="3" fill="#fff" opacity=".6"/>`
      : "")
  const s = p.scale ?? 1
  return bg(p.k, p.a, p.b) + (s === 1 ? body : `<g transform="translate(60 120) scale(${s}) translate(-60 -120)">${body}</g>`)
}

const PERSONAS: Persona[] = [
  { k: "persona-afro", n: "Mujer con afro", a: "#FFE3B0", b: "#E68A2E", skin: "#8D5A3B", hair: "afro", hc: "#2B1B14", shirt: "#FFC83D", extras: ["aretes"] },
  { k: "persona-trenzas", n: "Mujer con trenzas", a: "#DFF7C8", b: "#3F7A1E", skin: "#6E4529", hair: "trenzas", hc: "#1E1410", shirt: "#9EDB4E" },
  { k: "persona-liso", n: "Mujer de pelo liso", a: "#D6E4FF", b: "#3E5FD9", skin: "#F5C9A8", hair: "largo", hc: "#3B2A20", shirt: "#5B8CFF" },
  { k: "persona-bob", n: "Mujer con gafas", a: "#FFD9E1", b: "#D9456B", skin: "#E0A47A", hair: "bob", hc: "#1F1A17", shirt: "#FF7A8E", extras: ["gafas"] },
  { k: "persona-hiyab", n: "Mujer con hiyab", a: "#FFE9D6", b: "#E07A5F", skin: "#C68457", shirt: "#1F6F5F", hijab: "#2FA58C" },
  { k: "persona-pelirroja", n: "Mujer pelirroja", a: "#EDE4FF", b: "#7552E0", skin: "#FFDCC2", hair: "mono", hc: "#C8642A", shirt: "#8B6CF0", extras: ["pecas"] },
  { k: "persona-canas", n: "Mujer de canas", a: "#FFEFD0", b: "#E08A00", skin: "#6E4529", hair: "rizos", hc: "#E9E6E1", shirt: "#22BFAE", extras: ["aretes"] },
  { k: "persona-barba", n: "Hombre con barba", a: "#D7E9FF", b: "#2F6DB5", skin: "#C68457", hair: "raya", hc: "#2A1C14", shirt: "#1F2B4B", extras: ["barba"] },
  { k: "persona-rizos", n: "Hombre de pelo crespo", a: "#FFE6C2", b: "#E0752A", skin: "#9A6440", hair: "rizos", hc: "#1E1410", shirt: "#FF9F1C" },
  { k: "persona-calvo", n: "Hombre calvo", a: "#DDF5D0", b: "#4C9A3A", skin: "#E8B48C", hair: "calvo", hc: "#6B4A33", shirt: "#3FA34D", extras: ["barba"] },
  { k: "persona-gorra", n: "Joven con gorra", a: "#D8F3FF", b: "#1F95C9", skin: "#F2C29A", hair: "corto", hc: "#4A3020", shirt: "#2D3A5C", gorra: "#E5484D" },
  { k: "persona-rapado", n: "Hombre con gafas", a: "#E7E2FF", b: "#5A47C9", skin: "#5A3825", hair: "rapado", hc: "#16100C", shirt: "#9EDB4E", extras: ["gafas"] },
  { k: "abuela", n: "Abuela", a: "#F7E3FF", b: "#A24CC9", skin: "#F5C9A8", hair: "mono", hc: "#D9D9DE", shirt: "#C26BE0", extras: ["gafas", "arrugas", "aretes"] },
  { k: "abuelo", n: "Abuelo", a: "#FFF0D6", b: "#C98A2E", skin: "#B87A52", hair: "canas", hc: "#E6E6EA", shirt: "#7A5230", extras: ["barba", "gafas", "arrugas"] },
  { k: "nina", n: "Niña con colitas", a: "#FFE0EC", b: "#E0457B", skin: "#D99A6C", hair: "colitas", hc: "#3A2418", shirt: "#FF5C8A", extras: ["lazo"], scale: 0.9 },
  { k: "nino", n: "Niño con pecas", a: "#DCEBFF", b: "#4F7CFF", skin: "#FFDCC2", hair: "corto", hc: "#D9A441", shirt: "#FFC83D", extras: ["pecas"], scale: 0.9 },
  { k: "bebe", n: "Bebé", a: "#E0FFF5", b: "#22BFAE", skin: "#8D5A3B", hair: "rulito", hc: "#2B1B14", shirt: "#7CF2C8", scale: 0.84 },
]

export const PERSONAS_AV = inCat("personas", PERSONAS.map((p) => ({ k: p.k, n: p.n, svg: person(p) })))

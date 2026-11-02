import { bg, inCat } from "./kit"

// Formas geométricas, degradados y patrones (sin cara).
const PAL = ["#9EDB4E", "#FFC83D", "#FF7E9A", "#4FC3F7", "#1F2B4B"]

const mosaico = () =>
  Array.from({ length: 16 }, (_, i) => {
    const x = (i % 4) * 30, y = Math.floor(i / 4) * 30
    const a = PAL[(i * 3) % 5], b = PAL[(i * 3 + 2) % 5]
    return `<rect x="${x}" y="${y}" width="30" height="30" fill="${a}"/>` +
      `<path d="M${x} ${y}H${x + 30}A30 30 0 0 1 ${x} ${y + 30}Z" fill="${b}" transform="rotate(${(i * 90) % 360} ${x + 15} ${y + 15})"/>`
  }).join("")

const triangulos = () =>
  Array.from({ length: 4 }, (_, r) =>
    Array.from({ length: 9 }, (_, c) => {
      const x = c * 15 - 15, y = r * 30, up = (c + r) % 2 === 0
      const o = [0.12, 0.3, 0.5, 0.2, 0.4][(c * 7 + r * 3) % 5]
      const d = up ? `M${x} ${y + 30}L${x + 15} ${y}L${x + 30} ${y + 30}Z` : `M${x} ${y}L${x + 30} ${y}L${x + 15} ${y + 30}Z`
      return `<path d="${d}" fill="#fff" opacity="${o}"/>`
    }).join(""),
  ).join("")

const puntos = () =>
  Array.from({ length: 49 }, (_, i) => {
    const cx = 15 + (i % 7) * 15, cy = 15 + Math.floor(i / 7) * 15
    const d = Math.hypot(cx - 60, cy - 60)
    return `<circle cx="${cx}" cy="${cy}" r="${Math.max(1.2, Math.round((6.4 - d / 11) * 10) / 10)}" fill="#9EDB4E"/>`
  }).join("")

export const ABSTRACTO = inCat("abstracto", [
  {
    k: "ondas", n: "Ondas",
    svg: bg("ondas", "#8FD3FF", "#3A4FD9") + `<circle cx="84" cy="36" r="14" fill="#FFD84D"/>` +
      [70, 84, 98].map((y, i) => `<path d="M0 ${y}Q15 ${y - 12} 30 ${y}T60 ${y}T90 ${y}T120 ${y}V120H0Z" fill="#fff" opacity="${0.22 + i * 0.14}"/>`).join(""),
  },
  {
    k: "circulos", n: "Círculos",
    svg: bg("circulos", "#FFD6A8", "#E5572F") +
      [46, 35, 24].map((r, i) => `<circle cx="60" cy="60" r="${r}" fill="none" stroke="#fff" stroke-width="6" opacity="${0.35 + i * 0.2}"/>`).join("") +
      `<circle cx="60" cy="60" r="11" fill="#fff"/>`,
  },
  { k: "mosaico", n: "Mosaico", svg: bg("mosaico", "#FFFFFF", "#DDDDDD") + mosaico() },
  { k: "triangulos", n: "Triángulos", svg: bg("triangulos", "#C9F5E4", "#14967A") + triangulos() },
  {
    k: "anillos", n: "Anillos",
    svg: bg("anillos", "#2D3A5C", "#0E1630") +
      `<circle cx="46" cy="50" r="24" fill="none" stroke="#9EDB4E" stroke-width="10" opacity=".9"/>` +
      `<circle cx="74" cy="50" r="24" fill="none" stroke="#4FC3F7" stroke-width="10" opacity=".9"/>` +
      `<circle cx="60" cy="74" r="24" fill="none" stroke="#FF7EB0" stroke-width="10" opacity=".9"/>`,
  },
  {
    k: "atardecer", n: "Atardecer",
    svg: bg("atardecer", "#FFB86B", "#B83280") + `<circle cx="60" cy="70" r="32" fill="#FFE38A"/>` +
      `<rect x="20" y="72" width="80" height="3" fill="#E9789A"/><rect x="20" y="80" width="80" height="4" fill="#E9789A"/><rect x="20" y="89" width="80" height="5" fill="#E9789A"/>` +
      `<rect x="0" y="98" width="120" height="22" fill="#7A2A68"/><path d="M0 98H120" stroke="#FFB86B" stroke-width="2" opacity=".6"/>`,
  },
  {
    k: "burbujas", n: "Burbujas",
    svg: bg("burbujas", "#D2BBFF", "#5A2BC2") +
      [[34, 40, 16], [78, 30, 10], [86, 76, 22], [44, 88, 12], [60, 58, 6], [20, 72, 7], [102, 106, 8]]
        .map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${[0.25, 0.45, 0.3, 0.55, 0.7, 0.4, 0.5][i]}"/><circle cx="${x - r * 0.35}" cy="${y - r * 0.35}" r="${r * 0.22}" fill="#fff" opacity=".7"/>`).join(""),
  },
  {
    k: "rayas", n: "Rayas",
    svg: bg("rayas", "#FFE38A", "#F29B1D") +
      Array.from({ length: 13 }, (_, i) => `<path d="M${i * 20 - 120} 0L${i * 20} 120" stroke="#fff" stroke-width="7" opacity=".35"/>`).join(""),
  },
  {
    k: "flor-geo", n: "Flor geométrica",
    svg: bg("flor-geo", "#A6F2EA", "#0E7C74") +
      Array.from({ length: 12 }, (_, i) => `<ellipse cx="60" cy="36" rx="11" ry="24" fill="#fff" opacity=".3" transform="rotate(${i * 30} 60 60)"/>`).join("") +
      `<circle cx="60" cy="60" r="11" fill="#FFD84D"/>`,
  },
  {
    k: "prisma", n: "Prisma",
    svg: bg("prisma", "#EFE6FF", "#8B6CF0") +
      ["#FF6B6B", "#FFC83D", "#9EDB4E", "#4FC3F7"].map((c, i) => `<path d="M80 62L120 ${44 + i * 10}V${52 + i * 10}Z" fill="${c}"/>`).join("") +
      `<path d="M0 70L44 60" stroke="#fff" stroke-width="4" opacity=".8"/>` +
      `<path d="M58 18L100 94H16Z" fill="#fff" opacity=".9"/><path d="M58 18L58 94H16Z" fill="#C9B8FF" opacity=".6"/><path d="M58 18L100 94H58Z" fill="#A6D8FF" opacity=".55"/>`,
  },
  { k: "puntos", n: "Puntos", svg: bg("puntos", "#2D3A5C", "#1F2B4B") + puntos() },
])

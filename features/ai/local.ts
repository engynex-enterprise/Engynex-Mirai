// Respaldos sin IA y utilidades puras (localCatGuess y nitDV de la v4).
import { norm } from "@/lib/domain"

const GUESS: [RegExp, string, string, "n" | "g" | "a"][] = [
  [/mascota|perro|gato|veterin/, "Mascotas", "paw-print", "n"], [/gym|gimnas|deporte|futbol/, "Deporte", "dumbbell", "g"],
  [/regalo|cumple/, "Regalos", "gift", "g"], [/viaje|hotel|vuelo|tiquete/, "Viajes", "plane", "g"],
  [/belleza|pelu|barber|unas/, "Cuidado personal", "sparkles", "g"], [/bebe|panal|ninos|hijos/, "Hijos", "baby", "n"],
  [/donac|iglesia|diezmo/, "Donaciones", "heart", "g"], [/impuesto|predial|dian/, "Impuestos", "landmark", "n"],
  [/celular|plan movil|telefon/, "Telefonía", "smartphone", "n"], [/moto|carro|taller|mecanic/, "Vehículo", "car", "n"],
]

/** Sugerencia de categoría sin IA. */
export function localCatGuess(desc: string, nombre: string) {
  const t = norm(`${desc} ${nombre}`)
  const hit = GUESS.find(([re]) => re.test(t))
  if (hit) return { nombre: hit[1], icon: hit[2], grupo: hit[3], tope: 0 }
  const n = nombre.trim() || desc.trim().split(/\s+/).slice(0, 2).join(" ")
  return { nombre: n.charAt(0).toUpperCase() + n.slice(1), icon: "tag", grupo: "g" as const, tope: 0 }
}

/** Dígito de verificación DIAN de un NIT. */
export function nitDV(nit: string) {
  const W = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71]
  const d = nit.replace(/\D/g, "").split("").reverse()
  const r = d.reduce((a, c, i) => a + +c * (W[i] ?? 0), 0) % 11
  return r > 1 ? 11 - r : r
}
export const NIT_RE = /^\d[\d.\s-]{5,}$/

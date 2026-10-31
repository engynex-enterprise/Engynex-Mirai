import HELP_RAW from "@/lib/data/legacy-help.json"
import MDESC_RAW from "@/lib/data/legacy-mdesc.json"
import FHELP_RAW from "@/lib/data/legacy-fhelp.json"

/** Ayuda "Cómo funciona" por sección: título, introducción, pasos y consejos (textos literales de la v4). */
export type HelpEntry = { t: string; i: string; p: string[]; tips?: string[] }
export const HELP = HELP_RAW as Record<string, HelpEntry>

/** Descripción de cada ventana/modal. */
export const MDESC = MDESC_RAW as Record<string, string>

const FHELP = FHELP_RAW as Record<string, string>
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[*:?¿()]/g, "").trim()
const FHELP_N = Object.fromEntries(Object.entries(FHELP).map(([k, v]) => [norm(k), v]))

/** Ayuda de un campo por su etiqueta (igual que la búsqueda de FHELP en la v4). */
export function fieldHelp(label: string): string | undefined {
  const n = norm(label)
  return FHELP_N[n] ?? Object.entries(FHELP_N).find(([k]) => n.startsWith(k) || k.startsWith(n))?.[1]
}

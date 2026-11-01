import HELP_RAW from "@/lib/data/legacy-help.json"
import MDESC_RAW from "@/lib/data/legacy-mdesc.json"
import FHELP_RAW from "@/lib/data/legacy-fhelp.json"

/** Ayuda "Cómo funciona" por sección: título, introducción, pasos y consejos (textos literales de la v4). */
export type HelpEntry = { t: string; i: string; p: string[]; tips?: string[] }
export const HELP: Record<string, HelpEntry> = {
  ...(HELP_RAW as Record<string, HelpEntry>),
  opiniones: {
    t: "Tu opinión", i: "Aquí nos cuentas qué piensas de Mirai y ves qué pasó con lo que nos enviaste.",
    p: ["Toca <b>Enviar una opinión</b> y elige el tema: calificar, algo que no funciona, una función que quieres, una sugerencia o una duda.", "Si es un error, adjunta una captura de pantalla: nos ayuda a encontrarlo más rápido.", "Cada opinión muestra su estado (<b>Recibido</b>, <b>En revisión</b>, <b>Planeado</b>, <b>Listo</b>) y nuestra respuesta. Te llega un aviso cuando respondemos."],
    tips: ["Nunca enviamos tus montos ni tus datos financieros: solo lo que escribes, la página donde estabas y tu tipo de pantalla."],
  },
  planes: {
    t: "Planes de Mirai", i: "Lo básico es gratis para siempre. Premium agrega lo que más tiempo te ahorra.",
    p: ["<b>Gratis</b>: gastos, ingresos, quincena, presupuesto, préstamos, metas, avisos y más, con anuncios.", "<b>Premium</b>: inteligencia artificial, automatización con tu banco, impuestos y contador, y toda la familia con varios libros. Sin anuncios.", "Paga con tarjeta (se renueva sola y la cancelas cuando quieras) o con Nequi, PSE o Bancolombia por un mes o un año."],
    tips: ["El plan es del hogar: si el dueño paga, todos los integrantes tienen Premium.", "Si vuelves a Gratis no se borra nada."],
  },
  admin: {
    t: "Panel de administración", i: "Solo lo ves tú como dueño de Mirai: cómo va la plataforma y qué opinan las personas.",
    p: ["<b>Resumen</b>: personas registradas, activas, hogares, uso por día y lo más usado.", "<b>Clientes</b>: cada cuenta con su hogar, plan, último ingreso y actividad; descárgalo en CSV.", "<b>Opiniones</b>: calificaciones, errores e ideas. Cambia el estado y responde; la persona recibe un aviso."],
  },
}

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

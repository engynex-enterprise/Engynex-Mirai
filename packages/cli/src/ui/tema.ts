// El lenguaje visual de la consola en la terminal. Paleta Engynex con una escala de grises propia, para que
// se vea como una herramienta hecha (lazygit, k9s) y no como una salida de consola cualquiera.
import type { Estado } from "../datos/tipos.ts"

export const C = {
  // Marca
  navy: "#1F2B4B",
  lima: "#9EDB4E",
  verde: "#3F7A1E",
  // Escala de grises: del texto principal al borde casi invisible.
  texto: "#E8ECF3",
  suave: "#A8B2C4",
  tenue: "#6B7689",
  borde: "#2A3350",
  // Estados
  ok: "#7BC96F",
  aviso: "#E0A33A",
  error: "#EF6A6E",
  apagado: "#5A6478",
}

export let sinColor = Boolean(process.env.NO_COLOR)
export const fijarSinColor = (v: boolean) => (sinColor = v)
export const c = (x: string) => (sinColor ? undefined : x)

/** Semáforo: color Y símbolo. Nunca solo color (hay daltonismo y hay terminales sin color). */
export function semaforo(estado: Estado): { punto: string; color: string | undefined; palabra: string } {
  const mapa = {
    ok: { punto: "●", color: C.ok, palabra: "bien" },
    aviso: { punto: "▲", color: C.aviso, palabra: "ojo" },
    error: { punto: "■", color: C.error, palabra: "mal" },
    apagado: { punto: "○", color: C.apagado, palabra: "apagado" },
  } as const
  const m = mapa[estado]
  return { punto: sinColor ? { ok: "[ok]", aviso: "[!]", error: "[x]", apagado: "[-]" }[estado] : m.punto, color: c(m.color), palabra: m.palabra }
}

/** Una barra de medida: ███████░░░ — para porcentajes de disco, memoria o avance. */
export function barra(fraccion: number, ancho = 12): string {
  const llenas = Math.max(0, Math.min(ancho, Math.round(fraccion * ancho)))
  return "█".repeat(llenas) + "░".repeat(ancho - llenas)
}

/** El color de una barra según qué tan llena esté (verde → ámbar → rojo). */
export const colorDeCarga = (f: number) => c(f >= 0.9 ? C.error : f >= 0.75 ? C.aviso : C.ok)

/** Recorta marcando que el texto sigue, en vez de cortarlo en seco. */
export const recortar = (texto: string, largo: number) => (texto.length <= largo ? texto : `${texto.slice(0, Math.max(0, largo - 1))}…`)

/** Rellena a un ancho fijo cuidando que no se desborde. */
export const columna = (texto: string, ancho: number) => recortar(texto, ancho).padEnd(ancho)

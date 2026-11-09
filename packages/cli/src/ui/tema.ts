// Los colores de Mirai en la terminal. Paleta Engynex (app/globals.css), con degradación si el terminal es pobre.
import type { Estado } from "../datos/tipos.ts"

export const COLORES = {
  navy: "#1F2B4B",
  lima: "#9EDB4E",
  verde: "#3F7A1E",
  gris: "#8A94A6",
  blanco: "#F5F7FA",
  rojo: "#E5484D",
  amarillo: "#F5A524",
}

/** Con NO_COLOR o --sin-color la consola no usa color: todo se distingue por símbolo. */
export let sinColor = Boolean(process.env.NO_COLOR)

export const fijarSinColor = (v: boolean) => (sinColor = v)

export const color = (c: string) => (sinColor ? undefined : c)

/** El semáforo: color Y símbolo, nunca solo color (hay daltonismo, y hay terminales sin color). */
export function semaforo(estado: Estado): { simbolo: string; color: string | undefined } {
  switch (estado) {
    case "ok":
      return { simbolo: sinColor ? "[ok]" : "●", color: color(COLORES.lima) }
    case "aviso":
      return { simbolo: sinColor ? "[!]" : "●", color: color(COLORES.amarillo) }
    case "error":
      return { simbolo: sinColor ? "[x]" : "●", color: color(COLORES.rojo) }
    case "apagado":
      return { simbolo: sinColor ? "[-]" : "○", color: color(COLORES.gris) }
  }
}

export const ETIQUETA: Record<Estado, string> = { ok: "bien", aviso: "ojo", error: "mal", apagado: "sin consultar" }

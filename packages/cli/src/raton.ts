// Ratón en la terminal. Ink no lo trae: se activa el modo SGR y se parsean las secuencias a mano.
//
// Lo importante: el modo se APAGA siempre al salir (incluso con Ctrl-C o una excepción), porque un
// terminal que queda en modo ratón se vuelve inservible para quien lo esté usando.

const PRENDER = "\x1b[?1000h\x1b[?1006h"
const APAGAR = "\x1b[?1000l\x1b[?1006l"

let prendido = false

export type EventoRaton = { tipo: "clic" | "rueda-arriba" | "rueda-abajo"; x: number; y: number }

/** Una zona de la pantalla que responde al clic. El layout las publica porque conoce su propia altura. */
export type Zona = { id: string; fila: number; alto?: number }

/** A qué zona cae un clic en la fila `y` (1 = primera fila de la terminal). */
export function zonaDeClic(y: number, zonas: Zona[]): string | null {
  for (const z of zonas) {
    const alto = z.alto ?? 1
    if (y >= z.fila && y < z.fila + alto) return z.id
  }
  return null
}

/** Interpreta una secuencia SGR del terminal. Devuelve null si no es un evento de ratón. */
export function parsearRaton(dato: string): EventoRaton | null {
  // \x1b[<boton;x;yM  (botón abajo)  ·  \x1b[<boton;x;ym  (botón arriba)
  const m = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/.exec(dato)
  if (!m) return null
  const [, botonTxt, xTxt, yTxt, fin] = m
  const boton = Number(botonTxt)
  const x = Number(xTxt)
  const y = Number(yTxt)
  if (boton === 64) return { tipo: "rueda-arriba", x, y }
  if (boton === 65) return { tipo: "rueda-abajo", x, y }
  // Solo el botón izquierdo (0) al soltar: así no se dispara dos veces por clic.
  if (boton === 0 && fin === "m") return { tipo: "clic", x, y }
  return null
}

export function prenderRaton(salida: NodeJS.WriteStream = process.stdout) {
  if (prendido || !salida.isTTY) return
  salida.write(PRENDER)
  prendido = true
}

export function apagarRaton(salida: NodeJS.WriteStream = process.stdout) {
  if (!prendido) return
  salida.write(APAGAR)
  prendido = false
}

/** Deja el terminal como estaba, pase lo que pase. Se llama una sola vez al arrancar. */
export function limpiarAlSalir() {
  const limpiar = () => apagarRaton()
  process.on("exit", limpiar)
  for (const s of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
    process.on(s, () => {
      limpiar()
      process.exit(0)
    })
  }
  process.on("uncaughtException", (e) => {
    limpiar()
    console.error(e)
    process.exit(1)
  })
}

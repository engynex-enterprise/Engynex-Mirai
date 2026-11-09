// El menú lateral: la sección activa se marca con una barra de color y el número queda a la derecha.
import { Box, Text } from "ink"
import { C, c, columna } from "./tema.ts"

export type Opcion = { id: string; titulo: string; marca?: { punto: string; color: string | undefined } }

/**
 * `ancho` es el interior del panel. Cada fila mide: ▌(1) + espacio(1) + título + marca(2) + número(1).
 * El número solo se muestra del 1 al 9, que son los que funcionan como atajo: ponerle "10" a una
 * opción sería mentir (y además descuadraba el menú).
 */
type Props = { opciones: Opcion[]; activo: string; enfocado: boolean; ancho: number }

export function Menu({ opciones, activo, enfocado, ancho }: Props) {
  return (
    <Box flexDirection="column">
      {opciones.map((o, i) => {
        const sel = o.id === activo
        return (
          <Box key={o.id}>
            <Text color={c(sel ? C.lima : C.borde)}>{sel ? "▌" : " "}</Text>
            <Text color={c(sel ? (enfocado ? C.lima : C.texto) : C.suave)} bold={sel}>
              {" "}
              {columna(o.titulo, ancho - 5)}
            </Text>
            {o.marca ? <Text color={o.marca.color}>{o.marca.punto} </Text> : <Text>{"  "}</Text>}
            <Text color={c(C.tenue)}>{i < 9 ? i + 1 : " "}</Text>
          </Box>
        )
      })}
    </Box>
  )
}

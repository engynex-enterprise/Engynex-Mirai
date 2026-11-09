// El menú de la izquierda: se mueve con el teclado, con los números y con el ratón.
import { Box, Text } from "ink"
import { COLORES, color } from "./tema.ts"

export type Opcion = { id: string; titulo: string; nota?: string }

type Props = { opciones: Opcion[]; activo: string; enfocado: boolean; ancho: number; filaInicial: number }

/** Dónde queda cada opción en la pantalla, para que el ratón sepa a qué le dieron clic. */
export const zonasDelMenu = (opciones: Opcion[], filaInicial: number) =>
  opciones.map((o, i) => ({ id: `menu:${o.id}`, fila: filaInicial + i }))

export function Menu({ opciones, activo, enfocado, ancho, filaInicial: _filaInicial }: Props) {
  return (
    <Box flexDirection="column" width={ancho}>
      {opciones.map((o, i) => {
        const sel = o.id === activo
        return (
          <Box key={o.id}>
            <Text color={sel ? color(COLORES.lima) : color(COLORES.gris)} bold={sel}>
              {sel ? (enfocado ? "▸ " : "· ") : "  "}
              {i + 1} {o.titulo}
            </Text>
          </Box>
        )
      })}
    </Box>
  )
}

// Un panel con borde y título, al estilo Fluent: la caja de todo lo que se muestra.
import { Box, Text } from "ink"
import type { ReactNode } from "react"
import { COLORES, color } from "./tema.ts"

type Props = { titulo?: string; nota?: string; children: ReactNode; ancho?: number; crece?: boolean; separar?: boolean }

export function Marco({ titulo, nota, children, ancho, crece, separar }: Props) {
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={color(COLORES.navy)} paddingX={1} width={ancho} flexGrow={crece ? 1 : 0} marginRight={separar ? 1 : 0}>
      {titulo ? (
        <Box justifyContent="space-between">
          <Text bold color={color(COLORES.lima)}>
            {titulo}
          </Text>
          {nota ? <Text color={color(COLORES.gris)}>{nota}</Text> : null}
        </Box>
      ) : null}
      {children}
    </Box>
  )
}

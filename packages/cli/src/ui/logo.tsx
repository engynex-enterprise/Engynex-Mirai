// La cabecera: logo MIRAI en degradado y una barra de estado con la versión, la rama y producción.
import { Box, Text } from "ink"
import BigText from "ink-big-text"
import Gradient from "ink-gradient"
import type { Estado } from "../datos/tipos.ts"
import { C, c, semaforo, sinColor } from "./tema.ts"

type Props = { version: string; rama?: string; estadoProduccion?: Estado; ancho: number }

export function Cabecera({ version, rama, estadoProduccion = "apagado", ancho }: Props) {
  const grande = ancho >= 76 && !sinColor
  const prod = semaforo(estadoProduccion)
  return (
    <Box flexDirection="column">
      {grande ? (
        <Box marginBottom={-1}>
          <Gradient colors={[C.navy, C.verde, C.lima]}>
            <BigText text="mirai" font="tiny" space={false} />
          </Gradient>
        </Box>
      ) : null}
      <Box width={ancho} justifyContent="space-between" paddingX={1}>
        <Box>
          {grande ? null : (
            <Text bold color={c(C.lima)}>
              MIRAI{" "}
            </Text>
          )}
          <Text color={c(C.lima)}>未来</Text>
          <Text color={c(C.tenue)}> · la consola del monorepo</Text>
        </Box>
        <Box>
          <Text color={c(C.suave)}>v{version}</Text>
          {rama ? <Text color={c(C.tenue)}> · {rama}</Text> : null}
          <Text color={c(C.tenue)}> · producción </Text>
          <Text color={prod.color}>{prod.punto}</Text>
        </Box>
      </Box>
    </Box>
  )
}

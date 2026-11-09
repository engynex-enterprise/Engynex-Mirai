// El logo de Mirai arriba de la consola. En pantallas angostas cae a una sola línea.
import BigText from "ink-big-text"
import Gradient from "ink-gradient"
import { Box, Text } from "ink"
import { COLORES, color, semaforo, sinColor } from "./tema.ts"
import type { Estado } from "../datos/tipos.ts"

type Props = { version: string; rama?: string; estadoProduccion?: Estado; ancho: number }

export function Logo({ version, rama, estadoProduccion = "apagado", ancho }: Props) {
  const grande = ancho >= 72 && !sinColor
  const prod = semaforo(estadoProduccion)
  return (
    <Box flexDirection="column" paddingX={1}>
      {grande ? (
        <Gradient colors={[COLORES.navy, COLORES.verde, COLORES.lima]}>
          <BigText text="MIRAI" font="block" space={false} />
        </Gradient>
      ) : (
        <Text bold color={color(COLORES.lima)}>
          MIRAI
        </Text>
      )}
      <Box>
        <Text color={color(COLORES.gris)}>未来 · la consola de Mirai · v{version}</Text>
        {rama ? <Text color={color(COLORES.gris)}> · rama {rama}</Text> : null}
        <Text color={color(COLORES.gris)}> · producción </Text>
        <Text color={prod.color}>{prod.simbolo}</Text>
      </Box>
    </Box>
  )
}

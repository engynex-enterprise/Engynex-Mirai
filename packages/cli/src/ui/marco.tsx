// Las piezas de la pantalla: barra de estado, panel con pestaña de título y separadores.
import { Box, Text } from "ink"
import type { ReactNode } from "react"
import { C, c, columna } from "./tema.ts"

/** La barra de arriba: identidad a la izquierda, estado a la derecha, en bloques de color. */
export function BarraEstado({ izquierda, derecha, ancho }: { izquierda: ReactNode; derecha: ReactNode; ancho: number }) {
  return (
    <Box width={ancho} justifyContent="space-between" paddingX={1}>
      <Box>{izquierda}</Box>
      <Box>{derecha}</Box>
    </Box>
  )
}

/** Un panel con el título montado sobre el borde, como una pestaña. */
export function Panel({
  titulo,
  nota,
  children,
  ancho,
  crece,
  separar,
  activo,
}: {
  titulo?: string
  nota?: string
  children: ReactNode
  ancho?: number
  crece?: boolean
  separar?: boolean
  activo?: boolean
}) {
  return (
    <Box flexDirection="column" width={ancho} flexGrow={crece ? 1 : 0} marginRight={separar ? 1 : 0}>
      {titulo ? (
        // La pestaña tiene que medir EXACTAMENTE `ancho`: un carácter de más y Ink la parte en dos
        // líneas, y entonces este panel queda desfasado del de al lado.
        //   "╭─ "(3) + titulo + " "(1) + relleno + (nota ? " nota "(n+2) : "──"(2)) + "╮"(1)
        <Box>
          <Text color={c(activo ? C.lima : C.borde)}>╭─ </Text>
          <Text bold color={c(activo ? C.lima : C.suave)}>
            {titulo}
          </Text>
          <Text color={c(C.borde)}> {"─".repeat(Math.max(0, (ancho ?? 60) - 7 - titulo.length - (nota?.length ?? 0)))}</Text>
          {nota ? <Text color={c(C.tenue)}> {nota} </Text> : <Text color={c(C.borde)}>──</Text>}
          <Text color={c(activo ? C.lima : C.borde)}>╮</Text>
        </Box>
      ) : null}
      <Box flexDirection="column" borderStyle="round" borderTop={false} borderColor={c(activo ? C.lima : C.borde)} paddingX={1} flexGrow={crece ? 1 : 0}>
        {children}
      </Box>
    </Box>
  )
}

/** Un encabezado de grupo dentro de un panel: texto tenue con una línea que lo acompaña. */
export function Grupo({ texto, ancho }: { texto: string; ancho: number }) {
  return (
    <Box marginTop={1}>
      <Text bold color={c(C.lima)}>
        {texto.toUpperCase()}{" "}
      </Text>
      <Text color={c(C.borde)}>{"─".repeat(Math.max(0, ancho - texto.length - 2))}</Text>
    </Box>
  )
}

/** Una fila de tres columnas alineadas (nombre · valor · explicación). */
export function Fila({
  marca,
  nombre,
  valor,
  detalle,
  anchos,
  resaltada,
  colorValor,
}: {
  marca?: ReactNode
  nombre: string
  valor?: string
  detalle?: string
  anchos: [number, number, number]
  resaltada?: boolean
  colorValor?: string
}) {
  return (
    <Box>
      <Text>{resaltada ? <Text color={c(C.lima)}>▌ </Text> : "  "}</Text>
      {marca ? <Box marginRight={1}>{marca}</Box> : null}
      <Text color={c(resaltada ? C.texto : C.texto)} bold={resaltada}>
        {columna(nombre, anchos[0])}
      </Text>
      {anchos[1] > 0 ? <Text color={colorValor ?? c(C.suave)}>{columna(valor ?? "", anchos[1])}</Text> : null}
      {anchos[2] > 0 ? <Text color={c(C.tenue)}>{columna(detalle ?? "", anchos[2])}</Text> : null}
    </Box>
  )
}
